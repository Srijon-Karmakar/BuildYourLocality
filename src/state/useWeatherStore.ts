import { create } from 'zustand';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
/** `auto` lets the sky change by itself; otherwise the chosen weather is held. */
export type WeatherSetting = 'auto' | WeatherKind;
/** How fast a day passes. */
export type TimeSpeed = 'off' | 'slow' | 'normal' | 'fast';

/** Game hours per real second. */
export const TIME_RATE: Record<TimeSpeed, number> = {
  off: 0,
  slow: 24 / (20 * 60), // a 20 minute day
  normal: 24 / (8 * 60),
  fast: 24 / (2 * 60),
};

interface WeatherState {
  /** The hour last set by the player or saved; the live clock is `atmo.hour`. */
  hour: number;
  /** Bumped whenever the player sets the hour, so the clock knows to jump to it. */
  hourSet: number;
  speed: TimeSpeed;
  weather: WeatherSetting;
  setHour: (hour: number) => void;
  setSpeed: (speed: TimeSpeed) => void;
  setWeather: (weather: WeatherSetting) => void;
}

const KEY = 'apnagali.sky.v1';

interface Saved {
  hour: number;
  speed: TimeSpeed;
  weather: WeatherSetting;
}

const SPEEDS: TimeSpeed[] = ['off', 'slow', 'normal', 'fast'];
const WEATHERS: WeatherSetting[] = ['auto', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

function load(): Saved {
  const fallback: Saved = { hour: 10, speed: 'slow', weather: 'clear' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw) return fallback;
    return {
      hour: typeof raw.hour === 'number' && Number.isFinite(raw.hour) ? ((raw.hour % 24) + 24) % 24 : fallback.hour,
      speed: SPEEDS.includes(raw.speed as TimeSpeed) ? (raw.speed as TimeSpeed) : fallback.speed,
      weather: WEATHERS.includes(raw.weather as WeatherSetting) ? (raw.weather as WeatherSetting) : fallback.weather,
    };
  } catch {
    return fallback;
  }
}

export function saveSky(saved: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* private mode / storage blocked: the sky just will not be remembered */
  }
}

const initial = load();

export const useWeatherStore = create<WeatherState>((set) => ({
  hour: initial.hour,
  hourSet: 0,
  speed: initial.speed,
  weather: initial.weather,
  setHour: (hour) => set((s) => ({ hour: ((hour % 24) + 24) % 24, hourSet: s.hourSet + 1 })),
  setSpeed: (speed) => set({ speed }),
  setWeather: (weather) => set({ weather }),
}));
