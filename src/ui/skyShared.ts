import { useEffect, useState } from 'react';
import { atmo } from '../scenes/atmosphere';
import type { WeatherKind } from '../state/useWeatherStore';

export const WEATHER_ICONS: Record<WeatherKind, string> = {
  clear: 'clear_sky',
  cloudy: 'cloudy',
  rain: 'rain',
  storm: 'storm',
  snow: 'snow',
  fog: 'fog',
};

/** The live game clock as a number, refreshed a few times a second (it is not React state). */
export function useClock(): number {
  const [hour, setHour] = useState(atmo.hour);
  useEffect(() => {
    const id = window.setInterval(() => setHour(atmo.hour), 250);
    return () => window.clearInterval(id);
  }, []);
  return hour;
}
