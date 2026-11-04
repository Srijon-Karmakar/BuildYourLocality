import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { MAX_CARS, sim } from './simulation';
import { combat } from './combat';
import { cityModel } from './cityStats';
import { incidents } from './incidents';
import { looseWheels, updateCarFx } from './carFx';
import { IncidentLayer } from './IncidentLayer';
import { DisasterLayer } from './DisasterLayer';
import { disasters } from './disasters';
import { missions } from './missions';
import { construction } from './construction';
import { MonsterLayer } from './MonsterLayer';
import { PeopleLayer } from './PeopleLayer';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WATER_LEVEL } from '../terrain/terrain';
import { MAX_PLANES } from './aircraft';
import { MAX_SHIPS, SHIP_LENGTH } from './ships';
import { MAX_TRANSIT_UNITS } from './trains';
import { getGlowTexture, headlightBeamMaterial, registerNightEmissive } from '../city/nightLights';
import { atmo } from '../scenes/atmosphere';
import { useIsTouch } from '../ui/useMediaQuery';

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _quatPlane = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _colour = new THREE.Color();
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _carSphere = new THREE.Sphere();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** instance matrix = base * (position, rotation about x, scale). */
function setPart(mesh: THREE.InstancedMesh, index: number, base: THREE.Matrix4, x: number, y: number, z: number, tiltX = 0, sx = 1, sy = 1, sz = 1) {
  _tilt.setFromAxisAngle(RIGHT, tiltX);
  _local.compose(_pos.set(x, y, z), _tilt, _scale.set(sx, sy, sz));
  _part.multiplyMatrices(base, _local);
  mesh.setMatrixAt(index, _part);
}

/** White: each car's glass colour comes from its instance colour (dark, or frosted white once the windows are smashed). */
const carGlass = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.5 });
const BRAKE_RED = new THREE.Color('#ff2418');
const AMBER = new THREE.Color('#ffa81a');
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rubber = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.9 });
/** Tram windows glow after dark. */
const trainGlass = new THREE.MeshStandardMaterial({ color: '#16222c', roughness: 0.1, metalness: 0.5, emissive: '#ffe2a8', emissiveIntensity: 0 });
registerNightEmissive(trainGlass, 1.6);
headlightBeamMaterial.map = getGlowTexture();
const LAMPS_PER_CAR = 4;
const MAX_SIRENS = 16;
const MAX_UNITS = MAX_TRANSIT_UNITS;
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
  const stylised = useGameStore((s) => s.graphics.stylised);
  const touch = useIsTouch();
  // The stylised look: cars with rounded, chunky bodies and a softer, less shiny paint.
  const bodyGeometry = useMemo(() => (stylised ? new RoundedBoxGeometry(1.66, 0.6, 3.46, 2, 0.21) : new THREE.BoxGeometry(1.66, 0.6, 3.46)), [stylised]);
  const cabinGeometry = useMemo(() => (stylised ? new RoundedBoxGeometry(1.4, 0.48, 1.82, 2, 0.17) : new THREE.BoxGeometry(1.4, 0.48, 1.82)), [stylised]);
  useEffect(() => sim.setDensity(density), [density]);

  const carBody = useRef<THREE.InstancedMesh>(null);
  const carCabin = useRef<THREE.InstancedMesh>(null);
  const carWheels = useRef<THREE.InstancedMesh>(null);
  const carLamps = useRef<THREE.InstancedMesh>(null);
  /** Brake lights, indicators and hazard lights: lit by day as well as night, close to the viewer only. */
  const carSignals = useRef<THREE.InstancedMesh>(null);
  const carBeams = useRef<THREE.InstancedMesh>(null);
  const carSirens = useRef<THREE.InstancedMesh>(null);
  const sirenGeometry = useMemo(() => new THREE.BoxGeometry(0.5, 0.16, 0.3), []);
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
    const g = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 14);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);

  useFrame((state, delta) => {
    sim.setPlayer(viewState.x, viewState.z, useGameStore.getState().mode === 'roam');
    sim.setAmbient(atmo.crowd);
    sim.update(Math.min(delta, 0.05));
    updateCarFx(Math.min(delta, 0.05), touch ? 0.5 : 1, touch ? 80 : 110);
    combat.update(delta);
    incidents.update(Math.min(delta, 0.1));
    cityModel.tick(Math.min(delta, 0.1));
    disasters.update(Math.min(delta, 0.1));
    missions.tick(Math.min(delta, 0.1));
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
      // Frustum culling and distance LOD for vehicles:
      const camera = state.camera;
      _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreenMatrix);

      const maxDist = touch ? 75 : 105;
      const maxDistSq = maxDist * maxDist;
      const carLodDist = touch ? 26 : 35;
      const carLodDistSq = carLodDist * carLodDist;
      const signalDist = touch ? 34 : 50;
      const signalDistSq = signalDist * signalDist;
      const camX = camera.position.x;
      const camZ = camera.position.z;

      let drawnCars = 0;
      let drawnWheels = 0;
      let drawnSirens = 0;
      let drawnLamps = 0;
      let drawnBeams = 0;
      let drawnSignals = 0;
      const signals = carSignals.current;
      const lamp = (x: number, y: number, z: number, colour: THREE.Color, size = 1) => {
        setPart(signals!, drawnSignals, _base, x, y, z, 0, size, size, 1);
        signals!.setColorAt(drawnSignals++, colour);
      };

      for (let i = 0; i < total; i++) {
        if (drawnCars >= MAX_DRAWN_CARS) break;
        const isMoving = i < moving.length;
        const car: { x: number; z: number; heading: number; color: number; y?: number; pitch?: number; roll?: number } = isMoving ? moving[i] : parked.current[i - moving.length];

        const dx = car.x - camX;
        const dz = car.z - camZ;
        const distSq = dx * dx + dz * dz;
        if (distSq > maxDistSq) continue;

        _carSphere.center.set(car.x, (car.y ?? 0) + 1.2, car.z);
        _carSphere.radius = 4.2;
        if (!_frustum.intersectsSphere(_carSphere)) continue;

        const mv = isMoving ? moving[i] : null;
        const kind = mv ? mv.kind : 'car';
        const fxc = mv?.fx;
        const wrecked = !!mv && mv.wreck > 0;
        const burnt = !!fxc?.burnt;
        // Buses, ambulances and fire engines are tall boxes; everything else is a car.
        const tall = kind === 'bus' || kind === 'ambulance' || kind === 'fire';
        const bus = kind === 'bus';
        // Cars come in three shapes (saloon, hatchback, estate) and a few sizes, so a street does not look cloned.
        const key = mv ? mv.id : car.color;
        const variant = key % 3;
        const vary = 0.95 + (0.1 * (((key * 2654435761) >>> 0) % 100)) / 100;

        // How the body sits: it dips under braking, squats under power, leans into bends, bounces on a bumpy road,
        // and sags on a corner that has lost its tyre or wheel.
        let pitch = car.pitch ?? 0;
        let roll = wrecked ? 0.12 : (car.roll ?? 0);
        let lift = 0;
        let yaw = car.heading;
        if (mv) {
          const speed = Math.abs(mv.speed);
          pitch += clampN(-(mv.acc ?? 0) * 0.0045, -0.05, 0.05);
          roll += clampN((mv.turn ?? 0) * speed * 0.01, -0.07, 0.07);
          if (speed > 2) lift = Math.sin(sim.time * 13 + mv.id * 2.1) * 0.012 * Math.min(1, speed / 7);
          if (fxc) {
            const flatBits = fxc.flat ?? 0;
            const offBits = fxc.off ?? 0;
            for (let w = 0; w < 4; w++) {
              const weight = offBits & (1 << w) ? 1 : flatBits & (1 << w) ? 0.45 : 0;
              if (weight === 0) continue;
              roll -= (w >> 1 ? 1 : -1) * weight * 0.06;
              pitch += (w & 1 ? 1 : -1) * weight * 0.045;
            }
            if (burnt) roll += (mv.id % 2 ? 1 : -1) * 0.25;
            if (fxc.limp !== undefined) yaw += Math.sin(sim.time * 9 + mv.id) * 0.035;
          }
        }
        if (pitch || roll || yaw !== car.heading) _turn.setFromEuler(_euler.set(pitch, yaw, roll, 'YXZ'));
        else _turn.setFromAxisAngle(UP, yaw);
        _base.compose(_pos.set(car.x, (car.y ?? 0) + lift, car.z), _turn, _scale.set(1, 1, 1));

        // The body is 3.46 m long; tall vehicles are scaled up from it to keep their old size.
        const K = 1.156;
        const sx = bus ? 1.2 * K : kind === 'fire' ? 1.15 * K : kind === 'ambulance' ? 1.05 * K : kind === 'police' ? 1.04 : vary;
        const sy = bus ? 1.9 * K : kind === 'fire' ? 1.5 * K : kind === 'ambulance' ? 1.35 * K : variant === 2 ? 1.08 : 1;
        const sz = bus ? 2.25 * K : kind === 'fire' ? 1.75 * K : kind === 'ambulance' ? 1.3 * K : kind === 'police' ? 1.1 : vary;

        const cIdx = drawnCars++;
        setPart(carBody.current, cIdx, _base, 0, 0.3 + 0.3 * sy, 0, 0, sx, sy, sz);
        const cabinY = tall ? 0.3 + 0.6 * sy + 0.26 : variant === 2 ? 1.14 : 1.1;
        const cabinZ = tall ? 0 : variant === 1 ? -0.3 : variant === 2 ? -0.2 : -0.12;
        const cabinLong = tall ? sz * 0.98 : variant === 1 ? 0.88 * sz : variant === 2 ? 1.12 * sz : sz;
        setPart(carCabin.current, cIdx, _base, 0, cabinY, cabinZ * sz, 0, tall ? sx * 1.02 : sx, tall ? 0.9 : variant === 2 ? 1.1 : 1, cabinLong);
        _colour.setHex(burnt ? 0x1b1917 : wrecked ? 0x2a2a2d : car.color);
        if (fxc?.dent && !burnt) _colour.multiplyScalar(1 - 0.3 * fxc.dent);
        carBody.current.setColorAt(cIdx, _colour);
        carCabin.current.setColorAt(cIdx, _colour.setHex(burnt ? 0x0b0b0c : fxc?.glass ? 0x8d99a3 : 0x16222c));

        // Light bar on the roof of emergency vehicles, flashing red and blue.
        if (mv && mv.mission && carSirens.current && drawnSirens < MAX_SIRENS - 1) {
          const top = tall ? 0.3 + 0.6 * sy + 0.26 + 0.24 : 1.58;
          const flip = Math.floor(sim.time * 6 + mv.id) % 2 === 0;
          setPart(carSirens.current, drawnSirens, _base, -0.38 * sx, top, 0.2 * sz);
          carSirens.current.setColorAt(drawnSirens, _colour.set(flip ? '#ff2a2a' : '#2a62ff'));
          drawnSirens++;
          setPart(carSirens.current, drawnSirens, _base, 0.38 * sx, top, 0.2 * sz);
          carSirens.current.setColorAt(drawnSirens, _colour.set(flip ? '#2a62ff' : '#ff2a2a'));
          drawnSirens++;
        }

        // Distant LOD: only calculate and render 4 individual wheels when within carLodDist. A burst tyre sits flat; a lost wheel is missing.
        if (distSq <= carLodDistSq && drawnWheels + 4 <= MAX_DRAWN_CARS * 4) {
          const flatBits = fxc?.flat ?? 0;
          const offBits = fxc?.off ?? 0;
          let bit = 1;
          for (let ix = 0; ix < 2; ix++) {
            for (let iz = 0; iz < 2; iz++, bit <<= 1) {
              if (offBits & bit) continue;
              const isFlat = (flatBits & bit) !== 0;
              setPart(carWheels.current, drawnWheels++, _base, (ix ? 0.82 : -0.82) * sx, isFlat ? 0.26 : 0.33, (iz ? 1.1 : -1.1) * sz, 0, 1, isFlat ? 0.72 : 1, isFlat ? 1.1 : 1);
            }
          }
        }

        // Brake lights, indicators and hazards (close up only, by day too).
        if (mv && signals && !burnt && distSq <= signalDistSq && drawnSignals + 4 <= MAX_DRAWN_CARS * 4) {
          const front = 1.73 * sz;
          const ly = 0.3 + 0.3 * sy + 0.1;
          const blink = Math.floor(sim.time * 3.2) % 2 === 0;
          if ((mv.acc ?? 0) < -1.2 || mv.speed < 0.25) {
            lamp(-0.5 * sx, ly, -front, BRAKE_RED, 0.8);
            lamp(0.5 * sx, ly, -front, BRAKE_RED, 0.8);
          }
          if ((fxc?.hazard ?? 0) > 0) {
            if (blink) {
              lamp(-0.72 * sx, ly, front, AMBER, 0.7);
              lamp(0.72 * sx, ly, front, AMBER, 0.7);
              lamp(-0.72 * sx, ly, -front, AMBER, 0.7);
              lamp(0.72 * sx, ly, -front, AMBER, 0.7);
            }
          } else if (mv.signal && blink) {
            // A right turn lights the car's right side, which is its local -x.
            const side = (mv.signal > 0 ? -1 : 1) * 0.72 * sx;
            lamp(side, ly, front, AMBER, 0.7);
            lamp(side, ly, -front, AMBER, 0.7);
          }
        }

        // Headlamps, tail lamps and the beam on the road ahead, only after dark and only for moving traffic.
        if (night && isMoving && carLamps.current && carBeams.current && distSq <= 55 * 55 && drawnLamps + 4 <= MAX_DRAWN_CARS * LAMPS_PER_CAR) {
          const front = 1.73 * sz;
          const y = 0.3 + 0.3 * sy + 0.1;
          setPart(carLamps.current, drawnLamps++, _base, -0.6 * sx, y, front);
          setPart(carLamps.current, drawnLamps++, _base, 0.6 * sx, y, front);
          setPart(carLamps.current, drawnLamps++, _base, -0.6 * sx, y, -front);
          setPart(carLamps.current, drawnLamps++, _base, 0.6 * sx, y, -front);
          if (drawnBeams < MAX_DRAWN_CARS && !burnt && !fxc?.disabled) {
            setPart(carBeams.current, drawnBeams++, _base, 0, 0.1, front + 5, 0, 4 * sx, 1, 10);
          }
        }
      }

      // Wheels that have come off, rolling down the road.
      for (const w of looseWheels) {
        if (drawnWheels >= MAX_DRAWN_CARS * 4) break;
        const dxw = w.x - camX;
        const dzw = w.z - camZ;
        if (dxw * dxw + dzw * dzw > maxDistSq) continue;
        const size = w.life < 1 ? Math.max(0.001, w.life) : 1;
        _turn.setFromEuler(_euler.set(w.spin, w.heading, w.tilt, 'YXZ'));
        _base.compose(_pos.set(w.x, w.y, w.z), _turn, _scale.set(size, size, size));
        carWheels.current.setMatrixAt(drawnWheels++, _base);
      }

      if (signals) {
        signals.count = drawnSignals;
        signals.instanceMatrix.needsUpdate = true;
        if (signals.instanceColor) signals.instanceColor.needsUpdate = true;
      }
      if (carCabin.current.instanceColor) carCabin.current.instanceColor.needsUpdate = true;

      carBody.current.count = drawnCars;
      carCabin.current.count = drawnCars;
      carWheels.current.count = drawnWheels;
      for (const mesh of [carBody.current, carCabin.current, carWheels.current]) mesh.instanceMatrix.needsUpdate = true;
      if (carBody.current.instanceColor) carBody.current.instanceColor.needsUpdate = true;
      if (carSirens.current) {
        carSirens.current.count = drawnSirens;
        carSirens.current.instanceMatrix.needsUpdate = true;
        if (carSirens.current.instanceColor) carSirens.current.instanceColor.needsUpdate = true;
      }
      if (carLamps.current && carBeams.current) {
        carLamps.current.visible = carBeams.current.visible = night;
        if (night) {
          carLamps.current.count = drawnLamps;
          carBeams.current.count = drawnBeams;
          carLamps.current.instanceMatrix.needsUpdate = true;
          carBeams.current.instanceMatrix.needsUpdate = true;
        }
      }
    }

    // --- Trains -----------------------------------------------------------------
    if (trainBody.current && trainBand.current && trainWindows.current && trainBogies.current) {
      let n = 0;
      let b = 0;
      for (const line of [sim.trains, sim.trams, sim.monorails]) {
        const [sx, sy, sz] = line.profile.scale;
        const lift = line.profile.lift;
        for (const train of line.trains) {
        train.poses.forEach((pose, k) => {
          if (!pose.visible) return;
          _turn.setFromAxisAngle(UP, pose.heading);
          _base.compose(_pos.set(pose.x, lift, pose.z), _turn, _scale.set(sx, sy, sz));
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
      <instancedMesh key={`body-${stylised}`} ref={carBody} args={[bodyGeometry, undefined, MAX_DRAWN_CARS]} frustumCulled={false} castShadow receiveShadow>
        <meshStandardMaterial roughness={stylised ? 0.55 : 0.3} metalness={stylised ? 0.12 : 0.5} />
      </instancedMesh>
      <instancedMesh key={`cabin-${stylised}`} ref={carCabin} args={[cabinGeometry, undefined, MAX_DRAWN_CARS]} frustumCulled={false} castShadow material={carGlass} />
      <instancedMesh ref={carWheels} args={[wheelGeometry, undefined, MAX_DRAWN_CARS * 4]} frustumCulled={false} castShadow material={rubber} />
      <instancedMesh ref={carLamps} args={[lampGeometry, undefined, MAX_DRAWN_CARS * LAMPS_PER_CAR]} frustumCulled={false} visible={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={carSignals} args={[lampGeometry, undefined, MAX_DRAWN_CARS * 4]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={carSirens} args={[sirenGeometry, undefined, MAX_SIRENS]} frustumCulled={false}>
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

      <IncidentLayer />
      <DisasterLayer />
      <PeopleLayer />
      <MonsterLayer />
    </>
  );
}
