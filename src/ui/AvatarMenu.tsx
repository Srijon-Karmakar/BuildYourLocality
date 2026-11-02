import { useState } from 'react';
import { useAuthStore } from '../state/useAuthStore';
import { useMenuStore } from '../state/useMenuStore';
import { AccountPanel } from './AccountPanel';
import { Icon } from './icons';

/** A round avatar in the top bar. Tapping it opens the account card (sign in / out) under it. */
export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const email = useAuthStore((s) => s.session?.user.email);
  const closeMenu = useMenuStore((s) => s.close);
  const initial = email?.[0]?.toUpperCase();

  return (
    <>
      <button
        onClick={() => {
          closeMenu();
          setOpen((v) => !v);
        }}
        aria-label={open ? 'Close account' : 'Account'}
        title={email ?? 'Sign in'}
        className={`pointer-events-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-sm font-semibold backdrop-blur-[6px] transition sm:h-10 sm:w-10 ${
          initial ? 'bg-emerald-400 text-black' : 'bg-black/40 pointer-coarse:bg-black/64 text-lg text-white sm:hover:bg-black/48'
        } ${open ? 'ring-2 ring-white' : ''}`}
      >
        {initial ?? <Icon name="user" />}
      </button>
      {open && (
        <>
          {/* Tapping anywhere else folds the card away again. */}
          <div className="pointer-events-auto fixed inset-0" onClick={() => setOpen(false)} />
          <div
            className="pointer-events-auto fixed right-2 w-72 max-w-[calc(100vw-1rem)] rounded-2xl bg-black/62 pointer-coarse:bg-black/84 p-3 text-white shadow-xl backdrop-blur-[6px] sm:right-4"
            style={{ top: 'calc(var(--safe-top) + 3.25rem)' }}
          >
            <AccountPanel inline />
          </div>
        </>
      )}
    </>
  );
}
