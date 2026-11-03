import { CELL, FACADES, FLOOR_H, PIECES, isTreeType, GRASS_TYPES, pieceFootprint, resolveStyle, type Block, type PieceType } from '../city/catalog';
import { spanSurfaceAt, spansNear } from '../city/spanSurface';
import { pathLength, resolveSpan } from '../city/spans';
import { seedFromId, type TreeSpec } from '../city/trees';
import { atmo } from '../scenes/atmosphere';
import { cellKey, overlaysNear, useCityStore, type Piece } from '../state/useCityStore';
import { useWorldsStore } from '../state/useWorldsStore';
import { WATER_LEVEL, hasTerrain, heightAt, useTerrainStore } from '../terrain/terrain';
import { combat } from './combat';
import { playSfx } from './sfx';
import { sim } from './simulation';

/**
 * Bombs and what they do to the world.
 *
 * A bomb is lobbed, flies on an arc and goes off where it lands. Nothing happens all at once: the
 * blast is a wave that travels outwards at the speed of sound-ish, so near things are hit first and
 * far things a moment later; a building that is struck groans for a heartbeat before it comes down;
 * what is left burns for as long as its roof and the weather allow, spreads to dry neighbours
 * downwind, and goes out sooner in the rain; scorch marks and rubble fade away over minutes.
 */

const GRAVITY = 12;
const MUZZLE_SPEED = 36;
/** Metres a bomb's blast reaches. */
const BLAST_RADIUS = 22;
/** A rocket is quicker and flatter than a lobbed bomb, and its blast is a little smaller. */
const ROCKET_SPEED = 75;
const ROCKET_GRAVITY = 1.5;
const ROCKET_RADIUS = 15;
/** How fast the shock wave travels, m/s. */
const SHOCK_SPEED = 95;
const MAX_BOMBS = 6;
const MAX_PUFFS = 720;
const MAX_CHUNKS = 260;
const MAX_RUBBLE = 360;
const MAX_SCARS = 40;
const MAX_FIRES = 26;
const MAX_FALLING = 36;
/** Seconds a scorch mark lasts in dry weather. */
const SCAR_LIFE = 170;
const RUBBLE_LIFE = 150;
/** Structural damage one bomb does to something right beside it. Every building and bridge has a toughness (see `toughness`), and damage adds up from bomb to bomb. */
const HIT_DAMAGE = 115;

export interface Bomb {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  /** A rocket flies flat and fast; a bomb is lobbed. */
  rocket?: boolean;
}

/** A soft round particle: smoke, dust, flame or ember. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Glows (added to the picture) instead of blocking the light like smoke. */
  add: boolean;
  /** Lift or sink, m/s per second. */
  lift: number;
}

export interface Chunk {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  vrx: number;
  vry: number;
  size: number;
  colour: number;
  life: number;
  settled: boolean;
}

export interface Rubble {
  x: number;
  z: number;
  /** Height above the ground at its base. */
  y: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  colour: number;
  born: number;
  life: number;
}

export interface Scar {
  x: number;
  z: number;
  r: number;
  age: number;
  life: number;
  dark: number;
}

export interface Wave {
  x: number;
  y: number;
  z: number;
  age: number;
}

export interface Fire {
  id: number;
  x: number;
  z: number;
  /** Radius of ground it covers, metres. */
  r: number;
  /** Height flames start from (burning rooftops). */
  y: number;
  life: number;
  max: number;
  kind: 'building' | 'tree' | 'ground';
  pieceId?: string;
  spread: number;
  floorTimer: number;
}

export interface Falling {
  id: number;
  type: PieceType;
  seed: number;
  accent?: string;
  tree?: Partial<TreeSpec>;
  scale: number;
  x: number;
  z: number;
  /** Which way it topples (unit). */
  dx: number;
  dz: number;
  /** Seconds since it was torn out. */
  t: number;
  /** How long it lies there before it is gone. */
  life: number;
  /** How hard it was thrown: more tilts it further and shoves it along. */
  force: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** How easily a roof burns. */
function flammableRoof(roof: string): number {
  if (roof === 'thatch') return 1;
  if (roof === 'shake') return 0.9;
  if (roof === 'asphalt') return 0.55;
  if (roof === 'sedum') return 0.4;
  if (roof === 'slate' || roof === 'terracotta' || roof === 'concrete' || roof === 'copper') return 0.12;
  return 0.25;
}

const swatchOf = (id: string, list: readonly { id: string; swatch: string }[]) => parseInt((list.find((x) => x.id === id)?.swatch ?? '#8a8a85').slice(1), 16);

class BlastSim {
  bombs: Bomb[] = [];
  puffs: Puff[] = [];
  chunks: Chunk[] = [];
  rubble: Rubble[] = [];
  scars: Scar[] = [];
  waves: Wave[] = [];
  fires: Fire[] = [];
  falling: Falling[] = [];
  /** Bumped when something is added to or dropped from `falling`, so the screen knows to redraw its list. */
  fallingVersion = 0;
  /** Camera shake, 0..1. */
  shake = 0;
  time = 0;
  private nextId = 1;
  private events: { t: number; run: () => void }[] = [];
  /** Damage taken so far by the buildings and bridges that have been hit, and how many floors they had left after the last hit. */
  private wear = new Map<string, { dmg: number; hp: number; total0: number; keep: number; blocks: Block[] }>();

  get busy(): boolean {
    return this.bombs.length > 0 || this.puffs.length > 0 || this.fires.length > 0 || this.waves.length > 0 || this.events.length > 0;
  }

  launch(x: number, y: number, z: number, dx: number, dy: number, dz: number, rocket = false) {
    if (this.bombs.length >= MAX_BOMBS) return;
    if (rocket) this.bombs.push({ x, y, z, vx: dx * ROCKET_SPEED, vy: dy * ROCKET_SPEED, vz: dz * ROCKET_SPEED, age: 0, rocket: true });
    else this.bombs.push({ x, y, z, vx: dx * MUZZLE_SPEED, vy: dy * MUZZLE_SPEED + 2.5, vz: dz * MUZZLE_SPEED, age: 0 });
  }

  private at(delay: number, run: () => void) {
    this.events.push({ t: this.time + delay, run });
  }

  // --- Frame update --------------------------------------------------------------------------

  update(dt: number) {
    dt = Math.min(dt, 0.08);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 1.6);

    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      const steps = Math.max(1, Math.ceil(dt / 0.016));
      const h = dt / steps;
      let boom = false;
      for (let s = 0; s < steps && !boom; s++) {
        b.age += h;
        b.vy -= (b.rocket ? ROCKET_GRAVITY : GRAVITY) * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.z += b.vz * h;
        boom = this.bombHit(b) || b.age > 8;
      }
      // A thin trail of smoke behind it.
      if (Math.random() < 0.7) this.puff(b.x, b.y, b.z, rnd(-0.3, 0.3), rnd(0, 0.4), rnd(-0.3, 0.3), 0.9, 0.35, 1.1, 0.5, 0.5, 0.5, 0.45, false, 0.2);
      if (boom) {
        this.bombs.splice(i, 1);
        this.detonate(b.x, b.y, b.z, b.rocket ? ROCKET_RADIUS : BLAST_RADIUS);
      }
    }

    if (this.events.length > 0) {
      const due = this.events.filter((e) => e.t <= this.time);
      if (due.length > 0) {
        this.events = this.events.filter((e) => e.t > this.time);
        for (const e of due) e.run();
      }
    }

    for (const w of this.waves) w.age += dt;
    this.waves = this.waves.filter((w) => w.age < (BLAST_RADIUS * 1.6) / SHOCK_SPEED + 0.3);

    this.updateFires(dt);
    this.updateParticles(dt);
    this.updateGround(dt);
  }

  // --- Flight ---------------------------------------------------------------------------------

  private bombHit(b: Bomb): boolean {
    const ground = hasTerrain() ? Math.max(heightAt(b.x, b.z), WATER_LEVEL) : 0;
    if (b.y <= ground + 0.12) {
      b.y = ground;
      return true;
    }
    const deck = spanSurfaceAt(b.x, b.z, b.y + 0.6, 0.6);
    if (deck !== null && b.vy < 0 && b.y <= deck + 0.2) {
      b.y = deck;
      return true;
    }
    const city = useCityStore.getState();
    const id = city.occupancy[cellKey(Math.floor(b.x / CELL), Math.floor(b.z / CELL))];
    const piece = id ? city.pieces[id] : undefined;
    if (piece && PIECES[piece.type].paintable && b.y < this.heightOf(piece)) return true;
    if (b.age > 0.2) {
      for (const t of overlaysNear(city.pieces, b.x, b.z, 1.3)) {
        if (isTreeType(t.type) && !GRASS_TYPES.includes(t.type) && b.y < 7 * (t.scale ?? 1)) return true;
      }
      for (const m of combat.monsters) if (m.state !== 'dying' && Math.hypot(m.x - b.x, m.z - b.z) < 1.6 && b.y < 3.5) return true;
      for (const p of sim.peds) if (p.vis > 0.6 && p.state !== 'inside' && p.state !== 'entering' && Math.hypot(p.x - b.x, p.z - b.z) < 1 && b.y < 2.3) return true;
    }
    return false;
  }

  /** Height of a building's tallest block, metres. */
  private heightOf(piece: Piece): number {
    return this.floorsOf(resolveStyle(piece.type, piece).blocks) * FLOOR_H + 3;
  }

  private floorsOf(blocks: Block[]): number {
    return Math.max(1, ...blocks.map((b) => (b.base ?? 0) + b.floors));
  }

  // --- The explosion --------------------------------------------------------------------------

  private detonate(x: number, y: number, z: number, R = BLAST_RADIUS) {
    playSfx('explosion', 1, { x, y, z });
    const away = Math.hypot(sim.player.x - x, sim.player.z - z);
    this.shake = Math.max(this.shake, clamp(1 - away / 80, 0, 1));
    this.waves.push({ x, y, z, age: 0 });
    this.fireball(x, y, z);

    const ground = hasTerrain() ? Math.max(heightAt(x, z), 0) : 0;
    const surface = y - ground < 4;
    const editable = !useWorldsStore.getState().readOnly;
    /** A bigger blast hits harder as well as further. */
    const power = (R / BLAST_RADIUS) ** 1.5;

    // People and creatures feel it as the wave reaches them.
    this.at(0.12, () => combat.blastDamage(x, z, R, 1));

    // A scorch mark, whatever it landed on.
    if (surface) this.scar(x, z, R * 0.8, 0.85);

    // Afterburn: the ground inside the blast keeps burning in patches for a good while, smoking and glowing,
    // and goes out sooner in rain. Nothing outside the blast radius is touched.
    if (surface) {
      this.at(0.7, () => {
        const patches = Math.round(4 + R * 0.25);
        for (let i = 0; i < patches; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * R * 0.7;
          this.ignite(x + Math.cos(a) * d, z + Math.sin(a) * d, rnd(1.2, 3), rnd(12, 30), 'ground');
        }
      });
    }

    if (!editable) return;

    // The ground: a crater with a rim, and woodland torn out of it. It is dug once what stood there has gone
    // (ground under buildings and roads is held level), and each bomb on the same spot digs deeper.
    if (surface) {
      this.at(0.5, () => {
        const woods = useTerrainStore.getState().crater(x, z, (R / CELL) * 0.7, 2.9 * (R / BLAST_RADIUS));
        for (let i = 0; i < Math.min(26, woods * 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = rnd(2, R * 0.9);
          this.dust(x + Math.cos(a) * d, ground, z + Math.sin(a) * d, 0.8);
        }
      });
    }

    // Everything standing nearby.
    const city = useCityStore.getState();
    const buckets = [0, 1, 2, 3].map(() => ({ remove: [] as string[], patch: new Map<string, Partial<Piece>>(), fx: [] as (() => void)[] }));
    let felled = 0;
    for (const piece of Object.values(city.pieces)) {
      const def = PIECES[piece.type];
      if (piece.type === 'span') continue;
      // Roads, rails and runways break up near the middle of the blast (the crater then opens beneath them).
      if (!def.paintable && (piece.type === 'road' || def.category === 'roads' || def.category === 'transit' || def.category === 'airport' || def.category === 'port')) {
        const rx = (piece.gx + 0.5) * CELL;
        const rz = (piece.gz + 0.5) * CELL;
        const rd = Math.hypot(rx - x, rz - z);
        if (rd < R * 0.55) {
          const bucket = buckets[Math.min(3, Math.floor((rd / R) * 4))];
          bucket.remove.push(piece.id);
          bucket.fx.push(() => this.shatter(rx, rz, 2, 1.2, 5, { x: (rx - x) / (rd || 1), z: (rz - z) / (rd || 1) }));
        }
        continue;
      }
      const tree = isTreeType(piece.type);
      if (!tree && def.category !== 'buildings' && !def.paintable && piece.type !== 'wall' && def.category !== 'street' && def.category !== 'nature') continue;

      if (def.paintable) {
        const [w, d] = pieceFootprint(piece);
        const x0 = piece.gx * CELL;
        const x1 = (piece.gx + w) * CELL;
        const z0 = piece.gz * CELL;
        const z1 = (piece.gz + d) * CELL;
        const dist = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
        if (dist >= R) continue;
        this.building(piece, dist, x, z, buckets[Math.min(3, Math.floor((dist / R) * 4))], R, power);
        continue;
      }
      const px = piece.type === 'wall' ? (piece.rot === 0 ? (piece.gx + 0.5) * CELL : piece.gx * CELL) : (piece.gx + 0.5) * CELL + (piece.offset?.[0] ?? 0);
      const pz = piece.type === 'wall' ? (piece.rot === 0 ? piece.gz * CELL : (piece.gz + 0.5) * CELL) : (piece.gz + 0.5) * CELL + (piece.offset?.[1] ?? 0);
      const dist = Math.hypot(px - x, pz - z);
      const bucket = buckets[Math.min(3, Math.floor((dist / R) * 4))];
      if (tree) {
        if (dist >= R) continue;
        if (GRASS_TYPES.includes(piece.type)) {
          bucket.remove.push(piece.id);
          continue;
        }
        // The nearer, the more certain: at the edge only some go.
        if (Math.random() > 1 - 0.65 * (dist / R) ** 2) {
          bucket.remove.push(piece.id);
          if (felled < MAX_FALLING) {
            felled++;
            const l = dist || 1;
            const fall = { type: piece.type, seed: seedFromId(piece.id), accent: piece.accent, tree: piece.tree, scale: piece.scale ?? 1, x: px, z: pz, dx: (px - x) / l, dz: (pz - z) / l, force: 1 - dist / R };
            bucket.fx.push(() => this.fell(fall));
          }
          if (dist < R * 0.55 && Math.random() < 0.4) bucket.fx.push(() => this.ignite(px, pz, 1.4, rnd(6, 11), 'ground'));
        }
      } else if (dist < R * 0.7) {
        bucket.remove.push(piece.id);
        bucket.fx.push(() => this.shatter(px, pz, 1, 0.9, 6));
      }
    }

    // Bridges: worn down by each blast near them, and gone when they have taken all they can.
    for (const hit of spansNear(x, z, R)) {
      const key = hit.piece.id;
      const spec = resolveSpan(hit.piece.span);
      let rec = this.wear.get(key);
      if (!rec) {
        rec = { dmg: 0, hp: 320 + pathLength(spec.pts) * 1.2, total0: 1, keep: 1, blocks: [] };
        this.wear.set(key, rec);
      }
      rec.dmg += HIT_DAMAGE * power * Math.max(0, 1 - hit.distance / R) ** 1.1;
      const bucket = buckets[Math.min(3, Math.floor((hit.distance / R) * 4))];
      const gy = Math.max(0, hasTerrain() ? heightAt(hit.x, hit.z) : 0);
      if (rec.dmg >= rec.hp) {
        this.wear.delete(key);
        bucket.remove.push(key);
        bucket.fx.push(() => {
          this.shatter(hit.x, hit.z, 10, Math.max(2, hit.y - gy), 40);
          this.dust(hit.x, gy, hit.z, 3, Math.max(2, hit.y - gy));
          playSfx('collapse', 0.9, { x: hit.x, z: hit.z });
        });
      } else {
        bucket.fx.push(() => this.shatter(hit.x, hit.z, 4, Math.max(1.5, hit.y - gy), 8));
      }
    }

    buckets.forEach((bucket, i) => {
      if (bucket.remove.length === 0 && bucket.patch.size === 0 && bucket.fx.length === 0) return;
      this.at(0.14 + ((i + 0.5) * R) / 4 / SHOCK_SPEED, () => {
        const store = useCityStore.getState();
        if (bucket.remove.length > 0) store.removeMany(bucket.remove);
        if (bucket.patch.size > 0) store.updateMany([...bucket.patch.keys()], (p) => (bucket.patch.get(p.id) as never) ?? null);
        for (const run of bucket.fx) run();
      });
    });
  }

  /** Works out what a blast does to one building: nothing much, a few storeys, or the lot. */
  private building(piece: Piece, dist: number, bx: number, bz: number, bucket: { remove: string[]; patch: Map<string, Partial<Piece>>; fx: (() => void)[] }, R: number, power: number) {
    const style = resolveStyle(piece.type, piece);
    const total = this.floorsOf(style.blocks);
    const frac = 1 - dist / R;
    // Every building has a toughness, and damage builds up: a shed gives in to one bomb, a skyscraper takes a whole stock.
    let rec = this.wear.get(piece.id);
    if (!rec || rec.keep !== total) {
      rec = { dmg: 0, hp: this.toughness(piece, total), total0: total, keep: total, blocks: style.blocks };
      this.wear.set(piece.id, rec);
    }
    rec.dmg += HIT_DAMAGE * power * Math.max(0, frac) ** 1.1;
    const worn = Math.min(1, rec.dmg / rec.hp);
    const [w, d] = pieceFootprint(piece);
    const cx = (piece.gx + w / 2) * CELL;
    const cz = (piece.gz + d / 2) * CELL;
    const away = Math.hypot(cx - bx, cz - bz) || 1;
    const dir = { x: (cx - bx) / away, z: (cz - bz) / away };
    const reach = Math.max(w, d) * CELL;
    // The top floors come away as the damage mounts, measured against what the building was before the first hit.
    const keepNow = Math.max(1, Math.ceil(rec.total0 * (1 - worn)));
    const lost = total - keepNow;
    const destroy = rec.dmg >= rec.hp;

    if (destroy) {
      this.wear.delete(piece.id);
      bucket.remove.push(piece.id);
      bucket.fx.push(() => this.collapse(piece, cx, cz, w * CELL, d * CELL, total, dir));
      return;
    }
    const floorsLost = Math.floor(lost);
    if (floorsLost >= 1) {
      const keep = total - floorsLost;
      const blocks = this.cutBlocks(rec.blocks, keep);
      if (blocks.length === 0) {
        this.wear.delete(piece.id);
        bucket.remove.push(piece.id);
        bucket.fx.push(() => this.collapse(piece, cx, cz, w * CELL, d * CELL, total, dir));
        return;
      }
      rec.keep = keep;
      bucket.patch.set(piece.id, { blocks });
      bucket.fx.push(() => {
        this.shatter(cx, cz, reach * 0.4, keep * FLOOR_H, 10 + floorsLost * 3, dir);
        this.dust(cx, 0, cz, 2 + Math.min(2, floorsLost * 0.3), keep * FLOOR_H);
        if (frac > 0.3) this.ignite(cx, cz, Math.min(6, reach * 0.3), rnd(14, 24) * (0.5 + flammableRoof(piece.roof)), 'building', piece.id, keep * FLOOR_H);
        playSfx('collapse', 0.7, { x: cx, z: cz });
      });
    } else if (frac > 0.12) {
      // Windows blown in and a smudge of smoke.
      bucket.fx.push(() => {
        this.shatter(cx, cz, reach * 0.3, total * FLOOR_H * 0.7, 4, dir);
        if (Math.random() < 0.3 * flammableRoof(piece.roof)) this.ignite(cx, cz, 2.5, rnd(8, 14), 'building', piece.id, total * FLOOR_H);
      });
    }
  }

  /** How much punishment a building takes before it comes down: more for tall buildings and for big ones. */
  private toughness(piece: Piece, floors: number): number {
    const [w, d] = pieceFootprint(piece);
    return Math.min(2500, 60 + 14 * floors * Math.sqrt(w * d));
  }

  /** The blocks of a building with everything above `keep` floors sliced off (crowns go with the top). */
  private cutBlocks(blocks: Block[], keep: number): Block[] {
    const out: Block[] = [];
    for (const b of blocks) {
      const base = b.base ?? 0;
      if (base >= keep) continue;
      if (base + b.floors <= keep) out.push(b);
      else out.push({ ...b, floors: keep - base, top: undefined, topH: undefined });
    }
    return out;
  }

  // --- Visual effects of destruction -------------------------------------------------------------

  /** A building comes down: dust, a rain of debris, a heap of rubble, a fire. */
  private collapse(piece: Piece, cx: number, cz: number, wm: number, dm: number, floors: number, dir: { x: number; z: number }) {
    const ground = hasTerrain() ? Math.max(heightAt(cx, cz), 0) : 0;
    const height = floors * FLOOR_H;
    playSfx('collapse', 1, { x: cx, y: ground, z: cz });
    this.shake = Math.max(this.shake, clamp(1 - Math.hypot(sim.player.x - cx, sim.player.z - cz) / 60, 0, 0.7));
    // A big plume of dust that climbs the height of the building.
    const n = Math.round(clamp(10 + (wm * dm) / 25 + floors * 1.2, 14, 60));
    for (let i = 0; i < n; i++) {
      const px = cx + rnd(-wm / 2, wm / 2);
      const pz = cz + rnd(-dm / 2, dm / 2);
      const py = ground + rnd(0, height * 0.6);
      const sh = rnd(0.5, 0.7);
      this.puff(px, py, pz, dir.x * rnd(0.5, 3) + rnd(-1.5, 1.5), rnd(1.5, 4 + floors * 0.15), dir.z * rnd(0.5, 3) + rnd(-1.5, 1.5), rnd(4, 9), rnd(3, 6), rnd(10, 18), sh, sh * 0.93, sh * 0.85, 0.55, false, rnd(-0.1, 0.4));
    }
    this.shatter(cx, cz, Math.max(wm, dm) * 0.5, height * 0.8, clamp(14 + floors * 2, 14, 44), dir, piece);
    // The heap it leaves.
    const facade = swatchOf(piece.facade, FACADES);
    const boxes = clamp(Math.round((wm * dm) / 9) + 8, 10, 40);
    for (let i = 0; i < boxes; i++) {
      const mix = Math.random() < 0.35;
      this.addRubble({
        x: cx + rnd(-wm / 2, wm / 2) * 0.9,
        z: cz + rnd(-dm / 2, dm / 2) * 0.9,
        y: 0,
        sx: rnd(0.6, 2.6),
        sy: rnd(0.3, 1 + floors * 0.08),
        sz: rnd(0.6, 2.6),
        ry: Math.random() * Math.PI,
        colour: mix ? 0x6b6761 : facade,
        born: this.time + rnd(0, 0.6),
        life: RUBBLE_LIFE * rnd(0.8, 1.2),
      });
    }
    this.scar(cx, cz, Math.max(wm, dm) * 0.65, 0.7);
    this.ignite(cx, cz, Math.max(wm, dm) * 0.32, rnd(24, 44) * (0.6 + flammableRoof(piece.roof)), 'ground', undefined, 0.4);
  }

  /** Windows and masonry flying out of a building (or a prop) as it is hit. */
  private shatter(x: number, z: number, spread: number, height: number, count: number, dir?: { x: number; z: number }, piece?: Piece) {
    const ground = hasTerrain() ? Math.max(heightAt(x, z), 0) : 0;
    const body = piece ? swatchOf(piece.facade, FACADES) : 0x8a857c;
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= MAX_CHUNKS) this.chunks.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(3, 13);
      this.chunks.push({
        x: x + Math.cos(a) * rnd(0, spread),
        y: ground + rnd(0.3, Math.max(1, height)),
        z: z + Math.sin(a) * rnd(0, spread),
        vx: Math.cos(a) * sp + (dir?.x ?? 0) * rnd(1, 6),
        vy: rnd(5, 15),
        vz: Math.sin(a) * sp + (dir?.z ?? 0) * rnd(1, 6),
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        vrx: rnd(-9, 9),
        vry: rnd(-9, 9),
        size: rnd(0.15, 0.7),
        colour: Math.random() < 0.5 ? body : Math.random() < 0.5 ? 0x5a5650 : 0xb8b2a6,
        life: rnd(4, 7),
        settled: false,
      });
    }
    this.dust(x, ground, z, 1, height * 0.5);
  }

  /** A tree torn out of the ground topples away from the blast. */
  private fell(f: Omit<Falling, 'id' | 't' | 'life'>) {
    if (this.falling.length >= MAX_FALLING) return;
    this.falling.push({ ...f, id: this.nextId++, t: -rnd(0, 0.15), life: rnd(7, 11) });
    this.fallingVersion++;
    playSfx('tree_fall', 0.5, { x: f.x, z: f.z });
    const ground = hasTerrain() ? Math.max(heightAt(f.x, f.z), 0) : 0;
    for (let i = 0; i < 3; i++) this.puff(f.x + rnd(-0.6, 0.6), ground + 0.3, f.z + rnd(-0.6, 0.6), rnd(-1.5, 1.5), rnd(0.5, 2), rnd(-1.5, 1.5), rnd(1.5, 3), 0.8, 3.2, 0.36, 0.28, 0.2, 0.6, false, 0.1);
  }

  private dust(x: number, ground: number, z: number, amount: number, high = 0.5) {
    const n = Math.round(4 * amount);
    for (let i = 0; i < n; i++) {
      const sh = rnd(0.5, 0.66);
      this.puff(x + rnd(-2, 2), ground + rnd(0.2, high), z + rnd(-2, 2), rnd(-2, 2), rnd(0.6, 2.6), rnd(-2, 2), rnd(2.5, 5), 1.6, rnd(5, 9), sh, sh * 0.92, sh * 0.8, 0.5, false, 0.15);
    }
  }

  /** The flash, the rising ball of fire, the smoke column and the ring of dust along the ground. */
  private fireball(x: number, y: number, z: number) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rnd(-0.2, 1);
      const sp = rnd(2, 12);
      const hot = Math.random();
      this.puff(x, y + 0.6, z, Math.cos(a) * sp * (1 - e * 0.5), e * sp + rnd(0, 4), Math.sin(a) * sp * (1 - e * 0.5), rnd(0.5, 1.2), rnd(2, 4), rnd(8, 14), 1, 0.45 + hot * 0.4, 0.1 + hot * 0.15, 0.95, true, 1.5);
    }
    this.puff(x, y + 1, z, 0, 0, 0, 0.22, 6, 26, 1, 0.95, 0.8, 1, true, 0);
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(1, 7);
      const sh = rnd(0.14, 0.26);
      this.puff(x + rnd(-1, 1), y + rnd(0.5, 2), z + rnd(-1, 1), Math.cos(a) * sp, rnd(4, 11), Math.sin(a) * sp, rnd(6, 11), rnd(3, 5), rnd(10, 20), sh, sh, sh, 0.7, false, rnd(0.2, 1.2));
    }
    // A ring of dust racing out along the ground ahead of the wave.
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + rnd(-0.1, 0.1);
      const sh = rnd(0.5, 0.62);
      this.puff(x, y + 0.4, z, Math.cos(a) * 22, rnd(0, 1.5), Math.sin(a) * 22, rnd(1.2, 2.2), 2, rnd(7, 11), sh, sh * 0.92, sh * 0.8, 0.5, false, -0.5);
    }
    if (this.chunks.length + 30 > MAX_CHUNKS) this.chunks.splice(0, 30);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(4, 15);
      this.chunks.push({ x, y: y + 0.4, z, vx: Math.cos(a) * sp, vy: rnd(8, 20), vz: Math.sin(a) * sp, rx: 0, ry: 0, vrx: rnd(-10, 10), vry: rnd(-10, 10), size: rnd(0.1, 0.4), colour: Math.random() < 0.6 ? 0x4a3b2c : 0x2a2622, life: rnd(3, 5.5), settled: false });
    }
  }

  // --- Fires and the weather -------------------------------------------------------------------

  /** Sets a fire going. Rooftops burn at `y`; anything else burns at the ground. */
  ignite(x: number, z: number, r: number, life: number, kind: Fire['kind'], pieceId?: string, y = 0.3) {
    if (this.fires.length >= MAX_FIRES) return;
    // Already burning there (or that very piece): do not double up.
    if (this.fires.some((f) => (pieceId && f.pieceId === pieceId) || Math.hypot(f.x - x, f.z - z) < Math.max(1.5, r * 0.6))) return;
    this.fires.push({ id: this.nextId++, x, z, r, y, life, max: life, kind, pieceId, spread: rnd(1.5, 3.5), floorTimer: rnd(6, 9) });
  }

  private updateFires(dt: number) {
    if (this.fires.length === 0) return;
    // Rain and storms put fires out much faster; a dry, windy day keeps them going.
    const quench = 1 + atmo.rain * 4 + atmo.storm * 2 + atmo.snow * 3;
    const editable = !useWorldsStore.getState().readOnly;
    for (const f of this.fires) {
      f.life -= dt * quench;
      const strength = clamp(f.life / 5, 0, 1) * clamp((f.max - f.life) / 1.2 + 0.3, 0.3, 1);
      const ground = (hasTerrain() ? Math.max(heightAt(f.x, f.z), 0) : 0) + (f.kind === 'building' ? f.y : 0.2);
      // Flames.
      const flames = (5 + f.r * 5) * strength * dt;
      for (let k = Math.random() < flames % 1 ? 1 : 0, n = Math.floor(flames) + k; n > 0; n--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * f.r;
        const hot = Math.random();
        this.puff(f.x + Math.cos(a) * d, ground, f.z + Math.sin(a) * d, atmo.windX * 0.4 + rnd(-0.3, 0.3), rnd(1.5, 3.2), atmo.windZ * 0.4 + rnd(-0.3, 0.3), rnd(0.5, 1), rnd(0.9, 1.6), 0.25, 1, 0.35 + hot * 0.5, 0.05 + hot * 0.1, 0.85, true, 0.8);
      }
      // Smoke, leaning with the wind.
      const smoke = (2.5 + f.r * 3) * strength * dt;
      for (let k = Math.random() < smoke % 1 ? 1 : 0, n = Math.floor(smoke) + k; n > 0; n--) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * f.r;
        const sh = rnd(0.12, 0.24);
        this.puff(f.x + Math.cos(a) * d, ground + 0.8, f.z + Math.sin(a) * d, atmo.windX * 1.4, rnd(1.4, 2.6), atmo.windZ * 1.4, rnd(5, 9), rnd(1, 2), rnd(5, 9) + f.r * 0.6, sh, sh, sh, 0.5, false, 0.15);
      }
      if (Math.random() < dt * 2 * strength) this.puff(f.x + rnd(-f.r, f.r), ground, f.z + rnd(-f.r, f.r), atmo.windX + rnd(-1, 1), rnd(3, 6), atmo.windZ + rnd(-1, 1), rnd(1, 2), 0.25, 0.1, 1, 0.7, 0.2, 1, true, -1);

      // It catches on dry neighbours, downwind first.
      f.spread -= dt;
      if (f.spread <= 0 && f.life > 3) {
        f.spread = rnd(2, 4);
        if (editable) this.spreadFrom(f);
      }

      if (editable && f.kind === 'tree' && f.pieceId && f.life < f.max * 0.45) {
        // The tree is burnt through and goes.
        const piece = useCityStore.getState().pieces[f.pieceId];
        if (piece) {
          useCityStore.getState().removeById(f.pieceId);
          this.scar(f.x, f.z, 3, 0.55);
        }
        f.pieceId = undefined;
      }
      if (editable && f.kind === 'building' && f.pieceId) {
        f.floorTimer -= dt * (0.6 + 0.4 * quench);
        if (f.floorTimer <= 0) {
          f.floorTimer = rnd(7, 10);
          this.burnFloor(f);
        }
      }
    }
    const spent = this.fires.filter((f) => f.life <= 0);
    if (spent.length > 0) {
      for (const f of spent) for (let i = 0; i < 4; i++) this.puff(f.x + rnd(-f.r, f.r), (hasTerrain() ? Math.max(heightAt(f.x, f.z), 0) : 0) + 1, f.z + rnd(-f.r, f.r), atmo.windX, 1.2, atmo.windZ, rnd(5, 8), 2, 9, 0.3, 0.3, 0.3, 0.35, false, 0.2);
      this.fires = this.fires.filter((f) => f.life > 0);
    }
  }

  /** A burning building loses its top floor now and then, down to a charred shell. */
  private burnFloor(f: Fire) {
    const store = useCityStore.getState();
    const piece = f.pieceId ? store.pieces[f.pieceId] : undefined;
    if (!piece) {
      f.pieceId = undefined;
      return;
    }
    const style = resolveStyle(piece.type, piece);
    const total = this.floorsOf(style.blocks);
    if (total <= 1) {
      f.life = Math.min(f.life, 3);
      return;
    }
    store.updatePiece(piece.id, { blocks: this.cutBlocks(style.blocks, total - 1) });
    f.y = (total - 1) * FLOOR_H;
    const [w, d] = pieceFootprint(piece);
    this.shatter((piece.gx + w / 2) * CELL, (piece.gz + d / 2) * CELL, Math.max(w, d) * CELL * 0.3, total * FLOOR_H, 6);
    playSfx('collapse', 0.4, { x: f.x, z: f.z });
  }

  private spreadFrom(f: Fire) {
    const city = useCityStore.getState();
    const wind = Math.hypot(atmo.windX, atmo.windZ) || 1;
    const wx = atmo.windX / wind;
    const wz = atmo.windZ / wind;
    const dry = 1 - clamp(atmo.rain * 1.4 + atmo.snow, 0, 1);
    if (dry <= 0.05) return;
    const reach = 10 + f.r;
    const chance = (x: number, z: number, flam: number) => {
      const dx = x - f.x;
      const dz = z - f.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || d < 0.3) return 0;
      // Fire leans downwind: a neighbour in the wind's path catches far more easily than one upwind.
      const along = (dx * wx + dz * wz) / d;
      return 0.55 * flam * dry * (1 - d / reach) * (0.35 + 0.65 * Math.max(0, along * Math.min(1.5, wind) * 0.8 + 0.2));
    };
    for (const t of overlaysNear(city.pieces, f.x, f.z, reach)) {
      if (!isTreeType(t.type) || this.fires.some((o) => o.pieceId === t.id)) continue;
      const x = (t.gx + 0.5) * CELL + (t.offset?.[0] ?? 0);
      const z = (t.gz + 0.5) * CELL + (t.offset?.[1] ?? 0);
      const flam = GRASS_TYPES.includes(t.type) ? 0.7 : 0.9;
      if (Math.random() < chance(x, z, flam) * 0.45) this.ignite(x, z, 1.1 * (t.scale ?? 1), rnd(7, 12), 'tree', t.id, 1);
    }
    const reachCells = Math.ceil(reach / CELL);
    const gx0 = Math.floor(f.x / CELL);
    const gz0 = Math.floor(f.z / CELL);
    const seen = new Set<string>();
    for (let gx = gx0 - reachCells; gx <= gx0 + reachCells; gx++) {
      for (let gz = gz0 - reachCells; gz <= gz0 + reachCells; gz++) {
        const id = city.occupancy[cellKey(gx, gz)];
        const piece = id ? city.pieces[id] : undefined;
        if (!piece || seen.has(piece.id) || !PIECES[piece.type].paintable) continue;
        seen.add(piece.id);
        if (this.fires.some((o) => o.pieceId === piece.id)) continue;
        const [w, d] = pieceFootprint(piece);
        const cx = (piece.gx + w / 2) * CELL;
        const cz = (piece.gz + d / 2) * CELL;
        if (Math.random() < chance(cx, cz, flammableRoof(piece.roof)) * 0.3) {
          const floors = this.floorsOf(resolveStyle(piece.type, piece).blocks);
          this.ignite(cx, cz, Math.min(5, Math.max(w, d) * CELL * 0.3), rnd(20, 34) * (0.5 + flammableRoof(piece.roof)), 'building', piece.id, floors * FLOOR_H);
        }
      }
    }
  }

  // --- Particles, debris, marks -------------------------------------------------------------------

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, add: boolean, lift: number) {
    if (this.puffs.length >= MAX_PUFFS) return;
    this.puffs.push({ x, y, z, vx, vy, vz, life, max: life, s0, s1, r, g, b, a, add, lift });
  }

  private scar(x: number, z: number, r: number, dark: number) {
    if (this.scars.length >= MAX_SCARS) this.scars.shift();
    this.scars.push({ x, z, r, age: 0, life: SCAR_LIFE, dark });
  }

  private addRubble(r: Rubble) {
    if (this.rubble.length >= MAX_RUBBLE) this.rubble.shift();
    this.rubble.push(r);
  }

  private updateParticles(dt: number) {
    const windX = atmo.windX;
    const windZ = atmo.windZ;
    for (const p of this.puffs) {
      p.life -= dt;
      const drag = Math.exp(-dt * (p.add ? 2.2 : 1.1));
      p.vx = p.vx * drag + (p.add ? 0 : windX * dt * 0.8);
      p.vz = p.vz * drag + (p.add ? 0 : windZ * dt * 0.8);
      p.vy = p.vy * drag + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    if (this.puffs.some((p) => p.life <= 0)) this.puffs = this.puffs.filter((p) => p.life > 0);

    for (const c of this.chunks) {
      c.life -= dt;
      if (c.settled) continue;
      c.vy -= 22 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += c.vrx * dt;
      c.ry += c.vry * dt;
      const ground = (hasTerrain() ? Math.max(heightAt(c.x, c.z), 0) : 0) + c.size * 0.5;
      if (c.y <= ground) {
        c.y = ground;
        if (Math.abs(c.vy) > 3) {
          c.vy = -c.vy * 0.32;
          c.vx *= 0.6;
          c.vz *= 0.6;
          c.vrx *= 0.5;
          c.vry *= 0.5;
        } else {
          c.settled = true;
          c.life = Math.min(c.life, rnd(1.5, 3.5));
        }
      }
    }
    if (this.chunks.some((c) => c.life <= 0)) this.chunks = this.chunks.filter((c) => c.life > 0);
  }

  /** Scorch marks, rubble and fallen trees age; rain washes marks away faster. */
  private updateGround(dt: number) {
    const wash = 1 + atmo.rain * 2.5;
    for (const s of this.scars) s.age += dt * wash;
    if (this.scars.some((s) => s.age > s.life)) this.scars = this.scars.filter((s) => s.age < s.life);
    if (this.rubble.some((r) => this.time - r.born > r.life)) this.rubble = this.rubble.filter((r) => this.time - r.born < r.life);
    let dropped = false;
    for (const f of this.falling) f.t += dt;
    if (this.falling.some((f) => f.t > f.life)) {
      this.falling = this.falling.filter((f) => f.t <= f.life);
      dropped = true;
    }
    if (dropped) this.fallingVersion++;
  }
}

export const blast = new BlastSim();

