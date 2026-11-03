import { create } from 'zustand';
import { CELL, FLOOR_H, PIECES, blockBox, pieceFootprint, resolveStyle, type Block } from '../city/catalog';
import { LOT_HEIGHT } from '../city/geometries';
import { atmo } from '../scenes/atmosphere';
import { cellKey, onPiecePlaced, useCityStore, type Piece } from '../state/useCityStore';
import { useBuildRulesStore } from '../state/useBuildRulesStore';
import { playSfx } from './sfx';
import { sim, type Ped } from './simulation';
import { cellCentre, isWalkable } from './world';

/**
 * Construction crews. A newly placed building is not there at once: a site opens, people
 * from the neighbourhood are recruited as a crew, and they build it together. A foreman
 * oversees, haulers carry materials from the pile to the wall and hammerers work on the
 * walls, so more hands mean a faster build. The building rises floor by floor; crews go home
 * at night and in storms and carry on the next morning.
 */

const MAX_SITES = 10;
const MIN_CREW = 2;
const MAX_CREW = 6;

type Duty = Ped['duty'];

interface Spot {
  x: number;
  z: number;
  /** Heading that faces the wall (or the pile). */
  face: number;
  cell: [number, number];
}

interface Site {
  pieceId: string;
  total: number;
  workNeeded: number;
  workDone: number;
  crewSize: number;
  crew: Map<number, Duty>;
  spots: Spot[];
  pile: Spot;
  pileCell: [number, number];
  state: 'building' | 'cheer';
  cheerTimer: number;
  recruitTimer: number;
  paused: 'night' | 'weather' | null;
  lastFloors: number;
  lastPct: number;
}

/** What the renderer needs to draw a site; updated only when it visibly changes. */
export interface SiteView {
  id: string;
  /** World position of the piece centre and its rotation about the vertical axis. */
  x: number;
  z: number;
  rotY: number;
  /** The building's main block, in the piece's own frame. */
  box: { cx: number; cz: number; w: number; d: number };
  floors: number;
  total: number;
  /** Height of the part built so far, metres. */
  height: number;
  crane: boolean;
  pile: { x: number; z: number };
  pct: number;
  paused: Site['paused'];
}

interface ConstructionViews {
  sites: Record<string, SiteView>;
}

export const useConstructionStore = create<ConstructionViews>(() => ({ sites: {} }));

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const DUTIES: Duty[][] = [[], [], ['haul', 'hammer'], ['foreman', 'haul', 'hammer'], ['foreman', 'haul', 'hammer', 'hammer'], ['foreman', 'haul', 'hammer', 'hammer', 'haul'], ['foreman', 'haul', 'hammer', 'hammer', 'haul', 'hammer']];
const VEST = [0xff7a1a, 0xf2c200, 0xff6a3d];
const TROUSERS = [0x2f3a45, 0x3b4048, 0x2b3a2d];

/** Cached half-built versions of a piece, so React sees the same object until the floor count changes. */
const partialCache = new WeakMap<Piece, Map<number, Piece>>();

/** A piece with only the first `percent` of its floors, plain flat roof and no fittings: what stands on site so far. */
export function partialPiece(piece: Piece, progress: number): Piece {
  const key = Math.round(progress * 1000);
  let byKey = partialCache.get(piece);
  const cached = byKey?.get(key);
  if (cached) return cached;
  const style = resolveStyle(piece.type, piece);
  const blocks: Block[] = style.blocks.map((b) => ({ ...b, floors: clamp(Math.ceil(b.floors * progress), 1, b.floors), top: 'flat' as const, twist: 0 }));
  const out: Piece = { ...piece, blocks, roofStyle: 'flat', led: null, leds: [], sign: null, roofExtras: [], balconies: 'none' };
  if (!byKey) {
    byKey = new Map();
    partialCache.set(piece, byKey);
  }
  byKey.set(key, out);
  return out;
}

class ConstructionSystem {
  readonly sites = new Map<string, Site>();
  private workable = true;

  constructor() {
    sim.workHook = (ped, dt) => this.work(ped, dt);
    onPiecePlaced((piece) => this.open(piece));
  }

  /** Is the weather and time of day fit for building? */
  private updateWorkable() {
    const night = atmo.lamps > 0.55;
    const weather = atmo.rain > 0.55 || atmo.storm > 0.3 || atmo.snow > 0.6;
    this.workable = !night && !weather;
    return night ? 'night' : weather ? 'weather' : null;
  }

  /** The player placed a building: start a site for it (unless construction is switched off). */
  private open(piece: Piece) {
    const mode = useBuildRulesStore.getState().construction;
    const def = PIECES[piece.type];
    if (mode === 'instant' || !def?.paintable || this.sites.size >= MAX_SITES) return;
    const world = sim.world;
    if (!world.bounds) return;

    const style = resolveStyle(piece.type, piece);
    const total = Math.max(...style.blocks.map((b) => b.floors));
    const [w, d] = pieceFootprint(piece);

    // Where people can stand around the building: the walkable ring of cells just outside it.
    const ring: { cell: [number, number]; x: number; z: number }[] = [];
    for (let gx = piece.gx - 1; gx <= piece.gx + w; gx++) {
      for (let gz = piece.gz - 1; gz <= piece.gz + d; gz++) {
        const inside = gx >= piece.gx && gx < piece.gx + w && gz >= piece.gz && gz < piece.gz + d;
        if (inside || !isWalkable(world, gx, gz)) continue;
        ring.push({ cell: [gx, gz], x: cellCentre(gx), z: cellCentre(gz) });
      }
    }
    if (ring.length < 3) return; // boxed in: nobody could work here, so it just appears

    const minX = piece.gx * CELL;
    const maxX = (piece.gx + w) * CELL;
    const minZ = piece.gz * CELL;
    const maxZ = (piece.gz + d) * CELL;
    const toSpot = (r: (typeof ring)[number], standoff: number): Spot => {
      const px = clamp(r.x, minX, maxX);
      const pz = clamp(r.z, minZ, maxZ);
      const dist = Math.hypot(px - r.x, pz - r.z) || 1;
      const k = Math.max(0, dist - standoff) / dist;
      return { x: r.x + (px - r.x) * k, z: r.z + (pz - r.z) * k, face: Math.atan2(px - r.x, pz - r.z), cell: r.cell };
    };
    // The pile goes beside a road if possible, so deliveries are close.
    const roadSide = ring.filter((r) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.roads.has(cellKey(r.cell[0] + dx, r.cell[1] + dz))));
    const pileRing = pick(roadSide.length > 0 ? roadSide : ring);
    const spots = ring.filter((r) => r !== pileRing).map((r) => toSpot(r, 1.3));
    if (spots.length === 0) return;
    const pile = toSpot(pileRing, 0.2);

    const crewSize = clamp(MIN_CREW + Math.floor(total / 5), MIN_CREW, MAX_CREW);
    const base = clamp(5 + total * 1.4, 7, 45) * (mode === 'realistic' ? 5 : 1);
    const site: Site = {
      pieceId: piece.id,
      total,
      workNeeded: base * crewSize * 0.55,
      workDone: 0,
      crewSize,
      crew: new Map(),
      spots,
      pile,
      pileCell: pileRing.cell,
      state: 'building',
      cheerTimer: 0,
      recruitTimer: 0,
      paused: null,
      lastFloors: -1,
      lastPct: -1,
    };
    this.sites.set(piece.id, site);
    this.publish(site, true);
  }

  // --- Crew ------------------------------------------------------------------------------------

  private recruit(site: Site) {
    const piece = useCityStore.getState().pieces[site.pieceId];
    if (!piece) return;
    const [w, d] = pieceFootprint(piece);
    const cx = (piece.gx + w / 2) * CELL;
    const cz = (piece.gz + d / 2) * CELL;
    const need = DUTIES[site.crewSize] ?? [];
    const taken = [...site.crew.values()];
    for (const duty of need) {
      const i = taken.indexOf(duty);
      if (i >= 0) {
        taken.splice(i, 1);
        continue;
      }
      if (site.crew.size >= site.crewSize) return;
      // The nearest idle-ish local joins the crew.
      let best: Ped | null = null;
      let bestD = 45 * 45;
      for (const p of sim.peds) {
        if (p.job || p.vis < 0.9 || p.role !== 'civilian') continue;
        if (!(['idle', 'walking', 'busy', 'sitting', 'waiting', 'greeting', 'chatting'] as string[]).includes(p.state)) continue;
        const d2 = (p.x - cx) ** 2 + (p.z - cz) ** 2;
        if (d2 < bestD) {
          bestD = d2;
          best = p;
        }
      }
      if (!best) {
        // Nobody about: a worker turns up from a few streets away.
        for (let attempt = 0; attempt < 24 && !best; attempt++) {
          const x = cx + range(-30, 30);
          const z = cz + range(-30, 30);
          if (Math.hypot(x - cx, z - cz) < 14 || !isWalkable(sim.world, Math.floor(x / CELL), Math.floor(z / CELL))) continue;
          best = sim.spawnPedAt(x, z);
        }
      }
      if (!best) return;
      this.hire(best, site, duty);
    }
  }

  private hire(ped: Ped, site: Site, duty: Duty) {
    if (ped.chatWith !== null) {
      const partner = sim.peds.find((o) => o.id === ped.chatWith);
      if (partner) {
        partner.state = 'idle';
        partner.chatWith = null;
        partner.timer = 1;
      }
      ped.chatWith = null;
    }
    ped.job = 'builder';
    ped.site = site.pieceId;
    ped.duty = duty;
    ped.task = '';
    ped.taskTimer = 0;
    ped.hardHat = true;
    ped.hatColour = duty === 'foreman' ? 0xf4f4f4 : 0xffd21f;
    ped.shirt = pick(VEST);
    ped.pants = pick(TROUSERS);
    ped.coat = false;
    ped.bag = false;
    ped.carrying = false;
    ped.tool = false;
    ped.goal = null;
    ped.path = [];
    ped.state = 'idle';
    ped.timer = 0;
    ped.emote = 'hammer';
    ped.emoteTimer = 2.2;
    site.crew.set(ped.id, duty);
  }

  private release(ped: Ped) {
    const site = ped.site ? this.sites.get(ped.site) : undefined;
    site?.crew.delete(ped.id);
    ped.job = null;
    ped.site = null;
    ped.hardHat = false;
    ped.carrying = false;
    ped.tool = false;
    ped.task = '';
    ped.path = [];
    if (ped.state === 'busy' || ped.state === 'walking') {
      ped.state = 'idle';
      ped.timer = range(0.5, 2);
    }
  }

  // --- A builder's day -------------------------------------------------------------------------

  /** Called by the sim for every person each frame. Returns true when the builder is busy working (so the sim leaves them be). */
  private work(ped: Ped, dt: number): boolean {
    if (ped.job !== 'builder') return false;
    const site = ped.site ? this.sites.get(ped.site) : undefined;
    if (!site) {
      this.release(ped);
      return false;
    }
    // Frightened, fighting or knocked about: the crew member drops the job.
    if (['fleeing', 'cowering', 'chasing', 'down', 'stalking', 'mugging'].includes(ped.state)) {
      this.release(ped);
      return false;
    }
    if (!this.workable) {
      this.release(ped); // knocking-off time: they go back to ordinary life
      return false;
    }

    if (site.state === 'cheer') {
      ped.state = 'busy';
      ped.speed = 0;
      ped.carrying = false;
      ped.tool = false;
      ped.timer = 9;
      if (!ped.emote) {
        ped.emote = 'party';
        ped.emoteTimer = 1.5;
      }
      return true;
    }

    // Walking to a work spot: the sim moves them along the path.
    if (ped.state === 'walking' && ped.task.endsWith(':go')) {
      ped.taskTimer -= dt;
      if (ped.taskTimer > 0) return false;
      ped.path = [];
      ped.state = 'idle';
    }

    // Arrived (or just hired, or interrupted): decide what comes next.
    if (ped.task === '' || (ped.task.endsWith(':go') && ped.state !== 'walking')) {
      this.arrive(ped, site);
      return ped.state === 'busy';
    }

    // Working at a spot.
    ped.state = 'busy';
    ped.speed = 0;
    ped.taskTimer -= dt;
    const spot = this.spotOf(ped, site);
    if (spot) ped.heading += Math.atan2(Math.sin(spot.face - ped.heading), Math.cos(spot.face - ped.heading)) * Math.min(1, dt * 8);

    switch (ped.task) {
      case 'wall:work': {
        site.workDone += dt * 1.0;
        ped.tool = true;
        ped.phase += dt * 4;
        if (ped.actionCooldown <= 0) {
          ped.actionCooldown = 0.7 + Math.random() * 0.2;
          ped.swing = 1;
        }
        break;
      }
      case 'wall:drop':
        site.workDone += dt * 1.2;
        break;
      case 'pile:load':
        site.workDone += dt * 0.3;
        break;
      case 'vantage:look':
        site.workDone += dt * 0.4;
        break;
    }
    if (ped.taskTimer > 0) return true;

    // Finished this step.
    switch (ped.task) {
      case 'pile:load':
        ped.carrying = true;
        this.go(ped, site, 'drop');
        break;
      case 'wall:drop':
        ped.carrying = false;
        this.go(ped, site, 'pile');
        break;
      case 'wall:work':
        ped.tool = false;
        this.go(ped, site, 'wall');
        break;
      case 'vantage:look':
        this.go(ped, site, 'vantage');
        break;
      default:
        this.go(ped, site, ped.duty === 'haul' ? 'pile' : ped.duty === 'foreman' ? 'vantage' : 'wall');
    }
    return ped.state === 'busy';
  }

  private spots = new Map<number, Spot>();
  private spotOf(ped: Ped, site: Site): Spot | undefined {
    void site;
    return this.spots.get(ped.id);
  }

  /** Starts walking to the next place for the next step. */
  private go(ped: Ped, site: Site, where: 'wall' | 'drop' | 'pile' | 'vantage') {
    let spot: Spot;
    if (where === 'pile') {
      spot = site.pile;
      // Stand a little in from the pile on the side nearest the building.
    } else {
      const others = [...this.spots.entries()].filter(([id]) => id !== ped.id && site.crew.has(id)).map(([, s]) => s);
      const free = site.spots.filter((s) => others.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > 1.4));
      spot = pick(free.length > 0 ? free : site.spots);
    }
    this.spots.set(ped.id, spot);
    if (sim.sendTo(ped, spot.cell, { x: spot.x + range(-0.3, 0.3), z: spot.z + range(-0.3, 0.3) })) {
      ped.task = `${where === 'drop' ? 'wall' : where}:go`;
      if (where === 'drop') ped.task = 'drop:go';
      ped.taskTimer = 25;
    } else {
      // No route: wait a moment and try somewhere else.
      ped.task = 'wall:work';
      ped.taskTimer = 1.5;
      ped.state = 'busy';
    }
  }

  private arrive(ped: Ped, site: Site) {
    ped.speed = 0;
    ped.state = 'busy';
    switch (ped.task) {
      case 'wall:go':
        ped.task = 'wall:work';
        ped.taskTimer = range(6, 11);
        ped.tool = true;
        break;
      case 'drop:go':
        ped.task = 'wall:drop';
        ped.taskTimer = 1.3;
        break;
      case 'pile:go':
        ped.task = 'pile:load';
        ped.taskTimer = 1.4;
        ped.carrying = false;
        break;
      case 'vantage:go':
        ped.task = 'vantage:look';
        ped.taskTimer = range(5, 9);
        break;
      default:
        // New hire: head for the job.
        this.go(ped, site, ped.duty === 'haul' ? 'pile' : ped.duty === 'foreman' ? 'vantage' : 'wall');
    }
  }

  // --- Frame update ----------------------------------------------------------------------------

  update(dt: number) {
    if (this.sites.size === 0) return;
    const pause = this.updateWorkable();
    const pieces = useCityStore.getState().pieces;

    for (const [id, site] of this.sites) {
      if (!pieces[id]) {
        this.drop(site);
        continue;
      }
      site.paused = pause;
      if (site.state === 'cheer') {
        site.cheerTimer -= dt;
        if (site.cheerTimer <= 0) this.drop(site);
        continue;
      }
      if (this.workable) {
        site.recruitTimer -= dt;
        if (site.recruitTimer <= 0) {
          site.recruitTimer = 2.5;
          for (const pid of [...site.crew.keys()]) if (!sim.peds.some((p) => p.id === pid && p.site === id)) site.crew.delete(pid);
          this.recruit(site);
        }
      }
      if (site.workDone >= site.workNeeded) {
        site.state = 'cheer';
        site.cheerTimer = 2.8;
        site.workDone = site.workNeeded;
        playSfx('pickup', 0.6);
      }
      this.publish(site, false);
    }
  }

  /** Ends a site: the crew go back to being neighbours and the scaffolding comes down. */
  private drop(site: Site) {
    for (const id of [...site.crew.keys()]) {
      const ped = sim.peds.find((p) => p.id === id);
      if (ped) this.release(ped);
      this.spots.delete(id);
    }
    this.sites.delete(site.pieceId);
    const { [site.pieceId]: _gone, ...rest } = useConstructionStore.getState().sites;
    void _gone;
    useConstructionStore.setState({ sites: rest });
  }

  /** Finishes every site at once (the "build now" button). */
  finishAll() {
    for (const site of [...this.sites.values()]) this.drop(site);
  }

  /** Pushes a site's state to the renderer, only when something it shows has changed. */
  private publish(site: Site, force: boolean) {
    const piece = useCityStore.getState().pieces[site.pieceId];
    if (!piece) return;
    const progress = clamp(site.workDone / site.workNeeded, 0, 1);
    const style = resolveStyle(piece.type, piece);
    const mainIndex = style.blocks.reduce((best, b, i, all) => (b.floors > all[best].floors ? i : best), 0);
    const main = style.blocks[mainIndex];
    const floors = clamp(Math.ceil(main.floors * progress), 1, main.floors);
    const pct = Math.round(progress * 100);
    const done = site.state === 'cheer';
    const key = done ? site.total + 1 : floors;
    if (!force && key === site.lastFloors && pct === site.lastPct && useConstructionStore.getState().sites[site.pieceId]?.paused === site.paused) return;
    site.lastFloors = key;
    site.lastPct = pct;

    const [w, d] = pieceFootprint(piece);
    const box = blockBox(main, style.lot);
    const view: SiteView = {
      id: site.pieceId,
      x: (piece.gx + w / 2) * CELL,
      z: (piece.gz + d / 2) * CELL,
      rotY: (piece.rot * Math.PI) / 2,
      box: { cx: box.cx, cz: box.cz, w: box.w, d: box.d },
      floors,
      total: main.floors,
      height: LOT_HEIGHT + floors * FLOOR_H,
      crane: main.floors >= 5,
      pile: { x: site.pile.x, z: site.pile.z },
      pct,
      paused: site.paused,
    };
    useConstructionStore.setState((s) => ({ sites: { ...s.sites, [site.pieceId]: view } }));
  }
}

export const construction = new ConstructionSystem();
