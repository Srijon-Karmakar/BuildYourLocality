/** Voxel id 0 = empty/air. Anything else is a solid block type. */
export type VoxelId = number;

export const AIR: VoxelId = 0;

export interface ChunkCoord {
  cx: number;
  cy: number;
  cz: number;
}

/** Size of one chunk edge, in voxels. Chunks are cubes of CHUNK_SIZE^3 voxels. */
export const CHUNK_SIZE = 16;

/**
 * Flat Uint8Array of CHUNK_SIZE^3 voxel ids, indexed as x + z * CHUNK_SIZE + y * CHUNK_SIZE^2.
 * Flat typed arrays keep chunk memory compact and avoid nested-array allocation overhead,
 * which matters once many chunks are resident on low-spec devices.
 */
export type ChunkData = Uint8Array;

export function chunkIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

export function makeEmptyChunk(): ChunkData {
  return new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
}

export function chunkKey(c: ChunkCoord): string {
  return `${c.cx},${c.cy},${c.cz}`;
}
