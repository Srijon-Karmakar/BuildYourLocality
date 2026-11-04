import { create } from 'zustand';
import { useWorldsStore } from './useWorldsStore';
import type { Density } from '../sim/simulation';
import { isPractice } from '../tutorial/runtime';

/** Build = orbiting city-builder camera; roam = first-person walk / fly through the city. */
export type AppMode = 'build' | 'roam';
/** peaceful: just explore. normal: street crime (muggers, angry locals) and weapons. survival: day and night threats, hide and survive. */
export type RoamSubMode = 'peaceful' | 'normal' | 'survival';

export type QualityPreset = 'low' | 'medium' | 'high';
export type VisualPreset = 'classic' | 'sunset';

export interface GraphicsSettings {
  /** The preset last picked; `custom` once any single option has been changed by hand. */
  preset: QualityPreset | 'custom';
  /** Visual art style preset: 'classic' or 'sunset' (stylised low-poly sunset aesthetic). */
  visualPreset: VisualPreset;
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
  /** The stylised look: warm sunset colours, chunky faceted people, rounded cars. */
  stylised: boolean;
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
const LOOK_RESET_KEY = 'apnagali.look.classic.v1';
const GRAPHICS_KEY = 'apnagali.graphics.v1';

/** Graphics choices survive a reload (this device only). */
function savedGraphics(): Partial<GraphicsSettings> {
  try {
    const raw = JSON.parse(localStorage.getItem(GRAPHICS_KEY) ?? 'null') as Partial<GraphicsSettings> | null;
    const saved = raw && typeof raw === 'object' ? raw : {};
    // The classic (realistic) look is the default: a sunset look saved by an earlier version is reset once.
    if (!isPractice && localStorage.getItem(LOOK_RESET_KEY) !== '1') {
      localStorage.setItem(LOOK_RESET_KEY, '1');
      delete saved.visualPreset;
      delete saved.stylised;
    }
    return saved;
  } catch {
    return {};
  }
}

export const useGameStore = create<GameState>((set) => {
  const saved = savedGraphics();
  const initialVisual: VisualPreset = saved.visualPreset ?? (saved.stylised ? 'sunset' : 'classic');
  const initialStylised = saved.stylised ?? initialVisual === 'sunset';
  return {
    mode: 'build',
    roamSubMode: 'peaceful',
    graphics: {
      ...PRESETS[startPreset],
      preset: startPreset,
      visualPreset: initialVisual,
      adaptive: true,
      showFps: false,
      bloom: !isCoarsePointer,
      headBob: true,
      stylised: initialStylised,
      ...saved,
    },
    flying: false,
    // A world that can only be explored (community world with building turned off) never enters build mode.
    setMode: (mode) => set({ mode: mode === 'build' && useWorldsStore.getState().readOnly ? 'roam' : mode }),
    setRoamSubMode: (roamSubMode) => set({ roamSubMode }),
    setGraphics: (patch) =>
      set((state) => {
        const resolvedPatch = { ...patch };
        if (resolvedPatch.visualPreset !== undefined && resolvedPatch.stylised === undefined) {
          resolvedPatch.stylised = resolvedPatch.visualPreset === 'sunset';
        } else if (resolvedPatch.stylised !== undefined && resolvedPatch.visualPreset === undefined) {
          resolvedPatch.visualPreset = resolvedPatch.stylised ? 'sunset' : 'classic';
        }
        // Toggling the resolution governor, FPS meter or visual look does not make the preset "custom".
        const changesLook = Object.keys(resolvedPatch).some(
          (k) =>
            k !== 'adaptive' &&
            k !== 'showFps' &&
            k !== 'preset' &&
            k !== 'bloom' &&
            k !== 'headBob' &&
            k !== 'stylised' &&
            k !== 'visualPreset',
        );
        return { graphics: { ...state.graphics, ...(changesLook ? { preset: 'custom' as const } : {}), ...resolvedPatch } };
      }),
    setPreset: (preset) => set((state) => ({ graphics: { ...state.graphics, ...PRESETS[preset], preset } })),
    toggleFlying: () => set((state) => ({ flying: !state.flying })),
  };
});

useGameStore.subscribe((state, prev) => {
  if (isPractice) return;
  if (state.graphics === prev.graphics) return;
  try {
    localStorage.setItem(GRAPHICS_KEY, JSON.stringify(state.graphics));
  } catch {
    /* storage blocked: settings just will not be remembered */
  }
});
