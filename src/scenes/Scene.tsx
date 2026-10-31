import { Physics, type RapierRigidBody } from '@react-three/rapier';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { BuilderCamera } from '../engine/builder/BuilderCamera';
import { CityBuilder, PiecesLayer } from '../engine/builder/CityBuilder';
import { Ground } from '../engine/builder/Ground';
import { PlayerController } from '../engine/player/PlayerController';
import { TouchLook } from '../engine/player/TouchLook';
import { useIsTouch } from '../ui/useMediaQuery';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { Environment, HORIZON_COLOR, SkyAndSun } from './SkyAndSun';

const BUILD_FOV = 50;
const ROAM_FOV = 75;

/**
 * Switches between the two views: build mode (orbiting city camera) and roam mode
 * (first-person walk/fly). Tab toggles. Entering roam drops the player at the point
 * the builder camera was looking at, facing the same way.
 */
function ModeSwitcher({ bodyRef }: { bodyRef: RefObject<RapierRigidBody | null> }) {
  const mode = useGameStore((s) => s.mode);
  const drawDistance = useGameStore((s) => s.graphics.drawDistance);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const previous = useRef(mode);

  // Lens and clip distance for the active view.
  useEffect(() => {
    camera.fov = mode === 'build' ? BUILD_FOV : ROAM_FOV;
    camera.far = mode === 'build' ? 1500 : drawDistance * 16;
    camera.updateProjectionMatrix();
  }, [camera, mode, drawDistance]);

  useEffect(() => {
    if (previous.current === mode) return;
    previous.current = mode;
    if (mode === 'roam') {
      const body = bodyRef.current;
      body?.setTranslation({ x: viewState.x, y: 2, z: viewState.z }, true);
      body?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      camera.rotation.set(0, viewState.yaw, 0, 'YXZ');
    } else {
      document.exitPointerLock();
    }
  }, [mode, bodyRef, camera]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.code !== 'Tab') return;
      e.preventDefault();
      const { mode: current, setMode } = useGameStore.getState();
      setMode(current === 'build' ? 'roam' : 'build');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}

/** Fog hides the ground plane's edge; it is much farther out in the zoomed-out builder view. */
function FogController() {
  const fog = useRef<THREE.Fog>(null);
  useFrame(() => {
    if (!fog.current) return;
    const { mode, graphics } = useGameStore.getState();
    const far = mode === 'build' ? 900 : graphics.drawDistance * 16;
    fog.current.far = far;
    fog.current.near = mode === 'build' ? Math.max(250, viewState.dist * 3) : far * 0.4;
  });
  return <fog ref={fog} attach="fog" args={[HORIZON_COLOR, 100, 900]} />;
}

export function Scene() {
  const shadows = useGameStore((s) => s.graphics.shadows);
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();
  const playerBodyRef = useRef<RapierRigidBody>(null);

  return (
    <Canvas shadows={shadows} camera={{ fov: BUILD_FOV, near: 0.1, far: 1500, position: [40, 50, 40] }} dpr={touch ? [1, 1.25] : [1, 1.5]}>
      <color attach="background" args={[HORIZON_COLOR]} />
      <FogController />
      <SkyAndSun />
      <Environment />
      <ModeSwitcher bodyRef={playerBodyRef} />
      <BuilderCamera />
      <Physics gravity={[0, -20, 0]}>
        <Ground />
        <PiecesLayer />
        <PlayerController bodyRef={playerBodyRef} />
      </Physics>
      <CityBuilder />
      {/* Roam only, and scoped to the canvas — drei defaults to `document`, which would also
          trigger pointer-lock from clicks on the UI overlay. */}
      {mode === 'roam' && !touch && <PointerLockControls selector="canvas" />}
      {touch && <TouchLook />}
    </Canvas>
  );
}
