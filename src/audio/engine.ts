import { create } from 'zustand';

/**
 * The sound engine: one Web Audio graph for the whole game. Everything is synthesised (no audio
 * files), so the game stays small, and every sound is built from layers (noise, tones, voices)
 * through filters, a shared room reverb and, for things in the world, a 3D panner.
 *
 *   sources -> bus (effects | ambience | vehicles | interface) -> master -> compressor -> speakers
 *                    \-> reverb send -> convolver -> master
 */

export interface AudioLevels {
  master: number;
  effects: number;
  ambience: number;
  vehicles: number;
}

const LEVELS_KEY = 'apnagali.audio.v1';
const MUTE_KEY = 'apnagali.sound';

const clampLevel = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

function savedLevels(): AudioLevels {
  try {
    const raw = JSON.parse(localStorage.getItem(LEVELS_KEY) ?? 'null') as Partial<AudioLevels> | null;
    return { master: clampLevel(raw?.master, 0.8), effects: clampLevel(raw?.effects, 1), ambience: clampLevel(raw?.ambience, 0.8), vehicles: clampLevel(raw?.vehicles, 1) };
  } catch {
    return { master: 0.8, effects: 1, ambience: 0.8, vehicles: 1 };
  }
}

let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === 'off';
} catch {
  /* storage blocked: sound stays on */
}

export const useAudioStore = create<AudioLevels & { muted: boolean; set: (patch: Partial<AudioLevels>) => void }>((set) => ({
  ...savedLevels(),
  muted,
  set: (patch) => set(patch),
}));

useAudioStore.subscribe((s) => {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify({ master: s.master, effects: s.effects, ambience: s.ambience, vehicles: s.vehicles }));
  } catch {
    /* ignore */
  }
  applyLevels();
});

export const isSoundOn = () => !useAudioStore.getState().muted;
export function setSoundOn(on: boolean) {
  useAudioStore.setState({ muted: !on });
  try {
    localStorage.setItem(MUTE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

export interface Graph {
  ctx: AudioContext;
  master: GainNode;
  /** One-shot effects, ambience, vehicles and interface clicks. */
  buses: { effects: GainNode; ambience: GainNode; vehicles: GainNode; ui: GainNode };
  /** Low-pass on the ambience bus: closes when you are indoors or in a car. */
  ambienceMuffle: BiquadFilterNode;
  /** Low-pass on everything in the world (vehicles and effects) for being inside a car or building. */
  worldMuffle: BiquadFilterNode;
  reverbIn: GainNode;
  noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
}

let graph: Graph | null = null;

function makeNoise(ctx: AudioContext, kind: 'white' | 'pink' | 'brown', seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's filter: equal energy per octave, which is what wind and rain sound like.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  }
  // Make the loop seamless: fade the last few milliseconds into the first.
  const fade = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[data.length - fade + i] = data[data.length - fade + i] * (1 - t) + data[i] * t;
  }
  return buffer;
}

/** A room-sized tail: decaying stereo noise that darkens as it fades, like real air and walls. */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 3.2);
      // The one-pole low-pass closes over time (alpha falls), so the tail loses its highs first.
      const alpha = 0.55 * (1 - t) + 0.04;
      low += alpha * ((Math.random() * 2 - 1) - low);
      data[i] = low * decay * (i < 200 ? i / 200 : 1);
    }
  }
  return buffer;
}

/** Creates the audio graph on first use. Browsers keep it suspended until a tap or key press. */
export function getGraph(): Graph | null {
  if (graph) return graph;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor({ latencyHint: 'interactive' });

  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  const worldMuffle = ctx.createBiquadFilter();
  worldMuffle.type = 'lowpass';
  worldMuffle.frequency.value = 22000;
  worldMuffle.connect(master);

  const ambienceMuffle = ctx.createBiquadFilter();
  ambienceMuffle.type = 'lowpass';
  ambienceMuffle.frequency.value = 22000;
  ambienceMuffle.connect(master);

  const bus = (to: AudioNode) => {
    const g = ctx.createGain();
    g.connect(to);
    return g;
  };
  const buses = { effects: bus(worldMuffle), ambience: bus(ambienceMuffle), vehicles: bus(worldMuffle), ui: bus(master) };

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 2.6);
  const reverbIn = ctx.createGain();
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.7;
  reverbIn.connect(convolver);
  convolver.connect(reverbOut);
  reverbOut.connect(worldMuffle);

  graph = { ctx, master, buses, ambienceMuffle, worldMuffle, reverbIn, noise: { white: makeNoise(ctx, 'white', 2), pink: makeNoise(ctx, 'pink', 4), brown: makeNoise(ctx, 'brown', 4) } };
  applyLevels();
  return graph;
}

function applyLevels() {
  if (!graph) return;
  const s = useAudioStore.getState();
  const t = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
  graph.buses.effects.gain.setTargetAtTime(s.effects, t, 0.05);
  graph.buses.ambience.gain.setTargetAtTime(s.ambience, t, 0.05);
  graph.buses.vehicles.gain.setTargetAtTime(s.vehicles, t, 0.05);
  graph.buses.ui.gain.setTargetAtTime(s.effects, t, 0.05);
}

/** The audio graph, resumed if the browser had suspended it. */
export function audio(): Graph | null {
  const g = getGraph();
  if (g && g.ctx.state === 'suspended') void g.ctx.resume();
  return g;
}

/** Pause an existing world's looping ambience while the separate practice view is open. */
export function pauseWorldAudio(): () => void {
  const context = graph?.ctx;
  const running = context?.state === 'running';
  if (running) void context.suspend().catch(() => {});
  return () => { if (running) void context.resume().catch(() => {}); };
}

let unlocked = false;
/** Starts audio on the first tap, click or key press (the only moment browsers allow it). */
export function unlockOnGesture() {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  const go = () => {
    audio();
    for (const type of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(type, go);
  };
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, go, { passive: true });
}

export interface At {
  x: number;
  y?: number;
  z: number;
}

/** Puts the listener (the player's ears) at the camera. */
export function setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
  const g = graph;
  if (!g) return;
  const l = g.ctx.listener;
  if (l.positionX) {
    const t = g.ctx.currentTime;
    l.positionX.setValueAtTime(x, t);
    l.positionY.setValueAtTime(y, t);
    l.positionZ.setValueAtTime(z, t);
    l.forwardX.setValueAtTime(fx, t);
    l.forwardY.setValueAtTime(fy, t);
    l.forwardZ.setValueAtTime(fz, t);
    l.upX.setValueAtTime(0, t);
    l.upY.setValueAtTime(1, t);
    l.upZ.setValueAtTime(0, t);
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fx, fy, fz, 0, 1, 0);
  }
}

/** A 3D panner for something that sounds from a place in the world. */
export function makePanner(g: Graph, at: At, rolloff = 1.15): PannerNode {
  const p = g.ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 4;
  p.maxDistance = 220;
  p.rolloffFactor = rolloff;
  if (p.positionX) {
    p.positionX.value = at.x;
    p.positionY.value = at.y ?? 1.5;
    p.positionZ.value = at.z;
  } else {
    p.setPosition(at.x, at.y ?? 1.5, at.z);
  }
  return p;
}

export function movePanner(p: PannerNode, x: number, y: number, z: number, t: number) {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, t, 0.04);
    p.positionY.setTargetAtTime(y, t, 0.04);
    p.positionZ.setTargetAtTime(z, t, 0.04);
  } else {
    p.setPosition(x, y, z);
  }
}

/** How many one-shot sounds are playing; new ones are dropped past the limit so a firefight cannot choke the device. */
let voices = 0;
export const MAX_VOICES = 40;
export const voiceFree = () => voices < MAX_VOICES;
export function holdVoice(seconds: number) {
  voices++;
  window.setTimeout(() => {
    voices = Math.max(0, voices - 1);
  }, seconds * 1000 + 120);
}
