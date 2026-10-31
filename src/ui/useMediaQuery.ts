import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query and re-renders when it starts / stops matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Primary input is a finger: use touch controls and bigger targets. */
export const useIsTouch = () => useMediaQuery('(pointer: coarse)');

/** Narrow screen (phone portrait / small landscape): panels become bottom sheets. */
export const useIsCompact = () => useMediaQuery('(max-width: 639px), (max-height: 500px)');
