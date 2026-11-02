import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { heightAt } from '../terrain/terrain';
import { useIsTouch } from '../ui/useMediaQuery';
import { atmo } from './atmosphere';

/**
 * Rain streaks and snowflakes. Every drop is a fixed random point in a box that follows the
 * view; the vertex shader makes it fall and wraps it back to the top, so the CPU does nothing
 * per drop and each kind is a single draw call.
 */

const RAIN_MAX = { phone: 1800, desktop: 4500 };
const SNOW_MAX = { phone: 1400, desktop: 3600 };

const rainVertex = /* glsl */ `
  attribute vec3 seed;
  attribute float tail;
  uniform vec3 centre;
  uniform vec3 size;
  uniform vec2 wind;
  uniform float time;
  uniform float speed;
  varying float vAlpha;
  void main() {
    float y = fract(seed.y - time * speed / size.y);
    vec2 xz = (fract(seed.xz - centre.xz / (2.0 * size.xz)) - 0.5) * 2.0 * size.xz + centre.xz;
    vec3 vel = vec3(wind.x * 3.0, -speed, wind.y * 3.0);
    vec3 pos = vec3(xz.x, centre.y + y * size.y, xz.y);
    pos.xz += wind * 3.0 * y * size.y / speed;
    pos -= normalize(vel) * tail * (0.9 + seed.x * 0.8);
    float edge = length((pos.xz - centre.xz) / size.xz);
    vAlpha = (1.0 - tail * 0.85) * (1.0 - smoothstep(0.72, 1.0, edge)) * smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.9, y);
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  }
`;

const rainFragment = /* glsl */ `
  uniform vec3 colour;
  uniform float opacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(colour, opacity * vAlpha);
  }
`;

const snowVertex = /* glsl */ `
  attribute vec3 seed;
  uniform vec3 centre;
  uniform vec3 size;
  uniform vec2 wind;
  uniform float time;
  uniform float scale;
  varying float vAlpha;
  void main() {
    float fall = 0.9 + seed.x * 0.5;
    float y = fract(seed.y - time * fall * 1.1 / size.y);
    vec2 xz = (fract(seed.xz - centre.xz / (2.0 * size.xz)) - 0.5) * 2.0 * size.xz + centre.xz;
    vec3 pos = vec3(xz.x, centre.y + y * size.y, xz.y);
    pos.x += sin(time * 0.8 + seed.z * 40.0) * 0.7 + wind.x * y * size.y * 0.25;
    pos.z += cos(time * 0.7 + seed.x * 40.0) * 0.7;
    float edge = length((pos.xz - centre.xz) / size.xz);
    vAlpha = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.92, y);
    vec4 mv = viewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(scale * (0.7 + seed.z * 0.8) / max(0.5, -mv.z), 1.5, 14.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const snowFragment = /* glsl */ `
  uniform float opacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d);
    if (a < 0.02) discard;
    gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), a * opacity * vAlpha);
  }
`;

function seeds(count: number, perDrop: number): Float32Array {
  const out = new Float32Array(count * perDrop * 3);
  for (let i = 0; i < count; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    for (let k = 0; k < perDrop; k++) out.set([x, y, z], (i * perDrop + k) * 3);
  }
  return out;
}

const _centre = new THREE.Vector3();
const _size = new THREE.Vector3();

/** The box the weather falls in: tight around a walking player, wide enough to read from a high build camera. */
function volume(roam: boolean, camY: number) {
  if (roam) {
    _size.set(26, 24, 26);
    _centre.set(viewState.x, camY - 12, viewState.z);
  } else {
    const r = Math.min(110, Math.max(30, viewState.dist * 0.7));
    const h = Math.min(90, Math.max(26, viewState.dist * 0.6));
    _size.set(r, h, r);
    _centre.set(viewState.x, Math.max(0, heightAt(viewState.x, viewState.z)) - 1, viewState.z);
  }
}

export function Precipitation() {
  const touch = useIsTouch();
  const camera = useThree((s) => s.camera);
  const max = touch ? 'phone' : 'desktop';

  const rain = useMemo(() => {
    const count = RAIN_MAX[max];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds(count, 2), 3));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    const tail = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) tail[i * 2 + 1] = 1.1;
    geometry.setAttribute('tail', new THREE.BufferAttribute(tail, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const material = new THREE.ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        centre: { value: new THREE.Vector3() },
        size: { value: new THREE.Vector3(1, 1, 1) },
        wind: { value: new THREE.Vector2() },
        time: { value: 0 },
        speed: { value: 26 },
        colour: { value: new THREE.Color('#bcd0e6') },
        opacity: { value: 0 },
      },
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 4;
    lines.visible = false;
    return { lines, count };
  }, [max]);

  const snow = useMemo(() => {
    const count = SNOW_MAX[max];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds(count, 1), 3));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const material = new THREE.ShaderMaterial({
      vertexShader: snowVertex,
      fragmentShader: snowFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        centre: { value: new THREE.Vector3() },
        size: { value: new THREE.Vector3(1, 1, 1) },
        wind: { value: new THREE.Vector2() },
        time: { value: 0 },
        scale: { value: 80 },
        opacity: { value: 0 },
      },
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.visible = false;
    return { points, count };
  }, [max]);

  useFrame((state) => {
    const roam = useGameStore.getState().mode === 'roam';
    const rainOn = atmo.rain > 0.02;
    const snowOn = atmo.snow > 0.02;
    rain.lines.visible = rainOn;
    snow.points.visible = snowOn;
    if (!rainOn && !snowOn) return;
    volume(roam, camera.position.y);
    // Light level so rain is not bright white in the dark.
    const light = 0.25 + 0.75 * atmo.daylight;

    if (rainOn) {
      const u = (rain.lines.material as THREE.ShaderMaterial).uniforms;
      u.centre.value.copy(_centre);
      u.size.value.copy(_size);
      u.wind.value.set(atmo.windX, atmo.windZ);
      u.time.value = atmo.time;
      u.speed.value = 24 + atmo.storm * 8;
      u.opacity.value = Math.min(0.55, 0.2 + atmo.rain * 0.4) * light;
      rain.lines.geometry.setDrawRange(0, Math.ceil(rain.count * Math.min(1, atmo.rain)) * 2);
    }
    if (snowOn) {
      const u = (snow.points.material as THREE.ShaderMaterial).uniforms;
      u.centre.value.copy(_centre);
      u.size.value.copy(_size);
      u.wind.value.set(atmo.windX * 0.5, atmo.windZ * 0.5);
      u.time.value = atmo.time;
      u.scale.value = state.size.height * 0.07;
      u.opacity.value = 0.9 * (0.4 + 0.6 * light);
      snow.points.geometry.setDrawRange(0, Math.ceil(snow.count * Math.min(1, atmo.snow)));
    }
  });

  return (
    <>
      <primitive object={rain.lines} />
      <primitive object={snow.points} />
    </>
  );
}
