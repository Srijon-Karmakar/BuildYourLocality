import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { sim } from '../sim/simulation';
import { useCityStore, metroMaskAt, pierMaskAt, railMaskAt, taxiMaskAt } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { WATER_LEVEL, useTerrainStore } from '../terrain/terrain';
import { apronGeometry, parkingGeometry, pierGeometry, runwayGeometry } from './airGeometry';
import { roadGeometry } from './roadGeometry';
import { railGeometry, metroGeometry } from './railGeometry';
import { getSignMaterial } from './ledTextures';
import { darkMetalMaterial, glassMaterial, metalMaterial, solidMaterial } from './materials';
import { registerWet } from './nightLights';

const vertexMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 });
registerWet(vertexMaterial);
const tunnelMaterial = new THREE.MeshBasicMaterial({ color: '#4a8dff', transparent: true, opacity: 0.55, depthWrite: false });

/** True when this cell has been dug out into water, so track laid here is carried on a bridge. */
const useWaterBelow = (gx: number, gz: number) =>
  useTerrainStore((s) => (s.cells[`${gx},${gz}`]?.h ?? 0) < WATER_LEVEL);

export function RailModel({ mask, bridge = false }: { mask: number; bridge?: boolean }) {
  return <mesh geometry={railGeometry(mask, { bridge })} material={vertexMaterial} receiveShadow castShadow />;
}

export function ConnectedRail({ gx, gz }: { gx: number; gz: number }) {
  const mask = useCityStore((s) => railMaskAt(s.pieces, s.occupancy, gx, gz));
  const bridge = useWaterBelow(gx, gz);
  return <RailModel mask={mask} bridge={bridge} />;
}

/** The running direction of a platform: along north-south unless the track only goes east-west. */
const runsEastWest = (mask: number) => !(mask & 5) && (mask & 10) !== 0;

export function StationModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mask = useCityStore((s) => (gx === undefined || gz === undefined ? 5 : railMaskAt(s.pieces, s.occupancy, gx, gz)));
  const ew = runsEastWest(mask);
  const sign = useMemo(() => getSignMaterial('STATION', '#ffffff'), []);
  return (
    <group>
      <mesh geometry={railGeometry(mask || 5, { platform: true })} material={vertexMaterial} receiveShadow castShadow />
      {/* Name boards on both faces of the shelter roof. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={ew ? [0, 3.35, side * 0.82] : [side * 0.82, 3.35, 0]} rotation={[0, ew ? 0 : Math.PI / 2, 0]} material={sign} castShadow>
          <boxGeometry args={[3, 0.5, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

const ARM_OPEN = 1.35;

/**
 * A level crossing: road north-south over double track east-west (the piece's rotation turns
 * it). Barriers come down and red lights flash while a train is approaching or passing.
 */
// Posts: [x, z] beside the road either side of the rails; barriers guard the near lane.
const posts: [number, number][] = [
  [3.15, 2.7],
  [-3.15, 2.7],
  [-3.15, -2.7],
  [3.15, -2.7],
];
// Only the two posts on each approach's right-hand side swing an arm across.
const armPosts = [0, 2];

export function CrossingModel() {
  const group = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]);
  const lamps = useMemo(() => [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 0.1 })), []);
  const here = useMemo(() => new THREE.Vector3(), []);
  const angle = useRef(ARM_OPEN);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.getWorldPosition(here);
    const closed = sim.crossingClosed(here.x, here.z);
    angle.current += ((closed ? 0 : ARM_OPEN) - angle.current) * Math.min(1, dt * 2.5);
    arms.current.forEach((arm, i) => {
      if (arm) arm.rotation.z = (posts[i][0] > 0 ? -1 : 1) * angle.current;
    });
    const blink = Math.sin(sim.time * 8) > 0;
    lamps.forEach((lamp, i) => {
      lamp.emissiveIntensity = closed && (i % 2 === 0) === blink ? 3 : 0.1;
    });
  });


  return (
    <group ref={group}>
      <mesh geometry={roadGeometry(5, { lanes: 2, pavement: 'curb', speed: 30 })} material={vertexMaterial} receiveShadow />
      <mesh geometry={railGeometry(10, { flush: true })} material={vertexMaterial} receiveShadow />
      {posts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 1.1, 0]} material={darkMetalMaterial} castShadow>
            <boxGeometry args={[0.14, 2.2, 0.14]} />
          </mesh>
          <mesh position={[0, 2.15, 0.1]} material={lamps[i]}>
            <sphereGeometry args={[0.12, 8, 8]} />
          </mesh>
          <mesh position={[0, 1.8, 0.08]} material={solidMaterial('#f1f1f1', 0.6)}>
            <boxGeometry args={[0.5, 0.5, 0.04]} />
          </mesh>
          {armPosts.includes(i) && (
            <group ref={(g) => (arms.current[i] = g)} position={[0, 1, 0]}>
              <mesh position={[x > 0 ? -1.6 : 1.6, 0, 0]} material={solidMaterial('#f2f2f2', 0.6)} castShadow>
                <boxGeometry args={[3.2, 0.1, 0.1]} />
              </mesh>
              {[0.4, 1.2, 2].map((a) => (
                <mesh key={a} position={[x > 0 ? -a : a, 0, 0]} material={solidMaterial('#d62828', 0.6)}>
                  <boxGeometry args={[0.35, 0.11, 0.11]} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/** Underground metro line: shown as glowing dashes on the ground only while building. */
export function MetroTrackModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mode = useGameStore((s) => s.mode);
  const mask = useCityStore((s) => (gx === undefined || gz === undefined ? 5 : metroMaskAt(s.pieces, s.occupancy, gx, gz)));
  if (mode !== 'build') return null;
  return <mesh geometry={metroGeometry(mask)} material={tunnelMaterial} renderOrder={3} />;
}

/** A metro entrance: a glass canopy over a staircase down, with the Ⓜ sign facing the street (+z). */
export function MetroEntranceModel() {
  const sign = useMemo(() => getSignMaterial('M', '#4a8dff'), []);
  const concrete = solidMaterial('#8d9096', 0.85);
  const roof = solidMaterial('#2c3036', 0.5, 0.4);
  return (
    <group>
      <mesh position={[0, 0.06, 0]} material={concrete} receiveShadow>
        <boxGeometry args={[5.2, 0.12, 5.2]} />
      </mesh>
      <mesh position={[0, 0.14, -0.2]} material={solidMaterial('#0c0d10', 1)}>
        <boxGeometry args={[2.2, 0.04, 2.6]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, 0.2 - i * 0.03, 0.9 - i * 0.45]} material={solidMaterial('#b9b7b0', 0.9)}>
          <boxGeometry args={[2, 0.05, 0.4]} />
        </mesh>
      ))}
      <mesh position={[0, 2.9, -0.1]} material={roof} castShadow>
        <boxGeometry args={[3.2, 0.14, 3.2]} />
      </mesh>
      {[-1.45, 1.45].flatMap((x) => [-1.5, 1.3].map((z) => (
        <mesh key={`${x},${z}`} position={[x, 1.5, z]} material={metalMaterial} castShadow>
          <boxGeometry args={[0.12, 2.9, 0.12]} />
        </mesh>
      )))}
      {[-1.45, 1.45].map((x) => (
        <mesh key={x} position={[x, 1.6, -0.1]} material={glassMaterial}>
          <boxGeometry args={[0.04, 2.5, 2.6]} />
        </mesh>
      ))}
      <mesh position={[0, 2.3, 1.38]} material={sign} castShadow>
        <boxGeometry args={[1.5, 0.75, 0.08]} />
      </mesh>
    </group>
  );
}

// --- Airfield ----------------------------------------------------------------------------------

/** Mask of linked airfield neighbours for a cell (straight along its axis when placed alone). */
const useTaxiMask = (gx?: number, gz?: number) =>
  useCityStore((s) => (gx === undefined || gz === undefined ? 5 : taxiMaskAt(s.pieces, s.occupancy, gx, gz)));

export function RunwayModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mask = useTaxiMask(gx, gz);
  return <mesh geometry={runwayGeometry(mask)} material={vertexMaterial} receiveShadow />;
}

/** Taxiway: asphalt with a yellow centre line, drawn with the road generator so bends and junctions are curved. */
export function TaxiwayModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mask = useTaxiMask(gx, gz);
  return <mesh geometry={roadGeometry(mask, { lanes: 2, pavement: 'none', surface: 'asphalt', speed: 20 })} material={vertexMaterial} receiveShadow />;
}

export function ApronModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mask = useTaxiMask(gx, gz);
  return <mesh geometry={apronGeometry(mask)} material={vertexMaterial} receiveShadow />;
}

// --- Services and port -------------------------------------------------------------------------

/** A car park; the parked cars themselves are drawn by the simulation (they come and go). */
export function ParkingModel() {
  return <mesh geometry={parkingGeometry()} material={vertexMaterial} receiveShadow />;
}

/** A taxi rank: a yellow TAXI sign on a pole beside a small shelter with a bench. */
export function TaxiStandModel() {
  const sign = useMemo(() => getSignMaterial('TAXI', '#f6c31c'), []);
  return (
    <group>
      <mesh position={[0, 1.7, 0]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[0.14, 3.4, 0.14]} />
      </mesh>
      <mesh position={[0, 3.1, 0.1]} material={sign} castShadow>
        <boxGeometry args={[1.6, 0.8, 0.1]} />
      </mesh>
      <mesh position={[0.9, 2.3, -0.2]} material={solidMaterial('#f6c31c', 0.5)} castShadow>
        <boxGeometry args={[1.8, 0.1, 1.3]} />
      </mesh>
      {[0, 1.8].map((x) => (
        <mesh key={x} position={[x === 0 ? 0 : 1.8, 1.15, -0.8]} material={darkMetalMaterial}>
          <boxGeometry args={[0.08, 2.3, 0.08]} />
        </mesh>
      ))}
      <mesh position={[0.9, 0.5, -0.6]} material={solidMaterial('#8a5a2b', 0.8)} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.45]} />
      </mesh>
    </group>
  );
}

export function PierModel({ gx, gz }: { gx?: number; gz?: number }) {
  const mask = useCityStore((s) => (gx === undefined || gz === undefined ? 5 : pierMaskAt(s.pieces, s.occupancy, gx, gz)));
  return <mesh geometry={pierGeometry(mask)} material={vertexMaterial} castShadow receiveShadow />;
}

/** A quayside gantry crane. Its boom swings and the hook rises and falls while a ship is alongside. */
export function PortCraneModel() {
  const group = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Mesh>(null);
  const here = useMemo(() => new THREE.Vector3(), []);
  const working = useRef(0);
  const yellow = solidMaterial('#e0a800', 0.5, 0.2);

  useFrame((_, dt) => {
    if (!group.current || !boom.current || !hook.current) return;
    group.current.getWorldPosition(here);
    const busy = sim.ships.dockedNear(here.x, here.z, 45);
    working.current += ((busy ? 1 : 0) - working.current) * Math.min(1, dt * 1.5);
    boom.current.rotation.y = Math.sin(sim.time * 0.5) * 0.9 * working.current;
    hook.current.position.y = 7.5 - (0.5 + 0.5 * Math.sin(sim.time * 0.9)) * 3 * working.current;
  });

  return (
    <group ref={group}>
      {[-1.4, 1.4].flatMap((x) => [-1.4, 1.4].map((z) => (
        <mesh key={x + ',' + z} position={[x, 5.5, z]} material={yellow} castShadow>
          <boxGeometry args={[0.35, 11, 0.35]} />
        </mesh>
      )))}
      <mesh position={[0, 11.2, 0]} material={yellow} castShadow>
        <boxGeometry args={[3.6, 0.5, 3.6]} />
      </mesh>
      <group ref={boom} position={[0, 11.9, 0]}>
        <mesh position={[0, 0, 4.5]} material={yellow} castShadow>
          <boxGeometry args={[0.6, 0.6, 14]} />
        </mesh>
        <mesh position={[0, 0.8, -2.2]} material={darkMetalMaterial} castShadow>
          <boxGeometry args={[1.4, 1.4, 1.8]} />
        </mesh>
        <mesh ref={hook} position={[0, 7.5, 9]} material={darkMetalMaterial}>
          <boxGeometry args={[0.3, 0.4, 0.3]} />
        </mesh>
        <mesh position={[0, 4, 9]} material={darkMetalMaterial}>
          <boxGeometry args={[0.05, 8, 0.05]} />
        </mesh>
      </group>
    </group>
  );
}

const CONTAINER_COLOURS = ['#c0392b', '#2b6cb0', '#2f855a', '#d4a017', '#8e44ad', '#16a085', '#e67e22', '#7f8c8d'];

/** Stacked shipping containers: two columns, two deep, two high. */
export function ContainersModel({ seed }: { seed: number }) {
  const offset = Math.floor(seed * CONTAINER_COLOURS.length);
  return (
    <group>
      <mesh position={[0, 0.06, 0]} material={solidMaterial('#7d8084', 0.9)} receiveShadow>
        <boxGeometry args={[5.6, 0.12, 5.6]} />
      </mesh>
      {[-1.3, 1.3].flatMap((x, ix) =>
        [-1.3, 1.3].flatMap((z, iz) =>
          [0, 1].map((level) => (
            <mesh
              key={`${x},${z},${level}`}
              position={[x, 0.12 + 1.3 + level * 2.6, z]}
              material={solidMaterial(CONTAINER_COLOURS[(offset + ix * 3 + iz * 2 + level) % CONTAINER_COLOURS.length], 0.6, 0.2)}
              castShadow
            >
              <boxGeometry args={[2.4, 2.5, 2.4]} />
            </mesh>
          )),
        ),
      )}
    </group>
  );
}
