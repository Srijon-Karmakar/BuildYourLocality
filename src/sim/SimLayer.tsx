import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { MAX_CARS, sim } from './simulation';
import { combat } from './combat';
import { construction } from './construction';
import { MonsterLayer } from './MonsterLayer';
import { PeopleLayer } from './PeopleLayer';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_LEVEL } from '../terrain/terrain';
import { MAX_PLANES } from './aircraft';
import { MAX_SHIPS, SHIP_LENGTH } from './ships';
import { MAX_CARRIAGES, MAX_TRAINS } from './trains';
import { getGlowTexture, headlightBeamMaterial, registerNightEmissive } from '../city/nightLights';
import { atmo } from '../scenes/atmosphere';

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _quatPlane = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _colour = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** instance matrix = base * (position, rotation about x, scale). */
function setPart(mesh: THREE.InstancedMesh, index: number, base: THREE.Matrix4, x: number, y: number, z: number, tiltX = 0, sx = 1, sy = 1, sz = 1) {
  _tilt.setFromAxisAngle(RIGHT, tiltX);
  _local.compose(_pos.set(x, y, z), _tilt, _scale.set(sx, sy, sz));
  _part.multiplyMatrices(base, _local);
  mesh.setMatrixAt(index, _part);
}

const glass = new THREE.MeshStandardMaterial({ color: '#16222c', roughness: 0.1, metalness: 0.5 });
const rubber = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.9 });
/** Tram windows glow after dark. */
const trainGlass = new THREE.MeshStandardMaterial({ color: '#16222c', roughness: 0.1, metalness: 0.5, emissive: '#ffe2a8', emissiveIntensity: 0 });
registerNightEmissive(trainGlass, 1.6);
headlightBeamMaterial.map = getGlowTexture();
const LAMPS_PER_CAR = 4;
const MAX_UNITS = MAX_TRAINS * MAX_CARRIAGES;
/** Room for moving cars plus those sitting in car parks. */
const MAX_DRAWN_CARS = MAX_CARS + 160;

/** Tinted vertex-coloured geometry, so one instanced mesh can carry a hull, cabin and cargo. */
function coloured(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const count = g.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(colours, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** A cargo ship along +z: pointed hull, stern bridge with a funnel, and stacked containers. */
function buildShipGeometry(): THREE.BufferGeometry {
  const half = SHIP_LENGTH / 2;
  const outline = new THREE.Shape();
  outline.moveTo(-3.1, -half);
  outline.lineTo(3.1, -half);
  outline.lineTo(3.2, half - 7);
  outline.quadraticCurveTo(3.1, half - 2, 0, half);
  outline.quadraticCurveTo(-3.1, half - 2, -3.2, half - 7);
  outline.closePath();
  const hull = new THREE.ExtrudeGeometry(outline, { depth: 2.4, bevelEnabled: false });
  hull.rotateX(Math.PI / 2); // shape y becomes +z (bow forward); the extrusion hangs below
  hull.translate(0, 1.0, 0);
  const parts = [
    coloured(hull, 0x2c3e50),
    coloured(new THREE.BoxGeometry(6.0, 0.25, SHIP_LENGTH - 2).translate(0, 1.05, 0), 0x7f8c8d),
    coloured(new THREE.BoxGeometry(5, 3.4, 3.6).translate(0, 2.9, -half + 3), 0xf5f5f5),
    coloured(new THREE.CylinderGeometry(0.8, 0.9, 2.4, 10).translate(0, 5.4, -half + 2.6), 0xc0392b),
  ];
  const palette = [0xc0392b, 0x2b6cb0, 0x2f855a, 0xd4a017, 0x8e44ad, 0xe67e22];
  let k = 0;
  for (const z of [-3.2, 2.5, 8.2]) {
    for (const x of [-1.4, 1.4]) {
      for (const level of [0, 1]) {
        parts.push(coloured(new THREE.BoxGeometry(2.4, 2.4, 5.4).translate(x, 2.45 + level * 2.45, z), palette[k++ % palette.length]));
      }
    }
  }
  return mergeGeometries(parts)!;
}
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/** Fuselage with nose and tail cones, wings with tailplane, and landing gear: light-aircraft shapes along +z. */
function buildPlaneGeometries() {
  const fuselage = new THREE.CylinderGeometry(0.85, 0.85, 7, 14).rotateX(Math.PI / 2);
  const nose = new THREE.ConeGeometry(0.85, 1.6, 14).rotateX(Math.PI / 2).translate(0, 0, 4.3);
  const tail = new THREE.ConeGeometry(0.85, 1.6, 14).rotateX(-Math.PI / 2).translate(0, 0.1, -4.3);
  const cockpit = new THREE.BoxGeometry(1.3, 0.5, 1.4).translate(0, 0.75, 1.6);
  const wing = new THREE.BoxGeometry(10.4, 0.16, 1.9).translate(0, -0.15, 0.4);
  const tailplane = new THREE.BoxGeometry(3.6, 0.12, 0.95).translate(0, 0.5, -3.9);
  const fin = new THREE.BoxGeometry(0.14, 1.5, 1.3).translate(0, 1.35, -3.8);
  const gear = [
    new THREE.BoxGeometry(0.12, 0.8, 0.12).translate(-1.3, -0.55, 0.4),
    new THREE.BoxGeometry(0.12, 0.8, 0.12).translate(1.3, -0.55, 0.4),
    new THREE.BoxGeometry(0.12, 0.8, 0.12).translate(0, -0.55, 2.8),
  ];
  return {
    body: mergeGeometries([fuselage, nose, tail, cockpit])!,
    wings: mergeGeometries([wing, tailplane])!,
    fin,
    gear: mergeGeometries(gear)!,
  };
}
const OFF_WHITE = 0xe9eaec;

/**
 * Runs the simulation each frame and draws every car and person with a few instanced
 * meshes (one draw call per body part for the whole population).
 */
export function SimLayer() {
  const density = useGameStore((s) => s.graphics.population);
  useEffect(() => sim.setDensity(density), [density]);

  const carBody = useRef<THREE.InstancedMesh>(null);
  const carCabin = useRef<THREE.InstancedMesh>(null);
  const carWheels = useRef<THREE.InstancedMesh>(null);
  const carLamps = useRef<THREE.InstancedMesh>(null);
  const carBeams = useRef<THREE.InstancedMesh>(null);
  const parked = useRef<{ x: number; z: number; heading: number; color: number }[]>([]);
  const parkedAt = useRef(-1);

  const trainBody = useRef<THREE.InstancedMesh>(null);
  const trainBand = useRef<THREE.InstancedMesh>(null);
  const trainWindows = useRef<THREE.InstancedMesh>(null);
  const trainBogies = useRef<THREE.InstancedMesh>(null);

  const shipMesh = useRef<THREE.InstancedMesh>(null);
  const shipGeometry = useMemo(buildShipGeometry, []);
  const planeBody = useRef<THREE.InstancedMesh>(null);
  const planeWings = useRef<THREE.InstancedMesh>(null);
  const planeFin = useRef<THREE.InstancedMesh>(null);
  const planeGear = useRef<THREE.InstancedMesh>(null);
  const planeGeometry = useMemo(buildPlaneGeometries, []);

  const lampGeometry = useMemo(() => new THREE.BoxGeometry(0.34, 0.16, 0.08), []);
  const beamGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  // Static colours: lamps 0 and 1 of every car are white (front), 2 and 3 red (rear).
  useEffect(() => {
    const mesh = carLamps.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_DRAWN_CARS * LAMPS_PER_CAR; i++) mesh.setColorAt(i, _colour.set(i % LAMPS_PER_CAR < 2 ? '#fff6dc' : '#ff2a1a'));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  const wheelGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);

  useFrame((_, delta) => {
    sim.setPlayer(viewState.x, viewState.z, useGameStore.getState().mode === 'roam');
    sim.setAmbient(atmo.crowd);
    sim.update(Math.min(delta, 0.05));
    combat.update(delta);
    construction.update(Math.min(delta, 0.1));

    // --- Vehicles ---------------------------------------------------------------
    // Parked cars change rarely, so refresh that list a few times a second instead of every frame.
    if (sim.time - parkedAt.current > 0.25 || sim.time < parkedAt.current) {
      parkedAt.current = sim.time;
      parked.current = sim.parkedCars();
    }
    const moving = sim.cars;
    const total = moving.length + parked.current.length;
    const night = atmo.lamps > 0.02;
    if (carBody.current && carCabin.current && carWheels.current) {
      for (let i = 0; i < total; i++) {
        const isMoving = i < moving.length;
        const car = isMoving ? moving[i] : parked.current[i - moving.length];
        const bus = isMoving && moving[i].kind === 'bus';
        _turn.setFromAxisAngle(UP, car.heading);
        _base.compose(_pos.set(car.x, 0, car.z), _turn, _scale.set(1, 1, 1));
        const sx = bus ? 1.2 : 1;
        const sy = bus ? 1.9 : 1;
        const sz = bus ? 2.25 : 1;
        setPart(carBody.current, i, _base, 0, 0.3 + 0.35 * sy, 0, 0, sx, sy, sz);
        setPart(carCabin.current, i, _base, 0, bus ? 0.3 + 0.7 * sy + 0.3 : 1.2, bus ? 0 : -0.15, 0, bus ? 1.22 : 1, bus ? 0.8 : 1, bus ? 2.2 : 1);
        carBody.current.setColorAt(i, _colour.setHex(car.color));
        let w = 0;
        for (const sideX of [-0.95 * sx, 0.95 * sx]) {
          for (const sideZ of [-1.3 * sz, 1.3 * sz]) setPart(carWheels.current, i * 4 + w++, _base, sideX, 0.38, sideZ);
        }
        // Headlamps, tail lamps and the beam on the road ahead, only after dark and only for moving traffic.
        if (night && isMoving && carLamps.current && carBeams.current) {
          const front = 2 * sz;
          const y = 0.3 + 0.35 * sy + 0.1;
          setPart(carLamps.current, i * LAMPS_PER_CAR, _base, -0.7 * sx, y, front);
          setPart(carLamps.current, i * LAMPS_PER_CAR + 1, _base, 0.7 * sx, y, front);
          setPart(carLamps.current, i * LAMPS_PER_CAR + 2, _base, -0.7 * sx, y, -front);
          setPart(carLamps.current, i * LAMPS_PER_CAR + 3, _base, 0.7 * sx, y, -front);
          setPart(carBeams.current, i, _base, 0, 0.1, front + 5, 0, 4 * sx, 1, 10);
        }
      }
      carBody.current.count = total;
      carCabin.current.count = total;
      carWheels.current.count = total * 4;
      for (const mesh of [carBody.current, carCabin.current, carWheels.current]) mesh.instanceMatrix.needsUpdate = true;
      if (carBody.current.instanceColor) carBody.current.instanceColor.needsUpdate = true;
      if (carLamps.current && carBeams.current) {
        carLamps.current.visible = carBeams.current.visible = night;
        if (night) {
          carLamps.current.count = moving.length * LAMPS_PER_CAR;
          carBeams.current.count = moving.length;
          carLamps.current.instanceMatrix.needsUpdate = true;
          carBeams.current.instanceMatrix.needsUpdate = true;
        }
      }
    }

    // --- Trains -----------------------------------------------------------------
    if (trainBody.current && trainBand.current && trainWindows.current && trainBogies.current) {
      let n = 0;
      let b = 0;
      for (const train of sim.trains.trains) {
        train.poses.forEach((pose, k) => {
          if (!pose.visible) return;
          _turn.setFromAxisAngle(UP, pose.heading);
          _base.compose(_pos.set(pose.x, 0, pose.z), _turn, _scale.set(1, 1, 1));
          setPart(trainBody.current!, n, _base, 0, 1.65, 0);
          setPart(trainBand.current!, n, _base, 0, 0.75, 0);
          setPart(trainWindows.current!, n, _base, 0, 2.15, 0);
          trainBody.current!.setColorAt(n, _colour.setHex(k === 0 ? train.color : OFF_WHITE));
          trainBand.current!.setColorAt(n, _colour.setHex(train.color));
          setPart(trainBogies.current!, b++, _base, 0, 0.55, -3);
          setPart(trainBogies.current!, b++, _base, 0, 0.55, 3);
          n++;
        });
      }
      trainBody.current.count = n;
      trainBand.current.count = n;
      trainWindows.current.count = n;
      trainBogies.current.count = b;
      for (const mesh of [trainBody.current, trainBand.current, trainWindows.current, trainBogies.current]) mesh.instanceMatrix.needsUpdate = true;
      for (const mesh of [trainBody.current, trainBand.current]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // --- Ships ------------------------------------------------------------------
    if (shipMesh.current) {
      const ships = sim.ships.ships;
      ships.forEach((ship, i) => {
        const bob = Math.sin(sim.time * 0.9 + ship.id) * 0.08;
        _quatPlane.setFromEuler(_euler.set(Math.sin(sim.time * 0.6 + ship.id) * 0.015, ship.heading, Math.sin(sim.time * 0.7 + ship.id) * 0.02));
        _base.compose(_pos.set(ship.x, WATER_LEVEL + 0.2 + bob, ship.z), _quatPlane, _scale.set(1, 1, 1));
        shipMesh.current!.setMatrixAt(i, _base);
        shipMesh.current!.setColorAt(i, _colour.setHex(ship.color));
      });
      shipMesh.current.count = ships.length;
      shipMesh.current.instanceMatrix.needsUpdate = true;
      if (shipMesh.current.instanceColor) shipMesh.current.instanceColor.needsUpdate = true;
    }

    // --- Aircraft ---------------------------------------------------------------
    if (planeBody.current && planeWings.current && planeFin.current && planeGear.current) {
      const planes = sim.aircraft.planes;
      planes.forEach((plane, i) => {
        _quatPlane.setFromEuler(_euler.set(-plane.pitch, plane.heading, plane.roll));
        _base.compose(_pos.set(plane.x, plane.y, plane.z), _quatPlane, _scale.set(1, 1, 1));
        planeBody.current!.setMatrixAt(i, _base);
        planeWings.current!.setMatrixAt(i, _base);
        planeFin.current!.setMatrixAt(i, _base);
        planeGear.current!.setMatrixAt(i, _base);
        planeBody.current!.setColorAt(i, _colour.setHex(plane.color));
        planeWings.current!.setColorAt(i, _colour.setHex(plane.color));
        planeFin.current!.setColorAt(i, _colour.setHex(plane.stripe));
      });
      for (const mesh of [planeBody.current, planeWings.current, planeFin.current, planeGear.current]) {
        mesh.count = planes.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <instancedMesh ref={carBody} args={[undefined, undefined, MAX_DRAWN_CARS]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.7, 4]} />
        <meshStandardMaterial roughness={0.3} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={carCabin} args={[undefined, undefined, MAX_DRAWN_CARS]} frustumCulled={false} castShadow material={glass}>
        <boxGeometry args={[1.6, 0.55, 2.1]} />
      </instancedMesh>
      <instancedMesh ref={carWheels} args={[wheelGeometry, undefined, MAX_DRAWN_CARS * 4]} frustumCulled={false} castShadow material={rubber} />
      <instancedMesh ref={carLamps} args={[lampGeometry, undefined, MAX_DRAWN_CARS * LAMPS_PER_CAR]} frustumCulled={false} visible={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={carBeams} args={[beamGeometry, headlightBeamMaterial, MAX_DRAWN_CARS]} frustumCulled={false} visible={false} renderOrder={3} />

      <instancedMesh ref={trainBody} args={[undefined, undefined, MAX_UNITS]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry args={[2.7, 2.6, 8.2]} />
        <meshStandardMaterial roughness={0.35} metalness={0.45} />
      </instancedMesh>
      <instancedMesh ref={trainBand} args={[undefined, undefined, MAX_UNITS]} frustumCulled={false}>
        <boxGeometry args={[2.74, 0.5, 8.24]} />
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={trainWindows} args={[undefined, undefined, MAX_UNITS]} frustumCulled={false} material={trainGlass}>
        <boxGeometry args={[2.76, 0.85, 7.4]} />
      </instancedMesh>
      <instancedMesh ref={trainBogies} args={[undefined, undefined, MAX_UNITS * 2]} frustumCulled={false} castShadow material={rubber}>
        <boxGeometry args={[2.3, 0.7, 1.8]} />
      </instancedMesh>

      <instancedMesh ref={shipMesh} args={[shipGeometry, undefined, MAX_SHIPS]} frustumCulled={false} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.5} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={planeBody} args={[planeGeometry.body, undefined, MAX_PLANES]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.3} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={planeWings} args={[planeGeometry.wings, undefined, MAX_PLANES]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.35} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={planeFin} args={[planeGeometry.fin, undefined, MAX_PLANES]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.4} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={planeGear} args={[planeGeometry.gear, undefined, MAX_PLANES]} frustumCulled={false} material={rubber} />

      <PeopleLayer />
      <MonsterLayer />
    </>
  );
}
