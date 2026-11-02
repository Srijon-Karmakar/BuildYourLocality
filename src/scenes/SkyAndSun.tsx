import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { setReflectionEnvironment } from '../city/cityTextures';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { atmo, updateAtmosphere } from './atmosphere';

export const HORIZON_COLOR = '#bfdcf2';
/** Where the sun sat in the old fixed-sun sky; the reflection environment is baked with it. */
const SUN_OFFSET = new THREE.Vector3(70, 62, 40);
/** The light is placed this far out along its direction so very tall towers still sit inside its shadow frustum. */
const LIGHT_DISTANCE = 900;
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
  uniform vec3 moonDir;
  uniform vec3 cloudColor;
  uniform float daylight;
  uniform float cover;
  uniform float haze;
  uniform float flash;
  uniform float time;
  uniform vec2 wind;
  varying vec3 vDir;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      v += a * noise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    // Looking down at the ground (most of the screen in build mode): just the horizon colour.
    if (d.y <= 0.0) {
      gl_FragColor = vec4(horizon + vec3(0.55, 0.6, 0.9) * flash * 0.5, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    vec3 col = mix(horizon, zenith, pow(d.y, 0.55));
    float night = 1.0 - daylight;
    float skyOpen = (1.0 - cover * 0.9) * (1.0 - haze);

    // Stars twinkle through the dark, hidden by cloud and haze.
    if (night > 0.02 && skyOpen > 0.02) {
      vec2 uv = vec2(atan(d.z, d.x) * 46.0, d.y * 92.0);
      vec2 cell = floor(uv);
      float r = hash(cell);
      vec2 f = fract(uv) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5;
      float star = step(0.94, r) * smoothstep(0.16, 0.0, length(f));
      star *= 0.65 + 0.35 * sin(time * 2.5 + r * 60.0);
      col += vec3(0.85, 0.9, 1.0) * star * night * skyOpen * smoothstep(0.0, 0.2, d.y) * 1.4;
    }

    // Sun disc and glow; moon disc.
    float s = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18) * skyOpen * smoothstep(-0.02, 0.06, sunDir.y);
    float m = dot(d, moonDir);
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9992, 0.9996, m) * 1.3 + pow(max(m, 0.0), 60.0) * 0.1) * night * skyOpen;

    // Drifting clouds on a flat layer.
    if (cover > 0.02) {
      vec2 p = d.xz / (d.y * 0.9 + 0.12) * 0.55 + wind * time * 0.012;
      float n = fbm(p);
      float c = smoothstep(1.02 - cover * 0.62, 1.02 - cover * 0.62 + 0.3, n);
      c *= smoothstep(0.0, 0.14, d.y);
      float thick = smoothstep(0.35, 0.85, n);
      vec3 lit = cloudColor * mix(1.0, 0.62, thick * cover);
      col = mix(col, lit, c * 0.96);
    }

    col = mix(col, horizon, haze * 0.85);
    col += vec3(0.55, 0.6, 0.9) * flash * 0.5;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const skyCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Procedural sky dome: gradient, sun, moon, stars and drifting clouds. No textures, one draw call. */
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      horizon: { value: atmo.horizon },
      zenith: { value: atmo.zenith },
      sunDir: { value: atmo.sunDir },
      moonDir: { value: atmo.moonDir },
      cloudColor: { value: atmo.cloudColor },
      daylight: { value: 1 },
      cover: { value: 0 },
      haze: { value: 0 },
      flash: { value: 0 },
      time: { value: 0 },
      wind: { value: new THREE.Vector2() },
    }),
    [],
  );
  useFrame(() => {
    uniforms.daylight.value = atmo.daylight;
    uniforms.cover.value = atmo.cloud;
    uniforms.haze.value = atmo.fog;
    uniforms.flash.value = atmo.flash;
    uniforms.time.value = atmo.time;
    uniforms.wind.value.set(atmo.windX, atmo.windZ);
  });
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 24, 16]} />
      <shaderMaterial
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        uniforms={uniforms}
        defines={{ OCTAVES: skyCoarse ? 2 : 4 }}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Phones get a quarter of the shadow pixels: the map is a big share of the GPU cost there. */
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const SHADOW_MAP_SIZE = coarse ? ({ low: 512, medium: 1024, high: 2048 } as const) : ({ low: 1024, medium: 2048, high: 4096 } as const);
/** Half-extent of the shadow frustum steps (world units), so it only changes in buckets. */
const SHADOW_EXTENTS = [30, 45, 70, 100, 150];

/**
 * The scene's one shadow-casting light: the sun by day, the moon by night (see `atmosphere`).
 * Its shadow frustum follows the player through the infinite world.
 */
function Sun() {
  const shadows = useGameStore((s) => s.graphics.shadows);
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Vector3(), []);
  const light = useRef<THREE.DirectionalLight>(null);
  const frame = useRef(0);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);

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
    l.position.copy(target).addScaledVector(atmo.lightDir, LIGHT_DISTANCE);
    l.color.copy(atmo.lightColor);
    l.intensity = atmo.lightIntensity;

    // In the dead of night (or under heavy cloud) the shadow pass is skipped. castShadow stays put:
    // toggling it would recompile every material.
    const dark = atmo.lightIntensity < 0.05;
    const mobile = useGameStore.getState().graphics.shadowRate > 1;
    frame.current++;
    // Optionally refresh the shadow map every other frame: cars still look smooth, the GPU does half the work.
    l.shadow.autoUpdate = !dark && (!mobile || frame.current % 2 === 0);

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
    // The shadow map is allocated lazily; drop it so a size change takes effect.
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
      shadow-camera-near={50}
      shadow-camera-far={2300}
      shadow-bias={-0.0003}
      shadow-normalBias={0.06}
    />
  );
}

/** Ambient sky/ground light that follows the time of day and weather. */
function Ambient() {
  const light = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    l.color.copy(atmo.skyLight);
    l.groundColor.copy(atmo.groundLight);
    l.intensity = atmo.hemiIntensity;
  });
  return <hemisphereLight ref={light} args={['#bcd8ff', '#6b5a43', 0.55]} />;
}

/** Advances the clock and weather once per frame, before anything that reads them draws. */
function AtmosphereClock() {
  useFrame((_, delta) => updateAtmosphere(delta), -10);
  return null;
}

export function SkyAndSun() {
  return (
    <>
      <AtmosphereClock />
      <SkyDome />
      <Ambient />
      <Sun />
    </>
  );
}

/** Builds a small scene shaped like the daytime sky (ground, horizon, zenith, bright sun) for reflections. */
function buildSkyEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(50, 48, 24);
  const colors: number[] = [];
  const position = geometry.getAttribute('position');
  const ground = new THREE.Color('#8b8a7c');
  const horizon = new THREE.Color(HORIZON_COLOR).multiplyScalar(1.15);
  const zenith = new THREE.Color('#3f7fc4');
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 50;
    if (y < 0) c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
    else c.copy(horizon).lerp(zenith, Math.pow(y, 0.5));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d0').multiplyScalar(40), toneMapped: false }),
  );
  sun.position.copy(SUN_OFFSET).normalize().multiplyScalar(44);
  env.add(sun);
  return env;
}

/**
 * Image-based lighting from a procedural daytime sky: gives mirror glass, metal and glossy
 * panels a believable sky to reflect, and lights shaded sides softly. No texture download.
 */
export function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(buildSkyEnvironment(), 0.02);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.5;
    setReflectionEnvironment(target.texture);
    return () => {
      setReflectionEnvironment(null);
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  // Reflections fade with the daylight so mirror glass does not mirror a noon sky at midnight.
  useFrame(() => {
    scene.environmentIntensity = 0.5 * (0.12 + 0.88 * atmo.daylight) * (1 - 0.45 * atmo.cloud);
  });

  return null;
}
