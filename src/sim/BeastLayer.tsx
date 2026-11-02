import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { combat } from './combat';
import { sim } from './simulation';

const MAX_DINOS = 7;
const MAX_DRAGONS = 3;
const MAX_FIRE = 28;

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _colour = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);
const STUN = new THREE.Color(0x4a7bff);

/** instance matrix = base * (position, rotation about an axis, scale). */
function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, axis: THREE.Vector3 | null = null, angle = 0, sx = 1, sy = 1, sz = 1) {
  if (axis) _qa.setFromAxisAngle(axis, angle);
  else _qa.identity();
  _local.compose(_pos.set(x, y, z), _qa, _scale.set(sx, sy, sz));
  _part.multiplyMatrices(_base, _local);
  mesh.setMatrixAt(i, _part);
}

const DINO_COLOUR = { raptor: 0x4f7a3a, rex: 0x7b5230 };
const DINO_BELLY = { raptor: 0xc9d39a, rex: 0xd7b98a };

/** A wing: a thin double-sided membrane from the shoulder out to a tip, pivoting at the shoulder. */
function wingGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, 0.6, 0, 0, -1.8, 3.4, 0.2, 0.2, 3.4, 0.2, 0.2, 0, 0, -1.8, 6.8, 0.5, -1.6, 3.4, 0.2, 0.2, 6.8, 0.5, -1.6, 5.6, 0.5, 0.9]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Daytime threats: raptors and rexes on the ground, dragons overhead, and the fireballs the
 * dragons spit. Each body part is one instanced mesh, so the whole menagerie is a few draw calls.
 */
export function BeastLayer() {
  const body = useRef<THREE.InstancedMesh>(null);
  const belly = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const tail = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const dBody = useRef<THREE.InstancedMesh>(null);
  const dNeck = useRef<THREE.InstancedMesh>(null);
  const dHead = useRef<THREE.InstancedMesh>(null);
  const dTail = useRef<THREE.InstancedMesh>(null);
  const dWings = useRef<THREE.InstancedMesh>(null);
  const dEyes = useRef<THREE.InstancedMesh>(null);
  const fire = useRef<THREE.InstancedMesh>(null);

  const g = useMemo(
    () => ({
      body: new THREE.SphereGeometry(0.5, 14, 10),
      head: new THREE.BoxGeometry(0.3, 0.3, 0.62),
      tail: new THREE.ConeGeometry(0.28, 1.7, 8).rotateX(-Math.PI / 2),
      leg: new THREE.CylinderGeometry(0.09, 0.06, 0.8, 7).translate(0, -0.4, 0),
      dBody: new THREE.SphereGeometry(1, 16, 12),
      dNeck: new THREE.CylinderGeometry(0.34, 0.55, 2.2, 9).translate(0, 1.1, 0),
      dHead: new THREE.BoxGeometry(0.85, 0.6, 1.5),
      dTail: new THREE.ConeGeometry(0.7, 5.5, 9).rotateX(-Math.PI / 2),
      wing: wingGeometry(),
      eye: new THREE.SphereGeometry(0.09, 6, 5),
      fire: new THREE.SphereGeometry(0.42, 10, 8),
    }),
    [],
  );
  const wingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a1616', roughness: 0.8, side: THREE.DoubleSide, emissive: '#2a0808' }), []);
  const fireMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff8a1f', toneMapped: false, transparent: true, opacity: 0.92 }), []);

  useFrame(() => {
    const m = [body, belly, head, tail, legs, dBody, dNeck, dHead, dTail, dWings, dEyes, fire].map((r) => r.current);
    if (m.some((x) => !x)) return;
    const [bod, bel, hed, tai, leg, dbo, dne, dhe, dta, dwi, dey, fir] = m as THREE.InstancedMesh[];

    let n = 0;
    let d = 0;
    for (const mon of combat.monsters) {
      const k = Math.max(0.001, mon.vis);
      const flash = mon.flash;
      const stunned = mon.stun > 0;
      if (mon.kind === 'raptor' || mon.kind === 'rex') {
        if (n >= MAX_DINOS) continue;
        const rex = mon.kind === 'rex';
        const s = (rex ? 2.7 : 1.05) * k;
        const moving = mon.speed > 0.3;
        const swing = moving ? Math.sin(mon.phase * (rex ? 1.2 : 2.6)) : 0;
        _yaw.setFromAxisAngle(UP, mon.heading);
        const sink = mon.state === 'dying' ? (1 - mon.vis) * 0.5 : 0;
        _base.compose(_pos.set(mon.x, Math.max(0, heightAt(mon.x, mon.z)) - sink + (moving ? Math.abs(swing) * 0.05 * s : 0), mon.z), _yaw, _scale.set(s, s, s));
        const lean = mon.state === 'chase' ? 0.18 : 0;
        put(bod, n, 0, 1.0, 0, RIGHT, lean, 0.85, 0.9, 1.7);
        put(bel, n, 0, 0.82, 0.06, RIGHT, lean, 0.7, 0.62, 1.5);
        put(hed, n, 0, 1.45 - lean * 0.4, 1.05 + lean * 0.3, RIGHT, 0.1 + lean, rex ? 1.4 : 1, rex ? 1.3 : 1, rex ? 1.5 : 1);
        const wag = Math.sin(mon.phase * 1.1) * 0.25;
        put(tai, n, 0, 1.0, -0.8, UP, wag, 1, 1, 1);
        for (const side of [-1, 1]) {
          const a = side === -1 ? swing * 0.8 : -swing * 0.8;
          put(leg, n * 2 + (side === 1 ? 1 : 0), side * 0.24, 0.8, 0.05, RIGHT, a, 1, 1, 1);
        }
        _colour.setHex(DINO_COLOUR[mon.kind]);
        if (stunned) _colour.lerp(STUN, 0.7);
        if (flash > 0) _colour.lerp(WHITE, flash * 0.7);
        bod.setColorAt(n, _colour);
        hed.setColorAt(n, _colour);
        tai.setColorAt(n, _colour);
        leg.setColorAt(n * 2, _colour);
        leg.setColorAt(n * 2 + 1, _colour);
        bel.setColorAt(n, _colour.setHex(DINO_BELLY[mon.kind]));
        n++;
      } else if (mon.kind === 'dragon') {
        if (d >= MAX_DRAGONS) continue;
        const s = 1.2 * k;
        _yaw.setFromAxisAngle(UP, mon.heading);
        const bank = Math.sin(sim.time * 0.7 + mon.id) * 0.12;
        const pitch = mon.state === 'chase' ? 0.18 : 0.05;
        _qa.setFromAxisAngle(FORWARD, bank);
        _yaw.multiply(_qa);
        _qa.setFromAxisAngle(RIGHT, pitch);
        _yaw.multiply(_qa);
        _base.compose(_pos.set(mon.x, mon.y + 1.4 * s, mon.z), _yaw, _scale.set(s, s, s));
        put(dbo, d, 0, 0, 0, null, 0, 1.0, 0.95, 2.4);
        put(dne, d, 0, 0.3, 1.9, RIGHT, -0.55, 1, 1, 1);
        put(dhe, d, 0, 1.55, 3.2, RIGHT, 0.12, 1, 1, 1);
        put(dta, d, 0, -0.2, -2.3, UP, Math.sin(mon.phase * 0.9) * 0.3, 1, 1, 1);
        const flap = Math.sin(mon.phase * (mon.state === 'windup' ? 0.6 : 1.7)) * 0.7;
        put(dwi, d * 2, 0.6, 0.5, 0.2, FORWARD, flap, 1, 1, 1);
        put(dwi, d * 2 + 1, -0.6, 0.5, 0.2, FORWARD, -flap, -1, 1, 1);
        put(dey, d * 2, -0.28, 1.72, 3.65);
        put(dey, d * 2 + 1, 0.28, 1.72, 3.65);
        _colour.setHex(0x8a2222);
        if (stunned) _colour.lerp(STUN, 0.7);
        if (flash > 0) _colour.lerp(WHITE, flash * 0.7);
        dbo.setColorAt(d, _colour);
        dne.setColorAt(d, _colour);
        dhe.setColorAt(d, _colour);
        dta.setColorAt(d, _colour);
        _colour.setHex(mon.state === 'windup' ? 0xffd23f : 0xffb000);
        dey.setColorAt(d * 2, _colour);
        dey.setColorAt(d * 2 + 1, _colour);
        d++;
      }
    }
    bod.count = bel.count = hed.count = tai.count = n;
    leg.count = n * 2;
    dbo.count = dne.count = dhe.count = dta.count = d;
    dwi.count = dey.count = d * 2;

    let f = 0;
    for (const b of combat.fireballs) {
      if (f >= MAX_FIRE) break;
      const flicker = 0.8 + Math.random() * 0.5;
      _local.compose(_pos.set(b.x, b.y, b.z), _qa.identity(), _scale.set(flicker, flicker, flicker));
      fir.setMatrixAt(f++, _local);
    }
    fir.count = f;
    fir.visible = f > 0;
    fir.instanceMatrix.needsUpdate = true;

    for (const mesh of [bod, bel, hed, tai, leg, dbo, dne, dhe, dta, dwi, dey]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={body} args={[g.body, undefined, MAX_DINOS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={belly} args={[g.body, undefined, MAX_DINOS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={head} args={[g.head, undefined, MAX_DINOS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={tail} args={[g.tail, undefined, MAX_DINOS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[g.leg, undefined, MAX_DINOS * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>

      <instancedMesh ref={dBody} args={[g.dBody, undefined, MAX_DRAGONS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.7} emissive="#2a0a0a" />
      </instancedMesh>
      <instancedMesh ref={dNeck} args={[g.dNeck, undefined, MAX_DRAGONS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.7} emissive="#2a0a0a" />
      </instancedMesh>
      <instancedMesh ref={dHead} args={[g.dHead, undefined, MAX_DRAGONS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.7} emissive="#2a0a0a" />
      </instancedMesh>
      <instancedMesh ref={dTail} args={[g.dTail, undefined, MAX_DRAGONS]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.7} emissive="#2a0a0a" />
      </instancedMesh>
      <instancedMesh ref={dWings} args={[g.wing, wingMaterial, MAX_DRAGONS * 2]} frustumCulled={false} castShadow />
      <instancedMesh ref={dEyes} args={[g.eye, undefined, MAX_DRAGONS * 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={fire} args={[g.fire, fireMaterial, MAX_FIRE]} frustumCulled={false} visible={false} />
    </>
  );
}
