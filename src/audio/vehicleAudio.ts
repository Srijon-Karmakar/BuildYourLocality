import { audio, makePanner, movePanner, type Graph } from './engine';

/**
 * Engines. The player's car has its own full engine voice (rpm, gears, tyres, wind, horn); traffic
 * near the player gets a small pool of 3D engine voices with Doppler shift as cars pass.
 */

function noiseLoop(g: Graph, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise[color];
  src.loop = true;
  src.start(0, Math.random() * 3);
  return src;
}

/** Soft clipping: adds the gritty harmonics of a real exhaust note. */
function softClip(g: Graph, amount: number): WaveShaperNode {
  const shaper = g.ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  shaper.curve = curve;
  return shaper;
}

export interface DriveSound {
  /** Forward speed, m/s (negative reversing). */
  speed: number;
  /** 0..1 */
  throttle: number;
  /** Sideways slip, m/s. */
  slip: number;
  onRoad: boolean;
  horn: boolean;
  heavy: boolean;
  /** Camera inside the car (muffles the engine a little). */
  cabin: boolean;
}

class PlayerEngine {
  private g: Graph;
  private master: GainNode;
  private oscs: OscillatorNode[];
  private body: BiquadFilterNode;
  private intake: GainNode;
  private tyre: GainNode;
  private tyreBand: BiquadFilterNode;
  private squeal: GainNode;
  private squealOsc: OscillatorNode;
  private wind: GainNode;
  private windBand: BiquadFilterNode;
  private horn: GainNode;
  private rpm = 900;
  private gear = 1;

  constructor(g: Graph) {
    this.g = g;
    const { ctx } = g;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(g.buses.vehicles);

    // Engine: three detuned buzzing oscillators through a growling shaper and a moving low-pass.
    const mix = ctx.createGain();
    mix.gain.value = 0.34;
    this.oscs = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    this.oscs[0].type = 'sawtooth';
    this.oscs[1].type = 'square';
    this.oscs[2].type = 'sawtooth';
    const levels = [0.5, 0.35, 0.22];
    this.oscs.forEach((o, i) => {
      const l = ctx.createGain();
      l.gain.value = levels[i];
      o.connect(l);
      l.connect(mix);
      o.start();
    });
    const shaper = softClip(g, 2.6);
    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.body.Q.value = 2.2;
    mix.connect(shaper);
    shaper.connect(this.body);
    this.body.connect(this.master);

    // Air rushing into the engine under load.
    this.intake = ctx.createGain();
    this.intake.gain.value = 0;
    const intakeBand = ctx.createBiquadFilter();
    intakeBand.type = 'bandpass';
    intakeBand.frequency.value = 520;
    intakeBand.Q.value = 0.8;
    noiseLoop(g, 'pink').connect(intakeBand);
    intakeBand.connect(this.intake);
    this.intake.connect(this.master);

    // Tyres on the surface.
    this.tyre = ctx.createGain();
    this.tyre.gain.value = 0;
    this.tyreBand = ctx.createBiquadFilter();
    this.tyreBand.type = 'bandpass';
    this.tyreBand.Q.value = 0.7;
    noiseLoop(g, 'pink').connect(this.tyreBand);
    this.tyreBand.connect(this.tyre);
    this.tyre.connect(g.buses.vehicles);

    // Squeal when the tyres slide.
    this.squeal = ctx.createGain();
    this.squeal.gain.value = 0;
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'sawtooth';
    this.squealOsc.frequency.value = 900;
    const squealBand = ctx.createBiquadFilter();
    squealBand.type = 'bandpass';
    squealBand.frequency.value = 1500;
    squealBand.Q.value = 4;
    noiseLoop(g, 'white').connect(squealBand);
    this.squealOsc.connect(squealBand);
    squealBand.connect(this.squeal);
    this.squeal.connect(g.buses.vehicles);
    this.squealOsc.start();

    // Wind past the car.
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.Q.value = 0.5;
    this.windBand.frequency.value = 800;
    noiseLoop(g, 'pink').connect(this.windBand);
    this.windBand.connect(this.wind);
    this.wind.connect(g.buses.vehicles);

    // Horn: two square notes (a major third) through a low-pass.
    this.horn = ctx.createGain();
    this.horn.gain.value = 0;
    const hornLp = ctx.createBiquadFilter();
    hornLp.type = 'lowpass';
    hornLp.frequency.value = 2400;
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const l = ctx.createGain();
      l.gain.value = 0.09;
      o.connect(l);
      l.connect(hornLp);
      o.start();
    }
    hornLp.connect(this.horn);
    this.horn.connect(g.buses.vehicles);
  }

  update(d: DriveSound, dt: number) {
    const t = this.g.ctx.currentTime;
    const speed = Math.abs(d.speed);
    const gearSpan = d.heavy ? 5 : 7.5;
    const gear = Math.min(5, Math.floor(speed / gearSpan) + 1);
    // Revs climb through each gear, then drop as the next is selected.
    const inGear = (speed - (gear - 1) * gearSpan) / gearSpan;
    const target = 850 + inGear * (d.heavy ? 2600 : 4300) + d.throttle * 700 + (gear - 1) * 120;
    this.rpm += (target - this.rpm) * Math.min(1, dt * (target > this.rpm ? 6 : 3.2));
    if (gear !== this.gear) {
      // A tiny dip as the clutch changes gear.
      this.rpm -= d.throttle > 0.3 ? 500 : 150;
      this.gear = gear;
    }

    const f = (this.rpm / 60) * (d.heavy ? 1.1 : 2) * (d.heavy ? 1 : 1);
    const base = d.heavy ? f * 0.9 : f;
    this.oscs[0].frequency.setTargetAtTime(base, t, 0.03);
    this.oscs[1].frequency.setTargetAtTime(base * 0.5, t, 0.03);
    this.oscs[2].frequency.setTargetAtTime(base * 2.012, t, 0.03);
    const open = 380 + this.rpm * 0.55 + d.throttle * 500;
    this.body.frequency.setTargetAtTime(d.cabin ? open * 0.6 : open, t, 0.05);
    this.master.gain.setTargetAtTime((0.5 + d.throttle * 0.5) * (d.cabin ? 0.75 : 1), t, 0.08);
    this.intake.gain.setTargetAtTime(d.throttle * (0.1 + inGear * 0.15), t, 0.1);

    const roll = Math.min(1, speed / 30);
    this.tyreBand.frequency.setTargetAtTime(d.onRoad ? 300 + speed * 38 : 700 + speed * 20, t, 0.1);
    this.tyre.gain.setTargetAtTime(roll * (d.onRoad ? 0.22 : 0.3), t, 0.1);
    const slide = Math.max(0, Math.min(1, (Math.abs(d.slip) - 2.2) / 6)) * Math.min(1, speed / 6);
    this.squeal.gain.setTargetAtTime(d.onRoad ? slide * 0.22 : slide * 0.05, t, 0.04);
    this.squealOsc.frequency.setTargetAtTime(820 + speed * 14 + Math.random() * 40, t, 0.05);
    this.windBand.frequency.setTargetAtTime(600 + speed * 40, t, 0.1);
    this.wind.gain.setTargetAtTime(Math.pow(speed / 35, 2) * (d.cabin ? 0.5 : 0.35), t, 0.1);
    this.horn.gain.setTargetAtTime(d.horn ? 1 : 0, t, d.horn ? 0.01 : 0.04);
  }

  stop() {
    const t = this.g.ctx.currentTime;
    for (const node of [this.master, this.intake, this.tyre, this.squeal, this.wind, this.horn]) node.gain.setTargetAtTime(0, t, 0.08);
  }
}

let engine: PlayerEngine | null = null;

/** Drives the player's engine voice; call every frame while driving. */
export function driveSound(d: DriveSound, dt: number) {
  const g = audio();
  if (!g) return;
  engine ??= new PlayerEngine(g);
  engine.update(d, dt);
}

/** Fades the engine out (the player got out). */
export function stopDriveSound() {
  engine?.stop();
}

// --- Traffic ---

export interface TrafficCar {
  id: number;
  x: number;
  z: number;
  speed: number;
  heavy: boolean;
}

class TrafficVoice {
  private g: Graph;
  private out: GainNode;
  private panner: PannerNode;
  private oscs: OscillatorNode[];
  private lp: BiquadFilterNode;
  private road: GainNode;
  private roadBand: BiquadFilterNode;
  carId = -1;
  private lastDist = 0;

  constructor(g: Graph) {
    this.g = g;
    const { ctx } = g;
    this.panner = makePanner(g, { x: 0, y: 0.8, z: 0 }, 1.4);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.panner);
    this.panner.connect(g.buses.vehicles);
    this.oscs = [ctx.createOscillator(), ctx.createOscillator()];
    this.oscs[0].type = 'sawtooth';
    this.oscs[1].type = 'square';
    const mix = ctx.createGain();
    mix.gain.value = 0.22;
    for (const o of this.oscs) {
      o.connect(mix);
      o.start();
    }
    const shaper = softClip(g, 2);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 1.4;
    mix.connect(shaper);
    shaper.connect(this.lp);
    this.lp.connect(this.out);
    this.road = ctx.createGain();
    this.road.gain.value = 0;
    this.roadBand = ctx.createBiquadFilter();
    this.roadBand.type = 'bandpass';
    this.roadBand.Q.value = 0.6;
    noiseLoop(g, 'pink').connect(this.roadBand);
    this.roadBand.connect(this.road);
    this.road.connect(this.out);
  }

  /** Assigns a car (or none) and sets its sound for this frame. `lx`, `lz` is the listener. */
  set(car: TrafficCar | null, lx: number, lz: number, dt: number) {
    const t = this.g.ctx.currentTime;
    if (!car) {
      this.out.gain.setTargetAtTime(0, t, 0.15);
      this.carId = -1;
      return;
    }
    const dist = Math.hypot(car.x - lx, car.z - lz);
    if (car.id !== this.carId) {
      this.carId = car.id;
      this.lastDist = dist;
    }
    // Doppler: sound is raised as the car approaches and lowered as it leaves.
    const radial = (dist - this.lastDist) / Math.max(dt, 0.001);
    this.lastDist = dist;
    const doppler = 343 / (343 + Math.max(-60, Math.min(60, radial)));
    const speed = Math.abs(car.speed);
    const revs = (car.heavy ? 38 : 52) + speed * (car.heavy ? 3.4 : 4.4);
    this.oscs[0].frequency.setTargetAtTime(revs * doppler, t, 0.05);
    this.oscs[1].frequency.setTargetAtTime(revs * 0.5 * doppler, t, 0.05);
    this.lp.frequency.setTargetAtTime(300 + speed * 45, t, 0.1);
    this.roadBand.frequency.setTargetAtTime((260 + speed * 32) * doppler, t, 0.1);
    this.road.gain.setTargetAtTime(Math.min(0.4, speed / 28) * 0.5, t, 0.1);
    movePanner(this.panner, car.x, 0.8, car.z, t);
    const loud = car.heavy ? 1.25 : 1;
    this.out.gain.setTargetAtTime(Math.min(1, 0.35 + speed / 14) * loud * 0.55, t, 0.12);
  }
}

const POOL = 3;
let voices: TrafficVoice[] | null = null;

/** Gives the nearest cars their engine voices. */
export function updateTraffic(cars: TrafficCar[], lx: number, lz: number, dt: number, enabled: boolean) {
  const g = audio();
  if (!g) return;
  voices ??= Array.from({ length: POOL }, () => new TrafficVoice(g));
  const nearest = enabled ? cars.filter((c) => Math.hypot(c.x - lx, c.z - lz) < 75).sort((a, b) => Math.hypot(a.x - lx, a.z - lz) - Math.hypot(b.x - lx, b.z - lz)).slice(0, POOL) : [];
  // A car that already has a voice keeps it, so the sound does not jump between engines.
  const taken = new Set<number>();
  const free: TrafficVoice[] = [];
  for (const voice of voices) {
    const car = nearest.find((c) => c.id === voice.carId);
    if (car) {
      voice.set(car, lx, lz, dt);
      taken.add(car.id);
    } else {
      free.push(voice);
    }
  }
  const rest = nearest.filter((c) => !taken.has(c.id));
  free.forEach((voice, i) => voice.set(rest[i] ?? null, lx, lz, dt));
}
