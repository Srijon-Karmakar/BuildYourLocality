import { useState } from 'react';
import { useGameStore } from '../state/useGameStore';
import { AccountPanel } from './AccountPanel';
import { ModeBar, ModeToggle, RoamOptions } from './ModeBar';
import { SettingsPanel } from './SettingsPanel';
import { useIsCompact } from './useMediaQuery';

/**
 * Top of the screen. Desktop: mode cluster on the left, account and settings dropdowns on
 * the right. Phone: just the mode toggle and a menu button; everything else lives in a sheet
 * so the map stays visible.
 */
export function TopBar() {
  const compact = useIsCompact();
  const mode = useGameStore((s) => s.mode);
  const [menuOpen, setMenuOpen] = useState(false);

  const inset = {
    paddingTop: 'calc(var(--safe-top) + 0.5rem)',
    paddingLeft: 'calc(var(--safe-left) + 0.5rem)',
    paddingRight: 'calc(var(--safe-right) + 0.5rem)',
  };

  if (!compact) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <ModeBar />
        <div className="flex items-start gap-2">
          <AccountPanel />
          <SettingsPanel />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2" style={inset}>
        <ModeToggle />
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          className="pointer-events-auto flex h-13 w-13 items-center justify-center rounded-2xl bg-black/55 text-xl text-white backdrop-blur-md active:bg-white/20"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {menuOpen && (
        <div
          className="pointer-events-auto absolute inset-x-2 flex max-h-[70dvh] flex-col gap-5 overflow-y-auto rounded-2xl bg-black/80 p-4 text-white backdrop-blur-lg"
          style={{ top: 'calc(var(--safe-top) + 4.25rem)' }}
        >
          {mode === 'roam' && (
            <section>
              <h3 className="mb-2 text-xs uppercase tracking-wide text-white/50">Walk options</h3>
              <RoamOptions stacked />
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-white/50">Account</h3>
            <AccountPanel inline />
          </section>
          <section>
            <h3 className="mb-2 text-xs uppercase tracking-wide text-white/50">Graphics</h3>
            <SettingsPanel inline />
          </section>
        </div>
      )}
    </>
  );
}
