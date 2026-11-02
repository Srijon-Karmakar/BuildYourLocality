import { CELL } from '../city/catalog';
import { cellKey, useCityStore } from '../state/useCityStore';
import { cellPath, samplePath } from './paths';
import { AircraftSystem } from './aircraft';
import { ShipSystem } from './ships';
import { TrainSystem } from './trains';
import { findPath } from './pathfinding';
import { SignalController, lightFor, type Axis } from './signals';
import { atmo } from '../scenes/atmosphere';
import {
  DIRS,
  buildWorld,
  cellCentre,
  cellOf,
  emptyWorld,
  isWalkable,
  type Destination,
  type DestinationKind,
  type SimWorld,
} from './world';

export type Density = 'off' | 'low' | 'normal' | 'busy';
const DENSITY: Record<Density, number> = { off: 0, low: 0.5, normal: 1, busy: 1.6 };

export const MAX_CARS = 48;
export const MAX_PEOPLE = 90;
/** Lane offset (metres) used where a cell has no road data. */
const DEFAULT_LANE = 1.35;
/** Deceleration planned for when approaching a stop; real braking (BRAKE_MAX) is stronger, so cars never overshoot. */
const BRAKE_PLAN = 4;
const BRAKE_MAX = 12;
/** Seconds without moving before a car is assumed to be gridlocked and removed. */
const STUCK_LIMIT = 60;

// --- Vehicles ------------------------------------------------------------------

export interface Car {
  id: number;
  kind: 'car' | 'bus' | 'taxi';
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Road cells of the current segment (centre to centre) and the cell after it. */
  from: [number, number];
  to: [number, number];
  next: [number, number] | null;
  /** The cell before `from` (null just after spawning). */
  prev: [number, number] | null;
  /** Progress along the segment, 0..1. */
  t: number;
  /** Lane (0 = nearest the centre line) at the entry of `from`, at `from`/`to`, and at the exit of `to`. */
  lanePrev: number;
  lane: number;
  laneNext: number;
  /** How hard this driver pushes the speed limit (about 0.85-1.1). */
  vMax: number;
  length: number;
  color: number;
  /** Junction cell this car currently holds exclusively. */
  holding: string | null;
  /** Seconds left standing at a bus stop. */
  dwell: number;
  stoppedAt: string | null;
  /** Seconds spent unable to move; very long means gridlock and the car is removed. */
  stuck: number;
}

const CAR_COLOURS = [0xd7263d, 0x1b6ca8, 0xf2f2f2, 0x222831, 0xf4b942, 0x2e933c, 0x8d99ae, 0xe36414, 0x6a4c93];

// --- Pedestrians ---------------------------------------------------------------

export type PedState =
  | 'idle'
  | 'walking'
  | 'busy'
  | 'greeting'
  | 'sitting'
  | 'waiting'
  | 'entering'
  | 'inside'
  | 'chatting'
  | 'fleeing'
  | 'cowering'
  | 'stalking'
  | 'mugging'
  | 'chasing'
  | 'fighting'
  | 'down';

/** What a person is up to beyond everyday life: most are civilians; thieves and thugs make trouble for the player. */
export type PedRole = 'civilian' | 'thief' | 'thug';

export interface Ped {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: PedState;
  path: { x: number; z: number }[];
  goal: Destination | null;
  timer: number;
  /** 0..1 body scale: shrinks while stepping through a door. */
  vis: number;
  walkSpeed: number;
  phase: number;
  jitterX: number;
  jitterZ: number;
  /** Seconds waited for a car to pass. */
  yielded: number;
  /** Signalled junction this person is waiting at for the walk signal. */
  signalWait: string | null;
  greetCooldown: number;
  /** Temperament 0..1: how easily they lose their temper. */
  temper: number;
  /** Anger 0..100. Builds when bumped or attacked and cools off over time. */
  rage: number;
  role: PedRole;
  hp: number;
  maxHp: number;
  /** Emoji shown above the head (anger, fear, ...) and for how long. */
  emote: string | null;
  emoteTimer: number;
  /** Cash taken from the player, dropped if the thief is caught. */
  stolen: number;
  /** Seconds before they can attack / be bumped again. */
  actionCooldown: number;
  /** Seconds this person has been hostile or afraid; they settle down after a while. */
  mood: number;
  /** How far they have fallen over (0 standing .. 1 flat) when knocked down. */
  fall: number;
  /** Brief white flash after being hit. */
  flash: number;
  /** Punch / grab animation, 1 at the start of a swing falling to 0. */
  swing: number;
  knockX: number;
  knockZ: number;
  chatWith: number | null;
  chatCooldown: number;
  /** Carries a gun (robbers in survival mode). */
  armed: boolean;
  /** Construction crew duty (see construction.ts). */
  job: 'builder' | null;
  /** Piece id of the building site they work on. */
  site: string | null;
  duty: 'hammer' | 'haul' | 'foreman';
  task: string;
  taskTimer: number;
  hardHat: boolean;
  hatColour: number;
  carrying: boolean;
  tool: boolean;
  /** Looks. */
  hair: number;
  hairStyle: number;
  bag: boolean;
  bagColour: number;
  coat: boolean;
  height: number;
  shirt: number;
  pants: number;
  skin: number;
  remove: boolean;
}

const SHIRTS = [0xe63946, 0x457b9d, 0xf1faee, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6d597a, 0x8ecae6, 0x588157, 0xffffff];
const PANTS = [0x1d3557, 0x2b2d42, 0x6c584c, 0x264653, 0x3d405b, 0x4a4e69];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423];
const HAIRS = [0x1b1511, 0x2c1b10, 0x4a3020, 0x7a5230, 0xb08a4a, 0xd7c27a, 0x8a8a8a, 0x2b2b2b, 0x8c3b22];
const BAGS = [0x2a2f3a, 0x7a3b2e, 0x2e5d4a, 0x8a6a2e, 0x3d3d3d];

const HOSTILE_STATES = new Set<PedState>(['fleeing', 'cowering', 'stalking', 'mugging', 'chasing', 'fighting', 'down']);

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const range = (a: number, b: number) => a + Math.random() * (b - a);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The living city: cars and buses drive the road network (queueing, taking turns at
 * junctions, obeying traffic lights, stopping for people), and pedestrians walk, sit on
 * benches, wait for buses, browse kiosks and billboards, and go in and out of buildings.
 * Everything is derived from the placed pieces, so building or deleting changes it live.
 */
export class Simulation {
  world: SimWorld = emptyWorld();
  cars: Car[] = [];
  peds: Ped[] = [];
  time = 0;
  density: Density = 'normal';
  /** The player's position in walk mode: vehicles brake for them and people greet them. */
  player = { x: 0, z: 0, active: false };

  /** Set by the combat system: handles hostile / frightened / knocked-down people. Returns true when it moved them. */
  pedHook: ((ped: Ped, dt: number) => boolean) | null = null;
  /** Set by the construction system: runs after the combat hook and drives builders. */
  workHook: ((ped: Ped, dt: number) => boolean) | null = null;

  private dirty = true;
  private nextId = 1;
  private junctionOwner = new Map<string, number>();
  /** One adaptive signal per junction that has a traffic light beside it. */
  readonly controllers = new Map<string, SignalController>();
  /** Trains on the railway (see trains.ts). */
  readonly trains: TrainSystem = new TrainSystem(this);
  /** Aircraft using the airfield (see aircraft.ts). */
  readonly aircraft: AircraftSystem = new AircraftSystem(this);
  /** Ships sailing to and from the port (see ships.ts). */
  readonly ships: ShipSystem = new ShipSystem(this);
  /** Cars sitting in parking lots, by lot: which bays are taken and when each leaves. */
  private readonly lots = new Map<string, { bays: (number | null)[]; leaving: { at: number; bay: number }[] }>();
  private spawnTimer = 0;

  markDirty() {
    this.dirty = true;
  }

  private ambient = 1;

  setDensity(density: Density) {
    this.density = density;
  }

  /** Scales how busy the city is (the day/night cycle quietens the streets after dark and in bad weather). */
  setAmbient(level: number) {
    this.ambient = Math.max(0, Math.min(1, level));
  }

  setPlayer(x: number, z: number, active: boolean) {
    this.player.x = x;
    this.player.z = z;
    this.player.active = active;
  }

  /** True when a vehicle or person is within `radius` of the point (used by smart streetlights). */
  activityNear(x: number, z: number, radius: number): boolean {
    const r2 = radius * radius;
    for (const c of this.cars) if ((c.x - x) ** 2 + (c.z - z) ** 2 < r2) return true;
    for (const p of this.peds) if (p.vis > 0.5 && (p.x - x) ** 2 + (p.z - z) ** 2 < r2) return true;
    return this.player.active && (this.player.x - x) ** 2 + (this.player.z - z) ** 2 < r2;
  }

  update(dt: number) {
    this.time += dt;
    if (this.dirty) this.rebuild();
    const factor = DENSITY[this.density] * this.ambient;
    this.manage(dt, factor);
    this.updateSignals(dt);
    for (const car of this.cars) this.updateCar(car, dt);
    this.cars = this.cars.filter((c) => !this.releaseIfGone(c));
    this.trains.update(dt, factor);
    this.aircraft.update(dt, factor);
    this.ships.update(dt, factor);
    this.updateLots();
    for (const ped of this.peds) this.updatePed(ped, dt);
    this.peds = this.peds.filter((p) => !p.remove);
  }

  // --- World changes -------------------------------------------------------------

  private rebuild() {
    this.dirty = false;
    this.world = buildWorld(Object.values(useCityStore.getState().pieces));
    this.trains.rebuild();
    this.aircraft.rebuild();
    this.ships.rebuild();
    this.syncLots();
    // Keep the state of signals that still exist; add new ones; drop removed ones.
    for (const key of [...this.controllers.keys()]) if (!this.world.signalled.has(key)) this.controllers.delete(key);
    for (const key of this.world.signalled) if (!this.controllers.has(key)) this.controllers.set(key, new SignalController());
    // Vehicles on road that no longer exists are removed; the rest carry on.
    for (const car of this.cars) {
      const ok = this.world.roads.has(cellKey(...car.from)) && this.world.roads.has(cellKey(...car.to));
      if (!ok) car.stuck = 999;
      else car.next = this.pickNext(car.from, car.to);
    }
    for (const ped of this.peds) {
      const [gx, gz] = [cellOf(ped.x), cellOf(ped.z)];
      const insideSeat = ped.state === 'sitting' || ped.state === 'inside' || ped.state === 'entering';
      if (!insideSeat && !isWalkable(this.world, gx, gz)) ped.remove = true;
      // Goals whose piece is gone are forgotten.
      if (ped.goal && !this.world.destinations.some((d) => d.pieceId === ped.goal!.pieceId && d.kind === ped.goal!.kind)) {
        if (ped.state === 'walking' || ped.state === 'busy') {
          ped.goal = null;
          ped.path = [];
          ped.state = 'idle';
        } else if (ped.state !== 'inside') {
          ped.remove = true;
        }
      }
    }
    this.cars = this.cars.filter((c) => !this.releaseIfGone(c));
  }

  private releaseIfGone(car: Car): boolean {
    if (car.stuck < STUCK_LIMIT) return false;
    if (car.holding) this.junctionOwner.delete(car.holding);
    return true;
  }

  // --- Population ----------------------------------------------------------------

  private manage(dt: number, factor: number) {
    const { stats, roads } = this.world;
    const carTarget = Math.round(Math.min(MAX_CARS, roads.size * 0.3) * factor);
    const pedTarget = Math.round(Math.min(MAX_PEOPLE, stats.buildings * 2.5 + stats.greens * 3 + this.world.destinations.length) * factor);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.35;
      if (this.cars.length < carTarget) this.spawnCar();
      if (this.peds.length < pedTarget) this.spawnPed();
    }
    // Shrink the crowd after the player lowers density or deletes things.
    if (this.cars.length > carTarget + 1) {
      const extra = this.cars.find((c) => !c.holding);
      if (extra) extra.stuck = 999;
    }
    if (this.peds.length > pedTarget + 2) {
      const p = this.peds.find((x) => x.state === 'idle' || x.state === 'walking');
      if (p) p.remove = true;
    }
  }

  private spawnCar(from?: { key: string; color: number }): boolean {
    const { roads, busStops, junctions, depotRoads, taxiByRoad } = this.world;
    const keys = [...roads.entries()].filter(([k, m]) => m !== 0 && !junctions.has(k));
    if (keys.length === 0) return false;
    const buses = this.cars.filter((c) => c.kind === 'bus').length;
    const taxis = this.cars.filter((c) => c.kind === 'taxi').length;
    const wantBus = !from && (busStops.length > 0 || depotRoads.length > 0) && buses < Math.min(4, busStops.length * 2 + depotRoads.length) && Math.random() < 0.35;
    const wantTaxi = !from && !wantBus && taxiByRoad.size > 0 && taxis < Math.min(4, taxiByRoad.size * 2) && Math.random() < 0.3;
    // Buses start at a depot when there is one; cars leaving a car park start on its road.
    const depotKeys = wantBus ? keys.filter(([k]) => depotRoads.includes(k)) : [];
    const pool = from ? keys.filter(([k]) => k === from.key) : depotKeys.length > 0 && Math.random() < 0.8 ? depotKeys : keys;
    if (pool.length === 0) return false;
    const [key, mask] = pick(pool);
    const [gx, gz] = key.split(',').map(Number);
    const dirs = DIRS.filter((d) => mask & d.bit && this.allowed([gx, gz], [gx + d.dx, gz + d.dz]));
    if (dirs.length === 0) return false;
    const dir = pick(dirs);
    const to: [number, number] = [gx + dir.dx, gz + dir.dz];
    const x = cellCentre(gx);
    const z = cellCentre(gz);
    if (this.cars.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < 100)) return false;

    const bus = wantBus;
    const car: Car = {
      id: this.nextId++,
      kind: bus ? 'bus' : wantTaxi ? 'taxi' : 'car',
      x,
      z,
      heading: Math.atan2(dir.dx, dir.dz),
      speed: 0,
      from: [gx, gz],
      to,
      next: null,
      prev: null,
      t: 0,
      lanePrev: 0,
      lane: 0,
      laneNext: 0,
      vMax: bus ? range(0.7, 0.85) : range(0.85, 1.1),
      length: bus ? 9 : 4,
      color: bus ? pick([0xf2b134, 0x1b6ca8, 0xd7263d]) : wantTaxi ? 0xf6c31c : (from?.color ?? pick(CAR_COLOURS)),
      holding: null,
      dwell: 0,
      stoppedAt: null,
      stuck: 0,
    };
    car.next = this.pickNext(car.from, car.to);
    car.lane = Math.floor(Math.random() * this.perDir(car.from));
    car.lanePrev = car.lane;
    car.laneNext = this.pickLane(car.lane, car.to);
    this.placeCar(car);
    this.cars.push(car);
    return true;
  }

  /** Sends a person walking to a cell (and then to an exact point). Returns false if there is no route. */
  sendTo(ped: Ped, cell: [number, number], point: { x: number; z: number } | null): boolean {
    if (!this.routeTo(ped, cell, point)) return false;
    ped.goal = null;
    ped.state = 'walking';
    return true;
  }

  /** Adds a new person at a spot (used to bring extra workers to a building site). */
  spawnPedAt(x: number, z: number): Ped | null {
    if (this.peds.length >= MAX_PEOPLE) return null;
    this.spawnPed({ x, z });
    return this.peds[this.peds.length - 1] ?? null;
  }

  private spawnPed(at?: { x: number; z: number }) {
    const { destinations, bounds } = this.world;
    if (!bounds) return;
    let x = 0;
    let z = 0;
    const doors = destinations.filter((d) => d.kind === 'door');
    if (at) {
      x = at.x;
      z = at.z;
    } else if (doors.length > 0 && Math.random() < 0.7) {
      const door = pick(doors);
      x = door.point.x - Math.sin(door.facing) * 1.8;
      z = door.point.z - Math.cos(door.facing) * 1.8;
    } else {
      x = cellCentre(Math.floor(range(bounds.minX, bounds.maxX + 1)));
      z = cellCentre(Math.floor(range(bounds.minZ, bounds.maxZ + 1)));
    }
    if (!at && !isWalkable(this.world, cellOf(x), cellOf(z))) return;
    this.peds.push({
      id: this.nextId++,
      x,
      z,
      heading: range(-Math.PI, Math.PI),
      speed: 0,
      state: 'idle',
      path: [],
      goal: null,
      timer: 0,
      vis: 1,
      walkSpeed: range(1.7, 2.6),
      phase: range(0, 6),
      jitterX: range(-1.3, 1.3),
      jitterZ: range(-1.3, 1.3),
      yielded: 0,
      signalWait: null,
      greetCooldown: range(0, 6),
      temper: Math.random() ** 1.6,
      rage: 0,
      role: 'civilian',
      hp: 40,
      maxHp: 40,
      emote: null,
      emoteTimer: 0,
      stolen: 0,
      actionCooldown: 0,
      mood: 0,
      fall: 0,
      flash: 0,
      swing: 0,
      knockX: 0,
      knockZ: 0,
      chatWith: null,
      chatCooldown: range(0, 12),
      armed: false,
      job: null,
      site: null,
      duty: 'hammer',
      task: '',
      taskTimer: 0,
      hardHat: false,
      hatColour: 0xffd21f,
      carrying: false,
      tool: false,
      hair: pick(HAIRS),
      hairStyle: Math.random() < 0.12 ? 0 : 1 + Math.floor(Math.random() * 3),
      bag: Math.random() < 0.28,
      bagColour: pick(BAGS),
      coat: Math.random() < 0.22,
      height: range(0.92, 1.08),
      shirt: pick(SHIRTS),
      pants: pick(PANTS),
      skin: pick(SKINS),
      remove: false,
    });
  }

  // --- Vehicles ------------------------------------------------------------------

  private dirIndex(a: [number, number], b: [number, number]): number {
    return DIRS.findIndex((d) => d.dx === Math.sign(b[0] - a[0]) && d.dz === Math.sign(b[1] - a[1]));
  }

  /** Picks the cell after `cur`, favouring straight on and avoiding turning back unless at a dead end. */
  private pickNext(prev: [number, number], cur: [number, number]): [number, number] | null {
    const mask = this.world.roads.get(cellKey(cur[0], cur[1])) ?? 0;
    const incoming = this.dirIndex(prev, cur);
    if (incoming < 0) return null;
    const back = (incoming + 2) % 4;
    const options = DIRS.map((d, i) => ({ d, i })).filter(
      ({ d, i }) => mask & d.bit && i !== back && this.allowed(cur, [cur[0] + d.dx, cur[1] + d.dz]),
    );
    if (options.length === 0) {
      const reverse: [number, number] = [cur[0] + DIRS[back].dx, cur[1] + DIRS[back].dz];
      return mask & DIRS[back].bit && this.allowed(cur, reverse) ? reverse : null;
    }
    const weights = options.map(({ i }) => (i === incoming ? 3 : 1));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k];
      if (roll <= 0) return [cur[0] + options[k].d.dx, cur[1] + options[k].d.dz];
    }
    const last = options[options.length - 1].d;
    return [cur[0] + last.dx, cur[1] + last.dz];
  }

  /** Buses stop at bus stops, taxis at taxi stands. */
  private servesStop(car: Car, key: string): boolean {
    return (car.kind === 'bus' && this.world.busByRoad.has(key)) || (car.kind === 'taxi' && this.world.taxiByRoad.has(key));
  }

  // --- Car parks ---------------------------------------------------------------------------

  /** Keeps a record of each lot's bays: new lots start part full, removed lots are forgotten. */
  private syncLots() {
    const live = new Set(this.world.parkingLots.map((l) => l.pieceId));
    for (const id of [...this.lots.keys()]) if (!live.has(id)) this.lots.delete(id);
    for (const lot of this.world.parkingLots) {
      if (this.lots.has(lot.pieceId)) continue;
      const bays: (number | null)[] = lot.bays.map(() => (Math.random() < 0.45 ? pick(CAR_COLOURS) : null));
      const leaving = bays.flatMap((c, bay) => (c !== null && Math.random() < 0.6 ? [{ at: this.time + range(8, 90), bay }] : []));
      this.lots.set(lot.pieceId, { bays, leaving });
    }
  }

  /** A passing car sometimes turns into the car park beside the road. */
  private tryPark(car: Car, key: string): boolean {
    for (const lot of this.world.parkingLots) {
      if (lot.roadCell !== key) continue;
      const state = this.lots.get(lot.pieceId);
      const free = state ? state.bays.flatMap((c, i) => (c === null ? [i] : [])) : [];
      if (!state || free.length === 0 || Math.random() > 0.12) continue;
      const bay = pick(free);
      state.bays[bay] = car.color;
      state.leaving.push({ at: this.time + range(25, 70), bay });
      car.stuck = 999; // it has parked
      return true;
    }
    return false;
  }

  /** Parked cars drive off again when their time is up. */
  private updateLots() {
    for (const lot of this.world.parkingLots) {
      const state = this.lots.get(lot.pieceId);
      if (!state || !lot.roadCell) continue;
      const due = state.leaving.findIndex((l) => l.at <= this.time);
      if (due < 0) continue;
      const { bay } = state.leaving[due];
      const color = state.bays[bay];
      if (color === null || this.spawnCar({ key: lot.roadCell, color })) {
        state.bays[bay] = null;
        state.leaving.splice(due, 1);
      } else {
        state.leaving[due].at = this.time + 3; // road busy: try again shortly
      }
    }
  }

  /** Every parked car, for drawing. */
  parkedCars(): { x: number; z: number; heading: number; color: number }[] {
    const out: { x: number; z: number; heading: number; color: number }[] = [];
    for (const lot of this.world.parkingLots) {
      const state = this.lots.get(lot.pieceId);
      if (!state) continue;
      state.bays.forEach((color, i) => {
        if (color !== null) out.push({ ...lot.bays[i], color });
      });
    }
    return out;
  }

  /** One-way streets: no moving against the arrow along the road's own axis. */
  private allowed(a: [number, number], b: [number, number]): boolean {
    const d = this.dirIndex(a, b);
    if (d < 0) return false;
    for (const cell of [a, b]) {
      const oneWay = this.world.roadInfo.get(cellKey(cell[0], cell[1]))?.oneWay;
      if (oneWay !== null && oneWay !== undefined && oneWay % 2 === d % 2 && oneWay !== d) return false;
    }
    return true;
  }

  private info(cell: [number, number]) {
    return this.world.roadInfo.get(cellKey(cell[0], cell[1]));
  }

  /** Lanes a vehicle can use in one direction on this cell. */
  private perDir(cell: [number, number]): number {
    return this.info(cell)?.layout.perDir ?? 1;
  }

  /** Lane offset (metres right of the centre line) of a lane on a cell. */
  private laneOffset(cell: [number, number] | null, lane: number): number {
    const offsets = cell ? this.info(cell)?.layout.laneOffsets : undefined;
    return offsets && offsets.length > 0 ? offsets[Math.min(lane, offsets.length - 1)] : DEFAULT_LANE;
  }

  /** Offset at the shared edge of two cells: halfway between their lane positions. */
  private boundaryOffset(a: [number, number] | null, b: [number, number] | null, lane: number): number {
    if (!a) return this.laneOffset(b, lane);
    if (!b) return this.laneOffset(a, lane);
    return (this.laneOffset(a, lane) + this.laneOffset(b, lane)) / 2;
  }

  /** Mostly keep the lane; sometimes drift to another one on roads that have several. */
  private pickLane(current: number, cell: [number, number]): number {
    const lanes = this.perDir(cell);
    if (lanes <= 1) return 0;
    return Math.random() < 0.7 ? Math.min(current, lanes - 1) : Math.floor(Math.random() * lanes);
  }

  /** Does the signal at this junction (if any) currently let this axis through? */
  private signalGreen(key: string, axis: Axis): boolean {
    if (!this.world.signalled.has(key)) return true;
    const controller = this.controllers.get(key);
    return (controller ? controller.colour(axis) : lightFor(axis, this.time)) === 'green';
  }

  /** The sensors: how many vehicles are approaching each road and how many people are waiting to cross. */
  private updateSignals(dt: number) {
    if (this.controllers.size === 0) return;
    const demand = new Map<string, { ns: number; ew: number; peds: number }>();
    for (const key of this.controllers.keys()) demand.set(key, { ns: 0, ew: 0, peds: 0 });

    for (const car of this.cars) {
      const segDir = this.dirIndex(car.from, car.to);
      if (segDir < 0) continue;
      const toKey = cellKey(car.to[0], car.to[1]);
      const nextKey = car.next ? cellKey(car.next[0], car.next[1]) : null;
      let key: string | null = null;
      let room = Infinity;
      let dir = segDir;
      if (demand.has(toKey) && car.holding !== toKey) {
        key = toKey;
        room = (0.5 - car.t) * CELL;
      } else if (nextKey && demand.has(nextKey) && car.holding !== nextKey && car.next) {
        key = nextKey;
        room = (1.5 - car.t) * CELL;
        dir = this.dirIndex(car.to, car.next);
      }
      // A vehicle counts while it is within sensor range of the stop line.
      if (key && room < 24 && dir >= 0) demand.get(key)![dir % 2 === 0 ? 'ns' : 'ew']++;
    }
    for (const ped of this.peds) if (ped.signalWait) demand.get(ped.signalWait)!.peds++;

    for (const [key, controller] of this.controllers) controller.update(dt, demand.get(key)!);
  }

  /** The signal controlling the junction beside a traffic light standing at this spot, if there is one. */
  signalAt(x: number, z: number): SignalController | null {
    const gx = cellOf(x);
    const gz = cellOf(z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const controller = this.controllers.get(cellKey(gx + dx, gz + dz));
        if (controller) return controller;
      }
    }
    return null;
  }

  /** Is anyone on, or about to step onto, the zebra crossing in this road cell? */
  private crossingBusy(key: string): boolean {
    const [gx, gz] = key.split(',').map(Number);
    const reach = Math.max(CELL / 2, (this.info([gx, gz])?.layout.width ?? CELL) / 2) + 0.8;
    const cx = cellCentre(gx);
    const cz = cellCentre(gz);
    const inside = (x: number, z: number) => Math.abs(x - cx) < reach && Math.abs(z - cz) < reach;
    for (const p of this.peds) if (p.vis > 0.5 && p.state !== 'sitting' && inside(p.x, p.z)) return true;
    return this.player.active && inside(this.player.x, this.player.z);
  }

  /** Would this car be refused entry to the junction right now? (No reservation is made.) */
  /** How far along the approach segment a car waits: well back from rails at level crossings, just short of junctions. */
  private stopLine(key: string): number {
    return this.world.levelCrossings.has(key) ? 0.17 : 0.45;
  }

  /** Barriers are down at the level crossing in this cell, or at the one under this point. */
  crossingClosed(x: number, z: number): boolean {
    return this.trains.closed.has(cellKey(cellOf(x), cellOf(z)));
  }

  /** Is a vehicle sitting in the level crossing (so a train must wait)? */
  crossingHeldByCar(key: string): boolean {
    const [gx, gz] = key.split(',').map(Number);
    const cx = cellCentre(gx);
    const cz = cellCentre(gz);
    return this.cars.some((c) => Math.abs(c.x - cx) < 4.2 && Math.abs(c.z - cz) < 4.2);
  }

  /** Passengers from an aircraft that has parked step out of the terminal. */
  passengersAtTerminal(count: number) {
    const exits = this.world.terminalExits;
    if (exits.length === 0) return;
    for (let i = 0; i < count && this.peds.length < MAX_PEOPLE; i++) {
      const spot = pick(exits);
      this.spawnPed({ x: spot.x + range(-1.5, 1.5), z: spot.z + range(-1.5, 1.5) });
    }
  }

  /** People step off a train that has stopped at a station. */
  passengersAlight(key: string, count: number) {
    const station = this.world.stations.get(key);
    if (!station) return;
    for (let i = 0; i < count && this.peds.length < MAX_PEOPLE; i++) this.spawnPed({ x: station.x, z: station.z });
  }

  /** Would this car be refused entry to the junction right now? (No reservation is made.) */
  private junctionBlocked(car: Car, key: string, axis: Axis): boolean {
    if (this.trains.closed.has(key)) return true;
    const owner = this.junctionOwner.get(key);
    if (owner !== undefined && owner !== car.id && this.cars.some((c) => c.id === owner)) return true;
    return !this.signalGreen(key, axis);
  }

  /** Claims a junction if it is free and (when it has traffic lights) green for this direction. */
  private tryReserve(car: Car, key: string, axis: Axis): boolean {
    // With the barriers down only a car already past the stop line may carry on, and only while no train is on the crossing.
    if (this.trains.closed.has(key) && (car.t <= this.stopLine(key) + 0.02 || this.trains.occupied(key))) return false;
    const owner = this.junctionOwner.get(key);
    if (owner !== undefined && owner !== car.id && this.cars.some((c) => c.id === owner)) return false;
    if (!this.signalGreen(key, axis)) return false;
    this.junctionOwner.set(key, car.id);
    return true;
  }

  private updateCar(car: Car, dt: number) {
    const segDir = this.dirIndex(car.from, car.to);
    if (segDir < 0) {
      car.stuck = 999;
      return;
    }
    const dir = DIRS[segDir];
    const toKey = cellKey(car.to[0], car.to[1]);
    let target = car.vMax * Math.min(this.info(car.from)?.layout.speedLimit ?? 7, this.info(car.to)?.layout.speedLimit ?? 7);

    // Slow for turns and dead ends.
    const nextDir = car.next ? this.dirIndex(car.to, car.next) : segDir;
    if (nextDir !== segDir && car.t > 0.4) target = Math.min(target, 3.6);

    // Take turns at junctions; wait at the stop line (just before the cell) otherwise.
    const axis: Axis = dir.dx !== 0 ? 1 : 0;
    if (this.world.junctions.has(toKey) && car.holding !== toKey) {
      if (car.t >= 0.12 && this.tryReserve(car, toKey, axis)) car.holding = toKey;
      if (car.holding !== toKey) {
        const stopT = this.stopLine(toKey);
        const room = (stopT - car.t) * CELL;
        target = room <= 0.05 ? 0 : Math.min(target, Math.sqrt(2 * BRAKE_PLAN * room));
        // A car that rolled past the stop line while the junction was taken is the one in the way: drop it.
        if (car.t > stopT + 0.02 && car.stuck > 20 && !this.world.levelCrossings.has(toKey)) car.stuck = 999;
      }
    } else if (car.next && !car.holding) {
      // Look one cell further ahead so there is room to stop in time for the junction after next.
      const nextKey = cellKey(car.next[0], car.next[1]);
      const nextAxis: Axis = car.next[0] !== car.to[0] ? 1 : 0;
      if (this.world.junctions.has(nextKey) && this.junctionBlocked(car, nextKey, nextAxis)) {
        const room = (1 + this.stopLine(nextKey) - car.t) * CELL;
        target = Math.min(target, Math.sqrt(2 * BRAKE_PLAN * room));
      }
    }

    // Give way to anyone on a zebra crossing ahead: stop at the line, one cell early if needed.
    if (this.world.crossings.has(toKey) && car.t < 0.5 && this.crossingBusy(toKey)) {
      const room = (0.17 - car.t) * CELL;
      target = room <= 0.05 ? 0 : Math.min(target, Math.sqrt(2 * BRAKE_PLAN * room));
    } else if (car.next) {
      const nextKey = cellKey(car.next[0], car.next[1]);
      if (this.world.crossings.has(nextKey) && this.crossingBusy(nextKey)) {
        target = Math.min(target, Math.sqrt(2 * BRAKE_PLAN * Math.max(0, (1.17 - car.t) * CELL)));
      }
    }

    // Buses glide into bus stops and wait there.
    if (this.servesStop(car, toKey) && car.stoppedAt !== toKey) {
      target = Math.min(target, Math.max(1.2, (1 - car.t) * CELL * 1.2));
    }
    if (car.dwell > 0) {
      target = 0;
      car.dwell -= dt;
    }

    // Keep a safe gap behind the vehicle ahead, and stop for people in the way.
    const rx = -dir.dz;
    const rz = dir.dx;
    for (const other of this.cars) {
      if (other === car) continue;
      // Only queue behind traffic going the same way: oncoming cars pass in the other lane.
      if (Math.cos(other.heading - car.heading) < 0.35) continue;
      const ox = other.x - car.x;
      const oz = other.z - car.z;
      const along = ox * dir.dx + oz * dir.dz;
      if (along < 0.2 || along > 16 || Math.abs(ox * rx + oz * rz) > 1.8) continue;
      const gap = along - (car.length + other.length) / 2 - 0.8;
      target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * 6 * gap));
    }
    const brakeForPerson = (px: number, pz: number) => {
      const ox = px - car.x;
      const oz = pz - car.z;
      const along = ox * dir.dx + oz * dir.dz;
      const lateral = Math.abs(ox * rx + oz * rz);
      if (along > 9 || along < -car.length / 2) return;
      // Beside the body: stay put. Ahead: brake early and keep a gap.
      if (along < 0.5 && lateral > 1.6) return;
      if (lateral > 2.3) return;
      const gap = along - car.length / 2 - 0.8;
      target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * 6 * gap));
    };
    for (const p of this.peds) if (p.vis > 0.5) brakeForPerson(p.x, p.z);
    if (this.player.active) brakeForPerson(this.player.x, this.player.z);

    const accel = target > car.speed ? 3.6 : BRAKE_MAX;
    car.speed += Math.max(-accel * dt, Math.min(accel * dt, target - car.speed));
    car.stuck = car.speed < 0.05 && car.dwell <= 0 ? car.stuck + dt : 0;
    car.t += (car.speed * dt) / CELL;

    // Arrived at the next cell centre: line up the following segment.
    if (car.t >= 1) {
      const arrived = car.to;
      car.prev = car.from;
      car.from = arrived;
      if (!car.next) {
        car.stuck = 999;
        return;
      }
      car.to = car.next;
      car.next = this.pickNext(car.from, car.to);
      car.lanePrev = car.lane;
      car.lane = car.laneNext;
      car.laneNext = this.pickLane(car.lane, car.to);
      car.t -= 1;
      const key = cellKey(arrived[0], arrived[1]);
      if (car.stoppedAt && car.stoppedAt !== key) car.stoppedAt = null; // ready to stop here again next lap
      if (this.servesStop(car, key) && car.stoppedAt !== key) {
        car.stoppedAt = key;
        car.dwell = car.kind === 'taxi' ? 8 : 5;
        car.speed = 0;
        car.t = 0;
      } else if (car.kind === 'car' && this.tryPark(car, key)) {
        return;
      }
    }

    // Free the junction once the whole car has cleared it.
    if (car.holding) {
      const fromKey = cellKey(car.from[0], car.from[1]);
      const cleared = car.holding === fromKey ? car.t > 0.55 : car.holding !== cellKey(car.to[0], car.to[1]);
      if (cleared) {
        if (this.junctionOwner.get(car.holding) === car.id) this.junctionOwner.delete(car.holding);
        car.holding = null;
      }
    }

    this.placeCar(car);
  }

  /** Puts the car on its lane, following the curve of the cell it is in (arcs, roundabouts, U-turns). */
  private placeCar(car: Car) {
    const inFirstHalf = car.t < 0.5;
    const cell = inFirstHalf ? car.from : car.to;
    const prev = inFirstHalf ? car.prev : car.from;
    const next = inFirstHalf ? car.to : car.next;
    const lanePrev = inFirstHalf ? car.lanePrev : car.lane;
    const laneNext = inFirstHalf ? car.lane : car.laneNext;
    const offIn = this.boundaryOffset(prev, cell, lanePrev);
    const offOut = this.boundaryOffset(cell, next, laneNext);
    const roundabout = !!this.info(cell)?.roundabout && this.world.junctions.has(cellKey(cell[0], cell[1]));
    const path = cellPath(prev, cell, next, offIn, offOut, roundabout);
    const pose = samplePath(path, inFirstHalf ? 0.5 + car.t : car.t - 0.5);
    car.x = pose.x;
    car.z = pose.z;
    car.heading = pose.heading;
  }

  // --- Pedestrians ---------------------------------------------------------------

  private pickGoal(): Destination | 'wander' {
    const byKind = (kind: DestinationKind) => this.world.destinations.filter((d) => d.kind === kind);
    // People plan around the sky: at night and in bad weather they head indoors or for transport
    // instead of idling in parks.
    const night = atmo.lamps;
    const wet = Math.max(atmo.rain, atmo.snow * 0.7, atmo.storm);
    const options: [DestinationKind | 'wander', number][] = [
      ['door', 0.34 * (1 + 1.3 * night + 0.9 * wet)],
      ['station', 0.09 * (1 + 0.6 * wet)],
      ['metro', 0.08 * (1 + 0.8 * wet)],
      ['taxi', 0.06 * (1 + 1.2 * night + 0.8 * wet)],
      ['bench', 0.14 * (1 - 0.8 * night) * (1 - 0.9 * wet)],
      ['busstop', 0.14 * (1 + 0.8 * wet)],
      ['kiosk', 0.1],
      ['billboard', 0.05 * (1 + 0.8 * night)],
      ['green', 0.13 * (1 - 0.75 * night) * (1 - 0.7 * wet)],
      ['wander', 0.1 * (1 - 0.7 * night) * (1 - 0.8 * wet)],
    ];
    const available = options.filter(([k]) => k === 'wander' || byKind(k).length > 0);
    let roll = Math.random() * available.reduce((s, [, w]) => s + w, 0);
    for (const [kind, w] of available) {
      roll -= w;
      if (roll <= 0) return kind === 'wander' ? 'wander' : pick(byKind(kind));
    }
    return 'wander';
  }

  /** Plans waypoints to a cell (then an exact point). Returns false when there is no route. */
  private routeTo(ped: Ped, approach: [number, number], finalPoint: { x: number; z: number } | null): boolean {
    const start: [number, number] = [cellOf(ped.x), cellOf(ped.z)];
    const cells = findPath(this.world, start, approach);
    if (!cells) return false;
    const waypoints = cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx) + ped.jitterX, z: cellCentre(gz) + ped.jitterZ }));
    if (finalPoint) waypoints.push(finalPoint);
    ped.path = waypoints;
    return true;
  }

  private startGoal(ped: Ped) {
    const goal = this.pickGoal();
    ped.goal = null;
    if (goal === 'wander') {
      const b = this.world.bounds;
      if (!b) return;
      const gx = cellOf(ped.x) + Math.floor(range(-6, 7));
      const gz = cellOf(ped.z) + Math.floor(range(-6, 7));
      if (this.routeTo(ped, [gx, gz], null) && ped.path.length > 0) ped.state = 'walking';
      else ped.timer = 1;
      return;
    }
    const final = goal.kind === 'green' ? { x: goal.point.x + range(-1.6, 1.6), z: goal.point.z + range(-1.6, 1.6) } : goal.point;
    if (this.routeTo(ped, goal.approach, final)) {
      ped.goal = goal;
      ped.state = 'walking';
    } else {
      ped.timer = 1.5;
    }
  }

  private arrive(ped: Ped) {
    const goal = ped.goal;
    if (!goal) {
      ped.state = 'idle';
      return;
    }
    ped.speed = 0;
    ped.timer = range(goal.dwell[0], goal.dwell[1]);
    if (goal.kind === 'door' || goal.kind === 'metro') {
      ped.state = 'entering';
      ped.heading = goal.facing;
      if (goal.kind === 'metro') {
        // Ride the underground to another entrance on the same line.
        const group = this.world.metroGroup.get(goal.pieceId) ?? -1;
        const others = this.world.destinations.filter(
          (d) => d.kind === 'metro' && d.pieceId !== goal.pieceId && group >= 0 && this.world.metroGroup.get(d.pieceId) === group,
        );
        if (others.length > 0) {
          const target = pick(others);
          ped.goal = target;
          ped.timer = 4 + Math.hypot(target.point.x - goal.point.x, target.point.z - goal.point.z) / 22;
        } else {
          ped.timer = 6;
        }
      }
    } else if (goal.kind === 'bench') {
      ped.state = 'sitting';
      ped.x = goal.point.x;
      ped.z = goal.point.z;
      ped.heading = goal.facing;
    } else if (goal.kind === 'busstop' || goal.kind === 'station' || goal.kind === 'taxi') {
      ped.state = 'waiting';
      ped.heading = goal.facing;
    } else {
      ped.state = 'busy';
      ped.heading = goal.facing;
    }
  }

  /** Stand up / step back out into the walkable cell in front of whatever they were using. */
  private leave(ped: Ped) {
    const goal = ped.goal;
    ped.goal = null;
    ped.state = 'idle';
    ped.timer = range(0.3, 2);
    if (goal?.kind === 'bench') {
      ped.path = [{ x: cellCentre(goal.approach[0]) + ped.jitterX, z: cellCentre(goal.approach[1]) + ped.jitterZ }];
      ped.state = 'walking';
    }
  }

  /** Gently pushes a walking person away from anyone they would otherwise overlap. */
  private separate(ped: Ped, dt: number) {
    for (const o of this.peds) {
      if (o === ped || o.vis < 0.5 || o.state === 'inside') continue;
      const dx = ped.x - o.x;
      const dz = ped.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.5 || d2 < 1e-4) continue;
      const d = Math.sqrt(d2);
      const push = ((0.7 - d) / 0.7) * 1.4 * dt;
      const nx = ped.x + (dx / d) * push;
      const nz = ped.z + (dz / d) * push;
      if (isWalkable(this.world, cellOf(nx), cellOf(nz))) {
        ped.x = nx;
        ped.z = nz;
      }
    }
  }

  /** Is this point inside (or right beside) the body of a vehicle that is moving? */
  private insideCar(x: number, z: number): boolean {
    for (const c of this.cars) {
      // A parked or waiting car is no obstacle: it holds still for the person beside it.
      if (c.speed < 0.3) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const along = dx * Math.sin(c.heading) + dz * Math.cos(c.heading);
      const side = dx * Math.cos(c.heading) - dz * Math.sin(c.heading);
      if (Math.abs(along) < c.length / 2 + 0.6 && Math.abs(side) < 1.5) return true;
    }
    return false;
  }

  private carNear(x: number, z: number, radius: number, minSpeed = 0.4): boolean {
    const r2 = radius * radius;
    return this.cars.some((c) => c.speed > minSpeed && (c.x - x) ** 2 + (c.z - z) ** 2 < r2);
  }

  private updatePed(ped: Ped, dt: number) {
    ped.greetCooldown -= dt;
    ped.chatCooldown -= dt;
    ped.actionCooldown -= dt;
    ped.flash = Math.max(0, ped.flash - dt * 4);
    if (ped.emoteTimer > 0) {
      ped.emoteTimer -= dt;
      if (ped.emoteTimer <= 0) ped.emote = null;
    }
    if (ped.state !== 'walking') ped.signalWait = null;
    if (this.pedHook && this.pedHook(ped, dt)) return;
    if (this.workHook && this.workHook(ped, dt)) return;
    if (HOSTILE_STATES.has(ped.state)) {
      // The combat system is off (peaceful mode): everyone calms down and gets on with their day.
      ped.role = 'civilian';
      ped.rage = 0;
      ped.fall = 0;
      ped.emote = null;
      ped.state = 'idle';
      ped.timer = 1;
    }

    // Say hello to the player.
    const near = this.player.active ? Math.hypot(this.player.x - ped.x, this.player.z - ped.z) : Infinity;
    if (near < 4 && ped.greetCooldown <= 0 && (ped.state === 'walking' || ped.state === 'idle' || ped.state === 'busy')) {
      ped.greetCooldown = 15;
      ped.state = 'greeting';
      ped.timer = 1.8;
      ped.speed = 0;
      ped.path = [];
      ped.goal = null;
    }

    switch (ped.state) {
      case 'idle': {
        ped.speed = 0;
        ped.timer -= dt;
        // Two people standing close to each other stop for a chat.
        if (ped.chatCooldown <= 0 && ped.timer > 0.6) {
          const other = this.peds.find(
            (o) => o !== ped && o.state === 'idle' && o.chatCooldown <= 0 && o.role === 'civilian' && !o.remove && o.timer > 0.6 && (o.x - ped.x) ** 2 + (o.z - ped.z) ** 2 < 7,
          );
          if (other) {
            const talk = range(5, 10);
            for (const [a, b] of [[ped, other], [other, ped]] as [Ped, Ped][]) {
              a.state = 'chatting';
              a.timer = talk;
              a.chatWith = b.id;
              a.speed = 0;
            }
            ped.emote = 'chat';
            ped.emoteTimer = 2.2;
            break;
          }
        }
        if (ped.timer <= 0) this.startGoal(ped);
        break;
      }

      case 'chatting': {
        const other = this.peds.find((o) => o.id === ped.chatWith);
        ped.timer -= dt;
        if (!other || other.state !== 'chatting' || ped.timer <= 0) {
          ped.state = 'idle';
          ped.timer = range(0.2, 1.2);
          ped.chatWith = null;
          ped.chatCooldown = range(25, 70);
          break;
        }
        ped.heading += wrapAngle(Math.atan2(other.x - ped.x, other.z - ped.z) - ped.heading) * Math.min(1, dt * 5);
        // Take turns speaking: whoever has the lower id talks first, then they alternate.
        if (Math.floor(ped.timer / 1.6 + (ped.id % 2)) % 2 === 0 && ped.emoteTimer <= 0 && Math.random() < dt * 0.6) {
          ped.emote = 'chat';
          ped.emoteTimer = 1.4;
        }
        break;
      }

      case 'greeting':
        ped.heading += wrapAngle(Math.atan2(this.player.x - ped.x, this.player.z - ped.z) - ped.heading) * Math.min(1, dt * 6);
        ped.timer -= dt;
        if (ped.timer <= 0) ped.state = 'idle';
        break;

      case 'walking': {
        const wp = ped.path[0];
        if (!wp) {
          this.arrive(ped);
          break;
        }
        const dx = wp.x - ped.x;
        const dz = wp.z - ped.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.3) {
          ped.path.shift();
          if (ped.path.length === 0) this.arrive(ped);
          break;
        }
        // Don't wade into a cell that has since been built on.
        if (!ped.goal && !isWalkable(this.world, cellOf(wp.x), cellOf(wp.z))) {
          ped.path = [];
          ped.state = 'idle';
          break;
        }
        // Wait for traffic before stepping onto a road.
        const here = cellKey(cellOf(ped.x), cellOf(ped.z));
        const there = cellKey(cellOf(wp.x), cellOf(wp.z));
        const onRoad = this.world.roads.has(here) || this.world.roads.has(there) || this.world.wideCells.has(here) || this.world.wideCells.has(there);
        // Don't step into a signalled junction without the walk signal.
        if (this.world.signalled.has(there) && here !== there && !this.controllers.get(there)?.walk) {
          ped.signalWait = there;
          ped.speed = 0;
          ped.yielded = 0;
          break;
        }
        ped.signalWait = null;
        // On a zebra crossing people expect cars to stop, so they only hold back for one that isn't slowing.
        const crossing = this.world.crossings.has(here) || this.world.crossings.has(there);
        const blocked =
          onRoad &&
          (crossing
            ? this.carNear(ped.x + (dx / dist) * 2, ped.z + (dz / dist) * 2, 7, 1.2)
            : this.carNear(ped.x + (dx / dist) * 2, ped.z + (dz / dist) * 2, 4.5)) &&
          ped.yielded < 6;
        ped.yielded = blocked ? ped.yielded + dt : 0;
        // Never step in front of a moving train: wait while one is close (or the barriers are down).
        // Only hold back before stepping onto the line; once on it, keep going so the train is never left waiting for them.
        const onTrack = (this.world.rails.has(there) || this.world.stations.has(there)) && !this.world.rails.has(here);
        const trainClose =
          onTrack &&
          (this.trains.closed.has(there) ||
            this.trains.trains.some((t) => t.speed > 0.3 && t.poses.some((p) => p.visible && Math.hypot(p.x - ped.x, p.z - ped.z) < 9)));
        // Wait for a car to move off rather than walking through it.
        const hurry = 1 + 0.3 * Math.max(atmo.rain, atmo.snow * 0.5, atmo.storm) + 0.1 * atmo.lamps;
        const speed = trainClose || blocked || this.insideCar(ped.x + (dx / dist) * 0.8, ped.z + (dz / dist) * 0.8) ? 0 : ped.walkSpeed * hurry;
        ped.speed = speed;
        ped.x += (dx / dist) * speed * dt;
        ped.z += (dz / dist) * speed * dt;
        ped.heading += wrapAngle(Math.atan2(dx, dz) - ped.heading) * Math.min(1, dt * 9);
        ped.phase += speed * dt * 2.8;
        this.separate(ped, dt);
        break;
      }

      case 'entering': {
        ped.vis = Math.max(0, ped.vis - dt * 2);
        if (ped.vis <= 0) ped.state = 'inside';
        break;
      }

      case 'inside':
        ped.timer -= dt;
        if (ped.timer <= 0 && ped.goal) {
          // Step back out of the same door.
          ped.x = ped.goal.point.x - Math.sin(ped.goal.facing) * 1.8;
          ped.z = ped.goal.point.z - Math.cos(ped.goal.facing) * 1.8;
          if (!isWalkable(this.world, cellOf(ped.x), cellOf(ped.z))) {
            ped.remove = true; // the door now opens onto something built over
            break;
          }
          ped.heading = ped.goal.facing + Math.PI;
          ped.vis = 1;
          ped.goal = null;
          ped.state = 'idle';
          ped.timer = 0.5;
        } else if (ped.timer <= 0) {
          ped.remove = true;
        }
        break;

      case 'sitting':
      case 'busy':
        ped.timer -= dt;
        if (ped.timer <= 0) this.leave(ped);
        break;

      case 'waiting': {
        ped.timer -= dt;
        const stop = this.world.busStops.find((s) => s.pieceId === ped.goal?.pieceId);
        const bus = stop && this.cars.find((c) => c.kind === 'bus' && c.dwell > 0 && cellKey(c.from[0], c.from[1]) === stop.roadCell);
        const stationKey = ped.goal?.kind === 'station' ? [...this.world.stations].find(([, v]) => v.pieceId === ped.goal?.pieceId)?.[0] : undefined;
        const taxiRoad = ped.goal?.kind === 'taxi' ? [...this.world.taxiByRoad].find(([, v]) => v.pieceId === ped.goal?.pieceId)?.[0] : undefined;
        const taxi = taxiRoad && this.cars.find((c) => c.kind === 'taxi' && c.dwell > 0 && cellKey(c.from[0], c.from[1]) === taxiRoad);
        if (bus || taxi || (stationKey && this.trains.stoppedAtStation(stationKey))) ped.remove = true; // boards the bus / taxi / train
        else if (ped.timer <= 0) this.leave(ped);
        break;
      }
    }
  }
}

export const sim = new Simulation();

// Rebuild the road graph / destinations whenever the city changes.
useCityStore.subscribe((state, prev) => {
  if (state.pieces !== prev.pieces) sim.markDirty();
});
