import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { memo, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useCityStore, roadMaskAt, type Piece } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import {
  CELL,
  PIECES,
  blockBox,
  collidersOf,
  isShaped,
  isOverlay,
  pieceFootprint,
  resolveStyle,
  roofHeightOf,
  type Block,
  type BuildingStyle,
  type DoorStyle,
  type FacadeId,
  type PieceType,
  type RoadSpec,
  type RoofId,
} from './catalog';
import { Chimney, Balconies, LedScreen, RoofExtras, SignBoard } from './buildingExtras';
import { BlockDetails } from './buildingDetails';
import { getFacadeMaterial, getRoofMaterial } from './cityTextures';
import { WATER_LEVEL, useTerrainStore } from '../terrain/terrain';
import { LOT_HEIGHT, boxBodyGeometry, gableRoofGeometry } from './geometries';
import { shapedBodyGeometry } from './shapes';
import { roadGeometry } from './roadGeometry';
import { darkMetalMaterial, glassDoorMaterial, metalMaterial, plinthMaterial, slabMaterial, solidMaterial } from './materials';
import { registerWet } from './nightLights';
import { PropModel } from './props';
import { WallModel, wallColliders } from './WallModel';
import { SpanModel, SpanView } from './SpanModel';
import type { SpanSpec } from './spans';
import { resolveWall, type WallSpec } from './walls';
import { seedFromId as seedOfId, type TreeSpec } from './trees';
import {
  ApronModel,
  ConnectedRail,
  ContainersModel,
  ParkingModel,
  PierModel,
  PortCraneModel,
  TaxiStandModel,
  CrossingModel,
  MetroEntranceModel,
  MetroTrackModel, MonorailModel, MonorailStationModel, TramStopModel, TramTrackModel,
  RailModel,
  RunwayModel,
  StationModel,
  TaxiwayModel,
} from './transitModels';
import { maxDoorOffset, wallPlacement } from './wall';

export { maxDoorOffset };

const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
const stylisedRoadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08 });
registerWet(roadMaterial);
registerWet(stylisedRoadMaterial);

/** Cheap stable per-cell variation so repeated trees/houses don't look cloned. */
function seedOf(gx: number, gz: number): number {
  const n = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// --- Roads ---------------------------------------------------------------------

export function RoadModel({ mask, road, bridge = false }: { mask: number; road?: Partial<RoadSpec>; bridge?: boolean }) {
  const stylised = useGameStore((s) => s.graphics.stylised);
  return <mesh geometry={roadGeometry(mask, road, bridge)} material={stylised ? stylisedRoadMaterial : roadMaterial} receiveShadow castShadow />;
}

function ConnectedRoad({ gx, gz, road }: { gx: number; gz: number; road?: Partial<RoadSpec> }) {
  const mask = useCityStore((s) => roadMaskAt(s.pieces, s.occupancy, gx, gz));
  // A road laid over water becomes a bridge.
  const bridge = useTerrainStore((s) => (s.cells[`${gx},${gz}`]?.h ?? 0) < WATER_LEVEL);
  return <RoadModel mask={mask} road={road} bridge={bridge} />;
}

// --- Buildings -----------------------------------------------------------------

const garageGrooveMaterial = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.8 });
const awningMaterials = ['#c0392b', '#2b6cb0', '#2f855a'].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
);

/** A door on its wall, facing local +z, standing on the lot slab. */
function DoorModel({ style, color, trim }: { style: DoorStyle; color: string; trim: string }) {
  const leaf = solidMaterial(color, 0.65);
  const frame = solidMaterial(trim, 0.7);
  const y0 = LOT_HEIGHT;
  switch (style) {
    case 'single':
      return (
        <group>
          <mesh position={[0, y0 + 1.15, 0.03]} material={frame} castShadow>
            <boxGeometry args={[1.3, 2.3, 0.1]} />
          </mesh>
          <mesh position={[0, y0 + 1.05, 0.09]} material={leaf} castShadow>
            <boxGeometry args={[1, 2.1, 0.08]} />
          </mesh>
          <mesh position={[0.35, y0 + 1, 0.15]} material={metalMaterial}>
            <boxGeometry args={[0.07, 0.07, 0.06]} />
          </mesh>
        </group>
      );
    case 'double':
      return (
        <group>
          <mesh position={[0, y0 + 1.15, 0.03]} material={frame} castShadow>
            <boxGeometry args={[2.2, 2.3, 0.1]} />
          </mesh>
          {[-0.5, 0.5].map((x) => (
            <group key={x}>
              <mesh position={[x, y0 + 1.05, 0.09]} material={leaf} castShadow>
                <boxGeometry args={[0.96, 2.1, 0.08]} />
              </mesh>
              <mesh position={[x * 0.25, y0 + 1, 0.15]} material={metalMaterial}>
                <boxGeometry args={[0.06, 0.3, 0.05]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'glass':
      return (
        <group>
          <mesh position={[0, y0 + 1.2, 0.03]} material={darkMetalMaterial} castShadow>
            <boxGeometry args={[2.2, 2.4, 0.1]} />
          </mesh>
          {[-0.52, 0.52].map((x) => (
            <mesh key={x} position={[x, y0 + 1.1, 0.09]} material={glassDoorMaterial}>
              <boxGeometry args={[1, 2.2, 0.05]} />
            </mesh>
          ))}
          <mesh position={[0, y0 + 1, 0.14]} material={metalMaterial}>
            <boxGeometry args={[0.05, 1.2, 0.05]} />
          </mesh>
        </group>
      );
    case 'garage':
      return (
        <group>
          <mesh position={[0, y0 + 1.15, 0.04]} material={leaf} castShadow>
            <boxGeometry args={[2.8, 2.3, 0.12]} />
          </mesh>
          {[0.5, 1, 1.5, 2].map((y) => (
            <mesh key={y} position={[0, y0 + y, 0.11]} material={garageGrooveMaterial}>
              <boxGeometry args={[2.8, 0.04, 0.02]} />
            </mesh>
          ))}
        </group>
      );
    case 'none':
      return null;
  }
}

interface BlockProps {
  block: Block;
  lot: [number, number];
  facade: FacadeId;
  roof: RoofId;
  style: BuildingStyle;
  quality: 'low' | 'medium' | 'high';
  /** The tallest block carries the rooftop equipment. */
  main: boolean;
  tower: boolean;
}

function BlockModel({ block, lot, facade, roof, style, quality, main, tower }: BlockProps) {
  const box = blockBox(block, lot);
  const facadeMat = getFacadeMaterial(block.facade ?? facade, style.windows, style.tint, quality);
  const roofMat = getRoofMaterial(roof, quality);
  const shaped = isShaped(block);
  const body = shaped ? shapedBodyGeometry(box, block.floors, block) : boxBodyGeometry(box.w, box.d, block.floors);
  const materials = useMemo(
    () => [facadeMat, facadeMat, roofMat, facadeMat, facadeMat, facadeMat],
    [facadeMat, roofMat],
  );
  const gableMaterials = useMemo(() => [roofMat, facadeMat], [facadeMat, roofMat]);
  const shapedMaterials = useMemo(() => [facadeMat, roofMat], [facadeMat, roofMat]);
  const trim = solidMaterial(style.trim, 0.9);
  const top = box.h + LOT_HEIGHT;
  const ridgeAlongZ = box.d > box.w;

  if (shaped) {
    // Rounded, tapered, twisted or crowned: one lofted body, no box-only trim.
    return (
      <group position={[box.cx, 0, box.cz]}>
        <mesh geometry={body} material={shapedMaterials} castShadow receiveShadow />
      </group>
    );
  }

  return (
    <group position={[0, box.y, 0]}>
      <group position={[box.cx, 0, box.cz]}>
        <mesh geometry={body} material={materials} castShadow receiveShadow />
        {/* Plinth: a darker base course that grounds the building. */}
        {box.y === 0 && (
          <mesh position={[0, LOT_HEIGHT + 0.25, 0]} material={plinthMaterial} castShadow receiveShadow>
            <boxGeometry args={[box.w + 0.12, 0.5, box.d + 0.12]} />
          </mesh>
        )}

        <BlockDetails box={box} floors={block.floors} trim={style.trim} cornice={style.cornice} corners={style.corners} bands={style.bands} />

        {main && style.roofStyle === 'gable' && style.roofExtras.includes('chimney') && (
          <Chimney box={box} top={top} ridgeAlongZ={ridgeAlongZ} />
        )}

        {style.roofStyle === 'gable' ? (
          <mesh
            geometry={ridgeAlongZ ? gableRoofGeometry(box.d, box.w, roofHeightOf(box)) : gableRoofGeometry(box.w, box.d, roofHeightOf(box))}
            material={gableMaterials}
            position={[0, top, 0]}
            rotation={[0, ridgeAlongZ ? Math.PI / 2 : 0, 0]}
            castShadow
            receiveShadow
          />
        ) : (
          // Parapet: a low rim around the roof edge.
          [
            [0, -box.d / 2 + 0.1, box.w, 0.2],
            [0, box.d / 2 - 0.1, box.w, 0.2],
            [-box.w / 2 + 0.1, 0, 0.2, box.d - 0.4],
            [box.w / 2 - 0.1, 0, 0.2, box.d - 0.4],
          ].map(([x, z, sx, sz]) => (
            <mesh key={`${x},${z}`} position={[x, top + 0.25, z]} material={trim} castShadow receiveShadow>
              <boxGeometry args={[sx, 0.5, sz]} />
            </mesh>
          ))
        )}
      </group>

      {/* Balconies and rooftop equipment live in the building's lot frame. */}
      {style.balconies !== 'none' && block.floors > 1 && (
        <Balconies box={box} floors={block.floors} mode={style.balconies} trim={style.trim} />
      )}
      {main && style.roofStyle === 'flat' && (
        <RoofExtras extras={style.roofExtras} box={box} top={top + 0.02} towerAntenna={tower && !style.roofExtras.includes('antenna') && style.roofExtras.length === 0} />
      )}
    </group>
  );
}

interface BuildingProps {
  type: PieceType;
  facade: FacadeId;
  roof: RoofId;
  style: BuildingStyle;
  seed: number;
}

export function BuildingModel({ type, facade, roof, style, seed }: BuildingProps) {
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const [lw, ld] = style.lot;
  const door = style.door;
  const doorBlock = style.blocks[door.block] ?? style.blocks[0];
  const doorBox = blockBox(doorBlock, style.lot);
  const placement = wallPlacement(doorBox, door.side);
  const offset = Math.max(-maxDoorOffset(placement.length), Math.min(maxDoorOffset(placement.length), door.offset));
  const trim = solidMaterial(style.trim, 0.9);
  const mainIndex = style.blocks.reduce((best, b, i, all) => (b.floors > all[best].floors ? i : best), 0);

  return (
    <group>
      <mesh position={[0, LOT_HEIGHT / 2, 0]} material={slabMaterial} receiveShadow>
        <boxGeometry args={[lw * CELL - 0.4, LOT_HEIGHT, ld * CELL - 0.4]} />
      </mesh>

      {style.blocks.map((block, i) => (
        <BlockModel
          key={i}
          block={block}
          lot={style.lot}
          facade={facade}
          roof={roof}
          style={style}
          quality={quality}
          main={i === mainIndex}
          tower={type === 'tower'}
        />
      ))}

      {style.leds.map((led, i) =>
        style.blocks[led.block] ? (
          <group key={i} position={[0, blockBox(style.blocks[led.block], style.lot).y, 0]}>
            <LedScreen spec={led} box={blockBox(style.blocks[led.block], style.lot)} floors={style.blocks[led.block].floors} />
          </group>
        ) : null,
      )}

      {style.sign && (
        <SignBoard
          spec={style.sign}
          box={doorBox}
          floors={doorBlock.floors}
          side={door.side}
          offset={offset}
        />
      )}

      {door.style !== 'none' && (
        <group position={placement.position} rotation={[0, placement.rotY, 0]}>
          <group position={[offset, 0, 0]}>
            <DoorModel style={door.style} color={door.color} trim={style.trim} />
            {door.canopy &&
              (type === 'shop' || type === 'cafe' ? (
                <mesh
                  position={[0, LOT_HEIGHT + 2.55, 0.8]}
                  rotation={[0.35, 0, 0]}
                  material={awningMaterials[Math.floor(seed * awningMaterials.length)]}
                  castShadow
                >
                  <boxGeometry args={[Math.min(placement.length * 0.85, 4.4), 0.1, 1.7]} />
                </mesh>
              ) : (
                <mesh position={[0, LOT_HEIGHT + 2.55, 0.65]} material={trim} castShadow>
                  <boxGeometry args={[3.2, 0.14, 1.3]} />
                </mesh>
              ))}
          </group>
        </group>
      )}
    </group>
  );
}

// --- Dispatch ------------------------------------------------------------------

/** Visual only (no physics); also used for the placement ghost. */
export function PieceModel({
  type,
  facade,
  roof,
  style,
  seed,
  accent,
  tree,
  wall,
  span,
  scale = 1,
  rot = 0,
  road,
  gx,
  gz,
}: {
  type: PieceType;
  facade: FacadeId;
  roof: RoofId;
  style: BuildingStyle;
  seed: number;
  accent?: string;
  tree?: Partial<TreeSpec>;
  wall?: Partial<WallSpec>;
  /** Bridges: the design (the group it sits in is at the anchor cell's centre). */
  span?: Partial<SpanSpec>;
  scale?: number;
  /** Quarter-turns of the piece (traffic lights use it to choose which road they serve). */
  rot?: number;
  /** Road settings (lanes, pavement, markings ...) when this is a road. */
  road?: Partial<RoadSpec>;
  /** When given, a road connects to its real neighbours; the ghost passes a mask instead. */
  gx?: number;
  gz?: number;
}): ReactNode {
  if (type === 'wall') return <WallModel spec={resolveWall(wall)} />;
  if (type === 'span') return <SpanModel spec={span} gx={gx ?? 0} gz={gz ?? 0} />;
  if (type === 'road') {
    return gx === undefined || gz === undefined ? <RoadModel mask={0} road={road} /> : <ConnectedRoad gx={gx} gz={gz} road={road} />;
  }
  switch (type) {
    case 'rail':
      return gx === undefined || gz === undefined ? <RailModel mask={5} /> : <ConnectedRail gx={gx} gz={gz} />;
    case 'station':
      return <StationModel gx={gx} gz={gz} />;
    case 'crossing':
      return <CrossingModel />;
    case 'tram':
      return <TramTrackModel gx={gx} gz={gz} />;
    case 'tramstop':
      return <TramStopModel gx={gx} gz={gz} />;
    case 'monorail':
      return <MonorailModel gx={gx} gz={gz} />;
    case 'monostation':
      return <MonorailStationModel gx={gx} gz={gz} />;
    case 'metrotrack':
      return <MetroTrackModel gx={gx} gz={gz} />;
    case 'metroentrance':
      return <MetroEntranceModel />;
    case 'parking':
      return <ParkingModel />;
    case 'taxistand':
      return <TaxiStandModel />;
    case 'pier':
      return <PierModel gx={gx} gz={gz} />;
    case 'portcrane':
      return <PortCraneModel />;
    case 'containers':
      return <ContainersModel seed={seed} />;
    case 'runway':
      return <RunwayModel gx={gx} gz={gz} />;
    case 'taxiway':
      return <TaxiwayModel gx={gx} gz={gz} />;
    case 'apron':
      return <ApronModel gx={gx} gz={gz} />;
  }
  if (PIECES[type].paintable) {
    return <BuildingModel type={type} facade={facade} roof={roof} style={style} seed={seed} />;
  }
  return (
    <group scale={scale}>
      <PropModel type={type} seed={seed} accent={accent} led={style.led} rot={rot} tree={tree} />
    </group>
  );
}

/** A placed piece: its model plus (for solid pieces) fixed colliders for roam mode. */
export const PieceView = memo(function PieceView({ piece }: { piece: Piece }) {
  if (piece.type === 'span') return <SpanView piece={piece} />;
  const [w, d] = pieceFootprint(piece);
  const isWall = piece.type === 'wall';
  // A wall stands on a grid edge, not in the middle of its cell.
  const position: [number, number, number] = isWall
    ? piece.rot === 0
      ? [(piece.gx + 0.5) * CELL, 0, piece.gz * CELL]
      : [piece.gx * CELL, 0, (piece.gz + 0.5) * CELL]
    : [(piece.gx + w / 2) * CELL + (piece.offset?.[0] ?? 0), 0, (piece.gz + d / 2) * CELL + (piece.offset?.[1] ?? 0)];
  const rotation: [number, number, number] = [0, (piece.rot * Math.PI) / 2, 0];
  const style = resolveStyle(piece.type, piece);
  const colliders: { cx: number; cz: number; w: number; h: number; d: number; cy?: number }[] = isWall ? wallColliders(resolveWall(piece.wall)) : collidersOf(piece.type, style, piece.scale ?? 1);
  // Trees can share a cell, so each gets its own seed (and with it its own shape) from its id.
  const seed = isOverlay(piece.type) ? seedOfId(piece.id) : seedOf(piece.gx, piece.gz);
  const model = (
    <PieceModel
      type={piece.type}
      facade={piece.facade}
      roof={piece.roof}
      style={style}
      seed={seed}
      accent={piece.accent}
      tree={piece.tree}
      wall={piece.wall}
      scale={piece.scale}
      rot={piece.rot}
      road={piece.road}
      gx={piece.gx}
      gz={piece.gz}
    />
  );

  if (colliders.length === 0) {
    return (
      <group position={position} rotation={rotation}>
        {model}
      </group>
    );
  }
  return (
    // Keyed on the collider shapes so they are rebuilt when blocks / floors / roof change.
    <RigidBody key={JSON.stringify(colliders)} type="fixed" position={position} rotation={rotation}>
      {colliders.map((c, i) => (
        <CuboidCollider key={i} args={[c.w / 2, c.h / 2, c.d / 2]} position={[c.cx, c.cy ?? c.h / 2, c.cz]} />
      ))}
      {model}
    </RigidBody>
  );
});
