import { TREE_TYPES, type PieceType, PIECES } from '../city/catalog';
import { isPractice } from '../tutorial/runtime';
import { useCityStatsStore } from '../state/useCityStatsStore';
import { DEFAULT_POLICIES, MAYORS, TERM_LENGTH, usePoliticsStore, type Level } from '../state/usePoliticsStore';
import { combat } from './combat';
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
  policepost: 8, clinic: 20, highschool: 40, university: 90, firehq: 34, cityhall: 60, courthouse: 40, jail: 35,
};
const POLLUTION: Partial<Record<PieceType, number>> = { warehouse: 3, containers: 1.2, portcrane: 2, hangar: 2, busdepot: 2, terminal: 2, runway: 0.7, rail: 0.25, station: 0.6 };
const NOISE: Partial<Record<PieceType, number>> = { runway: 1, terminal: 3, mall: 3, hotel: 1, rail: 0.35, station: 1, tram: 0.2, monorail: 0.15, billboard: 0.3, busdepot: 2, warehouse: 1.5 };
const GREENERY: Partial<Record<PieceType, number>> = { park: 6, plaza: 2, fountain: 2, hedge: 0.3, grass: 0.1, tallgrass: 0.12, wildflower: 0.15 };
const TRANSIT_STOPS = new Set<PieceType>(['busstop', 'station', 'tramstop', 'monostation', 'metroentrance', 'taxistand']);
/** Running costs per minute. */
const UPKEEP: Partial<Record<PieceType, number>> = {
  police: 40, policepost: 14, firestation: 40, firehq: 75, hospital: 70, clinic: 25, school: 45, highschool: 60, university: 110,
  cityhall: 50, courthouse: 40, jail: 45, park: 3, busstop: 5, station: 12, tramstop: 8, monostation: 10, metroentrance: 8, busdepot: 15, terminal: 30,
};
const ROAD_UPKEEP = 0.35;
const TRACK_UPKEEP = 0.5;
const TOURISM: Partial<Record<PieceType, number>> = { hotel: 18, mall: 22, terminal: 30, skyscraper: 12 };

/** How far a service building reaches (metres), and how many residents it can look after. */
const SERVICE_INFO: Partial<Record<PieceType, { cap: number; reach: number }>> = {
  police: { cap: 700, reach: 96 }, policepost: { cap: 250, reach: 60 },
  firestation: { cap: 900, reach: 108 }, firehq: { cap: 2200, reach: 150 },
  hospital: { cap: 1400, reach: 126 }, clinic: { cap: 450, reach: 70 },
  school: { cap: 500, reach: 84 }, highschool: { cap: 900, reach: 110 }, university: { cap: 2000, reach: 150 },
};
const TRANSIT_REACH = 66;
type Cover = 'police' | 'fire' | 'hospital' | 'school' | 'transit';
interface Site {
  x: number;
  z: number;
  cap: number;
  reach: number;
}
const GROUPS = {
  police: ['police', 'policepost'], fire: ['firestation', 'firehq'], hospital: ['hospital', 'clinic'],
  school: ['school', 'highschool', 'university'], gov: ['cityhall', 'courthouse', 'jail'],
} as const;

export type ServiceId = 'police' | 'fire' | 'health' | 'education' | 'transport' | 'green' | 'government';

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
  gov: { hall: number; court: number; jail: number };
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
  stations: Record<ServiceKind, Site[]>;
  transit: Site[];
  gov: { hall: number; court: number; jail: number };
  green: number;
  pollution: number;
  noise: number;
  roadCells: number;
  upkeep: { police: number; fire: number; hospital: number; school: number; gov: number; transit: number; parks: number; roads: number };
  tourism: number;
  coverage: Record<Cover, number>;
  heat: [number, number, number][];
  roads: [number, number][];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

const near = (list: Site[], x: number, z: number) => list.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= p.reach * p.reach);

function analyse(pieces: Record<string, Piece>): Layout {
  const list = Object.values(pieces);
  const layout: Layout = {
    version: sim.worldVersion,
    pieces,
    homes: [],
    capacity: 0,
    jobs: 0,
    stations: { police: [], fire: [], hospital: [], school: [], government: [] },
    transit: [],
    gov: { hall: 0, court: 0, jail: 0 },
    green: 0,
    pollution: 0,
    noise: 0,
    roadCells: 0,
    upkeep: { police: 0, fire: 0, hospital: 0, school: 0, gov: 0, transit: 0, parks: 0, roads: 0 },
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
    if (TRANSIT_STOPS.has(piece.type)) layout.transit.push({ x, z, cap: 0, reach: TRANSIT_REACH });
    if (piece.type === 'road' || piece.type === 'crossing') {
      layout.roadCells++;
      layout.roads.push([piece.gx, piece.gz]);
    }
    const upkeep = UPKEEP[piece.type] ?? 0;
    if ((GROUPS.police as readonly PieceType[]).includes(piece.type)) layout.upkeep.police += upkeep;
    else if ((GROUPS.fire as readonly PieceType[]).includes(piece.type)) layout.upkeep.fire += upkeep;
    else if ((GROUPS.hospital as readonly PieceType[]).includes(piece.type)) layout.upkeep.hospital += upkeep;
    else if ((GROUPS.school as readonly PieceType[]).includes(piece.type)) layout.upkeep.school += upkeep;
    else if ((GROUPS.gov as readonly PieceType[]).includes(piece.type)) layout.upkeep.gov += upkeep;
    else if (piece.type === 'park') layout.upkeep.parks += upkeep;
    else layout.upkeep.transit += upkeep;
    if (piece.type === 'rail' || piece.type === 'tram' || piece.type === 'monorail') layout.upkeep.roads += TRACK_UPKEEP;
  }
  layout.upkeep.roads += layout.roadCells * ROAD_UPKEEP;
  // Police, fire and ambulance crews must be able to get out onto a road; schools just need to exist.
  for (const s of sim.world.services) {
    if (s.type === 'cityhall') layout.gov.hall++;
    else if (s.type === 'courthouse') layout.gov.court++;
    else if (s.type === 'jail') layout.gov.jail++;
    const info = SERVICE_INFO[s.type];
    if (info && (s.kind === 'school' || s.roadCell)) layout.stations[s.kind].push({ x: s.x, z: s.z, ...info });
  }

  // How much of the housing each service reaches, and a per-home picture for the map.
  const kinds: Cover[] = ['police', 'fire', 'hospital', 'school', 'transit'];
  const covered: Record<string, number> = { police: 0, fire: 0, hospital: 0, school: 0, transit: 0 };
  for (const home of layout.homes) {
    let have = 0;
    for (const kind of kinds) {
      const sites = kind === 'transit' ? layout.transit : layout.stations[kind];
      if (near(sites, home.x, home.z)) {
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

const COMPLAINT: Record<string, string> = {
  safety: '"The streets are not safe."',
  fire: '"There is no fire cover near us."',
  health: '"Where is the nearest hospital?"',
  education: '"Our children need a school."',
  transport: '"There is no bus or train near my home."',
  green: '"We need more parks and trees."',
  environment: '"The air is dirty and the noise never stops."',
  jobs: '"There are no jobs."',
  traffic: '"The traffic is unbearable."',
  government: '"Nobody is in charge here."',
};

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
    const politics = usePoliticsStore.getState();
    const hasHall = L.gov.hall > 0;
    // Policies only take effect once there is a city hall to carry them out.
    const P = hasHall ? politics.policies : DEFAULT_POLICIES;
    const budget = (l: Level) => [0.6, 1, 1.4][l];
    const power = (l: Level) => [0.82, 1, 1.15][l];
    const eff = broke ? 0.7 : 1;
    const pop = Math.max(1, this.residents);
    const supported = (kind: ServiceKind) => clamp(L.stations[kind].reduce((n, st) => n + st.cap, 0) / pop, 0, 1);
    const serviceScore = (kind: Cover, level: Level) =>
      L.capacity === 0 ? 0 : clamp(100 * L.coverage[kind] * (0.45 + 0.55 * (kind === 'transit' ? 1 : supported(kind))) * eff * power(level));
    const police = serviceScore('police', P.police);
    const fire = serviceScore('fire', 1);
    const health = serviceScore('hospital', P.health);
    const education = serviceScore('school', P.education);
    const transport = L.capacity === 0 ? 0 : clamp(100 * L.coverage.transit * (L.roadCells > 4 ? 1 : 0.7) * eff + (P.freeTransit ? 12 : 0));
    const green = L.capacity === 0 ? 0 : clamp((L.green / (L.capacity / 10 + 4)) * 100);

    const cars = civ.length;
    const pollution = clamp(((100 * (L.pollution + cars * 0.35 + L.roadCells * 0.12)) / (L.pollution + cars * 0.35 + L.roadCells * 0.12 + L.green * 0.5 + 20)) * (P.greenRules ? 0.8 : 1));
    const noise = clamp((100 * (L.roadCells * 0.1 + cars * 0.5 + L.noise)) / (L.roadCells * 0.1 + cars * 0.5 + L.noise + L.green * 0.2 + 40));
    const environment = 100 - (pollution + noise) / 2;

    const workforce = this.residents * 0.55;
    const employed = Math.min(L.jobs, workforce);
    const unemployment = workforce > 0 ? 1 - employed / workforce : 0;
    const jobScore = L.capacity === 0 ? 50 : clamp(100 * (1 - Math.min(1, unemployment * 1.6)));
    const trafficScore = 100 - this.congestion;

    const crimeNow = incidents.active.filter((i) => i.kind === 'crime').length;
    const justice = Math.min(25, L.gov.court * 15 + L.gov.jail * 10);
    const safety = clamp(police - crimeNow * 10 - cityState.unanswered * 6 + justice * 0.5);
    const govScore = clamp((hasHall ? 55 : 25) + justice + (politics.approval - 50) * 0.4);
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
      { id: 'government', label: 'Government', score: govScore, weight: 0.06, tip: hasHall ? 'Courts and a jail keep order; keep the mayor popular.' : 'Build a city hall to run policies and hold elections.' },
    ];
    let happiness = factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0);
    happiness -= (P.tax - 1) * 7;
    happiness -= Math.min(18, incidents.active.length * 2 + cityState.unanswered * 4) + (broke ? 6 : 0);
    happiness = L.capacity === 0 ? 60 : clamp(happiness);

    // People move in when the city is a good place to live and has work for them, and leave when it is not.
    if (L.capacity > 0) {
      const jobFactor = workforce > 0 ? Math.min(1, L.jobs / workforce) : 1;
      const attract = (happiness / 100) * 0.65 + jobFactor * 0.35;
      this.residents = clamp(this.residents + (attract - 0.5) * L.capacity * 0.03 * dt, L.capacity * 0.2, L.capacity);
    }

    // Money: taxes and trade in, upkeep out, plus whatever trouble cost since last time.
    const taxes = this.residents * 1.1 * (0.6 + (happiness / 100) * 0.8) * [0.7, 1, 1.35][P.tax];
    const business = employed * 0.9 * (P.greenRules ? 0.92 : 1);
    const tourism = L.tourism * (0.5 + happiness / 200);
    const incomeParts: Part[] = [
      { label: 'Resident taxes', amount: taxes },
      { label: 'Business', amount: business },
      { label: 'Tourism', amount: tourism },
    ];
    const costParts: Part[] = [
      { label: 'Police', amount: L.upkeep.police * budget(P.police) },
      { label: 'Fire brigade', amount: L.upkeep.fire },
      { label: 'Hospitals', amount: L.upkeep.hospital * budget(P.health) },
      { label: 'Schools', amount: L.upkeep.school * budget(P.education) },
      { label: 'Government', amount: L.upkeep.gov },
      { label: 'Roads and tracks', amount: L.upkeep.roads },
      { label: 'Transit stops', amount: L.upkeep.transit * (P.freeTransit ? 1.8 : 1) },
      { label: 'Parks', amount: L.upkeep.parks },
      { label: 'Green rules', amount: P.greenRules ? 25 : 0 },
    ];
    const income = incomeParts.reduce((s, p) => s + p.amount, 0);
    const costs = costParts.reduce((s, p) => s + p.amount, 0);
    const net = income - costs;
    this.lastNet = net;
    this.treasury = Math.max(-9999, this.treasury + (net / 60) * dt - cityState.damage);
    cityState.damage = 0;

    // The mayor: approval follows how people feel; when the term ends there is an election.
    if (hasHall) {
      const target = happiness + (P.tax === 0 ? 6 : P.tax === 2 ? -8 : 0) + (P.freeTransit ? 4 : 0) + (L.gov.court > 0 ? 3 : 0) - Math.min(15, cityState.unanswered * 3) - (broke ? 10 : 0);
      const approval = clamp(politics.approval + (target - politics.approval) * Math.min(1, dt / 25));
      const term = politics.term + dt;
      if (term >= TERM_LENGTH) this.holdElection(approval);
      else usePoliticsStore.setState({ approval, term });
    }
    const grumbles: string[] = [];
    for (const f of [...factors].sort((a, b) => a.score - b.score).slice(0, 3)) if (f.score < 55) grumbles.push(COMPLAINT[f.id] ?? '');
    if (P.tax === 2) grumbles.push('"Taxes are far too high!"');
    if (broke) grumbles.push('"The city is broke. Who is running this place?"');
    const complaints = grumbles.filter(Boolean).slice(0, 4);
    if (complaints.join('|') !== politics.complaints.join('|')) usePoliticsStore.setState({ complaints });

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
    if (!isPractice && this.clock >= this.saveAt) {
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
        { id: 'government', label: 'Government', score: Math.round(govScore), count: L.gov.hall + L.gov.court + L.gov.jail, coverage: Math.round(govScore) },
      ],
      gov: { ...L.gov },
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

  private holdElection(approval: number) {
    const state = usePoliticsStore.getState();
    const share = clamp(approval + (Math.random() - 0.5) * 8);
    if (share >= 50) {
      usePoliticsStore.setState({ term: 0, termsWon: state.termsWon + 1, approval, lastElection: { won: true, share: Math.round(share), mayor: state.mayor } });
      combat.toast(`${state.mayor} is re-elected with ${Math.round(share)}%.`, 'good');
      return;
    }
    // Voted out: a new mayor arrives with a few ideas of their own.
    const mayor = MAYORS.filter((m) => m !== state.mayor)[Math.floor(Math.random() * (MAYORS.length - 1))];
    const policies = { ...DEFAULT_POLICIES };
    policies.tax = Math.floor(Math.random() * 3) as Level;
    policies[(['police', 'health', 'education'] as const)[Math.floor(Math.random() * 3)]] = Math.floor(Math.random() * 3) as Level;
    policies.freeTransit = Math.random() < 0.3;
    usePoliticsStore.setState({ mayor, policies, approval: 55, term: 0, lastElection: { won: false, share: Math.round(share), mayor } });
    combat.toast(`${state.mayor} was voted out. ${mayor} is the new mayor.`, 'warn');
  }

  /** Adds (or takes) money from the city treasury: contract rewards go in here. */
  addFunds(amount: number) {
    this.treasury += amount;
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
