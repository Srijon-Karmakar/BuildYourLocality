import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore } from '../state/useGameStore';
import { CELL, type FacadeId } from './catalog';
import { getFacadeMaterial } from './cityTextures';
import { solidMaterial } from './materials';
import { registerNightEmissive } from './nightLights';
import { ARCH_CLEARANCE, OPENING_WIDTH, type WallSpec } from './walls';

/** Wall textures borrowed from the building materials. */
const TEXTURE_OF: Partial<Record<WallSpec['style'], FacadeId>> = { modern: 'ceramic', stone: 'stone', brick: 'brick', block: 'concrete' };

const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffd9a0', emissiveIntensity: 0 });
registerNightEmissive(lampMaterial, 1.8);

const glassCache = new Map<string, THREE.MeshStandardMaterial>();
function glassMaterial(colour: string): THREE.MeshStandardMaterial {
  let m = glassCache.get(colour);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, transparent: true, opacity: 0.34, roughness: 0.05, metalness: 0.25, side: THREE.DoubleSide, depthWrite: false });
    glassCache.set(colour, m);
  }
  return m;
}

const leafCache = new Map<string, THREE.MeshStandardMaterial>();
function leafMaterial(colour: string): THREE.MeshStandardMaterial {
  let m = leafCache.get(colour);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.95, flatShading: true });
    leafCache.set(colour, m);
  }
  return m;
}

/** A box whose texture coordinates follow its size, so bricks and stones keep their scale on any wall. */
function texturedBox(length: number, height: number, thickness: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(length, height, thickness);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; the building textures repeat every 3 m by 2.4 m.
  const scales: [number, number][] = [
    [thickness / 3, height / 2.4],
    [thickness / 3, height / 2.4],
    [length / 3, thickness / 2.4],
    [length / 3, thickness / 2.4],
    [length / 3, height / 2.4],
    [length / 3, height / 2.4],
  ];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) uv.setXY(face * 4 + i, uv.getX(face * 4 + i) * scales[face][0], uv.getY(face * 4 + i) * scales[face][1]);
  }
  return g;
}

const place = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

/** The solid stretches of wall along x, with a gap cut out for a walkway, gate or arch. */
function stretches(spec: WallSpec): [number, number][] {
  const half = CELL / 2;
  if (spec.opening === 'none') return [[-half, half]];
  const gap = OPENING_WIDTH / 2;
  return [
    [-half, -gap],
    [gap, half],
  ];
}

function postPositions(spec: WallSpec, parts: [number, number][]): number[] {
  if (spec.posts === 'none') return [];
  const xs = new Set<number>();
  for (const [x0, x1] of parts) {
    xs.add(x0);
    xs.add(x1);
    for (let x = x0 + spec.postEvery; x < x1 - 0.2; x += spec.postEvery) xs.add(Math.round(x * 100) / 100);
  }
  return [...xs];
}

/** Vertical bars (iron railings, gate leaves) between two x positions, as one merged shape. */
function bars(x0: number, x1: number, height: number, gap: number, thick: number, spear: boolean): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const pitch = thick + Math.max(0.04, gap);
  const n = Math.max(1, Math.floor((x1 - x0) / pitch));
  const start = (x0 + x1) / 2 - ((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = start + i * pitch;
    list.push(place(new THREE.BoxGeometry(thick, height, thick), x, height / 2, 0));
    if (spear) list.push(place(new THREE.ConeGeometry(thick * 1.6, 0.14, 4), x, height + 0.07, 0));
  }
  list.push(place(new THREE.BoxGeometry(x1 - x0, 0.05, 0.05), (x0 + x1) / 2, height - 0.12, 0));
  list.push(place(new THREE.BoxGeometry(x1 - x0, 0.05, 0.05), (x0 + x1) / 2, 0.14, 0));
  const merged = mergeGeometries(list.map((g) => g.toNonIndexed()), false);
  list.forEach((g) => g.dispose());
  return merged;
}

/** Wooden pickets and rails between two x positions. */
function pickets(x0: number, x1: number, height: number, gap: number, depth: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const w = 0.13;
  const pitch = w + gap;
  const n = Math.max(1, Math.floor((x1 - x0) / pitch));
  const start = (x0 + x1) / 2 - ((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = start + i * pitch;
    list.push(place(new THREE.BoxGeometry(w, height, depth * 0.45), x, height / 2, 0));
    list.push(place(new THREE.ConeGeometry(w * 0.75, 0.1, 4).rotateY(Math.PI / 4), x, height + 0.05, 0));
  }
  for (const f of [0.25, 0.72]) list.push(place(new THREE.BoxGeometry(x1 - x0, 0.09, depth * 0.5), (x0 + x1) / 2, height * f, depth * 0.4));
  const merged = mergeGeometries(list.map((g) => g.toNonIndexed()), false);
  list.forEach((g) => g.dispose());
  return merged;
}

/** Leafy lumps along the top of a hedge. */
function hedgeTop(x0: number, x1: number, height: number, thickness: number): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round((x1 - x0) / 0.9));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0);
    const r = thickness * (0.5 + 0.1 * ((i * 7) % 3));
    list.push(place(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1), x, height - 0.05, 0));
  }
  const merged = mergeGeometries(list.map((g) => g.toNonIndexed()), false);
  list.forEach((g) => g.dispose());
  return merged;
}

/** Everything a wall is built from, as geometry plus the material each part uses. Pure given the spec and quality. */
function build(spec: WallSpec, quality: 'low' | 'medium' | 'high') {
  const parts = stretches(spec);
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material; shadow?: boolean }[] = [];
  const t = spec.thickness;
  const h = spec.height;
  const textured = TEXTURE_OF[spec.style];
  const bodyMaterial: THREE.Material | null = textured
    ? getFacadeMaterial(textured, 'none', spec.colour, quality)
    : spec.style === 'hedge'
      ? leafMaterial(spec.colour)
      : null;
  const metal = (colour: string) => solidMaterial(colour, 0.45, 0.6);
  const paint = (colour: string) => solidMaterial(colour, 0.8);

  for (const [x0, x1] of parts) {
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    if (bodyMaterial && spec.style !== 'hedge') {
      out.push({ geometry: place(texturedBox(len, h, t), cx, h / 2, 0), material: bodyMaterial });
    } else if (spec.style === 'hedge') {
      out.push({ geometry: place(new THREE.BoxGeometry(len, h * 0.9, t), cx, h * 0.45, 0), material: bodyMaterial! });
      out.push({ geometry: hedgeTop(x0, x1, h, t), material: bodyMaterial! });
    } else if (spec.style === 'wood') {
      out.push({ geometry: pickets(x0 + 0.1, x1 - 0.1, h, spec.gap, Math.max(0.1, t)), material: paint(spec.colour) });
    } else if (spec.style === 'iron') {
      out.push({ geometry: bars(x0 + 0.08, x1 - 0.08, h, spec.gap, 0.03, true), material: metal(spec.colour) });
    } else if (spec.style === 'glass') {
      // A pane between each pair of posts, framed top and bottom.
      const posts = postPositions(spec, [[x0, x1]]).sort((a, b) => a - b);
      const stops = posts.length > 1 ? posts : [x0, x1];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i] + 0.05;
        const b = stops[i + 1] - 0.05;
        out.push({ geometry: place(new THREE.BoxGeometry(b - a, h - 0.25, t), (a + b) / 2, 0.14 + (h - 0.25) / 2, 0), material: glassMaterial(spec.colour), shadow: false });
      }
      out.push({ geometry: place(new THREE.BoxGeometry(len, 0.07, t + 0.05), cx, h - 0.04, 0), material: metal(spec.postColour) });
      out.push({ geometry: place(new THREE.BoxGeometry(len, 0.1, t + 0.05), cx, 0.07, 0), material: metal(spec.postColour) });
    }

    // Cap along the top (glass and railings have their own rails).
    if (spec.cap !== 'none' && spec.style !== 'glass' && spec.style !== 'iron' && spec.style !== 'wood' && spec.style !== 'hedge') {
      const capMaterial = paint(spec.capColour);
      if (spec.cap === 'flat') out.push({ geometry: place(new THREE.BoxGeometry(len + 0.04, 0.1, t + 0.14), cx, h + 0.05, 0), material: capMaterial });
      else if (spec.cap === 'rounded') {
        const r = t / 2 + 0.06;
        out.push({ geometry: place(new THREE.CylinderGeometry(r, r, len + 0.04, 12).rotateZ(Math.PI / 2).scale(1, 0.62, 1), cx, h + 0.02, 0), material: capMaterial });
      } else {
        const slope = 0.6;
        const run = (t + 0.2) / 2;
        for (const side of [-1, 1]) {
          out.push({ geometry: place(new THREE.BoxGeometry(len + 0.04, 0.05, run / Math.cos(slope)).rotateX(side * slope), cx, h + 0.1, side * run * 0.5), material: capMaterial });
        }
      }
    }
  }

  // Lintel over an arch.
  if (spec.opening === 'arch') {
    const lintelTop = h;
    const lintelBottom = Math.min(ARCH_CLEARANCE, h - 0.25);
    const lh = Math.max(0.25, lintelTop - lintelBottom);
    const material = bodyMaterial ?? (spec.style === 'iron' ? metal(spec.colour) : paint(spec.colour));
    out.push({ geometry: place(textured ? texturedBox(OPENING_WIDTH + 0.4, lh, t) : new THREE.BoxGeometry(OPENING_WIDTH + 0.4, lh, spec.style === 'glass' || spec.style === 'iron' || spec.style === 'wood' ? Math.max(t, 0.12) : t), 0, lintelTop - lh / 2, 0), material });
  }

  // Gate leaves: bars (or boards for wood) in the post colour.
  if (spec.opening === 'gate') {
    const gh = Math.max(0.8, h - 0.12);
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -OPENING_WIDTH / 2 + 0.04 : 0.02;
      const x1 = side < 0 ? -0.02 : OPENING_WIDTH / 2 - 0.04;
      out.push(
        spec.style === 'wood'
          ? { geometry: pickets(x0, x1, gh, 0.03, 0.12), material: paint(spec.colour) }
          : { geometry: bars(x0, x1, gh, 0.1, 0.035, false), material: metal(spec.style === 'iron' ? spec.colour : spec.postColour) },
      );
    }
  }

  // Posts.
  const posts = postPositions(spec, parts);
  if (posts.length > 0) {
    const size = Math.max(0.18, t + 0.14);
    const pillarH = h + 0.14;
    const material = spec.style === 'iron' || spec.style === 'glass' ? metal(spec.postColour) : paint(spec.postColour);
    const topY = pillarH;
    for (const x of posts) {
      if (spec.posts === 'pillars') {
        out.push({ geometry: place(new THREE.BoxGeometry(size, pillarH, size), x, pillarH / 2, 0), material });
        out.push({ geometry: place(new THREE.BoxGeometry(size + 0.06, 0.07, size + 0.06), x, topY + 0.03, 0), material });
      } else {
        out.push({ geometry: place(new THREE.CylinderGeometry(size / 2, size / 2 + 0.02, pillarH, 12), x, pillarH / 2, 0), material });
        out.push({ geometry: place(new THREE.SphereGeometry(size * 0.55, 10, 8), x, topY + 0.05, 0), material });
      }
      if (spec.lights) out.push({ geometry: place(new THREE.SphereGeometry(0.12, 10, 8), x, topY + 0.26, 0), material: lampMaterial, shadow: false });
    }
  }
  return out;
}

/** One wall segment: CELL metres long along x, standing on the ground, centred on its own origin. */
export function WallModel({ spec }: { spec: WallSpec }) {
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const key = JSON.stringify(spec);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the whole of `spec`
  const parts = useMemo(() => build(spec, quality), [key, quality]);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} castShadow={p.shadow !== false} receiveShadow />
      ))}
    </group>
  );
}

/** Solid boxes a person walks into (roam mode): the stretches of wall, as [x, width] pairs, and the wall's height / thickness. */
export function wallColliders(spec: WallSpec): { cx: number; cz: number; w: number; h: number; d: number }[] {
  const solid = spec.style === 'iron' || spec.style === 'wood' || spec.style === 'glass' ? Math.max(spec.thickness, 0.12) : spec.thickness;
  const boxes = stretches(spec).map(([x0, x1]) => ({ cx: (x0 + x1) / 2, cz: 0, w: x1 - x0, h: spec.height, d: solid }));
  if (spec.opening === 'gate') boxes.push({ cx: 0, cz: 0, w: OPENING_WIDTH, h: spec.height, d: 0.1 });
  return boxes;
}
