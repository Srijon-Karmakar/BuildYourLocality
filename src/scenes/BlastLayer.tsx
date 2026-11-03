import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { TreeModel } from '../city/TreeModel';
import { blast, type Falling } from '../sim/blast';
import { useGameStore } from '../state/useGameStore';
import { hasTerrain, heightAt } from '../terrain/terrain';
import { atmo } from './atmosphere';

const MAX_PUFFS = 720;
const MAX_CHUNKS = 260;
const MAX_RUBBLE = 360;
const MAX_SCARS = 40;
const SCAR_GRID = 12;

const groundAt = (x: number, z: number) => (hasTerrain() ? Math.max(heightAt(x, z), 0) : 0);

// --- Soft round particles ------------------------------------------------------------------------

const puffVertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 0.001);
    vColor = aColor;
    // Fade out right in front of the camera so a plume never fills the whole screen.
    vColor.a *= smoothstep(0.8, 5.0, depth);
    gl_PointSize = min(aSize * uScale / depth, 900.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const puffFragment = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

function makePoints(additive: boolean) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PUFFS * 3), 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_PUFFS * 4), 4));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_PUFFS), 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const material = new THREE.ShaderMaterial({
    vertexShader: puffVertex,
    fragmentShader: puffFragment,
    uniforms: { uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = additive ? 8 : 7;
  return points;
}

// --- Scorch marks that follow the ground ---------------------------------------------------------------

const scarVertex = /* glsl */ `
  attribute vec2 aLocal;
  attribute float aFade;
  varying vec2 vL;
  varying float vF;
  void main() {
    vL = aLocal;
    vF = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const scarFragment = /* glsl */ `
  varying vec2 vL;
  varying float vF;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float d = length(vL);
    float edge = 1.0 - 0.4 * hash(floor(vL * 6.5));
    float a = smoothstep(edge, 0.12, d);
    gl_FragColor = vec4(vec3(0.045, 0.035, 0.028), a * vF * 0.88);
  }
`;

function makeScarMesh() {
  const verts = MAX_SCARS * (SCAR_GRID + 1) ** 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  geometry.setAttribute('aLocal', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
  geometry.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(verts), 1));
  const index: number[] = [];
  const per = (SCAR_GRID + 1) ** 2;
  for (let k = 0; k < MAX_SCARS; k++) {
    for (let i = 0; i < SCAR_GRID; i++) {
      for (let j = 0; j < SCAR_GRID; j++) {
        const a = k * per + i * (SCAR_GRID + 1) + j;
        const b = a + 1;
        const c = a + SCAR_GRID + 1;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  }
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const material = new THREE.ShaderMaterial({ vertexShader: scarVertex, fragmentShader: scarFragment, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// --- Falling trees -------------------------------------------------------------------------------------

const ease = (t: number) => t * t * (3 - 2 * t);

/** One tree torn out of the ground: it lifts, tips over away from the blast, lies a while, then sinks away. */
function FallingTree({ f }: { f: Falling }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const t = Math.max(0, f.t);
    const fall = Math.min(1, t / (1.1 + (1 - f.force) * 0.5));
    const tilt = fall * fall * (1.25 + f.force * 0.25);
    const slide = ease(Math.min(1, t / 1.6)) * (2 + f.force * 7);
    const sink = f.life - 1.8;
    const k = t > sink ? Math.max(0, 1 - (t - sink) / 1.8) : 1;
    o.position.set(f.x + f.dx * slide, groundAt(f.x, f.z) + Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.5 * f.force, f.z + f.dz * slide);
    o.rotation.y = Math.atan2(f.dx, f.dz);
    i.rotation.x = tilt;
    o.scale.setScalar(k * f.scale);
    o.visible = f.t > -1;
  });
  return (
    <group ref={outer}>
      <group ref={inner}>
        <TreeModel type={f.type} seed={f.seed} accent={f.accent} spec={f.tree} />
      </group>
    </group>
  );
}

// --- The layer -----------------------------------------------------------------------------------------

const matrix = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();
const colour = new THREE.Color();

/** Draws bombs, explosions, fire, smoke, debris, rubble, scorch marks and fallen trees (sim/blast.ts holds the state). */
export function BlastLayer() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const smoke = useMemo(() => makePoints(false), []);
  const glow = useMemo(() => makePoints(true), []);
  const scarMesh = useMemo(() => makeScarMesh(), []);
  const [falling, setFalling] = useState<Falling[]>([]);
  const seenFalling = useRef(-1);
  const scarKey = useRef('');

  const bombMesh = useRef<THREE.InstancedMesh>(null);
  const chunkMesh = useRef<THREE.InstancedMesh>(null);
  const rubbleMesh = useRef<THREE.InstancedMesh>(null);
  const ringMesh = useRef<THREE.InstancedMesh>(null);

  useEffect(
    () => () => {
      for (const o of [smoke, glow, scarMesh]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [smoke, glow, scarMesh],
  );

  useFrame((_, dt) => {
    const idle = !blast.busy && blast.chunks.length === 0 && blast.rubble.length === 0 && blast.scars.length === 0 && blast.falling.length === 0;
    if (idle) {
      smoke.visible = glow.visible = scarMesh.visible = false;
      for (const m of [bombMesh, chunkMesh, rubbleMesh, ringMesh]) if (m.current) m.current.count = 0;
      return;
    }
    blast.update(dt);

    // Camera shake while the ground still rumbles.
    if (blast.shake > 0.01 && useGameStore.getState().mode === 'roam') {
      const k = blast.shake * blast.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * k;
      camera.position.y += (Math.random() - 0.5) * k;
      camera.position.z += (Math.random() - 0.5) * k;
    }

    // Trees being torn up: redraw the list only when it changes.
    if (seenFalling.current !== blast.fallingVersion) {
      seenFalling.current = blast.fallingVersion;
      setFalling([...blast.falling]);
    }

    // --- Particles ---
    const night = 1 - 0.62 * atmo.lamps;
    const scale = (size.height * (window.devicePixelRatio || 1)) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const [points, add] of [[smoke, false], [glow, true]] as const) {
      const p = points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const c = points.geometry.getAttribute('aColor') as THREE.BufferAttribute;
      const s = points.geometry.getAttribute('aSize') as THREE.BufferAttribute;
      let n = 0;
      for (const q of blast.puffs) {
        if (q.add !== add || n >= MAX_PUFFS) continue;
        const f = 1 - q.life / q.max;
        const fade = Math.min(1, f * 7) * (1 - f) ** (add ? 1.4 : 1);
        p.setXYZ(n, q.x, q.y, q.z);
        s.setX(n, q.s0 + (q.s1 - q.s0) * f);
        const dim = add ? 1 : night;
        c.setXYZW(n, q.r * dim, q.g * dim, q.b * dim, q.a * fade);
        n++;
      }
      p.needsUpdate = c.needsUpdate = s.needsUpdate = true;
      points.geometry.setDrawRange(0, n);
      points.visible = n > 0;
      (points.material as THREE.ShaderMaterial).uniforms.uScale.value = scale;
    }

    // --- Bombs in the air ---
    const bm = bombMesh.current;
    if (bm) {
      bm.count = blast.bombs.length;
      blast.bombs.forEach((b, i) => {
        matrix.makeTranslation(b.x, b.y, b.z);
        bm.setMatrixAt(i, matrix);
      });
      bm.instanceMatrix.needsUpdate = true;
    }

    // --- Debris ---
    const cm = chunkMesh.current;
    if (cm) {
      const n = Math.min(blast.chunks.length, MAX_CHUNKS);
      cm.count = n;
      for (let i = 0; i < n; i++) {
        const q = blast.chunks[i];
        euler.set(q.rx, q.ry, q.rx * 0.5);
        quat.setFromEuler(euler);
        const shrink = q.life < 0.8 ? Math.max(0, q.life / 0.8) : 1;
        matrix.compose(pos.set(q.x, q.y, q.z), quat, scl.setScalar(q.size * shrink));
        cm.setMatrixAt(i, matrix);
        cm.setColorAt(i, colour.setHex(q.colour));
      }
      cm.instanceMatrix.needsUpdate = true;
      if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    }

    // --- Rubble: a heap that rises as the building falls, then slowly sinks into the ground ---
    const rm = rubbleMesh.current;
    if (rm) {
      const n = Math.min(blast.rubble.length, MAX_RUBBLE);
      rm.count = n;
      for (let i = 0; i < n; i++) {
        const r = blast.rubble[i];
        const age = blast.time - r.born;
        const grow = Math.min(1, Math.max(0, age / 0.7));
        const left = r.life - age;
        const k = grow * (left < 10 ? Math.max(0, left / 10) : 1);
        euler.set(0.12 * Math.sin(i), r.ry, 0.1 * Math.cos(i * 1.7));
        quat.setFromEuler(euler);
        const h = Math.max(0.001, r.sy * k);
        matrix.compose(pos.set(r.x, groundAt(r.x, r.z) + h * 0.45, r.z), quat, scl.set(r.sx, h, r.sz));
        rm.setMatrixAt(i, matrix);
        rm.setColorAt(i, colour.setHex(r.colour).multiplyScalar(0.55 + 0.35 * ((i * 37) % 10) / 10));
      }
      rm.instanceMatrix.needsUpdate = true;
      if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
    }

    // --- Shock rings ---
    const ring = ringMesh.current;
    if (ring) {
      ring.count = Math.min(4, blast.waves.length);
      for (let i = 0; i < ring.count; i++) {
        const w = blast.waves[i];
        const radius = Math.max(0.5, w.age * 95);
        const a = Math.max(0, 1 - w.age / 0.55);
        euler.set(-Math.PI / 2, 0, 0);
        quat.setFromEuler(euler);
        matrix.compose(pos.set(w.x, groundAt(w.x, w.z) + 0.6, w.z), quat, scl.set(radius, radius, radius));
        ring.setMatrixAt(i, matrix);
        ring.setColorAt(i, colour.setRGB(a, a * 0.85, a * 0.6));
      }
      ring.instanceMatrix.needsUpdate = true;
      if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
    }

    // --- Scorch marks laid on the ground ---
    const scars = blast.scars;
    scarMesh.visible = scars.length > 0;
    if (scars.length > 0) {
      const key = scars.map((s) => `${s.x}|${s.z}|${s.r}`).join(',');
      const p = scarMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const l = scarMesh.geometry.getAttribute('aLocal') as THREE.BufferAttribute;
      const f = scarMesh.geometry.getAttribute('aFade') as THREE.BufferAttribute;
      const rebuild = key !== scarKey.current;
      scarKey.current = key;
      const per = (SCAR_GRID + 1) ** 2;
      scars.forEach((s, k) => {
        const fade = Math.min(1, s.age * 3) * Math.max(0, 1 - s.age / s.life) ** 1.3 * s.dark;
        for (let i = 0; i <= SCAR_GRID; i++) {
          for (let j = 0; j <= SCAR_GRID; j++) {
            const v = k * per + i * (SCAR_GRID + 1) + j;
            const u = (i / SCAR_GRID) * 2 - 1;
            const w = (j / SCAR_GRID) * 2 - 1;
            if (rebuild) {
              const x = s.x + u * s.r;
              const z = s.z + w * s.r;
              p.setXYZ(v, x, groundAt(x, z) + 0.07, z);
              l.setXY(v, u, w);
            }
            f.setX(v, fade);
          }
        }
      });
      if (rebuild) {
        p.needsUpdate = true;
        l.needsUpdate = true;
      }
      f.needsUpdate = true;
      scarMesh.geometry.setDrawRange(0, scars.length * SCAR_GRID * SCAR_GRID * 6);
    }
  });

  return (
    <>
      <primitive object={scarMesh} />
      <primitive object={smoke} />
      <primitive object={glow} />
      <instancedMesh ref={bombMesh} args={[undefined, undefined, 8]} frustumCulled={false}>
        <sphereGeometry args={[0.28, 10, 8]} />
        <meshStandardMaterial color="#25272b" roughness={0.5} metalness={0.7} emissive="#ff6a1a" emissiveIntensity={0.6} />
      </instancedMesh>
      <instancedMesh ref={chunkMesh} args={[undefined, undefined, MAX_CHUNKS]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={rubbleMesh} args={[undefined, undefined, MAX_RUBBLE]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      <instancedMesh ref={ringMesh} args={[undefined, undefined, 4]} frustumCulled={false}>
        <ringGeometry args={[0.9, 1, 96]} />
        <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      {falling.map((f) => (
        <FallingTree key={f.id} f={f} />
      ))}
    </>
  );
}
