import { CELL } from '../city/catalog';
import type { Simulation } from './simulation';
import { DIRS, cellCentre, type Berth } from './world';

type Cell = [number, number];

export const MAX_SHIPS = 3;
export const SHIP_LENGTH = 26;

export interface Ship {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: 'inbound' | 'docking' | 'docked' | 'outbound';
  route: { x: number; z: number }[];
  berth: Berth;
  timer: number;
  color: number;
  stuck: number;
  /** Where it came from (and goes back to), as a water cell. */
  origin: Cell;
}

const COLOURS = [0xffffff, 0xe8e0d4, 0xd8dee6, 0xf1e3c9];
const SAIL_SPEED = 3.2;

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const keyOf = (c: Cell) => `${c[0]},${c[1]}`;

/**
 * Cargo ships using the port. A ship appears out in the open water, sails a route through
 * connected water to a free berth beside a pier, ties up for a while (the port crane works
 * while it is there), then sails back out and disappears.
 */
export class ShipSystem {
  ships: Ship[] = [];
  private nextId = 1;
  private spawnTimer = 4;
  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  private get world() {
    return this.sim.world;
  }

  rebuild() {
    // Berths are rebuilt with the world: re-attach ships to the matching berth, drop the rest.
    for (const ship of this.ships) {
      const match = this.world.berths.find((b) => b.water[0] === ship.berth.water[0] && b.water[1] === ship.berth.water[1]);
      if (!match) ship.stuck = 999;
      else {
        match.owner = ship.id;
        ship.berth = match;
      }
    }
    this.ships = this.ships.filter((s) => s.stuck < 120);
  }

  /** Is a ship tied up within `radius` of this point? (Drives the crane animation.) */
  dockedNear(x: number, z: number, radius: number): boolean {
    return this.ships.some((s) => s.phase === 'docked' && Math.hypot(s.x - x, s.z - z) < radius);
  }

  update(dt: number, factor: number) {
    const { berths } = this.world;
    const target = Math.min(MAX_SHIPS, Math.round(Math.min(MAX_SHIPS, berths.length) * Math.min(1.2, factor)));
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 9;
      if (this.ships.length < target) this.spawn();
    }
    if (this.ships.length > target) this.ships.find((s) => s.phase === 'docked')!.timer = 0;
    for (const ship of this.ships) this.step(ship, dt);
    this.ships = this.ships.filter((s) => {
      if (s.stuck < 120) return true;
      if (s.berth.owner === s.id) s.berth.owner = null;
      return false;
    });
  }

  /** Water cells reachable from the berth, as a map to the next cell on the way to it. */
  private towardBerth(berth: Berth): Map<string, { next: Cell | null; dist: number }> {
    const tree = new Map<string, { next: Cell | null; dist: number }>([[keyOf(berth.water), { next: null, dist: 0 }]]);
    const queue: Cell[] = [berth.water];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const d = tree.get(keyOf(cur))!.dist;
      for (const dir of DIRS) {
        const n: Cell = [cur[0] + dir.dx, cur[1] + dir.dz];
        const k = keyOf(n);
        if (tree.has(k) || !this.world.sea.has(k)) continue;
        tree.set(k, { next: cur, dist: d + 1 });
        queue.push(n);
      }
    }
    return tree;
  }

  private spawn() {
    // A berth is only 6 m from its neighbour but a ship is 26 m long, so keep clear of berths in use.
    const free = this.world.berths.filter((b) => b.owner === null && !this.ships.some((o) => Math.hypot(o.berth.x - b.x, o.berth.z - b.z) < SHIP_LENGTH + 6));
    if (free.length === 0) return;
    const berth = pick(free);
    const tree = this.towardBerth(berth);
    const far = [...tree.entries()].filter(([, v]) => v.dist >= 10 && v.dist <= 45);
    const fallback = [...tree.entries()].filter(([, v]) => v.dist >= 4).sort((a, b) => b[1].dist - a[1].dist).slice(0, 5);
    const pool = far.length > 0 ? far : fallback;
    if (pool.length === 0) return;
    const [originKey] = pick(pool);
    const origin = originKey.split(',').map(Number) as Cell;
    if (this.ships.some((s) => Math.hypot(s.x - cellCentre(origin[0]), s.z - cellCentre(origin[1])) < 40)) return;

    const route: { x: number; z: number }[] = [];
    for (let cell: Cell | null = tree.get(originKey)!.next; cell; cell = tree.get(keyOf(cell))!.next) {
      route.push({ x: cellCentre(cell[0]), z: cellCentre(cell[1]) });
    }
    const first = route[0] ?? { x: berth.x, z: berth.z };
    const ox = cellCentre(origin[0]);
    const oz = cellCentre(origin[1]);
    const ship: Ship = {
      id: this.nextId++,
      x: ox,
      z: oz,
      heading: Math.atan2(first.x - ox, first.z - oz),
      speed: 0,
      phase: 'inbound',
      route,
      berth,
      timer: 0,
      color: pick(COLOURS),
      stuck: 0,
      origin,
    };
    berth.owner = ship.id;
    this.ships.push(ship);
  }

  private step(ship: Ship, dt: number) {
    switch (ship.phase) {
      case 'inbound':
      case 'outbound':
        return this.sail(ship, dt);
      case 'docking': {
        // Swing alongside the pier and settle.
        const turn = wrap(ship.berth.heading - ship.heading);
        const turn2 = wrap(ship.berth.heading + Math.PI - ship.heading);
        const best = Math.abs(turn) < Math.abs(turn2) ? turn : turn2;
        ship.heading += Math.max(-0.5 * dt, Math.min(0.5 * dt, best));
        ship.speed = Math.max(0, ship.speed - 1.2 * dt);
        ship.x += (ship.berth.x - ship.x) * Math.min(1, dt * 0.8);
        ship.z += (ship.berth.z - ship.z) * Math.min(1, dt * 0.8);
        if (Math.abs(best) < 0.05 && ship.speed < 0.1) {
          ship.phase = 'docked';
          ship.timer = range(25, 45);
          ship.speed = 0;
        }
        return;
      }
      case 'docked':
        ship.timer -= dt;
        if (ship.timer <= 0) this.depart(ship);
        return;
    }
  }

  private depart(ship: Ship) {
    // Sail back the way it came (the route in reverse, ending at its starting cell).
    const tree = this.towardBerth(ship.berth);
    const path: { x: number; z: number }[] = [];
    for (let cell: Cell | null = tree.get(keyOf(ship.origin))?.next ?? null; cell; cell = tree.get(keyOf(cell))!.next) {
      path.push({ x: cellCentre(cell[0]), z: cellCentre(cell[1]) });
    }
    ship.route = [...path.slice(0, -1).reverse(), { x: cellCentre(ship.origin[0]), z: cellCentre(ship.origin[1]) }];
    ship.phase = 'outbound';
    if (ship.berth.owner === ship.id) ship.berth.owner = null;
  }

  private sail(ship: Ship, dt: number) {
    const wp = ship.route[0];
    if (!wp) {
      if (ship.phase === 'inbound') ship.phase = 'docking';
      else ship.stuck = 999; // sailed out of sight
      return;
    }
    const dx = wp.x - ship.x;
    const dz = wp.z - ship.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.5) {
      ship.route.shift();
      return;
    }
    const turn = wrap(Math.atan2(dx, dz) - ship.heading);
    let target = ship.route.length <= 2 && ship.phase === 'inbound' ? 1.4 : SAIL_SPEED;
    if (Math.abs(turn) > 0.6) target = Math.min(target, 1.2);
    // Keep clear of another ship ahead.
    for (const o of this.ships) {
      if (o === ship) continue;
      const ox = o.x - ship.x;
      const oz = o.z - ship.z;
      const ahead = ox * Math.sin(ship.heading) + oz * Math.cos(ship.heading);
      if (ahead > 0 && ahead < SHIP_LENGTH + 10 && Math.abs(ox * Math.cos(ship.heading) - oz * Math.sin(ship.heading)) < 9) target = 0;
    }
    ship.speed += Math.max(-1.5 * dt, Math.min(0.8 * dt, target - ship.speed));
    ship.heading += Math.max(-0.45 * dt, Math.min(0.45 * dt, turn));
    ship.x += Math.sin(ship.heading) * ship.speed * dt;
    ship.z += Math.cos(ship.heading) * ship.speed * dt;
    ship.stuck = ship.speed < 0.05 ? ship.stuck + dt : 0;
  }
}

/** Water cells are CELL metres wide; a ship covers a few of them end to end. */
export const SHIP_CELLS = Math.ceil(SHIP_LENGTH / CELL);
