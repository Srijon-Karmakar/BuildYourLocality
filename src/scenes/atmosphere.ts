import * as THREE from 'three';
import { applyLevels } from '../city/nightLights';
import { useGameStore } from '../state/useGameStore';
import { TIME_RATE, saveSky, useWeatherStore, type WeatherKind } from '../state/useWeatherStore';

/**
 * The sky's live state: time of day and weather, advanced every frame by `updateAtmosphere`.
 * A plain mutable object (like `viewState`) so the lights, sky shader, particles and lamps all
 * read it without going through React.
 */

interface WeatherLevels {
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  storm: number;
}

const TARGETS: Record<WeatherKind, WeatherLevels> = {
  clear: { cloud: 0.1, rain: 0, snow: 0, fog: 0, storm: 0 },
  cloudy: { cloud: 0.75, rain: 0, snow: 0, fog: 0, storm: 0 },
  rain: { cloud: 0.92, rain: 0.7, snow: 0, fog: 0.15, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.25, storm: 1 },
  snow: { cloud: 0.85, rain: 0, snow: 1, fog: 0.25, storm: 0 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1, storm: 0 },
};

/** Chance weights when the weather is on auto. */
const AUTO_ODDS: [WeatherKind, number][] = [
  ['clear', 40],
  ['cloudy', 24],
  ['rain', 15],
  ['fog', 8],
  ['snow', 7],
  ['storm', 6],
];

export const atmo = {
  /** Game clock, 0..24. */
  hour: 10,
  /** Game hours per real second that overrides the player's day-length setting (monster nights run on their own clock). */
  rateOverride: null as number | null,
  /** Real seconds, for animating shaders. */
  time: 0,
  kind: 'clear' as WeatherKind,

  sunDir: new THREE.Vector3(0, 1, 0),
  moonDir: new THREE.Vector3(0, -1, 0),
  /** Sine of the sun's elevation: 1 overhead, 0 on the horizon, negative at night. */
  sunHeight: 1,
  /** 0 night .. 1 full day. */
  daylight: 1,
  /** 1 as the sun crosses the horizon, fading to 0 either side. */
  twilight: 0,
  /** Street and vehicle lights, 0..1. */
  lamps: 0,
  /** Lit windows, 0..1. */
  windows: 0,
  /** How busy the streets are (quiet at night and in bad weather). */
  crowd: 1,
  /** 0..1: the stylised look's warm orange grade (eases in and out). */
  warm: 0,

  cloud: 0.1,
  rain: 0,
  snow: 0,
  fog: 0,
  storm: 0,
  /** Rain-soaked ground, builds up in the rain and dries slowly. */
  wet: 0,
  /** Lightning flash, decays quickly. */
  flash: 0,
  windX: 0.6,
  windZ: 0.25,

  horizon: new THREE.Color('#bfdcf2'),
  zenith: new THREE.Color('#3f7fc4'),
  cloudColor: new THREE.Color('#ffffff'),
  sunColor: new THREE.Color('#fff0d6'),
  skyLight: new THREE.Color('#bcd8ff'),
  groundLight: new THREE.Color('#6b5a43'),
  sunIntensity: 3.2,
  moonIntensity: 0,
  hemiIntensity: 0.55,
  /** Direction and strength of whichever body is casting shadows right now. */
  lightDir: new THREE.Vector3(0.6, 0.6, 0.4),
  lightColor: new THREE.Color('#fff0d6'),
  lightIntensity: 3.2,
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const approach = (cur: number, target: number, rate: number) => cur + (target - cur) * Math.min(1, rate);

const NIGHT_H = new THREE.Color('#0d1530');
const NIGHT_Z = new THREE.Color('#02040c');
const TWILIGHT_H = new THREE.Color('#f2985f');
const TWILIGHT_Z = new THREE.Color('#32487f');
const DAY_H = new THREE.Color('#bfdcf2');
const DAY_Z = new THREE.Color('#3f7fc4');
const GREY = new THREE.Color();
const FOG_TINT = new THREE.Color('#cdd3d9');
const SNOW_TINT = new THREE.Color('#d8dde3');
const HEMI_SKY_DAY = new THREE.Color('#bcd8ff');
const HEMI_SKY_NIGHT = new THREE.Color('#1a2850');
const HEMI_GROUND_DAY = new THREE.Color('#6b5a43');
const HEMI_GROUND_NIGHT = new THREE.Color('#0b0d16');
const SUN_LOW = new THREE.Color('#ff9a55');
const SUN_HIGH = new THREE.Color('#fff0d6');
const MOON = new THREE.Color('#9db4ff');
const CLOUD_DAY = new THREE.Color('#ffffff');
const CLOUD_NIGHT = new THREE.Color('#1b2236');
const CLOUD_DUSK = new THREE.Color('#ffb98a');
const CLOUD_STORM = new THREE.Color('#4a5563');
const WARM_H = new THREE.Color('#ffa44a');
const WARM_Z = new THREE.Color('#e27a32');
const WARM_SUN = new THREE.Color('#ffe2b0');
const WARM_SKY = new THREE.Color('#ffd0a2');
const WARM_GROUND = new THREE.Color('#624f74');
const WARM_CLOUD = new THREE.Color('#ffd2aa');

let autoTimer = 0;
let autoKind: WeatherKind = 'clear';
let flashTimer = 8;
let secondPulse = 0;
let saveTimer = 0;
let lastHourSet = -1;

function pickWeather(): WeatherKind {
  const total = AUTO_ODDS.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [kind, w] of AUTO_ODDS) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return 'clear';
}

/** Where the sun and moon are at this hour. Sunrise 6:00, noon 12:00, sunset 18:00. */
export function sunPosition(hour: number, out: THREE.Vector3): number {
  const a = ((hour - 6) / 12) * Math.PI;
  out.set(Math.cos(a) * 0.92, Math.sin(a) * 0.95, 0.38).normalize();
  return out.y;
}

/** Advances the clock and weather by `dt` real seconds and refreshes every derived value. */
export function updateAtmosphere(dt: number) {
  const settings = useWeatherStore.getState();
  dt = Math.min(dt, 0.1);
  atmo.time += dt;

  // --- Clock ---------------------------------------------------------------------------
  if (settings.hourSet !== lastHourSet) {
    lastHourSet = settings.hourSet;
    atmo.hour = settings.hour;
  }
  atmo.hour = (atmo.hour + (atmo.rateOverride ?? TIME_RATE[settings.speed]) * dt) % 24;

  // --- Weather -------------------------------------------------------------------------
  let kind: WeatherKind;
  if (settings.weather === 'auto') {
    autoTimer -= dt;
    if (autoTimer <= 0) {
      autoTimer = 90 + Math.random() * 180;
      autoKind = pickWeather();
    }
    kind = autoKind;
  } else {
    kind = settings.weather;
  }
  atmo.kind = kind;
  const target = TARGETS[kind];
  const rate = dt * 0.18; // about 15 s to settle into a new weather
  atmo.cloud = approach(atmo.cloud, target.cloud, rate);
  atmo.rain = approach(atmo.rain, target.rain, rate * 1.4);
  atmo.snow = approach(atmo.snow, target.snow, rate * 1.4);
  atmo.fog = approach(atmo.fog, target.fog, rate);
  atmo.storm = approach(atmo.storm, target.storm, rate);
  // Ground soaks up rain quickly and dries over a minute or so.
  atmo.wet = approach(atmo.wet, Math.min(1, atmo.rain * 1.4), atmo.rain > atmo.wet ? dt * 0.3 : dt * 0.018);
  atmo.windX = 0.6 + atmo.storm * 1.4;
  atmo.windZ = 0.25 + atmo.storm * 0.5;

  // Lightning: random double flashes while the storm is on.
  atmo.flash *= Math.exp(-dt * 7);
  if (atmo.storm > 0.5) {
    flashTimer -= dt;
    if (secondPulse > 0) {
      secondPulse -= dt;
      if (secondPulse <= 0) atmo.flash = 0.75;
    }
    if (flashTimer <= 0) {
      flashTimer = 5 + Math.random() * 12;
      atmo.flash = 1;
      secondPulse = Math.random() < 0.6 ? 0.14 : 0;
    }
  }

  // --- Sun, moon and daylight ----------------------------------------------------------
  const s = sunPosition(atmo.hour, atmo.sunDir);
  atmo.sunHeight = s;
  atmo.moonDir.set(-atmo.sunDir.x, -atmo.sunDir.y, 0.3 - atmo.sunDir.z * 0.5).normalize();
  atmo.daylight = smooth(-0.14, 0.42, s);
  atmo.twilight = Math.max(0, 1 - Math.abs(s) / 0.25);

  const gloom = Math.min(1, atmo.cloud * 0.6 + atmo.rain * 0.4 + atmo.fog * 0.2);
  atmo.lamps = 1 - smooth(0.02, 0.28, s - 0.16 * gloom);
  atmo.windows = 1 - smooth(-0.02, 0.2, s - 0.1 * gloom);
  atmo.crowd = (0.4 + 0.6 * smooth(-0.05, 0.3, s)) * (1 - 0.35 * Math.max(atmo.rain, atmo.snow * 0.6));

  // --- Sky colours ---------------------------------------------------------------------
  const a = smooth(-0.2, -0.02, s);
  const b = smooth(0.0, 0.35, s);
  atmo.horizon.copy(NIGHT_H).lerp(TWILIGHT_H, a).lerp(DAY_H, b);
  atmo.zenith.copy(NIGHT_Z).lerp(TWILIGHT_Z, a).lerp(DAY_Z, b);

  // Overcast skies drain the colour; rain darkens them; fog and snow whiten the horizon.
  const lum = (c: THREE.Color) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  const grey = Math.min(1, atmo.cloud * 0.75 + atmo.rain * 0.2);
  GREY.setScalar(lum(atmo.horizon) * (1 - 0.3 * atmo.rain - 0.2 * atmo.storm));
  atmo.horizon.lerp(GREY, grey);
  GREY.setScalar(lum(atmo.zenith) * 1.6 * (1 - 0.35 * atmo.rain - 0.25 * atmo.storm));
  atmo.zenith.lerp(GREY, grey);
  const haze = Math.max(atmo.fog, atmo.snow * 0.6);
  const hazeTone = atmo.daylight * 0.8 + 0.12 + atmo.twilight * 0.15;
  atmo.horizon.lerp(GREY.copy(atmo.snow > atmo.fog ? SNOW_TINT : FOG_TINT).multiplyScalar(hazeTone), haze * 0.85);
  atmo.zenith.lerp(GREY.copy(FOG_TINT).multiplyScalar(hazeTone), haze * 0.7);

  // The stylised look pulls the daytime sky towards a warm orange haze (it fades away at night and in storms).
  atmo.warm = approach(atmo.warm, useGameStore.getState().graphics.stylised ? 1 : 0, dt * 1.5);
  if (atmo.warm > 0.001) {
    const k = atmo.warm * (0.35 + 0.65 * atmo.daylight) * (1 - 0.6 * Math.max(atmo.storm, atmo.rain * 0.6));
    atmo.horizon.lerp(WARM_H, 0.82 * k * (1 - haze * 0.6));
    atmo.zenith.lerp(WARM_Z, 0.72 * k * (1 - haze * 0.6));
  }

  atmo.cloudColor.copy(CLOUD_NIGHT).lerp(CLOUD_DAY, atmo.daylight).lerp(CLOUD_DUSK, atmo.twilight * 0.55 * (1 - atmo.storm));
  atmo.cloudColor.lerp(WARM_CLOUD, 0.5 * atmo.warm * atmo.daylight * (1 - atmo.storm));
  atmo.cloudColor.lerp(CLOUD_STORM, Math.max(atmo.storm * 0.7, atmo.rain * 0.4) * (0.35 + 0.65 * atmo.daylight));

  // --- Lights --------------------------------------------------------------------------
  atmo.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0.05, 0.45, s));
  atmo.sunColor.lerp(WARM_SUN, 0.55 * atmo.warm);
  const overcast = 1 - 0.78 * atmo.cloud - 0.15 * atmo.fog;
  atmo.sunIntensity = 3.2 * smooth(-0.03, 0.22, s) * Math.max(0.05, overcast);
  const moonUp = smooth(0, 0.15, atmo.moonDir.y) * (1 - smooth(-0.1, 0.12, s));
  atmo.moonIntensity = 0.6 * moonUp * (1 - 0.6 * atmo.cloud);

  atmo.skyLight.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, atmo.daylight);
  atmo.groundLight.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, atmo.daylight);
  atmo.skyLight.lerp(WARM_SKY, 0.45 * atmo.warm * atmo.daylight);
  atmo.groundLight.lerp(WARM_GROUND, 0.5 * atmo.warm * atmo.daylight);
  atmo.hemiIntensity = 0.4 + 0.15 * atmo.daylight + 0.14 * atmo.cloud * atmo.daylight + 0.1 * atmo.twilight + atmo.flash * 2.2;

  // One shadow-casting directional light: the sun by day, the moon by night. Both are dim
  // as they cross the horizon so the hand-over is invisible. Kept above the horizon so the
  // shadow frustum never has to stretch to infinity.
  const useSun = s > -0.02 || atmo.moonDir.y <= 0;
  if (useSun) {
    atmo.lightDir.copy(atmo.sunDir);
    atmo.lightColor.copy(atmo.sunColor);
    atmo.lightIntensity = atmo.sunIntensity;
  } else {
    atmo.lightDir.copy(atmo.moonDir);
    atmo.lightColor.copy(MOON);
    atmo.lightIntensity = atmo.moonIntensity;
  }
  if (atmo.lightDir.y < 0.2) {
    atmo.lightDir.y = 0.2;
    atmo.lightDir.normalize();
  }
  atmo.lightIntensity += atmo.flash * 1.4;

  // --- Materials -----------------------------------------------------------------------
  applyLevels({
    lamps: atmo.lamps,
    windows: atmo.windows,
    wet: atmo.wet,
    reflect: (0.12 + 0.88 * atmo.daylight) * (1 - 0.45 * atmo.cloud),
  });

  // Remember where the clock got to.
  saveTimer -= dt;
  if (saveTimer <= 0) {
    saveTimer = 5;
    saveSky({ hour: atmo.hour, speed: settings.speed, weather: settings.weather });
  }
}

// Start the clock where the player left it.
atmo.hour = useWeatherStore.getState().hour;
sunPosition(atmo.hour, atmo.sunDir);

/** "7:05 AM" style label for the HUD. */
export function formatHour(hour: number): string {
  const total = Math.floor(hour * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
