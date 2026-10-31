import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { useGameStore } from '../../state/useGameStore';
import { chunkDataOrDefault, useWorldStore } from '../../state/useWorldStore';
import { Chunk } from './Chunk';
import { CHUNK_SIZE, chunkKey, type ChunkData } from './types';
import { PHYSICS_RADIUS, WORLD_MAX_CY } from './worldConstants';

/** Tracks which chunk column the camera is in and publishes it when it changes. */
function ChunkStreamer() {
  useFrame(({ camera }) => {
    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);
    const state = useWorldStore.getState();
    if (state.centerCx !== cx || state.centerCz !== cz) state.setCenter(cx, cz);
  });
  return null;
}

interface Entry {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  data: ChunkData;
  physics: boolean;
}

/**
 * Infinite world: every frame-visible chunk column within draw distance of the player
 * is rendered, generated on demand. Only chunks near the player get physics colliders
 * (PHYSICS_RADIUS) — far chunks are mesh-only, which keeps the collider count tiny.
 */
export function World() {
  const chunks = useWorldStore((s) => s.chunks);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);
  const centerCx = useWorldStore((s) => s.centerCx);
  const centerCz = useWorldStore((s) => s.centerCz);
  const drawDistance = useGameStore((s) => s.graphics.drawDistance);

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (let dx = -drawDistance; dx <= drawDistance; dx++) {
      for (let dz = -drawDistance; dz <= drawDistance; dz++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const physics = Math.max(Math.abs(dx), Math.abs(dz)) <= PHYSICS_RADIUS;
        for (let cy = 0; cy <= WORLD_MAX_CY; cy++) {
          const key = chunkKey({ cx, cy, cz });
          const data = chunkDataOrDefault(chunks, key, cy);
          if (data) out.push({ key, cx, cy, cz, data, physics });
        }
      }
    }
    return out;
  }, [chunks, centerCx, centerCz, drawDistance]);

  return (
    <>
      <ChunkStreamer />
      {entries.map(({ key, cx, cy, cz, data, physics }) => (
        // key includes the version so editing this chunk fully remounts its RigidBody,
        // forcing the auto trimesh collider to regenerate from the updated geometry
        // (see the comment on chunkVersions in useWorldStore.ts for why that's needed).
        <Chunk
          key={`${key}:${chunkVersions[key] ?? 0}`}
          data={data}
          cx={cx}
          cy={cy}
          cz={cz}
          physics={physics}
        />
      ))}
    </>
  );
}
