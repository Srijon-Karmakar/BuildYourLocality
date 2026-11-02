import { useEffect } from 'react';
import { Icon } from './icons';
import { useIsTouch, useMediaQuery } from './useMediaQuery';

/**
 * Phones play in landscape only. Where the browser allows it the screen is locked to landscape on
 * the first tap (it usually needs fullscreen or an installed app); everywhere else a full-screen
 * message asks to turn the phone, and the game is paused behind it.
 */
export function OrientationGuard() {
  const touch = useIsTouch();
  const portrait = useMediaQuery('(orientation: portrait)');
  // Tablets are big enough to play either way; only phones are held to landscape.
  const phone = useMediaQuery('(max-width: 820px)');

  useEffect(() => {
    if (!touch) return;
    const lock = () => {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      orientation.lock?.('landscape').catch(() => {
        /* not allowed outside fullscreen: the rotate prompt covers it */
      });
    };
    window.addEventListener('pointerdown', lock, { once: true });
    return () => window.removeEventListener('pointerdown', lock);
  }, [touch]);

  if (!touch || !phone || !portrait) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center text-white">
      <Icon name="rotate" size={56} className="animate-spin [animation-duration:3s]" />
      <div className="text-xl font-semibold">Turn your phone sideways</div>
      <p className="max-w-xs text-sm text-white/60">Apnagali is played in landscape. Rotate your device (and switch off rotation lock if it does not turn).</p>
    </div>
  );
}
