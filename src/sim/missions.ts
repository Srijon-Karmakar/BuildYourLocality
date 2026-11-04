import { create } from 'zustand';
import { PIECES, TREE_TYPES, type PieceType } from '../city/catalog';
import { useCityStore } from '../state/useCityStore';
import { cityModel } from './cityStats';
import { combat } from './combat';

/**
 * Contracts from the neighbours: build something, grow the city, make people happier, before the time
 * runs out. The reward goes to the city treasury (never the player's real wallet), so it pays for the
 * next thing to build.
 */

export type MissionKind = 'build' | 'population' | 'happiness';

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  /** For build missions: which pieces count. */
  types?: PieceType[];
  target: number;
  /** How many there were when the contract was offered (build missions count only the new ones). */
  baseline: number;
  progress: number;
  /** Seconds left. */
  left: number;
  total: number;
  reward: number;
  status: 'active' | 'done' | 'failed';
}

interface MissionState {
  missions: Mission[];
  completed: number;
  earned: number;
}

const KEY = 'yatc.missions.v1';
const MAX_ACTIVE = 3;
const HOMES: PieceType[] = ['house', 'villa', 'apartment'];
const SERVICES: { type: PieceType; label: string }[] = [
  { type: 'police', label: 'a police station' },
  { type: 'firestation', label: 'a fire station' },
  { type: 'hospital', label: 'a hospital' },
  { type: 'school', label: 'a school' },
];

function load(): MissionState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as MissionState | null;
    if (raw && Array.isArray(raw.missions)) return raw;
  } catch {
    /* start fresh */
  }
  return { missions: [], completed: 0, earned: 0 };
}

export const useMissionStore = create<MissionState>(() => load());
useMissionStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ missions: s.missions.slice(-12), completed: s.completed, earned: s.earned }));
  } catch {
    /* not saved */
  }
});

const uid = () => Math.random().toString(36).slice(2, 9);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

function count(types: PieceType[]): number {
  const set = new Set(types);
  let n = 0;
  for (const p of Object.values(useCityStore.getState().pieces)) if (set.has(p.type)) n++;
  return n;
}

class Missions {
  private offerIn = 20;
  private checkIn = 1;
  private elapsed = 0;

  tick(dt: number) {
    const active = useMissionStore.getState().missions.filter((m) => m.status === 'active');
    this.checkIn -= dt;
    this.offerIn -= dt;
    this.elapsed += dt;

    // Once a second: tick the clocks and look at the city.
    if (this.checkIn <= 0) {
      this.checkIn = 1;
      if (active.length > 0) this.review(this.elapsed);
      this.elapsed = 0;
    }

    if (this.offerIn <= 0 && active.length < MAX_ACTIVE) {
      this.offerIn = 50 + Math.random() * 50;
      this.offer();
    }
  }

  /** Checks every active contract against the city: done, out of time, or just progress. */
  private review(elapsed: number) {
    const stats = cityModel.snapshot;
    const missions = useMissionStore.getState().missions.map((m) => {
      if (m.status !== 'active') return m;
      let progress = m.progress;
      if (m.kind === 'build') progress = Math.max(0, count(m.types ?? []) - m.baseline);
      else if (m.kind === 'population') progress = stats?.residents ?? 0;
      else progress = stats?.happiness ?? 0;
      if (progress >= m.target) {
        cityModel.addFunds(m.reward);
        combat.toast(`Contract complete: ${m.title} (+${m.reward} to the treasury)`, 'good');
        useMissionStore.setState((s) => ({ completed: s.completed + 1, earned: s.earned + m.reward }));
        return { ...m, progress: m.target, status: 'done' as const };
      }
      const left = m.left - elapsed;
      if (left <= 0) {
        combat.toast(`Contract expired: ${m.title}`, 'warn');
        return { ...m, progress, left: 0, status: 'failed' as const };
      }
      return { ...m, progress, left };
    });
    useMissionStore.setState({ missions });
  }

  /** Offers a new contract that suits the city as it is now. */
  private offer() {
    const pieces = Object.values(useCityStore.getState().pieces);
    if (pieces.length < 2) return;
    const stats = cityModel.snapshot;
    const existing = useMissionStore.getState().missions.filter((m) => m.status === 'active');
    const has = (title: string) => existing.some((m) => m.title === title);
    const size = Math.max(1, Math.min(6, Math.round(pieces.length / 30)));
    const options: Omit<Mission, 'id' | 'progress' | 'status' | 'left'>[] = [];

    const homes = count(HOMES);
    options.push({ kind: 'build', title: `Build ${2 + size} more homes`, types: HOMES, target: 2 + size, baseline: homes, total: 420, reward: 120 + size * 60 });
    options.push({ kind: 'build', title: `Plant ${6 + size * 3} trees`, types: TREE_TYPES, target: 6 + size * 3, baseline: count(TREE_TYPES), total: 360, reward: 90 + size * 25 });
    options.push({ kind: 'build', title: `Build ${1 + Math.floor(size / 2)} park${size >= 2 ? 's' : ''}`, types: ['park'], target: 1 + Math.floor(size / 2), baseline: count(['park']), total: 360, reward: 140 + size * 30 });
    options.push({ kind: 'build', title: 'Put up 2 bus stops', types: ['busstop'], target: 2, baseline: count(['busstop']), total: 300, reward: 160 });
    options.push({ kind: 'build', title: 'Light up the town with an LED billboard', types: ['billboard', 'ledwall', 'ledtower'], target: 1, baseline: count(['billboard', 'ledwall', 'ledtower']), total: 360, reward: 200 });
    const missing = SERVICES.filter((s) => count([s.type]) === 0);
    if (missing.length > 0) {
      const s = pick(missing);
      options.push({ kind: 'build', title: `Build ${s.label}`, types: [s.type], target: 1, baseline: 0, total: 540, reward: 380 });
    }
    if (stats && stats.capacity > 0) {
      const goal = Math.min(stats.capacity, Math.max(stats.residents + 12, Math.round(stats.residents * 1.25)));
      if (goal > stats.residents) options.push({ kind: 'population', title: `Reach ${goal} residents`, target: goal, baseline: 0, total: 540, reward: 250 + size * 50 });
      const happy = Math.min(95, stats.happiness + 8);
      if (happy > stats.happiness) options.push({ kind: 'happiness', title: `Raise happiness to ${happy}`, target: happy, baseline: 0, total: 480, reward: 300 });
    }
    const fresh = options.filter((o) => !has(o.title) && (o.types ?? []).every((t) => t in PIECES));
    if (fresh.length === 0) return;
    const o = pick(fresh);
    const mission: Mission = { ...o, id: uid(), progress: 0, left: o.total, status: 'active' };
    // Keep the active contracts and the few most recent finished ones.
    useMissionStore.setState((s) => {
      const finished = s.missions.filter((m) => m.status !== 'active').slice(-5);
      return { missions: [...finished, ...s.missions.filter((m) => m.status === 'active'), mission] };
    });
    combat.toast(`New contract: ${mission.title} (reward ${mission.reward})`, 'info');
  }
}

export const missions = new Missions();
