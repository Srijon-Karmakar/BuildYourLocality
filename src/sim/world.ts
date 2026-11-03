import { CELL, PIECES, blockBox, crossingArms, pieceFootprint, resolveRoad, resolveStyle, roadLayout, TREE_TYPES, isTreeType, type PieceType, type RoadLayout } from '../city/catalog';
import { maxDoorOffset, wallPlacement } from '../city/wall';
import { cellKey, footprintCells, reservedCells, type Piece } from '../state/useCityStore';
import { cellTerrain, hasTerrain, walkableTerrain } from '../terrain/terrain';

/** Compass directions in road-mask bit order: N (-z), E (+x), S (+z), W (-x). */
export const DIRS = [
  { dx: 0, dz: -1, bit: 1 },
  { dx: 1, dz: 0, bit: 2 },
  { dx: 0, dz: 1, bit: 4 },
  { dx: -1, dz: 0, bit: 8 },
] as const;

export const cellCentre = (g: number) => (g + 0.5) * CELL;
export const cellOf = (v: number) => Math.floor(v / CELL);

export type DestinationKind = 'bench' | 'busstop' | 'kiosk' | 'billboard' | 'door' | 'green' | 'station' | 'metro' | 'taxi';

/** Somewhere a pedestrian can go and do something. */
export interface Destination {
  kind: DestinationKind;
  /** Piece this belongs to; a destination disappears when its piece is deleted. */
  pieceId: string;
  /** Walkable cell to path to. */
  approach: [number, number];
  /** Exact spot to finish at (a seat, the door, a viewing spot ...). */
  point: { x: number; z: number };
  /** Heading (radians, forward = (sin, cos)) to face once there. */
  facing: number;
  /** Seconds to spend there: [min, max]. */
  dwell: [number, number];
}

export interface BusStop {
  pieceId: string;
  /** Road cell buses stop in. */
  roadCell: string;
  x: number;
  z: number;
}

/** What traffic needs to know about one road cell. */
export interface RoadInfo {
  layout: RoadLayout;
  /** Index into DIRS of the only allowed direction, or null for two-way. */
  oneWay: number | null;
  /** A junction that is built as a roundabout. */
  roundabout: boolean;
  crosswalk: boolean;
  /** A mid-block zebra crossing (straight cells only). */
  zebra: boolean;
}

/** A straight strip of runway cells that aircraft can land on and take off from. */
export interface RunwayStrip {
  /** Cells in increasing order along the strip. */
  cells: [number, number][];
  /** True when the strip runs along x (east-west), false along z. */
  alongX: boolean;
  /** Side turn-offs: the runway cell index and the taxiway/apron cell it opens onto. */
  exits: { index: number; to: [number, number] }[];
  /** Set while an aircraft is using the strip, so only one at a time lands or takes off. */
  owner: number | null;
}

/** One parking bay: where a parked car sits and which way it faces. */
export interface Bay {
  x: number;
  z: number;
  heading: number;
}

export interface ParkingLot {
  pieceId: string;
  /** Road cell the lot's entrance opens onto (null if it isn't beside a road). */
  roadCell: string | null;
  bays: Bay[];
}

/** A spot beside a pier where a ship can tie up. */
export interface Berth {
  pier: [number, number];
  /** Water cell the ship floats in, its centre, and the heading that runs alongside the pier. */
  water: [number, number];
  x: number;
  z: number;
  heading: number;
  /** Id of the ship using it. */
  owner: number | null;
}

export interface SimWorld {
  /** Road cell key -> bitmask of connected neighbours. */
  roads: Map<string, number>;
  roadInfo: Map<string, RoadInfo>;
  /** Rail cell key -> bitmask of connected neighbours (track, stations, level crossings). */
  rails: Map<string, number>;
  /** Station cells (track with an island platform), by cell key. */
  stations: Map<string, { pieceId: string; x: number; z: number }>;
  /** Cells where road and rail cross; cars give way to trains here. */
  levelCrossings: Set<string>;
  parkingLots: ParkingLot[];
  /** Road cells beside a taxi stand (taxis stop there). */
  taxiByRoad: Map<string, { pieceId: string }>;
  /** Road cells beside a bus depot, where buses start and finish their day. */
  depotRoads: string[];
  piers: Set<string>;
  berths: Berth[];
  /** Water the ships can sail: cells connected to a berth. */
  sea: Set<string>;
  /** Runway, taxiway and apron cells, linked as one network for aircraft. */
  taxi: Map<string, number>;
  runwayCells: Set<string>;
  apronCells: Set<string>;
  runways: RunwayStrip[];
  /** Spots just outside terminal doors, where arriving passengers step out. */
  terminalExits: { x: number; z: number }[];
  /** Underground metro line cells, and which separate line each entrance belongs to (-1 = unconnected). */
  metroTracks: Map<string, number>;
  metroGroup: Map<string, number>;
  /** Cells claimed by wide roads (painted over by them, so people treat them as road). */
  wideCells: Set<string>;
  /** Road cells with three or more connections. */
  junctions: Set<string>;
  /** Straight road cells with a zebra crossing, where traffic gives way to people. */
  crossings: Set<string>;
  /** Junctions that have a traffic light beside them. */
  signalled: Set<string>;
  /** Cells pedestrians and vehicles can't enter (buildings, trees, kiosks ...). */
  blocked: Set<string>;
  /** Kind of the cells that hold a piece pedestrians prefer (paths cost less on them). */
  pleasant: Set<string>;
  /** Cells whose building blocks line of sight (monsters cannot see through them). */
  sight: Set<string>;
  /** Trees, hedges and parks: crouching beside them hides you. */
  foliage: Set<string>;
  /** Street lamps (world position), which light up the night and make you easier to spot. */
  lamps: { x: number; z: number }[];
  destinations: Destination[];
  busStops: BusStop[];
  busByRoad: Map<string, BusStop>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  /** Counts used to size the population. */
  stats: { buildings: number; greens: number; roads: number };
}

/** Props that physically fill their cell. Lamps, lights and benches' neighbours stay walkable. */
const SOLID_PROPS = new Set<PieceType>([...TREE_TYPES, 'hedge', 'fountain', 'kiosk', 'busstop', 'billboard', 'bench', 'taxistand']);

export const emptyWorld = (): SimWorld => ({
  roads: new Map(),
  roadInfo: new Map(),
  rails: new Map(),
  parkingLots: [],
  taxiByRoad: new Map(),
  depotRoads: [],
  piers: new Set(),
  berths: [],
  sea: new Set(),
  taxi: new Map(),
  runwayCells: new Set(),
  apronCells: new Set(),
  runways: [],
  terminalExits: [],
  stations: new Map(),
  levelCrossings: new Set(),
  metroTracks: new Map(),
  metroGroup: new Map(),
  wideCells: new Set(),
  junctions: new Set(),
  crossings: new Set(),
  signalled: new Set(),
  blocked: new Set(),
  pleasant: new Set(),
  sight: new Set(),
  foliage: new Set(),
  lamps: [],
  destinations: [],
  busStops: [],
  busByRoad: new Map(),
  bounds: null,
  stats: { buildings: 0, greens: 0, roads: 0 },
});

export function isWalkable(world: SimWorld, gx: number, gz: number): boolean {
  const b = world.bounds;
  if (!b || gx < b.minX || gx > b.maxX || gz < b.minZ || gz > b.maxZ) return false;
  const key = cellKey(gx, gz);
  if (world.blocked.has(key)) return false;
  // Bridges are roads, so they stay walkable; everything else must be dry, gentle, open ground.
  return world.roads.has(key) || world.rails.has(key) || world.piers.has(key) || walkableTerrain(gx, gz);
}

/** Direction (unit x/z) a piece's local +z points after its rotation. */
const frontOf = (rot: number): [number, number] => {
  const a = (rot * Math.PI) / 2;
  return [Math.round(Math.sin(a)), Math.round(Math.cos(a))];
};
const headingOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Turns the city's pieces into the road graph, walkable grid and points of interest. */
export function buildWorld(pieces: Piece[]): SimWorld {
  const world = emptyWorld();
  if (pieces.length === 0) return world;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const lights: { gx: number; gz: number }[] = [];
  /** Arms a crossing accepts for each network (everything else accepts all four). */
  const roadArms = new Map<string, number>();
  const depotCells: string[] = [];
  const lotPieces: Piece[] = [];
  const railArms = new Map<string, number>();
  const doorCandidates: { piece: Piece; x: number; z: number; outX: number; outZ: number }[] = [];

  for (const piece of pieces) {
    const def = PIECES[piece.type];
    const cells = footprintCells(piece.type, piece.gx, piece.gz, piece.rot, piece.lot);
    const [w, d] = pieceFootprint(piece);
    minX = Math.min(minX, piece.gx);
    maxX = Math.max(maxX, piece.gx + w - 1);
    minZ = Math.min(minZ, piece.gz);
    maxZ = Math.max(maxZ, piece.gz + d - 1);

    if (piece.type === 'rail' || piece.type === 'station') {
      world.rails.set(cells[0], 0);
      if (piece.type === 'station') {
        world.stations.set(cells[0], { pieceId: piece.id, x: cellCentre(piece.gx), z: cellCentre(piece.gz) });
        world.blocked.add(cells[0]); // the platform is reached from the side, not crossed
      }
      continue;
    }
    if (piece.type === 'pier') {
      world.piers.add(cells[0]);
      continue;
    }
    if (piece.type === 'busdepot') depotCells.push(...cells);
    if (piece.type === 'portcrane' || piece.type === 'containers') {
      world.blocked.add(cells[0]);
      continue;
    }
    if (piece.type === 'parking') {
      lotPieces.push(piece);
      continue;
    }
    if (piece.type === 'runway' || piece.type === 'taxiway' || piece.type === 'apron') {
      world.taxi.set(cells[0], 0);
      world.blocked.add(cells[0]); // people keep off the airfield
      if (piece.type === 'runway') world.runwayCells.add(cells[0]);
      if (piece.type === 'apron') world.apronCells.add(cells[0]);
      continue;
    }
    if (piece.type === 'metrotrack') {
      world.metroTracks.set(cells[0], 0);
      continue;
    }
    if (piece.type === 'metroentrance') {
      world.blocked.add(cells[0]);
      continue;
    }
    if (piece.type === 'road' || piece.type === 'crossing') {
      const spec = resolveRoad(piece.road);
      if (piece.type === 'crossing') {
        world.levelCrossings.add(cells[0]);
        world.rails.set(cells[0], 0);
        roadArms.set(cells[0], crossingArms(piece.rot, 'road'));
        railArms.set(cells[0], crossingArms(piece.rot, 'rail'));
      }
      world.roads.set(cells[0], 0);
      world.roadInfo.set(cells[0], {
        layout: roadLayout(spec),
        oneWay: spec.oneWay,
        roundabout: spec.roundabout,
        crosswalk: spec.crosswalk || piece.type === 'crossing',
        zebra: spec.zebra,
      });
      world.stats.roads++;
      continue;
    }
    if (def.paintable) {
      for (const c of cells) {
        world.blocked.add(c);
        world.sight.add(c);
      }
      world.stats.buildings++;
      addDoor(piece, w, d, doorCandidates);
      continue;
    }
    if (SOLID_PROPS.has(piece.type)) for (const c of cells) world.blocked.add(c);
    if (isTreeType(piece.type) || piece.type === 'hedge' || piece.type === 'park') for (const c of cells) world.foliage.add(c);
    if (piece.type === 'lamp') world.lamps.push({ x: cellCentre(piece.gx) + (piece.offset?.[0] ?? 0), z: cellCentre(piece.gz) + (piece.offset?.[1] ?? 0) });
    if (piece.type === 'trafficlight') lights.push({ gx: piece.gx, gz: piece.gz });
    if (piece.type === 'park' || piece.type === 'plaza') {
      world.pleasant.add(cells[0]);
      world.stats.greens++;
      world.destinations.push({
        kind: 'green',
        pieceId: piece.id,
        approach: [piece.gx, piece.gz],
        point: { x: cellCentre(piece.gx), z: cellCentre(piece.gz) },
        facing: 0,
        dwell: [4, 10],
      });
    }
  }

  world.bounds = { minX: minX - 3, maxX: maxX + 3, minZ: minZ - 3, maxZ: maxZ + 3 };

  /** Connectivity of one network: a link needs both cells to accept it (level crossings only take their own axis). */
  const connect = (network: Map<string, number>, arms: Map<string, number>) => {
    for (const key of network.keys()) {
      const [gx, gz] = key.split(',').map(Number);
      let mask = 0;
      for (const dir of DIRS) {
        const other = cellKey(gx + dir.dx, gz + dir.dz);
        const back = DIRS[(DIRS.indexOf(dir) + 2) % 4].bit;
        if (network.has(other) && ((arms.get(key) ?? 15) & dir.bit) && ((arms.get(other) ?? 15) & back)) mask |= dir.bit;
      }
      network.set(key, mask);
    }
  };
  connect(world.rails, railArms);
  connect(world.taxi, new Map());
  connect(world.metroTracks, new Map());
  connect(world.roads, roadArms);

  // Runway strips: straight chains of runway cells at least four long (24 m).
  const seenRunway = new Set<string>();
  for (const start of world.runwayCells) {
    if (seenRunway.has(start)) continue;
    const group: [number, number][] = [];
    const stack = [start];
    seenRunway.add(start);
    while (stack.length) {
      const key = stack.pop()!;
      const [gx, gz] = key.split(',').map(Number);
      group.push([gx, gz]);
      for (const dir of DIRS) {
        const other = cellKey(gx + dir.dx, gz + dir.dz);
        if (world.runwayCells.has(other) && !seenRunway.has(other) && (world.taxi.get(key) ?? 0) & dir.bit) {
          seenRunway.add(other);
          stack.push(other);
        }
      }
    }
    const alongX = group.every(([, z]) => z === group[0][1]);
    const alongZ = group.every(([x]) => x === group[0][0]);
    if (group.length < 4 || (!alongX && !alongZ)) continue;
    group.sort((a, b) => (alongX ? a[0] - b[0] : a[1] - b[1]));
    const strip: RunwayStrip = { cells: group, alongX, exits: [], owner: null };
    group.forEach(([gx, gz], index) => {
      const sides = alongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [dx, dz] of sides) {
        const other = cellKey(gx + dx, gz + dz);
        const bit = DIRS.find((d) => d.dx === dx && d.dz === dz)!.bit;
        if (world.taxi.has(other) && !world.runwayCells.has(other) && (world.taxi.get(cellKey(gx, gz)) ?? 0) & bit) {
          strip.exits.push({ index, to: [gx + dx, gz + dz] });
        }
      }
    });
    world.runways.push(strip);
  }

  // Underground lines: group connected metro cells so entrances know which ones link up.
  const lineOf = new Map<string, number>();
  let lines = 0;
  for (const start of world.metroTracks.keys()) {
    if (lineOf.has(start)) continue;
    const stack = [start];
    lineOf.set(start, lines);
    while (stack.length) {
      const key = stack.pop()!;
      const [gx, gz] = key.split(',').map(Number);
      const mask = world.metroTracks.get(key) ?? 0;
      for (const dir of DIRS) {
        const other = cellKey(gx + dir.dx, gz + dir.dz);
        if (mask & dir.bit && !lineOf.has(other)) {
          lineOf.set(other, lines);
          stack.push(other);
        }
      }
    }
    lines++;
  }
  for (const piece of pieces) {
    if (piece.type !== 'metroentrance') continue;
    const near = DIRS.map((d) => cellKey(piece.gx + d.dx, piece.gz + d.dz)).find((k) => lineOf.has(k));
    world.metroGroup.set(piece.id, near ? lineOf.get(near)! : -1);
  }

  // Parking lots: bays laid out in two rows either side of an aisle, entrance on the front (+z) side.
  for (const piece of lotPieces) {
    const [w, d] = pieceFootprint(piece);
    const theta = (piece.rot * Math.PI) / 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const cx = (piece.gx + w / 2) * CELL;
    const cz = (piece.gz + d / 2) * CELL;
    const bays: Bay[] = [];
    for (const [row, heading] of [[-4, 0], [4, Math.PI]] as const) {
      for (const bx of [-4.5, -1.5, 1.5, 4.5]) {
        bays.push({ x: cx + bx * cos + row * sin, z: cz - bx * sin + row * cos, heading: heading + theta });
      }
    }
    const around: string[] = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      for (const dir of DIRS) {
        const gx = piece.gx + x + dir.dx;
        const gz = piece.gz + z + dir.dz;
        const k = cellKey(gx, gz);
        if (gx < piece.gx || gx >= piece.gx + w || gz < piece.gz || gz >= piece.gz + d) if (world.roads.has(k)) around.push(k);
      }
    }
    const [fx, fz] = frontOf(piece.rot);
    const front = around.find((k) => {
      const [gx, gz] = k.split(',').map(Number);
      return (gx - (piece.gx + (w - 1) / 2)) * fx + (gz - (piece.gz + (d - 1) / 2)) * fz > 0.9;
    });
    world.parkingLots.push({ pieceId: piece.id, roadCell: front ?? around[0] ?? null, bays });
  }

  // Bus depots open onto any road cell beside them.
  for (const key of new Set(depotCells)) {
    const [gx, gz] = key.split(',').map(Number);
    for (const dir of DIRS) {
      const k = cellKey(gx + dir.dx, gz + dir.dz);
      if (world.roads.has(k) && !depotCells.includes(k) && !world.depotRoads.includes(k)) world.depotRoads.push(k);
    }
  }

  // Berths: open water beside a pier, plus all the water a ship can reach from there.
  if (world.piers.size > 0 && hasTerrain()) {
    const occupied = new Set(pieces.flatMap((p) => footprintCells(p.type, p.gx, p.gz, p.rot, p.lot)));
    const isOpenWater = (gx: number, gz: number) => !occupied.has(cellKey(gx, gz)) && cellTerrain(gx, gz).water;
    const queue: [number, number][] = [];
    for (const key of world.piers) {
      const [gx, gz] = key.split(',').map(Number);
      for (const dir of DIRS) {
        const wx = gx + dir.dx;
        const wz = gz + dir.dz;
        if (!isOpenWater(wx, wz) || world.sea.has(cellKey(wx, wz))) continue;
        // Run alongside the pier: the ship's long axis is perpendicular to the pier-to-water direction.
        world.berths.push({ pier: [gx, gz], water: [wx, wz], x: cellCentre(wx), z: cellCentre(wz), heading: Math.atan2(-dir.dz, dir.dx), owner: null });
        world.sea.add(cellKey(wx, wz));
        queue.push([wx, wz]);
      }
    }
    for (let i = 0; i < queue.length && world.sea.size < 3500; i++) {
      const [gx, gz] = queue[i];
      for (const dir of DIRS) {
        const nx = gx + dir.dx;
        const nz = gz + dir.dz;
        const k = cellKey(nx, nz);
        if (world.sea.has(k) || !isOpenWater(nx, nz)) continue;
        world.sea.add(k);
        queue.push([nx, nz]);
      }
    }
  }

  // Road junctions and zebra crossings.
  for (const key of world.roads.keys()) {
    const [gx, gz] = key.split(',').map(Number);
    void gx;
    void gz;
    const mask = world.roads.get(key) ?? 0;
    if (world.levelCrossings.has(key)) world.junctions.add(key); // cars take turns with trains here
    else if (DIRS.filter((d) => mask & d.bit).length >= 3) world.junctions.add(key);
    else {
      const info = world.roadInfo.get(key);
      if (info) info.roundabout = false; // only junctions can be roundabouts
      // Zebra crossings need a straight stretch (one arm or two opposite arms).
      const straight = mask === 1 || mask === 4 || mask === 5 || mask === 2 || mask === 8 || mask === 10;
      if (info?.zebra && straight) world.crossings.add(key);
    }
  }
  for (const key of reservedCells(Object.fromEntries(pieces.map((p) => [p.id, p])))) {
    if (!world.roads.has(key)) world.wideCells.add(key);
  }
  for (const key of world.junctions) {
    const [gx, gz] = key.split(',').map(Number);
    if (lights.some((l) => Math.abs(l.gx - gx) <= 1 && Math.abs(l.gz - gz) <= 1)) world.signalled.add(key);
  }

  const walkable = (gx: number, gz: number) => isWalkable(world, gx, gz);
  /** First walkable cell found in the direction `front` (then its neighbours), for approaching props. */
  const approachCell = (x: number, z: number, fx: number, fz: number, dist: number): [number, number] | null => {
    const candidates: [number, number][] = [
      [cellOf(x + fx * dist), cellOf(z + fz * dist)],
      [cellOf(x + fz * dist), cellOf(z + fx * dist)],
      [cellOf(x - fz * dist), cellOf(z - fx * dist)],
    ];
    return candidates.find(([gx, gz]) => walkable(gx, gz)) ?? null;
  };

  for (const piece of pieces) {
    const [fx, fz] = frontOf(piece.rot);
    const x = cellCentre(piece.gx);
    const z = cellCentre(piece.gz);
    switch (piece.type) {
      case 'bench': {
        const approach = approachCell(x, z, fx, fz, 4);
        if (approach) {
          world.destinations.push({
            kind: 'bench',
            pieceId: piece.id,
            approach,
            point: { x, z },
            facing: headingOf(fx, fz),
            dwell: [8, 22],
          });
        }
        break;
      }
      case 'busstop': {
        const approach = approachCell(x, z, fx, fz, 4);
        const roadKey = DIRS.map((d) => cellKey(piece.gx + d.dx, piece.gz + d.dz)).find((k) => world.roads.has(k));
        if (approach && roadKey) {
          const stop: BusStop = { pieceId: piece.id, roadCell: roadKey, x, z };
          world.busStops.push(stop);
          world.busByRoad.set(roadKey, stop);
          world.destinations.push({
            kind: 'busstop',
            pieceId: piece.id,
            approach,
            point: { x: x + fx * 1.1, z: z + fz * 1.1 },
            facing: headingOf(fx, fz),
            dwell: [10, 30],
          });
        }
        break;
      }
      case 'station': {
        // The island platform is reached from either side of the track.
        const mask = world.rails.get(cellKey(piece.gx, piece.gz)) ?? 0;
        const alongNS = !!(mask & 5) || !(mask & 10);
        const sides: [number, number][] = alongNS ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
        const side = sides.find(([sx, sz]) => walkable(piece.gx + sx, piece.gz + sz));
        if (side) {
          world.destinations.push({
            kind: 'station',
            pieceId: piece.id,
            approach: [piece.gx + side[0], piece.gz + side[1]],
            point: { x, z },
            facing: headingOf(-side[0], -side[1]),
            dwell: [12, 40],
          });
        }
        break;
      }
      case 'metroentrance': {
        const approach = approachCell(x, z, fx, fz, 4);
        if (approach) {
          world.destinations.push({
            kind: 'metro',
            pieceId: piece.id,
            approach,
            point: { x: x + fx * 2.2, z: z + fz * 2.2 },
            facing: headingOf(-fx, -fz),
            dwell: [2, 3],
          });
        }
        break;
      }
      case 'taxistand': {
        const approach = approachCell(x, z, fx, fz, 4);
        const roadKey = DIRS.map((d) => cellKey(piece.gx + d.dx, piece.gz + d.dz)).find((k) => world.roads.has(k));
        if (approach && roadKey) {
          world.taxiByRoad.set(roadKey, { pieceId: piece.id });
          world.destinations.push({
            kind: 'taxi',
            pieceId: piece.id,
            approach,
            point: { x: x + fx * 1.2, z: z + fz * 1.2 },
            facing: headingOf(fx, fz),
            dwell: [8, 25],
          });
        }
        break;
      }
      case 'kiosk': {
        const approach = approachCell(x, z, fx, fz, 4.2);
        if (approach) {
          world.destinations.push({
            kind: 'kiosk',
            pieceId: piece.id,
            approach,
            point: { x: x + fx * 4.2, z: z + fz * 4.2 },
            facing: headingOf(-fx, -fz),
            dwell: [3, 7],
          });
        }
        break;
      }
      case 'billboard': {
        const approach = approachCell(x, z, fx, fz, 6);
        if (approach) {
          world.destinations.push({
            kind: 'billboard',
            pieceId: piece.id,
            approach,
            point: { x: x + fx * 6, z: z + fz * 6 },
            facing: headingOf(-fx, -fz),
            dwell: [4, 9],
          });
        }
        break;
      }
    }
  }

  for (const c of doorCandidates) {
    if (c.piece.type === 'terminal' && walkable(cellOf(c.outX), cellOf(c.outZ))) world.terminalExits.push({ x: c.outX, z: c.outZ });
  }
  for (const c of doorCandidates) {
    const approach: [number, number] = [cellOf(c.outX), cellOf(c.outZ)];
    if (!walkable(approach[0], approach[1])) continue; // door opens onto a wall or into its own lot
    world.destinations.push({
      kind: 'door',
      pieceId: c.piece.id,
      approach,
      point: { x: c.x, z: c.z },
      facing: Math.atan2(c.x - c.outX, c.z - c.outZ),
      dwell: [8, 25],
    });
  }

  return world;
}

/** Finds a building's door in world space and the spot just outside it. */
function addDoor(
  piece: Piece,
  w: number,
  d: number,
  out: { piece: Piece; x: number; z: number; outX: number; outZ: number }[],
) {
  const style = resolveStyle(piece.type, piece);
  if (style.door.style === 'none') return;
  const block = style.blocks[style.door.block] ?? style.blocks[0];
  const wall = wallPlacement(blockBox(block, style.lot), style.door.side);
  const offset = Math.max(-maxDoorOffset(wall.length), Math.min(maxDoorOffset(wall.length), style.door.offset));
  const psi = wall.rotY;

  // Door and outward point in the lot's local frame (+x along the wall, +z out of it).
  const lx = wall.position[0] + Math.cos(psi) * offset;
  const lz = wall.position[2] - Math.sin(psi) * offset;
  const ox = lx + Math.sin(psi) * 1.8;
  const oz = lz + Math.cos(psi) * 1.8;

  // Lot frame -> world: rotate by the piece's turn, then move to the footprint centre.
  const theta = (piece.rot * Math.PI) / 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = (piece.gx + w / 2) * CELL;
  const cz = (piece.gz + d / 2) * CELL;
  out.push({
    piece,
    x: cx + lx * cos + lz * sin,
    z: cz - lx * sin + lz * cos,
    outX: cx + ox * cos + oz * sin,
    outZ: cz - ox * sin + oz * cos,
  });
}
