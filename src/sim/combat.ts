import { atmo } from '../scenes/atmosphere';
import { cellKey } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { findPath } from './pathfinding';
import { playSfx } from './sfx';
import { sim, type Ped } from './simulation';
import { cellCentre, cellOf, isWalkable } from './world';

/**
 * Walk-mode danger: weapons for the player, angry and criminal locals, and monsters that hunt
 * you through the dark. Everything is data here; the SimLayer draws it and the HUD reads it.
 */

// --- Weapons ---------------------------------------------------------------------------------

export type WeaponId = 'fists' | 'bat' | 'pistol' | 'shotgun' | 'taser';
export type AmmoKind = 'bullets' | 'shells' | 'charges';

export interface WeaponDef {
  id: WeaponId;
  label: string;
  icon: string;
  melee: boolean;
  damage: number;
  /** Reach (melee) or maximum distance (ranged), metres. */
  range: number;
  /** Seconds between uses. */
  cooldown: number;
  ammo: AmmoKind | null;
  pellets: number;
  /** Spread of each shot, radians. */
  spread: number;
  knock: number;
  /** Seconds a monster is stunned. */
  stun: number;
  /** How far the sound carries, metres: monsters within it come to look. */
  noise: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: { id: 'fists', label: 'Fists', icon: 'fist', melee: true, damage: 8, range: 2.2, cooldown: 0.45, ammo: null, pellets: 1, spread: 0, knock: 3, stun: 0, noise: 9 },
  bat: { id: 'bat', label: 'Bat', icon: 'bat', melee: true, damage: 24, range: 2.8, cooldown: 0.8, ammo: null, pellets: 1, spread: 0, knock: 8, stun: 0.5, noise: 13 },
  pistol: { id: 'pistol', label: 'Pistol', icon: 'pistol', melee: false, damage: 26, range: 60, cooldown: 0.34, ammo: 'bullets', pellets: 1, spread: 0.012, knock: 3, stun: 0.25, noise: 48 },
  shotgun: { id: 'shotgun', label: 'Shotgun', icon: 'shotgun', melee: false, damage: 11, range: 24, cooldown: 1.0, ammo: 'shells', pellets: 7, spread: 0.1, knock: 11, stun: 0.9, noise: 58 },
  taser: { id: 'taser', label: 'Taser', icon: 'taser', melee: false, damage: 3, range: 9, cooldown: 1.4, ammo: 'charges', pellets: 1, spread: 0.005, knock: 1, stun: 4.5, noise: 14 },
};
export const WEAPON_ORDER: WeaponId[] = ['fists', 'bat', 'pistol', 'shotgun', 'taser'];

const AMMO_PER_PICKUP: Record<AmmoKind, number> = { bullets: 12, shells: 6, charges: 2 };

// --- Entities ---------------------------------------------------------------------------------

export type MonsterKind = 'shade' | 'brute' | 'raptor' | 'rex' | 'dragon';

export interface MonsterStats {
  label: string;
  /** Roams by day (dinosaurs, dragons) or by night (shades, brutes). */
  day: boolean;
  hp: number;
  /** How far it can see you at full visibility, metres, and how wide its view cone is (degrees). */
  sight: number;
  cone: number;
  chase: number;
  wander: number;
  /** Distance at which it starts an attack, and the distance the blow actually lands at. */
  reach: number;
  hitReach: number;
  windup: number;
  damage: number;
  cooldown: number;
  /** Seconds without seeing you before it gives up the chase. */
  lose: number;
  /** Hit-test radius and height of the body. */
  radius: number;
  top: number;
  /** How much knock-back and stun it takes (1 = normal). */
  knock: number;
  stun: number;
}

export const MONSTER_STATS: Record<MonsterKind, MonsterStats> = {
  shade: { label: 'Shade', day: false, hp: 52, sight: 20, cone: 75, chase: 5.1, wander: 1.6, reach: 1.9, hitReach: 2.5, windup: 0.4, damage: 15, cooldown: 1.1, lose: 6, radius: 0.55, top: 2.1, knock: 1, stun: 1 },
  brute: { label: 'Brute', day: false, hp: 140, sight: 15, cone: 65, chase: 3.5, wander: 1.4, reach: 2.5, hitReach: 3.1, windup: 0.6, damage: 30, cooldown: 1.9, lose: 9, radius: 0.85, top: 2.6, knock: 0.4, stun: 0.6 },
  raptor: { label: 'Raptor', day: true, hp: 70, sight: 28, cone: 85, chase: 7.4, wander: 2.2, reach: 1.9, hitReach: 2.5, windup: 0.3, damage: 12, cooldown: 0.9, lose: 8, radius: 0.6, top: 1.5, knock: 0.9, stun: 0.9 },
  rex: { label: 'Rex', day: true, hp: 260, sight: 26, cone: 70, chase: 5.2, wander: 1.8, reach: 3.4, hitReach: 4.2, windup: 0.9, damage: 38, cooldown: 2.4, lose: 10, radius: 1.3, top: 4.2, knock: 0.15, stun: 0.3 },
  dragon: { label: 'Dragon', day: true, hp: 150, sight: 55, cone: 360, chase: 11, wander: 9, reach: 24, hitReach: 0, windup: 1.0, damage: 10, cooldown: 6, lose: 9, radius: 2.4, top: 3, knock: 0, stun: 0.5 },
};

export interface Fireball {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  z: number;
  heading: number;
  speed: number;
  hp: number;
  maxHp: number;
  /** Height above the ground (only dragons leave it). */
  y: number;
  state: 'wander' | 'investigate' | 'chase' | 'windup' | 'dying';
  path: { x: number; z: number }[];
  pathAge: number;
  target: { x: number; z: number } | null;
  /** Seconds since the player was last seen. */
  lost: number;
  /** 0..1 awareness of the player; at 1 the monster has spotted them. */
  alert: number;
  timer: number;
  attackCd: number;
  stun: number;
  flash: number;
  senseTimer: number;
  phase: number;
  /** Body scale 0..1: grows in when spawned, shrinks as it dissolves. */
  vis: number;
  knockX: number;
  knockZ: number;
  searching: boolean;
  growled: boolean;
}

export type LootKind = 'cash' | 'medkit' | 'ammo' | 'pistol' | 'shotgun' | 'taser' | 'bat';

export interface Loot {
  id: number;
  kind: LootKind;
  x: number;
  z: number;
  value: number;
  age: number;
}

export interface Tracer {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  life: number;
  colour: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
  life: number;
}

export type Stealth = 'hidden' | 'exposed' | 'spotted';

export interface PlayerState {
  hp: number;
  maxHp: number;
  cash: number;
  alive: boolean;
  weapon: WeaponId;
  owned: Record<WeaponId, boolean>;
  ammo: Record<AmmoKind, number>;
  cooldown: number;
  /** 0..1 how recently a weapon was used (drives the viewmodel animation). */
  swing: number;
  swingHand: number;
  crouching: boolean;
  /** 0 standing .. 1 fully crouched (smoothed). */
  crouchAmount: number;
  /** Running (Shift) uses stamina; when it runs out you are winded until it recovers. */
  sprinting: boolean;
  stamina: number;
  winded: boolean;
  flashlight: boolean;
  stillFor: number;
  /** 0..1: how easy the player is to see right now (lower is better hidden). */
  visibility: number;
  stealth: Stealth;
  /** Radius (m) within which monsters can hear the player right now. */
  noise: number;
  noiseBurst: number;
  burstTimer: number;
  /** Red flash after being hurt, 0..1. */
  hurt: number;
  /** Extra velocity from being knocked back. */
  pushX: number;
  pushZ: number;
  /** Shelter: hiding inside a building. */
  shelter: { pieceId: string; x: number; z: number } | null;
  /** 0..1 how close monsters are to breaking in. */
  alarm: number;
  inFoliage: boolean;
  /** Nearest door the player could shelter behind. */
  nearDoor: { pieceId: string; x: number; z: number } | null;
  hitMarker: number;
  kills: number;
  knockouts: number;
  deathTimer: number;
}

export type RunOutcome = 'none' | 'won' | 'lost';

export interface RunState {
  /** A monster night is in progress. */
  active: boolean;
  /** Game hours survived so far, out of SURVIVAL_HOURS. */
  hours: number;
  /** Which day it is, from 1. */
  day: number;
  outcome: RunOutcome;
  /** Real seconds since the night began. */
  elapsed: number;
  intro: boolean;
}

/** Survival starts at 7 in the morning and lasts three full days. */
const SURVIVAL_START_HOUR = 7;
const SURVIVAL_HOURS = 72;
/** Game hours per real second in survival: a whole day lasts five minutes. */
const SURVIVAL_RATE = 24 / 300;
const MAX_MONSTERS = 9;
const MAX_LOOT = 9;

const range = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

class Combat {
  /** Walk mode with danger switched on (normal or monster). */
  active = false;
  subMode: 'peaceful' | 'normal' | 'survival' = 'peaceful';
  monsters: Monster[] = [];
  loot: Loot[] = [];
  tracers: Tracer[] = [];
  fireballs: Fireball[] = [];
  /** True during daylight in survival (dinosaurs, dragons, robbers); false at night (monsters). */
  isDay = true;
  toasts: Toast[] = [];
  /** Camera ray for attacks, set every frame by the player controller. */
  aim = { x: 0, y: 1.6, z: 0, dx: 0, dy: 0, dz: -1 };
  /** Where the player stands (feet), kept in sync with the sim. */
  readonly player: PlayerState = {
    hp: 100,
    maxHp: 100,
    cash: 200,
    alive: true,
    weapon: 'fists',
    owned: { fists: true, bat: true, pistol: false, shotgun: false, taser: false },
    ammo: { bullets: 0, shells: 0, charges: 0 },
    cooldown: 0,
    swing: 0,
    swingHand: 0,
    crouching: false,
    crouchAmount: 0,
    sprinting: false,
    stamina: 1,
    winded: false,
    flashlight: false,
    stillFor: 0,
    visibility: 1,
    stealth: 'hidden',
    noise: 0,
    noiseBurst: 0,
    burstTimer: 0,
    hurt: 0,
    pushX: 0,
    pushZ: 0,
    shelter: null,
    alarm: 0,
    inFoliage: false,
    nearDoor: null,
    hitMarker: 0,
    kills: 0,
    knockouts: 0,
    deathTimer: 0,
  };
  readonly run: RunState = { active: false, hours: 0, day: 1, outcome: 'none', elapsed: 0, intro: false };
  /** Set when the player should be put back somewhere (after being knocked out). */
  respawn: { x: number; z: number } | null = null;
  /** Where the player started this session, used as the respawn point. */
  home = { x: 0, z: 0 };

  private nextId = 1;
  private px = 0;
  private pz = 0;
  private lastX = 0;
  private lastZ = 0;
  private crimeTimer = 40;
  private spawnTimer = 5;
  private lootTimer = 4;
  private chargeTimer = 0;
  private robberTimer = 12;
  private lastShotAt = -99;
  private pathBudget = 0;
  private threats = new Map<number, { x: number; z: number }>();

  constructor() {
    sim.pedHook = (ped, dt) => this.pedUpdate(ped, dt);
  }

  // --- Mode handling -------------------------------------------------------------------------

  /** Called every frame: notices when walk mode / the danger level changes. */
  private sync() {
    const { mode, roamSubMode } = useGameStore.getState();
    const wantActive = mode === 'roam' && roamSubMode !== 'peaceful';
    const sub = wantActive ? roamSubMode : 'peaceful';
    if (wantActive === this.active && sub === this.subMode) return;
    const wasMonster = this.subMode === 'survival';
    this.active = wantActive;
    this.subMode = sub;
    if (!wantActive) {
      this.stop();
      return;
    }
    if (wasMonster && sub !== 'survival') this.endRun();
    this.begin();
  }

  private begin() {
    const p = this.player;
    this.home = { x: this.px, z: this.pz };
    p.hp = p.maxHp;
    p.alive = true;
    p.hurt = 0;
    p.shelter = null;
    p.alarm = 0;
    p.cash = Math.max(p.cash, 200);
    p.weapon = 'fists';
    p.owned = { fists: true, bat: true, pistol: this.subMode === 'survival', shotgun: false, taser: this.subMode === 'survival' };
    p.ammo = { bullets: this.subMode === 'survival' ? 16 : 0, shells: 0, charges: this.subMode === 'survival' ? 3 : 0 };
    p.kills = 0;
    p.knockouts = 0;
    this.monsters = [];
    this.loot = [];
    this.crimeTimer = range(25, 45);
    this.spawnTimer = 6;
    this.lootTimer = 3;
    useGameStore.setState({ flying: false });
    if (this.subMode === 'survival') {
      this.startRun();
    } else {
      this.endRun();
      this.toast('Watch your back: muggers and angry locals about. Press 1-5 to switch weapons.', 'warn');
    }
  }

  private stop() {
    this.monsters = [];
    this.fireballs = [];
    this.loot = [];
    this.tracers = [];
    this.toasts = [];
    this.player.shelter = null;
    this.player.alive = true;
    this.player.crouching = false;
    this.endRun();
  }

  /** Starts a monster night: dusk, a pistol and a taser, and a clock that runs towards dawn. */
  startRun() {
    this.run.active = true;
    this.run.hours = 0;
    this.run.day = 1;
    this.run.outcome = 'none';
    this.run.elapsed = 0;
    this.run.intro = true;
    atmo.hour = SURVIVAL_START_HOUR;
    atmo.rateOverride = 0; // paused until the player taps Begin
    this.monsters = [];
    this.fireballs = [];
    this.isDay = true;
    this.spawnTimer = 8;
    this.robberTimer = 14;
  }

  /** The player has read the intro: the first day begins. */
  beginRun() {
    this.run.intro = false;
    atmo.rateOverride = SURVIVAL_RATE;
    this.toast('Day 1. Robbers, dinosaurs and dragons roam by day. Hide, fight, and find supplies.', 'warn');
  }

  private endRun() {
    this.run.active = false;
    this.run.intro = false;
    atmo.rateOverride = null;
  }

  /** After a win or loss: the same night again, from the start. */
  retry() {
    const p = this.player;
    p.hp = p.maxHp;
    p.alive = true;
    p.hurt = 0;
    p.shelter = null;
    this.respawn = { ...this.home };
    this.begin();
  }

  /** After surviving: carry on exploring with the monsters gone. */
  dismiss() {
    this.run.outcome = 'none';
    this.run.active = false;
    atmo.rateOverride = null;
    this.monsters = [];
  }

  // --- Frame update --------------------------------------------------------------------------

  update(dt: number) {
    dt = Math.min(dt, 0.1);
    const px = sim.player.x;
    const pz = sim.player.z;
    this.px = px;
    this.pz = pz;
    this.sync();
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    if (!this.active) return;

    const p = this.player;
    const moved = Math.hypot(px - this.lastX, pz - this.lastZ) / Math.max(dt, 1e-3);
    this.lastX = px;
    this.lastZ = pz;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.swing = Math.max(0, p.swing - dt * 3.2);
    p.hurt = Math.max(0, p.hurt - dt * 1.4);
    p.hitMarker = Math.max(0, p.hitMarker - dt * 5);
    p.stillFor = moved < 0.4 ? p.stillFor + dt : 0;
    p.burstTimer = Math.max(0, p.burstTimer - dt);
    if (p.burstTimer <= 0) p.noiseBurst = 0;
    const walking = moved > 0.6 && !p.shelter;
    p.noise = Math.max(p.noiseBurst, walking ? (p.crouching ? 3.5 : p.sprinting ? 17 : 9) : 0);

    // Taser charges slowly refill.
    if (p.owned.taser && p.ammo.charges < 3) {
      this.chargeTimer += dt;
      if (this.chargeTimer > 22) {
        this.chargeTimer = 0;
        p.ammo.charges++;
      }
    }

    if (!p.alive) {
      p.deathTimer -= dt;
      if (p.deathTimer <= 0 && !this.run.active) this.respawnPlayer();
      return;
    }

    this.updateStealthSense();
    if (this.run.active) this.updateRun(dt);
    this.updateMonsters(dt);
    this.updateFireballs(dt);
    this.updateLoot(dt);
    this.updateShelter(dt);
    if (this.subMode === 'normal') this.updateCrime(dt);
    this.updateAlerts();
  }

  // --- Stealth -------------------------------------------------------------------------------

  private updateStealthSense() {
    const p = this.player;
    const world = sim.world;
    const gx = cellOf(this.px);
    const gz = cellOf(this.pz);
    p.inFoliage = false;
    for (let dx = -1; dx <= 1 && !p.inFoliage; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!world.foliage.has(cellKey(gx + dx, gz + dz))) continue;
        if (Math.hypot(cellCentre(gx + dx) - this.px, cellCentre(gz + dz) - this.pz) < 4.6) {
          p.inFoliage = true;
          break;
        }
      }
    }
    // Door within reach (for sheltering).
    p.nearDoor = null;
    let best = 3.4;
    for (const d of world.destinations) {
      if (d.kind !== 'door') continue;
      const dist = Math.hypot(d.point.x - this.px, d.point.z - this.pz);
      if (dist < best) {
        best = dist;
        p.nearDoor = { pieceId: d.pieceId, x: d.point.x, z: d.point.z };
      }
    }
    // Lamps make you easy to see at night.
    let lit = 0;
    if (atmo.lamps > 0.2) {
      for (const lamp of world.lamps) {
        const d = Math.hypot(lamp.x - this.px, lamp.z - this.pz);
        if (d < 16) lit += 1 - d / 16;
      }
      lit = Math.min(1, lit);
    } else {
      lit = 1;
    }
    let v = 1;
    if (p.crouching) v *= 0.6;
    if (p.flashlight) v = Math.min(1, v * 1.8 + 0.1);
    if (p.stillFor > 0.7) v *= 0.75;
    if (p.inFoliage) v *= 0.4;
    v *= 1 - atmo.lamps * (1 - (0.45 + 0.55 * lit)) ;
    v *= 1 - 0.35 * atmo.fog - 0.15 * atmo.rain;
    p.visibility = p.shelter ? 0 : clamp01(v);
  }

  private updateAlerts() {
    const p = this.player;
    let worst = 0;
    let chased = false;
    for (const m of this.monsters) {
      if (m.state === 'dying') continue;
      worst = Math.max(worst, m.alert);
      if (m.state === 'chase' || m.state === 'windup') chased = true;
    }
    p.stealth = chased ? 'spotted' : worst > 0.2 ? 'exposed' : 'hidden';
  }

  // --- Line of sight -------------------------------------------------------------------------

  /** Is the straight line between two points clear of buildings? */
  lineOfSight(x0: number, z0: number, x1: number, z1: number): boolean {
    const sight = sim.world.sight;
    if (sight.size === 0) return true;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 1.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (sight.has(cellKey(cellOf(x0 + dx * t), cellOf(z0 + dz * t)))) return false;
    }
    return true;
  }

  // --- Monsters ------------------------------------------------------------------------------

  private updateRun(dt: number) {
    const run = this.run;
    if (run.intro || run.outcome !== 'none') return;
    run.elapsed += dt;
    run.hours += (atmo.rateOverride ?? 0) * dt;
    if (run.hours >= SURVIVAL_HOURS) {
      run.outcome = 'won';
      atmo.rateOverride = 0;
      playSfx('win');
      for (const m of this.monsters) {
        m.state = 'dying';
        m.timer = range(0.6, 2.2);
      }
      return;
    }

    // Dawn and dusk swap the cast: dinosaurs, dragons and robbers by day; monsters by night.
    const dayNow = atmo.sunHeight > 0.02;
    if (dayNow !== this.isDay) this.changePhase(dayNow);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = range(4, 8);
      this.spawnWave();
    }
    this.robberTimer -= dt;
    if (this.robberTimer <= 0) {
      this.robberTimer = range(20, 38);
      if (this.isDay) this.spawnRobbers();
    }
  }

  private changePhase(day: boolean) {
    this.isDay = day;
    for (const m of this.monsters) {
      if (MONSTER_STATS[m.kind].day !== day && m.state !== 'dying') {
        m.state = 'dying';
        m.timer = range(1, 6);
      }
    }
    if (day) {
      this.run.day++;
      this.toast(`Day ${this.run.day}. The monsters melt away. Dinosaurs, dragons and robbers are out.`, 'warn');
    } else {
      this.toast('Night falls. Monsters rise from the dark. Stay hidden!', 'warn');
      for (const ped of sim.peds) if (ped.armed) this.calm(ped); // the robbers go home
    }
  }

  private countOf(kinds: MonsterKind[]) {
    return this.monsters.filter((m) => m.state !== 'dying' && kinds.includes(m.kind)).length;
  }

  /** Keeps the right number of creatures around for the time of day and how many days have passed. */
  private spawnWave() {
    const dayNo = this.run.day;
    if (this.monsters.filter((m) => m.state !== 'dying').length >= MAX_MONSTERS) return;
    if (this.isDay) {
      const dinos = Math.min(4, 1 + dayNo);
      if (this.countOf(['raptor', 'rex']) < dinos) {
        this.spawnMonster(dayNo > 1 && Math.random() < 0.3 ? 'rex' : 'raptor');
        return;
      }
      const dragons = dayNo >= 3 ? 2 : dayNo >= 2 || atmo.hour >= 11 ? 1 : 0;
      if (this.countOf(['dragon']) < dragons) this.spawnMonster('dragon');
    } else {
      const progress = (atmo.hour >= 19 ? atmo.hour - 19 : atmo.hour + 5) / 11;
      const target = Math.min(MAX_MONSTERS - 1, 2 + dayNo + Math.floor(progress * 3));
      if (this.countOf(['shade', 'brute']) < target) this.spawnMonster(dayNo > 1 && Math.random() < 0.28 ? 'brute' : 'shade');
    }
  }

  private spawnMonster(kind: MonsterKind) {
    const world = sim.world;
    if (!world.bounds) return;
    const stats = MONSTER_STATS[kind];
    const flying = kind === 'dragon';
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = flying ? range(95, 130) : range(38, 80);
      const x = this.px + Math.sin(angle) * dist;
      const z = this.pz + Math.cos(angle) * dist;
      if (!flying) {
        if (!isWalkable(world, cellOf(x), cellOf(z))) continue;
        if (this.lineOfSight(x, z, this.px, this.pz) && dist < 60) continue; // never pop into view
        if (this.monsters.some((m) => Math.hypot(m.x - x, m.z - z) < 12)) continue;
      }
      this.monsters.push({
        id: this.nextId++,
        kind,
        x,
        z,
        y: flying ? 24 : 0,
        heading: flying ? Math.atan2(this.px - x, this.pz - z) : Math.random() * Math.PI * 2,
        speed: 0,
        hp: stats.hp,
        maxHp: stats.hp,
        state: 'wander',
        path: [],
        pathAge: 0,
        target: null,
        lost: 99,
        alert: 0,
        timer: 0,
        attackCd: 0,
        stun: 0,
        flash: 0,
        senseTimer: Math.random() * 0.2,
        phase: Math.random() * 6,
        vis: 0,
        knockX: 0,
        knockZ: 0,
        searching: false,
        growled: false,
      });
      return;
    }
  }

  /** Turns a few passers-by into armed robbers who go after the player. */
  private spawnRobbers() {
    const active = sim.peds.filter((o) => o.armed && o.role === 'thug').length;
    if (active >= Math.min(4, 1 + this.run.day)) return;
    const candidates = sim.peds.filter((o) => {
      if (o.role !== 'civilian' || o.vis < 0.9 || o.job) return false;
      if (o.state !== 'walking' && o.state !== 'idle' && o.state !== 'busy') return false;
      const d = Math.hypot(o.x - this.px, o.z - this.pz);
      return d > 18 && d < 55;
    });
    if (candidates.length === 0) return;
    const lead = pick(candidates);
    const crew = [lead, ...candidates.filter((o) => o !== lead && Math.hypot(o.x - lead.x, o.z - lead.z) < 12).slice(0, Math.random() < 0.5 ? 1 : 0)];
    for (const r of crew) {
      this.makeThug(r, 95);
      r.armed = true;
      r.hp = r.maxHp = 60;
      r.shirt = 0x15171c;
      r.pants = 0x22252b;
      r.coat = true;
      r.hairStyle = 0;
      r.emote = 'siren';
      r.emoteTimer = 3;
    }
    this.toast(crew.length > 1 ? 'Armed robbers are after you!' : 'An armed robber has spotted you!', 'warn');
  }

  /** Moves toward a point, sliding along walls instead of stopping. */
  private stepToward(e: { x: number; z: number; heading: number }, tx: number, tz: number, speed: number, dt: number, turn = 8): number {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) return 0;
    const step = Math.min(dist, speed * dt);
    const nx = e.x + (dx / dist) * step;
    const nz = e.z + (dz / dist) * step;
    const world = sim.world;
    let moved = step;
    if (isWalkable(world, cellOf(nx), cellOf(nz))) {
      e.x = nx;
      e.z = nz;
    } else if (isWalkable(world, cellOf(nx), cellOf(e.z))) {
      e.x = nx;
      moved = step * 0.7;
    } else if (isWalkable(world, cellOf(e.x), cellOf(nz))) {
      e.z = nz;
      moved = step * 0.7;
    } else {
      moved = 0;
    }
    e.heading += wrap(Math.atan2(dx, dz) - e.heading) * Math.min(1, dt * turn);
    return moved / Math.max(dt, 1e-3);
  }

  /** Follows a waypoint list; returns true once the end is reached. */
  private follow(e: { x: number; z: number; heading: number; path: { x: number; z: number }[] }, speed: number, dt: number): boolean {
    const wp = e.path[0];
    if (!wp) return true;
    if (Math.hypot(wp.x - e.x, wp.z - e.z) < 0.7) {
      e.path.shift();
      return e.path.length === 0;
    }
    this.stepToward(e, wp.x, wp.z, speed, dt, 10);
    return false;
  }

  private planPath(e: { x: number; z: number; path: { x: number; z: number }[] }, tx: number, tz: number): boolean {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    const cells = findPath(sim.world, [cellOf(e.x), cellOf(e.z)], [cellOf(tx), cellOf(tz)]);
    if (!cells) return false;
    e.path = cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx), z: cellCentre(gz) }));
    e.path.push({ x: tx, z: tz });
    return true;
  }

  private updateMonsters(dt: number) {
    const p = this.player;
    this.pathBudget = 3;
    const world = sim.world;
    for (const m of this.monsters) {
      m.phase += dt * (m.speed * 1.6 + 1.5);
      m.flash = Math.max(0, m.flash - dt * 4);
      m.attackCd = Math.max(0, m.attackCd - dt);
      m.pathAge += dt;
      m.vis = m.state === 'dying' ? Math.max(0, m.vis - dt * 1.3) : Math.min(1, m.vis + dt * 1.2);
      if (m.state === 'dying') {
        m.timer -= dt;
        m.speed = 0;
        if (m.y > 0) m.y = Math.max(0, m.y - dt * 9);
        if (m.timer <= 0 && m.vis <= 0) m.hp = -999;
        continue;
      }
      // Knock-back slide and stun.
      if (Math.abs(m.knockX) + Math.abs(m.knockZ) > 0.05) {
        const nx = m.x + m.knockX * dt;
        const nz = m.z + m.knockZ * dt;
        if (isWalkable(world, cellOf(nx), cellOf(nz))) {
          m.x = nx;
          m.z = nz;
        }
        const f = Math.exp(-dt * 7);
        m.knockX *= f;
        m.knockZ *= f;
      }
      if (m.stun > 0) {
        m.stun -= dt;
        m.speed = 0;
        continue;
      }

      if (m.kind === 'dragon') {
        this.updateDragon(m, dt);
        continue;
      }
      const st = MONSTER_STATS[m.kind];
      const dx = this.px - m.x;
      const dz = this.pz - m.z;
      const dist = Math.hypot(dx, dz);

      // --- Senses (a few times a second) ---
      m.senseTimer -= dt;
      let seen = false;
      if (m.senseTimer <= 0) {
        m.senseTimer = 0.18;
        if (!p.shelter && p.alive && dist < 60) {
          const range0 = st.sight * p.visibility;
          const fx = Math.sin(m.heading);
          const fz = Math.cos(m.heading);
          const inCone = dist < 3.5 || (dx * fx + dz * fz) / Math.max(dist, 1e-3) > Math.cos(st.cone * (Math.PI / 180));
          seen = dist < range0 && inCone && this.lineOfSight(m.x, m.z, this.px, this.pz);
          // Loud noises carry: they come to look, even if they cannot see you (walls muffle the sound).
          if (!seen && p.noise > dist * (this.lineOfSight(m.x, m.z, this.px, this.pz) ? 1 : 2)) {
            if (m.state === 'wander' || m.state === 'investigate') {
              m.state = 'investigate';
              m.searching = false;
              m.target = { x: this.px + range(-3, 3), z: this.pz + range(-3, 3) };
              m.path = [];
              m.pathAge = 9;
            }
          }
        }
        if (seen) {
          m.alert = Math.min(1, m.alert + 0.18 * (2.4 / (1 + dist / 9)) * (dist < 5 ? 2 : 1));
          m.lost = 0;
          m.target = { x: this.px, z: this.pz };
        } else {
          m.alert = Math.max(0, m.alert - 0.07);
          m.lost += 0.18;
        }
        if (m.alert >= 1 && m.state !== 'chase' && m.state !== 'windup') {
          m.state = 'chase';
          m.path = [];
          m.pathAge = 9;
          if (!m.growled) {
            m.growled = true;
            playSfx('growl', clamp01(1 - dist / 70));
          }
          playSfx('alert', clamp01(1 - dist / 40) * 0.8);
        }
      }

      // --- Behaviour ---
      const chaseSpeed = st.chase + Math.min(0.9, (this.run.day - 1) * 0.3);
      switch (m.state) {
        case 'wander': {
          m.speed = 1.6;
          if (m.path.length === 0) {
            m.timer -= dt;
            m.speed = 0;
            if (m.timer <= 0) {
              m.timer = range(1.5, 4);
              const tx = m.x + range(-60, 60);
              const tz = m.z + range(-60, 60);
              if (isWalkable(world, cellOf(tx), cellOf(tz)) && !this.planPath(m, tx, tz)) m.path = [];
            }
          } else if (this.follow(m, 1.7, dt)) {
            m.path = [];
          }
          break;
        }
        case 'investigate': {
          if (!m.target) {
            m.state = 'wander';
            break;
          }
          if (m.searching) {
            // Arrived: look about for a few seconds, then go back to patrolling.
            m.speed = 0;
            m.timer -= dt;
            m.heading += dt * 1.4;
            if (m.timer <= 0) {
              m.state = 'wander';
              m.target = null;
              m.alert = 0;
              m.searching = false;
            }
            break;
          }
          if (m.path.length === 0 && m.pathAge > 1) {
            m.pathAge = 0;
            if (!this.planPath(m, m.target.x, m.target.z)) {
              m.searching = true;
              m.timer = 3;
              break;
            }
          }
          m.speed = 3.2;
          if (m.path.length > 0 && this.follow(m, 3.2, dt)) {
            m.path = [];
            m.searching = true;
            m.timer = 3.5;
          }
          break;
        }
        case 'chase': {
          if (!p.alive || p.shelter) {
            m.state = 'investigate';
            m.searching = false;
            m.target = p.shelter ? { x: p.shelter.x, z: p.shelter.z } : { x: this.px, z: this.pz };
            m.path = [];
            break;
          }
          const losNow = m.lost < 0.4;
          // Lose interest after a while without seeing the player.
          if (m.lost > st.lose) {
            m.state = 'investigate';
            m.searching = false;
            m.path = [];
            m.alert = 0.35;
            break;
          }
          const goal = m.target ?? { x: this.px, z: this.pz };
          const gdist = Math.hypot(goal.x - m.x, goal.z - m.z);
          m.speed = chaseSpeed;
          if (losNow && dist < 12) {
            this.stepToward(m, goal.x, goal.z, chaseSpeed, dt, 12);
          } else {
            if ((m.path.length === 0 || m.pathAge > 0.8) && gdist > 2) {
              m.pathAge = 0;
              if (!this.planPath(m, goal.x, goal.z)) m.path = [];
            }
            if (m.path.length > 0) this.follow(m, chaseSpeed, dt);
            else this.stepToward(m, goal.x, goal.z, chaseSpeed * 0.9, dt, 10);
          }
          const reach = st.reach;
          if (dist < reach && m.attackCd <= 0 && losNow) {
            m.state = 'windup';
            m.timer = st.windup;
            m.speed = 0;
          }
          break;
        }
        case 'windup': {
          m.speed = 0;
          m.heading += wrap(Math.atan2(dx, dz) - m.heading) * Math.min(1, dt * 14);
          m.timer -= dt;
          if (m.timer <= 0) {
            const reach = st.hitReach;
            if (dist < reach && p.alive && !p.shelter) {
              this.damagePlayer(st.damage, m.x, m.z);
            }
            m.attackCd = st.cooldown;
            m.state = 'chase';
          }
          break;
        }
      }
      // Never stand inside the player.
      if (dist < 0.9) {
        const push = (0.9 - dist) * 0.5;
        m.x -= (dx / Math.max(dist, 0.01)) * push;
        m.z -= (dz / Math.max(dist, 0.01)) * push;
      }
    }
    // Remove the dead and dissolved.
    const dead = this.monsters.filter((m) => m.hp <= -900);
    if (dead.length > 0) this.monsters = this.monsters.filter((m) => m.hp > -900);
  }

  // --- Dragons -------------------------------------------------------------------------------

  /** Dragons fly: they circle high above, then swoop in to breathe fire and climb away again. */
  private updateDragon(m: Monster, dt: number) {
    const p = this.player;
    const st = MONSTER_STATS.dragon;
    const sheltered = !!p.shelter;
    const ax = sheltered ? p.shelter!.x : this.px;
    const az = sheltered ? p.shelter!.z : this.pz;
    const dx = ax - m.x;
    const dz = az - m.z;
    const dist = Math.hypot(dx, dz);

    m.senseTimer -= dt;
    if (m.senseTimer <= 0) {
      m.senseTimer = 0.25;
      const seen = p.alive && !sheltered && dist < st.sight * p.visibility + 10;
      if (seen) {
        m.alert = Math.min(1, m.alert + 0.3);
        m.lost = 0;
      } else {
        m.alert = Math.max(0, m.alert - 0.06);
        m.lost += 0.25;
      }
      if (m.alert >= 1 && m.state === 'wander') {
        m.state = 'chase';
        m.searching = false;
        if (!m.growled) {
          m.growled = true;
          playSfx('growl', clamp01(1 - dist / 120));
        }
      }
      if (m.state === 'chase' && m.lost > st.lose && !sheltered) {
        m.state = 'wander';
        m.alert = 0;
      }
    }

    let goalX = ax;
    let goalZ = az;
    let goalY = 20;
    let speed = st.wander;
    m.phase += dt * 3;
    switch (m.state) {
      case 'wander': {
        // Circle the player (or the building they are hiding in).
        const radius = sheltered ? 7 : 38;
        const a = sim.time * (sheltered ? 0.5 : 0.18) + m.id;
        goalX = ax + Math.cos(a) * radius;
        goalZ = az + Math.sin(a) * radius;
        goalY = sheltered ? 11 : 19 + Math.sin(sim.time * 0.4 + m.id) * 3;
        speed = st.wander;
        if (sheltered) m.alert = Math.max(m.alert, 0.5);
        break;
      }
      case 'chase': {
        speed = st.chase;
        if (m.searching) {
          // Climbing away after a strafing run.
          const away = Math.atan2(m.x - ax, m.z - az);
          goalX = ax + Math.sin(away) * 34;
          goalZ = az + Math.cos(away) * 34;
          goalY = 19;
          if (m.pathAge > 3) m.searching = false;
        } else {
          const away = Math.atan2(m.x - ax, m.z - az);
          goalX = ax + Math.sin(away) * 13;
          goalZ = az + Math.cos(away) * 13;
          goalY = 8 + Math.sin(sim.time * 1.7 + m.id) * 1.2;
          if (dist < 24 && m.attackCd <= 0 && p.alive && !sheltered) {
            m.state = 'windup';
            m.timer = st.windup;
          }
        }
        break;
      }
      case 'windup': {
        speed = 1.5;
        goalX = m.x;
        goalZ = m.z;
        goalY = m.y;
        m.heading += wrap(Math.atan2(dx, dz) - m.heading) * Math.min(1, dt * 6);
        m.timer -= dt;
        if (m.timer <= 0) {
          this.breatheFire(m);
          m.attackCd = st.cooldown;
          m.state = 'chase';
          m.searching = true;
          m.pathAge = 0;
        }
        break;
      }
    }
    if (m.state !== 'windup') {
      const gx = goalX - m.x;
      const gz = goalZ - m.z;
      const gd = Math.hypot(gx, gz) || 1;
      const step = Math.min(gd, speed * dt);
      m.x += (gx / gd) * step;
      m.z += (gz / gd) * step;
      m.speed = speed;
      const wanted = gd > 2 ? Math.atan2(gx, gz) : Math.atan2(dx, dz);
      m.heading += wrap(wanted - m.heading) * Math.min(1, dt * 2.2);
    } else {
      m.speed = 0;
    }
    m.y += (goalY - m.y) * Math.min(1, dt * 1.4);
  }

  private breatheFire(m: Monster) {
    const mx = m.x + Math.sin(m.heading) * 3.2;
    const mz = m.z + Math.cos(m.heading) * 3.2;
    const my = m.y + 0.4;
    for (let i = 0; i < 4; i++) {
      const spread = (i - 1.5) * 0.12;
      const tx = this.px + Math.sin(m.heading + Math.PI / 2) * spread * 15 + range(-1, 1);
      const tz = this.pz + Math.cos(m.heading + Math.PI / 2) * spread * 15 + range(-1, 1);
      const dx = tx - mx;
      const dy = 1.1 - my;
      const dz = tz - mz;
      const l = Math.hypot(dx, dy, dz) || 1;
      const speed = 25;
      this.fireballs.push({ id: this.nextId++, x: mx, y: my, z: mz, vx: (dx / l) * speed, vy: (dy / l) * speed, vz: (dz / l) * speed, life: 2.6 });
    }
    playSfx('shotgun', 0.5);
    playSfx('growl', 0.8);
  }

  private updateFireballs(dt: number) {
    const p = this.player;
    for (const f of this.fireballs) {
      f.life -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      if (f.y < 0.2 || sim.world.sight.has(cellKey(cellOf(f.x), cellOf(f.z))) && f.y < 14) f.life = 0;
      if (p.alive && !p.shelter && Math.hypot(f.x - this.px, f.z - this.pz) < 1.3 && Math.abs(f.y - 1.1) < 1.6) {
        f.life = 0;
        this.damagePlayer(MONSTER_STATS.dragon.damage, f.x - f.vx, f.z - f.vz);
      }
    }
    if (this.fireballs.some((f) => f.life <= 0)) this.fireballs = this.fireballs.filter((f) => f.life > 0);
  }

  // --- Shelter -------------------------------------------------------------------------------

  /** Press E / the Hide button: duck into the nearest building, or come back out. */
  interact() {
    const p = this.player;
    if (!this.active || !p.alive) return;
    if (p.shelter) {
      p.shelter = null;
      p.alarm = 0;
      playSfx('door', 0.7);
      return;
    }
    if (p.nearDoor && !this.run.intro) {
      p.shelter = p.nearDoor;
      p.alarm = 0;
      playSfx('door', 0.7);
      // Monsters that were hunting you lose track and gather near the door.
      for (const m of this.monsters) {
        if (m.state === 'chase' || m.state === 'windup') {
          m.state = 'investigate';
          m.searching = false;
          m.target = { x: p.nearDoor.x, z: p.nearDoor.z };
          m.path = [];
        }
      }
    } else {
      this.toast('No door close enough to hide behind.', 'info');
    }
  }

  private updateShelter(dt: number) {
    const p = this.player;
    if (!p.shelter) return;
    let close = 0;
    for (const m of this.monsters) {
      if (m.state === 'dying') continue;
      const d = Math.hypot(m.x - p.shelter.x, m.z - p.shelter.z);
      if (d < 6) close++;
    }
    // Monsters hammering on the door wear it down; quiet time lets you recover.
    if (close > 0) {
      p.alarm = Math.min(1, p.alarm + dt * 0.1 * close);
      if (Math.random() < dt * 0.9) playSfx('door', 0.35);
    } else {
      p.alarm = Math.max(0, p.alarm - dt * 0.2);
      p.hp = Math.min(p.maxHp, p.hp + dt * 4);
    }
    if (p.alarm >= 1) {
      p.shelter = null;
      p.alarm = 0;
      this.toast('They broke the door down!', 'bad');
      this.damagePlayer(20, this.px + 1, this.pz + 1);
      for (const m of this.monsters) {
        if (Math.hypot(m.x - this.px, m.z - this.pz) < 8) {
          m.state = 'chase';
          m.alert = 1;
          m.lost = 0;
          m.target = { x: this.px, z: this.pz };
        }
      }
    }
  }

  // --- Loot ----------------------------------------------------------------------------------

  private updateLoot(dt: number) {
    const p = this.player;
    this.lootTimer -= dt;
    if (this.lootTimer <= 0 && this.loot.length < MAX_LOOT) {
      this.lootTimer = range(10, 22);
      this.spawnLoot();
    }
    for (const l of this.loot) l.age += dt;
    if (p.shelter) return;
    for (const l of this.loot) {
      if (Math.hypot(l.x - this.px, l.z - this.pz) > 1.9) continue;
      if (this.collect(l)) l.age = -1e9;
    }
    this.loot = this.loot.filter((l) => l.age > -1e8 && l.age < 240);
  }

  private spawnLoot() {
    const world = sim.world;
    if (!world.bounds) return;
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = range(14, 60);
      const x = this.px + Math.sin(angle) * dist;
      const z = this.pz + Math.cos(angle) * dist;
      if (!isWalkable(world, cellOf(x), cellOf(z))) continue;
      const monster = this.subMode === 'survival';
      const roll = Math.random();
      let kind: LootKind = 'cash';
      if (monster) kind = roll < 0.3 ? 'medkit' : roll < 0.7 ? 'ammo' : roll < 0.8 ? 'shotgun' : roll < 0.9 ? 'bat' : 'taser';
      else kind = roll < 0.45 ? 'cash' : roll < 0.62 ? 'medkit' : roll < 0.8 ? 'ammo' : roll < 0.9 ? 'pistol' : roll < 0.96 ? 'taser' : 'shotgun';
      this.loot.push({ id: this.nextId++, kind, x, z, value: kind === 'cash' ? Math.round(range(15, 90) / 5) * 5 : 0, age: 0 });
      return;
    }
  }

  dropLoot(kind: LootKind, x: number, z: number, value = 0) {
    this.loot.push({ id: this.nextId++, kind, x, z, value, age: 0 });
  }

  private collect(l: Loot): boolean {
    const p = this.player;
    switch (l.kind) {
      case 'cash':
        p.cash += l.value;
        this.toast(`+$${l.value}`, 'good');
        break;
      case 'medkit':
        if (p.hp >= p.maxHp) return false;
        p.hp = Math.min(p.maxHp, p.hp + 40);
        this.toast('Medkit: +40 health', 'good');
        break;
      case 'ammo': {
        const owned = (['pistol', 'shotgun', 'taser'] as WeaponId[]).filter((w) => p.owned[w]);
        const w = owned.length > 0 ? pick(owned) : 'pistol';
        const kind = WEAPONS[w].ammo!;
        p.ammo[kind] += AMMO_PER_PICKUP[kind];
        this.toast(`Ammo: +${AMMO_PER_PICKUP[kind]} for the ${WEAPONS[w].label.toLowerCase()}`, 'good');
        break;
      }
      default: {
        const id = l.kind as WeaponId;
        const def = WEAPONS[id];
        const had = p.owned[id];
        p.owned[id] = true;
        if (def.ammo) p.ammo[def.ammo] += AMMO_PER_PICKUP[def.ammo];
        if (!had) p.weapon = id;
        this.toast(had ? `${def.label}: ammo` : `Picked up a ${def.label.toLowerCase()}!`, 'good');
      }
    }
    playSfx('pickup');
    return true;
  }

  // --- Player actions ------------------------------------------------------------------------

  selectWeapon(id: WeaponId) {
    const p = this.player;
    if (!p.owned[id] || p.weapon === id) return;
    p.weapon = id;
    p.cooldown = Math.max(p.cooldown, 0.2);
  }

  /** Switch to the next / previous weapon you own. */
  cycleWeapon(dir: 1 | -1) {
    const owned = WEAPON_ORDER.filter((w) => this.player.owned[w]);
    if (owned.length < 2) return;
    const i = owned.indexOf(this.player.weapon);
    this.selectWeapon(owned[(i + dir + owned.length) % owned.length]);
  }

  setCrouch(on: boolean) {
    this.player.crouching = on;
  }

  /** Fires / swings the current weapon along the camera ray. Returns true if it went off. */
  attack(): boolean {
    const p = this.player;
    if (!this.active || !p.alive || p.shelter || p.cooldown > 0 || this.run.intro || this.run.outcome !== 'none') return false;
    const w = WEAPONS[p.weapon];
    if (w.ammo && p.ammo[w.ammo] <= 0) {
      p.cooldown = 0.3;
      playSfx('empty');
      this.toast(`${w.label}: out of ammo`, 'warn');
      return false;
    }
    if (w.ammo) p.ammo[w.ammo]--;
    p.cooldown = w.cooldown;
    p.swing = 1;
    p.swingHand ^= 1;
    p.noiseBurst = Math.max(p.noiseBurst, w.noise);
    p.burstTimer = 0.8;
    if (!w.melee) this.lastShotAt = sim.time;
    const a = this.aim;

    if (w.melee) {
      playSfx(w.id === 'bat' ? 'bat' : 'punch', 0.9);
      const flat = Math.hypot(a.dx, a.dz) || 1;
      const fx = a.dx / flat;
      const fz = a.dz / flat;
      const found: { v: { kind: 'ped' | 'monster'; ref: Ped | Monster; d: number } | null } = { v: null };
      const consider = (kind: 'ped' | 'monster', ref: Ped | Monster, x: number, z: number) => {
        const dx = x - this.px;
        const dz = z - this.pz;
        const d = Math.hypot(dx, dz);
        if (d > w.range + 0.4 || d < 1e-3) return;
        if ((dx * fx + dz * fz) / d < 0.5) return; // within about 60 degrees of where you are looking
        if (!found.v || d < found.v.d) found.v = { kind, ref, d };
      };
      for (const m of this.monsters) if (m.state !== 'dying' && m.y < 3.5) consider('monster', m, m.x, m.z);
      for (const ped of sim.peds) if (this.targetablePed(ped)) consider('ped', ped, ped.x, ped.z);
      if (found.v) this.hit(found.v.kind, found.v.ref, w, fx, fz, w.damage);
      return true;
    }

    // Ranged: each pellet is a ray tested against everything standing in the way.
    playSfx(w.id === 'shotgun' ? 'shotgun' : w.id === 'taser' ? 'taser' : 'shot');
    for (let i = 0; i < w.pellets; i++) {
      const sx = (Math.random() - 0.5) * 2 * w.spread;
      const sy = (Math.random() - 0.5) * 2 * w.spread;
      let dx = a.dx + sx;
      let dy = a.dy + sy;
      let dz = a.dz + sx * 0.5;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;
      let bestT = w.range;
      const hit: { kind: 'ped' | 'monster' | null; ref: Ped | Monster | null } = { kind: null, ref: null };
      const test = (kind: 'ped' | 'monster', ref: Ped | Monster, x: number, z: number, radius: number, top: number, bottom = -0.1) => {
        const ox = x - a.x;
        const oz = z - a.z;
        const flat2 = dx * dx + dz * dz;
        if (flat2 < 1e-6) return;
        // Where along the ray it passes closest to the body's upright axis (steep shots need the divide).
        const t = (ox * dx + oz * dz) / flat2;
        if (t < 0 || t > bestT) return;
        const cx = a.x + dx * t;
        const cz = a.z + dz * t;
        const cy = a.y + dy * t;
        if (Math.hypot(cx - x, cz - z) > radius || cy < bottom || cy > top) return;
        bestT = t;
        hit.kind = kind;
        hit.ref = ref;
      };
      for (const m of this.monsters) {
        if (m.state === 'dying') continue;
        const ms = MONSTER_STATS[m.kind];
        if (m.kind === 'dragon') test('monster', m, m.x, m.z, ms.radius, m.y + 1.8, m.y - 1.4);
        else test('monster', m, m.x, m.z, ms.radius, ms.top);
      }
      for (const ped of sim.peds) if (this.targetablePed(ped)) test('ped', ped, ped.x, ped.z, 0.48, 1.9);
      // A building in the way stops the shot.
      const wallAt = this.firstWall(a.x, a.z, dx, dz, bestT, dy);
      if (wallAt !== null && wallAt < bestT) {
        bestT = wallAt;
        hit.kind = null;
        hit.ref = null;
      }
      this.tracers.push({
        x0: a.x + dx * 0.9 + 0.18,
        y0: a.y - 0.18,
        z0: a.z + dz * 0.9,
        x1: a.x + dx * bestT,
        y1: a.y + dy * bestT,
        z1: a.z + dz * bestT,
        life: w.id === 'taser' ? 0.18 : 0.07,
        colour: w.id === 'taser' ? 0x7de3ff : 0xffe9a0,
      });
      if (hit.kind && hit.ref) {
        const flat = Math.hypot(dx, dz) || 1;
        this.hit(hit.kind, hit.ref, w, dx / flat, dz / flat, w.damage);
      }
    }
    return true;
  }

  private firstWall(x: number, z: number, dx: number, dz: number, maxT: number, dy = 0): number | null {
    const sight = sim.world.sight;
    if (sight.size === 0) return null;
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-4) return null;
    for (let t = 1; t < maxT; t += 1.2) {
      // A shot that is already above the rooftops (aimed at a dragon) is not stopped by walls.
      if (this.aim.y + dy * t > 14) return null;
      if (sight.has(cellKey(cellOf(x + dx * t), cellOf(z + dz * t)))) return t;
    }
    return null;
  }

  private targetablePed(ped: Ped): boolean {
    return ped.vis > 0.6 && ped.state !== 'inside' && ped.state !== 'entering' && ped.state !== 'down';
  }

  private hit(kind: 'ped' | 'monster', ref: Ped | Monster, w: WeaponDef, fx: number, fz: number, damage: number) {
    const p = this.player;
    p.hitMarker = 1;
    if (kind === 'monster') {
      const m = ref as Monster;
      m.hp -= damage;
      m.flash = 1;
      const ms = MONSTER_STATS[m.kind];
      m.knockX += fx * w.knock * ms.knock;
      m.knockZ += fz * w.knock * ms.knock;
      if (w.stun > 0 && m.stun < w.stun * ms.stun) m.stun = w.stun * ms.stun;
      if (m.kind === 'dragon') {
        m.alert = 1;
        m.lost = 0;
        if (m.state === 'wander') m.state = 'chase';
      }
      // A hit makes it notice you.
      if (m.state === 'wander' || m.state === 'investigate') {
        m.state = 'chase';
        m.alert = 1;
        m.lost = 0;
        m.target = { x: this.px, z: this.pz };
      }
      if (m.hp <= 0) {
        m.state = 'dying';
        m.timer = 1.1;
        p.kills++;
        this.toast(`${ms.label} down!`, 'good');
        if (Math.random() < 0.45) this.dropLoot(Math.random() < 0.5 ? 'medkit' : 'ammo', m.x, m.z);
      }
      return;
    }
    const ped = ref as Ped;
    this.hurtPed(ped, damage, fx, fz, w.knock, w.stun, true);
  }

  /** A person takes a hit: they fight back, run, or go down. Witnesses react too. */
  private hurtPed(ped: Ped, damage: number, fx: number, fz: number, knock: number, stun: number, byPlayer: boolean) {
    ped.hp -= damage;
    ped.flash = 1;
    ped.knockX += fx * knock;
    ped.knockZ += fz * knock;
    ped.path = [];
    this.threats.set(ped.id, { x: this.px, z: this.pz });
    if (ped.hp <= 0 || stun > 2) {
      ped.state = 'down';
      ped.timer = ped.hp <= 0 ? range(7, 11) : stun;
      ped.fall = 0;
      ped.emote = 'stars';
      ped.emoteTimer = 3;
      if (ped.hp <= 0) {
        this.player.knockouts++;
        if (ped.stolen > 0) {
          this.dropLoot('cash', ped.x, ped.z, ped.stolen);
          this.toast(`You got $${ped.stolen} back!`, 'good');
          ped.stolen = 0;
        } else if (ped.role === 'civilian' && byPlayer) {
          this.toast('Someone got knocked out. Not very neighbourly!', 'warn');
        } else if (Math.random() < 0.5) {
          this.dropLoot('cash', ped.x, ped.z, Math.round(range(10, 40) / 5) * 5);
        }
      }
      ped.hp = Math.max(ped.hp, 1);
      return;
    }
    if (!byPlayer) return;
    // Victim: fight back or run depending on temper.
    ped.rage = Math.min(100, ped.rage + 70);
    if (ped.role === 'thief') {
      this.flee(ped, 'scared');
    } else if (ped.temper > 0.4 || ped.rage >= 100) {
      this.makeThug(ped, 100);
    } else {
      this.flee(ped, 'scared');
    }
    // Witnesses nearby: the hot-headed join in, the rest scatter.
    for (const o of sim.peds) {
      if (o === ped || o.state === 'inside' || o.state === 'down' || o.role !== 'civilian') continue;
      const d = Math.hypot(o.x - ped.x, o.z - ped.z);
      if (d > 14) continue;
      if (o.temper > 0.78 && d < 9) this.makeThug(o, 85);
      else this.flee(o, 'scared');
    }
  }

  // --- Hostile and frightened people ---------------------------------------------------------

  private makeThug(ped: Ped, rage: number) {
    ped.role = 'thug';
    ped.state = 'chasing';
    ped.rage = rage;
    ped.mood = 0;
    ped.path = [];
    ped.goal = null;
    ped.emote = 'angry';
    ped.emoteTimer = 2.5;
    ped.actionCooldown = 0.8;
    playSfx('alert', 0.5);
  }

  private flee(ped: Ped, emote = 'scared') {
    if (ped.state === 'down' || ped.state === 'inside' || ped.state === 'entering') return;
    ped.state = 'fleeing';
    ped.path = [];
    ped.goal = null;
    ped.mood = 0;
    ped.emote = emote;
    ped.emoteTimer = 2.2;
    ped.timer = 0;
  }

  private calm(ped: Ped) {
    ped.role = 'civilian';
    ped.armed = false;
    ped.state = 'idle';
    ped.rage = 0;
    ped.timer = range(1, 3);
    ped.emote = null;
    ped.mood = 0;
    ped.path = [];
  }

  private nearestThreat(ped: Ped): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const m of this.monsters) {
      if (m.state === 'dying') continue;
      const d = Math.hypot(m.x - ped.x, m.z - ped.z);
      if (d < 26 && (!best || d < best.d)) best = { x: m.x, z: m.z, d };
    }
    const t = this.threats.get(ped.id);
    if (t) {
      const d = Math.hypot(t.x - ped.x, t.z - ped.z);
      if (!best || d < best.d) best = { x: t.x, z: t.z, d };
    }
    return best;
  }

  /** Called by the sim for every person each frame. Returns true if this system moved them. */
  private pedUpdate(ped: Ped, dt: number): boolean {
    if (!this.active) return false;
    const p = this.player;
    const world = sim.world;
    ped.swing = Math.max(0, ped.swing - dt * 3.5);
    ped.rage = Math.max(0, ped.rage - 5 * dt);
    const nearPlayer = Math.hypot(this.px - ped.x, this.pz - ped.z);

    // Knock-back slide (from any hit).
    if (Math.abs(ped.knockX) + Math.abs(ped.knockZ) > 0.05) {
      const nx = ped.x + ped.knockX * dt;
      const nz = ped.z + ped.knockZ * dt;
      if (isWalkable(world, cellOf(nx), cellOf(nz))) {
        ped.x = nx;
        ped.z = nz;
      }
      const f = Math.exp(-dt * 8);
      ped.knockX *= f;
      ped.knockZ *= f;
    }

    switch (ped.state) {
      case 'down': {
        ped.fall = Math.min(1, ped.fall + dt * 4);
        ped.speed = 0;
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.fall = 0;
          ped.role = 'civilian';
          ped.rage = 0;
          this.flee(ped, 'stars');
        }
        return true;
      }
      case 'cowering': {
        ped.speed = 0;
        ped.timer -= dt;
        if (ped.emoteTimer <= 0) {
          ped.emote = 'scared';
          ped.emoteTimer = 1.5;
        }
        const t = this.nearestThreat(ped);
        if (ped.timer <= 0 && (!t || t.d > 18)) this.calm(ped);
        return true;
      }
      case 'fleeing': {
        ped.mood += dt;
        const threat = this.nearestThreat(ped);
        if (ped.mood > 6 && (!threat || threat.d > 24)) {
          this.calm(ped);
          return true;
        }
        if (ped.path.length === 0 || ped.timer <= 0) {
          ped.timer = 1.4;
          const from = threat ?? { x: this.px, z: this.pz, d: nearPlayer };
          // Prefer the nearest door in the direction away from the danger: they run inside to hide.
          let best: (typeof world.destinations)[number] | null = null;
          let bestScore = Infinity;
          for (const d of world.destinations) {
            if (d.kind !== 'door') continue;
            const dist = Math.hypot(d.point.x - ped.x, d.point.z - ped.z);
            if (dist > 55) continue;
            const away = Math.hypot(d.point.x - from.x, d.point.z - from.z);
            const score = dist - away * 0.8;
            if (score < bestScore) {
              bestScore = score;
              best = d;
            }
          }
          if (best) {
            const cells = findPath(world, [cellOf(ped.x), cellOf(ped.z)], best.approach);
            if (cells) {
              ped.path = cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx), z: cellCentre(gz) }));
              ped.goal = best;
            }
          }
          if (ped.path.length === 0) {
            const ax = ped.x - from.x;
            const az = ped.z - from.z;
            const l = Math.hypot(ax, az) || 1;
            ped.path = [{ x: ped.x + (ax / l) * 8 + range(-3, 3), z: ped.z + (az / l) * 8 + range(-3, 3) }];
            ped.goal = null;
          }
        }
        ped.timer -= dt;
        const wp = ped.path[0];
        if (wp) {
          const moved = this.stepToward(ped, wp.x, wp.z, ped.role === 'thief' ? 4.6 : 4.2, dt, 12);
          ped.speed = moved;
          ped.phase += moved * dt * 2.6;
          if (Math.hypot(wp.x - ped.x, wp.z - ped.z) < 0.8) ped.path.shift();
          if (moved < 0.2) ped.path = [];
        } else if (ped.goal && ped.goal.kind === 'door') {
          // Reached the door: slip inside until the danger passes.
          ped.state = 'entering';
          ped.heading = ped.goal.facing;
          ped.timer = range(12, 24);
          if (ped.stolen > 0 && ped.role === 'thief') {
            ped.stolen = 0; // got away with it
            ped.role = 'civilian';
            this.toast('The thief got away with your cash.', 'bad');
          }
        } else {
          ped.state = 'cowering';
          ped.timer = range(3, 6);
        }
        // A thief that gets far enough away has escaped.
        if (ped.role === 'thief' && ped.stolen > 0 && nearPlayer > 75) {
          ped.stolen = 0;
          ped.role = 'civilian';
          this.toast('The thief got away with your cash.', 'bad');
          this.calm(ped);
        }
        return true;
      }
      case 'stalking': {
        if (!p.alive || p.shelter || nearPlayer > 95) {
          this.calm(ped);
          return true;
        }
        ped.mood += dt;
        ped.timer -= dt;
        if (nearPlayer < 1.7) {
          ped.state = 'mugging';
          ped.timer = 1.0;
          ped.speed = 0;
          ped.emote = 'siren';
          ped.emoteTimer = 1.2;
          return true;
        }
        if (this.lineOfSight(ped.x, ped.z, this.px, this.pz) && nearPlayer < 14) {
          ped.speed = this.stepToward(ped, this.px, this.pz, 3.7, dt, 10);
        } else {
          if (ped.path.length === 0 || ped.timer <= 0) {
            ped.timer = 0.9;
            const cells = findPath(world, [cellOf(ped.x), cellOf(ped.z)], [cellOf(this.px), cellOf(this.pz)]);
            if (cells) ped.path = cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx), z: cellCentre(gz) }));
          }
          const wp = ped.path[0];
          if (wp) {
            ped.speed = this.stepToward(ped, wp.x, wp.z, 3.7, dt, 10);
            if (Math.hypot(wp.x - ped.x, wp.z - ped.z) < 0.8) ped.path.shift();
          } else {
            ped.speed = this.stepToward(ped, this.px, this.pz, 3.2, dt, 10);
          }
        }
        ped.phase += ped.speed * dt * 2.6;
        if (ped.mood > 70) this.calm(ped);
        return true;
      }
      case 'mugging': {
        ped.speed = 0;
        ped.heading += wrap(Math.atan2(this.px - ped.x, this.pz - ped.z) - ped.heading) * Math.min(1, dt * 10);
        ped.timer -= dt;
        ped.swing = Math.max(ped.swing, 0.6);
        if (ped.timer <= 0) {
          if (nearPlayer < 2.6 && p.alive && !p.shelter) {
            const take = Math.min(p.cash, Math.max(25, Math.round(p.cash * range(0.3, 0.55))));
            p.cash -= take;
            ped.stolen = take;
            this.toast(take > 0 ? `You were robbed! -$${take}. Chase the thief!` : 'A thief tried to rob you but you had nothing.', 'bad');
            p.hurt = Math.max(p.hurt, 0.35);
            p.pushX += (this.px - ped.x) * 1.5;
            p.pushZ += (this.pz - ped.z) * 1.5;
            playSfx('hurt', 0.8);
            if (take > 0) {
              this.flee(ped, 'money');
              ped.mood = 0;
            } else {
              this.calm(ped);
            }
          } else {
            this.calm(ped);
          }
        }
        return true;
      }
      case 'chasing': {
        if (!p.alive || p.shelter || nearPlayer > 55) {
          this.calm(ped);
          return true;
        }
        ped.mood += dt;
        if (ped.mood > (ped.armed ? 150 : 28)) {
          ped.emote = 'angry';
          ped.emoteTimer = 1.5;
          this.calm(ped);
          return true;
        }
        // Armed robbers keep their distance and shoot.
        if (ped.armed && nearPlayer < 22 && nearPlayer > 3.5 && this.lineOfSight(ped.x, ped.z, this.px, this.pz)) {
          ped.speed = 0;
          ped.heading += wrap(Math.atan2(this.px - ped.x, this.pz - ped.z) - ped.heading) * Math.min(1, dt * 12);
          if (ped.actionCooldown <= 0) {
            ped.actionCooldown = range(1.1, 1.8);
            ped.swing = 1;
            const aimY = this.aim.y - 0.35;
            this.tracers.push({ x0: ped.x, y0: 1.35, z0: ped.z, x1: this.px + range(-0.6, 0.6), y1: aimY, z1: this.pz + range(-0.6, 0.6), life: 0.09, colour: 0xffe9a0 });
            playSfx('shot', clamp01(1 - nearPlayer / 30) * 0.7);
            if (Math.random() < 0.34 * (1 - 0.3 * p.crouchAmount)) this.damagePlayer(range(7, 11), ped.x, ped.z);
          }
          return true;
        }
        const reach = 1.55;
        if (nearPlayer > reach) {
          if (this.lineOfSight(ped.x, ped.z, this.px, this.pz) || nearPlayer < 4) {
            ped.speed = this.stepToward(ped, this.px, this.pz, 3.9 + ped.rage * 0.01, dt, 12);
          } else {
            ped.timer -= dt;
            if (ped.path.length === 0 || ped.timer <= 0) {
              ped.timer = 0.9;
              const cells = findPath(world, [cellOf(ped.x), cellOf(ped.z)], [cellOf(this.px), cellOf(this.pz)]);
              if (cells) ped.path = cells.slice(1).map(([gx, gz]) => ({ x: cellCentre(gx), z: cellCentre(gz) }));
            }
            const wp = ped.path[0];
            if (wp) {
              ped.speed = this.stepToward(ped, wp.x, wp.z, 3.9, dt, 12);
              if (Math.hypot(wp.x - ped.x, wp.z - ped.z) < 0.8) ped.path.shift();
            } else ped.speed = 0;
          }
          ped.phase += ped.speed * dt * 2.7;
        } else {
          ped.speed = 0;
          ped.heading += wrap(Math.atan2(this.px - ped.x, this.pz - ped.z) - ped.heading) * Math.min(1, dt * 12);
          if (ped.actionCooldown <= 0) {
            ped.actionCooldown = 1.15;
            ped.swing = 1;
            this.damagePlayer(5 + Math.random() * 5, ped.x, ped.z);
          }
        }
        // Hurt thugs lose their nerve.
        if (ped.hp < ped.maxHp * 0.35 && Math.random() < dt * 0.8) this.flee(ped, 'scared');
        return true;
      }
    }

    // --- Everyday people noticing what is going on ---
    if (ped.state === 'inside' || ped.state === 'entering' || ped.vis < 0.9) return false;

    // Monsters nearby: run for it.
    if (this.monsters.length > 0 && (ped.state as string) !== 'fleeing') {
      for (const m of this.monsters) {
        if (m.state === 'dying') continue;
        const d = Math.hypot(m.x - ped.x, m.z - ped.z);
        if (d < 16 && this.lineOfSight(m.x, m.z, ped.x, ped.z)) {
          this.threats.set(ped.id, { x: m.x, z: m.z });
          this.flee(ped, 'scared');
          playSfx('scream', clamp01(1 - nearPlayer / 40) * 0.6);
          return true;
        }
      }
    }

    // An armed, recently active player scares people.
    const armed = (p.weapon === 'pistol' || p.weapon === 'shotgun') && p.alive;
    if (armed && sim.time - this.lastShotAt < 6 && nearPlayer < 14 && ped.role === 'civilian' && (ped.state as string) !== 'fleeing') {
      if (ped.temper < 0.85) {
        if (Math.random() < 0.35 && nearPlayer < 8) {
          ped.state = 'cowering';
          ped.timer = range(4, 8);
          ped.speed = 0;
          ped.emote = 'scared';
          ped.emoteTimer = 2.5;
        } else {
          this.threats.set(ped.id, { x: this.px, z: this.pz });
          this.flee(ped, 'scared');
        }
        return true;
      }
    }

    // Bumping into people makes them angry.
    if (this.subMode === 'normal' && p.alive && nearPlayer < 1.05 && ped.actionCooldown <= 0 && ped.role === 'civilian') {
      ped.actionCooldown = 1.6;
      ped.rage += 22 + ped.temper * 30;
      ped.emote = ped.rage > 40 ? 'angry' : 'angry';
      ped.emoteTimer = 1.8;
      ped.speed = 0;
      if (ped.rage >= 70 && ped.temper > 0.45) {
        this.makeThug(ped, ped.rage);
        this.toast('Someone is furious with you!', 'warn');
        return true;
      }
    }
    return false;
  }

  // --- Street crime (normal mode) ------------------------------------------------------------

  private updateCrime(dt: number) {
    const p = this.player;
    const night = atmo.lamps > 0.5 ? 0.6 : 1;
    this.crimeTimer -= dt * (p.shelter ? 0.2 : 1) / night;
    if (this.crimeTimer > 0 || !p.alive || p.shelter) return;
    this.crimeTimer = range(45, 95);
    const candidates = sim.peds.filter((o) => {
      if (o.role !== 'civilian' || o.vis < 0.9) return false;
      if (o.state !== 'walking' && o.state !== 'idle' && o.state !== 'busy') return false;
      const d = Math.hypot(o.x - this.px, o.z - this.pz);
      return d > 16 && d < 46;
    });
    if (candidates.length === 0) {
      this.crimeTimer = 12;
      return;
    }
    const ped = pick(candidates);
    const roll = Math.random();
    if (roll < 0.6 && p.cash > 0) {
      // A mugger in a hoodie sets their eyes on you.
      ped.role = 'thief';
      ped.state = 'stalking';
      ped.mood = 0;
      ped.path = [];
      ped.goal = null;
      ped.shirt = 0x15171c;
      ped.pants = 0x22252b;
      ped.coat = true;
      ped.hairStyle = 0;
      ped.emote = 'eye';
      ped.emoteTimer = 3;
      ped.hp = ped.maxHp;
      this.toast('Someone is watching you...', 'warn');
    } else {
      // A gang of hot heads picks a fight.
      const crew = [ped, ...candidates.filter((o) => o !== ped && Math.hypot(o.x - ped.x, o.z - ped.z) < 14).slice(0, Math.random() < 0.4 ? 2 : 0)];
      for (const c of crew) {
        this.makeThug(c, 90);
        c.hp = c.maxHp;
        c.temper = Math.max(c.temper, 0.8);
      }
      this.toast(crew.length > 1 ? 'A gang is looking for trouble!' : 'A local is spoiling for a fight!', 'warn');
    }
  }

  // --- Damage and death ----------------------------------------------------------------------

  damagePlayer(amount: number, fromX: number, fromZ: number) {
    const p = this.player;
    if (!p.alive || p.shelter || this.run.outcome === 'won') return;
    p.hp -= amount;
    p.hurt = Math.min(1, p.hurt + 0.45 + amount / 70);
    const dx = this.px - fromX;
    const dz = this.pz - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    p.pushX += (dx / l) * (3 + amount * 0.18);
    p.pushZ += (dz / l) * (3 + amount * 0.18);
    playSfx('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.deathTimer = 3.2;
      p.crouching = false;
      if (this.run.active) {
        this.run.outcome = 'lost';
        atmo.rateOverride = 0;
        playSfx('lose');
      } else {
        const lost = Math.round(p.cash * 0.4);
        p.cash -= lost;
        this.toast(`You were knocked out and lost $${lost}.`, 'bad');
        playSfx('lose', 0.6);
      }
    }
  }

  private respawnPlayer() {
    const p = this.player;
    p.alive = true;
    p.hp = Math.round(p.maxHp * 0.6);
    p.hurt = 0;
    this.respawn = { ...this.home };
    for (const ped of sim.peds) if (ped.role === 'thug') this.calm(ped);
  }

  // --- Messages ------------------------------------------------------------------------------

  toast(text: string, tone: Toast['tone'] = 'info') {
    this.toasts.push({ id: this.nextId++, text, tone, life: 4.5 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  /** Progress through the monster night, 0..1. */
  get nightProgress(): number {
    return clamp01(this.run.hours / SURVIVAL_HOURS);
  }
}

export const combat = new Combat();
export { SURVIVAL_HOURS, SURVIVAL_START_HOUR };
