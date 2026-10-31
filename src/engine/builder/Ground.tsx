import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CELL } from '../../city/catalog';
import { getGroundTextures, getGroundVariationTexture } from '../../city/cityTextures';
import { useGameStore } from '../../state/useGameStore';
import { viewState } from '../viewState';

/** Cells across the ground plane; large enough that its edge is lost in the fog. */
const GROUND_CELLS = 334;

/** The variation overlay repeats every VARIATION_PERIOD cells; many grass tiles per blotch. */
const VARIATION_CELLS = 16; // 96 units
const VARIATION_PLANE_CELLS = VARIATION_CELLS * 21;

/**
 * Endless-looking grass: one big plane re-centred on the view each frame, snapped to
 * whole cells so the repeating grass texture never appears to slide. A single huge
 * static collider underneath serves roam mode.
 */
export function Ground() {
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const mesh = useRef<THREE.Mesh>(null);
  const overlay = useRef<THREE.Mesh>(null);
  const variation = useMemo(() => getGroundVariationTexture(), []);
  const { map, normalMap } = useMemo(() => getGroundTextures(quality), [quality]);

  useEffect(() => {
    for (const tex of [map, normalMap]) tex.repeat.set(GROUND_CELLS, GROUND_CELLS);
    variation.repeat.set(21, 21);
  }, [map, normalMap, variation]);

  useFrame(() => {
    if (overlay.current) {
      const snap = VARIATION_CELLS * CELL;
      overlay.current.position.set(Math.round(viewState.x / snap) * snap, 0.004, Math.round(viewState.z / snap) * snap);
    }
    if (!mesh.current) return;
    mesh.current.position.set(
      Math.round(viewState.x / CELL) * CELL,
      0,
      Math.round(viewState.z / CELL) * CELL,
    );
  });

  return (
    <>
      <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_CELLS * CELL, GROUND_CELLS * CELL]} />
        <meshStandardMaterial map={map} normalMap={normalMap} roughness={1} metalness={0} />
      </mesh>
      {/* Multiplies soft light/dark patches over the grass so its tile does not read as a repeat. */}
      <mesh ref={overlay} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[VARIATION_PLANE_CELLS * CELL, VARIATION_PLANE_CELLS * CELL]} />
        <meshBasicMaterial map={variation} blending={THREE.MultiplyBlending} transparent premultipliedAlpha depthWrite={false} toneMapped={false} />
      </mesh>
      <RigidBody type="fixed">
        <CuboidCollider args={[5000, 0.5, 5000]} position={[0, -0.5, 0]} />
      </RigidBody>
    </>
  );
}
