import { CELL } from '../city/catalog';
import { TRACK_OFFSET } from '../city/railGeometry';
import { cellKey } from '../state/useCityStore';
import { cellPath, samplePath } from './paths';
import type { Simulation } from './simulation';
import { DIRS, cellCentre } from './world';

type Cell = [number, number];

/** Length of one carriage slot along the track (a carriage body is a little shorter). */
export const CARRIAGE = 9;
export const MAX_TRAINS = 6;
export const MAX_CARRIAGES = 7;

export interface TrainPose {
  x: number;
  z: number;
  heading: number;
  /** False until the train has pulled far enough out for this carriage to exist. */
  visible: boolean;
}

export interface Train {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  from: Cell;
  to: Cell;
  next: Cell | null;
  prev: Cell | null;
  /** 0..1 along the segment from `from` centre to `to` centre. */
  t: number;
  vMax: number;
  /** Locomotive plus carriages. */
  units: number;
  color: number;
  dwell: number;
  stoppedAt: string | null;
  stuck: number;
  /** Past positions of the front, newest first, which the carriages follow. */
  trail: { x: number; z: number }[];
  poses: TrainPose[];
}

const TRAIN_COLOURS = [0xd7263d, 0x1b6ca8, 0x2e933c, 0xf4b942, 0x6a4c93, 0xe36414];
const TRAIL_SPACING = 0.5;
const ACCEL = 1.6;
const BRAKE_MAX = 4.5;
const BRAKE_PLAN = 2.4;
const STUCK_LIMIT = 90;

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * Trains on the double-track railway. Each runs on the right-hand track, slows for curves, stops
 * at stations (people board and step off), keeps its distance from the train ahead, and gives
 * way to anything on a level crossing. Carriages follow the locomotive's trail, so they take
 * bends exactly as the front did.
 */
export class TrainSystem {
  trains: Train[] = [];
  /** Level crossings a train is approaching or crossing right now: barriers down, cars held. */
  readonly closed = new Set<string>();
  private nextId = 1;
  private spawnTimer = 0;
  private closedUntil = new Map<string, number>();

  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  private get world() {
    return this.sim.world;
  }

  private dirIndex(a: Cell, b: Cell): number {
    return DIRS.findIndex((d) => d.dx === Math.sign(b[0] - a[0]) && d.dz === Math.sign(b[1] - a[1]));
  }

  private pickNext(prev: Cell, cur: Cell): Cell | null {
    const mask = this.world.rails.get(cellKey(cur[0], cur[1])) ?? 0;
    const incoming = this.dirIndex(prev, cur);
    if (incoming < 0) return null;
    const back = (incoming + 2) % 4;
    const options = DIRS.map((d, i) => ({ d, i })).filter(({ d, i }) => mask & d.bit && i !== back);
    if (options.length === 0) return mask & DIRS[back].bit ? [cur[0] + DIRS[back].dx, cur[1] + DIRS[back].dz] : null;
    const weights = options.map(({ i }) => (i === incoming ? 4 : 1));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k];
      if (roll <= 0) return [cur[0] + options[k].d.dx, cur[1] + options[k].d.dz];
    }
    const last = options[options.length - 1].d;
    return [cur[0] + last.dx, cur[1] + last.dz];
  }

  /** A station platform that the train should stop at (the last platform cell it reaches). */
  private isTerminalStation(cell: Cell, from: Cell): boolean {
    const key = cellKey(cell[0], cell[1]);
    if (!this.world.stations.has(key)) return false;
    const d = this.dirIndex(from, cell);
    if (d < 0) return true;
    const ahead = cellKey(cell[0] + DIRS[d].dx, cell[1] + DIRS[d].dz);
    return !this.world.stations.has(ahead);
  }

  /** Is any part of a train on (or within a few metres of) this crossing cell? */
  occupied(key: string): boolean {
    const [gx, gz] = key.split(',').map(Number);
    const cx = cellCentre(gx);
    const cz = cellCentre(gz);
    return this.trains.some((tr) => tr.poses.some((p) => p.visible && Math.hypot(p.x - cx, p.z - cz) < CARRIAGE / 2 + 3));
  }

  /** Whether a train is standing with its doors open at this station cell. */
  stoppedAtStation(key: string): boolean {
    return this.trains.some((t) => t.dwell > 0 && t.stoppedAt === key);
  }

  /** Called when the track layout changes: drop trains whose track has gone. */
  rebuild() {
    for (const t of this.trains) {
      const ok = this.world.rails.has(cellKey(...t.from)) && this.world.rails.has(cellKey(...t.to));
      if (!ok) t.stuck = 999;
      else t.next = this.pickNext(t.from, t.to);
    }
    this.trains = this.trains.filter((t) => t.stuck < STUCK_LIMIT);
  }

  update(dt: number, factor: number) {
    const { rails, stations } = this.world;
    const target = Math.round(Math.min(MAX_TRAINS, Math.ceil(rails.size / 9)) * Math.min(1.2, factor));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      if (this.trains.length < target && rails.size >= 3) this.spawn(stations.size > 0);
    }
    if (this.trains.length > target) this.trains.find((t) => t.dwell <= 0)!.stuck = STUCK_LIMIT;

    for (const train of this.trains) this.move(train, dt);
    this.trains = this.trains.filter((t) => t.stuck < STUCK_LIMIT);
    this.updateCrossings();
  }

  private spawn(preferStation: boolean) {
    const { rails, stations, junctions, levelCrossings } = this.world;
    const keys = [...rails.entries()].filter(([k, m]) => m !== 0 && !junctions.has(k) && !levelCrossings.has(k));
    const stationKeys = keys.filter(([k]) => stations.has(k));
    const pool = preferStation && stationKeys.length > 0 && Math.random() < 0.7 ? stationKeys : keys;
    if (pool.length === 0) return;
    const [key, mask] = pick(pool);
    const [gx, gz] = key.split(',').map(Number);
    const dir = pick(DIRS.filter((d) => mask & d.bit));
    const x = cellCentre(gx);
    const z = cellCentre(gz);
    if (this.trains.some((t) => t.poses.some((p) => p.visible && (p.x - x) ** 2 + (p.z - z) ** 2 < 55 * 55))) return;

    const units = 3 + Math.floor(Math.random() * (MAX_CARRIAGES - 2));
    const train: Train = {
      id: this.nextId++,
      x,
      z,
      heading: Math.atan2(dir.dx, dir.dz),
      speed: 0,
      from: [gx, gz],
      to: [gx + dir.dx, gz + dir.dz],
      next: null,
      prev: null,
      t: 0,
      vMax: range(6.5, 8.5),
      units,
      color: pick(TRAIN_COLOURS),
      dwell: 0,
      stoppedAt: null,
      stuck: 0,
      trail: [],
      poses: Array.from({ length: units }, () => ({ x, z, heading: 0, visible: false })),
    };
    train.next = this.pickNext(train.from, train.to);
    this.place(train);
    this.trains.push(train);
  }

  // --- Movement --------------------------------------------------------------------

  private move(train: Train, dt: number) {
    const segDir = this.dirIndex(train.from, train.to);
    if (segDir < 0) {
      train.stuck = STUCK_LIMIT;
      return;
    }
    const dir = DIRS[segDir];
    const toKey = cellKey(train.to[0], train.to[1]);
    let target = train.vMax;

    // Slow for bends and turnarounds.
    const nextDir = train.next ? this.dirIndex(train.to, train.next) : segDir;
    if (nextDir !== segDir && train.t > 0.35) target = Math.min(target, 3.5);

    // Stations: roll in and stop at the end of the platform.
    if (train.stoppedAt !== toKey && this.isTerminalStation(train.to, train.from)) {
      target = Math.min(target, Math.max(1.3, Math.sqrt(2 * BRAKE_PLAN * (1 - train.t) * CELL)));
    } else if (train.next && this.isTerminalStation(train.next, train.to) && train.stoppedAt !== cellKey(train.next[0], train.next[1])) {
      target = Math.min(target, Math.max(1.3, Math.sqrt(2 * BRAKE_PLAN * ((1 - train.t) * CELL + CELL))));
    }
    if (train.dwell > 0) {
      target = 0;
      train.dwell -= dt;
    }

    // Don't enter a level crossing that a car is still inside.
    const carInside = (key: string) => this.sim.crossingHeldByCar(key);
    if (this.world.levelCrossings.has(toKey) && train.t < 0.5 && carInside(toKey)) {
      target = Math.min(target, Math.sqrt(2 * BRAKE_PLAN * Math.max(0, (0.15 - train.t) * CELL)));
    } else if (train.next) {
      const nextKey = cellKey(train.next[0], train.next[1]);
      if (this.world.levelCrossings.has(nextKey) && carInside(nextKey)) {
        target = Math.min(target, Math.sqrt(2 * BRAKE_PLAN * Math.max(0, (1.15 - train.t) * CELL)));
      }
    }

    // Keep clear of the train ahead, and of anything on the line in front.
    const fx = dir.dx;
    const fz = dir.dz;
    const rx = -fz;
    const rz = fx;
    const obstacle = (ox: number, oz: number, lateralMax: number, halfLength: number) => {
      const dx = ox - train.x;
      const dz = oz - train.z;
      const along = dx * fx + dz * fz;
      if (along < 0.5 || along > 40 || Math.abs(dx * rx + dz * rz) > lateralMax) return;
      const gap = along - halfLength - 3;
      target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * BRAKE_PLAN * gap));
    };
    for (const other of this.trains) {
      if (other === train) continue;
      if (Math.cos(other.heading - train.heading) < -0.3) continue; // oncoming trains use the other track
      for (const p of other.poses) {
        if (!p.visible) continue;
        // Judge by distance and bearing, not straight-line offset: a train ahead on a bend is off to one side.
        const dx = p.x - train.x;
        const dz = p.z - train.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 40 || dx * fx + dz * fz < dist * 0.3) continue;
        const gap = dist - CARRIAGE - 3;
        target = Math.min(target, gap <= 0 ? 0 : Math.sqrt(2 * BRAKE_PLAN * gap));
      }
    }
    for (const car of this.sim.cars) obstacle(car.x, car.z, 2.4, car.length / 2);
    for (const ped of this.sim.peds) if (ped.vis > 0.5 && ped.state !== 'waiting') obstacle(ped.x, ped.z, 1.7, 0.3);
    if (this.sim.player.active) obstacle(this.sim.player.x, this.sim.player.z, 1.7, 0.4);

    const accel = target > train.speed ? ACCEL : BRAKE_MAX;
    train.speed += Math.max(-accel * dt, Math.min(accel * dt, target - train.speed));
    train.stuck = train.speed < 0.05 && train.dwell <= 0 ? train.stuck + dt : 0;
    train.t += (train.speed * dt) / CELL;

    if (train.t >= 1) {
      train.prev = train.from;
      train.from = train.to;
      if (!train.next) {
        train.stuck = STUCK_LIMIT;
        return;
      }
      train.to = train.next;
      train.next = this.pickNext(train.from, train.to);
      train.t -= 1;
      const key = cellKey(train.from[0], train.from[1]);
      if (train.stoppedAt && train.stoppedAt !== key) train.stoppedAt = null;
      if (this.isTerminalStation(train.from, train.prev) && train.stoppedAt !== key) {
        // Stop with the locomotive at the platform end; passengers swap over.
        train.stoppedAt = key;
        train.dwell = range(7, 11);
        train.speed = 0;
        train.t = 0;
        this.sim.passengersAlight(key, 1 + Math.floor(Math.random() * 4));
      }
    }
    this.place(train);
  }

  /** Puts the locomotive on the right-hand track, then lays the carriages along its trail. */
  private place(train: Train) {
    const first = train.t < 0.5;
    const cell = first ? train.from : train.to;
    const prev = first ? train.prev : train.from;
    const next = first ? train.to : train.next;
    const path = cellPath(prev, cell, next, TRACK_OFFSET, TRACK_OFFSET, false);
    const pose = samplePath(path, first ? 0.5 + train.t : train.t - 0.5);
    train.x = pose.x;
    train.z = pose.z;
    train.heading = pose.heading;

    const head = train.trail[0];
    if (!head || (head.x - pose.x) ** 2 + (head.z - pose.z) ** 2 >= TRAIL_SPACING * TRAIL_SPACING) {
      train.trail.unshift({ x: pose.x, z: pose.z });
      const maxTrail = Math.ceil((train.units * CARRIAGE + 6) / TRAIL_SPACING);
      if (train.trail.length > maxTrail) train.trail.length = maxTrail;
    }

    // Carriage k sits k * CARRIAGE back along the trail.
    for (let k = 0; k < train.units; k++) {
      const p = train.poses[k];
      if (k === 0) {
        p.x = pose.x;
        p.z = pose.z;
        p.heading = pose.heading;
        p.visible = true;
        continue;
      }
      const at = this.alongTrail(train, k * CARRIAGE);
      if (!at) {
        p.visible = false;
        continue;
      }
      p.x = at.x;
      p.z = at.z;
      p.heading = at.heading;
      p.visible = true;
    }
  }

  /** Point and heading `distance` metres back along the locomotive's trail (null if it hasn't travelled that far). */
  private alongTrail(train: Train, distance: number): { x: number; z: number; heading: number } | null {
    let remaining = distance - Math.hypot(train.trail[0].x - train.x, train.trail[0].z - train.z);
    let prevX = train.trail[0].x;
    let prevZ = train.trail[0].z;
    if (remaining <= 0) return { x: train.x, z: train.z, heading: train.heading };
    for (let i = 1; i < train.trail.length; i++) {
      const p = train.trail[i];
      const seg = Math.hypot(p.x - prevX, p.z - prevZ);
      if (seg >= remaining) {
        const f = remaining / (seg || 1);
        const x = prevX + (p.x - prevX) * f;
        const z = prevZ + (p.z - prevZ) * f;
        return { x, z, heading: Math.atan2(prevX - p.x, prevZ - p.z) };
      }
      remaining -= seg;
      prevX = p.x;
      prevZ = p.z;
    }
    return null;
  }

  /** Marks crossings with a train approaching (within ~26 m, heading for it) or still passing over. */
  private updateCrossings() {
    const now = this.sim.time;
    for (const key of this.world.levelCrossings) {
      const [gx, gz] = key.split(',').map(Number);
      const cx = cellCentre(gx);
      const cz = cellCentre(gz);
      let near = false;
      for (const t of this.trains) {
        const dx = cx - t.x;
        const dz = cz - t.z;
        if (Math.hypot(dx, dz) < 26 && dx * Math.sin(t.heading) + dz * Math.cos(t.heading) > -6) near = true;
        for (const p of t.poses) if (p.visible && Math.hypot(p.x - cx, p.z - cz) < 7) near = true;
        if (near) break;
      }
      if (near) this.closedUntil.set(key, now + 1.2); // keep barriers down a moment after the last carriage
    }
    this.closed.clear();
    for (const [key, until] of this.closedUntil) {
      if (until > now && this.world.levelCrossings.has(key)) this.closed.add(key);
      else this.closedUntil.delete(key);
    }
  }
}
