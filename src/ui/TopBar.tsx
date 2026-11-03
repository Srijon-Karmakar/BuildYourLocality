import { atmo, formatHour } from '../scenes/atmosphere';
import { useMenuStore } from '../state/useMenuStore';
import { useWeatherStore } from '../state/useWeatherStore';
import { AvatarMenu } from './AvatarMenu';
import { Icon } from './icons';
import { MenuPanel } from './MenuPanel';
import { ModeBar, ModeToggle } from './ModeBar';
import { SiteLinks } from './SiteLinks';
import { SyncBadge } from './SyncBadge';
import { WEATHER_ICONS, useClock } from './skyShared';
import { useIsCompact } from './useMediaQuery';

/** Clock and weather at a glance; tapping it opens the Sky tab. */
function SkyChip({ compact }: { compact: boolean }) {
  const hour = useClock();
  const open = useMenuStore((s) => s.open && s.tab === 'sky');
  const toggle = useMenuStore((s) => s.toggle);
  useWeatherStore((s) => s.weather); // re-render when the weather setting changes
  const icon = atmo.sunHeight < 0 && (atmo.kind === 'clear' || atmo.kind === 'cloudy') ? 'moon' : WEATHER_ICONS[atmo.kind];
  return (
    <button
      onClick={() => toggle('sky')}
      aria-label="Time and weather"
      className={`pointer-events-auto flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 tabular-nums sm:px-3.5 text-white backdrop-blur-[6px] transition sm:h-10 ${
        open ? 'bg-white/25' : 'bg-black/40 pointer-coarse:bg-black/64 active:bg-white/20 sm:hover:bg-black/48'
      }`}
    >
      <Icon name={icon} className="text-base" />
      <span className={compact ? 'text-xs' : 'text-sm'}>{formatHour(hour)}</span>
    </button>
  );
}

/**
 * Top of the screen. Left: the Build / Walk switch (plus walk options on desktop). Right: save
 * status, the clock and one menu button. Everything else (sky, graphics, account) is inside the
 * menu, so the map stays clear.
 */
export function TopBar() {
  const compact = useIsCompact();
  const menuOpen = useMenuStore((s) => s.open);
  const toggle = useMenuStore((s) => s.toggle);

  const inset = {
    paddingTop: 'calc(var(--safe-top) + 0.375rem)',
    paddingLeft: 'calc(var(--safe-left) + 0.5rem)',
    paddingRight: 'calc(var(--safe-right) + 0.5rem)',
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 sm:gap-2 sm:px-4" style={inset}>
        {compact ? <ModeToggle /> : <ModeBar />}
        <SiteLinks className="pointer-events-auto absolute left-1/2 top-[calc(var(--safe-top)+0.375rem)] hidden -translate-x-1/2 items-center rounded-full bg-black/40 px-1 backdrop-blur-[6px] xl:flex xl:h-10" />
        <div className="flex items-start gap-1.5 sm:gap-2">
          <SyncBadge compact={compact} />
          <SkyChip compact={compact} />
          <AvatarMenu />
          <button
            onClick={() => toggle()}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 pointer-coarse:bg-black/64 text-lg text-white backdrop-blur-[6px] active:bg-white/20 sm:text-xl sm:h-10 sm:w-10 sm:hover:bg-black/48"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
      <MenuPanel />
    </>
  );
}
