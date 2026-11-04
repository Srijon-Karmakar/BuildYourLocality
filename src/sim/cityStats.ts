import { TREE_TYPES, type PieceType, PIECES } from '../city/catalog';
import { useCityStatsStore } from '../state/useCityStatsStore';
import { useCityStore, type Piece } from '../state/useCityStore';
import { cityState } from './cityState';
import { incidents } from './incidents';
import { sim } from './simulation';
import type { ServiceKind } from './world';

/**
 * The city's numbers: who lives here, how happy they are, how well the services reach them, how
 * the traffic flows, what it all costs. The buildings placed set what is possible (housing, jobs,
 * stations); the live simulation (traffic, emergencies) and the treasury decide how it goes. The
 * result feeds the City stats window, and the happiness and population feed back into the streets.
 */

// --- What each building is worth ---------------------------------------------------------------

/** Residents / jobs at the building's standard height; taller or shorter scales it. */
const HOUSING: Partial<Record<PieceType, number>> = { house: 4, villa: 6, apartment: 36 };
const JOBS: Partial<Record<PieceType, number>> = {
  shop: 5, cafe: 5, office: 70, hotel: 45, mall: 110, tower: 130, skyscraper: 300, warehouse: 18, terminal: 50, hangar: 14,
  busdepot: 12, police: 24, firestation: 18, hospital: 80, school: 34, controltower: 8, portcrane: 6,
};
const POLLUTION: Partial<Record<PieceType, number>> = { warehouse: 3, containers: 1.2, portcrane: 2, hangar: 2, busdepot: 2, terminal: 2, runway: 0.7, rail: 0.25, station: 0.6 };
const NOISE: Partial<Record<PieceType, number>> = { runway: 1, terminal: 3, mall: 3, hotel: 1, rail: 0.35, station: 1, tram: 0.2, monorail: 0.15, billboard: 0.3, busdepot: 2, warehouse: 1.5 };
const GREENERY: Partial<Record<PieceType, number>> = { park: 6, plaza: 2, fountain: 2, hedge: 0.3, grass: 0.1, tallgrass: 0.12, wildflower: 0.15 };
const TRANSIT_STOPS = new Set<PieceType>(['busstop', 'station', 'tramstop', 'monostation', 'metroentrance', 'taxistand']);
/** Running costs per minute. */
const UPKEEP: Partial<Record<PieceType, number>> = {
  police: 40, firestation: 40, hospital: 70, school: 45, park: 3, busstop: 5, station: 12, tramstop: 8, monostation: 10, metroentrance: 8, busdepot: 15, terminal: 30,
};
const ROAD_UPKEEP = 0.35;
const TRACK_UPKEEP = 0.5;
const TOURISM: Partial<Record<PieceType, number>> = { hotel: 18, mall: 22, terminal: 30, skyscraper: 12 };

/** How far a service reaches (metres), and how many residents one building can look after. */
const REACH: Record<ServiceKind | 'transit', number> = { police: 96, fire: 108, hospital: 126, school: 84, transit: 66 };
const CAPACITY: Record<ServiceKind, number> = { police: 700, fire: 900, hospital: 1400, school: 500 };

export type ServiceId = 'police' | 'fire' | 'health' | 'education' | 'transport' | 'green';

export interface Factor {
  id: string;
  label: string;
  /** 0..100, higher is better. */
  score: number;
  weight: number;
  tip: string;
}

export interface ServiceScore {
  id: ServiceId;
  label: string;
  score: number;
  /** Buildings of this kind, and the share of homes inside their reach (0..100). */
  count: number;
  coverage: number;
}

export interface Part {
  label: string;
  amount: number;
}

export interface Sample {
  happiness: number;
  population: number;
  net: number;
  congestion: number;
  treasury: number;
}

export interface CityStats {
  hasCity: boolean;
  residents: number;
  capacity: number;
  jobs: number;
  employed: number;
  unemployment: number;
  happiness: number;
  mood: string;
  factors: Factor[];
  services: ServiceScore[];
  traffic: { congestion: number; avgKmh: number; cars: number; people: number };
  environment: { pollution: number; noise: number };
  economy: { treasury: number; income: number; costs: number; net: number; incomeParts: Part[]; costParts: Part[] };
  incidents: { id: number; label: string; kind: string; status: string; age: number }[];
  totals: typeof cityState.totals;
  history: Sample[];
  heat: { minX: number; minZ: number; w: number; d: number; cells: [number, number, number][]; roads: [number, number][] };
}

// --- Reading the placed pieces -------------------------------------------------------------------

interface Layout {
  version: number;
  pieces: Record<string, Piece>;
  homes: { x: number; z: number; cap: number; gx: number; gz: number }[];
  capacity: number;
  jobs: number;
  stations: Record<ServiceKind, { x: number; z: number }[]>;
  transit: { x: number; z: number }[];
  green: number;
  pollution: number;
  noise: number;
  roadCells: number;
  upkeep: { police: number; fire: number; hospital: number; school: number; transit: number; parks: number; roads: number };
  tourism: number;
  coverage: Record<ServiceKind | 'transit', number>;
  heat: [number, number, number][];
  roads: [number, number][];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

const near = (list: { x: number; z: number }[], x: number, z: number, r: number) => list.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= r * r);

function analyse(pieces: Record<string, Piece>): Layout {
  const list = Object.values(pieces);
  const layout: Layout = {
    version: sim.worldVersion,
    pieces,
    homes: [],
    capacity: 0,
    jobs: 0,
    stations: { police: [], fire: [], hospital: [], school: [] },
    transit: [],
    green: 0,
    pollution: 0,
    noise: 0,
    roadCells: 0,
    upkeep: { police: 0, fire: 0, hospital: 0, school: 0, transit: 0, parks: 0, roads: 0 },
    tourism: 0,
    coverage: { police: 0, fire: 0, hospital: 0, school: 0, transit: 0 },
    heat: [],
    roads: [],
    bounds: { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  };
  const b = layout.bounds;
  for (const piece of list) {
    const def = PIECES[piece.type];
    if (!def || piece.type === 'span') continue;
    b.minX = Math.min(b.minX, piece.gx);
    b.maxX = Math.max(b.maxX, piece.gx);
    b.minZ = Math.min(b.minZ, piece.gz);
    b.maxZ = Math.max(b.maxZ, piece.gz);
    const scale = def.floors > 0 ? Math.max(1, piece.floors ?? def.floors) / def.floors : 1;
    const x = (piece.gx + 0.5) * 6;
    const z = (piece.gz + 0.5) * 6;
    const housing = HOUSING[piece.type];
    if (housing) {
      const cap = Math.round(housing * scale);
      layout.homes.push({ x, z, cap, gx: piece.gx, gz: piece.gz });
      layout.capacity += cap;
    }
    const jobs = JOBS[piece.type];
    if (jobs) layout.jobs += Math.round(jobs * scale);
    layout.pollution += (POLLUTION[piece.type] ?? 0) * (piece.type === 'warehouse' ? Math.max(1, scale) : 1);
    layout.noise += NOISE[piece.type] ?? 0;
    layout.green += (GREENERY[piece.type] ?? 0) + (TREE_TYPES.includes(piece.type) ? (piece.type === 'bush' ? 0.4 : 1) : 0);
    layout.tourism += (TOURISM[piece.type] ?? 0) * scale;
    if (TRANSIT_STOPS.has(piece.type)) layout.transit.push({ x, z });
    if (piece.type === 'road' || piece.type === 'crossing') {
      layout.roadCells++;
      layout.roads.push([piece.gx, piece.gz]);
    }
    const upkeep = UPKEEP[piece.type] ?? 0;
    if (piece.type === 'police') layout.upkeep.police += upkeep;
    else if (piece.type === 'firestation') layout.upkeep.fire += upkeep;
    else if (piece.type === 'hospital') layout.upkeep.hospital += upkeep;
    else if (piece.type === 'school') layout.upkeep.school += upkeep;
    else if (piece.type === 'park') layout.upkeep.parks += upkeep;
    else layout.upkeep.transit += upkeep;
    if (piece.type === 'rail' || piece.type === 'tram' || piece.type === 'monorail') layout.upkeep.roads += TRACK_UPKEEP;
  }
  layout.upkeep.roads += layout.roadCells * ROAD_UPKEEP;
  // Police, fire and ambulance crews must be able to get out onto a road; schools just need to exist.
  for (const s of sim.world.services) if (s.kind === 'school' || s.roadCell) layout.stations[s.kind].push({ x: s.x, z: s.z });

  // How much of the housing each service reaches, and a per-home picture for the map.
  const kinds: (ServiceKind | 'transit')[] = ['police', 'fire', 'hospital', 'school', 'transit'];
  const covered: Record<string, number> = { police: 0, fire: 0, hospital: 0, school: 0, transit: 0 };
  for (const home of layout.homes) {
    let have = 0;
    for (const kind of kinds) {
      const sites = kind === 'transit' ? layout.transit : layout.stations[kind];
      if (near(sites, home.x, home.z, REACH[kind])) {
        covered[kind] += home.cap;
        have++;
      }
    }
    layout.heat.push([home.gx, home.gz, have / kinds.length]);
  }
  for (const kind of kinds) layout.coverage[kind] = layout.capacity > 0 ? covered[kind] / layout.capacity : 0;
  if (!Number.isFinite(b.minX)) layout.bounds = { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  return layout;
}

// --- The running model ---------------------------------------------------------------------------------

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const STORE_KEY = 'yatc.city.v1';

function moodWord(h: number): string {
  return h >= 85 ? 'Thriving' : h >= 70 ? 'Happy' : h >= 55 ? 'Content' : h >= 40 ? 'Uneasy' : h >= 25 ? 'Unhappy' : 'Furious';
}

class CityModel {
  private layout: Layout | null = null;
  private residents = -1;
  private treasury = 4000;
  private congestion = 0;
  private clock = 0;
  private pending = 1;
  private sampleAt = 0;
  private saveAt = 20;
  private history: Sample[] = [];
  private last: CityStats | null = null;
  private lastNet = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { residents?: number; treasury?: number } | null;
      if (saved) {
        if (typeof saved.residents === 'number') this.residents = saved.residents;
        if (typeof saved.treasury === 'number') this.treasury = saved.treasury;
      }
    } catch {
      /* no saved state */
    }
  }

  /** Called every frame; does its work about once a second. */
  tick(dt: number) {
    this.clock += dt;
    this.pending += dt;
    if (this.pending < 1) return;
    const step = Math.min(3, this.pending);
    this.pending = 0;
    this.run(step);
  }

  private run(dt: number) {
    const pieces = useCityStore.getState().pieces;
    if (!this.layout || this.layout.version !== sim.worldVersion || this.layout.pieces !== pieces) this.layout = analyse(pieces);
    const L = this.layout;

    if (L.capacity === 0) this.residents = 0;
    else if (this.residents < 0) this.residents = L.capacity * 0.5;
    this.residents = Math.min(this.residents, L.capacity);

    // Traffic: how many of the cars on the road are standing still when they should be moving.
    const civ = sim.cars.filter((c) => !c.mission && !c.driven && c.abandoned === undefined);
    const crawling = civ.filter((c) => c.speed < 1.5 && c.dwell <= 0).length;
    const wrecks = civ.filter((c) => c.wreck > 0).length;
    const raw = civ.length > 3 ? clamp((crawling / civ.length) * 130 - 25 + wrecks * 8) : 0;
    this.congestion += (raw - this.congestion) * Math.min(1, dt / 10);
    const moving = civ.filter((c) => c.speed > 0.5);
    const avgKmh = moving.length > 0 ? (moving.reduce((s, c) => s + c.speed, 0) / moving.length) * 3.6 : 0;

    const broke = this.treasury < 0;
    const eff = broke ? 0.7 : 1;
    const pop = Math.max(1, this.residents);
    const supported = (kind: ServiceKind) => clamp((L.stations[kind].length * CAPACITY[kind]) / pop, 0, 1);
    const serviceScore = (kind: ServiceKind) => (L.capacity === 0 ? 0 : clamp(100 * L.coverage[kind] * (0.45 + 0.55 * supported(kind)) * eff));
    const police = serviceScore('police');
    const fire = serviceScore('fire');
    const health = serviceScore('hospital');
    const education = serviceScore('school');
    const transport = L.capacity === 0 ? 0 : clamp(100 * L.coverage.transit * (L.roadCells > 4 ? 1 : 0.7) * eff);
    const green = L.capacity === 0 ? 0 : clamp((L.green / (L.capacity / 10 + 4)) * 100);

    const cars = civ.length;
    const pollution = clamp((100 * (L.pollution + cars * 0.35 + L.roadCells * 0.12)) / (L.pollution + cars * 0.35 + L.roadCells * 0.12 + L.green * 0.5 + 20));
    const noise = clamp((100 * (L.roadCells * 0.1 + cars * 0.5 + L.noise)) / (L.roadCells * 0.1 + cars * 0.5 + L.noise + L.green * 0.2 + 40));
    const environment = 100 - (pollution + noise) / 2;

    const workforce = this.residents * 0.55;
    const employed = Math.min(L.jobs, workforce);
    const unemployment = workforce > 0 ? 1 - employed / workforce : 0;
    const jobScore = L.capacity === 0 ? 50 : clamp(100 * (1 - Math.min(1, unemployment * 1.6)));
    const trafficScore = 100 - this.congestion;

    const crimeNow = incidents.active.filter((i) => i.kind === 'crime').length;
    const safety = clamp(police - crimeNow * 10 - cityState.unanswered * 6);
    const factors: Factor[] = [
      { id: 'safety', label: 'Safety', score: safety, weight: 0.14, tip: 'Build police stations near homes, with a road beside each.' },
      { id: 'fire', label: 'Fire cover', score: fire, weight: 0.08, tip: 'Build a fire station: engines need a road to leave by.' },
      { id: 'health', label: 'Healthcare', score: health, weight: 0.13, tip: 'Build a hospital close to the housing.' },
      { id: 'education', label: 'Education', score: education, weight: 0.08, tip: 'Build a school near the homes.' },
      { id: 'transport', label: 'Public transport', score: transport, weight: 0.12, tip: 'Add bus stops, stations or metro entrances near homes.' },
      { id: 'green', label: 'Green space', score: green, weight: 0.1, tip: 'Plant trees and add parks or plazas.' },
      { id: 'environment', label: 'Clean and quiet', score: environment, weight: 0.14, tip: 'Keep factories and the airport away from homes; plant trees.' },
      { id: 'jobs', label: 'Jobs', score: jobScore, weight: 0.12, tip: unemployment > 0 ? 'People need work: build offices, shops and warehouses.' : 'Plenty of jobs.' },
      { id: 'traffic', label: 'Traffic flow', score: trafficScore, weight: 0.09, tip: 'Widen roads, add more routes, or put in trams and metro.' },
    ];
    let happiness = factors.reduce((s, f) => s + f.score * f.weight, 0);
    happiness -= Math.min(18, incidents.active.length * 2 + cityState.unanswered * 4) + (broke ? 6 : 0);
    happiness = L.capacity === 0 ? 60 : clamp(happiness);

    // People move in when the city is a good place to live and has work for them, and leave when it is not.
    if (L.capacity > 0) {
      const jobFactor = workforce > 0 ? Math.min(1, L.jobs / workforce) : 1;
      const attract = (happiness / 100) * 0.65 + jobFactor * 0.35;
      this.residents = clamp(this.residents + (attract - 0.5) * L.capacity * 0.03 * dt, L.capacity * 0.2, L.capacity);
    }

    // Money: taxes and trade in, upkeep out, plus whatever trouble cost since last time.
    const taxes = this.residents * 1.1 * (0.6 + (happiness / 100) * 0.8);
    const business = employed * 0.9;
    const tourism = L.tourism * (0.5 + happiness / 200);
    const incomeParts: Part[] = [
      { label: 'Resident taxes', amount: taxes },
      { label: 'Business', amount: business },
      { label: 'Tourism', amount: tourism },
    ];
    const costParts: Part[] = [
      { label: 'Police', amount: L.upkeep.police },
      { label: 'Fire brigade', amount: L.upkeep.fire },
      { label: 'Hospitals', amount: L.upkeep.hospital },
      { label: 'Schools', amount: L.upkeep.school },
      { label: 'Roads and tracks', amount: L.upkeep.roads },
      { label: 'Transit stops', amount: L.upkeep.transit },
      { label: 'Parks', amount: L.upkeep.parks },
    ];
    const income = incomeParts.reduce((s, p) => s + p.amount, 0);
    const costs = costParts.reduce((s, p) => s + p.amount, 0);
    const net = income - costs;
    this.lastNet = net;
    this.treasury = Math.max(-9999, this.treasury + (net / 60) * dt - cityState.damage);
    cityState.damage = 0;

    // Feed the street-level simulation.
    cityState.hasHousing = L.capacity > 0;
    cityState.occupancy = L.capacity > 0 ? this.residents / L.capacity : 1;
    cityState.happiness = happiness;
    cityState.broke = this.treasury < 0;

    if (this.clock >= this.sampleAt) {
      this.sampleAt = this.clock + 5;
      this.history.push({ happiness, population: this.residents, net, congestion: this.congestion, treasury: this.treasury });
      if (this.history.length > 72) this.history.shift();
    }
    if (this.clock >= this.saveAt) {
      this.saveAt = this.clock + 20;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ residents: this.residents, treasury: this.treasury }));
      } catch {
        /* private mode */
      }
    }

    const count = (kind: ServiceKind) => L.stations[kind].length;
    const b = L.bounds;
    const stats: CityStats = {
      hasCity: L.capacity > 0 || L.jobs > 0,
      residents: Math.round(this.residents),
      capacity: L.capacity,
      jobs: L.jobs,
      employed: Math.round(employed),
      unemployment,
      happiness: Math.round(happiness),
      mood: moodWord(happiness),
      factors,
      services: [
        { id: 'police', label: 'Police', score: Math.round(safety), count: count('police'), coverage: Math.round(L.coverage.police * 100) },
        { id: 'fire', label: 'Fire brigade', score: Math.round(fire), count: count('fire'), coverage: Math.round(L.coverage.fire * 100) },
        { id: 'health', label: 'Healthcare', score: Math.round(health), count: count('hospital'), coverage: Math.round(L.coverage.hospital * 100) },
        { id: 'education', label: 'Education', score: Math.round(education), count: count('school'), coverage: Math.round(L.coverage.school * 100) },
        { id: 'transport', label: 'Transport', score: Math.round(transport), count: L.transit.length, coverage: Math.round(L.coverage.transit * 100) },
        { id: 'green', label: 'Green space', score: Math.round(green), count: Math.round(L.green), coverage: Math.round(green) },
      ],
      traffic: { congestion: Math.round(this.congestion), avgKmh: Math.round(avgKmh), cars, people: sim.peds.length },
      environment: { pollution: Math.round(pollution), noise: Math.round(noise) },
      economy: { treasury: Math.round(this.treasury), income, costs, net, incomeParts, costParts },
      incidents: incidents.list.map((i) => ({ id: i.id, label: i.label, kind: i.kind, status: i.status, age: Math.round(i.age) })),
      totals: { ...cityState.totals },
      history: [...this.history],
      heat: { minX: b.minX, minZ: b.minZ, w: b.maxX - b.minX + 1, d: b.maxZ - b.minZ + 1, cells: L.heat, roads: L.roads },
    };
    this.last = stats;
    useCityStatsStore.setState({ stats });
  }

  /** The most recent numbers, for code that is not a React component. */
  get snapshot(): CityStats | null {
    return this.last;
  }

  get net(): number {
    return this.lastNet;
  }
}

export const cityModel = new CityModel();
