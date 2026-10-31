import * as THREE from 'three';
import { TILE, TILE_COUNT } from './textures';
import { AIR, CHUNK_SIZE, chunkIndex, type ChunkData } from './types';

type Vec3 = [number, number, number];

/**
 * Face directions as [normal, the 4 corner offsets of the quad] in a consistent
 * winding order. Corner offsets are relative to the "min corner" of the voxel.
 */
const FACES: { normal: Vec3; corners: Vec3[] }[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] }, // +X
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] }, // -X
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] }, // +Y
  { normal: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] }, // -Y
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] }, // +Z
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }, // -Z
];

/** Brightness for 0-3 occluding neighbours at a face corner (3 = fully lit). */
const AO_BRIGHTNESS = [0.5, 0.68, 0.84, 1];

/** Atlas tile for a voxel face; ny is the face normal's y component. */
function tileFor(voxel: number, ny: number): number {
  if (voxel === 1) return ny > 0 ? TILE.grassTop : ny < 0 ? TILE.dirt : TILE.grassSide;
  if (voxel === 2) return TILE.dirt;
  return TILE.stone; // stone, and the fallback for unknown ids
}

/** Cheap deterministic per-voxel brightness jitter so flat ground doesn't look tiled. */
function variation(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return 0.94 + 0.12 * (n - Math.floor(n));
}

// UVs are inset slightly so linear filtering never samples the neighbouring atlas tile.
const UV_INSET = 1 / 64;

function getVoxel(chunk: ChunkData, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE || z >= CHUNK_SIZE) {
    // Treat out-of-chunk neighbors as air for now, so chunk borders still render.
    // Known limitation: this draws a few extra border faces between adjacent solid
    // chunks until cross-chunk neighbor lookups are wired up (and AO ignores them).
    return AIR;
  }
  return chunk[chunkIndex(x, y, z)];
}

/**
 * Builds one merged mesh geometry for an entire chunk, emitting a quad only for
 * voxel faces that touch an empty neighbor (hidden interior faces are skipped
 * entirely). This is the core render-cost optimization: a 16^3 chunk that is
 * mostly solid produces geometry proportional to its visible surface, not its
 * volume, and collapses into a single draw call per chunk.
 *
 * Each vertex also carries a baked ambient-occlusion brightness (darker in creases
 * and corners) in its vertex color, and UVs into the procedural texture atlas.
 */
export function meshChunk(chunk: ChunkData): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexCount = 0;

  const solid = (x: number, y: number, z: number) => (getVoxel(chunk, x, y, z) !== AIR ? 1 : 0);
  const ao = [0, 0, 0, 0];

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const voxel = getVoxel(chunk, x, y, z);
        if (voxel === AIR) continue;
        const tint = variation(x, y, z);

        for (const face of FACES) {
          const [nx, ny, nz] = face.normal;
          if (getVoxel(chunk, x + nx, y + ny, z + nz) !== AIR) continue; // face is hidden, skip it

          const tile = tileFor(voxel, ny);
          const axis = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
          const t1 = (axis + 1) % 3;
          const t2 = (axis + 2) % 3;

          face.corners.forEach((corner, i) => {
            // Ambient occlusion: look at the two edge neighbours and the diagonal one
            // in the layer just outside this face, on the side of this corner.
            const d1 = corner[t1] === 1 ? 1 : -1;
            const d2 = corner[t2] === 1 ? 1 : -1;
            const at = (a: number, b: number): [number, number, number] => {
              const p: Vec3 = [x + nx, y + ny, z + nz];
              p[t1] += a * d1;
              p[t2] += b * d2;
              return p;
            };
            const side1 = solid(...at(1, 0));
            const side2 = solid(...at(0, 1));
            const diag = solid(...at(1, 1));
            ao[i] = side1 && side2 ? 0 : 3 - (side1 + side2 + diag);

            const [cx, cy, cz] = corner;
            positions.push(x + cx, y + cy, z + cz);
            normals.push(nx, ny, nz);
            const shade = AO_BRIGHTNESS[ao[i]] * tint;
            colors.push(shade, shade, shade);

            // Side faces: v follows height, so the grass fringe sits at the top.
            const u = axis === 0 ? cz : cx;
            const v = axis === 1 ? cz : cy;
            uvs.push(
              (tile + UV_INSET + u * (1 - 2 * UV_INSET)) / TILE_COUNT,
              UV_INSET + v * (1 - 2 * UV_INSET),
            );
          });

          // Split the quad along the diagonal whose end vertices match best, so the AO
          // gradient doesn't show a visible seam.
          if (Math.abs(ao[0] - ao[2]) > Math.abs(ao[1] - ao[3])) {
            indices.push(vertexCount + 1, vertexCount + 2, vertexCount + 3, vertexCount + 1, vertexCount + 3, vertexCount);
          } else {
            indices.push(vertexCount, vertexCount + 1, vertexCount + 2, vertexCount, vertexCount + 2, vertexCount + 3);
          }
          vertexCount += 4;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
