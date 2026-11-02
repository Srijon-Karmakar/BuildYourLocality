import { audio, holdVoice, makePanner, voiceFree, type At, type Graph } from './engine';

/**
 * One-shot sounds. Each is a recipe of layers (noise, tones, voices) that is built fresh every time
 * with a little random variation, so no two footsteps, shots or punches sound exactly alike.
 */

export type Sfx =
  | 'swing' | 'punch' | 'bat' | 'shot' | 'shotgun' | 'taser' | 'empty' | 'hurt' | 'pickup' | 'growl' | 'scream' | 'door' | 'win' | 'lose' | 'alert'
  | 'step_grass' | 'step_road' | 'step_stone' | 'land' | 'jump' | 'splash' | 'breath' | 'heartbeat' | 'flash_click'
  | 'click' | 'place' | 'place_soft' | 'delete' | 'select' | 'undo' | 'error' | 'token' | 'menu' | 'money'
  | 'car_door' | 'car_start' | 'car_horn' | 'car_crash' | 'car_skid' | 'car_hit'
  | 'hammer' | 'saw' | 'drill' | 'thunder' | 'roar' | 'rex_roar' | 'raptor' | 'fire' | 'chat';

interface NoiseLayer {
  kind: 'n';
  color?: 'white' | 'pink' | 'brown';
  at?: number;
  dur: number;
  gain: number;
  filter?: { type: BiquadFilterType; f: number; to?: number; q?: number };
  atk?: number;
  /** Amplitude modulation (tremolo): rate in Hz and depth 0..1. */
  am?: { rate: number; depth: number };
}
interface ToneLayer {
  kind: 't';
  at?: number;
  from: number;
  to?: number;
  dur: number;
  gain: number;
  wave?: OscillatorType;
  atk?: number;
  am?: { rate: number; depth: number };
  /** Frequency modulation: ratio to the carrier and depth in Hz (metallic, bell-like tones). */
  fm?: { ratio: number; depth: number };
}
/** A voice: a buzzing source shaped by three resonant bands (formants), like a throat and mouth. */
interface VoiceLayer {
  kind: 'v';
  at?: number;
  f0: number;
  f0To?: number;
  dur: number;
  gain: number;
  vowel: [number, number, number];
  vib?: { rate: number; depth: number };
  breath?: number;
  atk?: number;
}
type Layer = NoiseLayer | ToneLayer | VoiceLayer;

interface Recipe {
  layers: Layer[];
  /** Share of the sound sent to the room reverb, 0..1. */
  reverb?: number;
  /** Random variation of pitch, as a fraction (0.1 = up to 5 percent either way). */
  vary?: number;
  /** Plays on the interface bus (not affected by being indoors). */
  ui?: boolean;
  /** Seconds before the same sound may play again. */
  cooldown?: number;
}

const n = (o: Omit<NoiseLayer, 'kind'>): NoiseLayer => ({ kind: 'n', ...o });
const t = (o: Omit<ToneLayer, 'kind'>): ToneLayer => ({ kind: 't', ...o });
const v = (o: Omit<VoiceLayer, 'kind'>): VoiceLayer => ({ kind: 'v', ...o });

const RECIPES: Record<Sfx, Recipe> = {
  // --- Fighting ---
  swing: { vary: 0.12, layers: [n({ color: 'pink', dur: 0.22, gain: 0.45, atk: 0.05, filter: { type: 'bandpass', f: 1500, to: 500, q: 0.9 } })] },
  punch: {
    vary: 0.12,
    reverb: 0.08,
    layers: [t({ from: 150, to: 52, dur: 0.15, gain: 0.7 }), n({ color: 'brown', dur: 0.1, gain: 0.6, filter: { type: 'lowpass', f: 700 } }), n({ dur: 0.03, gain: 0.18, filter: { type: 'bandpass', f: 2400, q: 1 } })],
  },
  bat: {
    vary: 0.08,
    reverb: 0.15,
    layers: [n({ dur: 0.04, gain: 0.6, filter: { type: 'highpass', f: 1800 } }), t({ from: 360, to: 120, dur: 0.18, gain: 0.45, wave: 'triangle' }), t({ from: 95, to: 48, dur: 0.22, gain: 0.6 }), t({ from: 880, to: 700, dur: 0.1, gain: 0.08, fm: { ratio: 2.1, depth: 80 } })],
  },
  shot: {
    vary: 0.06,
    reverb: 0.55,
    layers: [
      n({ dur: 0.07, gain: 1, atk: 0.001, filter: { type: 'highpass', f: 2200 } }),
      t({ from: 150, to: 36, dur: 0.3, gain: 0.9 }),
      n({ color: 'pink', dur: 0.4, gain: 0.55, filter: { type: 'lowpass', f: 2200, to: 260 } }),
      n({ dur: 0.1, at: 0.012, gain: 0.25, filter: { type: 'bandpass', f: 4200, q: 0.6 } }),
    ],
  },
  shotgun: {
    vary: 0.05,
    reverb: 0.7,
    layers: [
      n({ dur: 0.1, gain: 1, atk: 0.001, filter: { type: 'highpass', f: 1400 } }),
      t({ from: 110, to: 26, dur: 0.5, gain: 1 }),
      n({ color: 'brown', dur: 0.65, gain: 0.9, filter: { type: 'lowpass', f: 1400, to: 180 } }),
      n({ color: 'pink', at: 0.11, dur: 0.55, gain: 0.3, filter: { type: 'lowpass', f: 900, to: 200 } }),
      t({ from: 70, to: 30, at: 0.02, dur: 0.4, gain: 0.5, wave: 'sawtooth' }),
    ],
  },
  taser: {
    vary: 0.1,
    reverb: 0.1,
    layers: [
      n({ dur: 0.42, gain: 0.3, filter: { type: 'highpass', f: 3500 }, am: { rate: 52, depth: 0.9 } }),
      t({ from: 2000, to: 700, dur: 0.38, gain: 0.14, wave: 'sawtooth', am: { rate: 38, depth: 0.8 } }),
      t({ from: 140, to: 90, dur: 0.3, gain: 0.2, wave: 'square' }),
    ],
  },
  empty: { vary: 0.05, layers: [t({ from: 1100, to: 760, dur: 0.045, gain: 0.2, wave: 'square' }), n({ dur: 0.02, gain: 0.2, filter: { type: 'highpass', f: 4000 } })] },
  hurt: {
    vary: 0.12,
    reverb: 0.15,
    layers: [v({ f0: 230, f0To: 150, dur: 0.38, gain: 0.5, vowel: [650, 1080, 2650], breath: 0.25, atk: 0.02 }), n({ color: 'brown', dur: 0.12, gain: 0.35, filter: { type: 'lowpass', f: 600 } })],
  },
  pickup: {
    vary: 0.04,
    reverb: 0.3,
    layers: [t({ from: 880, to: 1320, dur: 0.12, gain: 0.2 }), t({ from: 1320, to: 1760, at: 0.07, dur: 0.22, gain: 0.17 }), t({ from: 3520, to: 3520, at: 0.07, dur: 0.12, gain: 0.04 })],
  },
  growl: {
    vary: 0.14,
    reverb: 0.45,
    layers: [
      v({ f0: 88, f0To: 58, dur: 1, gain: 0.7, vowel: [420, 820, 2200], vib: { rate: 7, depth: 0.07 }, breath: 0.4, atk: 0.08 }),
      t({ from: 46, to: 38, dur: 1, gain: 0.3, wave: 'sawtooth', am: { rate: 14, depth: 0.5 } }),
      n({ color: 'pink', dur: 0.9, gain: 0.25, atk: 0.1, filter: { type: 'lowpass', f: 450, to: 220 } }),
    ],
  },
  scream: {
    vary: 0.1,
    reverb: 0.35,
    layers: [
      v({ f0: 680, f0To: 1080, dur: 0.65, gain: 0.26, vowel: [850, 1220, 2810], vib: { rate: 6.5, depth: 0.04 }, breath: 0.12, atk: 0.03 }),
      v({ f0: 1360, f0To: 1620, at: 0.05, dur: 0.5, gain: 0.07, vowel: [900, 1800, 3000], atk: 0.04 }),
      n({ dur: 0.45, gain: 0.05, filter: { type: 'bandpass', f: 3200, q: 0.8 } }),
    ],
  },
  door: {
    vary: 0.1,
    reverb: 0.3,
    layers: [n({ color: 'brown', dur: 0.28, gain: 0.7, filter: { type: 'lowpass', f: 520 } }), t({ from: 82, to: 48, dur: 0.32, gain: 0.55 }), n({ dur: 0.05, at: 0.02, gain: 0.18, filter: { type: 'bandpass', f: 1300, q: 2 } }), t({ from: 2800, to: 2400, at: 0.025, dur: 0.05, gain: 0.04 })],
  },
  win: {
    reverb: 0.55,
    layers: [523, 659, 784, 1047].map((f, i) => t({ from: f, dur: i === 3 ? 0.9 : 0.4, at: i * 0.13, gain: 0.22, wave: 'triangle' })).concat([t({ from: 1047, at: 0.39, dur: 0.9, gain: 0.1, wave: 'sine', fm: { ratio: 3, depth: 40 } })]),
  },
  lose: {
    reverb: 0.5,
    layers: [t({ from: 220, to: 55, dur: 1.3, gain: 0.3, wave: 'sawtooth' }), n({ color: 'brown', dur: 1.4, gain: 0.35, filter: { type: 'lowpass', f: 400, to: 90 } }), t({ from: 164, to: 41, dur: 1.4, gain: 0.25 })],
  },
  alert: { reverb: 0.1, layers: [t({ from: 740, to: 1040, dur: 0.15, gain: 0.11, wave: 'square' }), t({ from: 1040, to: 740, at: 0.16, dur: 0.15, gain: 0.11, wave: 'square' })] },

  // --- Moving about ---
  step_grass: { vary: 0.16, cooldown: 0.12, layers: [n({ color: 'pink', dur: 0.13, gain: 0.5, atk: 0.012, filter: { type: 'bandpass', f: 1500, q: 0.6 } }), t({ from: 85, to: 55, dur: 0.11, gain: 0.3 })] },
  step_road: { vary: 0.14, cooldown: 0.12, layers: [n({ dur: 0.04, gain: 0.4, filter: { type: 'highpass', f: 2300 } }), t({ from: 135, to: 88, dur: 0.08, gain: 0.45 }), n({ color: 'pink', dur: 0.08, gain: 0.25, filter: { type: 'bandpass', f: 700, q: 0.8 } })] },
  step_stone: { vary: 0.12, reverb: 0.12, cooldown: 0.12, layers: [n({ dur: 0.035, gain: 0.35, filter: { type: 'highpass', f: 2600 } }), t({ from: 210, to: 140, dur: 0.07, gain: 0.3, wave: 'triangle' }), t({ from: 120, to: 85, dur: 0.08, gain: 0.38 })] },
  land: { vary: 0.1, layers: [t({ from: 105, to: 42, dur: 0.22, gain: 0.55 }), n({ color: 'brown', dur: 0.16, gain: 0.45, filter: { type: 'lowpass', f: 520 } })] },
  jump: { vary: 0.12, layers: [n({ color: 'pink', dur: 0.14, gain: 0.2, atk: 0.03, filter: { type: 'bandpass', f: 650, q: 0.7 } })] },
  splash: { vary: 0.14, reverb: 0.2, layers: [n({ dur: 0.4, gain: 0.35, atk: 0.03, filter: { type: 'bandpass', f: 900, to: 2600, q: 0.8 } }), n({ color: 'pink', dur: 0.45, gain: 0.12, filter: { type: 'highpass', f: 3000 } })] },
  breath: { vary: 0.1, cooldown: 0.4, layers: [n({ color: 'pink', dur: 0.55, gain: 0.14, atk: 0.18, filter: { type: 'bandpass', f: 950, q: 0.6 } })] },
  heartbeat: { cooldown: 0.3, layers: [t({ from: 62, to: 40, dur: 0.16, gain: 0.55 }), t({ from: 56, to: 38, at: 0.19, dur: 0.15, gain: 0.38 })] },
  flash_click: { ui: true, layers: [t({ from: 2100, to: 1500, dur: 0.018, gain: 0.1, wave: 'square' }), n({ dur: 0.008, gain: 0.1, filter: { type: 'highpass', f: 6000 } })] },

  // --- Building and menus ---
  click: { ui: true, vary: 0.06, cooldown: 0.03, layers: [t({ from: 1900, to: 1250, dur: 0.04, gain: 0.2 }), n({ dur: 0.014, gain: 0.14, filter: { type: 'highpass', f: 5000 } })] },
  place: {
    vary: 0.1,
    reverb: 0.15,
    layers: [t({ from: 160, to: 70, dur: 0.2, gain: 0.55 }), n({ color: 'brown', dur: 0.14, gain: 0.4, filter: { type: 'lowpass', f: 800 } }), t({ from: 620, to: 930, at: 0.02, dur: 0.1, gain: 0.07, wave: 'triangle' }), n({ dur: 0.03, gain: 0.12, filter: { type: 'bandpass', f: 2600, q: 1 } })],
  },
  place_soft: { vary: 0.15, layers: [n({ color: 'pink', dur: 0.2, gain: 0.22, atk: 0.02, filter: { type: 'bandpass', f: 2800, q: 0.7 } }), t({ from: 720, to: 950, dur: 0.09, gain: 0.08 })] },
  delete: {
    vary: 0.12,
    reverb: 0.2,
    layers: [n({ dur: 0.34, gain: 0.38, filter: { type: 'bandpass', f: 800, to: 220, q: 0.7 } }), n({ color: 'brown', dur: 0.3, gain: 0.45, filter: { type: 'lowpass', f: 450 } }), t({ from: 125, to: 48, dur: 0.28, gain: 0.35 })],
  },
  select: { ui: true, layers: [t({ from: 1200, dur: 0.05, gain: 0.08 }), t({ from: 1800, at: 0.035, dur: 0.06, gain: 0.07 })] },
  undo: { ui: true, layers: [n({ color: 'pink', dur: 0.17, gain: 0.12, atk: 0.08, filter: { type: 'bandpass', f: 400, to: 2000, q: 0.9 } })] },
  error: { ui: true, layers: [t({ from: 170, to: 140, dur: 0.17, gain: 0.14, wave: 'square' }), t({ from: 150, to: 125, at: 0.13, dur: 0.2, gain: 0.14, wave: 'square' })] },
  token: {
    ui: true,
    reverb: 0.4,
    layers: [t({ from: 1318, dur: 0.5, gain: 0.2, fm: { ratio: 3.5, depth: 30 } }), t({ from: 1760, at: 0.09, dur: 0.6, gain: 0.17, fm: { ratio: 3.5, depth: 30 } }), t({ from: 2093, at: 0.18, dur: 0.8, gain: 0.14, fm: { ratio: 3.5, depth: 30 } })],
  },
  money: { vary: 0.05, reverb: 0.3, layers: [t({ from: 1568, dur: 0.07, gain: 0.14 }), t({ from: 2093, at: 0.06, dur: 0.35, gain: 0.14, fm: { ratio: 2.76, depth: 25 } })] },
  menu: { ui: true, layers: [t({ from: 640, to: 520, dur: 0.07, gain: 0.07, wave: 'triangle' })] },
  hammer: { vary: 0.12, reverb: 0.2, cooldown: 0.1, layers: [t({ from: 420, to: 240, dur: 0.07, gain: 0.3 }), n({ dur: 0.04, gain: 0.4, filter: { type: 'bandpass', f: 2600, q: 1.2 } }), t({ from: 1300, to: 1000, dur: 0.18, gain: 0.06, fm: { ratio: 2.4, depth: 60 } })] },
  saw: { vary: 0.1, cooldown: 0.2, layers: [n({ dur: 0.5, gain: 0.12, filter: { type: 'bandpass', f: 2100, q: 1.2 }, am: { rate: 22, depth: 0.7 } }), t({ from: 300, to: 330, dur: 0.5, gain: 0.04, wave: 'sawtooth' })] },
  drill: { vary: 0.1, cooldown: 0.3, layers: [t({ from: 180, to: 210, dur: 0.65, gain: 0.06, wave: 'sawtooth', am: { rate: 8, depth: 0.5 } }), n({ dur: 0.65, gain: 0.1, filter: { type: 'bandpass', f: 1500, q: 1 }, am: { rate: 30, depth: 0.6 } })] },

  // --- Vehicles (one-shots; engines are continuous, see vehicleAudio) ---
  car_door: { vary: 0.08, reverb: 0.2, layers: [n({ color: 'brown', dur: 0.14, gain: 0.7, filter: { type: 'lowpass', f: 420 } }), t({ from: 112, to: 62, dur: 0.16, gain: 0.5 }), n({ dur: 0.04, at: 0.012, gain: 0.2, filter: { type: 'highpass', f: 2600 } }), n({ dur: 0.03, at: 0.1, gain: 0.07, filter: { type: 'bandpass', f: 3200, q: 3 } })] },
  car_start: { reverb: 0.15, layers: [n({ color: 'brown', dur: 0.75, gain: 0.35, filter: { type: 'lowpass', f: 320 }, am: { rate: 15, depth: 0.85 } }), t({ from: 55, to: 100, dur: 0.65, gain: 0.12, wave: 'sawtooth', am: { rate: 15, depth: 0.7 } })] },
  car_horn: { cooldown: 0.12, layers: [t({ from: 392, dur: 0.32, gain: 0.1, wave: 'square' }), t({ from: 494, dur: 0.32, gain: 0.08, wave: 'square' })] },
  car_crash: {
    vary: 0.08,
    reverb: 0.45,
    cooldown: 0.15,
    layers: [n({ dur: 0.28, gain: 0.85, filter: { type: 'highpass', f: 1000 } }), n({ color: 'brown', dur: 0.45, gain: 0.9, filter: { type: 'lowpass', f: 520 } }), t({ from: 95, to: 33, dur: 0.4, gain: 0.85 }), n({ at: 0.02, dur: 0.3, gain: 0.3, filter: { type: 'bandpass', f: 3600, q: 1.5 }, am: { rate: 40, depth: 0.7 } })],
  },
  car_hit: { vary: 0.12, cooldown: 0.1, layers: [t({ from: 120, to: 50, dur: 0.18, gain: 0.7 }), n({ color: 'brown', dur: 0.14, gain: 0.55, filter: { type: 'lowpass', f: 650 } }), n({ dur: 0.05, gain: 0.2, filter: { type: 'bandpass', f: 1800, q: 1 } })] },
  car_skid: { vary: 0.1, cooldown: 0.3, layers: [n({ dur: 0.45, gain: 0.25, atk: 0.05, filter: { type: 'bandpass', f: 1500, to: 1050, q: 3 } }), t({ from: 920, to: 780, dur: 0.45, gain: 0.04, wave: 'sawtooth' })] },

  // --- Weather and creatures ---
  thunder: {
    reverb: 1,
    layers: [
      n({ dur: 0.14, gain: 0.55, filter: { type: 'highpass', f: 1800 } }),
      n({ color: 'brown', dur: 3.6, gain: 1, atk: 0.12, filter: { type: 'lowpass', f: 320, to: 70 } }),
      n({ color: 'pink', at: 0.1, dur: 3, gain: 0.5, atk: 0.2, filter: { type: 'lowpass', f: 700, to: 120 } }),
      n({ color: 'brown', at: 0.9, dur: 2.4, gain: 0.5, atk: 0.3, filter: { type: 'lowpass', f: 240, to: 60 } }),
    ],
  },
  roar: {
    vary: 0.1,
    reverb: 0.85,
    layers: [
      v({ f0: 118, f0To: 48, dur: 2.1, gain: 0.8, vowel: [520, 980, 2400], vib: { rate: 24, depth: 0.12 }, breath: 0.55, atk: 0.12 }),
      t({ from: 58, to: 36, dur: 2.1, gain: 0.4, wave: 'sawtooth', am: { rate: 17, depth: 0.5 } }),
      n({ dur: 2, gain: 0.34, atk: 0.2, filter: { type: 'bandpass', f: 420, to: 1500, q: 0.7 }, am: { rate: 13, depth: 0.5 } }),
    ],
  },
  rex_roar: {
    vary: 0.1,
    reverb: 0.8,
    layers: [
      v({ f0: 78, f0To: 36, dur: 1.8, gain: 0.85, vowel: [480, 900, 2300], vib: { rate: 19, depth: 0.1 }, breath: 0.5, atk: 0.1 }),
      t({ from: 40, to: 30, dur: 1.8, gain: 0.45, wave: 'sawtooth', am: { rate: 12, depth: 0.55 } }),
      n({ color: 'brown', dur: 1.7, gain: 0.5, filter: { type: 'lowpass', f: 380, to: 120 } }),
    ],
  },
  raptor: {
    vary: 0.16,
    reverb: 0.5,
    layers: [v({ f0: 1700, f0To: 2700, dur: 0.7, gain: 0.22, vowel: [1200, 2200, 3300], vib: { rate: 32, depth: 0.1 }, breath: 0.2, atk: 0.02 }), n({ dur: 0.5, gain: 0.07, filter: { type: 'highpass', f: 4200 } })],
  },
  fire: { vary: 0.1, reverb: 0.3, layers: [n({ color: 'pink', dur: 0.9, gain: 0.5, atk: 0.12, filter: { type: 'bandpass', f: 520, to: 1000, q: 0.8 }, am: { rate: 18, depth: 0.45 } }), n({ dur: 0.8, gain: 0.12, filter: { type: 'highpass', f: 3500 }, am: { rate: 31, depth: 0.8 } })] },
  chat: { vary: 0.3, cooldown: 0.4, layers: [v({ f0: 130, f0To: 150, dur: 0.22, gain: 0.05, vowel: [600, 1100, 2500], atk: 0.04 }), v({ f0: 150, f0To: 120, at: 0.24, dur: 0.2, gain: 0.04, vowel: [400, 1900, 2600], atk: 0.04 })] },
};

const lastPlayed = new Map<Sfx, number>();

/** Builds one layer into the output chain. `rate` is this play's pitch variation. */
function build(g: Graph, out: AudioNode, layer: Layer, now: number, rate: number) {
  const { ctx } = g;
  const start = now + (layer.at ?? 0);
  const gain = ctx.createGain();
  gain.connect(out);
  const atk = layer.atk ?? 0.002;

  const envelope = (dur: number, peak: number) => {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + Math.max(0.001, atk));
    gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);
  };
  const modulate = (node: AudioNode, am: { rate: number; depth: number } | undefined, base: number) => {
    // Tremolo: a low-frequency oscillator wobbles the amplitude of `node`.
    if (!am) return node;
    const wobble = ctx.createGain();
    wobble.gain.value = base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = am.rate * rate;
    const depth = ctx.createGain();
    depth.gain.value = am.depth * base * 0.5;
    wobble.gain.value = base * (1 - am.depth * 0.5);
    lfo.connect(depth);
    depth.connect(wobble.gain);
    lfo.start(start);
    lfo.stop(start + layer.dur + 0.05);
    node.connect(wobble);
    return wobble;
  };

  if (layer.kind === 'n') {
    const src = ctx.createBufferSource();
    src.buffer = g.noise[layer.color ?? 'white'];
    src.loop = true;
    let node: AudioNode = src;
    if (layer.filter) {
      const f = ctx.createBiquadFilter();
      f.type = layer.filter.type;
      f.Q.value = layer.filter.q ?? 0.7;
      f.frequency.setValueAtTime(layer.filter.f * rate, start);
      if (layer.filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, layer.filter.to * rate), start + layer.dur);
      node.connect(f);
      node = f;
    }
    node = modulate(node, layer.am, 1);
    node.connect(gain);
    envelope(layer.dur, layer.gain);
    src.start(start, Math.random() * 1.5);
    src.stop(start + layer.dur + 0.05);
  } else if (layer.kind === 't') {
    const osc = ctx.createOscillator();
    osc.type = layer.wave ?? 'sine';
    osc.frequency.setValueAtTime(layer.from * rate, start);
    if (layer.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.to * rate), start + layer.dur);
    if (layer.fm) {
      const mod = ctx.createOscillator();
      mod.frequency.value = layer.from * layer.fm.ratio * rate;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(layer.fm.depth, start);
      depth.gain.exponentialRampToValueAtTime(1, start + layer.dur);
      mod.connect(depth);
      depth.connect(osc.frequency);
      mod.start(start);
      mod.stop(start + layer.dur + 0.05);
    }
    modulate(osc, layer.am, 1).connect(gain);
    envelope(layer.dur, layer.gain);
    osc.start(start);
    osc.stop(start + layer.dur + 0.05);
  } else {
    // A voice: sawtooth buzz through three parallel band-pass filters set to the vowel's formants.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(layer.f0 * rate, start);
    if (layer.f0To) osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.f0To * rate), start + layer.dur);
    if (layer.vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = layer.vib.rate;
      const depth = ctx.createGain();
      depth.gain.value = layer.f0 * layer.vib.depth;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + layer.dur + 0.05);
    }
    const formants = ctx.createGain();
    formants.gain.value = 1;
    layer.vowel.forEach((f, i) => {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f * (0.96 + Math.random() * 0.08);
      band.Q.value = 6 - i;
      const level = ctx.createGain();
      level.gain.value = [1, 0.7, 0.35][i];
      osc.connect(band);
      band.connect(level);
      level.connect(formants);
    });
    if (layer.breath) {
      const noise = ctx.createBufferSource();
      noise.buffer = g.noise.white;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = layer.vowel[1];
      band.Q.value = 0.9;
      const level = ctx.createGain();
      level.gain.value = layer.breath * 0.6;
      noise.connect(band);
      band.connect(level);
      level.connect(formants);
      noise.start(start);
      noise.stop(start + layer.dur + 0.05);
    }
    formants.connect(gain);
    envelope(layer.dur, layer.gain * 2.2);
    osc.start(start);
    osc.stop(start + layer.dur + 0.05);
  }
}

/**
 * Plays a sound. `volume` scales it. Give `at` for something that sounds from a place in the
 * world: it is then panned in 3D and fades with distance by itself.
 */
export function playSfx(kind: Sfx, volume = 1, at?: At) {
  if (volume <= 0.02) return;
  const g = audio();
  if (!g || !voiceFree()) return;
  const recipe = RECIPES[kind];
  const now = g.ctx.currentTime;
  if (now - (lastPlayed.get(kind) ?? -1) < (recipe.cooldown ?? 0.05)) return;
  lastPlayed.set(kind, now);

  const rate = 1 + (Math.random() - 0.5) * (recipe.vary ?? 0.04) * 2;
  const duration = Math.max(...recipe.layers.map((l) => (l.at ?? 0) + l.dur)) + 0.1;

  const level = g.ctx.createGain();
  level.gain.value = volume;
  const bus = recipe.ui ? g.buses.ui : g.buses.effects;
  let panner: PannerNode | null = null;
  if (at) {
    panner = makePanner(g, at);
    level.connect(panner);
    panner.connect(bus);
  } else {
    level.connect(bus);
  }
  if (recipe.reverb) {
    const send = g.ctx.createGain();
    send.gain.value = recipe.reverb * (at ? 1.15 : 1);
    level.connect(send);
    send.connect(g.reverbIn);
    window.setTimeout(() => send.disconnect(), (duration + 3) * 1000);
  }
  for (const layer of recipe.layers) build(g, level, layer, now, rate);
  holdVoice(duration);
  window.setTimeout(() => {
    level.disconnect();
    panner?.disconnect();
  }, (duration + 0.5) * 1000);
}
