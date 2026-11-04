import { create } from 'zustand';
import { PIECES, CELL } from '../city/catalog';
import { viewState } from '../engine/viewState';
import { useCityStore, type Piece } from '../state/useCityStore';
import { blast } from './blast';
import { combat } from './combat';
import { cityState } from './cityState';
import { sim } from './simulation';

/**
 * Disasters: a meteor shower, an earthquake or a tornado, set off from the City window or (if the player
 * allows it) striking now and then by themselves. They tear real holes in the city, so the city is
 * saved just before one begins and can be put back with one press.
 */

export type DisasterKind = 'meteor' | 'quake' | 'tornado';
export type RandomMode = 'off' | 'rare' | 'often';

export const DISASTERS: { id: DisasterKind; label: string; icon: string; text: string }[] = [
  { id: 'meteor', label: 'Meteor shower', icon: 'rocket', text: 'Rocks fall from the sky around the centre of the screen.' },
  { id: 'quake', label: 'Earthquake', icon: 'activity', text: 'The ground shakes for ten seconds and buildings take hits.' },
  { id: 'tornado', label: 'Tornado', icon: 'cloud', text: 'A funnel cuts a path through the city, tearing up whatever it touches.' },
];

interface Active {
  kind: DisasterKind;
  age: number;
  duration: number;
  x: number;
  z: number;
  /** Tornado heading and next hit / meteor timers. */
  heading: number;
  timer: number;
  fired: number;
}

interface DisasterSettings {
  mode: RandomMode;
  /** True when a saved copy of the city from before a disaster can be put back. */
  canRestore: boolean;
  setMode: (mode: RandomMode) => void;
}

const KEY = 'yatc.disasters.v1';
function savedMode(): RandomMode {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'rare' || raw === 'often' ? raw : 'off';
  } catch {
    return 'off';
  }
}

export const useDisasterStore = create<DisasterSettings>((set) => ({
  mode: savedMode(),
  canRestore: false,
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* not saved */
    }
    set({ mode });
  },
}));

const range = (a: number, b: number) => a + Math.random() * (b - a);

class Disasters {
  active: Active[] = [];
  private snapshot: Piece[] | null = null;
  private before = 0;
  private nextRandom = 300;
  private warned: { kind: DisasterKind; at: number; x: number; z: number } | null = null;
  private time = 0;

  get tornadoes(): Active[] {
    return this.active.filter((a) => a.kind === 'tornado');
  }

  /** Starts a disaster at the middle of the view. Returns a message when it cannot. */
  trigger(kind: DisasterKind, at?: { x: number; z: number }): string | null {
    if (this.active.length >= 2) return 'One thing at a time: wait for the current disaster to pass.';
    const pieces = useCityStore.getState().pieces;
    if (Object.keys(pieces).length === 0) return 'There is no city to hit yet.';
    // Keep the copy from before the first of a run of disasters, so "restore" goes back to a whole city.
    if (!this.snapshot) {
      this.snapshot = Object.values(pieces).map((p) => ({ ...p }));
      this.before = this.snapshot.length;
      useDisasterStore.setState({ canRestore: true });
    }
    const x = at?.x ?? viewState.x;
    const z = at?.z ?? viewState.z;
    const duration = kind === 'meteor' ? 9 : kind === 'quake' ? 10 : 28;
    this.active.push({ kind, age: 0, duration, x, z, heading: range(0, Math.PI * 2), timer: 0, fired: 0 });
    combat.toast(kind === 'meteor' ? 'Meteors incoming!' : kind === 'quake' ? 'Earthquake!' : 'A tornado has touched down!', 'bad');
    return null;
  }

  /** Puts the city back as it was before the disasters began. */
  restore(): boolean {
    if (!this.snapshot) return false;
    useCityStore.getState().setPieces(this.snapshot);
    this.snapshot = null;
    useDisasterStore.setState({ canRestore: false });
    return true;
  }

  /** Forgets the saved copy: the damage is accepted. */
  accept() {
    this.snapshot = null;
    useDisasterStore.setState({ canRestore: false });
  }

  update(dt: number) {
    this.time += dt;
    this.randomEvents();
    for (const d of this.active) this.step(d, dt);
    const done = this.active.filter((d) => d.age >= d.duration);
    if (done.length > 0) {
      this.active = this.active.filter((d) => d.age < d.duration);
      if (this.active.length === 0 && this.snapshot) {
        // Rebuilding costs money from the treasury: a little for each piece the disaster destroyed.
        const lost = Math.max(0, this.before - Object.keys(useCityStore.getState().pieces).length);
        if (lost > 0) {
          cityState.damage += lost * 45;
          combat.toast(`The disaster is over. ${lost} pieces were destroyed (repairs cost ${lost * 45}). You can restore the city from the City window.`, 'warn');
        } else {
          combat.toast('The disaster passed without destroying anything.', 'good');
        }
      }
    }
  }

  // --- Behaviour ---------------------------------------------------------------------------------

  private step(d: Active, dt: number) {
    d.age += dt;
    d.timer -= dt;
    const near = Math.hypot(sim.player.x - d.x, sim.player.z - d.z);
    if (d.kind === 'meteor') {
      if (d.timer <= 0 && d.age < d.duration - 3) {
        d.timer = range(0.7, 1.6);
        blast.meteor(d.x + range(-45, 45), d.z + range(-45, 45));
        d.fired++;
      }
    } else if (d.kind === 'quake') {
      blast.shake = Math.max(blast.shake, 0.85 * Math.min(1, (d.duration - d.age) / 3 + 0.2));
      if (d.timer <= 0) {
        d.timer = range(0.6, 1.2);
        const target = this.randomBuilding(d.x, d.z, 70);
        if (target) blast.strike(target.x, target.z, 5);
        this.panic(d.x, d.z, 80);
      }
    } else {
      // The funnel wanders along a curving path.
      d.heading += range(-0.6, 0.6) * dt;
      const speed = 6;
      d.x += Math.sin(d.heading) * speed * dt;
      d.z += Math.cos(d.heading) * speed * dt;
      blast.shake = Math.max(blast.shake, Math.max(0, 0.4 - near / 120));
      if (d.timer <= 0) {
        d.timer = 0.5;
        blast.strike(d.x, d.z, 7);
        this.panic(d.x, d.z, 28);
      }
    }
  }

  private panic(x: number, z: number, radius: number) {
    for (const p of sim.peds) {
      if (p.vis < 0.5 || Math.hypot(p.x - x, p.z - z) > radius) continue;
      p.emote = 'scared';
      p.emoteTimer = 3;
    }
  }

  private randomBuilding(x: number, z: number, radius: number): { x: number; z: number } | null {
    const list = Object.values(useCityStore.getState().pieces).filter((p) => PIECES[p.type]?.paintable && Math.hypot((p.gx + 0.5) * CELL - x, (p.gz + 0.5) * CELL - z) < radius);
    if (list.length === 0) return null;
    const p = list[Math.floor(Math.random() * list.length)];
    return { x: (p.gx + 0.5) * CELL, z: (p.gz + 0.5) * CELL };
  }

  /** If the player allowed it, now and then something strikes by itself, with a few seconds of warning. */
  private randomEvents() {
    const mode = useDisasterStore.getState().mode;
    if (this.warned && this.time >= this.warned.at) {
      this.trigger(this.warned.kind, this.warned);
      this.warned = null;
    }
    if (mode === 'off' || this.active.length > 0 || this.warned || this.time < this.nextRandom) return;
    this.nextRandom = this.time + (mode === 'rare' ? range(600, 1080) : range(240, 480));
    const target = this.randomBuilding(viewState.x, viewState.z, 160);
    if (!target) return;
    const roll = Math.random();
    const kind: DisasterKind = roll < 0.45 ? 'meteor' : roll < 0.85 ? 'quake' : 'tornado';
    this.warned = { kind, at: this.time + 6, ...target };
    combat.toast(kind === 'meteor' ? 'Warning: meteors are about to hit the city!' : kind === 'quake' ? 'Warning: tremors detected!' : 'Warning: a tornado is forming!', 'warn');
  }
}

export const disasters = new Disasters();
