import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { CELL, isTreeType, resolveBoard, resolveLed, type LedSpec, type PieceType } from './catalog';
import { TreeModel } from './TreeModel';
import type { TreeSpec } from './trees';
import { getLedColour, getLedMaterial, getSignMaterial } from './ledTextures';
import { registerLed } from './ledRegistry';
import { arcOf, curvedPanelGeometry, sagOf } from './ledShapes';
import { sim } from '../sim/simulation';
import { lightFor, type Axis, type LightColour } from '../sim/signals';
import { darkMetalMaterial, glassMaterial, solidMaterial } from './materials';
import { getGlowTexture, lampGlowMaterial } from './nightLights';
import { atmo } from '../scenes/atmosphere';
import { useGameStore } from '../state/useGameStore';

lampGlowMaterial.map = getGlowTexture();
const poolGeometry = new THREE.PlaneGeometry(11, 11);

let cachedBarrierTexture: THREE.CanvasTexture | null = null;
function getBarrierTexture(): THREE.CanvasTexture {
  if (cachedBarrierTexture) return cachedBarrierTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Concrete background
  ctx.fillStyle = '#b8bcc2';
  ctx.fillRect(0, 0, 256, 128);
  // Concrete noise
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 128;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Bold diagonal yellow hazard warning stripe (matching the foreground barrier in the concept art)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(70, 0);
  ctx.lineTo(125, 0);
  ctx.lineTo(210, 128);
  ctx.lineTo(155, 128);
  ctx.closePath();
  ctx.fillStyle = '#ffbe18';
  ctx.fill();
  ctx.strokeStyle = '#22252a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBarrierTexture = tex;
  return tex;
}

const bulbMat = new THREE.MeshStandardMaterial({ color: '#f4f7ff', emissive: '#dfe9ff', emissiveIntensity: 1.6 });
const pathMat = new THREE.MeshStandardMaterial({ color: '#d2c7ae', roughness: 0.95 });
const stoneMat = new THREE.MeshStandardMaterial({ color: '#b9b6ae', roughness: 0.75 });
const waterMat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.85 });
const redLight = new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff3b30', emissiveIntensity: 1.8 });
const amberLight = new THREE.MeshStandardMaterial({ color: '#ffb300', emissive: '#ffb300', emissiveIntensity: 0.5 });
const greenLight = new THREE.MeshStandardMaterial({ color: '#2ee66b', emissive: '#2ee66b', emissiveIntensity: 0.5 });

/** LED content used by props when the player has not set one. */
export const DEFAULT_PROP_LED: Record<string, LedSpec> = {
  ledwall: { mode: 'aurora', color: '#5cffd0', color2: '#8a5cff', bg: '#03030d', curve: 0.5, board: { w: 14, h: 6, mast: 1.6, poles: 'none', tilt: 0, thick: 0.4 }, block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 },
  ledtower: { mode: 'plasma', color: '#ff3df0', color2: '#35e0ff', bg: '#05000f', curve: 0.7, block: 0, side: 'front', bottom: 3, height: 6, width: 0, offset: 0 },
};
const DEFAULT_LED: Record<string, LedSpec> = {
  ...DEFAULT_PROP_LED,
  billboard: { mode: 'ticker', color: '#ff9d2e', block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 },
  busstop: { mode: 'checker', color: '#3ad6ff', block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 },
};

interface PropProps {
  seed: number;
  /** Which block of cells the piece stands in (lamps in one zone share a bulb). */
  zone?: string;
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

/**
 * Streetlight bulbs are shared by every lamp in the same 3x3-cell zone: one material (so one draw call) and one
 * motion check per zone instead of per lamp. The whole zone brightens when anyone is nearby.
 */
interface BulbZone {
  material: THREE.MeshStandardMaterial;
  level: number;
  stamp: number;
  users: number;
}
const bulbZones = new Map<string, BulbZone>();
function acquireBulb(key: string): BulbZone {
  let zone = bulbZones.get(key);
  if (!zone) {
    const material = bulbMat.clone();
    material.emissiveIntensity = 0;
    zone = { material, level: 0, stamp: -1, users: 0 };
    bulbZones.set(key, zone);
  }
  zone.users++;
  return zone;
}
function releaseBulb(key: string) {
  const zone = bulbZones.get(key);
  if (zone && --zone.users <= 0) bulbZones.delete(key);
}

/** Motion-sensing streetlight: idles dim and brightens when a person or vehicle is nearby. */
function ClassicLamp({ accent, zone }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  const group = useRef<THREE.Group>(null);
  const key = zone ?? 'solo';
  const shared = useMemo(() => acquireBulb(key), [key]);
  useEffect(() => () => releaseBulb(key), [key]);
  const bulb = shared.material;
  const here = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);

  // Off by day. After dark it idles at a soft glow and brightens when someone or something comes near.
  useFrame((state, dt) => {
    if (!group.current) return;
    if (!placed.current) {
      group.current.getWorldPosition(here);
      placed.current = true;
    }
    // One lamp per zone does the work each frame.
    if (shared.stamp === state.clock.elapsedTime) return;
    shared.stamp = state.clock.elapsedTime;
    const dark = atmo.lamps;
    if (dark < 0.01 && shared.level < 0.01) return;
    const target = dark * (sim.activityNear(here.x, here.z, 20) ? 3 : 1.25);
    shared.level += (target - shared.level) * Math.min(1, dt * 6);
    bulb.emissiveIntensity = shared.level;
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

/** Modern angled low-poly streetlight with cantilever arm and rectangular LED luminaire. */
function ModernLamp({ accent, zone }: PropProps) {
  const pole = accent ? solidMaterial(accent, 0.45, 0.6) : darkMetalMaterial;
  const group = useRef<THREE.Group>(null);
  const key = zone ?? 'solo';
  const shared = useMemo(() => acquireBulb(key), [key]);
  useEffect(() => () => releaseBulb(key), [key]);
  const bulb = shared.material;
  const here = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);

  useFrame((state, dt) => {
    if (!group.current) return;
    if (!placed.current) {
      group.current.getWorldPosition(here);
      placed.current = true;
    }
    // One lamp per zone does the work each frame.
    if (shared.stamp === state.clock.elapsedTime) return;
    shared.stamp = state.clock.elapsedTime;
    const dark = atmo.lamps;
    if (dark < 0.01 && shared.level < 0.01) return;
    const target = dark * (sim.activityNear(here.x, here.z, 20) ? 3.2 : 1.35);
    shared.level += (target - shared.level) * Math.min(1, dt * 6);
    bulb.emissiveIntensity = shared.level;
  });

  return (
    <group ref={group}>
      <mesh position={[0, 2.7, 0]} material={pole} castShadow>
        <boxGeometry args={[0.12, 5.4, 0.12]} />
      </mesh>
      <mesh position={[0.42, 5.5, 0]} rotation={[0, 0, -Math.PI / 4]} material={pole} castShadow>
        <boxGeometry args={[0.10, 1.25, 0.10]} />
      </mesh>
      <mesh position={[0.95, 5.92, 0]} material={pole} castShadow>
        <boxGeometry args={[0.76, 0.08, 0.36]} />
      </mesh>
      <mesh position={[0.95, 5.86, 0]} material={bulb}>
        <boxGeometry args={[0.68, 0.04, 0.28]} />
      </mesh>
      <mesh position={[0.95, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={poolGeometry} material={lampGlowMaterial} renderOrder={3} />
    </group>
  );
}

function Lamp(props: PropProps) {
  const stylised = useGameStore((s) => s.graphics.stylised);
  if (stylised) return <ModernLamp {...props} />;
  return <ClassicLamp {...props} />;
}

/** Modular concrete Jersey barrier with diagonal safety hazard stripe. */
function Barrier({ accent }: PropProps) {
  const stripeMat = useMemo(() => new THREE.MeshStandardMaterial({ map: getBarrierTexture(), roughness: 0.82 }), []);
  const concreteMat = useMemo(() => solidMaterial(accent ?? '#b4b8be', 0.85), [accent]);

  return (
    <group position={[0, 0, 0]}>
      {/* Base flange */}
      <mesh position={[0, 0.11, 0]} material={concreteMat} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.22, 0.6]} />
      </mesh>
      {/* Slanted stem with diagonal warning hazard stripe */}
      <mesh position={[0, 0.48, 0]} material={stripeMat} castShadow receiveShadow>
        <boxGeometry args={[2.38, 0.52, 0.38]} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 0.85, 0]} material={concreteMat} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.22, 0.22]} />
      </mesh>
    </group>
  );
}

/** Raised sidewalk tree planter curb with rich soil and low-poly faceted tree. */
function Planter({ seed, accent }: PropProps) {
  const curbMat = useMemo(() => solidMaterial(accent ?? '#a8acb2', 0.85), [accent]);
  const soilMat = useMemo(() => solidMaterial('#36281e', 0.95), []);

  return (
    <group>
      <mesh position={[0, 0.16, 0]} material={curbMat} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.32, 1.7]} />
      </mesh>
      <mesh position={[0, 0.28, 0]} material={soilMat} receiveShadow>
        <boxGeometry args={[1.35, 0.1, 1.35]} />
      </mesh>
      <group position={[0, 0.32, 0]} scale={0.75}>
        <TreeModel type="tree" seed={seed} />
      </group>
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

/** Lets the night lighting borrow a real light for a screen, so it throws its colour onto the street. */
function useLedLight(ref: RefObject<THREE.Group | null>, lx: number, ly: number, lz: number, width: number, height: number, spec: LedSpec) {
  const look = resolveLed(spec);
  const colour = useMemo(() => getLedColour(spec, width, height), [spec, width, height]);
  useEffect(() => {
    if (!ref.current || !look.glow) return;
    return registerLed({ object: ref.current, local: [lx, ly, lz], width, height, brightness: look.brightness, glowAmount: look.glowAmount, colour });
  }, [ref, lx, ly, lz, width, height, look.brightness, look.glowAmount, look.glow, colour]);
}

/** A big curved LED wall on a plinth or legs: set its size, height, curve and tilt, then fill it with any picture. */
function LedWall({ accent, led }: PropProps) {
  const spec = led ?? DEFAULT_LED.ledwall;
  const b = resolveBoard({ ...DEFAULT_LED.ledwall.board, ...spec.board });
  const curve = spec.curve ?? 0.5;
  const frame = useMemo(() => {
    const m = solidMaterial(accent ?? '#1c1f24', 0.5, 0.5).clone();
    m.side = THREE.DoubleSide;
    return m;
  }, [accent]);
  const screen = getLedMaterial(spec, b.w, b.h, 2.2);
  const screenGeo = useMemo(() => curvedPanelGeometry(b.w, b.h, curve), [b.w, b.h, curve]);
  const frameGeo = useMemo(() => curvedPanelGeometry(b.w + b.thick, b.h + b.thick, curve), [b.w, b.h, b.thick, curve]);
  const sag = sagOf(b.w, curve);
  const cy = b.mast + b.h / 2;
  const group = useRef<THREE.Group>(null);
  useLedLight(group, 0, cy, sag + 0.3, b.w, b.h, spec);
  const poleX = b.poles === 'two' ? [-b.w * 0.3, b.w * 0.3] : b.poles === 'one' ? [0] : [];
  return (
    <group ref={group}>
      {poleX.map((x) => (
        <mesh key={x} position={[x, b.mast / 2, sag * 0.3]} material={frame} castShadow>
          <cylinderGeometry args={[0.18, 0.26, b.mast, 10]} />
        </mesh>
      ))}
      {b.poles === 'none' && b.mast > 0 && (
        <mesh position={[0, b.mast / 2, sag * 0.35]} material={frame} castShadow>
          <boxGeometry args={[b.w * 0.82, b.mast, Math.max(0.8, sag * 0.7 + 0.6)]} />
        </mesh>
      )}
      <group position={[0, cy, 0]} rotation={[(-b.tilt * Math.PI) / 180, 0, 0]}>
        <mesh position={[0, 0, -0.06]} geometry={frameGeo} material={frame} castShadow />
        <mesh position={[0, 0, 0.02]} geometry={screenGeo} material={screen} />
      </group>
    </group>
  );
}

/** A glass tower with an LED screen wrapped round it: how far round, how high and how tall are all yours to set. */
function LedTower({ accent, led }: PropProps) {
  const spec = led ?? DEFAULT_LED.ledtower;
  const R = 4.4;
  const FLOOR = 3.5;
  const H = 28;
  const wrap = Math.max(0.12, spec.curve ?? 0.7) * Math.PI * 2;
  void arcOf;
  const bottom = Math.max(0, Math.min(6, spec.bottom));
  const storeys = Math.max(1, Math.min(spec.height, 7));
  const bandH = storeys * FLOOR - 0.4;
  const arc = R * wrap;
  const screen = getLedMaterial(spec, arc, bandH, 2.2);
  const trim = solidMaterial(accent ?? '#2c3036', 0.5, 0.5);
  const band = useMemo(() => new THREE.CylinderGeometry(R + 0.07, R + 0.07, bandH, 72, 1, true, -wrap / 2, wrap), [bandH, wrap]);
  const group = useRef<THREE.Group>(null);
  useLedLight(group, 0, 4 + bottom * FLOOR + bandH / 2, R + 0.3, Math.min(arc, 14), bandH, spec);
  const floorsY = useMemo(() => Array.from({ length: Math.floor(H / FLOOR) }, (_, i) => 3.4 + i * FLOOR), []);
  return (
    <group ref={group}>
      <mesh position={[0, 1.6, 0]} material={solidMaterial('#b9b6ae', 0.7)} castShadow receiveShadow>
        <cylinderGeometry args={[R + 0.9, R + 1.1, 3.2, 40]} />
      </mesh>
      <mesh position={[0, 3.2 + H / 2, 0]} material={glassMaterial} castShadow>
        <cylinderGeometry args={[R, R, H, 48]} />
      </mesh>
      {floorsY.map((y) => (
        <mesh key={y} position={[0, y + 0.1, 0]} material={trim}>
          <cylinderGeometry args={[R + 0.05, R + 0.05, 0.16, 48]} />
        </mesh>
      ))}
      <mesh position={[0, 4 + bottom * FLOOR + bandH / 2, 0]} geometry={band} material={screen} />
      <mesh position={[0, 3.2 + H + 0.4, 0]} material={trim} castShadow>
        <cylinderGeometry args={[R + 0.35, R + 0.35, 0.8, 48]} />
      </mesh>
      <mesh position={[0, 3.2 + H + 3, 0]} material={darkMetalMaterial}>
        <cylinderGeometry args={[0.08, 0.14, 5, 8]} />
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
    case 'modernlamp':
      return <ModernLamp {...props} />;
    case 'barrier':
      return <Barrier {...props} />;
    case 'planter':
      return <Planter {...props} />;
    case 'bench':
      return <Bench {...props} />;
    case 'busstop':
      return <BusStop {...props} />;
    case 'billboard':
      return <Billboard {...props} />;
    case 'ledwall':
      return <LedWall {...props} />;
    case 'ledtower':
      return <LedTower {...props} />;
    case 'kiosk':
      return <Kiosk {...props} />;
    case 'trafficlight':
      return <TrafficLight {...props} />;
    default:
      return null;
  }
}
