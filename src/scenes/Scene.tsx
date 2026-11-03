import { Physics, type RapierRigidBody } from '@react-three/rapier';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, PerformanceMonitor, PointerLockControls } from '@react-three/drei';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { BuilderCamera } from '../engine/builder/BuilderCamera';
import { CityBuilder } from '../engine/builder/CityBuilder';
import { PiecesLayer } from '../engine/builder/StaticPieces';
import { Ground } from '../engine/builder/Ground';
import { CombatController } from '../engine/player/CombatController';
import { PlayerController } from '../engine/player/PlayerController';
import { TouchLook } from '../engine/player/TouchLook';
import { useIsTouch } from '../ui/useMediaQuery';
import { heightAt } from '../terrain/terrain';
import { viewState } from '../engine/viewState';
import { SimLayer } from '../sim/SimLayer';
import { TerrainLayer } from '../terrain/TerrainLayer';
import { Vegetation } from '../terrain/Vegetation';
import { Water } from '../terrain/Water';
import { useBootStore } from '../state/useBootStore';
import { useGameStore } from '../state/useGameStore';
import { FACADES, ROOFS } from '../city/catalog';
import { warmTextures } from '../city/cityTextures';
import { atmo } from './atmosphere';
import { NightLights } from './NightLights';
import { VehicleController } from '../engine/player/VehicleController';
import { vehicle } from '../sim/vehicle';
import { AudioDirector } from '../audio/AudioDirector';
import { NightBloom } from './NightBloom';
import { ProgramWarmup } from './ProgramWarmup';
import { Precipitation } from './Precipitation';
import { Environment, HORIZON_COLOR, SkyAndSun } from './SkyAndSun';
import { sim } from '../sim/simulation';
import { combat } from '../sim/combat';
import { construction } from '../sim/construction';
import { useCityStore } from '../state/useCityStore';
import { useBuilderStore } from '../state/useBuilderStore';
import { useWeatherStore } from '../state/useWeatherStore';
import { useTerrainStore } from '../terrain/terrain';

/** Dev only: handles for the headless profiling scripts (stripped from production builds). */
/** Tells the loading screen the first frame has been drawn. */
function FirstFrame() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    useBootStore.setState({ sceneReady: true });
  });
  return null;
}

function DevHooks() {
  const three = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, { __apna: { vehicle, three, sim, combat, construction, city: useCityStore, game: useGameStore, builder: useBuilderStore, weather: useWeatherStore, terrain: useTerrainStore, viewState } });
  }, [three]);
  return null;
}

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
      body?.setTranslation({ x: viewState.x, y: Math.max(0, heightAt(viewState.x, viewState.z)) + 2, z: viewState.z }, true);
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

/**
 * Fog hides the ground plane's edge; it is much farther out in the zoomed-out builder view.
 * Its colour follows the sky, and fog, rain and snow pull it in close (never so close that the
 * city under the camera disappears).
 */
function FogController() {
  const fog = useRef<THREE.Fog>(null);
  const background = useRef<THREE.Color>(null);
  useFrame(() => {
    if (!fog.current) return;
    const { mode, graphics } = useGameStore.getState();
    const base = mode === 'build' ? 900 : graphics.drawDistance * 16;
    const baseNear = mode === 'build' ? Math.min(base - 50, Math.max(250, viewState.dist * 1.6)) : base * 0.4;
    const thick = Math.min(1, atmo.fog + atmo.rain * 0.35 + atmo.snow * 0.45);
    // Even in thick fog, keep what the camera is looking at visible.
    const clearFar = mode === 'build' ? viewState.dist * 2.4 + 80 : 60;
    const far = THREE.MathUtils.lerp(base, Math.min(base, clearFar), thick);
    fog.current.far = far;
    fog.current.near = THREE.MathUtils.lerp(baseNear, far * 0.15, thick);
    fog.current.color.copy(atmo.horizon);
    background.current?.copy(atmo.horizon);
  });
  return (
    <>
      <color ref={background} attach="background" args={[HORIZON_COLOR]} />
      <fog ref={fog} attach="fog" args={[HORIZON_COLOR, 100, 900]} />
    </>
  );
}

/** Lowers the render resolution when the frame rate drops and raises it again when there is room. */
function AdaptiveResolution({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr);
  const adaptive = useGameStore((s) => s.graphics.adaptive);
  useEffect(() => {
    if (!adaptive) setDpr(max);
  }, [adaptive, max, setDpr]);
  if (!adaptive) return null;
  return <PerformanceMonitor bounds={() => [30, 55]} flipflops={4} onChange={({ factor }) => setDpr(Math.round((min + (max - min) * factor) * 20) / 20)} />;
}

/** Small frames-per-second readout, shown from Settings when you want to see how the device copes. */
function FpsMeter() {
  const show = useGameStore((s) => s.graphics.showFps);
  const [fps, setFps] = useState(0);
  const [load, setLoad] = useState({ calls: 0, tris: 0, geos: 0, tex: 0, ms: 0 });
  const dpr = useThree((s) => s.viewport.dpr);
  const frames = useRef({ n: 0, t: 0, worst: 0 });
  useFrame((state, dt) => {
    if (!show) return;
    frames.current.n++;
    frames.current.t += dt;
    frames.current.worst = Math.max(frames.current.worst, dt);
    if (frames.current.t >= 0.5) {
      setFps(Math.round(frames.current.n / frames.current.t));
      // What the GPU was asked to draw last frame: lots of draw calls or triangles points at the scenery.
      const info = state.gl.info;
      setLoad({ calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures, ms: Math.round(frames.current.worst * 1000) });
      frames.current = { n: 0, t: 0, worst: 0 };
    }
  });
  if (!show) return null;
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div
        className="absolute right-2 rounded-md bg-black/60 px-2 py-0.5 text-right font-mono text-[11px] text-white/80"
        style={{ bottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
      >
        {fps} fps · worst {load.ms} ms · x{dpr.toFixed(2)}
        <br />
        {load.calls} draws · {(load.tris / 1000).toFixed(0)}k tris · {load.geos} geo · {load.tex} tex
      </div>
    </Html>
  );
}

export function Scene() {
  const shadows = useGameStore((s) => s.graphics.shadows);
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();
  const playerBodyRef = useRef<RapierRigidBody>(null);
  // Generate the texture library in the background so picking a material later is instant.
  // (Not on phones: painting a texture stalls a slow CPU for a moment, so there it happens only when a texture is first needed.)
  useEffect(() => (touch ? undefined : warmTextures(quality, FACADES.map((f) => f.id), ROOFS.map((r) => r.id))), [quality, touch]);
  const preset = useGameStore((s) => s.graphics.preset);
  const dprRange: [number, number] = touch ? (preset === 'low' ? [0.6, 1] : [0.7, 1.25]) : [0.85, 1.5];

  return (
    <Canvas
      shadows={shadows}
      camera={{ fov: BUILD_FOV, near: 0.1, far: 1500, position: [40, 50, 40] }}
      dpr={dprRange[1]}
      gl={{ antialias: !touch, powerPreference: 'high-performance' }}
    >
      <DevHooks />
      <FirstFrame />
      <AdaptiveResolution min={dprRange[0]} max={dprRange[1]} />
      <FpsMeter />
      <FogController />
      <SkyAndSun />
      <Environment />
      <ModeSwitcher bodyRef={playerBodyRef} />
      <BuilderCamera />
      {/* Nothing moves under physics in build mode, so skip stepping it. */}
      <Physics gravity={[0, -20, 0]} paused={mode === 'build'}>
        <Ground />
        <TerrainLayer />
        <PiecesLayer />
        <PlayerController bodyRef={playerBodyRef} />
        <CombatController />
      </Physics>
      <Water />
      <Vegetation />
      <SimLayer />
      <VehicleController bodyRef={playerBodyRef} />
      <AudioDirector />
      <Precipitation />
      <NightLights />
      <NightBloom />
      {!touch && <ProgramWarmup />}
      <CityBuilder />
      {/* Roam only, and scoped to the canvas — drei defaults to `document`, which would also
          trigger pointer-lock from clicks on the UI overlay. */}
      {mode === 'roam' && !touch && <PointerLockControls selector="canvas" />}
      {touch && <TouchLook />}
    </Canvas>
  );
}
