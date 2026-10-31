import { RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import type * as THREE from 'three';
import { useGameStore } from '../../state/useGameStore';
import { meshChunk } from './chunkMesher';
import { getVoxelMaterial } from './textures';
import { CHUNK_SIZE, type ChunkData } from './types';

interface ChunkProps {
  data: ChunkData;
  cx: number;
  cy: number;
  cz: number;
  /** Only chunks near the player get a collider; the rest are render-only. */
  physics: boolean;
}

/** Chunks sharing the same voxel array (all untouched ground) share one geometry. */
const geometryCache = new WeakMap<ChunkData, THREE.BufferGeometry>();

function getChunkGeometry(data: ChunkData): THREE.BufferGeometry {
  let geometry = geometryCache.get(data);
  if (!geometry) {
    geometry = meshChunk(data);
    geometryCache.set(data, geometry);
  }
  return geometry;
}

/**
 * Renders one chunk as a single merged mesh. `frustumCulled` is on (the R3F/Three
 * default) so each chunk mesh is skipped by the renderer entirely when its bounding
 * sphere is outside the camera frustum — this is the "only render what the player
 * can see" requirement applied per-chunk, on top of the per-face culling already
 * done in meshChunk().
 */
export function Chunk({ data, cx, cy, cz, physics }: ChunkProps) {
  const geometry = useMemo(() => getChunkGeometry(data), [data]);
  const textureQuality = useGameStore((s) => s.graphics.textureQuality);
  const material = useMemo(() => getVoxelMaterial(textureQuality), [textureQuality]);
  const position: [number, number, number] = [cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE];

  // An emptied chunk has no triangles; a trimesh collider can't be built from nothing.
  if (!geometry.index || geometry.index.count === 0) return null;

  const mesh = <mesh geometry={geometry} material={material} frustumCulled receiveShadow castShadow />;

  return physics ? (
    <RigidBody type="fixed" colliders="trimesh" position={position}>
      {mesh}
    </RigidBody>
  ) : (
    <group position={position}>{mesh}</group>
  );
}
