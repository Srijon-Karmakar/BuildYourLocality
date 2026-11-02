/** 0 = traffic moving north-south, 1 = east-west. */
export type Axis = 0 | 1;
export type LightColour = 'green' | 'yellow' | 'red';

// --- Fixed timer (fallback) -----------------------------------------------------------

const GREEN = 8;
const YELLOW = 1.5;
const ALL_RED = 0.5;
const HALF = GREEN + YELLOW + ALL_RED;
export const CYCLE = HALF * 2;

/**
 * Plain fixed-time signal, used for a light that is not yet next to a junction: the two
 * axes alternate on a set timer, offset by half a cycle.
 */
export function lightFor(axis: Axis, time: number): LightColour {
  const t = (((time + (axis === 1 ? HALF : 0)) % CYCLE) + CYCLE) % CYCLE;
  if (t < GREEN) return 'green';
  if (t < GREEN + YELLOW) return 'yellow';
  return 'red';
}

// --- Adaptive controller --------------------------------------------------------------

export type SignalPhase =
  | 'ns-green'
  | 'ns-yellow'
  | 'clear-ns'
  | 'ew-green'
  | 'ew-yellow'
  | 'clear-ew'
  | 'walk'
  | 'clear-walk';

/** What the sensors see around a junction. */
export interface Demand {
  /** Vehicles approaching or queued on the north-south road. */
  ns: number;
  /** Vehicles approaching or queued on the east-west road. */
  ew: number;
  /** Pedestrians waiting to cross. */
  peds: number;
}

export const MIN_GREEN = 5;
export const MAX_GREEN = 20;
const YELLOW_TIME = 1.6;
const CLEAR_TIME = 0.9;
const WALK_TIME = 8;

/**
 * An actuated traffic signal. Instead of a fixed timer it reacts to demand:
 * - a green is held at least MIN_GREEN, and extended (up to MAX_GREEN) while traffic keeps arriving;
 * - it gaps out early when its road empties and another is waiting;
 * - with no one waiting anywhere it rests on its current green, so a lone car never stops;
 * - waiting pedestrians get an all-red "walk" phase, so they can cross safely.
 */
export class SignalController {
  phase: SignalPhase = 'ns-green';
  /** Seconds in the current phase. */
  elapsed = 0;
  private lastGreen: Axis = 0;

  /** The colour shown to vehicles travelling along an axis. */
  colour(axis: Axis): LightColour {
    const g = axis === 0 ? 'ns' : 'ew';
    if (this.phase === `${g}-green`) return 'green';
    if (this.phase === `${g}-yellow`) return 'yellow';
    return 'red';
  }

  /** True while pedestrians have the "walk" signal (all vehicles red). */
  get walk(): boolean {
    return this.phase === 'walk';
  }

  private enter(phase: SignalPhase) {
    this.phase = phase;
    this.elapsed = 0;
  }

  update(dt: number, demand: Demand) {
    this.elapsed += dt;
    switch (this.phase) {
      case 'ns-green':
      case 'ew-green': {
        const axis: Axis = this.phase === 'ns-green' ? 0 : 1;
        this.lastGreen = axis;
        const mine = axis === 0 ? demand.ns : demand.ew;
        const other = axis === 0 ? demand.ew : demand.ns;
        const someoneWaits = other > 0 || demand.peds > 0;
        if (this.elapsed >= MIN_GREEN && someoneWaits && (mine === 0 || this.elapsed >= MAX_GREEN)) {
          this.enter(axis === 0 ? 'ns-yellow' : 'ew-yellow');
        }
        break;
      }
      case 'ns-yellow':
        if (this.elapsed >= YELLOW_TIME) this.enter('clear-ns');
        break;
      case 'ew-yellow':
        if (this.elapsed >= YELLOW_TIME) this.enter('clear-ew');
        break;
      case 'clear-ns':
      case 'clear-ew':
        if (this.elapsed >= CLEAR_TIME) this.enter(demand.peds > 0 ? 'walk' : this.nextAxis(demand));
        break;
      case 'walk':
        if (this.elapsed >= WALK_TIME) this.enter('clear-walk');
        break;
      case 'clear-walk':
        if (this.elapsed >= CLEAR_TIME) this.enter(this.nextAxis(demand));
        break;
    }
  }

  /** The next road to serve: whichever has more waiting, otherwise the one not just served. */
  private nextAxis(demand: Demand): SignalPhase {
    if (demand.ns !== demand.ew) return demand.ns > demand.ew ? 'ns-green' : 'ew-green';
    return this.lastGreen === 0 ? 'ew-green' : 'ns-green';
  }
}
