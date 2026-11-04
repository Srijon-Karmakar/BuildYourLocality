import { viewState } from '../engine/viewState';
import { hasTerrain, heightAt } from '../terrain/terrain';
import { blast } from './blast';
import { combat } from './combat';
import { sim, type Car, type CarEvent } from './simulation';
import { playSfx } from './sfx';
import { vehicle } from './vehicle';

/**
 * What road trouble looks and sounds like. The simulation decides what happens to a car (a window breaks, a tyre
 * bursts, a wheel comes off, the engine catches fire) and queues an event; this turns events into glass, sparks,
 * smoke, flames, a wheel rolling off down the road, and a bang. Everything is cheap: particles come from the shared
 * pool in blast.ts, nothing is made for trouble far from the player, and phones get about half the sparks and smoke.
 */

/** A wheel that has come off and is rolling, bouncing and finally falling over. */
export interface LooseWheel {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Rolling angle and the direction it travels, for drawing. */
  spin: number;
  heading: number;
  /** 0 upright .. 1.57 lying flat. */
  tilt: number;
  life: number;
}

export const looseWheels: LooseWheel[] = [];
const MAX_LOOSE = 12;
const WHEEL_R = 0.33;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Where wheel number `w` (0..3: rear right, front right, rear left, front left) is, in the world. */
function wheelPos(car: Car, w: number): { x: number; z: number } {
  const lx = (w >> 1 ? 0.82 : -0.82) * (car.kind === 'bus' ? 1.39 : car.kind === 'fire' ? 1.33 : car.kind === 'ambulance' ? 1.21 : car.kind === 'police' ? 1.04 : 1);
  const lz = (w & 1 ? 1.1 : -1.1) * (car.length / 3.5);
  const s = Math.sin(car.heading);
  const c = Math.cos(car.heading);
  return { x: car.x + lx * c + lz * s, z: car.z - lx * s + lz * c };
}

const groundAt = (x: number, z: number) => (hasTerrain() ? Math.max(0, heightAt(x, z)) : 0);

function spawnWheel(wheel: Omit<LooseWheel, 'spin' | 'heading' | 'tilt' | 'life'>) {
  if (looseWheels.length >= MAX_LOOSE) looseWheels.shift();
  looseWheels.push({ ...wheel, spin: 0, heading: Math.atan2(wheel.vx, wheel.vz), tilt: 0, life: rnd(9, 12) });
}

function updateWheels(dt: number) {
  for (const w of looseWheels) {
    w.life -= dt;
    w.vy -= 22 * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.z += w.vz * dt;
    const floor = groundAt(w.x, w.z) + WHEEL_R * (1 - w.tilt / 1.57) + 0.13 * (w.tilt / 1.57);
    const flat = Math.hypot(w.vx, w.vz);
    if (w.y <= floor) {
      w.y = floor;
      if (w.vy < -2) {
        // A bounce loses most of its energy.
        w.vy = -w.vy * 0.42;
        w.vx *= 0.82;
        w.vz *= 0.82;
      } else {
        w.vy = 0;
      }
      const drag = Math.exp(-0.55 * dt);
      w.vx *= drag;
      w.vz *= drag;
    }
    w.spin += (flat / WHEEL_R) * dt;
    // Slow enough and it wobbles over onto its side.
    if (flat < 1.5) w.tilt = Math.min(1.57, w.tilt + dt * 1.8);
  }
  while (looseWheels.length > 0 && looseWheels[0].life <= 0) looseWheels.shift();
  for (let i = looseWheels.length - 1; i >= 0; i--) if (looseWheels[i].life <= 0) looseWheels.splice(i, 1);
}

/** Is this spot close enough to the player for its effects to be worth making? */
let reach2 = 110 * 110;
const watching = (x: number, z: number) => (viewState.x - x) ** 2 + (viewState.z - z) ** 2 < reach2;

function onEvent(e: CarEvent, q: number) {
  const c = e.car;
  if (!watching(e.x, e.z)) return;
  const y = c.y ?? 0;
  const at = { x: e.x, y: y + 1, z: e.z };
  const away = Math.hypot(viewState.x - e.x, viewState.z - e.z);
  switch (e.kind) {
    case 'bump': {
      playSfx('car_hit', Math.min(1, 0.4 + (e.power ?? 1) / 6), at);
      blast.effect('sparks', e.x, y + 0.6, e.z, 0, 0, Math.round(3 * q));
      combat.scare(e.x, e.z, 10);
      // Whoever was hit leans on the horn a moment later.
      window.setTimeout(() => {
        if (watching(c.x, c.z)) playSfx('car_horn', 0.55, { x: c.x, z: c.z });
      }, 450);
      break;
    }
    case 'crash': {
      const p = e.power ?? 4;
      blast.effect('sparks', e.x, y + 0.6, e.z, 0, 0, Math.round((6 + p) * q));
      blast.effect('dust', e.x, y + 0.5, e.z, 0, 0, Math.round(4 * q));
      blast.shake = Math.max(blast.shake, clamp(p / 16, 0, 0.5) * clamp(1 - away / 35, 0, 1));
      combat.scare(e.x, e.z, 26);
      break;
    }
    case 'glass': {
      // The windows go: a shower of glass out of the cabin, in the direction of the hit.
      const s = Math.sin(c.heading);
      const co = Math.cos(c.heading);
      blast.effect('glass', c.x, y + 1.15, c.z, s * 0.6, co * 0.6, Math.round(16 * q));
      playSfx('glass_break', 0.9, at);
      break;
    }
    case 'burst': {
      const p = wheelPos(c, e.wheel ?? 0);
      blast.effect('rubber', p.x, y + 0.3, p.z, 0, 0, Math.round(6 * q));
      blast.effect('dust', p.x, y + 0.3, p.z, 0, 0, Math.round(3 * q));
      playSfx('tyre_burst', 1, at);
      break;
    }
    case 'wheelOff': {
      const w = e.wheel ?? 0;
      const p = wheelPos(c, w);
      const h = c.heading;
      const side = w >> 1 ? 1 : -1; // local +x is the car's left
      const sp = Math.max(c.speed, 2);
      spawnWheel({ x: p.x, y: y + WHEEL_R, z: p.z, vx: Math.sin(h) * sp * 0.9 + Math.cos(h) * side * rnd(2, 5), vz: Math.cos(h) * sp * 0.9 - Math.sin(h) * side * rnd(2, 5), vy: rnd(3, 7) });
      blast.effect('sparks', p.x, y + 0.2, p.z, -Math.sin(h), -Math.cos(h), Math.round(12 * q));
      playSfx('scrape', 0.9, at);
      break;
    }
    case 'fire':
      playSfx('fire', 0.6, at);
      break;
  }
}

/** The engine goes up. A burning car that blows takes its neighbours' windows and tyres with it. */
function explode(car: Car) {
  const fx = car.fx;
  if (!fx) return;
  fx.fire = undefined;
  fx.blow = undefined;
  fx.burnt = true;
  fx.glass = true;
  fx.smoke = 1;
  fx.disabled = undefined;
  if (!car.driven) {
    car.wreck = Math.max(car.wreck, 55);
    car.speed = 0;
  }
  blast.carExplosion(car.x, (car.y ?? 0) + 0.8, car.z);
  // Two wheels fly off.
  for (let k = 0; k < 2; k++) {
    const free = [0, 1, 2, 3].filter((w) => !((fx.off ?? 0) & (1 << w)));
    if (free.length > 0) sim.loseWheel(car, free[Math.floor(Math.random() * free.length)]);
  }
  for (const other of sim.cars) {
    if (other === car) continue;
    const d = Math.hypot(other.x - car.x, other.z - car.z);
    if (d < 8) sim.damageCar(other, 3.2 + (8 - d) * 0.7);
  }
  // Whoever is driving it is thrown clear.
  if (car.driven) vehicle.exit();
  combat.scare(car.x, car.z, 40);
}

/** Smoke, flames and sparks from cars in trouble, and the fuse on the ones about to blow. */
function ongoing(car: Car, dt: number, q: number) {
  const fx = car.fx;
  if (!fx) return;

  // Fire runs its course whether or not anyone is watching.
  if (fx.fire !== undefined) {
    fx.fire += dt;
    if (fx.blow !== undefined && fx.fire >= fx.blow) {
      explode(car);
      return;
    }
    if (fx.blow === undefined && fx.fire > 18) {
      // Burnt out without a bang.
      fx.fire = undefined;
      fx.burnt = true;
      fx.glass = true;
      fx.disabled = undefined;
      if (!car.driven) car.wreck = Math.max(car.wreck, 55);
    }
  }
  if (fx.burnt && fx.smoke) fx.smoke = Math.max(0, fx.smoke - dt / 45);

  if (!watching(car.x, car.z)) return;
  const h = car.heading;
  const y = (car.y ?? 0) + 0.85;
  const ex = car.x + Math.sin(h) * 1.1;
  const ez = car.z + Math.cos(h) * 1.1;

  if (fx.fire !== undefined) {
    if (Math.random() < dt * 20 * q) blast.effect('flame', ex, y, ez, 0, 0, 1);
    if (Math.random() < dt * 11 * q) blast.effect('soot', ex, y + 0.3, ez, 0, 0, 1);
  } else if ((fx.smoke ?? 0) > 0.02) {
    const rate = fx.burnt ? 4 : 8;
    if (Math.random() < dt * rate * (fx.smoke ?? 1) * q) blast.effect(fx.burnt ? 'soot' : 'smoke', ex, y, ez, 0, 0, 1);
  }

  // A wheel rim scraping along the road.
  if (fx.off && car.speed > 0.6 && Math.random() < dt * 16 * q) {
    for (let w = 0; w < 4; w++) {
      if (!(fx.off & (1 << w))) continue;
      const p = wheelPos(car, w);
      blast.effect('sparks', p.x, (car.y ?? 0) + 0.12, p.z, -Math.sin(h), -Math.cos(h), 1);
    }
  }
}

/**
 * Call every frame after the simulation: plays what happened to cars since last time and keeps trouble going.
 * `quality` is 1 on a desktop and about 0.5 on a phone; `distance` is how far from the view effects are made.
 */
export function updateCarFx(dt: number, quality: number, distance: number) {
  reach2 = distance * distance;
  if (sim.events.length > 0) {
    const events = sim.events;
    sim.events = [];
    for (const e of events) onEvent(e, quality);
  }
  for (const car of sim.cars) if (car.fx) ongoing(car, dt, quality);
  if (looseWheels.length > 0) updateWheels(dt);
}
