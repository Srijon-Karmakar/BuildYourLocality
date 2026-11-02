import { CELL } from '../city/catalog';
import type { Simulation } from './simulation';
import { DIRS, cellCentre, type RunwayStrip } from './world';

type Cell = [number, number];

export const MAX_PLANES = 4;

export type PlanePhase = 'approach' | 'rollout' | 'taxiIn' | 'parked' | 'taxiOut' | 'waiting' | 'takeoff';

export interface Plane {
  id: number;
  phase: PlanePhase;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Nose-up angle in radians. */
  pitch: number;
  /** Bank angle in radians. */
  roll: number;
  speed: number;
  strip: RunwayStrip;
  /** +1 when travelling from the strip's first cell to its last, -1 for the reverse. */
  sign: 1 | -1;
  /** Distance along the strip from the threshold we are using (negative = still on approach). */
  u: number;
  /** Where along the strip to leave it after landing. */
  exitU: number;
  exitTo: Cell | null;
  /** Taxi route as world positions, followed in order. */
  route: { x: number; z: number }[];
  stand: string | null;
  timer: number;
  color: number;
  /** Tail and trim colour. */
  stripe: number;
  stuck: number;
}

const COLOURS = [0xf2f2f2, 0xf2f2f2, 0xe8eef7, 0xfff3dc];
const STRIPES = [0xd7263d, 0x1b6ca8, 0x2e933c, 0xf4b942];

const APPROACH_SPEED = 15;
const TOUCH_DOWN = 10; // metres past the threshold
const TAXI_SPEED = 4.5;
const ROTATE_SPEED = 13;
const GLIDE = 0.09; // metres of height per metre of distance
const GROUND = 0.9; // wheel height

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const keyOf = (c: Cell) => `${c[0]},${c[1]}`;

/** A runway's two ends and axis direction as world numbers. */
function stripFrame(strip: RunwayStrip, sign: 1 | -1) {
  const axis: [number, number] = strip.alongX ? [1, 0] : [0, 1];
  const first = strip.cells[0];
  const last = strip.cells[strip.cells.length - 1];
  const a = { x: cellCentre(first[0]) - (axis[0] * CELL) / 2, z: cellCentre(first[1]) - (axis[1] * CELL) / 2 };
  const b = { x: cellCentre(last[0]) + (axis[0] * CELL) / 2, z: cellCentre(last[1]) + (axis[1] * CELL) / 2 };
  const threshold = sign > 0 ? a : b;
  const dir: [number, number] = [axis[0] * sign, axis[1] * sign];
  return { threshold, dir, length: strip.cells.length * CELL, heading: Math.atan2(dir[0], dir[1]) };
}

/**
 * Light aircraft using the airfield: they land on a runway, slow to a turn-off, taxi along
 * taxiways to a free apron stand, load and unload passengers at the terminal, taxi back, line
 * up, and take off. Only one aircraft uses a runway at a time. With no apron connected they
 * simply land, turn at the far end and take off again.
 */
export class AircraftSystem {
  planes: Plane[] = [];
  private nextId = 1;
  private spawnTimer = 3;
  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  private get world() {
    return this.sim.world;
  }

  rebuild() {
    // Planes on strips or stands that no longer exist are removed; the rest carry on.
    const strips = new Set(this.world.runways);
    for (const p of this.planes) {
      if (!strips.has(p.strip) && !this.world.runways.some((s) => this.sameStrip(s, p.strip))) p.stuck = 999;
      else if (!strips.has(p.strip)) p.strip = this.world.runways.find((s) => this.sameStrip(s, p.strip))!;
      if (p.stand && !this.world.apronCells.has(p.stand)) p.stand = null;
    }
    this.planes = this.planes.filter((p) => p.stuck < 120);
  }

  private sameStrip(a: RunwayStrip, b: RunwayStrip) {
    return a.alongX === b.alongX && a.cells.length === b.cells.length && a.cells[0][0] === b.cells[0][0] && a.cells[0][1] === b.cells[0][1];
  }

  update(dt: number, factor: number) {
    const { runways } = this.world;
    const target = Math.round(Math.min(MAX_PLANES, runways.length * 2) * Math.min(1.2, factor));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 8;
      if (this.planes.length < target) this.spawnArrival();
    }
    if (this.planes.length > target) {
      const p = this.planes.find((x) => x.phase === 'parked');
      if (p) p.stuck = 999;
    }
    for (const plane of this.planes) this.step(plane, dt);
    this.planes = this.planes.filter((p) => p.stuck < 120);
  }

  /** The strip containing a cell, if it is part of a runway. */
  private stripAt(cell: Cell): RunwayStrip | undefined {
    const k = keyOf(cell);
    return this.world.runways.find((s) => s.cells.some((c) => keyOf(c) === k));
  }

  /** Is an aircraft taxiing or lining up on this strip right now? */
  private occupiedByTaxi(strip: RunwayStrip): boolean {
    return this.planes.some((pl) => {
      if (pl.phase !== 'taxiIn' && pl.phase !== 'taxiOut' && pl.phase !== 'waiting') return false;
      const cell: Cell = [Math.floor(pl.x / CELL), Math.floor(pl.z / CELL)];
      return this.stripAt(cell) === strip;
    });
  }

  private spawnArrival() {
    const free = this.world.runways.filter((s) => s.owner === null && !this.occupiedByTaxi(s));
    if (free.length === 0) return;
    const strip = pick(free);
    const sign: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const frame = stripFrame(strip, sign);
    const u = -170;
    const plane: Plane = {
      id: this.nextId++,
      phase: 'approach',
      x: frame.threshold.x + frame.dir[0] * u,
      y: (TOUCH_DOWN - u) * GLIDE + GROUND,
      z: frame.threshold.z + frame.dir[1] * u,
      heading: frame.heading,
      pitch: -0.07,
      roll: 0,
      speed: APPROACH_SPEED,
      strip,
      sign,
      u,
      exitU: 0,
      exitTo: null,
      route: [],
      stand: null,
      timer: 0,
      color: pick(COLOURS),
      stripe: pick(STRIPES),
      stuck: 0,
    };
    strip.owner = plane.id;
    this.planes.push(plane);
  }

  // --- Per-phase behaviour -----------------------------------------------------------

  private step(p: Plane, dt: number) {
    switch (p.phase) {
      case 'approach':
        return this.approach(p, dt);
      case 'rollout':
        return this.rollout(p, dt);
      case 'taxiIn':
      case 'taxiOut':
        return this.taxi(p, dt);
      case 'parked':
        p.timer -= dt;
        p.speed = 0;
        if (p.timer <= 0) this.leaveStand(p);
        return;
      case 'waiting':
        return this.waitForRunway(p, dt);
      case 'takeoff':
        return this.takeoff(p, dt);
    }
  }

  private place(p: Plane, u: number, y: number) {
    const f = stripFrame(p.strip, p.sign);
    p.x = f.threshold.x + f.dir[0] * u;
    p.z = f.threshold.z + f.dir[1] * u;
    p.y = y;
    p.heading = f.heading;
    p.u = u;
  }

  private approach(p: Plane, dt: number) {
    const u = p.u + APPROACH_SPEED * dt;
    const height = Math.max(0, (TOUCH_DOWN - u) * GLIDE);
    this.place(p, u, height + GROUND);
    p.pitch = height > 0.3 ? -0.07 : 0.03;
    if (u >= TOUCH_DOWN) {
      p.phase = 'rollout';
      p.pitch = 0;
      this.chooseExit(p);
    }
  }

  /** Picks the first turn-off far enough along to brake for, else rolls to the far end. */
  private chooseExit(p: Plane) {
    const n = p.strip.cells.length;
    const brake = (p.speed * p.speed - TAXI_SPEED * TAXI_SPEED) / (2 * 6);
    const hasStands = this.world.apronCells.size > 0;
    p.exitTo = null;
    p.exitU = n * CELL - 3;
    if (!hasStands) return;
    const candidates = p.strip.exits
      .map((e) => ({ ...e, u: ((p.sign > 0 ? e.index : n - 1 - e.index) + 0.5) * CELL }))
      .filter((e) => e.u >= TOUCH_DOWN + brake)
      .sort((a, b) => a.u - b.u);
    if (candidates.length > 0) {
      p.exitU = candidates[0].u;
      p.exitTo = candidates[0].to;
    }
  }

  private rollout(p: Plane, dt: number) {
    const remaining = Math.max(2, p.exitU - p.u);
    const decel = Math.min(8, Math.max(1.5, (p.speed * p.speed - TAXI_SPEED * TAXI_SPEED) / (2 * remaining)));
    p.speed = Math.max(TAXI_SPEED, p.speed - decel * dt);
    this.place(p, p.u + p.speed * dt, GROUND);
    if (p.u < p.exitU - 0.5) return;

    if (p.exitTo) {
      const stand = this.pickStand(p.exitTo);
      const route = stand ? this.findRoute(p.x, p.z, stand.cell, true) : null;
      if (stand && route) {
        p.stand = keyOf(stand.cell);
        p.route = route;
        p.phase = 'taxiIn';
        p.strip.owner = null;
        return;
      }
    }
    // Nowhere to go: stop at the end, turn round, and use the runway again.
    this.turnAround(p);
  }

  private turnAround(p: Plane) {
    const length = p.strip.cells.length * CELL;
    p.sign = p.sign > 0 ? -1 : 1;
    p.u = Math.max(2, length - p.u);
    p.speed = 0;
    p.stand = null;
    p.phase = 'takeoff';
    p.timer = 0;
    this.place(p, p.u, GROUND);
  }

  /** The nearest free apron stand, reachable from `from` without using the runway. */
  private pickStand(from: Cell): { cell: Cell } | null {
    const taken = new Set(this.planes.map((pl) => pl.stand).filter(Boolean) as string[]);
    const stands = [...this.world.apronCells].filter((k) => !taken.has(k));
    if (stands.length === 0) return null;
    const dist = this.bfs(from, true);
    let best: { cell: Cell; d: number } | null = null;
    for (const k of stands) {
      const d = dist.get(k);
      if (d !== undefined && (!best || d < best.d)) {
        const [gx, gz] = k.split(',').map(Number);
        best = { cell: [gx, gz], d };
      }
    }
    return best;
  }

  /** Breadth-first distances over the airfield network from a cell, optionally keeping off the runway. */
  private bfs(from: Cell, avoidRunway: boolean): Map<string, number> {
    const dist = new Map<string, number>([[keyOf(from), 0]]);
    const queue: Cell[] = [from];
    for (let i = 0; i < queue.length; i++) {
      const [gx, gz] = queue[i];
      const mask = this.world.taxi.get(keyOf([gx, gz])) ?? 0;
      for (const dir of DIRS) {
        if (!(mask & dir.bit)) continue;
        const next: Cell = [gx + dir.dx, gz + dir.dz];
        const k = keyOf(next);
        if (dist.has(k) || (avoidRunway && this.world.runwayCells.has(k))) continue;
        dist.set(k, dist.get(keyOf([gx, gz]))! + 1);
        queue.push(next);
      }
    }
    return dist;
  }

  /** Cell centres from where the plane is now to a goal cell, or null if there is no way. */
  private findRoute(x: number, z: number, goal: Cell, avoidRunway: boolean): { x: number; z: number }[] | null {
    const start: Cell = [Math.floor(x / CELL), Math.floor(z / CELL)];
    const from = new Map<string, string>();
    const seen = new Set([keyOf(start)]);
    const queue: Cell[] = [start];
    const goalKey = keyOf(goal);
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      if (keyOf(cur) === goalKey) break;
      const mask = this.world.taxi.get(keyOf(cur)) ?? 0;
      for (const dir of DIRS) {
        if (!(mask & dir.bit)) continue;
        const next: Cell = [cur[0] + dir.dx, cur[1] + dir.dz];
        const k = keyOf(next);
        if (seen.has(k) || (avoidRunway && this.world.runwayCells.has(k) && k !== goalKey)) continue;
        seen.add(k);
        from.set(k, keyOf(cur));
        queue.push(next);
      }
    }
    if (!seen.has(goalKey)) return null;
    const cells: Cell[] = [];
    for (let k: string | undefined = goalKey; k; k = from.get(k)) cells.push(k.split(',').map(Number) as Cell);
    cells.reverse();
    return cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx), z: cellCentre(gz) }));
  }

  private taxi(p: Plane, dt: number) {
    const wp = p.route[0];
    if (!wp) {
      this.arriveTaxi(p);
      return;
    }
    const dx = wp.x - p.x;
    const dz = wp.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      p.route.shift();
      return;
    }
    // Hold short of a runway that is in use by an aircraft landing or taking off.
    let speed = TAXI_SPEED;
    const ahead: Cell = [Math.floor(wp.x / CELL), Math.floor(wp.z / CELL)];
    const here: Cell = [Math.floor(p.x / CELL), Math.floor(p.z / CELL)];
    const nextStrip = this.stripAt(ahead);
    if (nextStrip && nextStrip.owner !== null && nextStrip.owner !== p.id && this.stripAt(here) !== nextStrip) speed = 0;
    // Wait behind another aircraft ahead on the taxiway.
    const turn = wrap(Math.atan2(dx, dz) - p.heading);
    if (Math.abs(turn) > 0.5) speed = 2;
    for (const o of this.planes) {
      if (o === p || o.phase === 'approach' || o.phase === 'rollout' || o.phase === 'takeoff') continue;
      const ox = o.x - p.x;
      const oz = o.z - p.z;
      const ahead = ox * Math.sin(p.heading) + oz * Math.cos(p.heading);
      if (ahead > 0 && ahead < 14 && Math.abs(ox * Math.cos(p.heading) - oz * Math.sin(p.heading)) < 5) speed = 0;
    }
    p.speed += Math.max(-4 * dt, Math.min(2 * dt, speed - p.speed));
    p.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, turn));
    p.roll = -turn * 0.05;
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    p.y = GROUND;
    p.stuck = p.speed < 0.05 ? p.stuck + dt : 0;
  }

  private arriveTaxi(p: Plane) {
    p.speed = 0;
    p.roll = 0;
    if (p.phase === 'taxiIn') {
      p.phase = 'parked';
      p.timer = range(14, 26);
      this.sim.passengersAtTerminal(2 + Math.floor(Math.random() * 6));
    } else {
      p.phase = 'waiting';
    }
  }

  /** Leaves the stand and heads for the nearer end of the runway. */
  private leaveStand(p: Plane) {
    const strip = p.strip;
    const ends: Cell[] = [strip.cells[0], strip.cells[strip.cells.length - 1]];
    const options = ends
      .map((cell, i) => ({ cell, sign: (i === 0 ? 1 : -1) as 1 | -1, route: this.findRoute(p.x, p.z, cell, false) }))
      .filter((o) => o.route);
    if (options.length === 0) {
      p.stuck = 999;
      return;
    }
    const best = options.reduce((a, b) => (a.route!.length <= b.route!.length ? a : b));
    p.sign = best.sign;
    p.route = best.route!;
    p.stand = null;
    p.phase = 'taxiOut';
  }

  private waitForRunway(p: Plane, dt: number) {
    p.speed = 0;
    const f = stripFrame(p.strip, p.sign);
    p.heading += wrap(f.heading - p.heading) * Math.min(1, dt * 2.5);
    if (p.strip.owner === null && Math.abs(wrap(f.heading - p.heading)) < 0.1) {
      p.strip.owner = p.id;
      p.phase = 'takeoff';
      p.u = Math.hypot(p.x - f.threshold.x, p.z - f.threshold.z);
    }
  }

  private takeoff(p: Plane, dt: number) {
    const length = p.strip.cells.length * CELL;
    p.speed = Math.min(ROTATE_SPEED + 6, p.speed + 2.4 * dt);
    const u = p.u + p.speed * dt;
    // Lift off at rotation speed, climbing gently; keep going straight on past the runway.
    const climbing = p.speed >= ROTATE_SPEED;
    const height = climbing ? p.y - GROUND + 5 * dt * Math.min(1, (p.speed - ROTATE_SPEED + 1) / 3) : 0;
    this.place(p, u, GROUND + height);
    p.pitch = climbing ? 0.14 : 0;
    p.roll = 0;
    if (u > length && p.strip.owner === p.id) p.strip.owner = null;
    if (u > length + 260 || p.y > 40) p.stuck = 999;
  }
}
