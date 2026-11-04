import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { PieceView } from '../../city/models';
import { partialPiece, useConstructionStore } from '../../sim/construction';
import { ConstructionLayer } from './ConstructionLayer';
import { useCityStore, type Piece } from '../../state/useCityStore';
import { useBuilderStore } from '../../state/useBuilderStore';
import { useGameStore } from '../../state/useGameStore';
import { useTerrainStore } from '../../terrain/terrain';
import { fingerprint, mergeMeshes } from './batching';

/** Map is cut into square chunks of this many cells; each chunk is merged separately so far-away chunks can be culled. */
const CHUNK_CELLS = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 16 : 12;
/** Budget between chunk bakes; a single dense chunk can still exceed it. */
const BAKE_BUDGET_MS = 4;
/** Spread scene traversal across frames, including idle safety checks. */
const SCAN_BUDGET_MS = 2;
/** The very first merge (loading a saved city) may take longer, to avoid buildings popping in one chunk at a time. */
const FIRST_BAKE_BUDGET_MS = 40;
/** Frames to keep looking for changes after something might have changed (React commits a frame or two later). */
const SCAN_FRAMES = 4;

/** Pieces whose parts move on their own (barrier arms, crane boom) stay live, as ordinary meshes. */
const MOVING = new Set<Piece['type']>(['crossing', 'portcrane', 'span']);

const chunkOf = (gx: number, gz: number) => `${Math.floor(gx / CHUNK_CELLS)},${Math.floor(gz / CHUNK_CELLS)}`;

interface ChunkState {
  meshes: THREE.Mesh[];
}

function releaseMesh(mesh: THREE.Mesh) {
  if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
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
  const scans = useRef(SCAN_FRAMES);
  const current = useRef(new Map<string, { wrapper: THREE.Object3D; print: number; chunk: string }>());
  const scan = useRef({ active: false, index: 0, seen: new Set<string>() });
  const byChunk = useRef(new Map<string, THREE.Object3D[]>());
  const firstDone = useRef(false);

  // Anything that can change what a piece looks like: the city, the terrain (bridges), mode and graphics.
  useEffect(() => {
    const bump = () => {
      scans.current = SCAN_FRAMES;
      scan.current.active = false;
    };
    const stops = [
      useCityStore.subscribe(bump), useTerrainStore.subscribe(bump), useGameStore.subscribe(bump),
      useBuilderStore.subscribe((state, previous) => { if (state.selectedIds !== previous.selectedIds) bump(); }),
      useConstructionStore.subscribe((state, previous) => { if (state.sites !== previous.sites) bump(); }),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  useFrame(() => {
    const out = output.current;
    if (!out) return;
    tick.current++;
    // Finish each scan before baking so a partial traversal cannot remove unvisited pieces.
    const pass = scan.current;
    if (!pass.active && (scans.current > 0 || tick.current % 45 === 0)) {
      pass.active = true;
      pass.index = 0;
      pass.seen.clear();
      scans.current = Math.max(0, scans.current - 1);
    }
    if (pass.active) {
      const started = performance.now();
      while (pass.index < source.children.length) {
        const wrapper = source.children[pass.index++];
        const { pid, chunk } = wrapper.userData as { pid?: string; chunk?: string };
        if (pid && chunk) {
          pass.seen.add(pid);
          const print = fingerprint(wrapper);
          const previous = current.current.get(pid);
          if (!previous || previous.print !== print || previous.chunk !== chunk) {
            if (previous) dirty.current.add(previous.chunk);
            dirty.current.add(chunk);
            current.current.set(pid, { wrapper, print, chunk });
          }
        }
        if (performance.now() - started >= SCAN_BUDGET_MS) return;
      }
      for (const [pid, previous] of current.current) {
        if (!pass.seen.has(pid)) {
          dirty.current.add(previous.chunk);
          current.current.delete(pid);
        }
      }
      pass.active = false;
      if (dirty.current.size) {
        byChunk.current.clear();
        for (const { wrapper, chunk } of current.current.values()) {
          const list = byChunk.current.get(chunk);
          if (list) list.push(wrapper);
          else byChunk.current.set(chunk, [wrapper]);
        }
      }
    }
    if (dirty.current.size === 0) return;

    const started = performance.now();
    const budget = firstDone.current ? BAKE_BUDGET_MS : FIRST_BAKE_BUDGET_MS;
    for (const key of dirty.current) {
      if (performance.now() - started > budget) break;
      dirty.current.delete(key);
      const state = chunks.current.get(key) ?? { meshes: [] };
      for (const mesh of state.meshes) {
        out.remove(mesh);
        releaseMesh(mesh);
      }
      const wrappers = byChunk.current.get(key) ?? [];
      state.meshes = mergeMeshes(wrappers);
      for (const mesh of state.meshes) out.add(mesh);
      if (wrappers.length === 0) chunks.current.delete(key);
      else chunks.current.set(key, state);
    }
    if (dirty.current.size === 0 && current.current.size > 0) firstDone.current = true;
  });

  useEffect(() => {
    const states = chunks.current;
    const group = output.current;
    return () => {
      for (const state of states.values()) {
        for (const mesh of state.meshes) {
          group?.remove(mesh);
          releaseMesh(mesh);
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
  // The building being edited is drawn live too: re-merging its whole chunk on every colour-picker
  // step would make editing sluggish. It joins the merged scenery again when it is deselected.
  const selectedIds = useBuilderStore((s) => s.selectedIds);
  // (A big selection stays merged: drawing dozens of buildings live would cost more than re-merging.)
  const editing = useMemo(() => new Set(selectedIds.length <= 12 ? selectedIds : []), [selectedIds]);
  const still = list.filter((p) => !MOVING.has(p.type) && !sites[p.id] && !editing.has(p.id));
  const moving = list.filter((p) => MOVING.has(p.type) || editing.has(p.id));

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
