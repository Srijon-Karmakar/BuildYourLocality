import { isOverlay, isTreeType } from '../city/catalog';
import { useBuilderStore } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { useMenuStore } from '../state/useMenuStore';
import { useWalletStore } from '../state/useWalletStore';
import { playSfx } from './sounds';

/**
 * The sounds of building and menus: pieces going down, coming away, picks, undo, the menu and tokens.
 * Everything is derived from changes in the stores, so no tool has to know about sound.
 */
export function startUiSounds(): () => void {
  const stops: (() => void)[] = [];

  stops.push(
    useCityStore.subscribe((state, prev) => {
      if (state.pieces === prev.pieces || useGameStore.getState().mode !== 'build') return;
      const now = Object.keys(state.pieces).length;
      const before = Object.keys(prev.pieces).length;
      // A whole new world (loading, switching) replaces the pieces and clears the history: stay quiet.
      if (state.past.length === 0 && prev.past.length === 0) return;
      if (now > before) {
        const added = Object.values(state.pieces).find((p) => !prev.pieces[p.id]);
        if (added && (isTreeType(added.type) || isOverlay(added.type) || added.type === 'wall')) playSfx('place_soft', 0.8);
        else playSfx('place');
      } else if (now < before) {
        playSfx('delete');
      } else if (state.past.length < prev.past.length) {
        playSfx('undo');
      } else if (state.past.length > prev.past.length) {
        // A change to a piece already there (painting, resizing, restyling).
        playSfx('click', 0.8);
      }
    }),
  );

  stops.push(
    useBuilderStore.subscribe((state, prev) => {
      if (useGameStore.getState().mode !== 'build') return;
      if (state.selectedId !== prev.selectedId && state.selectedId) playSfx('select');
      else if (state.tool !== prev.tool) playSfx('click');
    }),
  );

  stops.push(
    useMenuStore.subscribe((state, prev) => {
      if (state.open !== prev.open) playSfx('menu');
      else if (state.tab !== prev.tab) playSfx('click', 0.7);
    }),
  );

  stops.push(
    useWalletStore.subscribe((state, prev) => {
      if (state.tokens > prev.tokens) playSfx('token');
      else if (state.tokens < prev.tokens) playSfx('money');
    }),
  );

  return () => stops.forEach((stop) => stop());
}
