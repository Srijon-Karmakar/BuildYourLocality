import { CELL } from '../city/catalog';
import { wallColliders } from '../city/WallModel';
import { resolveWall } from '../city/walls';
import { useCityStore, type Piece } from '../state/useCityStore';
import { WATER_LEVEL, hasTerrain, heightAt } from '../terrain/terrain';
import { playSfx } from '../audio/sounds';
import { combat } from './combat';
import { sim, type Car } from './simulation';

/**
 * Driving. The player can take any car, taxi or bus off the street (hijacking it when someone is
 * at the wheel), drive it anywhere on open ground, and step out again. While driven, the car is
 * taken out of the traffic system's hands and moved here with a simple arcade model: engine,
 * brakes, a handbrake that lets the back slide, grip on the road and less of it on grass.
 */

export interface DriveInput {
  /** 0..1 */
  throttle: number;
  /** 0..1: brakes, then reverses once stopped. */
  brake: number;
  /** -1 left .. 1 right */
  steer: number;
  handbrake: boolean;
  horn: boolean;
}

interface Spec {
  accel: number;
  max: number;
  reverse: number;
  halfWidth: number;
  halfLength: number;
  wheelbase: number;
  grip: number;
  brake: number;
}

const SPECS: Record<Car['kind'], Spec> = {
  car: { accel: 15, max: 31, reverse: 8, halfWidth: 0.95, halfLength: 2.05, wheelbase: 2.7, grip: 9, brake: 27 },
  taxi: { accel: 15, max: 29, reverse: 8, halfWidth: 0.95, halfLength: 2.05, wheelbase: 2.7, grip: 9, brake: 26 },
  bus: { accel: 7.5, max: 19, reverse: 5, halfWidth: 1.3, halfLength: 4.4, wheelbase: 5.6, grip: 6.5, brake: 17 },
};

/** The fastest a moving car can be and still be taken (m/s): you cannot leap into traffic at full speed. */
const ENTER_SPEED = 9;
/** How close the player must be to the car's body to take it (metres). */
const REACH = 3.4;

// --- Walls as solid boxes, found by grid cell --------------------------------------------

interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
let wallBoxes: { source: Record<string, Piece>; cells: Map<string, Box[]> } | null = null;

function wallsAt(pieces: Record<string, Piece>): Map<string, Box[]> {
  if (wallBoxes?.source === pieces) return wallBoxes.cells;
  const cells = new Map<string, Box[]>();
  for (const piece of Object.values(pieces)) {
    if (piece.type !== 'wall') continue;
    const cx = piece.rot === 0 ? (piece.gx + 0.5) * CELL : piece.gx * CELL;
    const cz = piece.rot === 0 ? piece.gz * CELL : (piece.gz + 0.5) * CELL;
    for (const c of wallColliders(resolveWall(piece.wall))) {
      // The collider is in the wall's own frame (x along it); turn it for a wall that runs along z.
      const box: Box =
        piece.rot === 0
          ? { x0: cx + c.cx - c.w / 2, x1: cx + c.cx + c.w / 2, z0: cz - c.d / 2, z1: cz + c.d / 2 }
          : { x0: cx - c.d / 2, x1: cx + c.d / 2, z0: cz + c.cx - c.w / 2, z1: cz + c.cx + c.w / 2 };
      for (let gx = Math.floor(box.x0 / CELL); gx <= Math.floor(box.x1 / CELL); gx++) {
        for (let gz = Math.floor(box.z0 / CELL); gz <= Math.floor(box.z1 / CELL); gz++) {
          const key = `${gx},${gz}`;
          const list = cells.get(key);
          if (list) list.push(box);
          else cells.set(key, [box]);
        }
      }
    }
  }
  wallBoxes = { source: pieces, cells };
  return cells;
}

const cellOf = (v: number) => Math.floor(v / CELL);

function solidAt(x: number, z: number): boolean {
  const gx = cellOf(x);
  const gz = cellOf(z);
  const key = `${gx},${gz}`;
  const world = sim.world;
  if (world.blocked.has(key)) return true;
  // Deep water stops a car, but a bridge (road) carries it across.
  if (hasTerrain() && !world.roads.has(key) && heightAt(x, z) < WATER_LEVEL - 0.6) return true;
  const boxes = wallsAt(useCityStore.getState().pieces).get(key);
  if (boxes) for (const b of boxes) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
  return false;
}

class Vehicle {
  car: Car | null = null;
  vx = 0;
  vz = 0;
  /** Speed along the car's heading (m/s, negative reversing) and sideways slip. */
  forward = 0;
  slip = 0;
  throttle = 0;
  horn = false;
  onRoad = true;
  view: 'chase' | 'hood' = 'chase';
  /** The nearest takeable car, for the "press E" prompt. */
  near: Car | null = null;
  /** 0..1 shake from the last crash; fades quickly. */
  shake = 0;
  /** Where the player steps out. */
  exitAt: { x: number; z: number } | null = null;
  private steerAngle = 0;
  private hitCooldown = 0;
  private lookAhead = 0;

  get active() {
    return this.car !== null;
  }

  get spec(): Spec {
    return SPECS[this.car?.kind ?? 'car'];
  }

  /** The closest car the player could take from here, if any. */
  findNear(px: number, pz: number): Car | null {
    let best: Car | null = null;
    let bestD = Infinity;
    for (const c of sim.cars) {
      if (c.driven) continue;
      const spec = SPECS[c.kind];
      // Distance to the car's body (a rectangle), not just its middle.
      const dx = px - c.x;
      const dz = pz - c.z;
      const along = Math.abs(dx * Math.sin(c.heading) + dz * Math.cos(c.heading)) - spec.halfLength;
      const side = Math.abs(dx * Math.cos(c.heading) - dz * Math.sin(c.heading)) - spec.halfWidth;
      const d = Math.hypot(Math.max(0, along), Math.max(0, side));
      if (d < REACH && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  /** Refreshes `near`: call a few times a second while on foot. */
  scan(px: number, pz: number) {
    const car = this.findNear(px, pz);
    this.near = car && Math.abs(car.speed) <= ENTER_SPEED ? car : null;
  }

  /** E / the Drive button on foot: takes the nearest car. Returns false when there is nothing to take. */
  tryEnter(px: number, pz: number): boolean {
    if (this.car) return false;
    const car = this.findNear(px, pz);
    if (!car) return false;
    if (Math.abs(car.speed) > ENTER_SPEED) {
      combat.toast('That car is moving too fast to jump into.', 'info');
      return true;
    }
    const spec = SPECS[car.kind];
    // Whoever was at the wheel is pulled out on the driver's side.
    const left = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    sim.takeOver(car);
    const driver = sim.spawnPedAt(car.x + left.x * (spec.halfWidth + 1.1), car.z + left.z * (spec.halfWidth + 1.1));
    if (driver) combat.carjackReaction(driver);
    this.car = car;
    this.vx = Math.sin(car.heading) * car.speed;
    this.vz = Math.cos(car.heading) * car.speed;
    this.forward = car.speed;
    this.steerAngle = 0;
    this.near = null;
    this.exitAt = null;
    combat.driving = true;
    playSfx('car_door', 0.9);
    if (Math.abs(car.speed) < 1) window.setTimeout(() => playSfx('car_start', 0.8), 380);
    return true;
  }

  /** Steps out on whichever side is clear, leaving the car standing where it is. */
  exit() {
    const car = this.car;
    if (!car) return;
    const spec = SPECS[car.kind];
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const left = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    const reach = spec.halfWidth + 1.2;
    const tries = [
      [left.x * reach, left.z * reach],
      [-left.x * reach, -left.z * reach],
      [-f.x * (spec.halfLength + 1.4), -f.z * (spec.halfLength + 1.4)],
      [f.x * (spec.halfLength + 1.4), f.z * (spec.halfLength + 1.4)],
    ];
    const spot = tries.find(([ox, oz]) => !solidAt(car.x + ox, car.z + oz)) ?? tries[0];
    this.exitAt = { x: car.x + spot[0], z: car.z + spot[1] };
    sim.releaseCar(car);
    car.pitch = 0;
    car.roll = 0;
    this.car = null;
    this.vx = this.vz = this.forward = this.slip = 0;
    combat.driving = false;
    playSfx('car_door', 0.8);
  }

  /** Does a car of this shape fit at (x, z) facing `heading`? */
  private hits(x: number, z: number, heading: number): boolean {
    const spec = this.spec;
    const sx = Math.sin(heading);
    const cz = Math.cos(heading);
    // Corners and the middle of each side.
    for (const lx of [-spec.halfWidth, 0, spec.halfWidth]) {
      for (const lz of [-spec.halfLength, 0, spec.halfLength]) {
        if (lx === 0 && lz === 0) continue;
        if (solidAt(x - cz * lx + sx * lz, z + sx * lx + cz * lz)) return true;
      }
    }
    return false;
  }

  private crash(impact: number) {
    if (impact < 3.5) return;
    this.shake = Math.min(1, Math.max(this.shake, impact / 20));
    playSfx('car_crash', Math.min(1, 0.3 + impact / 16));
    if (impact > 11 && combat.active) combat.crashDamage((impact - 10) * 1.8);
  }

  update(dt: number, input: DriveInput) {
    const car = this.car;
    if (!car) return;
    const spec = this.spec;
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const r = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    this.forward = this.vx * f.x + this.vz * f.z;
    let lateral = this.vx * r.x + this.vz * r.z;
    this.onRoad = sim.world.roads.has(`${cellOf(car.x)},${cellOf(car.z)}`);
    const surface = this.onRoad ? 1 : 0.5;
    const maxSpeed = spec.max * surface;

    // --- Engine, brakes and drag along the car ---
    let fwd = this.forward;
    this.throttle = input.throttle;
    if (input.throttle > 0) {
      const pull = spec.accel * (1 - Math.min(1, Math.abs(fwd) / maxSpeed) ** 2) * input.throttle;
      fwd += pull * dt * (fwd < 0 ? 2.2 : 1);
    }
    if (input.brake > 0) {
      if (fwd > 0.6) fwd = Math.max(0, fwd - spec.brake * input.brake * dt);
      else fwd = Math.max(-spec.reverse * surface, fwd - spec.accel * 0.55 * input.brake * dt);
    }
    // Rolling and air drag, and a lot more on grass.
    const drag = (this.onRoad ? 0.35 : 1.8) + Math.abs(fwd) * (this.onRoad ? 0.012 : 0.05);
    fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), drag * dt * (input.throttle > 0 ? 0.4 : 1) * 4);
    if (input.handbrake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 9 * dt);
    if (fwd > maxSpeed) fwd = Math.max(maxSpeed, fwd - 12 * dt);

    // --- Steering: wheels turn less the faster you go ---
    const lock = 0.58 - Math.min(1, Math.abs(fwd) / 28) * 0.4;
    this.steerAngle += (input.steer * lock - this.steerAngle) * Math.min(1, dt * 9);
    let yaw = (fwd / spec.wheelbase) * Math.tan(this.steerAngle);
    if (input.handbrake) yaw *= 1.45;
    // The tyres can only hold so much sideways pull, so at speed the car swings round slowly.
    const yawMax = ((input.handbrake ? 15 : 10.5) * (this.onRoad ? 1 : 0.65)) / Math.max(3, Math.abs(fwd));
    yaw = Math.max(-yawMax, Math.min(yawMax, yaw));
    // Right is a turn towards negative heading.
    car.heading -= yaw * dt;

    // --- Grip: sideways motion bleeds away, slowly with the handbrake (a drift) ---
    const grip = (input.handbrake ? 1.3 : spec.grip) * (this.onRoad ? 1 : 0.55);
    lateral *= Math.exp(-grip * dt);
    this.slip = lateral;

    // Rebuild the velocity along the (new) heading plus what is left of the slide.
    const nf = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    const nr = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    this.vx = nf.x * fwd + nr.x * lateral;
    this.vz = nf.z * fwd + nr.z * lateral;

    // --- Move, sliding along whatever is in the way ---
    const nx = car.x + this.vx * dt;
    const nz = car.z + this.vz * dt;
    // A car that finds itself inside something (a building went up on top of it) may drive out of it.
    const trapped = this.hits(car.x, car.z, car.heading);
    if (trapped || !this.hits(nx, nz, car.heading)) {
      car.x = nx;
      car.z = nz;
    } else if (!this.hits(nx, car.z, car.heading)) {
      car.x = nx;
      this.crash(Math.abs(this.vz));
      this.vz *= -0.2;
      this.vx *= 0.8;
    } else if (!this.hits(car.x, nz, car.heading)) {
      car.z = nz;
      this.crash(Math.abs(this.vx));
      this.vx *= -0.2;
      this.vz *= 0.8;
    } else {
      this.crash(Math.hypot(this.vx, this.vz));
      this.vx *= -0.25;
      this.vz *= -0.25;
      // If the turn itself put the car into a wall, turn it back.
      if (this.hits(car.x, car.z, car.heading)) car.heading += yaw * dt;
    }

    // --- Other cars: pushed apart, not driven through ---
    for (const other of sim.cars) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const reach = spec.halfLength * 0.9 + SPECS[other.kind].halfLength * 0.9;
      const d = Math.hypot(dx, dz);
      if (d >= reach || d < 0.01) continue;
      const nxn = dx / d;
      const nzn = dz / d;
      const closing = -(this.vx * nxn + this.vz * nzn);
      car.x += nxn * (reach - d);
      car.z += nzn * (reach - d);
      if (closing > 0) {
        this.vx += nxn * closing * 1.3;
        this.vz += nzn * closing * 1.3;
        if (closing > 3 && this.hitCooldown <= 0) {
          this.hitCooldown = 0.4;
          playSfx('car_hit', Math.min(1, closing / 12));
          this.shake = Math.max(this.shake, Math.min(0.6, closing / 25));
        }
      }
    }
    this.hitCooldown -= dt;

    // --- People and monsters in the way ---
    const speed = Math.hypot(this.vx, this.vz);
    if (speed > 3.5) {
      const hits = combat.vehicleHit(car.x + nf.x * spec.halfLength * 0.8, car.z + nf.z * spec.halfLength * 0.8, nf.x, nf.z, speed);
      if (hits > 0) {
        this.vx *= 0.93;
        this.vz *= 0.93;
        playSfx('car_hit', Math.min(1, 0.4 + speed / 25));
      }
    }

    // --- Where the car stands (height and tilt on uneven ground) and how fast it is going ---
    car.speed = Math.hypot(this.vx, this.vz) * (this.forward >= 0 ? 1 : -1);
    if (hasTerrain()) {
      const front = heightAt(car.x + nf.x * 1.8, car.z + nf.z * 1.8);
      const back = heightAt(car.x - nf.x * 1.8, car.z - nf.z * 1.8);
      car.y = Math.max(0, (front + back) / 2);
      car.pitch = -Math.atan2(front - back, 3.6);
    }
    this.horn = input.horn;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.lookAhead += (Math.max(-1, Math.min(1, this.forward / 20)) - this.lookAhead) * Math.min(1, dt * 2);
  }

  /** How far ahead the camera leans, -1..1 (driven by speed). */
  get lean() {
    return this.lookAhead;
  }
}

export const vehicle = new Vehicle();
