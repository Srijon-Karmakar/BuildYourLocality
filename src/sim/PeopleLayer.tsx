import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { MAX_PEOPLE, sim, type Ped } from './simulation';

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _lie = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _colour = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const ANGRY = new THREE.Color(0xe0453a);
const WHITE = new THREE.Color(0xffffff);
const SHOE = new THREE.Color(0x1d1f24);

/** instance matrix = base * (position, rotation about x, scale). */
function setPart(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, tiltX = 0, sx = 1, sy = 1, sz = 1) {
  _tilt.setFromAxisAngle(RIGHT, tiltX);
  _local.compose(_pos.set(x, y, z), _tilt, _scale.set(sx, sy, sz));
  _part.multiplyMatrices(_base, _local);
  mesh.setMatrixAt(index, _part);
}

/** Colour of a body part, reddened by anger and flashed white when hit. */
function tint(hex: number, anger: number, flash: number): THREE.Color {
  _colour.setHex(hex);
  if (anger > 0) _colour.lerp(ANGRY, anger);
  if (flash > 0) _colour.lerp(WHITE, flash * 0.8);
  return _colour;
}

const HIP = 0.8;
const LEG = 0.78;
const ARM = 0.6;

/**
 * Everyone in the city, drawn with a handful of instanced meshes. People have hair, faces,
 * hands and shoes, some wear coats or carry backpacks, and their body language shows what they
 * are doing: chatting, running scared, cowering, throwing a punch or lying knocked out.
 */
export function PeopleLayer() {
  const torso = useRef<THREE.InstancedMesh>(null);
  const head = useRef<THREE.InstancedMesh>(null);
  const hair = useRef<THREE.InstancedMesh>(null);
  const eyes = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const hands = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const shoes = useRef<THREE.InstancedMesh>(null);
  const bags = useRef<THREE.InstancedMesh>(null);
  const hats = useRef<THREE.InstancedMesh>(null);
  const gear = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(
    () => ({
      torso: new THREE.CylinderGeometry(0.2, 0.165, 0.6, 10),
      head: new THREE.SphereGeometry(0.12, 14, 12),
      hair: new THREE.SphereGeometry(0.133, 12, 10),
      eye: new THREE.SphereGeometry(0.017, 6, 5),
      arm: new THREE.CylinderGeometry(0.058, 0.046, ARM, 8).translate(0, -ARM / 2, 0),
      hand: new THREE.SphereGeometry(0.048, 8, 6),
      leg: new THREE.CylinderGeometry(0.078, 0.06, LEG, 8).translate(0, -LEG / 2, 0),
      shoe: new THREE.BoxGeometry(0.11, 0.075, 0.25).translate(0, 0, 0.04),
      bag: new THREE.BoxGeometry(0.3, 0.36, 0.13),
      hat: new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      gear: new THREE.BoxGeometry(0.34, 0.24, 0.3),
    }),
    [],
  );

  // The shoes and eyes never change colour, so set it once.
  useEffect(() => {
    if (shoes.current) {
      for (let i = 0; i < MAX_PEOPLE * 2; i++) shoes.current.setColorAt(i, SHOE);
      if (shoes.current.instanceColor) shoes.current.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame(() => {
    const parts = [torso, head, hair, eyes, arms, hands, legs, shoes, bags, hats, gear].map((r) => r.current);
    if (parts.some((p) => !p)) return;
    const [tor, hed, hai, eye, arm, han, leg, sho, bag, hat, gea] = parts as THREE.InstancedMesh[];
    const peds = sim.peds;
    let n = 0;
    let bagCount = 0;
    let hatCount = 0;
    let gearCount = 0;
    for (const p of peds) {
      if (n >= MAX_PEOPLE) break;
      if (p.vis <= 0.01 && p.state === 'inside') continue;
      const used = drawPerson(p, n, { tor, hed, hai, eye, arm, han, leg, sho, bag, hat, gea }, bagCount, hatCount, gearCount);
      if (p.bag) bagCount++;
      if (used.hat) hatCount++;
      if (used.gear) gearCount++;
      n++;
    }
    tor.count = hed.count = hai.count = n;
    eye.count = n * 2;
    arm.count = han.count = leg.count = sho.count = n * 2;
    bag.count = bagCount;
    hat.count = hatCount;
    gea.count = gearCount;
    for (const mesh of [tor, hed, hai, eye, arm, han, leg, sho, bag, hat, gea]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={torso} args={[geometry.torso, undefined, MAX_PEOPLE]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={head} args={[geometry.head, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[geometry.hair, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[geometry.eye, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshBasicMaterial color="#14161a" />
      </instancedMesh>
      <instancedMesh ref={arms} args={[geometry.arm, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={hands} args={[geometry.hand, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[geometry.leg, undefined, MAX_PEOPLE * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={shoes} args={[geometry.shoe, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={bags} args={[geometry.bag, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={hats} args={[geometry.hat, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={gear} args={[geometry.gear, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}

interface Meshes {
  tor: THREE.InstancedMesh;
  hed: THREE.InstancedMesh;
  hai: THREE.InstancedMesh;
  eye: THREE.InstancedMesh;
  arm: THREE.InstancedMesh;
  han: THREE.InstancedMesh;
  leg: THREE.InstancedMesh;
  sho: THREE.InstancedMesh;
  bag: THREE.InstancedMesh;
  hat: THREE.InstancedMesh;
  gea: THREE.InstancedMesh;
}

function drawPerson(p: Ped, n: number, m: Meshes, bagIndex: number, hatIndex: number, gearIndex: number): { hat: boolean; gear: boolean } {
  const sitting = p.state === 'sitting';
  const cowering = p.state === 'cowering';
  const down = p.state === 'down';
  const moving = p.speed > 0.2 && !down;
  const running = moving && p.speed > 3.2;

  // Leg swing; running swings further and the arms pump.
  const swing = moving ? Math.sin(p.phase * 2) * (running ? 1.05 : 0.75) : 0;
  const bob = moving ? Math.abs(Math.sin(p.phase * 2)) * (running ? 0.07 : 0.035) : 0;
  const drop = sitting ? -0.32 : cowering ? -0.38 : 0;
  const s = Math.max(0.001, p.vis) * p.height;
  const lean = running ? 0.18 : cowering ? 0.5 : 0;

  // Body frame: face the heading; knocked-down people tip over onto their back.
  _yaw.setFromAxisAngle(UP, p.heading);
  if (p.fall > 0) {
    _lie.setFromAxisAngle(RIGHT, -p.fall * (Math.PI / 2));
    _yaw.multiply(_lie);
  }
  const ground = Math.max(0, heightAt(p.x, p.z));
  _base.compose(_pos.set(p.x, ground + bob + p.fall * 0.14, p.z), _yaw, _scale.set(s, s, s));

  const anger = Math.min(0.8, (p.rage / 100) * 0.9);
  const flash = p.flash;
  const hipY = HIP + drop;

  // Torso (longer for coats) leaning forward when running.
  const coat = p.coat ? 1.3 : 1;
  setPart(m.tor, n, 0, hipY + 0.3 * coat - (coat - 1) * 0.25, lean * 0.2, lean, 1, coat, 0.64);
  m.tor.setColorAt(n, tint(p.shirt, anger * 0.3, flash));

  // Head, hair, eyes.
  const headY = hipY + 0.78 + (cowering ? -0.04 : 0);
  const headZ = lean * 0.45;
  setPart(m.hed, n, 0, headY, headZ, 0, 0.92, 1.1, 1);
  m.hed.setColorAt(n, tint(p.skin, anger, flash));
  const style = p.hairStyle;
  if (style === 0) setPart(m.hai, n, 0, headY + 0.05, headZ - 0.01, 0, 0.001, 0.001, 0.001);
  else if (style === 1) setPart(m.hai, n, 0, headY + 0.06, headZ - 0.012, 0, 0.98, 0.6, 1.0);
  else if (style === 2) setPart(m.hai, n, 0, headY + 0.045, headZ - 0.01, 0, 1.0, 0.88, 1.02);
  else setPart(m.hai, n, 0, headY - 0.01, headZ - 0.04, 0, 1.02, 1.25, 1.1);
  m.hai.setColorAt(n, tint(p.hair, 0, flash * 0.5));
  setPart(m.eye, n * 2, -0.045, headY + 0.015, headZ + 0.1);
  setPart(m.eye, n * 2 + 1, 0.045, headY + 0.015, headZ + 0.1);

  // Legs and shoes.
  const legA = sitting ? -Math.PI / 2 : cowering ? 0 : swing;
  const legB = sitting ? -Math.PI / 2 : cowering ? 0 : -swing;
  const placeLeg = (side: number, a: number, i: number) => {
    setPart(m.leg, i, side * 0.1, hipY, 0, a);
    m.leg.setColorAt(i, tint(p.pants, 0, flash));
    setPart(m.sho, i, side * 0.1, hipY - LEG * Math.cos(a), -LEG * Math.sin(a), a);
  };
  placeLeg(-1, legA, n * 2);
  placeLeg(1, legB, n * 2 + 1);

  // Arms: depends on what they are doing.
  const shoulderY = hipY + 0.55;
  let leftA = -swing * 0.8;
  let rightA = swing * 0.8;
  if (running) {
    leftA = -swing * 1.1 - 0.5;
    rightA = swing * 1.1 - 0.5;
  }
  if (p.state === 'greeting') rightA = -2.6 + Math.sin(sim.time * 11) * 0.4;
  if (p.state === 'chatting') rightA = -0.9 + Math.sin(sim.time * 5 + p.id) * 0.6 * (Math.sin(sim.time * 1.3 + p.id) > 0 ? 1 : 0.2);
  if (cowering) {
    leftA = -2.7;
    rightA = -2.7;
  }
  if (p.state === 'mugging') {
    rightA = -1.5;
    leftA = -0.3;
  }
  if (p.state === 'down') {
    leftA = -0.4;
    rightA = 0.5;
  }
  if (p.swing > 0.01) rightA = -1.9 * Math.sin(Math.min(1, 1 - p.swing) * Math.PI);
  const hammering = p.job === 'builder' && p.tool && p.state === 'busy';
  if (hammering) rightA = -1.3 + Math.sin(p.phase * 2.2) * 0.9;
  if (p.job === 'builder' && p.carrying) {
    leftA = -1.2;
    rightA = -1.2;
  }
  if (p.armed && p.state === 'chasing') rightA = -1.55 + p.swing * 0.35;
  else if (p.state === 'chasing' && p.swing <= 0.01) rightA = -0.9 + Math.sin(sim.time * 12 + p.id) * 0.25; // fists up
  const placeArm = (side: number, a: number, i: number) => {
    setPart(m.arm, i, side * 0.26, shoulderY, 0.0, a);
    m.arm.setColorAt(i, tint(p.shirt, anger * 0.3, flash));
    setPart(m.han, i, side * 0.26, shoulderY - ARM * Math.cos(a), -ARM * Math.sin(a), 0);
    m.han.setColorAt(i, tint(p.skin, anger, flash));
  };
  placeArm(-1, leftA, n * 2);
  placeArm(1, rightA, n * 2 + 1);

  // Backpack.
  if (p.bag) {
    setPart(m.bag, bagIndex, 0, hipY + 0.34, -0.17, 0);
    m.bag.setColorAt(bagIndex, tint(p.bagColour, 0, flash * 0.5));
  }

  // Hard hat and whatever the builder is carrying.
  let gear = false;
  if (p.hardHat) {
    setPart(m.hat, hatIndex, 0, headY + 0.06, headZ, 0, 1, 1, 1);
    m.hat.setColorAt(hatIndex, tint(p.hatColour, 0, flash * 0.5));
  }
  if (p.armed && p.state !== 'down') {
    setPart(m.gea, gearIndex, 0.26, shoulderY - ARM * Math.cos(rightA), -ARM * Math.sin(rightA) + 0.14, 0, 0.26, 0.4, 1.5);
    m.gea.setColorAt(gearIndex, tint(0x23262c, 0, flash * 0.5));
    gear = true;
  } else if (p.job === 'builder' && p.carrying) {
    setPart(m.gea, gearIndex, 0, hipY + 0.5, 0.36, 0);
    m.gea.setColorAt(gearIndex, tint(0xb98d55, 0, 0));
    gear = true;
  }
  return { hat: p.hardHat, gear };
}
