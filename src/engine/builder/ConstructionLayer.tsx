import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_H } from '../../city/catalog';
import { LOT_HEIGHT } from '../../city/geometries';
import { useConstructionStore, type SiteView } from '../../sim/construction';
import { rasterGlyph } from '../../ui/iconRaster';

const metal = new THREE.MeshStandardMaterial({ color: '#a9aeb4', roughness: 0.5, metalness: 0.6 });
const planks = new THREE.MeshStandardMaterial({ color: '#b98d55', roughness: 0.85 });
const netting = new THREE.MeshStandardMaterial({ color: '#3f8f5a', roughness: 0.9, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
const craneYellow = new THREE.MeshStandardMaterial({ color: '#f2b705', roughness: 0.55, metalness: 0.3 });
const dark = new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.7 });
const brick = new THREE.MeshStandardMaterial({ color: '#9c4a34', roughness: 0.9 });
const sand = new THREE.MeshStandardMaterial({ color: '#d2b878', roughness: 1 });
const pipe = new THREE.MeshStandardMaterial({ color: '#6f7a85', roughness: 0.5, metalness: 0.6 });
const skip = new THREE.MeshStandardMaterial({ color: '#2f6f9f', roughness: 0.6, metalness: 0.3 });
const cone = new THREE.MeshStandardMaterial({ color: '#ff6a1a', roughness: 0.7 });

const geometryCache = new Map<string, { poles: THREE.BufferGeometry; planks: THREE.BufferGeometry; net: THREE.BufferGeometry }>();

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/**
 * Scaffolding around the top storeys of a building: poles, a rail at every floor, timber
 * platforms and green netting. Only the top dozen floors get it, so a skyscraper stays cheap.
 */
function scaffoldGeometry(w: number, d: number, floors: number) {
  const key = `${w.toFixed(1)},${d.toFixed(1)},${floors}`;
  const hit = geometryCache.get(key);
  if (hit) return hit;

  const gap = 0.55;
  const hw = w / 2 + gap;
  const hd = d / 2 + gap;
  const top = LOT_HEIGHT + floors * FLOOR_H + FLOOR_H;
  const bottom = Math.max(0, LOT_HEIGHT + Math.max(0, floors - 12) * FLOOR_H - 0.1);
  const height = top - bottom;
  const mid = bottom + height / 2;

  const poles: THREE.BufferGeometry[] = [];
  const decks: THREE.BufferGeometry[] = [];
  const nets: THREE.BufferGeometry[] = [];

  const along = (len: number, step: number) => {
    const n = Math.max(1, Math.round(len / step));
    return Array.from({ length: n + 1 }, (_, i) => -len / 2 + (len * i) / n);
  };
  // Vertical poles along all four sides.
  for (const x of along(hw * 2, 2.6)) for (const z of [-hd, hd]) poles.push(box(0.1, height, 0.1, x, mid, z));
  for (const z of along(hd * 2, 2.6).slice(1, -1)) for (const x of [-hw, hw]) poles.push(box(0.1, height, 0.1, x, mid, z));
  // A rail round the building at every floor, and timber platforms on the top two levels.
  const levels = Math.round(height / FLOOR_H);
  for (let i = 0; i <= levels; i++) {
    const y = bottom + i * FLOOR_H;
    poles.push(box(hw * 2 + 0.1, 0.07, 0.07, 0, y + 1.0, -hd), box(hw * 2 + 0.1, 0.07, 0.07, 0, y + 1.0, hd));
    poles.push(box(0.07, 0.07, hd * 2 + 0.1, -hw, y + 1.0, 0), box(0.07, 0.07, hd * 2 + 0.1, hw, y + 1.0, 0));
    if (i >= levels - 1) {
      decks.push(box(hw * 2, 0.08, 0.9, 0, y, -hd + 0.2), box(hw * 2, 0.08, 0.9, 0, y, hd - 0.2));
      decks.push(box(0.9, 0.08, hd * 2 - 1.2, -hw + 0.2, y, 0), box(0.9, 0.08, hd * 2 - 1.2, hw - 0.2, y, 0));
    }
  }
  // Netting on each side.
  nets.push(
    new THREE.PlaneGeometry(hw * 2, height - FLOOR_H * 0.6).translate(0, mid - FLOOR_H * 0.2, hd + 0.05),
    new THREE.PlaneGeometry(hw * 2, height - FLOOR_H * 0.6).rotateY(Math.PI).translate(0, mid - FLOOR_H * 0.2, -hd - 0.05),
    new THREE.PlaneGeometry(hd * 2, height - FLOOR_H * 0.6).rotateY(Math.PI / 2).translate(hw + 0.05, mid - FLOOR_H * 0.2, 0),
    new THREE.PlaneGeometry(hd * 2, height - FLOOR_H * 0.6).rotateY(-Math.PI / 2).translate(-hw - 0.05, mid - FLOOR_H * 0.2, 0),
  );

  const out = { poles: mergeGeometries(poles)!, planks: mergeGeometries(decks)!, net: mergeGeometries(nets)! };
  poles.forEach((g) => g.dispose());
  decks.forEach((g) => g.dispose());
  nets.forEach((g) => g.dispose());
  geometryCache.set(key, out);
  return out;
}

/** A tower crane beside the building: mast, rotating jib, counterweight and a hook that bobs. */
function Crane({ view, working }: { view: SiteView; working: boolean }) {
  const jib = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Group>(null);
  const spin = useRef(Math.random() * 6);
  const mastHeight = view.height + 12;

  useFrame((_, dt) => {
    if (!jib.current || !hook.current) return;
    if (working) spin.current += dt * 0.22;
    jib.current.rotation.y = spin.current;
    const reach = 7 + Math.sin(spin.current * 2.3) * 3.5;
    hook.current.position.set(reach, -2.5 - (Math.sin(spin.current * 3) * 0.5 + 0.5) * Math.min(12, view.height * 0.4 + 2), 0);
  });

  return (
    <group position={[view.box.cx + view.box.w / 2 + 3.4, 0, view.box.cz - view.box.d / 2 - 1.2]}>
      {/* Mast: four legs with cross braces. */}
      {[-0.5, 0.5].flatMap((x) => [-0.5, 0.5].map((z) => (
        <mesh key={`${x},${z}`} position={[x, mastHeight / 2, z]} material={craneYellow} castShadow>
          <boxGeometry args={[0.16, mastHeight, 0.16]} />
        </mesh>
      )))}
      {Array.from({ length: Math.max(1, Math.floor(mastHeight / 3)) }, (_, i) => (
        <mesh key={i} position={[0, 1.5 + i * 3, 0]} rotation={[0, 0, 0.5]} material={craneYellow}>
          <boxGeometry args={[1.45, 0.07, 0.07]} />
        </mesh>
      ))}
      <group position={[0, mastHeight, 0]}>
        <mesh position={[0, 0.6, 0]} material={craneYellow} castShadow>
          <boxGeometry args={[1.3, 1.2, 1.3]} />
        </mesh>
        <group ref={jib} position={[0, 1.3, 0]}>
          <mesh position={[9, 0, 0]} material={craneYellow} castShadow>
            <boxGeometry args={[18, 0.55, 0.55]} />
          </mesh>
          <mesh position={[-4, 0, 0]} material={craneYellow} castShadow>
            <boxGeometry args={[8, 0.55, 0.55]} />
          </mesh>
          <mesh position={[-7, -0.9, 0]} material={dark} castShadow>
            <boxGeometry args={[2.2, 1.6, 1.2]} />
          </mesh>
          <mesh position={[0.6, 0.2, 0.9]} material={dark}>
            <boxGeometry args={[1.2, 1.1, 1.0]} />
          </mesh>
          <group ref={hook}>
            <mesh position={[0, 1.2, 0]} material={dark}>
              <cylinderGeometry args={[0.03, 0.03, 2.4, 5]} />
            </mesh>
            <mesh position={[0, -0.1, 0]} material={craneYellow}>
              <boxGeometry args={[0.5, 0.35, 0.4]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/** Stacked bricks, a sand heap, pipes, a skip and some cones where the crew keeps its materials. */
function MaterialPile({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-1.1 + (i % 2) * 0.9, 0.3 + Math.floor(i / 2) * 0.6, -0.7]} material={brick} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.55, 0.7]} />
        </mesh>
      ))}
      <mesh position={[1.1, 0.35, 0.3]} material={sand} castShadow>
        <coneGeometry args={[0.9, 0.7, 8]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.9, 0.18 + (i === 2 ? 0.3 : 0), 0.9 + (i % 2) * 0.26]} rotation={[0, 0, Math.PI / 2]} material={pipe} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 1.5, 8]} />
        </mesh>
      ))}
      <mesh position={[0.5, 0.55, -1.6]} material={skip} castShadow>
        <boxGeometry args={[1.6, 1.0, 1.0]} />
      </mesh>
      {[[-1.9, 1.7], [1.9, -1.1], [-0.3, 2.0]].map(([cx, cz], i) => (
        <mesh key={i} position={[cx, 0.28, cz]} material={cone} castShadow>
          <coneGeometry args={[0.16, 0.56, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** A floating progress tag over the site. */
function Marker({ view }: { view: SiteView }) {
  const sprite = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const s = new THREE.Sprite(material);
    s.renderOrder = 9;
    return s;
  }, []);

  useEffect(() => {
    const canvas = sprite.material.map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(15,17,21,0.78)';
    ctx.beginPath();
    ctx.roundRect(6, 10, 244, 76, 24);
    ctx.fill();
    ctx.font = '700 44px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = view.paused ? '#ffd27a' : '#ffffff';
    const label = view.paused === 'night' ? 'resting' : view.paused === 'weather' ? 'waiting' : `${view.pct}%`;
    const glyph = view.paused === 'night' ? 'moon' : view.paused === 'weather' ? 'rain' : 'build';
    ctx.textAlign = 'left';
    ctx.fillText(label, 88, 50);
    const tex = sprite.material.map!;
    const glyphCanvas = rasterGlyph(glyph, 48, view.paused ? '#ffd27a' : '#ffffff', () => {
      ctx.drawImage(glyphCanvas, 24, 26);
      tex.needsUpdate = true;
    });
    sprite.material.map!.needsUpdate = true;
  }, [sprite, view.pct, view.paused]);

  return <primitive object={sprite} position={[view.x, view.height + (view.crane ? 14 : 5), view.z]} scale={[6, 2.25, 1]} />;
}

function Site({ view }: { view: SiteView }) {
  const scaffold = useMemo(() => scaffoldGeometry(view.box.w, view.box.d, view.floors), [view.box.w, view.box.d, view.floors]);
  return (
    <>
      <group position={[view.x, 0, view.z]} rotation={[0, view.rotY, 0]}>
        {view.pct < 100 && (
          <group position={[view.box.cx, 0, view.box.cz]}>
            <mesh geometry={scaffold.poles} material={metal} castShadow />
            <mesh geometry={scaffold.planks} material={planks} castShadow />
            <mesh geometry={scaffold.net} material={netting} />
          </group>
        )}
        {view.crane && <Crane view={view} working={!view.paused} />}
      </group>
      <MaterialPile x={view.pile.x} z={view.pile.z} />
      <Marker view={view} />
    </>
  );
}

/** Scaffolding, cranes, material piles and progress tags for every building site. */
export function ConstructionLayer() {
  const sites = useConstructionStore((s) => s.sites);
  return (
    <>
      {Object.values(sites).map((view) => (
        <Site key={view.id} view={view} />
      ))}
    </>
  );
}
