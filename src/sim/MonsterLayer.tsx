import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { rasterIcon } from '../ui/iconRaster';
import { BeastLayer } from './BeastLayer';
import { combat, type LootKind, type MonsterKind } from './combat';
import { sim } from './simulation';

const MAX_DRAWN = 10;
const MAX_LOOT = 12;
const MAX_EMOTES = 14;

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _colour = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

function setPart(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, tiltX = 0, sx = 1, sy = 1, sz = 1) {
  _tilt.setFromAxisAngle(RIGHT, tiltX);
  _local.compose(_pos.set(x, y, z), _tilt, _scale.set(sx, sy, sz));
  _part.multiplyMatrices(_base, _local);
  mesh.setMatrixAt(index, _part);
}

const BODY_COLOUR: Partial<Record<MonsterKind, number>> = { shade: 0x1a1426, brute: 0x2b1515 };
const EYE_COLOUR: Partial<Record<MonsterKind, number>> = { shade: 0x7de3ff, brute: 0xff3b2e };
const STUN = new THREE.Color(0x4a7bff);
const WHITE = new THREE.Color(0xffffff);

/**
 * The monsters of the night: tall hunched "shades" with glowing eyes and heavy "brutes".
 * One instanced mesh per body part keeps the whole horde to a few draw calls.
 */
function Monsters() {
  const body = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const eyes = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const claws = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(
    () => ({
      body: new THREE.CylinderGeometry(0.26, 0.18, 0.95, 9),
      head: new THREE.SphereGeometry(0.17, 12, 10),
      eye: new THREE.SphereGeometry(0.03, 6, 5),
      arm: new THREE.CylinderGeometry(0.06, 0.04, 1.0, 7).translate(0, -0.5, 0),
      claw: new THREE.ConeGeometry(0.06, 0.34, 6).translate(0, -0.17, 0).rotateX(Math.PI),
      leg: new THREE.CylinderGeometry(0.09, 0.05, 0.9, 7).translate(0, -0.45, 0),
    }),
    [],
  );

  useFrame(() => {
    const parts = [body, head, eyes, arms, claws, legs].map((r) => r.current);
    if (parts.some((p) => !p)) return;
    const [bod, hed, eye, arm, cla, leg] = parts as THREE.InstancedMesh[];
    let n = 0;
    for (const m of combat.monsters) {
      if (n >= MAX_DRAWN) break;
      if (m.kind !== 'shade' && m.kind !== 'brute') continue;
      const brute = m.kind === 'brute';
      const k = (brute ? 1.5 : 1.12) * Math.max(0.001, m.vis);
      const wide = brute ? 1.45 : 0.85;
      const moving = m.speed > 0.3;
      const swing = moving ? Math.sin(m.phase * (brute ? 1.5 : 2.2)) : 0;
      const chasing = m.state === 'chase';
      const windup = m.state === 'windup';
      const lean = windup ? 0.2 : chasing ? 0.62 : 0.32;
      const sink = m.state === 'dying' ? (1 - m.vis) * 0.6 : 0;

      _yaw.setFromAxisAngle(UP, m.heading);
      _base.compose(_pos.set(m.x, Math.max(0, heightAt(m.x, m.z)) - sink + (moving ? Math.abs(swing) * 0.05 : 0), m.z), _yaw, _scale.set(k, k, k));

      const hipY = 0.85;
      setPart(bod, n, 0, hipY + 0.45, 0.18, lean, wide, 1, 0.8);
      const headY = hipY + 0.98 - lean * 0.15;
      setPart(hed, n, 0, headY, 0.22 + lean * 0.5, lean * 0.4, 0.9, 1.2, 1);
      setPart(eye, n * 2, -0.07, headY + 0.03, 0.22 + lean * 0.5 + 0.14);
      setPart(eye, n * 2 + 1, 0.07, headY + 0.03, 0.22 + lean * 0.5 + 0.14);
      // Long arms dangle and swing; raised in a strike.
      let a = chasing ? -0.6 + swing * 0.7 : swing * 0.5;
      let b = chasing ? -0.6 - swing * 0.7 : -swing * 0.5;
      if (windup) {
        const t = 1 - Math.max(0, m.timer) / (brute ? 0.6 : 0.4);
        a = b = -2.9 + t * 3.8;
      }
      const shoulder = hipY + 0.82;
      const armLen = brute ? 1.0 : 1.15;
      for (const side of [-1, 1]) {
        const ang = side === -1 ? a : b;
        const i = n * 2 + (side === 1 ? 1 : 0);
        setPart(arm, i, side * (0.26 * wide + 0.04), shoulder, 0.1 + lean * 0.3, ang, 1, armLen, 1);
        setPart(cla, i, side * (0.26 * wide + 0.04), shoulder - armLen * Math.cos(ang), 0.1 + lean * 0.3 - armLen * Math.sin(ang), ang, 1.2, 1.2, 1.2);
        const legAng = side === -1 ? swing * 0.7 : -swing * 0.7;
        setPart(leg, i, side * 0.12 * wide, hipY, 0, legAng, 1, 1, 1);
      }

      // Colours: dark body, pulsing eyes, white flash on a hit, blue when stunned.
      _colour.setHex(BODY_COLOUR[m.kind] ?? 0x1a1426);
      if (m.stun > 0) _colour.lerp(STUN, 0.7);
      if (m.flash > 0) _colour.lerp(WHITE, m.flash * 0.7);
      bod.setColorAt(n, _colour);
      hed.setColorAt(n, _colour);
      for (let i = n * 2; i < n * 2 + 2; i++) {
        arm.setColorAt(i, _colour);
        leg.setColorAt(i, _colour);
        cla.setColorAt(i, _colour.setHex(0x050407));
      }
      _colour.setHex(m.stun > 0 ? 0x3355ff : (EYE_COLOUR[m.kind] ?? 0x7de3ff));
      if (m.alert > 0.05) _colour.multiplyScalar(0.6 + m.alert * 0.8);
      eye.setColorAt(n * 2, _colour);
      eye.setColorAt(n * 2 + 1, _colour);
      n++;
    }
    bod.count = hed.count = n;
    eye.count = arm.count = cla.count = leg.count = n * 2;
    for (const mesh of [bod, hed, eye, arm, cla, leg]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={body} args={[geometry.body, undefined, MAX_DRAWN]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.9} metalness={0.1} emissive="#1c1130" />
      </instancedMesh>
      <instancedMesh ref={head} args={[geometry.head, undefined, MAX_DRAWN]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} emissive="#1c1130" />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[geometry.eye, undefined, MAX_DRAWN * 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[geometry.arm, undefined, MAX_DRAWN * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} emissive="#1c1130" />
      </instancedMesh>
      <instancedMesh ref={claws} args={[geometry.claw, undefined, MAX_DRAWN * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[geometry.leg, undefined, MAX_DRAWN * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.9} emissive="#1c1130" />
      </instancedMesh>
    </>
  );
}

const LOOT_COLOUR: Record<LootKind, number> = {
  cash: 0x3ddc84,
  medkit: 0xff4d5e,
  ammo: 0xffd23f,
  pistol: 0x35e0ff,
  shotgun: 0x35e0ff,
  taser: 0x35e0ff,
  bat: 0x35e0ff,
};

/** Things to pick up: cash, medkits, ammo and weapons, each a bobbing gem with a light column. */
function LootLayer() {
  const gems = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const gemGeometry = useMemo(() => new THREE.OctahedronGeometry(0.3, 0), []);
  const beamGeometry = useMemo(() => new THREE.CylinderGeometry(0.1, 0.1, 5, 8, 1, true).translate(0, 2.5, 0), []);
  const beamMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
    [],
  );

  useFrame(() => {
    const g = gems.current;
    const b = beams.current;
    if (!g || !b) return;
    let n = 0;
    for (const l of combat.loot) {
      if (n >= MAX_LOOT) break;
      const y = Math.max(0, heightAt(l.x, l.z));
      _yaw.setFromAxisAngle(UP, sim.time * 1.8 + l.id);
      _base.compose(_pos.set(l.x, y + 0.9 + Math.sin(sim.time * 2.4 + l.id) * 0.12, l.z), _yaw, _scale.set(1, 1.25, 1));
      g.setMatrixAt(n, _base);
      _colour.setHex(LOOT_COLOUR[l.kind]);
      g.setColorAt(n, _colour);
      _base.compose(_pos.set(l.x, y, l.z), _yaw.identity(), _scale.set(1, 1, 1));
      b.setMatrixAt(n, _base);
      b.setColorAt(n, _colour);
      n++;
    }
    g.count = b.count = n;
    g.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={gems} args={[gemGeometry, undefined, MAX_LOOT]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={beams} args={[beamGeometry, beamMaterial, MAX_LOOT]} frustumCulled={false} renderOrder={4} />
    </>
  );
}

/** Emoji speech bubbles above people's heads: anger, fear, chat. */
function Emotes() {
  const sprites = useMemo(() => {
    const cache = new Map<string, THREE.SpriteMaterial>();
    const material = (emoji: string) => {
      let m = cache.get(emoji);
      if (!m) {
        const map = new THREE.CanvasTexture(rasterIcon(emoji, 96, () => (map.needsUpdate = true)));
        map.colorSpace = THREE.SRGBColorSpace;
        m = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
        cache.set(emoji, m);
      }
      return m;
    };
    const list = Array.from({ length: MAX_EMOTES }, () => {
      const s = new THREE.Sprite();
      s.visible = false;
      s.renderOrder = 8;
      return s;
    });
    return { list, material };
  }, []);

  useFrame(() => {
    let i = 0;
    for (const p of sim.peds) {
      if (i >= MAX_EMOTES) break;
      if (!p.emote || p.vis < 0.5 || p.state === 'inside') continue;
      if (Math.hypot(p.x - sim.player.x, p.z - sim.player.z) > 70) continue;
      const s = sprites.list[i++];
      s.visible = true;
      s.material = sprites.material(p.emote);
      const bounce = Math.sin(sim.time * 8 + p.id) * 0.04;
      s.position.set(p.x, Math.max(0, heightAt(p.x, p.z)) + (p.fall > 0.5 ? 0.9 : 2.15 + (p.height - 1)) + bounce, p.z);
      const grow = Math.min(1, p.emoteTimer * 4);
      s.scale.setScalar(0.55 * Math.max(0.4, grow));
    }
    for (; i < MAX_EMOTES; i++) sprites.list[i].visible = false;
  });

  return (
    <>
      {sprites.list.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </>
  );
}

export function MonsterLayer() {
  return (
    <>
      <Monsters />
      <BeastLayer />
      <LootLayer />
      <Emotes />
    </>
  );
}
