import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, FLOOR_H } from './catalog';

export const LOT_HEIGHT = 0.12;

// --- Roads ---------------------------------------------------------------------

const ASPHALT = new THREE.Color('#3c3f44');
const CURB = new THREE.Color('#b9b6ae');
const PAINT = new THREE.Color('#e8c547');

function coloredBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: THREE.Color,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

const roadCache = new Map<number, THREE.BufferGeometry>();

/**
 * One road cell as a single merged mesh (one draw call), cached per connection mask.
 * Mask bits: N (-z) = 1, E (+x) = 2, S (+z) = 4, W (-x) = 8. Edges with no road
 * neighbour get a raised sidewalk; each connected arm gets yellow dashes. The dash
 * period (1.5) lines up across cells so a long road reads as one continuous line.
 */
export function roadGeometry(mask: number): THREE.BufferGeometry {
  let geometry = roadCache.get(mask);
  if (geometry) return geometry;

  const half = CELL / 2;
  const parts: THREE.BufferGeometry[] = [coloredBox(CELL, 0.08, CELL, 0, 0.04, 0, ASPHALT)];
  const curbW = 1;

  // [direction bit, unit vector (x, z) pointing out of the cell through that edge]
  const arms: [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  for (const [bit, dx, dz] of arms) {
    const alongX = dx === 0; // edge runs along x for N/S, along z for E/W
    if (!(mask & bit)) {
      const cx = dx * (half - curbW / 2);
      const cz = dz * (half - curbW / 2);
      parts.push(coloredBox(alongX ? CELL : curbW, 0.16, alongX ? curbW : CELL, cx, 0.08, cz, CURB));
    } else {
      for (const dist of [0.75, 2.25]) {
        parts.push(
          coloredBox(alongX ? 0.14 : 0.8, 0.02, alongX ? 0.8 : 0.14, dx * dist, 0.09, dz * dist, PAINT),
        );
      }
    }
  }

  geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  roadCache.set(mask, geometry);
  return geometry;
}

// --- Building bodies -----------------------------------------------------------

const bodyCache = new Map<string, THREE.BufferGeometry>();

/**
 * Walls of one block: a box of bw x bd metres and `floors` storeys, centred on the origin in
 * x/z and standing on its lot slab. UVs are scaled so a whole number of 3 m facade modules
 * fits each wall (windows are never cut in half) and one storey per module vertically.
 * Face order is +x, -x, top, bottom, +z, -z (BoxGeometry's group order).
 */
export function boxBodyGeometry(bw: number, bd: number, floors: number): THREE.BufferGeometry {
  const key = `${bw.toFixed(2)},${bd.toFixed(2)},${floors}`;
  let geometry = bodyCache.get(key);
  if (geometry) return geometry;

  const bh = floors * FLOOR_H;
  geometry = new THREE.BoxGeometry(bw, bh, bd);
  geometry.translate(0, bh / 2 + LOT_HEIGHT, 0);

  const modules = (extent: number) => Math.max(1, Math.round(extent / 3));
  const uv = geometry.getAttribute('uv');
  const extents: [number, number][] = [
    [modules(bd), floors], // +x
    [modules(bd), floors], // -x
    [bw / 3, bd / 3], // top
    [bw / 3, bd / 3], // bottom
    [modules(bw), floors], // +z
    [modules(bw), floors], // -z
  ];
  extents.forEach(([su, sv], face) => {
    for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  });
  bodyCache.set(key, geometry);
  return geometry;
}

// --- Gable roof ----------------------------------------------------------------

const roofCache = new Map<string, THREE.BufferGeometry>();

/**
 * Pitched roof with its ridge along x, sitting on a body of bw x bd. Group 0 is the two
 * slopes (roof material), group 1 the two triangular gable ends (facade material).
 */
export function gableRoofGeometry(bw: number, bd: number, H: number): THREE.BufferGeometry {
  const key = `${bw},${bd},${H}`;
  let geometry = roofCache.get(key);
  if (geometry) return geometry;

  const overhang = 0.35;
  const W = bw + overhang * 2;
  const D = bd + overhang * 2;
  const slopeLen = Math.hypot(H, D / 2);

  const positions: number[] = [];
  const uvs: number[] = [];
  type V = [number, number, number];
  type UV = [number, number];

  /** Pushes a triangle, flipping its winding if it would face against `outward`. */
  const tri = (a: V, b: V, c: V, ua: UV, ub: UV, uc: UV, outward: V) => {
    const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const normal = e1.cross(e2);
    const flip = normal.dot(new THREE.Vector3(...outward)) < 0;
    const order: [V, UV][] = flip ? [[a, ua], [c, uc], [b, ub]] : [[a, ua], [b, ub], [c, uc]];
    for (const [p, t] of order) {
      positions.push(...p);
      uvs.push(...t);
    }
  };

  const s = 1 / 2.5; // roof texture repeat per metre
  for (const side of [-1, 1]) {
    const eave = (x: number): V => [x, 0, side * (D / 2)];
    const ridge = (x: number): V => [x, H, 0];
    const out: V = [0, D / 2, side * H];
    tri(eave(-W / 2), eave(W / 2), ridge(W / 2), [0, 0], [W * s, 0], [W * s, slopeLen * s], out);
    tri(eave(-W / 2), ridge(W / 2), ridge(-W / 2), [0, 0], [W * s, slopeLen * s], [0, slopeLen * s], out);
  }
  const slopeVerts = positions.length / 3;

  for (const end of [-1, 1]) {
    const x = end * (W / 2);
    tri(
      [x, 0, -D / 2],
      [x, 0, D / 2],
      [x, H, 0],
      [0, 0],
      [D / 3, 0],
      [D / 6, H / FLOOR_H],
      [end, 0, 0],
    );
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.addGroup(0, slopeVerts, 0);
  geometry.addGroup(slopeVerts, positions.length / 3 - slopeVerts, 1);
  roofCache.set(key, geometry);
  return geometry;
}
