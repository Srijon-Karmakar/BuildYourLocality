import { useFrame } from '@react-three/fiber';
import { uploadInstances } from '../engine/instanceUploads';
import { Fragment, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGameStore } from '../state/useGameStore';
import { useIsTouch } from '../ui/useMediaQuery';
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
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _pedSphere = new THREE.Sphere();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const ANGRY = new THREE.Color(0xe0453a);
const WHITE = new THREE.Color(0xffffff);
const SHOE = new THREE.Color(0x1d1f24);
const ORANGE_SHIBA = new THREE.Color('#d97925');
const HARNESS_BROWN = new THREE.Color('#382012');
const NOSE_BLACK = new THREE.Color('#1c1e22');
const SNEAKER_DARK = new THREE.Color('#22262e');
const SNEAKER_WHITE = new THREE.Color('#ffffff');
const GUN_DARK = new THREE.Color('#1c2026');
const GUN_METAL = new THREE.Color('#333945');
const GUN_MAG = new THREE.Color('#262b33');

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
/** Head size multiplier and whether some people wear caps: set each frame from the look. */
let HEAD_K = 1;
let CAPS = false;
const DOG_COLOURS = [0xd9923a, 0xf2e6d0, 0x6b4a32, 0x2b2b2e, 0xc9a26b];

/** Merges shapes that may be indexed (cones, boxes) or not (icosahedrons): all are made non-indexed first, which merging requires. */
function safeMerge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error('Could not merge character geometry');
  return merged;
}

/** Helper to construct a colored box buffer geometry with vertex colors. */
function colorBox(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rx !== 0) geo.rotateX(rx);
  if (ry !== 0) geo.rotateY(ry);
  if (rz !== 0) geo.rotateZ(rz);
  geo.translate(x, y, z);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Low-poly Shiba Inu dog with urajiro markings, dark harness, pointy ears, and curled tail. */
function buildShibaDog(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Body upper (warm golden coat)
  parts.push(colorBox(0.25, 0.15, 0.52, 0, 0.38, 0, ORANGE_SHIBA));
  // Belly & chest (white urajiro)
  parts.push(colorBox(0.23, 0.12, 0.50, 0, 0.26, 0.02, WHITE));
  // Dark chest harness / collar
  parts.push(colorBox(0.26, 0.07, 0.09, 0, 0.35, 0.16, HARNESS_BROWN));
  // Head upper & cheeks
  parts.push(colorBox(0.19, 0.18, 0.19, 0, 0.46, 0.32, ORANGE_SHIBA));
  // Snout (white)
  parts.push(colorBox(0.12, 0.09, 0.14, 0, 0.41, 0.44, WHITE));
  // Black nose
  parts.push(colorBox(0.05, 0.04, 0.04, 0, 0.44, 0.51, NOSE_BLACK));
  // Triangular upright ears (orange back, white front)
  parts.push(colorBox(0.04, 0.10, 0.04, -0.07, 0.58, 0.28, ORANGE_SHIBA, -0.2));
  parts.push(colorBox(0.04, 0.10, 0.04, 0.07, 0.58, 0.28, ORANGE_SHIBA, -0.2));
  // Curled tail arching forward
  parts.push(colorBox(0.06, 0.06, 0.20, 0, 0.47, -0.27, ORANGE_SHIBA, 0.85));
  parts.push(colorBox(0.05, 0.05, 0.08, 0, 0.54, -0.21, WHITE, 0.95));
  // 4 Legs: upper leg orange, lower paws white
  for (const [x, z] of [[-0.09, 0.18], [0.09, 0.18], [-0.09, -0.18], [0.09, -0.18]]) {
    parts.push(colorBox(0.065, 0.12, 0.065, x, 0.18, z, ORANGE_SHIBA));
    parts.push(colorBox(0.07, 0.12, 0.07, x, 0.06, z, WHITE));
  }
  return safeMerge(parts);
}

/** Two-tone low-poly sneaker with white midsole/sole and dark upper. */
function buildStylisedShoe(): THREE.BufferGeometry {
  const upper = colorBox(0.125, 0.065, 0.26, 0, 0.035, 0.04, SNEAKER_DARK);
  const sole = colorBox(0.135, 0.035, 0.28, 0, -0.015, 0.04, SNEAKER_WHITE);
  return safeMerge([upper, sole]);
}

/** Low-poly assault carbine rifle with receiver, rail, barrel, magazine, and stock. */
function buildTacticalRifle(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Receiver & body
  parts.push(colorBox(0.06, 0.10, 0.38, 0, 0, 0, GUN_DARK));
  // Stock
  parts.push(colorBox(0.045, 0.11, 0.22, 0, -0.02, 0.28, GUN_DARK));
  // Top picatinny rail
  parts.push(colorBox(0.04, 0.03, 0.32, 0, 0.065, -0.02, GUN_METAL));
  // Barrel & handguard
  parts.push(colorBox(0.05, 0.06, 0.28, 0, 0.01, -0.32, GUN_METAL));
  // Muzzle brake
  parts.push(colorBox(0.03, 0.03, 0.06, 0, 0.01, -0.48, GUN_METAL));
  // Curved magazine
  parts.push(colorBox(0.04, 0.16, 0.09, 0, -0.12, -0.06, GUN_MAG, 0.22));
  // Pistol grip
  parts.push(colorBox(0.04, 0.12, 0.06, 0, -0.10, 0.10, GUN_DARK, -0.3));
  return safeMerge(parts);
}

/** 3D polygonal starburst muzzle flash. */
function buildMuzzleFlash(): THREE.BufferGeometry {
  const core = new THREE.OctahedronGeometry(0.07, 0);
  const sX1 = new THREE.ConeGeometry(0.035, 0.22, 4).rotateZ(Math.PI / 2).translate(0.11, 0, 0);
  const sX2 = new THREE.ConeGeometry(0.035, 0.22, 4).rotateZ(-Math.PI / 2).translate(-0.11, 0, 0);
  const sY1 = new THREE.ConeGeometry(0.035, 0.22, 4).translate(0, 0.11, 0);
  const sY2 = new THREE.ConeGeometry(0.035, 0.22, 4).rotateX(Math.PI).translate(0, -0.11, 0);
  const sZ = new THREE.ConeGeometry(0.045, 0.32, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.16);
  return safeMerge([core, sX1, sX2, sY1, sY2, sZ]);
}

/** Spiky faceted anime/action hairstyle. */
function buildSpikyHair(): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(0.15, 0);
  const sp1 = new THREE.ConeGeometry(0.05, 0.14, 4).rotateX(0.4).translate(0, 0.12, 0.08);
  const sp2 = new THREE.ConeGeometry(0.045, 0.12, 4).rotateX(-0.5).translate(0, 0.12, -0.08);
  const sp3 = new THREE.ConeGeometry(0.045, 0.11, 4).rotateZ(0.5).translate(-0.09, 0.08, 0);
  const sp4 = new THREE.ConeGeometry(0.045, 0.11, 4).rotateZ(-0.5).translate(0.09, 0.08, 0);
  return safeMerge([base, sp1, sp2, sp3, sp4]);
}

/** Runner ponytail hairstyle with backwards flowing tail. */
function buildPonytailHair(): THREE.BufferGeometry {
  const cap = new THREE.IcosahedronGeometry(0.155, 0);
  const tail = new THREE.ConeGeometry(0.07, 0.30, 5).rotateX(-1.25).translate(0, -0.05, -0.24);
  const knot = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6).rotateX(-1.25).translate(0, 0.02, -0.13);
  return safeMerge([cap, tail, knot]);
}

/** Folded hoodie collar resting on upper shoulders. */
function buildHoodieCollar(): THREE.BufferGeometry {
  const left = new THREE.BoxGeometry(0.09, 0.10, 0.18).rotateX(0.2).translate(-0.13, 0, -0.06);
  const right = new THREE.BoxGeometry(0.09, 0.10, 0.18).rotateX(0.2).translate(0.13, 0, -0.06);
  const back = new THREE.BoxGeometry(0.24, 0.12, 0.13).rotateX(-0.3).translate(0, 0.02, -0.14);
  return safeMerge([left, right, back]);
}

/** Dual horizontal illuminated stripes for the backpack. */
function buildBagLeds(): THREE.BufferGeometry {
  const top = new THREE.BoxGeometry(0.24, 0.04, 0.03).translate(0, 0.07, 0);
  const bottom = new THREE.BoxGeometry(0.24, 0.04, 0.03).translate(0, -0.07, 0);
  return safeMerge([top, bottom]);
}

/** A little low-poly dog along +z: body, head, snout, tail and four legs. */
function buildDog(): THREE.BufferGeometry {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const tail = new THREE.BoxGeometry(0.06, 0.06, 0.24).rotateX(-0.6).translate(0, 0.43, -0.36);
  return safeMerge([
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
  ]);
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
  const touch = useIsTouch();
  const rich = stylised && !touch;
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
  const bagLeds = useRef<THREE.InstancedMesh>(null);
  const hoods = useRef<THREE.InstancedMesh>(null);
  const hats = useRef<THREE.InstancedMesh>(null);
  const ponytails = useRef<THREE.InstancedMesh>(null);
  const gear = useRef<THREE.InstancedMesh>(null);
  const muzzles = useRef<THREE.InstancedMesh>(null);

  const dogGeometry = useMemo(() => (stylised ? buildShibaDog() : buildDog()), [stylised]);
  // The stylised look: faceted, chunky bodies, spiky anime hair, sneakers with white soles, and carbine rifles.
  const geometry = useMemo(
    () =>
      stylised
        ? {
            torso: new THREE.CylinderGeometry(0.24, 0.17, 0.6, 6),
            head: new THREE.IcosahedronGeometry(0.125, 0),
            hair: buildSpikyHair(),
            ponytail: buildPonytailHair(),
            eye: new THREE.SphereGeometry(0.017, 6, 5),
            arm: new THREE.CylinderGeometry(0.065, 0.052, ARM, 5).translate(0, -ARM / 2, 0),
            hand: new THREE.IcosahedronGeometry(0.05, 0),
            leg: new THREE.CylinderGeometry(0.085, 0.065, LEG, 5).translate(0, -LEG / 2, 0),
            shoe: buildStylisedShoe(),
            bag: new THREE.BoxGeometry(0.32, 0.38, 0.16),
            bagLed: buildBagLeds(),
            hood: buildHoodieCollar(),
            hat: new THREE.SphereGeometry(0.15, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            gear: buildTacticalRifle(),
            muzzle: buildMuzzleFlash(),
          }
        : {
            torso: new THREE.CylinderGeometry(0.2, 0.165, 0.6, 10),
            head: new THREE.SphereGeometry(0.12, 14, 12),
            hair: new THREE.SphereGeometry(0.133, 12, 10),
            ponytail: new THREE.SphereGeometry(0.001, 4, 4),
            eye: new THREE.SphereGeometry(0.017, 6, 5),
            arm: new THREE.CylinderGeometry(0.058, 0.046, ARM, 8).translate(0, -ARM / 2, 0),
            hand: new THREE.SphereGeometry(0.048, 8, 6),
            leg: new THREE.CylinderGeometry(0.078, 0.06, LEG, 8).translate(0, -LEG / 2, 0),
            shoe: new THREE.BoxGeometry(0.11, 0.075, 0.25).translate(0, 0, 0.04),
            bag: new THREE.BoxGeometry(0.3, 0.36, 0.13),
            bagLed: new THREE.BoxGeometry(0.001, 0.001, 0.001),
            hood: new THREE.BoxGeometry(0.001, 0.001, 0.001),
            hat: new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            gear: new THREE.BoxGeometry(0.34, 0.24, 0.3),
            muzzle: new THREE.BoxGeometry(0.001, 0.001, 0.001),
          },
    [stylised],
  );

  // Shoes: in stylised mode they carry their own vertex colors (white soles), so tint with white.
  useEffect(() => {
    if (shoes.current) {
      for (let i = 0; i < MAX_PEOPLE * 2; i++) shoes.current.setColorAt(i, stylised ? WHITE : SHOE);
      if (shoes.current.instanceColor) shoes.current.instanceColor.needsUpdate = true;
    }
  }, [stylised]);

  useFrame((state, delta) => {
    HEAD_K = stylised ? 1.14 : 1;
    CAPS = rich;
    const parts = [torso, head, hair, eyes, arms, hands, legs, shoes, bags, bagLeds, hoods, hats, ponytails, gear, muzzles].map((r) => r.current);
    if (parts.some((p) => !p)) return;
    const [tor, hed, hai, eye, arm, han, leg, sho, bag, led, hod, hat, pon, gea, muz] = parts as THREE.InstancedMesh[];

    // Strict first-person / roam viewport frustum culling
    const camera = state.camera;
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    const maxDist = touch ? 65 : 88;
    const maxDistSq = maxDist * maxDist;
    const lodDist = touch ? 22 : 28;
    const lodDistSq = lodDist * lodDist;
    const camX = camera.position.x;
    const camZ = camera.position.z;

    const peds = sim.peds;
    let n = 0;
    let eyeCount = 0;
    let handCount = 0;
    let bagCount = 0;
    let ledCount = 0;
    let hoodCount = 0;
    let hatCount = 0;
    let ponCount = 0;
    let gearCount = 0;
    let muzzleCount = 0;

    for (const p of peds) {
      if (n >= MAX_PEOPLE) break;
      if (p.vis <= 0.01 && p.state === 'inside') continue;

      const dx = p.x - camX;
      const dz = p.z - camZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > maxDistSq) continue;

      const gy = Math.max(0, heightAt(p.x, p.z));
      _pedSphere.center.set(p.x, gy + 0.9, p.z);
      _pedSphere.radius = 1.35;
      if (!_frustum.intersectsSphere(_pedSphere)) continue;

      const isDistant = distSq > lodDistSq;

      const used = drawPerson(
        p,
        n,
        { tor, hed, hai, eye, arm, han, leg, sho, bag, led, hod, hat, pon, gea, muz },
        bagCount,
        ledCount,
        hoodCount,
        hatCount,
        ponCount,
        gearCount,
        muzzleCount,
        eyeCount,
        handCount,
        isDistant,
      );
      if (p.bag) bagCount++;
      if (used.led) ledCount++;
      if (used.hood) hoodCount++;
      if (used.hat) hatCount++;
      if (used.ponytail) ponCount++;
      if (used.gear) gearCount++;
      if (used.muzzle) muzzleCount++;
      eyeCount += used.eyes;
      handCount += used.hands;
      n++;
    }

    // Shiba Inu companions: only trot and render for visible pedestrians in camera frustum
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

          // Frustum check for pet
          const ddx = d.x - camX;
          const ddz = d.z - camZ;
          if (ddx * ddx + ddz * ddz > maxDistSq) continue;
          _pedSphere.center.set(d.x, heightAt(d.x, d.z) + 0.4, d.z);
          _pedSphere.radius = 0.8;
          if (!_frustum.intersectsSphere(_pedSphere)) continue;

          const speed = Math.hypot(vx, vz) / Math.max(delta, 0.001);
          if (speed > 0.25) d.h += Math.atan2(Math.sin(Math.atan2(vx, vz) - d.h), Math.cos(Math.atan2(vx, vz) - d.h)) * Math.min(1, delta * 8);
          else d.h += Math.atan2(Math.sin(p.heading - d.h), Math.cos(p.heading - d.h)) * Math.min(1, delta * 3);
          const trot = Math.min(1, speed / 1.5);
          _yaw.setFromAxisAngle(UP, d.h);
          dog.setMatrixAt(nd, _local.compose(_pos.set(d.x, Math.max(0, heightAt(d.x, d.z)) + Math.abs(Math.sin(sim.time * 14 + p.id)) * 0.05 * trot, d.z), _yaw, _scale.set(1, 1, 1)));
          dog.setColorAt(nd, stylised ? WHITE : _colour.setHex(DOG_COLOURS[p.id % DOG_COLOURS.length]));
          seen.add(p.id);
          nd++;
        }
      }
      for (const id of pets.current.keys()) if (!seen.has(id)) pets.current.delete(id);
      dog.count = nd;
      uploadInstances(dog);
    }

    tor.count = hed.count = hai.count = n;
    eye.count = eyeCount;
    arm.count = leg.count = sho.count = n * 2;
    han.count = handCount;
    bag.count = bagCount;
    led.count = ledCount;
    hod.count = hoodCount;
    hat.count = hatCount;
    pon.count = ponCount;
    gea.count = gearCount;
    muz.count = muzzleCount;

    for (const mesh of [tor, hed, hai, eye, arm, han, leg, sho, bag, led, hod, hat, pon, gea, muz]) {
      uploadInstances(mesh);
    }
  });

  const flat = stylised;
  return (
    <Fragment key={stylised ? 'stylised' : 'classic'}>
      <instancedMesh ref={dogs} args={[dogGeometry, undefined, MAX_DOGS]} frustumCulled={false} castShadow visible={rich}>
        <meshStandardMaterial vertexColors={stylised} roughness={0.78} metalness={0.06} flatShading />
      </instancedMesh>
      <instancedMesh ref={torso} args={[geometry.torso, undefined, MAX_PEOPLE]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.78} metalness={0.04} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hoods} args={[geometry.hood, undefined, MAX_PEOPLE]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.82} metalness={0.02} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={head} args={[geometry.head, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.65} metalness={0.02} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hair} args={[geometry.hair, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.12} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={ponytails} args={[geometry.ponytail, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.12} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={eyes} args={[geometry.eye, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshBasicMaterial color="#14161a" />
      </instancedMesh>
      <instancedMesh ref={arms} args={[geometry.arm, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} metalness={0.04} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={hands} args={[geometry.hand, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.65} metalness={0.02} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[geometry.leg, undefined, MAX_PEOPLE * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.82} metalness={0.05} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={shoes} args={[geometry.shoe, undefined, MAX_PEOPLE * 2]} frustumCulled={false}>
        <meshStandardMaterial vertexColors={stylised} roughness={0.55} metalness={0.08} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={bags} args={[geometry.bag, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.75} metalness={0.08} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={bagLeds} args={[geometry.bagLed, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial color="#ff8800" emissive="#ff6600" emissiveIntensity={3.5} roughness={0.2} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={hats} args={[geometry.hat, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.1} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={gear} args={[geometry.gear, undefined, MAX_PEOPLE]} frustumCulled={false} castShadow>
        <meshStandardMaterial vertexColors={stylised} roughness={0.38} metalness={0.68} flatShading={flat} />
      </instancedMesh>
      <instancedMesh ref={muzzles} args={[geometry.muzzle, undefined, MAX_PEOPLE]} frustumCulled={false}>
        <meshBasicMaterial color="#ffe875" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
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
  led: THREE.InstancedMesh;
  hod: THREE.InstancedMesh;
  hat: THREE.InstancedMesh;
  pon: THREE.InstancedMesh;
  gea: THREE.InstancedMesh;
  muz: THREE.InstancedMesh;
}

function drawPerson(
  p: Ped,
  n: number,
  m: Meshes,
  bagIndex: number,
  ledIndex: number,
  hoodIndex: number,
  hatIndex: number,
  ponIndex: number,
  gearIndex: number,
  muzzleIndex: number,
  eyeIndex: number,
  handIndex: number,
  isDistant: boolean,
): { hood: boolean; hat: boolean; ponytail: boolean; gear: boolean; muzzle: boolean; led: boolean; eyes: number; hands: number } {
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

  // Folded hoodie collar resting on upper shoulders for anyone with a coat or hoodie (omitted for distant LOD).
  let hasHood = false;
  if (!isDistant && (p.coat || p.id % 2 === 0)) {
    setPart(m.hod, hoodIndex, 0, hipY + 0.55 * coat, lean * 0.2, lean, 1, 1, 1);
    m.hod.setColorAt(hoodIndex, tint(p.shirt, anger * 0.3, flash));
    hasHood = true;
  }

  // Head, hair, eyes.
  const headY = hipY + 0.78 + (cowering ? -0.04 : 0);
  const headZ = lean * 0.45;
  setPart(m.hed, n, 0, headY + (HEAD_K - 1) * 0.05, headZ, 0, 0.92 * HEAD_K, 1.1 * HEAD_K, HEAD_K);
  m.hed.setColorAt(n, tint(p.skin, anger, flash));
  const style = p.hairStyle;
  const hk = HEAD_K;
  const hy = headY + (hk - 1) * 0.05;
  let hasPon = false;
  if (style === 0) {
    setPart(m.hai, n, 0, hy + 0.05, headZ - 0.01, 0, 0.001, 0.001, 0.001);
  } else if (style === 3) {
    setPart(m.pon, ponIndex, 0, hy - 0.01, headZ - 0.03, 0, 1.02 * hk, 1.25 * hk, 1.1 * hk);
    m.pon.setColorAt(ponIndex, tint(p.hair, 0, flash * 0.5));
    setPart(m.hai, n, 0, hy + 0.05, headZ - 0.01, 0, 0.001, 0.001, 0.001);
    hasPon = true;
  } else if (style === 1) {
    setPart(m.hai, n, 0, hy + 0.06, headZ - 0.012, 0, 0.98 * hk, 0.6 * hk, 1.0 * hk);
    m.hai.setColorAt(n, tint(p.hair, 0, flash * 0.5));
  } else {
    setPart(m.hai, n, 0, hy + 0.045, headZ - 0.01, 0, 1.0 * hk, 0.88 * hk, 1.02 * hk);
    m.hai.setColorAt(n, tint(p.hair, 0, flash * 0.5));
  }

  let eyesDrawn = 0;
  if (!isDistant) {
    setPart(m.eye, eyeIndex, -0.045 * hk, hy + 0.015, headZ + 0.1 * hk);
    setPart(m.eye, eyeIndex + 1, 0.045 * hk, hy + 0.015, headZ + 0.1 * hk);
    eyesDrawn = 2;
  }

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
  if (p.armed && p.state !== 'down') {
    // 2-handed tactical aiming pose for carbine rifle
    rightA = -1.55 + p.swing * 0.25;
    leftA = -1.35;
  } else if (p.state === 'chasing' && p.swing <= 0.01) {
    rightA = -0.9 + Math.sin(sim.time * 12 + p.id) * 0.25; // fists up
  }

  setPart(m.arm, n * 2, -0.26, shoulderY, 0.0, leftA);
  m.arm.setColorAt(n * 2, tint(p.shirt, anger * 0.3, flash));
  setPart(m.arm, n * 2 + 1, 0.26, shoulderY, 0.0, rightA);
  m.arm.setColorAt(n * 2 + 1, tint(p.shirt, anger * 0.3, flash));

  let handsDrawn = 0;
  if (!isDistant) {
    setPart(m.han, handIndex, -0.26, shoulderY - ARM * Math.cos(leftA), -ARM * Math.sin(leftA), 0);
    m.han.setColorAt(handIndex, tint(p.skin, anger, flash));
    setPart(m.han, handIndex + 1, 0.26, shoulderY - ARM * Math.cos(rightA), -ARM * Math.sin(rightA), 0);
    m.han.setColorAt(handIndex + 1, tint(p.skin, anger, flash));
    handsDrawn = 2;
  }

  // Backpack + glowing amber strips.
  let hasLed = false;
  if (p.bag) {
    setPart(m.bag, bagIndex, 0, hipY + 0.34, -0.17, 0);
    m.bag.setColorAt(bagIndex, tint(p.bagColour, 0, flash * 0.5));
    if (!isDistant) {
      setPart(m.led, ledIndex, 0, hipY + 0.34, -0.26, 0);
      hasLed = true;
    }
  }

  // Hard hat or stylish cap.
  let gear = false;
  let muzzle = false;
  const cap = p.hardHat || (CAPS && p.id % 4 === 0 && p.hairStyle !== 0);
  if (cap) {
    setPart(m.hat, hatIndex, 0, hy + 0.06, headZ, 0, hk, hk, hk);
    m.hat.setColorAt(hatIndex, tint(p.hardHat ? p.hatColour : p.bagColour, 0, flash * 0.5));
  }

  if (p.armed && p.state !== 'down') {
    // Position the low-poly carbine rifle in 2 hands
    const rifleX = 0.14;
    const rifleY = shoulderY - ARM * Math.cos(rightA) + 0.08;
    const rifleZ = -ARM * Math.sin(rightA) + 0.24;
    setPart(m.gea, gearIndex, rifleX, rifleY, rifleZ, 0, 1, 1, 1);
    if (!m.gea.geometry.attributes.color) {
      m.gea.setColorAt(gearIndex, tint(0x23262c, 0, flash * 0.5));
    }
    gear = true;

    // Firing or in active combat chasing: 3D polygonal starburst muzzle flash (close only)
    if (!isDistant && (p.swing > 0.05 || (p.state === 'chasing' && p.id % 2 === 0))) {
      const flashScale = 0.85 + Math.random() * 0.4;
      setPart(m.muz, muzzleIndex, rifleX, rifleY, rifleZ - 0.44, 0, flashScale, flashScale, flashScale);
      muzzle = true;
    }
  } else if (p.job === 'builder' && p.carrying) {
    setPart(m.gea, gearIndex, 0, hipY + 0.5, 0.36, 0);
    m.gea.setColorAt(gearIndex, tint(0xb98d55, 0, 0));
    gear = true;
  }

  return { hood: hasHood, hat: cap, ponytail: hasPon, gear, muzzle, led: hasLed, eyes: eyesDrawn, hands: handsDrawn };
}
