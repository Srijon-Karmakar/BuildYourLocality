import * as THREE from 'three';
import { FLOOR_H } from './catalog';

export const LOT_HEIGHT = 0.12;

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
