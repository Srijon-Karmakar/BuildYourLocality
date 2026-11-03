import * as THREE from 'three';
import { capHeightOf, type Block, type BlockBox } from './catalog';
import { LOT_HEIGHT } from './geometries';

/**
 * Shaped building bodies: one loft per block. A ring of the block's outline (a rectangle with
 * rounded or cut corners) is stacked up the walls, scaled by taper and bulge and turned by twist,
 * then carried on through a crown (dome, onion dome, cone, spire) or closed with a flat lid.
 * Geometry is cached by shape, so a hundred identical towers share one mesh and batch together.
 *
 * Face groups: 0 = walls (facade material), 1 = crown and lid (roof material).
 */

const cache = new Map<string, THREE.BufferGeometry>();

type P2 = [number, number];

/** Outline broken into strips: straight walls and corner arcs, each with its own vertices so edges stay crisp. */
function outlineStrips(a: number, b: number, r: number, bevel: boolean): P2[][] {
  const strips: P2[][] = [];
  const ix = a - r;
  const iz = b - r;
  const arc = (cx: number, cz: number, from: number): P2[] => {
    const n = bevel ? 1 : r < 1 ? 2 : r < 4 ? 3 : 6;
    const pts: P2[] = [];
    for (let k = 0; k <= n; k++) {
      const t = from + (k / n) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]);
    }
    return pts;
  };
  const round = r > 0.05;
  // +x wall, then +z, -x, -z (each followed by the corner that leads into the next).
  strips.push([[a, -iz], [a, iz]]);
  if (round) strips.push(arc(ix, iz, 0));
  strips.push([[ix, b], [-ix, b]]);
  if (round) strips.push(arc(-ix, iz, Math.PI / 2));
  strips.push([[-a, iz], [-a, -iz]]);
  if (round) strips.push(arc(-ix, -iz, Math.PI));
  strips.push([[-ix, -b], [ix, -b]]);
  if (round) strips.push(arc(ix, -iz, Math.PI * 1.5));
  return strips;
}

export function shapedBodyGeometry(box: BlockBox, floors: number, block: Block): THREE.BufferGeometry {
  const round = Math.min(1, Math.max(0, block.round ?? 0));
  const taper = Math.min(3, Math.max(0, block.taper ?? 1));
  const twist = ((block.twist ?? 0) * Math.PI) / 180;
  const curve = Math.min(1, Math.max(-1, block.curve ?? 0));
  const top = block.top ?? 'flat';
  const bevel = !!block.bevel;
  const capH = capHeightOf(block, box.w, box.d);
  const key = [box.w.toFixed(2), box.d.toFixed(2), box.y.toFixed(2), floors, round, taper, twist.toFixed(3), curve, top, capH.toFixed(2), bevel].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const a = box.w / 2;
  const b = box.d / 2;
  const r = round * Math.min(a, b);
  const strips = outlineStrips(a, b, r, bevel);

  // Running length along the outline, for the texture's horizontal coordinate (whole modules around).
  const lengths = strips.map((pts) => {
    const out = [0];
    for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return out;
  });
  const total = lengths.reduce((s, l) => s + l[l.length - 1], 0);
  const modules = Math.max(4, Math.round(total / 3));
  const uScale = modules / total;
  const starts: number[] = [];
  {
    let run = 0;
    lengths.forEach((l, i) => {
      starts[i] = run;
      run += l[l.length - 1];
    });
  }

  const y0 = LOT_HEIGHT + box.y;
  const H = box.h;
  const wallRings = twist || curve ? Math.min(36, Math.max(6, floors)) : 1;

  // Rings: [scale, angle, y, texture v, group].
  type Ring = { s: number; ang: number; y: number; v: number };
  const wall: Ring[] = [];
  for (let i = 0; i <= wallRings; i++) {
    const t = i / wallRings;
    wall.push({ s: (1 + (taper - 1) * t) * (1 + 0.35 * curve * Math.sin(Math.PI * t)), ang: twist * t, y: y0 + H * t, v: floors * t });
  }
  const last = wall[wall.length - 1];
  const crown: Ring[] = [];
  if (capH > 0) {
    const steps = top === 'cone' ? 1 : top === 'onion' ? 9 : top === 'dome' ? 7 : 8;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      let k: number;
      let yy = u;
      if (top === 'dome') {
        const phi = (u * Math.PI) / 2;
        k = Math.cos(phi);
        yy = Math.sin(phi);
      } else if (top === 'onion') {
        k = (1 + 0.38 * Math.sin(Math.PI * Math.min(1, u * 1.15))) * (1 - Math.pow(u, 2.6));
      } else if (top === 'cone') {
        k = 1 - u;
      } else {
        k = Math.pow(1 - u, 2.3);
      }
      crown.push({ s: Math.max(0, last.s * k), ang: last.ang, y: last.y + capH * yy, v: 0 });
    }
  }

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const addStrips = (rings: Ring[], wallUv: boolean, base: Ring | null) => {
    const list = base ? [base, ...rings] : rings;
    strips.forEach((pts, si) => {
      const first = pos.length / 3;
      for (const ring of list) {
        const c = Math.cos(ring.ang);
        const sn = Math.sin(ring.ang);
        pts.forEach((p, pi) => {
          const x = p[0] * ring.s;
          const z = p[1] * ring.s;
          pos.push(x * c + z * sn, ring.y, -x * sn + z * c);
          const along = starts[si] + lengths[si][pi];
          if (wallUv) uv.push(along * uScale, ring.v);
          else uv.push(along / 2.5, (ring.y - last.y) / 2.5);
        });
      }
      const n = pts.length;
      for (let i = 0; i < list.length - 1; i++) {
        for (let j = 0; j < n - 1; j++) {
          const p00 = first + i * n + j;
          const p10 = first + (i + 1) * n + j;
          idx.push(p00, p10, p00 + 1, p00 + 1, p10, p10 + 1);
        }
      }
    });
  };

  addStrips(wall, true, null);
  const wallIndexCount = idx.length;
  if (crown.length > 0) {
    addStrips(crown, false, last);
  } else {
    // A flat lid: a fan from the middle to the top ring.
    const centre = pos.length / 3;
    pos.push(0, last.y, 0);
    uv.push(0, 0);
    const c = Math.cos(last.ang);
    const sn = Math.sin(last.ang);
    const ring: number[] = [];
    for (const pts of strips) {
      for (const p of pts) {
        const x = p[0] * last.s;
        const z = p[1] * last.s;
        ring.push(pos.length / 3);
        pos.push(x * c + z * sn, last.y, -x * sn + z * c);
        uv.push(x / 2.5, z / 2.5);
      }
    }
    for (let i = 0; i < ring.length - 1; i++) idx.push(centre, ring[i + 1], ring[i]);
    idx.push(centre, ring[0], ring[ring.length - 1]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.addGroup(0, wallIndexCount, 0);
  geometry.addGroup(wallIndexCount, idx.length - wallIndexCount, 1);
  geometry.computeVertexNormals();
  cache.set(key, geometry);
  return geometry;
}

/** Total height of a shaped block above its lot slab: walls plus crown. */
export function shapedHeight(block: Block, box: BlockBox): number {
  return box.y + box.h + capHeightOf(block, box.w, box.d);
}
