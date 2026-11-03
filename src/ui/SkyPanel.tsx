import { formatHour } from '../scenes/atmosphere';
import { useShopStore } from '../state/useShopStore';
import { useWalletStore } from '../state/useWalletStore';
import { FREE_WEATHER, useWeatherStore, type TimeSpeed, type WeatherSetting } from '../state/useWeatherStore';
import { Icon } from './icons';
import { WEATHER_ICONS, useClock } from './skyShared';

const WEATHERS: { id: WeatherSetting; label: string; icon: string }[] = [
  { id: 'auto', label: 'Auto', icon: 'auto' },
  { id: 'clear', label: 'Clear', icon: WEATHER_ICONS.clear },
  { id: 'cloudy', label: 'Cloudy', icon: WEATHER_ICONS.cloudy },
  { id: 'rain', label: 'Rain', icon: WEATHER_ICONS.rain },
  { id: 'storm', label: 'Storm', icon: WEATHER_ICONS.storm },
  { id: 'snow', label: 'Snow', icon: WEATHER_ICONS.snow },
  { id: 'fog', label: 'Fog', icon: WEATHER_ICONS.fog },
];

const TIMES = [
  { label: 'Dawn', icon: 'sunrise', hour: 6 },
  { label: 'Noon', icon: 'sun', hour: 12 },
  { label: 'Dusk', icon: 'sunset', hour: 18 },
  { label: 'Night', icon: 'moon', hour: 23 },
];

const SPEEDS: { id: TimeSpeed; label: string }[] = [
  { id: 'off', label: 'Paused' },
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
];

const chip = (active: boolean) =>
  `flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs transition sm:min-h-0 sm:py-1.5 ${
    active ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/25 sm:hover:bg-white/15'
  }`;

/** Time of day, how fast it passes, and the weather. */
export function SkyPanel() {
  const speed = useWeatherStore((s) => s.speed);
  const weather = useWeatherStore((s) => s.weather);
  const setHour = useWeatherStore((s) => s.setHour);
  const setSpeed = useWeatherStore((s) => s.setSpeed);
  const setWeather = useWeatherStore((s) => s.setWeather);
  const hour = useClock();
  const unlocks = useWalletStore((s) => s.unlocks);
  const timeLocked = !unlocks.includes('sky_pack');
  const weatherLocked = !unlocks.includes('weather_pack');
  const openShop = () => useShopStore.getState().show('sky');

  return (
    <div className="flex flex-col gap-3 text-xs text-white sm:gap-4 sm:text-sm">
      {(timeLocked || weatherLocked) && (
        <button onClick={openShop} className="flex items-center justify-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-black active:bg-amber-300">
          <Icon name="lock" />
          {timeLocked && weatherLocked ? 'Unlock time and weather in the shop' : timeLocked ? 'Unlock time control in the shop' : 'Unlock weather in the shop'}
        </button>
      )}
      <div className={timeLocked ? 'pointer-events-none opacity-40' : ''}>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-white/60">Time of day</span>
          <span className="font-medium tabular-nums">{formatHour(hour)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="w-full"
          aria-label="Time of day"
        />
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {TIMES.map((t) => (
            <button key={t.label} onClick={() => setHour(t.hour)} className={chip(false)}>
              <Icon name={t.icon} className="text-lg" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={timeLocked ? 'pointer-events-none opacity-40' : ''}>
        <div className="mb-1 text-white/60">Day length</div>
        <div className="grid grid-cols-4 gap-1.5">
          {SPEEDS.map((sp) => (
            <button key={sp.id} onClick={() => setSpeed(sp.id)} className={chip(speed === sp.id)}>
              {sp.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-white/60">Weather</div>
        <div className="grid grid-cols-4 gap-1.5">
          {WEATHERS.map((w) => {
            const locked = weatherLocked && !FREE_WEATHER.includes(w.id);
            return (
              <button key={w.id} onClick={() => (locked ? openShop() : setWeather(w.id))} className={`${chip(weather === w.id)} ${locked ? 'opacity-50' : ''}`}>
                <Icon name={locked ? 'lock' : w.icon} className="text-lg" />
                {w.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
