import { CHUNK_SIZE, chunkIndex, makeEmptyChunk, type ChunkData } from './types';

export const GRASS: number = 1;
export const DIRT: number = 2;
export const STONE: number = 3;

/**
 * Deterministic flat starting terrain for a chunk at vertical chunk-index cy:
 * stone base, a dirt band, one grass layer on top. No noise/procedural variation
 * yet (see project-details.md non-goals) — this exists only so there is solid
 * ground to stand on and look at in build/roam mode.
 */
export function generateFlatChunk(cy: number): ChunkData {
  const chunk = makeEmptyChunk();
  if (cy !== 0) return chunk; // only the ground-level chunk layer has terrain for now

  const groundHeight = 4; // voxels of solid ground within this chunk layer
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < groundHeight; y++) {
        let id: number = STONE;
        if (y === groundHeight - 1) id = GRASS;
        else if (y >= groundHeight - 3) id = DIRT;
        chunk[chunkIndex(x, y, z)] = id;
      }
    }
  }
  return chunk;
}
