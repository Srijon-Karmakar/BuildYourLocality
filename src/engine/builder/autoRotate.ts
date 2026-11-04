import type { Piece } from '../../state/useCityStore';
import { cellKey } from '../../state/useCityStore';

/** The four ways a street furniture arm can point: rotation 0 is east, then north, west, south (quarter-turns). */
const DIRS: { dx: number; dz: number; rot: number }[] = [
  { dx: 1, dz: 0, rot: 0 },
  { dx: 0, dz: -1, rot: 1 },
  { dx: -1, dz: 0, rot: 2 },
  { dx: 0, dz: 1, rot: 3 },
];

/**
 * The default turn for a streetlight or traffic light standing in the corner of a cell: its arm points
 * towards the nearest road, so it leans over the street without being turned by hand. `corner` is where
 * in the cell it stands (the offset from the centre). Rotating it by hand takes over from this.
 */
export function autoCornerRot(pieces: Record<string, Piece>, occupancy: Record<string, string>, hx: number, hz: number, corner: [number, number]): number {
  const isRoad = (gx: number, gz: number) => pieces[occupancy[cellKey(gx, gz)]]?.type === 'road';
  const sx = corner[0] < 0 ? -1 : 1;
  const sz = corner[1] < 0 ? -1 : 1;
  let best = -1;
  let bestScore = 0;
  for (const d of DIRS) {
    if (!isRoad(hx + d.dx, hz + d.dz)) continue;
    // A road on the side of the corner it stands on is the one it belongs to.
    const score = 1 + (d.dx === sx || d.dz === sz ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = d.rot;
    }
  }
  if (best >= 0) return best;
  // Standing on the road's own corner: lean in towards the middle of the cell.
  return sx < 0 ? 0 : 2;
}
