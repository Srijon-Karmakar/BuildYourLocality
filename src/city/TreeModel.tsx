import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { PieceType } from './catalog';
import { growTree, grassBlades, resolveTree, type TreeSpec } from './trees';

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded materials, so a forest of thousands of trees uses a few dozen. */
function material(hex: string, flat: boolean): THREE.MeshStandardMaterial {
  const key = `${hex}|${flat}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, flatShading: flat });
    materials.set(key, m);
  }
  return m;
}

const bladeMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** Grass blades are flat and seen from both sides; their per-corner shade comes from vertex colours. */
function bladeMaterial(hex: string): THREE.MeshStandardMaterial {
  let m = bladeMaterials.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 1, side: THREE.DoubleSide, vertexColors: true });
    bladeMaterials.set(hex, m);
  }
  return m;
}

const scratch = new THREE.Color();

/** `hex` pushed towards light (amount > 0) or dark (amount < 0), in a handful of steps so materials are shared. */
function shade(hex: string, amount: number): string {
  const step = Math.round(Math.max(-1, Math.min(1, amount)) * 4) / 4;
  if (step === 0) return hex;
  scratch.set(hex);
  scratch.lerp(step > 0 ? WHITE : BLACK, Math.abs(step) * 0.34);
  return `#${scratch.getHexString()}`;
}
const WHITE = new THREE.Color('#ffffff');
const BLACK = new THREE.Color('#000000');

/** A tree grown from its settings; see `growTree`. */
export function TreeModel({ type, seed, accent, spec }: { type: PieceType; seed: number; accent?: string; spec?: Partial<TreeSpec> }) {
  const resolved = resolveTree(type, accent, spec, seed);
  const key = JSON.stringify(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the whole of `resolved`
  const parts = useMemo(() => growTree(resolved), [key]);

  const grass = resolved.shape === 'grass';
  const blades = useMemo(() => {
    if (!grass) return null;
    const { positions, shades } = grassBlades(resolved);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades.flatMap((s) => [s, s, s]), 3));
    // Every blade is lit as if it faced up, so a clump reads as one soft tuft and not a pile of flat cards.
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(shades.flatMap(() => [0, 1, 0]), 3));
    return geometry;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the whole of `resolved`
  }, [key, grass]);
  useEffect(() => () => blades?.dispose(), [blades]);

  return (
    <group>
      {blades && <mesh geometry={blades} material={bladeMaterial(resolved.leaf)} receiveShadow />}
      {parts.map((p, i) => {
        const hex = p.paint === 'trunk' ? resolved.trunk : p.paint === 'flower' ? shade(resolved.flower, p.tone * 0.5) : shade(resolved.leaf, p.tone * resolved.variety);
        const m = material(hex, p.paint === 'leaf');
        const shape =
          p.kind === 'cyl' ? (
            <cylinderGeometry args={[p.size[0], p.size[1], p.size[2], 7]} />
          ) : p.kind === 'sphere' ? (
            <icosahedronGeometry args={[1, 1]} />
          ) : p.kind === 'cone' ? (
            <coneGeometry args={[p.size[0], p.size[1], 8]} />
          ) : (
            <boxGeometry args={p.size} />
          );
        const scale: [number, number, number] | undefined = p.kind === 'sphere' ? p.size : undefined;
        if (p.yaw === undefined) return <mesh key={i} position={p.pos} rotation={p.rot} scale={scale} material={m} castShadow receiveShadow={p.paint === 'leaf'}>{shape}</mesh>;
        return (
          <group key={i} position={p.pos} rotation={[0, p.yaw, 0]}>
            <mesh position={p.local} rotation={p.rot} scale={scale} material={m} castShadow>
              {shape}
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
