import { useEffect, useRef } from 'react';
import { useGameStore } from '../../state/useGameStore';

export interface MoveKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  down: boolean;
}

const KEY_MAP: Record<string, keyof MoveKeys> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'down',
  ShiftRight: 'down',
};

/**
 * Tracks held movement keys in a ref (not state) so PlayerController's useFrame loop
 * can read current input every frame without triggering React re-renders per keypress.
 */
export function useKeyboardControls() {
  const keys = useRef<MoveKeys>({ forward: false, back: false, left: false, right: false, jump: false, down: false });
  const mode = useGameStore((s) => s.mode);
  const subMode = useGameStore((s) => s.roamSubMode);

  useEffect(() => {
    const held = new Set<string>();
    const reset = () => {
      held.clear();
      for (const key of Object.keys(keys.current) as (keyof MoveKeys)[]) keys.current[key] = false;
    };
    reset();
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (mode !== 'roam' || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const key = KEY_MAP[e.code];
      if (key) {
        e.preventDefault(); // Space/arrows control the player, rather than scrolling/clicking UI.
        held.add(e.code);
        keys.current[key] = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      held.delete(e.code);
      if (key) keys.current[key] = Object.entries(KEY_MAP).some(([code, action]) => action === key && held.has(code));
    };
    const onVisibility = () => { if (document.hidden) reset(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      reset();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mode, subMode]);

  return keys;
}
