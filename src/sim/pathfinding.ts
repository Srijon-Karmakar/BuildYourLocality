import { cellKey } from '../state/useCityStore';
import { DIRS, isWalkable, type SimWorld } from './world';

/** Relative effort of stepping onto a cell: roads are crossed reluctantly, parks are pleasant. */
function stepCost(world: SimWorld, key: string): number {
  if (world.roads.has(key)) {
    if (world.crossings.has(key)) return 1;
    // Crossing a road away from a zebra or junction crosswalk is possible but discouraged.
    return world.roadInfo.get(key)?.crosswalk ? 1.4 : 6;
  }
  if (world.rails.has(key)) return 5; // tracks are crossed reluctantly (level crossings count as roads)
  if (world.wideCells.has(key)) return 2.2;
  if (world.pleasant.has(key)) return 0.8;
  return 1.1;
}

const MAX_EXPANSIONS = 900;

/**
 * A* over the walkable grid (4-connected). Returns the cells from `start` to `goal`
 * inclusive, or null when there is no route. The goal may itself be unwalkable only if it
 * equals the start.
 */
export function findPath(
  world: SimWorld,
  start: [number, number],
  goal: [number, number],
): [number, number][] | null {
  if (start[0] === goal[0] && start[1] === goal[1]) return [start];
  if (!isWalkable(world, goal[0], goal[1])) return null;

  const h = (gx: number, gz: number) => Math.abs(gx - goal[0]) + Math.abs(gz - goal[1]);
  const startKey = cellKey(start[0], start[1]);
  const goalKey = cellKey(goal[0], goal[1]);
  const g = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string>();
  const open: { key: string; gx: number; gz: number; f: number }[] = [{ key: startKey, gx: start[0], gz: start[1], f: h(start[0], start[1]) }];
  const closed = new Set<string>();

  for (let n = 0; n < MAX_EXPANSIONS && open.length > 0; n++) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur.key === goalKey) {
      const path: [number, number][] = [];
      for (let k: string | undefined = goalKey; k; k = parent.get(k)) {
        const [gx, gz] = k.split(',').map(Number);
        path.push([gx, gz]);
      }
      return path.reverse();
    }
    closed.add(cur.key);
    for (const dir of DIRS) {
      const nx = cur.gx + dir.dx;
      const nz = cur.gz + dir.dz;
      const nk = cellKey(nx, nz);
      if (closed.has(nk) || !isWalkable(world, nx, nz)) continue;
      const cost = (g.get(cur.key) ?? 0) + stepCost(world, nk);
      if (cost >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, cost);
      parent.set(nk, cur.key);
      const existing = open.find((o) => o.key === nk);
      if (existing) existing.f = cost + h(nx, nz);
      else open.push({ key: nk, gx: nx, gz: nz, f: cost + h(nx, nz) });
    }
  }
  return null;
}
