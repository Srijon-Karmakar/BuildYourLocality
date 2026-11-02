import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching: many small meshes (a house is a dozen boxes and cones) become one merged
 * mesh per material. The scene then costs a handful of draw calls instead of thousands, which
 * is what keeps phones smooth.
 */

/** Attributes kept when merging; everything else is dropped so geometries always line up. */
const KEPT = ['position', 'normal', 'uv', 'color'];

/** Copies vertices [start, start + count) of a non-indexed geometry into a new one. */
function slice(source: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.getAttribute(name);
    const size = attribute.itemSize;
    out.setAttribute(name, new THREE.BufferAttribute((attribute.array as Float32Array).slice(start * size, (start + count) * size), size));
  }
  return out;
}

function prepare(source: THREE.BufferGeometry, matrix: THREE.Matrix4, withColor: boolean, range?: { start: number; count: number }): THREE.BufferGeometry | null {
  const position = source.getAttribute('position');
  if (!position || position.count === 0) return null;
  let geometry = source.index ? source.toNonIndexed() : source.clone();
  if (range) {
    const part = slice(geometry, range.start, range.count);
    geometry.dispose();
    geometry = part;
  }

  for (const name of Object.keys(geometry.attributes)) {
    if (!KEPT.includes(name)) geometry.deleteAttribute(name);
  }
  const count = geometry.getAttribute('position').count;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (withColor && !geometry.getAttribute('color')) {
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  } else if (!withColor && geometry.getAttribute('color')) {
    geometry.deleteAttribute('color');
  }

  geometry.applyMatrix4(matrix);

  // A mirrored transform turns triangles inside out: swap two vertices of each to restore the winding.
  if (matrix.determinant() < 0) {
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.getAttribute(name);
      const size = attribute.itemSize;
      const array = attribute.array as Float32Array;
      for (let t = 0; t < count; t += 3) {
        for (let k = 0; k < size; k++) {
          const a = (t + 1) * size + k;
          const b = (t + 2) * size + k;
          const tmp = array[a];
          array[a] = array[b];
          array[b] = tmp;
        }
      }
    }
  }
  return geometry;
}

/** Can this mesh be folded into a merged one? Moving, instanced and multi-material meshes cannot. */
function mergeable(mesh: THREE.Mesh): boolean {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (!mesh.material || !mesh.geometry) return false;
  // A multi-material mesh (a box with a different material per face) can only be split along its groups.
  if (Array.isArray(mesh.material) && mesh.geometry.groups.length === 0) return false;
  if (mesh.userData.noBatch) return false;
  return true;
}

interface Bucket {
  material: THREE.Material;
  cast: boolean;
  receive: boolean;
  renderOrder: number;
  geometries: THREE.BufferGeometry[];
}

/**
 * Merges every mergeable mesh under `roots` into meshes grouped by material. Returns the new
 * meshes (positioned in world space, so add them to a group at the origin). Roots must have
 * up-to-date world matrices.
 */
export function mergeMeshes(roots: THREE.Object3D[]): THREE.Mesh[] {
  const buckets = new Map<string, Bucket>();
  const leftovers: THREE.Mesh[] = [];
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (let p: THREE.Object3D | null = mesh; p && p !== root.parent; p = p.parent) if (!p.visible) return;
      if (!mergeable(mesh)) {
        leftovers.push(mesh);
        return;
      }
      const parts: { material: THREE.Material; range?: { start: number; count: number } }[] = Array.isArray(mesh.material)
        ? mesh.geometry.groups.flatMap((g) => (mesh.material as THREE.Material[])[g.materialIndex ?? 0] ? [{ material: (mesh.material as THREE.Material[])[g.materialIndex ?? 0], range: { start: g.start, count: g.count } }] : [])
        : [{ material: mesh.material }];
      for (const { material, range } of parts) {
        const withColor = (material as THREE.MeshStandardMaterial).vertexColors === true;
        const geometry = prepare(mesh.geometry, mesh.matrixWorld, withColor, range);
        if (!geometry) continue;
        const key = `${material.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { material, cast: mesh.castShadow, receive: mesh.receiveShadow, renderOrder: mesh.renderOrder, geometries: [] };
          buckets.set(key, bucket);
        }
        bucket.geometries.push(geometry);
      }
    });
  }

  const out: THREE.Mesh[] = [];
  for (const bucket of buckets.values()) {
    const merged = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries, false);
    if (bucket.geometries.length > 1) for (const g of bucket.geometries) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.renderOrder = bucket.renderOrder;
    mesh.matrixAutoUpdate = false; // never moves
    out.push(mesh);
  }
  // Anything that could not be merged still has to be drawn: put a fixed copy in the live scene.
  for (const mesh of leftovers) {
    const copy = new THREE.Mesh(mesh.geometry, mesh.material);
    copy.castShadow = mesh.castShadow;
    copy.receiveShadow = mesh.receiveShadow;
    copy.renderOrder = mesh.renderOrder;
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    copy.matrixWorld.copy(mesh.matrixWorld);
    copy.userData.sharedGeometry = true;
    out.push(copy);
  }
  return out;
}

/** A cheap fingerprint of everything under `root` that shows on screen; changes when anything is added, swapped or moved. */
export function fingerprint(root: THREE.Object3D): number {
  let h = 17;
  root.traverse((o) => {
    h = (h * 31 + o.id) | 0;
    h = (h * 31 + (o.visible ? 1 : 0)) | 0;
    const p = o.position;
    h = (h * 31 + Math.round((p.x + p.y * 3 + p.z * 7) * 1000)) | 0;
    const r = o.rotation;
    h = (h * 31 + Math.round((r.x + r.y * 3 + r.z * 7) * 1000)) | 0;
    const s = o.scale;
    h = (h * 31 + Math.round((s.x + s.y * 3 + s.z * 7) * 1000)) | 0;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      h = (h * 31 + (mesh.geometry?.id ?? 0)) | 0;
      const material = mesh.material as (THREE.Material & { id?: number }) | undefined;
      h = (h * 31 + (material && !Array.isArray(material) ? (material.id ?? 0) : 0)) | 0;
      h = (h * 31 + (mesh.castShadow ? 1 : 0) + (mesh.receiveShadow ? 2 : 0)) | 0;
    }
  });
  return h;
}
