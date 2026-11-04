import type * as THREE from 'three';
import { CELL, PIECES, presetStyle, type PieceType } from '../city/catalog';
import { viewState, virtualInput, virtualKeys } from '../engine/viewState';
import { combat } from '../sim/combat';
import { sim, type Car } from '../sim/simulation';
import { useDisasterStore } from '../sim/disasters';
import { vehicle } from '../sim/vehicle';
import { useCityStore, type Piece } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { useBuilderStore } from '../state/useBuilderStore';
import { useBuildRulesStore } from '../state/useBuildRulesStore';
import { useWeatherStore } from '../state/useWeatherStore';
import { useTerrainStore } from '../terrain/terrain';
import type { LessonId } from './lessons';

export const practiceView: { camera: THREE.Camera | null } = { camera: null };
export const ROAD_TARGET = [0, 1] as const;
export const HOUSE_TARGET = [1, 1] as const;
let initialized = false;

function piece(type: PieceType, gx: number, gz: number): Piece {
  const def = PIECES[type];
  return { id: `practice-${type}-${gx}-${gz}`, type, gx, gz, rot: 0, floors: def.floors,
    facade: def.look?.facade ?? 'plaster', roof: def.look?.roof ?? 'slate', ...presetStyle(type) };
}

export function initializePractice() {
  if (initialized) return;
  initialized = true;
  const pieces: Piece[] = [];
  for (let x = -5; x <= 5; x++) pieces.push(piece('road', x, 0));
  for (let z = 1; z <= 6; z++) pieces.push(piece('road', -2, z));
  for (const x of [-4, -1, 2]) pieces.push(piece('house', x, -2));
  pieces.push(piece('park', 4, 2), piece('tree', -4, 2));
  useTerrainStore.getState().setCells({});
  useCityStore.getState().setPieces(pieces);
  useBuildRulesStore.setState({ construction: 'instant' });
  useDisasterStore.setState({ mode: 'off' });
  useGameStore.setState((s) => ({ mode: 'build', roamSubMode: 'peaceful', flying: false,
    graphics: { ...s.graphics, population: 'off', bloom: false, showFps: false } }));
  useWeatherStore.setState((s) => ({ hour: 10, hourSet: s.hourSet + 1, speed: 'off', weather: 'clear' }));
  useBuilderStore.setState({ hand: true, selectedId: null, selectedIds: [] });
  Object.assign(viewState, { x: 0, z: 3, yaw: Math.PI / 4, pitch: 0.9, dist: 65 });
}

function teleport(x: number, z: number, yaw: number) {
  Object.assign(viewState, { x, z, yaw });
  combat.respawn = { x, z };
  practiceView.camera?.rotation.set(0, yaw, 0, 'YXZ');
}

function trainingCar(): Car {
  return { id: 900001, kind: 'car', x: 3, z: 18, heading: 0, speed: 0,
    from: [0, 3], to: [0, 4], next: null, prev: null, t: 0, lanePrev: 0, lane: 0, laneNext: 0,
    vMax: 1, length: 3.5, color: 0x38bdf8, holding: null, dwell: 0, stoppedAt: null, stuck: 0,
    reckless: false, runLight: false, pull: 0, wreck: 0, honk: 0, route: [], abandoned: 3600 };
}

export function prepareLesson(id: LessonId) {
  if (document.pointerLockElement) document.exitPointerLock();
  virtualKeys.clear();
  Object.assign(virtualInput, { moveX: 0, moveY: 0, jump: false, down: false, attack: false, sprint: false, horn: false });
  combat.setCrouch(virtualInput.crouch);
  if (id === 'road' || id === 'house') {
    useGameStore.getState().setMode('build');
    useBuilderStore.setState({ tool: id, hand: false });
    Object.assign(viewState, { x: 3, z: 6, dist: 45 });
  }
  if (id === 'walk') {
    useGameStore.getState().setRoamSubMode('peaceful');
    useGameStore.getState().setMode('roam');
    teleport(3, 9, Math.PI);
  }
  if (id === 'enter') {
    if (vehicle.active) vehicle.exit();
    sim.cars = [trainingCar()];
    teleport(5.5, 18, Math.PI / 2);
  }
  if (id === 'survival') {
    if (vehicle.active) vehicle.exit();
    sim.cars = [];
    useGameStore.getState().setRoamSubMode('survival');
    teleport(3, 9, 0);
  }
  if (id === 'torch') combat.player.flashlight = false;
  if (id === 'attack') { combat.selectWeapon('fists'); combat.player.cooldown = 0; combat.player.swing = 0; }
  if (id === 'hide') {
    const door = sim.world.destinations.find((d) => d.kind === 'door');
    if (door) teleport(door.point.x - Math.sin(door.facing) * 1.8, door.point.z - Math.cos(door.facing) * 1.8, door.facing + Math.PI);
  }
}

export function observation() {
  const camera = practiceView.camera;
  return { x: viewState.x, z: viewState.z, yaw: camera?.rotation.y ?? 0,
    builderX: viewState.x, builderZ: viewState.z, builderYaw: viewState.yaw, dist: viewState.dist,
    carX: vehicle.car?.x ?? 0, carZ: vehicle.car?.z ?? 0 };
}
export type Observation = ReturnType<typeof observation>;

export function lessonPassed(id: LessonId, baseline: Observation): boolean {
  const now = observation();
  switch (id) {
    case 'welcome': case 'finish': return true;
    case 'camera': return Math.abs(now.builderYaw - baseline.builderYaw) > 0.08 || Math.abs(now.dist - baseline.dist) > 3 || Math.hypot(now.builderX - baseline.builderX, now.builderZ - baseline.builderZ) > 2;
    case 'road': case 'house': {
      const [gx, gz] = id === 'road' ? ROAD_TARGET : HOUSE_TARGET;
      return Object.values(useCityStore.getState().pieces).some((p) => p.type === id && p.gx === gx && p.gz === gz);
    }
    case 'walk': return Math.hypot(now.x - baseline.x, now.z - baseline.z) > 3 && Math.abs(now.yaw - baseline.yaw) > 0.12;
    case 'enter': return vehicle.active;
    case 'drive': return vehicle.active && Math.hypot(now.carX - baseline.carX, now.carZ - baseline.carZ) > CELL;
    case 'exit': return !vehicle.active;
    case 'survival': return combat.active && combat.run.active && !combat.run.intro;
    case 'crouch': return combat.player.crouching;
    case 'torch': return combat.player.flashlight;
    case 'attack': return combat.player.swing > 0 || combat.player.cooldown > 0;
    case 'hide': return !!combat.player.shelter;
    case 'leave': return !combat.player.shelter;
  }
}
