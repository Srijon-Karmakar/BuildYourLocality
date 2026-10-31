import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { memo, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useCityStore, roadMaskAt, type Piece } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import {
  CELL,
  blockBox,
  collidersOf,
  pieceFootprint,
  resolveStyle,
  roofHeightOf,
  type Block,
  type BlockBox,
  type BuildingStyle,
  type DoorSide,
  type DoorStyle,
  type FacadeId,
  type PieceType,
  type RoofId,
} from './catalog';
import { getFacadeMaterial, getRoofMaterial } from './cityTextures';
import { LOT_HEIGHT, boxBodyGeometry, gableRoofGeometry, roadGeometry } from './geometries';

const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });

/** Cheap stable per-cell variation so repeated trees/houses don't look cloned. */
function seedOf(gx: number, gz: number): number {
  const n = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// --- Roads ---------------------------------------------------------------------

export function RoadModel({ mask }: { mask: number }) {
  return <mesh geometry={roadGeometry(mask)} material={roadMaterial} receiveShadow castShadow />;
}

function ConnectedRoad({ gx, gz }: { gx: number; gz: number }) {
  const mask = useCityStore((s) => roadMaskAt(s.pieces, s.occupancy, gx, gz));
  return <RoadModel mask={mask} />;
}

// --- Buildings -----------------------------------------------------------------

const slabMaterial = new THREE.MeshStandardMaterial({ color: '#a3a69c', roughness: 0.95 });
const plinthMaterial = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.85 });
const metalMaterial = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.5, metalness: 0.6 });
const glassDoorMaterial = new THREE.MeshStandardMaterial({ color: '#7fb6d6', roughness: 0.08, metalness: 0.3 });
const garageGrooveMaterial = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.8 });
const awningMaterials = ['#c0392b', '#2b6cb0', '#2f855a'].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
);

const solidCache = new Map<string, THREE.MeshStandardMaterial>();
/** Plain painted material, cached per colour so recolouring doesn't pile up materials. */
function solidMaterial(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}`;
  let material = solidCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness });
    solidCache.set(key, material);
  }
  return material;
}

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
          <mesh position={[0, y0 + 1.2, 0.03]} material={metalMaterial} castShadow>
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

const WALL_FACES: Record<DoorSide, { rotY: number; along: 'w' | 'd' }> = {
  front: { rotY: 0, along: 'w' },
  back: { rotY: Math.PI, along: 'w' },
  right: { rotY: Math.PI / 2, along: 'd' },
  left: { rotY: -Math.PI / 2, along: 'd' },
};

/** Where a door sits on a block wall: position, facing, and the wall length it slides along. */
function doorPlacement(box: BlockBox, side: DoorSide): { position: [number, number, number]; rotY: number; length: number } {
  const face = WALL_FACES[side];
  const position: [number, number, number] =
    side === 'front'
      ? [box.cx, 0, box.cz + box.d / 2]
      : side === 'back'
        ? [box.cx, 0, box.cz - box.d / 2]
        : side === 'right'
          ? [box.cx + box.w / 2, 0, box.cz]
          : [box.cx - box.w / 2, 0, box.cz];
  return { position, rotY: face.rotY, length: face.along === 'w' ? box.w : box.d };
}

/** Largest door offset (metres from the wall centre) that keeps the door on its wall. */
export function maxDoorOffset(length: number): number {
  return Math.max(0, length / 2 - 1.3);
}

interface BlockProps {
  block: Block;
  lot: [number, number];
  facade: FacadeId;
  roof: RoofId;
  style: BuildingStyle;
  quality: 'low' | 'medium' | 'high';
  /** The first block carries the rooftop plant and antenna. */
  main: boolean;
  tower: boolean;
}

function BlockModel({ block, lot, facade, roof, style, quality, main, tower }: BlockProps) {
  const box = blockBox(block, lot);
  const facadeMat = getFacadeMaterial(block.facade ?? facade, style.windows, style.tint, quality);
  const roofMat = getRoofMaterial(roof, quality);
  const body = boxBodyGeometry(box.w, box.d, block.floors);
  const materials = useMemo(
    () => [facadeMat, facadeMat, roofMat, facadeMat, facadeMat, facadeMat],
    [facadeMat, roofMat],
  );
  const gableMaterials = useMemo(() => [roofMat, facadeMat], [facadeMat, roofMat]);
  const trim = solidMaterial(style.trim, 0.9);
  const top = box.h + LOT_HEIGHT;
  const ridgeAlongZ = box.d > box.w;

  return (
    <group position={[box.cx, 0, box.cz]}>
      <mesh geometry={body} material={materials} castShadow receiveShadow />
      {/* Plinth: a darker base course that grounds the building. */}
      <mesh position={[0, LOT_HEIGHT + 0.25, 0]} material={plinthMaterial} castShadow receiveShadow>
        <boxGeometry args={[box.w + 0.12, 0.5, box.d + 0.12]} />
      </mesh>

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
        <>
          {/* Parapet: a low rim around the roof edge. */}
          {[
            [0, -box.d / 2 + 0.1, box.w, 0.2],
            [0, box.d / 2 - 0.1, box.w, 0.2],
            [-box.w / 2 + 0.1, 0, 0.2, box.d - 0.4],
            [box.w / 2 - 0.1, 0, 0.2, box.d - 0.4],
          ].map(([x, z, sx, sz]) => (
            <mesh key={`${x},${z}`} position={[x, top + 0.25, z]} material={trim} castShadow receiveShadow>
              <boxGeometry args={[sx, 0.5, sz]} />
            </mesh>
          ))}
          {main && (
            <mesh position={[box.w * 0.15, top + 0.5, -box.d * 0.12]} material={metalMaterial} castShadow>
              <boxGeometry args={[Math.min(2.2, box.w * 0.3), 1, Math.min(1.8, box.d * 0.3)]} />
            </mesh>
          )}
          {main && tower && (
            <mesh position={[-box.w * 0.2, top + 3, box.d * 0.15]} material={metalMaterial} castShadow>
              <cylinderGeometry args={[0.07, 0.12, 6, 6]} />
            </mesh>
          )}
        </>
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
  const placement = doorPlacement(doorBox, door.side);
  const offset = Math.max(-maxDoorOffset(placement.length), Math.min(maxDoorOffset(placement.length), door.offset));
  const trim = solidMaterial(style.trim, 0.9);

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
          main={i === 0}
          tower={type === 'tower'}
        />
      ))}

      {door.style !== 'none' && (
        <group position={placement.position} rotation={[0, placement.rotY, 0]}>
          <group position={[offset, 0, 0]}>
            <DoorModel style={door.style} color={door.color} trim={style.trim} />
            {door.canopy &&
              (type === 'shop' ? (
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

// --- Nature & props ------------------------------------------------------------

const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b3a1e', roughness: 0.95 });
const leafMats = ['#3f8a3a', '#4c9a40', '#5aa046', '#6aa84f'].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
);
const pineMat = new THREE.MeshStandardMaterial({ color: '#2f6b36', roughness: 0.9, flatShading: true });
const poleMat = new THREE.MeshStandardMaterial({ color: '#2f343a', roughness: 0.5, metalness: 0.6 });
const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd84d', emissiveIntensity: 1.4 });
const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.85 });
const parkMat = new THREE.MeshStandardMaterial({ color: '#5fa24a', roughness: 1 });
const pathMat = new THREE.MeshStandardMaterial({ color: '#d2c7ae', roughness: 0.95 });
const paverMat = new THREE.MeshStandardMaterial({ color: '#b9b2a4', roughness: 0.9 });
const paverEdgeMat = new THREE.MeshStandardMaterial({ color: '#8d877b', roughness: 0.9 });
const bushMat = new THREE.MeshStandardMaterial({ color: '#3d7a35', roughness: 1, flatShading: true });

function Tree({ seed }: { seed: number }) {
  const scale = 0.85 + seed * 0.4;
  return (
    <group scale={scale}>
      <mesh position={[0, 1.2, 0]} material={trunkMat} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.4, 7]} />
      </mesh>
      <mesh position={[0, 3.5, 0]} material={leafMats[Math.floor(seed * leafMats.length)]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.7, 1]} />
      </mesh>
      <mesh position={[0.7, 2.9, 0.4]} material={leafMats[Math.floor(seed * 7) % leafMats.length]} castShadow>
        <icosahedronGeometry args={[1.1, 1]} />
      </mesh>
    </group>
  );
}

function Pine({ seed }: { seed: number }) {
  const scale = 0.9 + seed * 0.4;
  return (
    <group scale={scale}>
      <mesh position={[0, 0.7, 0]} material={trunkMat} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 1.4, 6]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.9 + i * 1.15, 0]} material={pineMat} castShadow>
          <coneGeometry args={[1.5 - i * 0.4, 1.8, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function Lamp() {
  return (
    <group>
      <mesh position={[0, 2.5, 0]} material={poleMat} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 5, 8]} />
      </mesh>
      <mesh position={[0.5, 5, 0]} material={poleMat} castShadow>
        <boxGeometry args={[1.1, 0.1, 0.1]} />
      </mesh>
      <mesh position={[0.95, 4.85, 0]} material={bulbMat}>
        <boxGeometry args={[0.5, 0.18, 0.3]} />
      </mesh>
    </group>
  );
}

function Bench() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={woodMat} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.1, 0.6]} />
      </mesh>
      <mesh position={[0, 0.9, -0.28]} material={woodMat} castShadow>
        <boxGeometry args={[1.8, 0.45, 0.08]} />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.25, 0]} material={poleMat} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

function Park({ seed }: { seed: number }) {
  return (
    <group>
      <mesh position={[0, 0.04, 0]} material={parkMat} receiveShadow>
        <boxGeometry args={[CELL, 0.08, CELL]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={pathMat} receiveShadow>
        <boxGeometry args={[1.2, 0.04, CELL]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={pathMat} receiveShadow>
        <boxGeometry args={[CELL, 0.04, 1.2]} />
      </mesh>
      <group position={[-1.7, 0, -1.7]} scale={0.8}>
        <Tree seed={seed} />
      </group>
      <group position={[1.9, 0, 1.6]} scale={0.7}>
        <Tree seed={(seed * 3.7) % 1} />
      </group>
      {[[1.8, -1.9], [-2, 1.9]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.4, z]} material={bushMat} castShadow>
          <icosahedronGeometry args={[0.6, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function Plaza() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} material={paverEdgeMat} receiveShadow>
        <boxGeometry args={[CELL, 0.1, CELL]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={paverMat} receiveShadow>
        <boxGeometry args={[CELL - 0.5, 0.1, CELL - 0.5]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} material={paverEdgeMat} receiveShadow>
        <cylinderGeometry args={[1.2, 1.3, 0.12, 24]} />
      </mesh>
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
  gx,
  gz,
}: {
  type: PieceType;
  facade: FacadeId;
  roof: RoofId;
  style: BuildingStyle;
  seed: number;
  /** When given, a road connects to its real neighbours; the ghost passes a mask instead. */
  gx?: number;
  gz?: number;
}): ReactNode {
  switch (type) {
    case 'road':
      return gx === undefined || gz === undefined ? <RoadModel mask={0} /> : <ConnectedRoad gx={gx} gz={gz} />;
    case 'house':
    case 'shop':
    case 'apartment':
    case 'office':
    case 'tower':
      return <BuildingModel type={type} facade={facade} roof={roof} style={style} seed={seed} />;
    case 'tree':
      return <Tree seed={seed} />;
    case 'pine':
      return <Pine seed={seed} />;
    case 'lamp':
      return <Lamp />;
    case 'bench':
      return <Bench />;
    case 'park':
      return <Park seed={seed} />;
    case 'plaza':
      return <Plaza />;
  }
}

/** A placed piece: its model plus (for solid pieces) fixed colliders for roam mode. */
export const PieceView = memo(function PieceView({ piece }: { piece: Piece }) {
  const [w, d] = pieceFootprint(piece);
  const position: [number, number, number] = [(piece.gx + w / 2) * CELL, 0, (piece.gz + d / 2) * CELL];
  const rotation: [number, number, number] = [0, (piece.rot * Math.PI) / 2, 0];
  const style = resolveStyle(piece.type, piece);
  const colliders = collidersOf(piece.type, style);
  const seed = seedOf(piece.gx, piece.gz);
  const model = (
    <PieceModel type={piece.type} facade={piece.facade} roof={piece.roof} style={style} seed={seed} gx={piece.gx} gz={piece.gz} />
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
        <CuboidCollider key={i} args={[c.w / 2, c.h / 2, c.d / 2]} position={[c.cx, c.h / 2, c.cz]} />
      ))}
      {model}
    </RigidBody>
  );
});
