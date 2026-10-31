import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';

export const HORIZON_COLOR = '#bfdcf2';
/** Sun offset from the point it follows (the player), pointing at the sun. */
const SUN_OFFSET = new THREE.Vector3(70, 62, 40); // ~42 degrees up: long, readable shadows
const SHADOW_SNAP = 8; // world units; the shadow frustum moves in steps to limit shimmer

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    // Drop the translation so the dome follows the camera, and force depth to the far
    // plane (xyww) so it is always behind the world and never clipped by the far plane.
    vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome with a sun disc and glow; no textures, one draw call. */
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      horizon: { value: new THREE.Color(HORIZON_COLOR) },
      zenith: { value: new THREE.Color('#3f7fc4') },
      sunDir: { value: SUN_OFFSET.clone().normalize() },
    }),
    [],
  );
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

const SHADOW_MAP_SIZE = { low: 1024, medium: 2048, high: 4096 } as const;
/** Half-extent of the shadow frustum steps (world units), so it only changes in buckets. */
const SHADOW_EXTENTS = [30, 45, 70, 100, 150];

/** Directional sun whose shadow frustum follows the player through the infinite world. */
function Sun() {
  const shadows = useGameStore((s) => s.graphics.shadows);
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Vector3(), []);
  const light = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);

  // The shadow map is allocated lazily; drop it so a size change takes effect.
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    target.set(
      Math.round(viewState.x / SHADOW_SNAP) * SHADOW_SNAP,
      0,
      Math.round(viewState.z / SHADOW_SNAP) * SHADOW_SNAP,
    );
    l.target.position.copy(target);
    l.target.updateMatrixWorld();
    l.position.copy(target).add(SUN_OFFSET);

    // Shadow detail follows the zoom: tight and crisp when close, wide when zoomed out.
    const wanted = useGameStore.getState().mode === 'build' ? viewState.dist * 0.9 : 40;
    const extent = SHADOW_EXTENTS.find((e) => e >= wanted) ?? SHADOW_EXTENTS[SHADOW_EXTENTS.length - 1];
    const cam = l.shadow.camera;
    if (cam.right !== extent) {
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
    }
    if (l.shadow.map && l.shadow.map.width !== SHADOW_MAP_SIZE[quality]) {
      l.shadow.map.dispose();
      l.shadow.map = null;
    }
  });

  return (
    <directionalLight
      ref={light}
      intensity={3.2}
      color="#fff0d6"
      castShadow={shadows}
      shadow-mapSize={[SHADOW_MAP_SIZE[quality], SHADOW_MAP_SIZE[quality]]}
      shadow-camera-left={-80}
      shadow-camera-right={80}
      shadow-camera-top={80}
      shadow-camera-bottom={-80}
      shadow-camera-near={1}
      shadow-camera-far={450}
      shadow-bias={-0.0003}
      shadow-normalBias={0.06}
    />
  );
}

export function SkyAndSun() {
  return (
    <>
      <SkyDome />
      <hemisphereLight args={['#bcd8ff', '#6b5a43', 0.55]} />
      <Sun />
    </>
  );
}

/**
 * Image-based lighting from three's built-in RoomEnvironment (no download): gives glass,
 * metal and wet-looking surfaces something to reflect and softens the shadow side.
 */
export function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}
