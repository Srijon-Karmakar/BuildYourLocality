import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  FLOOR_H,
  gableHeightForSpan,
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
import { getLedColour, getLedGlow, getLedMaterial, getSignMaterial } from './ledTextures';
import { registerLed } from './ledRegistry';
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

/** An animated LED panel mounted on a wall: it glows, throws light on its surroundings, and keeps time with its neighbours. */
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
  // Screens high up the wall light the street less than ones at the bottom.
  const ground = 1 / (1 + (bottom * FLOOR_H) / 22);
  const glow = useMemo(() => (look.glow ? getLedGlow(spec, width, height, ground) : null), [spec, width, height, look.glow, ground]);
  const colour = useMemo(() => getLedColour(spec, width, height), [spec, width, height]);
  const wallRef = useRef<THREE.Group>(null);

  // Tell the night lighting this screen exists so it can borrow a real light for it.
  useEffect(() => {
    if (!wallRef.current || !look.glow) return;
    return registerLed({ object: wallRef.current, local: [offset, y, 0.2], width, height, brightness: look.brightness, glowAmount: look.glowAmount, colour });
  }, [offset, y, width, height, look.brightness, look.glowAmount, look.glow, colour]);

  const reach = Math.min(10, 3 + height * 0.12) * (0.6 + look.glowAmount * 0.4);

  return (
    <group ref={wallRef} position={wall.position} rotation={[0, wall.rotY, 0]}>
      {border > 0 && (
        <mesh position={[offset, y, 0.07]} material={frame} castShadow>
          <boxGeometry args={[width + border * 2, height + border * 2, 0.14]} />
        </mesh>
      )}
      <mesh position={[offset, y, 0.16]} material={material}>
        <boxGeometry args={[width, height, 0.05]} />
      </mesh>
      {glow && (
        <>
          <mesh position={[offset, y, 0.1]} material={glow.halo} renderOrder={3}>
            <planeGeometry args={[width + 3.5 + look.glowAmount * 2, height + 3.5 + look.glowAmount * 2]} />
          </mesh>
          <mesh position={[offset, LOT_HEIGHT + 0.06, reach / 2 + 0.3]} rotation={[-Math.PI / 2, 0, 0]} material={glow.splash} renderOrder={2}>
            <planeGeometry args={[width * 1.1 + 3, reach]} />
          </mesh>
        </>
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

      {has('chimney') && <ChimneyStack x={box.w * 0.25} z={-box.d * 0.2} y={0} />}

      {has('watertank') && (
        <group position={[-box.w * 0.22, 0, -box.d * 0.18]}>
          {[
            [-0.55, -0.55],
            [0.55, -0.55],
            [-0.55, 0.55],
            [0.55, 0.55],
          ].map(([x, z]) => (
            <mesh key={`${x},${z}`} position={[x, 0.7, z]} material={darkMetalMaterial} castShadow>
              <boxGeometry args={[0.1, 1.4, 0.1]} />
            </mesh>
          ))}
          <mesh position={[0, 2.2, 0]} material={solidMaterial('#8a6a45', 0.9)} castShadow receiveShadow>
            <cylinderGeometry args={[0.95, 0.95, 1.6, 16]} />
          </mesh>
          {[1.6, 2.2, 2.8].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={metalMaterial}>
              <cylinderGeometry args={[0.99, 0.99, 0.06, 16]} />
            </mesh>
          ))}
          <mesh position={[0, 3.25, 0]} material={solidMaterial('#6b4f32', 0.9)} castShadow>
            <coneGeometry args={[1.05, 0.5, 16]} />
          </mesh>
        </group>
      )}

      {has('skylight') && (
        <group position={[-box.w * 0.18, 0, box.d * 0.2]}>
          <mesh position={[0, 0.2, 0]} material={darkMetalMaterial} castShadow>
            <boxGeometry args={[Math.min(2.6, box.w * 0.4), 0.4, Math.min(1.8, box.d * 0.3)]} />
          </mesh>
          <mesh position={[0, 0.5, 0]} material={glassMaterial} castShadow>
            <boxGeometry args={[Math.min(2.3, box.w * 0.36), 0.22, Math.min(1.5, box.d * 0.26)]} />
          </mesh>
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

const chimneyBrick = solidMaterial('#8f4a37', 0.95);

/** A brick chimney stack with a stone cap; `y` is where its foot sits. */
function ChimneyStack({ x, z, y }: { x: number; z: number; y: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1.1, 0]} material={chimneyBrick} castShadow>
        <boxGeometry args={[0.8, 2.4, 0.8]} />
      </mesh>
      <mesh position={[0, 2.38, 0]} material={solidMaterial('#8d8f93', 0.85)} castShadow>
        <boxGeometry args={[1, 0.16, 1]} />
      </mesh>
      <mesh position={[0, 2.2, 0]} material={darkMetalMaterial}>
        <boxGeometry args={[0.5, 0.05, 0.5]} />
      </mesh>
    </group>
  );
}

/** A chimney rising through a pitched roof, set a little off the ridge. */
export function Chimney({ box, top, ridgeAlongZ }: { box: BlockBox; top: number; ridgeAlongZ: boolean }) {
  const rise = gableHeightForSpan(Math.min(box.w, box.d));
  const across = Math.min(box.w, box.d) * 0.2;
  const along = (ridgeAlongZ ? box.d : box.w) * 0.2;
  const foot = top + rise * (1 - (across / (Math.min(box.w, box.d) / 2))) - 0.4;
  return <ChimneyStack x={ridgeAlongZ ? across : along} z={ridgeAlongZ ? along : across} y={foot} />;
}
