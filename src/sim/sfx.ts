/**
 * Tiny synthesised sound effects (no audio files): short noise bursts and tones made with the
 * Web Audio API. Browsers only allow audio after a tap or key press, which always happens first.
 */

export type Sfx = 'swing' | 'punch' | 'bat' | 'shot' | 'shotgun' | 'taser' | 'empty' | 'hurt' | 'pickup' | 'growl' | 'scream' | 'door' | 'win' | 'lose' | 'alert';

const KEY = 'apnagali.sound';

let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  /* storage blocked: sound stays on */
}

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed = new Map<Sfx, number>();

export const isSoundOn = () => enabled;
export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Burst {
  /** Noise burst: length (s), filter frequency (Hz), volume. */
  noise?: { len: number; freq: number; vol: number; q?: number; type?: BiquadFilterType };
  /** Tone: start / end frequency (Hz), length (s), volume, waveform. */
  tone?: { from: number; to: number; len: number; vol: number; wave?: OscillatorType };
}

const SOUNDS: Record<Sfx, Burst[]> = {
  swing: [{ noise: { len: 0.18, freq: 1400, vol: 0.18, type: 'bandpass', q: 0.8 } }],
  punch: [{ noise: { len: 0.1, freq: 500, vol: 0.5, type: 'lowpass' } }, { tone: { from: 140, to: 60, len: 0.12, vol: 0.4, wave: 'sine' } }],
  bat: [{ noise: { len: 0.12, freq: 900, vol: 0.5, type: 'lowpass' } }, { tone: { from: 220, to: 90, len: 0.14, vol: 0.45, wave: 'triangle' } }],
  shot: [{ noise: { len: 0.22, freq: 2600, vol: 0.7, type: 'lowpass' } }, { tone: { from: 160, to: 45, len: 0.18, vol: 0.5, wave: 'square' } }],
  shotgun: [{ noise: { len: 0.4, freq: 1800, vol: 0.9, type: 'lowpass' } }, { tone: { from: 110, to: 30, len: 0.3, vol: 0.6, wave: 'sawtooth' } }],
  taser: [{ tone: { from: 1400, to: 300, len: 0.35, vol: 0.25, wave: 'sawtooth' } }, { noise: { len: 0.3, freq: 5000, vol: 0.25, type: 'highpass' } }],
  empty: [{ tone: { from: 900, to: 700, len: 0.04, vol: 0.2, wave: 'square' } }],
  hurt: [{ tone: { from: 180, to: 70, len: 0.25, vol: 0.5, wave: 'sawtooth' } }, { noise: { len: 0.12, freq: 600, vol: 0.3, type: 'lowpass' } }],
  pickup: [{ tone: { from: 600, to: 1100, len: 0.14, vol: 0.25, wave: 'sine' } }],
  growl: [{ tone: { from: 90, to: 55, len: 0.7, vol: 0.5, wave: 'sawtooth' } }, { noise: { len: 0.6, freq: 300, vol: 0.3, type: 'lowpass' } }],
  scream: [{ tone: { from: 900, to: 1500, len: 0.5, vol: 0.18, wave: 'sawtooth' } }, { tone: { from: 1500, to: 800, len: 0.3, vol: 0.12, wave: 'triangle' } }],
  door: [{ noise: { len: 0.2, freq: 300, vol: 0.5, type: 'lowpass' } }, { tone: { from: 90, to: 60, len: 0.2, vol: 0.4, wave: 'sine' } }],
  win: [{ tone: { from: 520, to: 780, len: 0.3, vol: 0.3, wave: 'triangle' } }, { tone: { from: 780, to: 1040, len: 0.5, vol: 0.3, wave: 'triangle' } }],
  lose: [{ tone: { from: 300, to: 80, len: 1.0, vol: 0.4, wave: 'sawtooth' } }],
  alert: [{ tone: { from: 700, to: 1000, len: 0.18, vol: 0.2, wave: 'square' } }],
};

/** Plays a sound. `volume` scales it (use less for far-away events); the same sound will not retrigger within 60 ms. */
export function playSfx(kind: Sfx, volume = 1) {
  if (!enabled || volume <= 0.02) return;
  const c = audio();
  if (!c || !noise) return;
  const now = c.currentTime;
  if (now - (lastPlayed.get(kind) ?? -1) < 0.06) return;
  lastPlayed.set(kind, now);
  for (const part of SOUNDS[kind]) {
    const gain = c.createGain();
    gain.connect(c.destination);
    if (part.noise) {
      const { len, freq, vol, q, type } = part.noise;
      const src = c.createBufferSource();
      src.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = type ?? 'lowpass';
      filter.frequency.value = freq;
      if (q) filter.Q.value = q;
      src.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(vol * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + len);
      src.start(now);
      src.stop(now + len + 0.02);
    }
    if (part.tone) {
      const { from, to, len, vol, wave } = part.tone;
      const osc = c.createOscillator();
      osc.type = wave ?? 'sine';
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + len);
      osc.connect(gain);
      gain.gain.setValueAtTime(vol * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + len);
      osc.start(now);
      osc.stop(now + len + 0.02);
    }
  }
}
