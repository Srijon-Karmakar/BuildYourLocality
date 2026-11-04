import * as THREE from 'three';

/** Widest arc a curved panel can have (radians): about 120 degrees. */
const MAX_ARC = (120 * Math.PI) / 180;

/** Arc a curved panel spans for a curve setting of 0 (flat) to 1 (deeply curved). */
export const arcOf = (curve: number) => Math.max(0, Math.min(1, curve)) * MAX_ARC;

/** How far the middle of a curved panel stands out from its ends, for a chord `w` metres wide. */
export function sagOf(w: number, curve: number): number {
  const theta = arcOf(curve);
  if (theta < 0.01) return 0;
  const r = w / (2 * Math.sin(theta / 2));
  return r * (1 - Math.cos(theta / 2));
}

/**
 * A screen bent into a circular arc, bulging out towards +z: its two edges stay in the plane of
 * the wall and the middle stands out by `sagOf`. u runs left to right and v bottom to top, so a
 * picture is never mirrored. Faces are counter-clockwise seen from the front.
 */
export function curvedPanelGeometry(w: number, h: number, curve: number): THREE.BufferGeometry {
  const theta = arcOf(curve);
  if (theta < 0.01) return new THREE.BoxGeometry(w, h, 0.05);
  const r = w / (2 * Math.sin(theta / 2));
  const segs = Math.max(8, Math.round(theta * 14));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const phi = (u - 0.5) * theta;
    const x = r * Math.sin(phi);
    const z = r * (Math.cos(phi) - Math.cos(theta / 2));
    positions.push(x, -h / 2, z, x, h / 2, z);
    uvs.push(u, 0, u, 1);
  }
  for (let i = 0; i < segs; i++) {
    const b1 = i * 2;
    const t1 = b1 + 1;
    const b2 = (i + 1) * 2;
    const t2 = b2 + 1;
    indices.push(b1, b2, t1, b2, t2, t1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
