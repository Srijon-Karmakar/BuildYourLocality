import { useEffect, useState } from 'react';
import { atmo, formatHour } from '../scenes/atmosphere';
import { PHOTO_FILTERS, photoCapture, usePhotoStore } from '../state/usePhotoStore';
import { Icon } from './icons';

/** Turns the photo mode on: the buttons and panels vanish, leaving only the view and the photo controls. */
export function PhotoButton({ className }: { className?: string }) {
  const setActive = usePhotoStore((s) => s.setActive);
  return (
    <button onClick={() => setActive(true)} aria-label="Photo mode" title="Photo mode" className={className}>
      <Icon name="camera" />
    </button>
  );
}

/** The photo controls: filter, time of day, take the picture. Esc leaves. */
export function PhotoMode() {
  const active = usePhotoStore((s) => s.active);
  const filter = usePhotoStore((s) => s.filter);
  const setActive = usePhotoStore((s) => s.setActive);
  const setFilter = usePhotoStore((s) => s.setFilter);
  const [hour, setHour] = useState(atmo.hour);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The filter shows live on the view; the clock holds still so the light does not move while you frame the shot.
  useEffect(() => {
    if (!active) return;
    const canvas = document.querySelector('canvas');
    const css = PHOTO_FILTERS.find((f) => f.id === filter)?.css ?? 'none';
    if (canvas) canvas.style.filter = css;
    return () => {
      if (canvas) canvas.style.filter = '';
    };
  }, [active, filter]);

  useEffect(() => {
    if (!active) return;
    const before = atmo.rateOverride;
    atmo.rateOverride = 0;
    setHour(atmo.hour);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setActive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      atmo.rateOverride = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [active, setActive]);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 3500);
    return () => window.clearTimeout(id);
  }, [note]);

  if (!active) return null;

  const take = async (share: boolean) => {
    if (!photoCapture.request || busy) return;
    setBusy(true);
    const css = PHOTO_FILTERS.find((f) => f.id === filter)?.css ?? 'none';
    const blob = await photoCapture.request(css);
    setBusy(false);
    if (!blob) return setNote('The picture could not be taken. Try again.');
    const file = new File([blob], `yat-c-${Date.now()}.png`, { type: 'image/png' });
    if (share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My city in YAT-C', text: 'A picture from my city in YAT-C.' });
        return;
      } catch {
        /* cancelled: fall through to saving */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setNote('Saved to your downloads.');
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[70] flex justify-center p-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}>
      <div className="pointer-events-auto flex w-full max-w-xl flex-col gap-2.5 rounded-2xl bg-black/62 p-3 text-xs text-white backdrop-blur-[6px] pointer-coarse:bg-black/84">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PHOTO_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`shrink-0 rounded-full px-3 py-1.5 ${filter === f.id ? 'bg-white text-black' : 'bg-white/10 text-white/80'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-white/65">Time {formatHour(hour)}</span>
          <input
            type="range"
            min={0}
            max={23.9}
            step={0.1}
            value={hour}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHour(h);
              atmo.hour = h;
            }}
            className="min-w-0 flex-1"
          />
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => void take(false)} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black active:bg-white/80 disabled:opacity-60">
            <Icon name="camera" /> {busy ? 'Taking…' : 'Take photo'}
          </button>
          <button onClick={() => void take(true)} disabled={busy} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm active:bg-white/25 disabled:opacity-60">
            Share
          </button>
          <button onClick={() => setActive(false)} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm active:bg-white/25">
            Done
          </button>
        </div>
        {note && <p className="text-center text-amber-300">{note}</p>}
        <p className="text-center text-[11px] text-white/45">Move the camera as usual. Esc leaves photo mode.</p>
      </div>
    </div>
  );
}
