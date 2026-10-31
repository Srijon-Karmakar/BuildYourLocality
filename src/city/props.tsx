import * as THREE from 'three';
import { CELL, type LedSpec, type PieceType } from './catalog';
import { getLedMaterial, getSignMaterial } from './ledTextures';
import { darkMetalMaterial, glassMaterial, solidMaterial } from './materials';

const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b3a1e', roughness: 0.95 });
const leafMats = ['#3f8a3a', '#4c9a40', '#5aa046', '#6aa84f'].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
);
const pineMat = new THREE.MeshStandardMaterial({ color: '#2f6b36', roughness: 0.9, flatShading: true });
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
}

function Tree({ seed, accent }: PropProps) {
  const scale = 0.85 + seed * 0.4;
  const leaf = accent ? solidMaterial(accent, 0.9) : leafMats[Math.floor(seed * leafMats.length)];
  return (
    <group scale={scale}>
      <mesh position={[0, 1.2, 0]} material={trunkMat} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.4, 7]} />
      </mesh>
      <mesh position={[0, 3.5, 0]} material={leaf} castShadow receiveShadow>
        <icosahedronGeometry args={[1.7, 1]} />
      </mesh>
      <mesh position={[0.7, 2.9, 0.4]} material={leaf} castShadow>
        <icosahedronGeometry args={[1.1, 1]} />
      </mesh>
    </group>
  );
}

function Pine({ seed, accent }: PropProps) {
  const scale = 0.9 + seed * 0.4;
  const leaf = accent ? solidMaterial(accent, 0.9) : pineMat;
  return (
    <group scale={scale}>
      <mesh position={[0, 0.7, 0]} material={trunkMat} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 1.4, 6]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.9 + i * 1.15, 0]} material={leaf} castShadow>
          <coneGeometry args={[1.5 - i * 0.4, 1.8, 8]} />
        </mesh>
      ))}
    </group>
  );
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
        <Tree seed={seed} />
      </group>
      <group position={[1.9, 0, 1.6]} scale={0.7}>
        <Tree seed={(seed * 3.7) % 1} />
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

function Lamp({ accent }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  return (
    <group>
      <mesh position={[0, 2.5, 0]} material={pole} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 5, 10]} />
      </mesh>
      <mesh position={[0.5, 5, 0]} material={pole} castShadow>
        <boxGeometry args={[1.1, 0.09, 0.09]} />
      </mesh>
      <mesh position={[0.98, 4.9, 0]} material={bulbMat}>
        <boxGeometry args={[0.7, 0.1, 0.32]} />
      </mesh>
      <mesh position={[0.98, 4.97, 0]} material={pole} castShadow>
        <boxGeometry args={[0.76, 0.06, 0.38]} />
      </mesh>
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
      <mesh position={[1.45, 1.3, 0.14]} material={getLedMaterial(spec.mode, spec.color)}>
        <boxGeometry args={[0.8, 1.6, 0.04]} />
      </mesh>
    </group>
  );
}

function Billboard({ accent, led }: PropProps) {
  const spec = led ?? DEFAULT_LED.billboard;
  const frame = solidMaterial(accent ?? '#1c1f24', 0.5, 0.5);
  const screen = getLedMaterial(spec.mode, spec.color, 2.2);
  return (
    <group>
      {[-1.6, 1.6].map((x) => (
        <mesh key={x} position={[x, 2.8, 0]} material={frame} castShadow>
          <cylinderGeometry args={[0.14, 0.2, 5.6, 10]} />
        </mesh>
      ))}
      <mesh position={[0, 7, 0]} material={frame} castShadow>
        <boxGeometry args={[7.9, 3.9, 0.3]} />
      </mesh>
      <mesh position={[0, 7, 0.17]} material={screen}>
        <boxGeometry args={[7.5, 3.5, 0.05]} />
      </mesh>
      <mesh position={[0, 7, -0.17]} rotation={[0, Math.PI, 0]} material={screen}>
        <boxGeometry args={[7.5, 3.5, 0.05]} />
      </mesh>
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

function TrafficLight({ accent }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  return (
    <group>
      <mesh position={[0, 2.5, 0]} material={pole} castShadow>
        <cylinderGeometry args={[0.07, 0.1, 5, 8]} />
      </mesh>
      <mesh position={[0.9, 4.8, 0]} material={pole} castShadow>
        <boxGeometry args={[1.8, 0.08, 0.08]} />
      </mesh>
      <mesh position={[1.7, 4.5, 0]} material={darkMetalMaterial} castShadow>
        <boxGeometry args={[0.34, 1, 0.34]} />
      </mesh>
      {[
        [redLight, 4.8],
        [amberLight, 4.5],
        [greenLight, 4.2],
      ].map(([material, y], i) => (
        <mesh key={i} position={[1.7, y as number, 0.18]} material={material as THREE.Material}>
          <sphereGeometry args={[0.09, 10, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** Visual for a non-building prop; undefined for types that are not props. */
export function PropModel({ type, ...props }: PropProps & { type: PieceType }) {
  switch (type) {
    case 'tree':
      return <Tree {...props} />;
    case 'pine':
      return <Pine {...props} />;
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
