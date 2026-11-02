import { useSyncStore } from '../state/useSyncStore';
import { Icon } from './icons';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Small indicator of where the city is saved. `compact` shows just an icon (phones). */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const status = useSyncStore((s) => s.status);
  const lastSavedAt = useSyncStore((s) => s.lastSavedAt);
  const retry = useSyncStore((s) => s.retry);

  const base = compact
    ? 'pointer-events-auto flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10 max-[350px]:hidden rounded-full bg-black/40 pointer-coarse:bg-black/64 text-base text-white/85 backdrop-blur-[6px]'
    : 'pointer-events-auto flex h-10 items-center gap-1.5 rounded-full bg-black/40 pointer-coarse:bg-black/64 px-3.5 text-xs text-white/80 backdrop-blur-[6px]';

  const view: Record<typeof status, { icon: string; text: string; title: string }> = {
    guest: { icon: 'save', text: 'This device', title: 'Not signed in: your city is saved on this device. Sign in to keep it in your account.' },
    loading: { icon: 'cloud', text: 'Loading your city…', title: 'Loading your city' },
    saving: { icon: 'cloud', text: 'Saving…', title: 'Saving' },
    saved: { icon: 'cloud', text: `Saved${lastSavedAt ? ` ${time(lastSavedAt)}` : ''}`, title: 'Saved to your account' },
    offline: { icon: 'warn', text: 'Offline — retrying', title: 'Offline: tap to retry now' },
    error: { icon: 'warn', text: 'Not saved — retrying', title: 'Could not save: tap to retry now' },
  };
  const v = view[status];

  if (status === 'offline' || status === 'error') {
    return (
      <button className={`${base} text-amber-200`} onClick={retry} title={v.title} aria-label={v.title}>
        <Icon name={v.icon} />
        {!compact && <span>{v.text}</span>}
      </button>
    );
  }
  return (
    <div className={base} title={v.title} aria-label={v.title}>
      <Icon name={v.icon} />
      {!compact && <span>{v.text}</span>}
    </div>
  );
}
