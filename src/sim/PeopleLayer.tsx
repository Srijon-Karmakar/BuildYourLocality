import { useFrame } from '@react-three/fiber';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore } from '../state/useGameStore';
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

const MAX_DOGS = 14;
const COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
/** Head size multiplier and whether some people wear caps: set each frame from the look. */
let HEAD_K = 1;
let CAPS = false;
const DOG_COLOURS = [0xd9923a, 0xf2e6d0, 0x6b4a32, 0x2b2b2e, 0xc9a26b];

/** A little low-poly dog along +z: body, head, snout, tail and four legs. */
function buildDog(): THREE.BufferGeometry {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const tail = new THREE.BoxGeometry(0.06, 0.06, 0.24).rotateX(-0.6).translate(0, 0.43, -0.36);
  return mergeGeometries([
    part(0.26, 0.24, 0.56, 0, 0.34, 0),
    part(0.2, 0.2, 0.2, 0, 0.45, 0.33),
    part(0.11, 0.09, 0.12, 0, 0.42, 0.46),
    part(0.05, 0.1, 0.04, -0.07, 0.58, 0.31),
    part(0.05, 0.1, 0.04, 0.07, 0.58, 0.31),
    tail,
    part(0.07, 0.24, 0.07, -0.09, 0.12, 0.2),
    part(0.07, 0.24, 0.07, 0.09, 0.12, 0.2),
    part(0.07, 0.24, 0.07, -0.09, 0.12, -0.2),
    part(0.07, 0.24, 0.07, 0.09, 0.12, -0.2),
  ])!;
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
  const stylised = useGameStore((s) => s.graphics.stylised);
  const rich = stylised && !COARSE;
  const dogs = useRef<THREE.InstancedMesh>(null);
  const pets = useRef(new Map<number, { x: number; z: number; h: number }>());
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

  const dogGeometry = useMemo(buildDog, []);
  // The stylised look: faceted, chunky bodies, bigger heads and spiky hair instead of smooth rounded ones.
  const geometry = useMemo(
    () =>
      stylised
        ? {
            torso: new THREE.CylinderGeometry(0.23, 0.18, 0.6, 6),
            head: new THREE.IcosahedronGeometry(0.125, 0),
            hair: new THREE.IcosahedronGeometry(0.15, 0),
            eye: new THREE.SphereGeometry(0.017, 6, 5),
            arm: new THREE.CylinderGeometry(0.065, 0.052, ARM, 5).translate(0, -ARM / 2, 0),
            hand: new THREE.IcosahedronGeometry(0.05, 0),
            leg: new THREE.CylinderGeometry(0.085, 0.065, LEG, 5).translate(0, -LEG / 2, 0),
            shoe: new THREE.BoxGeometry(0.13, 0.09, 0.27).translate(0, 0, 0.05),
            bag: new THREE.BoxGeometry(0.34, 0.4, 0.16),
            hat: new THREE.SphereGeometry(0.15, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            gear: new THREE.BoxGeometry(0.34, 0.24, 0.3),
          }
        : {
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
          },
    [stylised],
  );

  // The shoes and eyes never change colour, so set it once.
  useEffect(() => {
    if (shoes.current) {
      for (let i = 0; i < MAX_PEOPLE * 2; i++) shoes.current.setColorAt(i, SHOE);
      if (shoes.current.instanceColor) shoes.current.instanceColor.needsUpdate = true;
    }
  }, [stylised]);

  useFrame((_, delta) => {
    HEAD_K = stylised ? 1.14 : 1;
    CAPS = rich;
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
    // Desktop, stylised look: every sixth person walks a dog that trots along beside them.
    const dog = dogs.current;
    if (dog) {
      let nd = 0;
      const seen = new Set<number>();
      if (rich) {
        const k = Math.min(1, delta * 5);
        for (const p of peds) {
          if (nd >= MAX_DOGS) break;
          if (p.id % 6 !== 0 || p.vis < 0.5 || p.state === 'inside' || p.state === 'down' || p.state === 'entering') continue;
          const sinH = Math.sin(p.heading);
          const cosH = Math.cos(p.heading);
          const tx = p.x - sinH * 0.9 - cosH * 0.65;
          const tz = p.z - cosH * 0.9 + sinH * 0.65;
          let d = pets.current.get(p.id);
          if (!d) {
            d = { x: tx, z: tz, h: p.heading };
            pets.current.set(p.id, d);
          }
          const vx = (tx - d.x) * k;
          const vz = (tz - d.z) * k;
          d.x += vx;
          d.z += vz;
          const speed = Math.hypot(vx, vz) / Math.max(delta, 0.001);
          if (speed > 0.25) d.h += Math.atan2(Math.sin(Math.atan2(vx, vz) - d.h), Math.cos(Math.atan2(vx, vz) - d.h)) * Math.min(1, delta * 8);
          else d.h += Math.atan2(Math.sin(p.heading - d.h), Math.cos(p.heading - d.h)) * Math.min(1, delta * 3);
          const trot = Math.min(1, speed / 1.5);
          _yaw.setFromAxisAngle(UP, d.h);
          dog.setMatrixAt(nd, _local.compose(_pos.set(d.x, Math.max(0, heightAt(d.x, d.z)) + Math.abs(Math.sin(sim.time * 14 + p.id)) * 0.05 * trot, d.z), _yaw, _scale.set(1, 1, 1)));
          dog.setColorAt(nd, _colour.setHex(DOG_COLOURS[p.id % DOG_COLOURS.length]));
          seen.add(p.id);
          nd++;
        }
      }
      for (const id of pets.current.keys()) if (!seen.has(id)) pets.current.delete(id);
      dog.count = nd;
      dog.instanceMatrix.needsUpdate = true;
      if (dog.instanceColor) dog.instanceColor.needsUpdate = true;
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

  const flat = stylised;
  return (
    <Fragment key={stylised ? 'stylised' : 'classic'}>
      <instancedMesh ref={dogs} args={[dogGeometry, undefined, MAX_DOGS]} frustumCulled={false} castShadow visible={rich}>
        <meshStandardMaterial roughness={0.8} flatShading />
      </instancedMesh>
      <instancedMesh ref={torso} args={[geometry.torso, undefined, MAX_PEOPLE]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={head} args={[geometry.head, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[geometry.hair, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[geometry.eye, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshBasicMaterial color="#14161a" />
      </instancedMesh>
      <instancedMesh ref={arms} args={[geometry.arm, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hands} args={[geometry.hand, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[geometry.leg, undefined, MAX_PEOPLE * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.85} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={shoes} args={[geometry.shoe, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={bags} args={[geometry.bag, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hats} args={[geometry.hat, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.4} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={gear} args={[geometry.gear, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} flatShading={flat} />
      </instancedMesh>
    </Fragment>
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
  setPart(m.hed, n, 0, headY + (HEAD_K - 1) * 0.05, headZ, 0, 0.92 * HEAD_K, 1.1 * HEAD_K, HEAD_K);
  m.hed.setColorAt(n, tint(p.skin, anger, flash));
  const style = p.hairStyle;
  const hk = HEAD_K;
  const hy = headY + (hk - 1) * 0.05;
  if (style === 0) setPart(m.hai, n, 0, hy + 0.05, headZ - 0.01, 0, 0.001, 0.001, 0.001);
  else if (style === 1) setPart(m.hai, n, 0, hy + 0.06, headZ - 0.012, 0, 0.98 * hk, 0.6 * hk, 1.0 * hk);
  else if (style === 2) setPart(m.hai, n, 0, hy + 0.045, headZ - 0.01, 0, 1.0 * hk, 0.88 * hk, 1.02 * hk);
  else setPart(m.hai, n, 0, hy - 0.01, headZ - 0.04, 0, 1.02 * hk, 1.25 * hk, 1.1 * hk);
  m.hai.setColorAt(n, tint(p.hair, 0, flash * 0.5));
  setPart(m.eye, n * 2, -0.045 * hk, hy + 0.015, headZ + 0.1 * hk);
  setPart(m.eye, n * 2 + 1, 0.045 * hk, hy + 0.015, headZ + 0.1 * hk);

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
  // In the stylised look a quarter of everyone wears a cap (in the colour of their bag).
  const cap = p.hardHat || (CAPS && p.id % 4 === 0 && p.hairStyle !== 0);
  if (cap) {
    setPart(m.hat, hatIndex, 0, hy + 0.06, headZ, 0, hk, hk, hk);
    m.hat.setColorAt(hatIndex, tint(p.hardHat ? p.hatColour : p.bagColour, 0, flash * 0.5));
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
  return { hat: cap, gear };
}
