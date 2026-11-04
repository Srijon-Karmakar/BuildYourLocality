import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { memo, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CELL } from '../city/catalog';
import { getGroundTextures, getGroundVariationTexture, getTerrainTextures } from '../city/cityTextures';
import { viewState } from '../engine/viewState';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import {
  CHUNK_CELLS,
  CHUNK_SIZE,
  coverAt,
  getLockVersion,
  heightAt,
  useTerrainStore,
  type TerrainCell,
} from './terrain';

const SUB = 2; // mesh segments per cell
const SEGMENTS = CHUNK_CELLS * SUB;
const STEP = CHUNK_SIZE / SEGMENTS;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mesh for one 96 m chunk: heights, normals, cell-unit UVs and a grass/rock/sand/snow blend. */
export function buildChunkGeometry(cx: number, cz: number, flat: boolean): THREE.BufferGeometry {
  const n = SEGMENTS + 1;
  const position = new Float32Array(n * n * 3);
  const normal = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  const blend = new Float32Array(n * n * 4);
  const ox = cx * CHUNK_SIZE;
  const oz = cz * CHUNK_SIZE;
  const e = STEP * 0.5;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const lx = i * STEP;
      const lz = j * STEP;
      const wx = ox + lx;
      const wz = oz + lz;
      let h = 0;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (!flat) {
        h = heightAt(wx, wz);
        nx = heightAt(wx - e, wz) - heightAt(wx + e, wz);
        nz = heightAt(wx, wz - e) - heightAt(wx, wz + e);
        ny = 2 * e;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
      }
      position.set([lx, h, lz], k * 3);
      normal.set([nx, ny, nz], k * 3);
      uv.set([lx / CELL, lz / CELL], k * 2);

      if (flat) {
        blend.set([1, 0, 0, 0], k * 4);
      } else {
        const cover = coverAt(Math.floor(wx / CELL), Math.floor(wz / CELL));
        const steep = sstep(0.14, 0.42, 1 - ny);
        const rock = cover === 'rock' ? 1 : steep;
        const sand = cover === 'sand' ? 1 : sstep(-0.02, -0.4, h);
        const snow = sstep(24, 34, h) * (1 - 0.5 * steep);
        const grass = Math.max(0, 1 - rock - sand - snow);
        blend.set([grass, rock, sand, snow], k * 4);
      }
    }
  }

  const index = new Uint32Array(SEGMENTS * SEGMENTS * 6);
  let t = 0;
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index.set([a, c, b, b, c, d], t);
      t += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aBlend', new THREE.BufferAttribute(blend, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

let flatGeometry: THREE.BufferGeometry | null = null;
const editedGeometries = new Map<string, { stamp: number; geometry: THREE.BufferGeometry }>();

/** Edited chunks are rebuilt when terrain or the pieces standing on it change; old meshes are freed. */
function chunkGeometry(cx: number, cz: number, edited: boolean, stamp: number): THREE.BufferGeometry {
  if (!edited) return (flatGeometry ??= buildChunkGeometry(0, 0, true));
  const key = `${cx},${cz}`;
  const hit = editedGeometries.get(key);
  if (hit && hit.stamp === stamp) return hit.geometry;
  hit?.geometry.dispose();
  const geometry = buildChunkGeometry(cx, cz, false);
  editedGeometries.set(key, { stamp, geometry });
  return geometry;
}

/** Chunks that must be meshed individually: those with edits, plus their neighbours (shared edges). */
function editedChunks(cells: Record<string, TerrainCell>): Set<string> {
  const out = new Set<string>();
  for (const key in cells) {
    const [gx, gz] = key.split(',').map(Number);
    const cx = Math.floor(gx / CHUNK_CELLS);
    const cz = Math.floor(gz / CHUNK_CELLS);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.add(`${cx + dx},${cz + dz}`);
  }
  return out;
}

// --- Material -----------------------------------------------------------------------------

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Grass material that blends in rock on slopes, sand at the water's edge and snow on peaks. */
function terrainMaterial(quality: 'low' | 'medium' | 'high'): THREE.MeshStandardMaterial {
  let material = materialCache.get(quality);
  if (material) return material;

  const ground = getGroundTextures(quality);
  const grass = ground.map.clone();
  const grassNormal = ground.normalMap.clone();
  const variation = getGroundVariationTexture().clone();
  for (const t of [grass, grassNormal, variation]) {
    t.repeat.set(1, 1); // chunk UVs are already in cells
    t.needsUpdate = true;
  }
  const { rock, sand } = getTerrainTextures(quality);

  material = new THREE.MeshStandardMaterial({ map: grass, normalMap: grassNormal, roughness: 1, metalness: 0 });
  material.customProgramCacheKey = () => 'terrain-blend-v2';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: rock };
    shader.uniforms.sandMap = { value: sand };
    shader.uniforms.variationMap = { value: variation };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aBlend;\nvarying vec4 vBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlend = aBlend;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vBlend;\nuniform sampler2D rockMap;\nuniform sampler2D sandMap;\nuniform sampler2D variationMap;',
      )
      .replace(
        '#include <map_fragment>',
        `
        vec3 grassCol = texture2D(map, vMapUv).rgb;
        vec3 rockCol = texture2D(rockMap, vMapUv * 0.45).rgb;
        vec3 sandCol = texture2D(sandMap, vMapUv * 0.6).rgb;
        vec3 snowCol = vec3(0.93, 0.95, 0.98);
        float wsum = max(0.001, vBlend.x + vBlend.y + vBlend.z + vBlend.w);
        vec3 terrainCol = (grassCol * vBlend.x + rockCol * vBlend.y + sandCol * vBlend.z + snowCol * vBlend.w) / wsum;
        diffuseColor.rgb *= terrainCol;
        `,
      )
      // The soft light and dark patches multiply over the finished picture, exactly like the plain ground's
      // overlay does, so edited land and untouched land look the same.
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          float wsum2 = max(0.001, vBlend.x + vBlend.y + vBlend.z + vBlend.w);
          gl_FragColor.rgb *= mix(vec3(1.0), texture2D(variationMap, vMapUv / 16.0).rgb, vBlend.x / wsum2);
        }`,
      );
  };
  materialCache.set(quality, material);
  return material;
}

// --- Chunks ---------------------------------------------------------------------------------

const Chunk = memo(function Chunk({
  cx,
  cz,
  edited,
  stamp,
  physics,
  material,
}: {
  cx: number;
  cz: number;
  edited: boolean;
  stamp: number;
  physics: boolean;
  material: THREE.Material;
}) {
  const geometry = useMemo(() => chunkGeometry(cx, cz, edited, stamp), [cx, cz, edited, stamp]);
  const position: [number, number, number] = [cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE];
  const mesh = <mesh geometry={geometry} material={material} receiveShadow />;

  if (!physics) return <group position={position}>{mesh}</group>;
  if (!edited) {
    return (
      <RigidBody type="fixed" colliders={false} position={position}>
        <CuboidCollider args={[CHUNK_SIZE / 2, 0.5, CHUNK_SIZE / 2]} position={[CHUNK_SIZE / 2, -0.5, CHUNK_SIZE / 2]} />
        {mesh}
      </RigidBody>
    );
  }
  return (
    <RigidBody key={stamp} type="fixed" colliders="trimesh" position={position}>
      {mesh}
    </RigidBody>
  );
});

/**
 * The ground once terrain has been edited: a grid of 96 m chunks around the view. Untouched
 * chunks share one flat mesh; edited chunks get their own heightfield. Chunks next to the
 * player in walk mode carry physics colliders, so mountains can be climbed.
 */
export function TerrainLayer() {
  const cells = useTerrainStore((s) => s.cells);
  const version = useTerrainStore((s) => s.version);
  const mode = useGameStore((s) => s.mode);
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const drawDistance = useGameStore((s) => s.graphics.drawDistance);
  useCityStore((s) => s.pieces); // re-mesh when buildings/roads flatten the ground beneath them
  const [view, setView] = useState({ cx: 0, cz: 0, r: 5 });
  const lastView = useRef(view);

  const material = useMemo(() => terrainMaterial(quality), [quality]);
  const edited = useMemo(() => editedChunks(cells), [cells]);
  const active = Object.keys(cells).length > 0;

  useFrame(() => {
    if (!active) return;
    const cx = Math.floor(viewState.x / CHUNK_SIZE);
    const cz = Math.floor(viewState.z / CHUNK_SIZE);
    const r = mode === 'build' ? Math.min(8, 4 + Math.floor(viewState.dist / 180)) : Math.max(2, Math.ceil((drawDistance * 16) / CHUNK_SIZE) + 1);
    const previous = lastView.current;
    if (previous.cx !== cx || previous.cz !== cz || previous.r !== r) {
      lastView.current = { cx, cz, r };
      setView(lastView.current);
    }
  });

  if (!active) return null;

  const stamp = version * 10000 + getLockVersion();
  const chunks: React.ReactNode[] = [];
  for (let dx = -view.r; dx <= view.r; dx++) {
    for (let dz = -view.r; dz <= view.r; dz++) {
      const cx = view.cx + dx;
      const cz = view.cz + dz;
      const key = `${cx},${cz}`;
      const isEdited = edited.has(key);
      chunks.push(
        <Chunk
          key={key}
          cx={cx}
          cz={cz}
          edited={isEdited}
          stamp={isEdited ? stamp : 0}
          physics={mode === 'roam' && Math.abs(dx) <= 1 && Math.abs(dz) <= 1}
          material={material}
        />,
      );
    }
  }
  return <>{chunks}</>;
}

