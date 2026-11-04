import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLOOR_H, resolveLed, type Block, type BlockBox, type DoorSide, type LedSpec } from './catalog';
import { LOT_HEIGHT } from './geometries';
import { registerLed } from './ledRegistry';
import { getLedColour, getLedMaterial } from './ledTextures';
import { blockOutline, ringOf } from './shapes';
import { wallPlacement } from './wall';

/** How far the band stands off the wall, metres (like a flat screen's 0.16). */
const STAND_OFF = 0.14;

type P2 = [number, number];

interface Band {
  geometry: THREE.BufferGeometry;
  /** Length of the outline at the foot of the band, metres: the width the picture is laid out for. */
  perimeter: number;
}

const cache = new Map<string, Band>();
const CACHE_LIMIT = 24;

/**
 * A screen bent all the way round a block: it follows the outline (square, rounded, cut, polygon,
 * star ...) and the walls' taper, bulge and twist, so there is no gap anywhere and no seam in the
 * shape. Corners are mitred so the band closes up tight, and sharp corners keep a crisp edge in the
 * lighting while gentle bends are smoothed. u runs once round the outline and v up the band.
 */
function buildBand(box: BlockBox, block: Block, from: number, to: number): Band {
  const outline = blockOutline(box, block);
  const n = outline.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const dir = area >= 0 ? 1 : -1;

  // Edge directions, outward normals, and running length.
  const normals: P2[] = [];
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const q = outline[(i + 1) % n];
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const len = Math.hypot(dx, dz) || 1;
    normals.push([(dir * dz) / len, (-dir * dx) / len]);
    cum.push(cum[i] + len);
  }
  const perimeter = cum[n];

  // At each corner: where the offset edges meet (a mitre), and the normal to use on each side of it.
  const mitre: P2[] = [];
  const smooth: boolean[] = [];
  const blend: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = normals[(i + n - 1) % n];
    const b = normals[i];
    const d = a[0] * b[0] + a[1] * b[1];
    const k = 1 / Math.max(0.4, 1 + d);
    const mx = (a[0] + b[0]) * k * STAND_OFF;
    const mz = (a[1] + b[1]) * k * STAND_OFF;
    const reach = Math.hypot(mx, mz);
    const cap = STAND_OFF * 2.6;
    mitre.push(reach > cap ? [(mx / reach) * cap, (mz / reach) * cap] : [mx, mz]);
    smooth.push(d > 0.82);
    const bx = a[0] + b[0];
    const bz = a[1] + b[1];
    const bl = Math.hypot(bx, bz) || 1;
    blend.push([bx / bl, bz / bl]);
  }

  // Rings up the band: one is enough for straight walls; taper, bulge, flare and twist need several.
  const bent = !!(block.taper !== undefined && block.taper !== 1) || !!block.curve || !!block.flare || !!block.twist;
  const rows = bent ? Math.min(24, Math.max(4, Math.ceil((to - from) / FLOOR_H))) : 1;
  const heights: number[] = [];
  for (let k = 0; k <= rows; k++) heights.push(from + ((to - from) * k) / rows);

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const span = Math.max(1e-6, to - from);

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const base = pos.length / 3;
    // Both ends of this edge, at every height; each edge has its own vertices so sharp corners stay crisp.
    for (let k = 0; k <= rows; k++) {
      const y = heights[k];
      const { s, ang } = ringOf(block, Math.min(1, Math.max(0, y / box.h)));
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      for (const [vi, end] of [[i, 0], [j, 1]] as const) {
        const p = outline[vi];
        const x = p[0] * s + mitre[vi][0];
        const z = p[1] * s + mitre[vi][1];
        const nrm = end === 0 ? (smooth[i] ? blend[i] : normals[i]) : smooth[j] ? blend[j] : normals[i];
        pos.push(x * c + z * sn, LOT_HEIGHT + y, -x * sn + z * c);
        nor.push(nrm[0] * c + nrm[1] * sn, 0, -nrm[0] * sn + nrm[1] * c);
        uv.push((end === 0 ? cum[i] : cum[i + 1]) / perimeter, (y - from) / span);
      }
    }
    // Quads between neighbouring heights, wound so they face outwards.
    for (let k = 0; k < rows; k++) {
      const a0 = base + k * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return { geometry, perimeter };
}

function bandFor(box: BlockBox, block: Block, from: number, to: number): Band {
  const key = [box.w.toFixed(2), box.d.toFixed(2), box.h.toFixed(2), from, to, block.round ?? 0, block.bevel ? 1 : 0, block.plan ?? 'rect', block.sides ?? 0, block.inner ?? 0, block.taper ?? 1, block.twist ?? 0, block.curve ?? 0, block.flare ?? 0].join('|');
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = buildBand(box, block, from, to);
  cache.set(key, made);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    cache.get(oldest)?.geometry.dispose();
    cache.delete(oldest);
  }
  return made;
}

const SIDES: DoorSide[] = ['front', 'right', 'back', 'left'];

/** A screen that runs right round a block, one picture with no seams, in the block's own frame (the caller puts it at the block's base). */
export function LedWrap({ spec, block, box, floors }: { spec: LedSpec; block: Block; box: BlockBox; floors: number }) {
  const bottom = Math.max(0, Math.min(spec.bottom, floors - 1));
  const storeys = Math.max(1, Math.min(spec.height, floors - bottom));
  const from = bottom * FLOOR_H;
  const to = Math.min(box.h, (bottom + storeys) * FLOOR_H);
  const look = resolveLed(spec);
  const band = useMemo(() => bandFor(box, block, from, to), [box.w, box.d, box.h, block, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const material = getLedMaterial(spec, band.perimeter, to - from);
  const colour = useMemo(() => getLedColour(spec, band.perimeter, to - from), [spec, band.perimeter, from, to]);
  const groups = useRef<(THREE.Group | null)[]>([]);

  // The night lighting borrows a real light for a screen; a wrapped one throws light out of each of its four sides.
  useEffect(() => {
    if (!look.glow) return;
    const stops = groups.current.flatMap((g, i) =>
      g ? [registerLed({ object: g, local: [0, LOT_HEIGHT + (from + to) / 2, 0.3], width: wallPlacement(box, SIDES[i]).length, height: to - from, brightness: look.brightness, glowAmount: look.glowAmount, colour })] : [],
    );
    return () => stops.forEach((stop) => stop());
  }, [box, from, to, look.glow, look.brightness, look.glowAmount, colour]);

  return (
    <group>
      <mesh position={[box.cx, 0, box.cz]} geometry={band.geometry} material={material} />
      {SIDES.map((side, i) => {
        const wall = wallPlacement(box, side);
        return <group key={side} ref={(g) => void (groups.current[i] = g)} position={wall.position} rotation={[0, wall.rotY, 0]} />;
      })}
    </group>
  );
}
