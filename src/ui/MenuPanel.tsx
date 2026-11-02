import { useGameStore } from '../state/useGameStore';
import { useMenuStore, type MenuTab } from '../state/useMenuStore';
import { AccountPanel } from './AccountPanel';
import { Icon } from './icons';
import { RoamOptions } from './ModeBar';
import { SettingsPanel } from './SettingsPanel';
import { SkyPanel } from './SkyPanel';
import { RewardsPanel } from './RewardsPanel';
import { WorldsPanel } from './WorldsPanel';

const TABS: { id: MenuTab; label: string; icon: string }[] = [
  { id: 'sky', label: 'Sky', icon: 'sky' },
  { id: 'worlds', label: 'Worlds', icon: 'worlds' },
  { id: 'rewards', label: 'Rewards', icon: 'coins' },
  { id: 'graphics', label: 'Graphics', icon: 'sliders' },
  { id: 'account', label: 'Account', icon: 'user' },
];

/**
 * Everything that is not building lives here: sky, graphics, account, and walk options while walking.
 * One panel for every screen size: a dropdown card on desktop, a full-width sheet on a phone.
 */
export function MenuPanel() {
  const open = useMenuStore((s) => s.open);
  const tab = useMenuStore((s) => s.tab);
  const select = useMenuStore((s) => s.select);
  const close = useMenuStore((s) => s.close);
  const mode = useGameStore((s) => s.mode);

  if (!open) return null;
  const tabs = mode === 'roam' ? [{ id: 'walk' as MenuTab, label: 'Walk', icon: 'walk' }, ...TABS] : TABS;
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <>
      {/* On a phone, tapping outside closes the sheet. On desktop the map behind stays usable. */}
      <div className="pointer-events-auto absolute inset-0 sm:hidden" onClick={close} />
      <div
        className="pointer-events-auto absolute inset-x-2 flex max-h-[72dvh] flex-col overflow-hidden rounded-2xl bg-black/62 pointer-coarse:bg-black/84 text-white shadow-xl backdrop-blur-[6px] sm:inset-x-auto sm:right-4 sm:w-80"
        style={{ top: 'calc(var(--safe-top) + 4rem)' }}
      >
        <div className="flex gap-1 p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              aria-label={t.label}
              className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs transition sm:min-h-0 sm:py-1.5 ${
                active === t.id ? 'bg-white text-black' : 'text-white/75 active:bg-white/20 sm:hover:bg-white/10'
              }`}
            >
              <Icon name={t.icon} />
              <span className={active === t.id ? '' : 'hidden sm:inline'}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-3 pt-2 sm:p-4 sm:pt-2.5">
          {active === 'sky' && <SkyPanel />}
          {active === 'worlds' && <WorldsPanel />}
          {active === 'rewards' && <RewardsPanel />}
          {active === 'graphics' && <SettingsPanel />}
          {active === 'account' && <AccountPanel inline />}
          {active === 'walk' && <RoamOptions stacked />}
        </div>
      </div>
    </>
  );
}
