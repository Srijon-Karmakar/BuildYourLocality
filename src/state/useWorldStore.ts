import { create } from 'zustand';
import { CHUNK_SIZE, chunkIndex, chunkKey, makeEmptyChunk, type ChunkData } from '../engine/voxel/types';
import { generateFlatChunk } from '../engine/voxel/worldGen';
import { WORLD_MAX_CY } from '../engine/voxel/worldConstants';

/**
 * Untouched ground-level chunks all share this one array, so they cost no per-chunk
 * memory and share a single mesh geometry. `chunks` below only stores chunks that
 * have been edited (copy-on-write), which is also exactly what gets saved.
 */
const FLAT_CHUNK = generateFlatChunk(0);

/** The chunk's voxels: the edited copy if there is one, else the generated terrain. */
export function chunkDataOrDefault(
  chunks: Record<string, ChunkData>,
  key: string,
  cy: number,
): ChunkData | undefined {
  return chunks[key] ?? (cy === 0 ? FLAT_CHUNK : undefined);
}

interface WorldState {
  /** Edited chunks only; everything else is generated on demand (see FLAT_CHUNK). */
  chunks: Record<string, ChunkData>;
  /** Bumped per chunk on every edit. @react-three/rapier's auto `colliders="trimesh"`
   *  only scans a RigidBody's children for geometry once, on mount (it does not react
   *  to the mesh's geometry changing later) — so Chunk's RigidBody must be force-
   *  remounted via `key` whenever its data changes, or the physics collider (and
   *  therefore raycasts against it) goes stale after the very first edit. */
  chunkVersions: Record<string, number>;
  /** Chunk column (x, z) the player is in; the renderer streams chunks around it. */
  centerCx: number;
  centerCz: number;
  setCenter: (cx: number, cz: number) => void;
  /** Edits a single voxel at world voxel coordinates, creating the chunk if needed.
   *  Ignored below the world floor (cy < 0) or above the height cap. */
  setVoxelWorld: (wx: number, wy: number, wz: number, voxelId: number) => void;
  /** Swaps in loaded chunk data (e.g. from a save), replacing all current edits and
   *  bumping versions so colliders rebuild. */
  replaceChunks: (chunks: Record<string, ChunkData>) => void;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  chunks: {},
  chunkVersions: {},
  centerCx: 2, // matches the default spawn at (32, _, 32)
  centerCz: 2,
  setCenter: (centerCx, centerCz) => set({ centerCx, centerCz }),
  replaceChunks: (loaded) =>
    set((state) => {
      const chunkVersions = { ...state.chunkVersions };
      for (const key of [...Object.keys(state.chunks), ...Object.keys(loaded)]) {
        chunkVersions[key] = (chunkVersions[key] ?? 0) + 1;
      }
      return { chunks: loaded, chunkVersions };
    }),
  setVoxelWorld: (wx, wy, wz, voxelId) => {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    if (cy < 0 || cy > WORLD_MAX_CY) return;
    const key = chunkKey({ cx, cy, cz });
    const existing = chunkDataOrDefault(get().chunks, key, cy) ?? makeEmptyChunk();

    const lx = wx - cx * CHUNK_SIZE;
    const ly = wy - cy * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const idx = chunkIndex(lx, ly, lz);
    if (existing[idx] === voxelId) return; // no actual change, skip the re-mesh

    const updated = new Uint8Array(existing);
    updated[idx] = voxelId;
    set((state) => ({
      chunks: { ...state.chunks, [key]: updated },
      chunkVersions: { ...state.chunkVersions, [key]: (state.chunkVersions[key] ?? 0) + 1 },
    }));
  },
}));
