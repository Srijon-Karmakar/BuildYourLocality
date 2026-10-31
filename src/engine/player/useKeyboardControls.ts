import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return; // typing in a form, not playing
      const key = KEY_MAP[e.code];
      if (key) keys.current[key] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = KEY_MAP[e.code];
      if (key) keys.current[key] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return keys;
}
