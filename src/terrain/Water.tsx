import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getWaterNormals } from '../city/cityTextures';
import { viewState } from '../engine/viewState';
import { useIsTouch } from '../ui/useMediaQuery';
import { WATER_LEVEL, useTerrainStore } from './terrain';

const SIZE = 3000;
const REPEAT = 160;

/**
 * One big sheet of water at sea level that follows the view. It only shows where the terrain
 * has been dug below it (lakes, rivers, sea) because everywhere else the ground is higher.
 * Slowly scrolling ripples and a sky reflection do the rest.
 */
export function Water() {
  const hasWater = useTerrainStore((s) => {
    for (const key in s.cells) if ((s.cells[key].h ?? 0) < WATER_LEVEL) return true;
    return false;
  });
  const touch = useIsTouch();
  const activeSize = touch ? 700 : SIZE;
  const activeRepeat = touch ? 40 : REPEAT;
  const tile = activeSize / activeRepeat;

  const mesh = useRef<THREE.Mesh>(null);
  const normals = useMemo(() => {
    const t = getWaterNormals().clone();
    t.repeat.set(activeRepeat, activeRepeat);
    t.needsUpdate = true;
    return t;
  }, [activeRepeat]);

  useFrame((_, dt) => {
    // Snap to whole ripple tiles so the pattern never appears to slide with the camera.
    mesh.current?.position.set(Math.round(viewState.x / tile) * tile, WATER_LEVEL, Math.round(viewState.z / tile) * tile);
    normals.offset.x += dt * 0.011;
    normals.offset.y += dt * 0.007;
  });

  if (!hasWater) return null;
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[activeSize, activeSize]} />
      <meshStandardMaterial
        color="#2b7ca8"
        transparent
        opacity={0.8}
        roughness={0.05}
        metalness={0.15}
        normalMap={normals}
        normalScale={new THREE.Vector2(0.55, 0.55)}
        depthWrite={false}
        envMapIntensity={1.5}
      />
    </mesh>
  );
}
