import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CELL, isTreeType, resolveBoard, type LedSpec, type PieceType } from './catalog';
import { TreeModel } from './TreeModel';
import type { TreeSpec } from './trees';
import { getLedMaterial, getSignMaterial } from './ledTextures';
import { sim } from '../sim/simulation';
import { lightFor, type Axis, type LightColour } from '../sim/signals';
import { darkMetalMaterial, glassMaterial, solidMaterial } from './materials';
import { getGlowTexture, lampGlowMaterial } from './nightLights';
import { atmo } from '../scenes/atmosphere';

lampGlowMaterial.map = getGlowTexture();
const poolGeometry = new THREE.PlaneGeometry(11, 11);

const bulbMat = new THREE.MeshStandardMaterial({ color: '#f4f7ff', emissive: '#dfe9ff', emissiveIntensity: 1.6 });
const pathMat = new THREE.MeshStandardMaterial({ color: '#d2c7ae', roughness: 0.95 });
const stoneMat = new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.75 });
const waterMat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.85 });
const redLight = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1.8 });
const amberLight = new THREE.MeshStandardMaterial({ color: '#ffb300', emissive: '#ffb300', emissiveIntensity: 0.5 });
const greenLight = new THREE.MeshStandardMaterial({ color: '#2ee66b', emissive: '#2ee66b', emissiveIntensity: 0.5 });

/** LED content used by props when the player has not set one. */
const DEFAULT_LED: Record<string, LedSpec> = {
  billboard: { mode: 'ticker', color: '#ff9d2e', block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 },
  busstop: { mode: 'checker', color: '#3ad6ff', block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 },
};

interface PropProps {
  seed: number;
  /** Player-chosen main colour; each prop falls back to its own default. */
  accent?: string;
  led?: LedSpec | null;
  /** Quarter-turns; traffic lights use it to pick the road they serve. */
  rot?: number;
  /** Trees: shape, colours and pattern number. */
  tree?: Partial<TreeSpec>;
}

function Hedge({ accent }: PropProps) {
  const material = solidMaterial(accent ?? '#3d7a35', 1);
  return (
    <group>
      <mesh position={[0, 0.6, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[5, 1.2, 1]} />
      </mesh>
      <mesh position={[0, 1.22, 0]} material={material} castShadow>
        <boxGeometry args={[4.8, 0.1, 0.85]} />
      </mesh>
    </group>
  );
}

function Park({ seed, accent }: PropProps) {
  return (
    <group>
      <mesh position={[0, 0.04, 0]} material={solidMaterial(accent ?? '#5fa24a', 1)} receiveShadow>
        <boxGeometry args={[CELL, 0.08, CELL]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={pathMat} receiveShadow>
        <boxGeometry args={[1.2, 0.04, CELL]} />
      </mesh>
      <mesh position={[0, 0.09, 0]} material={pathMat} receiveShadow>
        <boxGeometry args={[CELL, 0.04, 1.2]} />
      </mesh>
      <group position={[-1.7, 0, -1.7]} scale={0.8}>
        <TreeModel type="tree" seed={seed} />
      </group>
      <group position={[1.9, 0, 1.6]} scale={0.7}>
        <TreeModel type="tree" seed={(seed * 3.7) % 1} />
      </group>
      {[[1.8, -1.9], [-2, 1.9]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.4, z]} material={solidMaterial('#3d7a35', 1)} castShadow>
          <icosahedronGeometry args={[0.6, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function Plaza({ accent }: PropProps) {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} material={solidMaterial('#8d877b', 0.9)} receiveShadow>
        <boxGeometry args={[CELL, 0.1, CELL]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={solidMaterial(accent ?? '#b9b2a4', 0.9)} receiveShadow>
        <boxGeometry args={[CELL - 0.5, 0.1, CELL - 0.5]} />
      </mesh>
      {[-1.5, 1.5].flatMap((x) => [-1.5, 1.5].map((z) => (
        <mesh key={`${x},${z}`} position={[x, 0.13, z]} material={solidMaterial('#8d877b', 0.9)} receiveShadow>
          <boxGeometry args={[2.6, 0.04, 2.6]} />
        </mesh>
      )))}
    </group>
  );
}

function Fountain({ accent }: PropProps) {
  const water = waterMat(accent ?? '#4fa8d6');
  return (
    <group>
      <mesh position={[0, 0.05, 0]} material={solidMaterial('#8d877b', 0.9)} receiveShadow>
        <boxGeometry args={[CELL, 0.1, CELL]} />
      </mesh>
      <mesh position={[0, 0.35, 0]} material={stoneMat} castShadow receiveShadow>
        <cylinderGeometry args={[2, 2.1, 0.5, 32]} />
      </mesh>
      <mesh position={[0, 0.57, 0]} material={water}>
        <cylinderGeometry args={[1.8, 1.8, 0.06, 32]} />
      </mesh>
      <mesh position={[0, 1, 0]} material={stoneMat} castShadow>
        <cylinderGeometry args={[0.22, 0.3, 1.2, 12]} />
      </mesh>
      <mesh position={[0, 1.65, 0]} material={stoneMat} castShadow>
        <cylinderGeometry args={[0.9, 0.5, 0.2, 20]} />
      </mesh>
      <mesh position={[0, 2.3, 0]} material={water}>
        <coneGeometry args={[0.12, 1.2, 8]} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.2, 0.95, Math.sin(a) * 1.2]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} material={water}>
            <coneGeometry args={[0.05, 0.9, 6]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Motion-sensing streetlight: idles dim and brightens when a person or vehicle is nearby. */
function Lamp({ accent }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  const group = useRef<THREE.Group>(null);
  const bulb = useMemo(() => {
    const m = bulbMat.clone();
    m.emissiveIntensity = 0;
    return m;
  }, []);
  const level = useRef(0);
  const here = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);

  // Off by day. After dark it idles at a soft glow and brightens when someone or something comes near.
  useFrame((_, dt) => {
    if (!group.current) return;
    if (!placed.current) {
      group.current.getWorldPosition(here);
      placed.current = true;
    }
    const dark = atmo.lamps;
    if (dark < 0.01 && level.current < 0.01) return;
    const target = dark * (sim.activityNear(here.x, here.z, 14) ? 3 : 1.25);
    level.current += (target - level.current) * Math.min(1, dt * 6);
    bulb.emissiveIntensity = level.current;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 2.5, 0]} material={pole} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 5, 10]} />
      </mesh>
      <mesh position={[0.5, 5, 0]} material={pole} castShadow>
        <boxGeometry args={[1.1, 0.09, 0.09]} />
      </mesh>
      <mesh position={[0.98, 4.9, 0]} material={bulb}>
        <boxGeometry args={[0.7, 0.1, 0.32]} />
      </mesh>
      <mesh position={[0.98, 4.97, 0]} material={pole} castShadow>
        <boxGeometry args={[0.76, 0.06, 0.38]} />
      </mesh>
      <mesh position={[0.98, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={poolGeometry} material={lampGlowMaterial} renderOrder={3} />
    </group>
  );
}

function Bench({ accent }: PropProps) {
  const wood = solidMaterial(accent ?? '#8a5a2b', 0.8);
  return (
    <group>
      {[0.5, 0.62].map((y, i) => (
        <mesh key={i} position={[0, y, 0.1 - i * 0.2]} material={wood} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.06, 0.28]} />
        </mesh>
      ))}
      <mesh position={[0, 0.95, -0.3]} material={wood} castShadow>
        <boxGeometry args={[1.8, 0.4, 0.06]} />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0.25, 0]} material={darkMetalMaterial} castShadow>
          <boxGeometry args={[0.08, 0.5, 0.55]} />
        </mesh>
      ))}
    </group>
  );
}

function BusStop({ accent, led }: PropProps) {
  const spec = led ?? DEFAULT_LED.busstop;
  const roof = solidMaterial(accent ?? '#2c3036', 0.5, 0.3);
  return (
    <group>
      <mesh position={[0, 2.5, 0]} material={roof} castShadow>
        <boxGeometry args={[3.4, 0.12, 1.5]} />
      </mesh>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 1.25, -0.6]} material={darkMetalMaterial} castShadow>
          <boxGeometry args={[0.08, 2.5, 0.08]} />
        </mesh>
      ))}
      <mesh position={[-0.5, 1.2, -0.62]} material={glassMaterial}>
        <boxGeometry args={[2.3, 2, 0.04]} />
      </mesh>
      <mesh position={[-0.5, 0.5, -0.2]} material={solidMaterial('#d9dcdc', 0.4)} castShadow>
        <boxGeometry args={[2, 0.08, 0.5]} />
      </mesh>
      <mesh position={[1.45, 1.3, 0.05]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[0.95, 1.75, 0.14]} />
      </mesh>
      <mesh position={[1.45, 1.3, 0.14]} material={getLedMaterial(spec, 0.8, 1.6)}>
        <boxGeometry args={[0.8, 1.6, 0.04]} />
      </mesh>
    </group>
  );
}

function Billboard({ accent, led }: PropProps) {
  const spec = led ?? DEFAULT_LED.billboard;
  const b = resolveBoard(spec.board);
  const frame = solidMaterial(accent ?? '#1c1f24', 0.5, 0.5);
  const screen = getLedMaterial(spec, b.w, b.h, 2.2);
  const cy = b.mast + b.h / 2;
  const depth = 0.3 + b.thick * 0.3;
  const poleX = b.poles === 'two' ? [-b.w * 0.21, b.w * 0.21] : b.poles === 'one' ? [0] : [];
  return (
    <group>
      {poleX.map((x) => (
        <mesh key={x} position={[x, b.mast / 2, 0]} material={frame} castShadow>
          <cylinderGeometry args={[0.14 + b.thick * 0.1, 0.2 + b.thick * 0.15, b.mast, 10]} />
        </mesh>
      ))}
      {/* The board leans about its middle. */}
      <group position={[0, cy, 0]} rotation={[(-b.tilt * Math.PI) / 180, 0, 0]}>
        <mesh material={frame} castShadow>
          <boxGeometry args={[b.w + b.thick, b.h + b.thick, depth]} />
        </mesh>
        <mesh position={[0, 0, depth / 2 + 0.02]} material={screen}>
          <boxGeometry args={[b.w, b.h, 0.05]} />
        </mesh>
        {b.sides === 'two' && (
          <mesh position={[0, 0, -depth / 2 - 0.02]} rotation={[0, Math.PI, 0]} material={screen}>
            <boxGeometry args={[b.w, b.h, 0.05]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

function Kiosk({ accent }: PropProps) {
  const body = solidMaterial(accent ?? '#f2b134', 0.45);
  return (
    <group>
      <mesh position={[0, 1.2, 0]} material={body} castShadow receiveShadow>
        <boxGeometry args={[2.2, 2.4, 2]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[2.7, 0.14, 2.5]} />
      </mesh>
      <mesh position={[0, 1.45, 1.01]} material={glassMaterial}>
        <boxGeometry args={[1.7, 0.9, 0.04]} />
      </mesh>
      <mesh position={[0, 0.95, 1.2]} material={solidMaterial('#ececec', 0.5)} castShadow>
        <boxGeometry args={[1.9, 0.08, 0.45]} />
      </mesh>
      <mesh position={[0, 2.15, 1.03]} material={getSignMaterial('KIOSK', '#ffffff')}>
        <boxGeometry args={[1.4, 0.35, 0.05]} />
      </mesh>
    </group>
  );
}

/**
 * An intelligent traffic light with a pedestrian signal and a radar sensor. A junction with
 * one beside it runs an adaptive signal: it extends green while traffic keeps coming, gaps out
 * when a road empties, rests on green when nothing is waiting, and gives people who press for
 * the crossing an all-red walk phase. The light's rotation picks which road its main head
 * serves (even turns: north-south, odd: east-west).
 */
function TrafficLight({ accent, rot = 0 }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  const axis: Axis = rot % 2 === 0 ? 0 : 1;
  const group = useRef<THREE.Group>(null);
  const here = useMemo(() => new THREE.Vector3(), []);
  const lamps = useMemo(() => [redLight, amberLight, greenLight].map((m) => m.clone()), []);
  const walkLamps = useMemo(() => [redLight, greenLight].map((m) => m.clone()), []);
  const sensor = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7de3ff', emissive: '#7de3ff', emissiveIntensity: 0.4 }), []);

  useFrame(() => {
    let colour: LightColour;
    let walk = false;
    let waiting = false;
    if (group.current) {
      group.current.getWorldPosition(here);
      const controller = sim.signalAt(here.x, here.z);
      colour = controller ? controller.colour(axis) : lightFor(axis, sim.time);
      walk = !!controller?.walk;
      waiting = !!controller;
    } else {
      colour = 'red';
    }
    lamps[0].emissiveIntensity = colour === 'red' ? 2.6 : 0.08;
    lamps[1].emissiveIntensity = colour === 'yellow' ? 2.6 : 0.08;
    lamps[2].emissiveIntensity = colour === 'green' ? 2.6 : 0.08;
    walkLamps[0].emissiveIntensity = walk ? 0.08 : 2.2;
    walkLamps[1].emissiveIntensity = walk ? 2.4 : 0.08;
    // The radar blinks while the signal is actively reading traffic.
    sensor.emissiveIntensity = waiting ? 0.9 + 0.8 * Math.sin(sim.time * 6) : 0.3;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 2.5, 0]} material={pole} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 5, 8]} />
      </mesh>
      <mesh position={[0.9, 4.8, 0]} material={pole} castShadow>
        <boxGeometry args={[1.8, 0.08, 0.08]} />
      </mesh>
      {/* Vehicle signal head */}
      <mesh position={[1.7, 4.5, 0]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[0.34, 1, 0.34]} />
      </mesh>
      {lamps.map((material, i) => (
        <mesh key={i} position={[1.7, 4.8 - i * 0.3, 0.18]} material={material}>
          <sphereGeometry args={[0.09, 10, 10]} />
        </mesh>
      ))}
      {/* Pedestrian signal and push-button */}
      <mesh position={[0, 2.9, 0.14]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[0.3, 0.5, 0.16]} />
      </mesh>
      {walkLamps.map((material, i) => (
        <mesh key={i} position={[0, 3.05 - i * 0.25, 0.23]} material={material}>
          <boxGeometry args={[0.14, 0.14, 0.03]} />
        </mesh>
      ))}
      <mesh position={[0, 1.5, 0.12]} material={solidMaterial('#d9c000', 0.5)}>
        <boxGeometry args={[0.12, 0.18, 0.08]} />
      </mesh>
      {/* Radar sensor on the arm */}
      <mesh position={[1.1, 4.98, 0]} material={sensor}>
        <sphereGeometry args={[0.1, 10, 8]} />
      </mesh>
    </group>
  );
}

/** Visual for a non-building prop; undefined for types that are not props. */
export function PropModel({ type, ...props }: PropProps & { type: PieceType }) {
  if (isTreeType(type)) return <TreeModel type={type} seed={props.seed} accent={props.accent} spec={props.tree} />;
  switch (type) {
    case 'hedge':
      return <Hedge {...props} />;
    case 'park':
      return <Park {...props} />;
    case 'plaza':
      return <Plaza {...props} />;
    case 'fountain':
      return <Fountain {...props} />;
    case 'lamp':
      return <Lamp {...props} />;
    case 'bench':
      return <Bench {...props} />;
    case 'busstop':
      return <BusStop {...props} />;
    case 'billboard':
      return <Billboard {...props} />;
    case 'kiosk':
      return <Kiosk {...props} />;
    case 'trafficlight':
      return <TrafficLight {...props} />;
    default:
      return null;
  }
}
