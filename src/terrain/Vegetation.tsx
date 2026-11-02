import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CELL } from '../city/catalog';
import { viewState } from '../engine/viewState';
import { heightAt, useTerrainStore } from './terrain';

const MAX_TREES = 7000;
const MAX_BUSHES = 4000;
/** Trees are only drawn this many cells around the view. */
const RANGE = 48;

const hash = (x: number, z: number, i: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + i * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

const dummy = new THREE.Object3D();
const colour = new THREE.Color();
const PINE = ['#2f6b36', '#2a5f33', '#376f3a', '#285a30'];
const JUNGLE = ['#1f7a34', '#2a8f3a', '#15692c', '#3aa047', '#1b5f2a'];

/**
 * Forest and jungle as instanced meshes: pines for forest, tall broad-leaved trees with
 * undergrowth for jungle. Positions come from a hash of the cell, so they never shuffle, and
 * only cells near the view are built, so a huge forest stays cheap.
 */
export function Vegetation() {
  const cells = useTerrainStore((s) => s.cells);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const cones = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const bushes = useRef<THREE.InstancedMesh>(null);
  const built = useRef({ gx: 1e9, gz: 1e9, cells: null as typeof cells | null });

  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.18, 0.3, 1, 6).translate(0, 0.5, 0), []);
  const coneGeometry = useMemo(() => new THREE.ConeGeometry(1.5, 1, 7).translate(0, 0.5, 0), []);
  const crownGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const bushGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.7, 0), []);

  const rebuild = (cx: number, cz: number) => {
    if (!trunks.current || !cones.current || !crowns.current || !bushes.current) return;
    let nTrunk = 0;
    let nCone = 0;
    let nCrown = 0;
    let nBush = 0;

    for (const key in cells) {
      const cover = cells[key].cover;
      if (cover !== 'forest' && cover !== 'jungle') continue;
      const [gx, gz] = key.split(',').map(Number);
      if (Math.abs(gx - cx) > RANGE || Math.abs(gz - cz) > RANGE) continue;

      const perCell = cover === 'jungle' ? 5 : 3;
      for (let i = 0; i < perCell && nTrunk < MAX_TREES; i++) {
        const x = (gx + 0.1 + hash(gx, gz, i) * 0.8) * CELL;
        const z = (gz + 0.1 + hash(gz, gx, i + 9) * 0.8) * CELL;
        const y = heightAt(x, z);
        const s = 0.8 + hash(gx + i, gz, 3) * 0.7;

        if (cover === 'forest') {
          const trunkH = 2.2 * s;
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(s, trunkH, s);
          dummy.updateMatrix();
          trunks.current.setMatrixAt(nTrunk, dummy.matrix);
          trunks.current.setColorAt(nTrunk, colour.set('#5b3a1e'));
          nTrunk++;
          // Three stacked cones make a pine.
          for (let t = 0; t < 3 && nCone < MAX_TREES * 2; t++) {
            dummy.position.set(x, y + trunkH * 0.6 + t * 1.5 * s, z);
            dummy.scale.set(s * (1.1 - t * 0.3), 2 * s, s * (1.1 - t * 0.3));
            dummy.updateMatrix();
            cones.current.setMatrixAt(nCone, dummy.matrix);
            cones.current.setColorAt(nCone, colour.set(PINE[Math.floor(hash(gx, gz, i + t) * PINE.length)]));
            nCone++;
          }
        } else {
          const trunkH = (5 + hash(gx, gz, i + 4) * 4) * s;
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(s * 1.3, trunkH, s * 1.3);
          dummy.updateMatrix();
          trunks.current.setMatrixAt(nTrunk, dummy.matrix);
          trunks.current.setColorAt(nTrunk, colour.set('#4a3320'));
          nTrunk++;
          if (nCrown < MAX_TREES) {
            dummy.position.set(x, y + trunkH, z);
            dummy.scale.set(2.6 * s, 1.6 * s, 2.6 * s);
            dummy.updateMatrix();
            crowns.current.setMatrixAt(nCrown, dummy.matrix);
            crowns.current.setColorAt(nCrown, colour.set(JUNGLE[Math.floor(hash(gx, gz, i + 7) * JUNGLE.length)]));
            nCrown++;
          }
        }
      }
      if (cover === 'jungle') {
        for (let b = 0; b < 3 && nBush < MAX_BUSHES; b++) {
          const x = (gx + hash(gx, gz, b + 20)) * CELL;
          const z = (gz + hash(gz, gx, b + 30)) * CELL;
          dummy.position.set(x, heightAt(x, z) + 0.3, z);
          dummy.scale.setScalar(0.7 + hash(gx, gz, b + 40) * 1.1);
          dummy.updateMatrix();
          bushes.current.setMatrixAt(nBush, dummy.matrix);
          bushes.current.setColorAt(nBush, colour.set(JUNGLE[Math.floor(hash(gx, gz, b + 50) * JUNGLE.length)]));
          nBush++;
        }
      }
    }

    for (const [mesh, count] of [[trunks.current, nTrunk], [cones.current, nCone], [crowns.current, nCrown], [bushes.current, nBush]] as const) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    built.current = { gx: cx, gz: cz, cells };
  };

  // Rebuild when the terrain changes, or the view has moved a few cells.
  useFrame(() => {
    const gx = Math.floor(viewState.x / CELL);
    const gz = Math.floor(viewState.z / CELL);
    const b = built.current;
    if (b.cells !== cells || Math.abs(gx - b.gx) > 6 || Math.abs(gz - b.gz) > 6) rebuild(gx, gz);
  });
  useEffect(() => {
    built.current.cells = null;
  }, [cells]);

  return (
    <>
      <instancedMesh ref={trunks} args={[trunkGeometry, undefined, MAX_TREES]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={cones} args={[coneGeometry, undefined, MAX_TREES * 2]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeometry, undefined, MAX_TREES]} frustumCulled={false} castShadow>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={bushes} args={[bushGeometry, undefined, MAX_BUSHES]} frustumCulled={false}>
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </>
  );
}
