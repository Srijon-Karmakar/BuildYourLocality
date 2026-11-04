import { audio, makePanner, type Graph } from './engine';
import { playSfx } from './sounds';

/**
 * The living background: wind, rain, traffic, crowds, water and the city's own hum as steady
 * beds that swell and fade with what is around you, plus birds by day, crickets and owls at
 * night, and thunder that arrives a moment after each flash of lightning.
 */

export interface AmbienceInput {
  dt: number;
  /** 0 night .. 1 day. */
  daylight: number;
  rain: number;
  snow: number;
  storm: number;
  fog: number;
  wind: number;
  /** Lightning flash strength right now. */
  flash: number;
  /** Where the listener is. */
  x: number;
  z: number;
  /** Inside a building (sheltered) or inside a vehicle: the outside world is muffled. */
  indoors: boolean;
  inCar: boolean;
  /** How lively the surroundings are, 0..1 each. */
  pedsNear: number;
  carsNear: number;
  buildings: number;
  greenery: number;
  water: number;
  /** Seconds of game clock matter little here; this is real time. */
  time: number;
}

interface Bed {
  gain: GainNode;
}

let beds: Record<'wind' | 'rain' | 'drum' | 'hum' | 'traffic' | 'crowd' | 'water' | 'crickets' | 'snowHush', Bed> | null = null;
let birdTimer = 2;
let owlTimer = 12;
let sirenTimer = 40;
let lastFlash = 0;
let pendingThunder: number[] = [];

function loop(g: Graph, color: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise[color];
  src.loop = true;
  src.start(0, Math.random() * 3);
  return src;
}

function lfo(g: Graph, rate: number, depth: number, target: AudioParam) {
  const o = g.ctx.createOscillator();
  o.frequency.value = rate;
  const d = g.ctx.createGain();
  d.gain.value = depth;
  o.connect(d);
  d.connect(target);
  o.start();
}

function filtered(g: Graph, source: AudioNode, type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
  const node = g.ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = f;
  node.Q.value = q;
  source.connect(node);
  return node;
}

function makeBeds(g: Graph) {
  const { ctx } = g;
  const out = (node: AudioNode): Bed => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(g.buses.ambience);
    return { gain };
  };

  // Wind: breathy pink noise whose pitch and loudness drift in slow gusts.
  const windBand = filtered(g, loop(g, 'pink'), 'bandpass', 520, 0.55);
  lfo(g, 0.11, 220, windBand.frequency);
  const windGain = ctx.createGain();
  windGain.gain.value = 0.7;
  windBand.connect(windGain);
  lfo(g, 0.07, 0.3, windGain.gain);
  const wind = out(windGain);

  // Rain: a bright hiss on top, a duller patter of drops on roofs and ground below it.
  const hiss = filtered(g, filtered(g, loop(g, 'white'), 'highpass', 1100, 0.5), 'lowpass', 7500, 0.5);
  const rain = out(hiss);
  const drum = out(filtered(g, loop(g, 'pink'), 'bandpass', 240, 0.7));

  // City hum and traffic.
  const hum = out(filtered(g, loop(g, 'brown'), 'lowpass', 160, 0.7));
  const trafficBand = filtered(g, loop(g, 'pink'), 'bandpass', 340, 0.6);
  const trafficGain = ctx.createGain();
  trafficGain.gain.value = 0.8;
  trafficBand.connect(trafficGain);
  lfo(g, 0.19, 0.25, trafficGain.gain);
  const traffic = out(trafficGain);

  // A crowd: two voice-range bands whose loudness flutters like syllables.
  const lowVoice = filtered(g, loop(g, 'pink'), 'bandpass', 520, 1.6);
  const highVoice = filtered(g, loop(g, 'pink'), 'bandpass', 1500, 1.8);
  const crowdMix = ctx.createGain();
  crowdMix.gain.value = 0.6;
  const syllable = ctx.createGain();
  syllable.gain.value = 0.6;
  lfo(g, 3.7, 0.35, syllable.gain);
  lowVoice.connect(syllable);
  const syllable2 = ctx.createGain();
  syllable2.gain.value = 0.5;
  lfo(g, 5.3, 0.4, syllable2.gain);
  highVoice.connect(syllable2);
  syllable.connect(crowdMix);
  syllable2.connect(crowdMix);
  const crowd = out(crowdMix);

  // Water lapping.
  const waterBand = filtered(g, loop(g, 'pink'), 'bandpass', 700, 0.9);
  const waterGain = ctx.createGain();
  waterGain.gain.value = 0.7;
  waterBand.connect(waterGain);
  lfo(g, 0.35, 0.35, waterGain.gain);
  lfo(g, 0.09, 260, waterBand.frequency);
  const water = out(waterGain);

  // Crickets: pulsed high tones in chirping groups.
  const cricketMix = ctx.createGain();
  cricketMix.gain.value = 0.5;
  for (const f of [4280, 4590, 5020]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    // A square-ish LFO makes the tone tick on and off ~28 times a second...
    const tick = ctx.createOscillator();
    tick.type = 'square';
    tick.frequency.value = 26 + Math.random() * 6;
    const tickDepth = ctx.createGain();
    tickDepth.gain.value = 0.25;
    tick.connect(tickDepth);
    tickDepth.connect(pulse.gain);
    // ...and a slow one opens and closes it in chirp groups.
    const group = ctx.createGain();
    group.gain.value = 0.5;
    const groupLfo = ctx.createOscillator();
    groupLfo.type = 'square';
    groupLfo.frequency.value = 2.1 + Math.random() * 1.2;
    const groupDepth = ctx.createGain();
    groupDepth.gain.value = 0.5;
    groupLfo.connect(groupDepth);
    groupDepth.connect(group.gain);
    osc.connect(pulse);
    pulse.connect(group);
    group.connect(cricketMix);
    osc.start();
    tick.start();
    groupLfo.start();
  }
  const crickets = out(cricketMix);

  // Snow hushes everything: a soft low rumble stands in for the muffled world.
  const snowHush = out(filtered(g, loop(g, 'brown'), 'lowpass', 90, 0.5));

  beds = { wind, rain, drum, hum, traffic, crowd, water, crickets, snowHush };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function setBed(g: Graph, bed: Bed, level: number) {
  bed.gain.gain.setTargetAtTime(level, g.ctx.currentTime, 0.6);
}

/** A short, rising-and-falling bird call. */
function chirp(g: Graph, volume: number) {
  const { ctx } = g;
  const at = { x: 0, y: 6, z: 0 };
  const angle = Math.random() * Math.PI * 2;
  const dist = 8 + Math.random() * 30;
  const l = ctx.listener;
  const lx = l.positionX ? l.positionX.value : 0;
  const lz = l.positionZ ? l.positionZ.value : 0;
  at.x = lx + Math.cos(angle) * dist;
  at.z = lz + Math.sin(angle) * dist;
  at.y = 5 + Math.random() * 8;
  const panner = makePanner(g, at, 1.4);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(panner);
  panner.connect(g.buses.ambience);
  const base = 2400 + Math.random() * 2600;
  const notes = 2 + Math.floor(Math.random() * 4);
  let when = ctx.currentTime + 0.01;
  const style = Math.random();
  for (let i = 0; i < notes; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const env = ctx.createGain();
    const dur = 0.05 + Math.random() * 0.09;
    const f1 = base * (0.85 + Math.random() * 0.4);
    const f2 = style < 0.5 ? f1 * (1.15 + Math.random() * 0.3) : f1 * (0.7 + Math.random() * 0.2);
    osc.frequency.setValueAtTime(f1, when);
    osc.frequency.exponentialRampToValueAtTime(f2, when + dur);
    if (style > 0.8) {
      // A trill: fast vibrato.
      const trill = ctx.createOscillator();
      trill.frequency.value = 28;
      const depth = ctx.createGain();
      depth.gain.value = f1 * 0.06;
      trill.connect(depth);
      depth.connect(osc.frequency);
      trill.start(when);
      trill.stop(when + dur + 0.02);
    }
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(0.5, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0005, when + dur);
    osc.connect(env);
    env.connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.03);
    when += dur + 0.03 + Math.random() * 0.08;
  }
  window.setTimeout(() => {
    out.disconnect();
    panner.disconnect();
  }, (when - ctx.currentTime + 0.5) * 1000);
}

/** A far-off owl: two soft hoots. */
function hoot(g: Graph, volume: number) {
  const { ctx } = g;
  const l = ctx.listener;
  const lx = l.positionX ? l.positionX.value : 0;
  const lz = l.positionZ ? l.positionZ.value : 0;
  const a = Math.random() * Math.PI * 2;
  const panner = makePanner(g, { x: lx + Math.cos(a) * 45, y: 8, z: lz + Math.sin(a) * 45 }, 1.3);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(panner);
  panner.connect(g.buses.ambience);
  const send = ctx.createGain();
  send.gain.value = 0.8;
  out.connect(send);
  send.connect(g.reverbIn);
  const t0 = ctx.currentTime + 0.02;
  [0, 0.55].forEach((offset, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const env = ctx.createGain();
    const f = 410 - i * 24;
    osc.frequency.setValueAtTime(f * 1.05, t0 + offset);
    osc.frequency.exponentialRampToValueAtTime(f * 0.93, t0 + offset + 0.35);
    env.gain.setValueAtTime(0.0001, t0 + offset);
    env.gain.linearRampToValueAtTime(0.4, t0 + offset + 0.07);
    env.gain.exponentialRampToValueAtTime(0.0005, t0 + offset + 0.4);
    osc.connect(env);
    env.connect(out);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.45);
  });
  window.setTimeout(() => {
    out.disconnect();
    panner.disconnect();
    send.disconnect();
  }, 4000);
}

/** A distant siren, rising and falling, now and then in a busy night city. */
function siren(g: Graph, volume: number) {
  const { ctx } = g;
  const l = ctx.listener;
  const lx = l.positionX ? l.positionX.value : 0;
  const lz = l.positionZ ? l.positionZ.value : 0;
  const a = Math.random() * Math.PI * 2;
  const panner = makePanner(g, { x: lx + Math.cos(a) * 160, y: 2, z: lz + Math.sin(a) * 160 }, 0.8);
  const out = ctx.createGain();
  out.gain.value = volume;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  out.connect(lp);
  lp.connect(panner);
  panner.connect(g.buses.ambience);
  const send = ctx.createGain();
  send.gain.value = 0.9;
  lp.connect(send);
  send.connect(g.reverbIn);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const t0 = ctx.currentTime + 0.05;
  for (let i = 0; i < 6; i++) {
    osc.frequency.linearRampToValueAtTime(i % 2 === 0 ? 1050 : 720, t0 + (i + 1) * 0.9);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(0.18, t0 + 1);
  env.gain.setValueAtTime(0.18, t0 + 4.2);
  env.gain.linearRampToValueAtTime(0.0001, t0 + 5.6);
  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + 5.7);
  window.setTimeout(() => {
    out.disconnect();
    panner.disconnect();
    send.disconnect();
  }, 8000);
}

/** Runs every frame: sets how loud each bed is for the surroundings and fires the occasional event. */
export function updateAmbience(i: AmbienceInput) {
  const g = audio();
  if (!g) return;
  if (!beds) makeBeds(g);
  const b = beds!;
  const day = i.daylight;
  const night = 1 - day;
  const dry = 1 - clamp01(i.rain + i.snow * 0.5);

  // Indoors or in a car, the world outside is dull and quiet.
  const t = g.ctx.currentTime;
  const muffleTo = i.indoors ? 650 : i.inCar ? 2600 : 22000;
  g.ambienceMuffle.frequency.setTargetAtTime(muffleTo, t, 0.25);
  g.worldMuffle.frequency.setTargetAtTime(i.indoors ? 1100 : i.inCar ? 9000 : 22000, t, 0.25);
  const quiet = i.indoors ? 0.55 : i.inCar ? 0.7 : 1;

  const outdoors = quiet;
  setBed(g, b.wind, clamp01(0.07 + i.wind * 0.22 + i.storm * 0.3 + (i.snow > 0 ? 0.08 : 0)) * 0.55 * outdoors);
  setBed(g, b.rain, clamp01(i.rain) * 0.38 * outdoors);
  setBed(g, b.drum, clamp01(i.rain) * (0.25 + 0.15 * clamp01(i.buildings)) * (i.indoors ? 1.4 : 1));
  setBed(g, b.hum, (0.07 + 0.2 * clamp01(i.buildings)) * (0.7 + 0.3 * i.carsNear) * quiet);
  setBed(g, b.traffic, clamp01(i.carsNear) * 0.34 * quiet);
  setBed(g, b.crowd, clamp01(i.pedsNear) * 0.2 * (0.6 + 0.4 * day) * quiet);
  setBed(g, b.water, clamp01(i.water) * 0.32 * outdoors);
  setBed(g, b.crickets, night * dry * (1 - i.snow) * (0.05 + 0.07 * clamp01(i.greenery)) * (1 - i.fog * 0.4) * outdoors);
  setBed(g, b.snowHush, clamp01(i.snow) * 0.18 * outdoors);

  const dt = i.dt;
  // Birds by day, more in green places, fewer in rain.
  birdTimer -= dt;
  if (birdTimer <= 0) {
    const activity = day * dry * (1 - i.fog * 0.5) * (0.2 + 0.8 * clamp01(i.greenery));
    birdTimer = 1.2 + Math.random() * 5 + (1 - activity) * 14;
    if (activity > 0.12 && !i.indoors) chirp(g, 0.1 * outdoors * activity);
  }
  // Owls late at night, only where it is quiet and clear.
  owlTimer -= dt;
  if (owlTimer <= 0) {
    owlTimer = 14 + Math.random() * 30;
    if (night > 0.7 && dry > 0.8 && !i.indoors && i.carsNear < 0.4) hoot(g, 0.14);
  }
  // A siren somewhere across a busy city at night.
  sirenTimer -= dt;
  if (sirenTimer <= 0) {
    sirenTimer = 60 + Math.random() * 120;
    if (i.buildings > 0.4 && night > 0.4) siren(g, 0.1);
  }

  // Thunder rolls in after the flash: the farther the strike, the longer the wait.
  if (i.flash > 0.6 && lastFlash <= 0.6) pendingThunder.push(i.time + 0.25 + Math.random() * 3);
  lastFlash = i.flash;
  pendingThunder = pendingThunder.filter((when) => {
    if (i.time < when) return true;
    playSfx('thunder', i.indoors ? 0.55 : 1);
    return false;
  });
}
