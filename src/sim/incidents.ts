import { CELL, PIECES, pieceFootprint } from '../city/catalog';
import { useCityStore } from '../state/useCityStore';
import { combat } from './combat';
import { cityState } from './cityState';
import { playSfx } from './sfx';
import { sim, type Car, type Mission, type Ped } from './simulation';
import { cellOf, isWalkable, type ServiceKind } from './world';

/**
 * Trouble in the city: buildings catch fire, cars crash, thieves run off with a bag. Each one is an
 * incident that needs a response from the police, the fire brigade or the ambulance service. The
 * crews drive out from their stations with sirens on, work at the scene, then go home. Without a
 * station of the right kind nobody comes, and the trouble costs the city dearly.
 */

export type IncidentKind = 'fire' | 'accident' | 'crime';
type Role = Mission['role'];
type RoleState = 'pending' | 'out' | 'done' | 'none';

export interface Flame {
  x: number;
  y: number;
  z: number;
  phase: number;
  size: number;
}

export interface Incident {
  id: number;
  kind: IncidentKind;
  label: string;
  x: number;
  z: number;
  /** Road cell the crews stop at. */
  road: [number, number] | null;
  needs: Role[];
  state: Partial<Record<Role, RoleState>>;
  retryAt: Partial<Record<Role, number>>;
  tries: Partial<Record<Role, number>>;
  age: number;
  /** Seconds before it is given up on if nobody has dealt with it. */
  ttl: number;
  status: 'active' | 'resolved' | 'failed';
  ended: number;
  /** Fire strength 0..1 (the flames and smoke are drawn from it). */
  intensity: number;
  arrivedAt: number | null;
  flames: Flame[];
  wrecks: Car[];
  thief: Ped | null;
  thiefSpeed: number;
  height: number;
  pieceId: string | null;
  nextWatch: number;
  nextSpread: number;
}

const STATION_OF: Record<Role, ServiceKind> = { police: 'police', fire: 'fire', ambulance: 'hospital' };
const HOLD: Record<Role, number> = { police: 9, fire: 14, ambulance: 9 };
const MAX_EMERGENCY_CARS = 7;
const MAX_WATCHERS = 7;

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

class Incidents {
  list: Incident[] = [];
  /** Player switch (City stats window). */
  enabled = true;
  private time = 0;
  private nextAt = 90;
  private nextId = 1;
  private sirenAt = 0;
  private forceAt = 150;

  constructor() {
    sim.crashHook = (a, b) => this.onCrash(a, b);
    sim.missionHook = (car, event) => this.onMission(car, event);
  }

  get active(): Incident[] {
    return this.list.filter((i) => i.status === 'active');
  }

  update(dt: number) {
    if (!sim.world.bounds) return;
    this.time += dt;
    cityState.unanswered = Math.max(0, cityState.unanswered - dt / 150);

    if (this.enabled && sim.density !== 'off' && this.time >= this.nextAt && this.active.length < 2) {
      const buildings = sim.world.stats.buildings;
      const pressure = Math.max(0.5, Math.min(1.6, (buildings / 30) * (0.6 + sim.cars.length / 30)));
      this.nextAt = this.time + range(120, 260) / pressure;
      this.spawnRandom();
    }
    // Now and then a hurried driver is nudged to run a light, so crashes do happen even in a quiet town.
    if (this.enabled && this.time >= this.forceAt) {
      this.forceAt = this.time + range(90, 200);
      const car = sim.cars.find((c) => !c.mission && !c.wreck && !c.driven && c.abandoned === undefined && c.kind === 'car' && c.speed > 3);
      if (car) {
        car.reckless = true;
        car.runLight = true;
      }
    }

    for (const inc of this.list) if (inc.status === 'active') this.step(inc, dt);
    this.list = this.list.filter((i) => i.status === 'active' || this.time - i.ended < 8);
    cityState.incidentsActive = this.active.length;
    this.sirens();
  }

  // --- Starting trouble ------------------------------------------------------------------

  private spawnRandom() {
    const world = sim.world;
    const kinds: ['fire' | 'crime', number][] = [];
    if (world.doorByPiece.size >= 3) kinds.push(['fire', 0.55]);
    if (sim.peds.length >= 5) kinds.push(['crime', 0.45]);
    if (kinds.length === 0) return;
    let roll = Math.random() * kinds.reduce((s, [, w]) => s + w, 0);
    for (const [kind, w] of kinds) {
      roll -= w;
      if (roll <= 0) {
        if (kind === 'fire') this.startFire();
        else this.startCrime();
        return;
      }
    }
  }

  private roles(primary: Role, extra: Role[]): Role[] {
    const have = (role: Role) => sim.world.services.some((s) => s.kind === STATION_OF[role] && s.roadCell);
    return [primary, ...extra.filter(have)];
  }

  private create(partial: Omit<Incident, 'id' | 'state' | 'retryAt' | 'tries' | 'age' | 'status' | 'ended' | 'intensity' | 'arrivedAt' | 'nextWatch' | 'nextSpread'>): Incident {
    const inc: Incident = {
      ...partial,
      id: this.nextId++,
      state: Object.fromEntries(partial.needs.map((r) => [r, 'pending' as RoleState])),
      retryAt: {},
      tries: {},
      age: 0,
      status: 'active',
      ended: 0,
      intensity: 0,
      arrivedAt: null,
      nextWatch: 1.5,
      nextSpread: 75,
    };
    this.list.push(inc);
    this.dispatch(inc);
    return inc;
  }

  startFire(nearX?: number, nearZ?: number) {
    const world = sim.world;
    const pieces = useCityStore.getState().pieces;
    const burning = new Set(this.list.filter((i) => i.status === 'active' && i.pieceId).map((i) => i.pieceId));
    let doors = [...world.doorByPiece.values()].filter((d) => d.building && d.building !== 'firestation' && !burning.has(d.pieceId) && pieces[d.pieceId]);
    if (nearX !== undefined && nearZ !== undefined) doors = doors.filter((d) => Math.hypot(d.point.x - nearX, d.point.z - nearZ) < CELL * 4);
    if (doors.length === 0) return;
    const door = pick(doors);
    const piece = pieces[door.pieceId];
    const def = PIECES[piece.type];
    const [fw, fd] = pieceFootprint(piece);
    const cx = (piece.gx + fw / 2) * CELL;
    const cz = (piece.gz + fd / 2) * CELL;
    const floors = Math.max(1, piece.floors ?? def.floors);
    const height = Math.max(4, floors * 3.2);
    const flames: Flame[] = Array.from({ length: Math.min(12, 5 + floors) }, () => ({
      x: cx + (Math.random() - 0.5) * fw * CELL * 0.8,
      y: range(0.6, height * 0.95),
      z: cz + (Math.random() - 0.5) * fd * CELL * 0.8,
      phase: Math.random() * 6.28,
      size: range(0.7, 1.5),
    }));
    this.create({
      kind: 'fire',
      label: `Fire at the ${def.label.toLowerCase()}`,
      x: cx,
      z: cz,
      road: sim.nearestRoadCell(door.point.x, door.point.z),
      needs: this.roles('fire', floors >= 5 ? ['ambulance'] : []),
      ttl: 170,
      flames,
      wrecks: [],
      thief: null,
      thiefSpeed: 0,
      height,
      pieceId: door.pieceId,
    });
    cityState.totals.fires++;
    this.panicNear(cx, cz, Math.max(fw, fd) * CELL * 0.5 + 10);
    combat.toast(`Fire at the ${def.label.toLowerCase()}!`, 'bad');
  }

  private startCrime() {
    const thief = sim.peds.find((p) => p.vis > 0.9 && p.state === 'walking' && p.role === 'civilian' && !p.job && p.watching === null && p.trait !== 'kid');
    if (!thief) return;
    const victim = sim.peds.find((p) => p !== thief && p.vis > 0.9 && Math.hypot(p.x - thief.x, p.z - thief.z) < 12);
    const inc = this.create({
      kind: 'crime',
      label: 'Robbery in progress',
      x: thief.x,
      z: thief.z,
      road: sim.nearestRoadCell(thief.x, thief.z),
      needs: this.roles('police', []),
      ttl: 90,
      flames: [],
      wrecks: [],
      thief,
      thiefSpeed: thief.walkSpeed,
      height: 0,
      pieceId: null,
    });
    thief.watching = -inc.id; // marks them as the thief, not a bystander
    thief.walkSpeed *= 1.7;
    thief.emote = 'robber';
    thief.emoteTimer = 60;
    this.flee(thief, 16);
    if (victim) {
      victim.emote = 'scared';
      victim.emoteTimer = 4;
    }
    cityState.totals.crimes++;
    combat.toast('A robbery! Police are on their way.', 'warn');
  }

  private onCrash(a: Car, b: Car) {
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    this.create({
      kind: 'accident',
      label: 'Car crash',
      x,
      z,
      road: sim.nearestRoadCell(x, z),
      needs: this.roles('police', ['ambulance']),
      ttl: 100,
      flames: [],
      wrecks: [a, b],
      thief: null,
      thiefSpeed: 0,
      height: 0,
      pieceId: null,
    });
    cityState.totals.accidents++;
    this.panicNear(x, z, 18);
    combat.toast('Crash at a junction!', 'bad');
  }

  // --- Crews ---------------------------------------------------------------------------------

  private emergencyCars(): Car[] {
    return sim.cars.filter((c) => c.mission);
  }

  /** Sends out every crew the incident still needs and has a station for. */
  private dispatch(inc: Incident) {
    if (!inc.road) {
      for (const role of inc.needs) inc.state[role] = 'none';
      return;
    }
    for (const role of inc.needs) {
      if (inc.state[role] !== 'pending' || (inc.retryAt[role] ?? 0) > this.time) continue;
      const stations = sim.world.services
        .filter((s) => s.kind === STATION_OF[role] && s.roadCell)
        .sort((p, q) => Math.hypot(p.x - inc.x, p.z - inc.z) - Math.hypot(q.x - inc.x, q.z - inc.z));
      if (stations.length === 0) {
        inc.state[role] = 'none';
        continue;
      }
      if (this.emergencyCars().length >= MAX_EMERGENCY_CARS) {
        inc.retryAt[role] = this.time + 2;
        continue;
      }
      let sent = false;
      let routable = false;
      for (const station of stations) {
        const from = station.roadCell!.split(',').map(Number) as [number, number];
        const path = sim.routeRoad(from, inc.road);
        if (!path) continue;
        routable = true;
        if (sim.spawnEmergency(role, path, inc.id, HOLD[role])) {
          sent = true;
          break;
        }
      }
      if (sent) inc.state[role] = 'out';
      else if (routable) inc.retryAt[role] = this.time + 1.5; // the way out is blocked for the moment
      else inc.state[role] = 'none'; // no road leads there
    }
  }

  private onMission(car: Car, event: 'arrived' | 'done' | 'lost') {
    const mission = car.mission;
    const inc = mission && this.list.find((i) => i.id === mission.incident);
    if (!mission || !inc || inc.status !== 'active') return;
    if (event === 'arrived') {
      if (mission.role === 'fire') inc.arrivedAt = this.time;
      combat.toast(`${mission.role === 'fire' ? 'Fire engine' : mission.role === 'police' ? 'Police' : 'Ambulance'} on the scene.`, 'good');
    } else if (event === 'done') {
      inc.state[mission.role] = 'done';
      if (this.satisfied(inc)) this.resolve(inc);
    } else {
      // The crew never made it (road lost, stuck in a jam): send another, up to twice.
      inc.tries[mission.role] = (inc.tries[mission.role] ?? 0) + 1;
      inc.state[mission.role] = (inc.tries[mission.role] ?? 0) > 2 ? 'none' : 'pending';
      inc.retryAt[mission.role] = this.time + 3;
    }
  }

  private satisfied(inc: Incident): boolean {
    const [primary] = inc.needs;
    return inc.state[primary] === 'done' && inc.needs.every((r) => inc.state[r] === 'done' || inc.state[r] === 'none');
  }

  // --- Running an incident -------------------------------------------------------------------

  private step(inc: Incident, dt: number) {
    inc.age += dt;
    this.dispatch(inc);

    if (inc.kind === 'fire') {
      const target = inc.arrivedAt !== null ? Math.max(0, 1 - (this.time - inc.arrivedAt) / HOLD.fire) : Math.min(1, inc.age / 25);
      inc.intensity += (target - inc.intensity) * Math.min(1, dt * 2);
      // Left alone, the fire spreads to a neighbour.
      if (inc.arrivedAt === null && inc.age > inc.nextSpread && this.active.filter((i) => i.kind === 'fire').length < 3) {
        inc.nextSpread += 60;
        this.startFire(inc.x, inc.z);
      }
    } else if (inc.kind === 'crime' && inc.thief) {
      const thief = inc.thief;
      thief.emoteTimer = Math.max(thief.emoteTimer, 1);
      if (thief.state === 'idle' || (thief.state === 'walking' && thief.path.length === 0)) this.flee(thief, 18);
    } else if (inc.kind === 'accident') {
      // Wrecks cleared by the tow timer ends it, answered or not.
      if (inc.wrecks.every((w) => w.wreck <= 0 || !sim.cars.includes(w))) {
        this.finish(inc, inc.needs.some((r) => inc.state[r] === 'done') ? 'resolved' : 'failed');
        return;
      }
    }

    if (inc.age > inc.ttl && inc.status === 'active') {
      this.finish(inc, 'failed');
      return;
    }

    inc.nextWatch -= dt;
    if (inc.nextWatch <= 0) {
      inc.nextWatch = 2;
      this.gatherCrowd(inc);
    }
  }

  private resolve(inc: Incident) {
    const messages = { fire: 'The fire is out.', accident: 'The road is clear again.', crime: 'The thief was caught.' };
    combat.toast(messages[inc.kind], 'good');
    this.finish(inc, 'resolved');
  }

  private finish(inc: Incident, status: 'resolved' | 'failed') {
    if (inc.status !== 'active') return;
    inc.status = status;
    inc.ended = this.time;
    inc.intensity = 0;
    for (const w of inc.wrecks) sim.clearWreck(w);
    for (const p of sim.peds) {
      if (p.watching === inc.id) {
        p.watching = null;
        if (p.task === 'watch') p.task = '';
      }
    }
    if (inc.thief) {
      inc.thief.watching = null;
      inc.thief.walkSpeed = inc.thiefSpeed;
      inc.thief.emote = status === 'resolved' ? 'stars' : null;
      inc.thief.emoteTimer = status === 'resolved' ? 3 : 0;
      if (status === 'resolved') {
        inc.thief.state = 'idle';
        inc.thief.path = [];
        inc.thief.timer = 5;
      }
    }
    if (status === 'resolved') {
      cityState.totals.solved++;
    } else {
      cityState.totals.failed++;
      cityState.unanswered += 1;
      cityState.damage += inc.kind === 'fire' ? 400 + inc.height * 20 : inc.kind === 'accident' ? 180 : 120;
      combat.toast(inc.kind === 'fire' ? 'The fire burned out of control.' : inc.kind === 'accident' ? 'The crash was left unattended.' : 'The thief got away.', 'bad');
    }
  }

  // --- People ----------------------------------------------------------------------------------

  /** Sends a person running off to somewhere `cells` away. */
  private flee(ped: Ped, cells: number) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const gx = cellOf(ped.x) + Math.round(Math.sin(a) * cells);
      const gz = cellOf(ped.z) + Math.round(Math.cos(a) * cells);
      if (isWalkable(sim.world, gx, gz) && sim.sendTo(ped, [gx, gz], null)) return;
    }
  }

  /** Everyone close to the scene looks scared and hurries off. */
  private panicNear(x: number, z: number, radius: number) {
    for (const p of sim.peds) {
      if (p.vis < 0.5 || p.job || Math.hypot(p.x - x, p.z - z) > radius) continue;
      p.emote = 'scared';
      p.emoteTimer = 3;
      if (p.state === 'walking' || p.state === 'idle') this.flee(p, 9);
    }
  }

  /** Passers-by drift over to watch from a distance, then drift away again. */
  private gatherCrowd(inc: Incident) {
    let watchers = 0;
    for (const p of sim.peds) {
      if (p.watching !== inc.id) continue;
      watchers++;
      if (p.task !== 'watch' && p.state === 'idle' && p.path.length === 0) {
        p.state = 'busy';
        p.task = 'watch';
        p.timer = range(10, 22);
        p.heading = Math.atan2(inc.x - p.x, inc.z - p.z);
        p.emote = inc.kind === 'crime' ? 'chat' : Math.random() < 0.5 ? 'eye' : 'scared';
        p.emoteTimer = 2.5;
      } else if (p.task === 'watch' && p.state !== 'busy') {
        p.task = '';
        p.watching = null;
        watchers--;
      }
    }
    if (inc.kind === 'crime' || watchers >= MAX_WATCHERS) return;
    for (const p of sim.peds) {
      if (watchers >= MAX_WATCHERS) break;
      if (p.watching !== null || p.vis < 0.5 || p.job || p.role !== 'civilian' || (p.state !== 'walking' && p.state !== 'idle')) continue;
      const d = Math.hypot(p.x - inc.x, p.z - inc.z);
      if (d > 48 || d < 9 || Math.random() > 0.35) continue;
      const a = Math.atan2(p.x - inc.x, p.z - inc.z) + range(-0.6, 0.6);
      const r = range(9, 13);
      const tx = inc.x + Math.sin(a) * r;
      const tz = inc.z + Math.cos(a) * r;
      if (isWalkable(sim.world, cellOf(tx), cellOf(tz)) && sim.sendTo(p, [cellOf(tx), cellOf(tz)], { x: tx, z: tz })) {
        p.watching = inc.id;
        watchers++;
      }
    }
  }

  // --- Sirens ----------------------------------------------------------------------------------

  private sirens() {
    if (this.time < this.sirenAt) return;
    let best: Car | null = null;
    let bestD = 160;
    for (const car of sim.cars) {
      if (!car.mission || car.mission.phase === 'onscene') continue;
      const d = Math.hypot(car.x - sim.player.x, car.z - sim.player.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    if (!best) return;
    this.sirenAt = this.time + 1.75;
    playSfx('siren', Math.max(0.1, 1 - bestD / 160) * 0.9, { x: best.x, z: best.z });
  }
}

export const incidents = new Incidents();
