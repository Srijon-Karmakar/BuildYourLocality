import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { PieceView } from '../../city/models';
import { partialPiece, useConstructionStore } from '../../sim/construction';
import { ConstructionLayer } from './ConstructionLayer';
import { useCityStore, type Piece } from '../../state/useCityStore';
import { useGameStore } from '../../state/useGameStore';
import { useTerrainStore } from '../../terrain/terrain';
import { fingerprint, mergeMeshes } from './batching';

/** Map is cut into square chunks of this many cells; each chunk is merged separately so far-away chunks can be culled. */
const CHUNK_CELLS = 8;
/** Milliseconds per frame that merging may use, so a big edit never freezes the game. */
const BAKE_BUDGET_MS = 8;
/** The very first merge (loading a saved city) may take longer, to avoid buildings popping in one chunk at a time. */
const FIRST_BAKE_BUDGET_MS = 40;
/** Frames to keep looking for changes after something might have changed (React commits a frame or two later). */
const SCAN_FRAMES = 4;

/** Pieces whose parts move on their own (barrier arms, crane boom) stay live, as ordinary meshes. */
const MOVING = new Set<Piece['type']>(['crossing', 'portcrane']);

const chunkOf = (gx: number, gz: number) => `${Math.floor(gx / CHUNK_CELLS)},${Math.floor(gz / CHUNK_CELLS)}`;

interface ChunkState {
  /** Fingerprint of each piece last merged, so only chunks that changed are rebuilt. */
  seen: Map<string, number>;
  meshes: THREE.Mesh[];
}

/**
 * Renders every still piece (roads, buildings, props) into an off-screen scene that is never drawn,
 * then merges what is in it into a few big meshes per chunk. Pieces still mount and update as normal
 * React components, so editing works unchanged; only what reaches the GPU is different.
 */
function Batcher({ source, output }: { source: THREE.Scene; output: RefObject<THREE.Group | null> }) {
  const chunks = useRef(new Map<string, ChunkState>());
  const dirty = useRef(new Set<string>());
  const tick = useRef(0);
  const scans = useRef(30);
  const firstDone = useRef(false);

  // Anything that can change what a piece looks like: the city, the terrain (bridges), mode and graphics.
  useEffect(() => {
    const bump = () => {
      scans.current = SCAN_FRAMES;
    };
    const stops = [useCityStore.subscribe(bump), useTerrainStore.subscribe(bump), useGameStore.subscribe(bump)];
    return () => stops.forEach((stop) => stop());
  }, []);

  useFrame(() => {
    const out = output.current;
    if (!out) return;
    tick.current++;
    // Cheap by default: only scan after something changed, plus a slow safety sweep.
    if (scans.current <= 0 && dirty.current.size === 0 && tick.current % 45 !== 0) return;
    scans.current--;

    // Which pieces exist and what do they look like now?
    const current = new Map<string, { wrapper: THREE.Object3D; print: number }>();
    const byChunk = new Map<string, THREE.Object3D[]>();
    for (const wrapper of source.children) {
      const { pid, chunk } = wrapper.userData as { pid?: string; chunk?: string };
      if (!pid || !chunk) continue;
      const print = fingerprint(wrapper);
      current.set(pid, { wrapper, print });
      const list = byChunk.get(chunk);
      if (list) list.push(wrapper);
      else byChunk.set(chunk, [wrapper]);

      const state = chunks.current.get(chunk);
      if (!state || state.seen.get(pid) !== print) dirty.current.add(chunk);
    }
    // Pieces that were removed.
    for (const [key, state] of chunks.current) {
      for (const pid of state.seen.keys()) {
        if (!current.has(pid)) {
          dirty.current.add(key);
          break;
        }
      }
    }
    if (dirty.current.size === 0) return;

    const started = performance.now();
    const budget = firstDone.current ? BAKE_BUDGET_MS : FIRST_BAKE_BUDGET_MS;
    for (const key of dirty.current) {
      if (performance.now() - started > budget) break;
      dirty.current.delete(key);
      const state = chunks.current.get(key) ?? { seen: new Map(), meshes: [] };
      for (const mesh of state.meshes) {
        out.remove(mesh);
        if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
      }
      const wrappers = byChunk.get(key) ?? [];
      state.seen = new Map();
      for (const wrapper of wrappers) state.seen.set(wrapper.userData.pid as string, current.get(wrapper.userData.pid as string)!.print);
      state.meshes = mergeMeshes(wrappers);
      for (const mesh of state.meshes) out.add(mesh);
      if (wrappers.length === 0) chunks.current.delete(key);
      else chunks.current.set(key, state);
    }
    if (dirty.current.size === 0 && current.size > 0) firstDone.current = true;
  });

  useEffect(() => {
    const states = chunks.current;
    const group = output.current;
    return () => {
      for (const state of states.values()) {
        for (const mesh of state.meshes) {
          group?.remove(mesh);
          if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
        }
      }
      states.clear();
    };
  }, [output]);

  return null;
}

/** Every placed piece, shown in both build and roam modes. */
export function PiecesLayer() {
  const pieces = useCityStore((s) => s.pieces);
  const list = useMemo(() => Object.values(pieces), [pieces]);
  const source = useMemo(() => new THREE.Scene(), []);
  const output = useRef<THREE.Group>(null);

  // Buildings under construction are drawn live, a few floors at a time, instead of in the merged scenery.
  const sites = useConstructionStore((s) => s.sites);
  const building = list.filter((p) => sites[p.id]).map((p) => partialPiece(p, sites[p.id].floors / sites[p.id].total));
  const still = list.filter((p) => !MOVING.has(p.type) && !sites[p.id]);
  const moving = list.filter((p) => MOVING.has(p.type));

  return (
    <>
      {moving.map((piece) => (
        <PieceView key={piece.id} piece={piece} />
      ))}
      {building.map((piece) => (
        <PieceView key={piece.id} piece={piece} />
      ))}
      <ConstructionLayer />
      {createPortal(
        <>
          {still.map((piece) => (
            <group key={piece.id} userData={{ pid: piece.id, chunk: chunkOf(piece.gx, piece.gz) }}>
              <PieceView piece={piece} />
            </group>
          ))}
        </>,
        source,
      )}
      <group ref={output} />
      <Batcher source={source} output={output} />
    </>
  );
}
