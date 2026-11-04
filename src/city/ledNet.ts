import { useMemo } from 'react';
import { resolveStyle, type LedSpec } from './catalog';
import { useCityStore, type Piece } from '../state/useCityStore';

/**
 * Linking LED screens so they show one design. A screen can take its look from the building's
 * main screen (the first one with a look of its own) or from the town's broadcast, which is the
 * one screen marked as `master`. The linked screen keeps its own place, size and shape; everything
 * about the picture (mode, text, colours, speed, pixels, layers ...) comes from the source, and
 * every screen reads the same shared clock, so they all show the same moment of the same design.
 */

/** What stays the screen's own when it copies another one's look. */
const OWN_KEYS = ['block', 'side', 'bottom', 'height', 'width', 'offset', 'curve', 'seamless', 'wrap', 'link', 'master', 'board'] as const;

/** `spec` with the picture of whatever it is linked to (or itself when it is not linked, or the source is missing). */
export function linkedLed(spec: LedSpec, building: LedSpec | undefined, town: LedSpec | null): LedSpec {
  const link = spec.link ?? 'none';
  const source = link === 'town' ? town : link === 'building' ? building : null;
  if (!source || source === spec) return spec;
  const out = { ...source } as Record<string, unknown>;
  for (const key of OWN_KEYS) {
    if (spec[key] === undefined) delete out[key];
    else out[key] = spec[key];
  }
  return out as unknown as LedSpec;
}

/** The screen of a building that the rest copy: the first one that has a look of its own. */
export const buildingMaster = (leds: LedSpec[]): LedSpec | undefined => leds.find((l) => (l.link ?? 'none') === 'none');

const townCache = new WeakMap<object, LedSpec | null>();

/** The town's broadcast screen, found once per change of the city. */
export function townMasterOf(pieces: Record<string, Piece>): LedSpec | null {
  if (townCache.has(pieces)) return townCache.get(pieces)!;
  let found: LedSpec | null = null;
  for (const piece of Object.values(pieces)) {
    const hit = piece.leds?.find((l) => l.master) ?? (piece.led?.master ? piece.led : undefined);
    if (hit) {
      found = hit;
      break;
    }
  }
  townCache.set(pieces, found);
  return found;
}

/** The town's broadcast, only watched when this screen is actually linked to it. */
export function useTownMaster(enabled: boolean): LedSpec | null {
  return useCityStore((s) => (enabled ? townMasterOf(s.pieces) : null));
}

/** The look a screen really shows: its own, or the one it is linked to. */
export function useLinkedLed(spec: LedSpec, building?: LedSpec): LedSpec {
  const town = useTownMaster(spec.link === 'town');
  return useMemo(() => linkedLed(spec, building, town), [spec, building, town]);
}

/** Does anything in this piece broadcast to the town? */
const hasMaster = (piece: Piece) => !!(piece.leds?.some((l) => l.master) || piece.led?.master);

/**
 * Makes one screen the town's broadcast (or stops it), taking the flag off every other screen so
 * there is only ever one. `index` is the screen's place in the building's list, or null for the
 * single screen of a billboard or LED wall. One undo step.
 */
export function setTownMaster(pieceId: string, index: number | null, on: boolean) {
  const city = useCityStore.getState();
  const piece = city.pieces[pieceId];
  if (!piece) return;
  city.beginStroke();
  try {
    if (on) {
      const others = Object.values(city.pieces).filter((p) => p.id !== pieceId && hasMaster(p));
      if (others.length > 0) {
        city.updateMany(
          others.map((p) => p.id),
          (p) => ({ ...(p.leds ? { leds: p.leds.map((l) => ({ ...l, master: false })) } : {}), ...(p.led ? { led: { ...p.led, master: false } } : {}) }),
        );
      }
    }
    const style = resolveStyle(piece.type, piece);
    if (index === null) {
      if (style.led) city.updatePiece(pieceId, { led: { ...style.led, master: on, link: 'none' } });
    } else {
      city.updatePiece(pieceId, {
        leds: style.leds.map((l, i) => (i === index ? { ...l, master: on, link: 'none' as const } : on ? { ...l, master: false } : l)),
        led: null,
      });
    }
  } finally {
    city.endStroke();
  }
}
