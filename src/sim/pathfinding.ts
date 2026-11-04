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

interface PathNode {
  key: string;
  gx: number;
  gz: number;
  f: number;
  order: number;
  index: number;
}

/** Indexed min-heap: decrease-key and removal are O(log n), with stable ties for the same routes. */
class OpenSet {
  private heap: PathNode[] = [];
  private nodes = new Map<string, PathNode>();
  private order = 0;

  get size() { return this.heap.length; }

  private before(a: PathNode, b: PathNode) {
    return a.f < b.f || (a.f === b.f && a.order < b.order);
  }

  private swap(a: number, b: number) {
    const heap = this.heap;
    [heap[a], heap[b]] = [heap[b], heap[a]];
    heap[a].index = a;
    heap[b].index = b;
  }

  offer(key: string, gx: number, gz: number, f: number) {
    let node = this.nodes.get(key);
    if (node) node.f = f;
    else {
      node = { key, gx, gz, f, order: this.order++, index: this.heap.length };
      this.nodes.set(key, node);
      this.heap.push(node);
    }
    let i = node.index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(this.heap[i], this.heap[parent])) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): PathNode {
    const first = this.heap[0];
    const last = this.heap.pop()!;
    this.nodes.delete(first.key);
    if (this.heap.length) {
      this.heap[0] = last;
      last.index = 0;
      let i = 0;
      while (i * 2 + 1 < this.heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child])) child++;
        if (!this.before(this.heap[child], this.heap[i])) break;
        this.swap(i, child);
        i = child;
      }
    }
    return first;
  }
}

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
  const open = new OpenSet();
  open.offer(startKey, start[0], start[1], h(start[0], start[1]));
  const closed = new Set<string>();

  for (let n = 0; n < MAX_EXPANSIONS && open.size > 0; n++) {
    const cur = open.pop();
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
      open.offer(nk, nx, nz, cost + h(nx, nz));
    }
  }
  return null;
}
