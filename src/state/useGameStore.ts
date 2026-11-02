import { create } from 'zustand';
import type { Density } from '../sim/simulation';

/** Build = orbiting city-builder camera; roam = first-person walk / fly through the city. */
export type AppMode = 'build' | 'roam';
/** peaceful: just explore. normal: street crime (muggers, angry locals) and weapons. survival: day and night threats, hide and survive. */
export type RoamSubMode = 'peaceful' | 'normal' | 'survival';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  /** The preset last picked; `custom` once any single option has been changed by hand. */
  preset: QualityPreset | 'custom';
  drawDistance: number; // in chunks (16 world units each); sets fog/clip distance in walk mode
  shadows: boolean;
  /** Redraw the shadow map every Nth frame (2 halves the shadow cost; moving things stay smooth). */
  shadowRate: 1 | 2;
  textureQuality: 'low' | 'medium' | 'high';
  /** How many cars and people fill the streets. */
  population: Density;
  /** Lower the render resolution automatically when the frame rate drops, raise it again when there is room. */
  adaptive: boolean;
  showFps: boolean;
  /** Night glow: lit windows, signs and lamps bloom softly. Costs some speed on weak GPUs. */
  bloom: boolean;
  /** Gentle camera sway while walking. */
  headBob: boolean;
}

interface GameState {
  mode: AppMode;
  roamSubMode: RoamSubMode;
  graphics: GraphicsSettings;
  /** Fly mode (walk view): no gravity, Space ascends, Shift descends. Toggled with F. */
  flying: boolean;
  setMode: (mode: AppMode) => void;
  setRoamSubMode: (sub: RoamSubMode) => void;
  setGraphics: (patch: Partial<GraphicsSettings>) => void;
  setPreset: (preset: QualityPreset) => void;
  toggleFlying: () => void;
}

/** Phones and tablets start with lighter graphics so they run smoothly; the player can raise them. */
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

type PresetValues = Pick<GraphicsSettings, 'drawDistance' | 'shadows' | 'shadowRate' | 'textureQuality' | 'population'>;

export const PRESETS: Record<QualityPreset, PresetValues> = {
  low: { drawDistance: 5, shadows: false, shadowRate: 2, textureQuality: 'low', population: 'low' },
  medium: { drawDistance: 8, shadows: true, shadowRate: isCoarsePointer ? 2 : 1, textureQuality: 'medium', population: 'normal' },
  high: { drawDistance: 12, shadows: true, shadowRate: 1, textureQuality: 'high', population: 'busy' },
};

const startPreset: QualityPreset = isCoarsePointer ? 'low' : 'medium';
const GRAPHICS_KEY = 'apnagali.graphics.v1';

/** Graphics choices survive a reload (this device only). */
function savedGraphics(): Partial<GraphicsSettings> {
  try {
    const raw = JSON.parse(localStorage.getItem(GRAPHICS_KEY) ?? 'null') as Partial<GraphicsSettings> | null;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export const useGameStore = create<GameState>((set) => ({
  mode: 'build',
  roamSubMode: 'peaceful',
  graphics: { ...PRESETS[startPreset], preset: startPreset, adaptive: true, showFps: false, bloom: !isCoarsePointer, headBob: true, ...savedGraphics() },
  flying: false,
  setMode: (mode) => set({ mode }),
  setRoamSubMode: (roamSubMode) => set({ roamSubMode }),
  setGraphics: (patch) =>
    set((state) => {
      // Toggling the resolution governor or the FPS meter does not make the preset "custom".
      const changesLook = Object.keys(patch).some((k) => k !== 'adaptive' && k !== 'showFps' && k !== 'preset' && k !== 'bloom' && k !== 'headBob');
      return { graphics: { ...state.graphics, ...(changesLook ? { preset: 'custom' as const } : {}), ...patch } };
    }),
  setPreset: (preset) => set((state) => ({ graphics: { ...state.graphics, ...PRESETS[preset], preset } })),
  toggleFlying: () => set((state) => ({ flying: !state.flying })),
}));

useGameStore.subscribe((state, prev) => {
  if (state.graphics === prev.graphics) return;
  try {
    localStorage.setItem(GRAPHICS_KEY, JSON.stringify(state.graphics));
  } catch {
    /* storage blocked: settings just will not be remembered */
  }
});
