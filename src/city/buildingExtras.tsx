import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  FLOOR_H,
  type BalconyMode,
  type BlockBox,
  type DoorSide,
  type LedSpec,
  resolveLed,
  type RoofExtra,
  type SignSpec,
} from './catalog';
import { getRoofMaterial } from './cityTextures';
import { LOT_HEIGHT } from './geometries';
import { getLedMaterial, getSignMaterial } from './ledTextures';
import { getHaloMaterial } from './nightLights';
import { darkMetalMaterial, glassMaterial, metalMaterial, solidMaterial } from './materials';
import { wallPlacement } from './wall';

const SIDES: DoorSide[] = ['front', 'back', 'left', 'right'];

/**
 * Balcony slabs with glass rails on every upper storey of the chosen walls, drawn as two
 * instanced meshes so even a 40-storey tower costs two draw calls per block.
 */
export function Balconies({ box, floors, mode, trim }: { box: BlockBox; floors: number; mode: BalconyMode; trim: string }) {
  const slabs = useRef<THREE.InstancedMesh>(null);
  const rails = useRef<THREE.InstancedMesh>(null);
  const sides = mode === 'front' ? (['front'] as DoorSide[]) : mode === 'all' ? SIDES : [];
  const count = Math.max(0, floors - 1) * sides.length;

  useLayoutEffect(() => {
    if (!slabs.current || !rails.current) return;
    const base = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const none = new THREE.Quaternion();
    let i = 0;
    for (const side of sides) {
      const wall = wallPlacement(box, side);
      const length = Math.max(1.5, wall.length * 0.7);
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), wall.rotY);
      base.compose(new THREE.Vector3(...wall.position), turn, new THREE.Vector3(1, 1, 1));
      for (let f = 1; f < floors; f++) {
        const y = LOT_HEIGHT + f * FLOOR_H;
        slabs.current.setMatrixAt(i, base.clone().multiply(local.compose(new THREE.Vector3(0, y + 0.07, 0.6), none, new THREE.Vector3(length, 0.14, 1.2))));
        rails.current.setMatrixAt(i, base.clone().multiply(local.compose(new THREE.Vector3(0, y + 0.64, 1.17), none, new THREE.Vector3(length, 1, 0.05))));
        i++;
      }
    }
    slabs.current.instanceMatrix.needsUpdate = true;
    rails.current.instanceMatrix.needsUpdate = true;
  }, [box, floors, sides.length, mode]);

  if (count === 0) return null;
  return (
    <>
      <instancedMesh key={`s${count}`} ref={slabs} args={[undefined, undefined, count]} material={solidMaterial(trim, 0.85)} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh key={`r${count}`} ref={rails} args={[undefined, undefined, count]} material={glassMaterial} castShadow>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </>
  );
}

/** An animated LED panel mounted on a wall, spanning some storeys. */
export function LedScreen({ spec, box, floors }: { spec: LedSpec; box: BlockBox; floors: number }) {
  const wall = wallPlacement(box, spec.side);
  const bottom = Math.max(0, Math.min(spec.bottom, floors - 1));
  const storeys = Math.max(1, Math.min(spec.height, floors - bottom));
  const maxWidth = Math.max(1.5, wall.length - 1.2);
  const width = spec.width > 0 ? Math.min(spec.width, maxWidth) : maxWidth;
  const height = storeys * FLOOR_H - 0.5;
  const offset = Math.max(-(maxWidth - width) / 2, Math.min((maxWidth - width) / 2, spec.offset));
  const look = resolveLed(spec);
  const material = getLedMaterial(spec, width, height);
  const y = LOT_HEIGHT + bottom * FLOOR_H + 0.25 + height / 2;
  const border = look.bezel === 'thick' ? 0.45 : look.bezel === 'thin' ? 0.12 : 0;
  const frame = useMemo(() => solidMaterial(look.frame, 0.5, 0.5), [look.frame]);

  return (
    <group position={wall.position} rotation={[0, wall.rotY, 0]}>
      {border > 0 && (
        <mesh position={[offset, y, 0.07]} material={frame} castShadow>
          <boxGeometry args={[width + border * 2, height + border * 2, 0.14]} />
        </mesh>
      )}
      <mesh position={[offset, y, 0.16]} material={material}>
        <boxGeometry args={[width, height, 0.05]} />
      </mesh>
      {look.glow && (
        <mesh position={[offset, y, 0.3]} material={getHaloMaterial(look.color)} renderOrder={3}>
          <planeGeometry args={[width + 3.5, height + 3.5]} />
        </mesh>
      )}
    </group>
  );
}

/** Illuminated name board above the entrance, or standing on the parapet of a one-storey building. */
export function SignBoard({
  spec,
  box,
  floors,
  side,
  offset,
}: {
  spec: SignSpec;
  box: BlockBox;
  floors: number;
  side: DoorSide;
  offset: number;
}) {
  const wall = wallPlacement(box, side);
  const material = getSignMaterial(spec.text, spec.color);
  const width = Math.min(4.4, Math.max(1.8, wall.length * 0.7));
  const onRoof = floors < 2;
  const y = onRoof ? LOT_HEIGHT + box.h + 0.75 : LOT_HEIGHT + 3.25;
  const z = onRoof ? -0.1 : 0.1;
  return (
    <group position={wall.position} rotation={[0, wall.rotY, 0]}>
      <mesh position={[offset, y, z]} material={material} castShadow>
        <boxGeometry args={[width, width / 4, 0.12]} />
      </mesh>
    </group>
  );
}

/** Rooftop equipment and features, placed on the main (tallest) block. */
export function RoofExtras({ extras, box, top, towerAntenna }: { extras: RoofExtra[]; box: BlockBox; top: number; towerAntenna?: boolean }) {
  const solar = useMemo(() => getRoofMaterial('solar', 'medium'), []);
  const has = (e: RoofExtra) => extras.includes(e);
  const panelCols = Math.max(1, Math.min(4, Math.floor((box.w - 1.6) / 2.4)));
  const panelRows = Math.max(1, Math.min(2, Math.floor((box.d - 1.6) / 3)));

  return (
    <group position={[box.cx, top, box.cz]}>
      {has('plant') && (
        <>
          <mesh position={[box.w * 0.18, 0.5, -box.d * 0.15]} material={metalMaterial} castShadow>
            <boxGeometry args={[Math.min(2.2, box.w * 0.3), 1, Math.min(1.8, box.d * 0.3)]} />
          </mesh>
          <mesh position={[box.w * 0.18 - 1.4, 0.35, -box.d * 0.15 + 0.4]} material={darkMetalMaterial} castShadow>
            <boxGeometry args={[0.9, 0.7, 0.9]} />
          </mesh>
        </>
      )}

      {(has('antenna') || towerAntenna) && (
        <group position={[-box.w * 0.22, 0, box.d * 0.18]}>
          <mesh position={[0, 3.5, 0]} material={metalMaterial} castShadow>
            <cylinderGeometry args={[0.06, 0.14, 7, 6]} />
          </mesh>
          <mesh position={[0, 7.1, 0]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={2.2} />
          </mesh>
        </group>
      )}

      {has('solar') &&
        Array.from({ length: panelRows * panelCols }, (_, i) => {
          const col = i % panelCols;
          const row = Math.floor(i / panelCols);
          const x = (col - (panelCols - 1) / 2) * 2.4;
          const z = (row - (panelRows - 1) / 2) * 3 + box.d * 0.12;
          return (
            <mesh key={i} position={[x, 0.55, z]} rotation={[-0.5, 0, 0]} material={solar} castShadow>
              <boxGeometry args={[2.1, 0.07, 1.5]} />
            </mesh>
          );
        })}

      {has('garden') && (
        <group>
          <mesh position={[0, 0.14, 0]} material={solidMaterial('#5f8a45', 1)} receiveShadow>
            <boxGeometry args={[box.w - 1.4, 0.28, box.d - 1.4]} />
          </mesh>
          {[
            [-0.3, 0.2],
            [0.25, -0.15],
            [0.05, 0.3],
          ].map(([fx, fz]) => (
            <mesh key={`${fx},${fz}`} position={[fx * box.w * 0.6, 0.7, fz * box.d * 0.6]} material={solidMaterial('#3f7a38', 1)} castShadow>
              <icosahedronGeometry args={[0.7, 1]} />
            </mesh>
          ))}
        </group>
      )}

      {has('helipad') && (
        <group position={[0, 0.06, 0]}>
          <mesh material={solidMaterial('#2b2f35', 0.9)} receiveShadow>
            <cylinderGeometry args={[Math.min(box.w, box.d) * 0.36, Math.min(box.w, box.d) * 0.36, 0.12, 32]} />
          </mesh>
          <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} material={solidMaterial('#f2f2f2', 0.7)}>
            <ringGeometry args={[Math.min(box.w, box.d) * 0.3, Math.min(box.w, box.d) * 0.33, 40]} />
          </mesh>
          {[
            [-0.7, 0, 0.3, 2.2],
            [0.7, 0, 0.3, 2.2],
            [0, 0, 1.6, 0.3],
          ].map(([x, z, sx, sz], i) => (
            <mesh key={i} position={[x, 0.075, z]} rotation={[-Math.PI / 2, 0, 0]} material={solidMaterial('#f2f2f2', 0.7)}>
              <planeGeometry args={[sx, sz]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}
