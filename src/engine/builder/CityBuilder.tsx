import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CELL,
  PIECES,
  blockBox,
  pieceFootprint,
  resolveStyle,
  roofHeightOf,
  rotatedFootprint,
  type PieceType,
} from '../../city/catalog';
import { PieceModel, PieceView, RoadModel } from '../../city/models';
import { useBuilderStore, type BuilderTool } from '../../state/useBuilderStore';
import { roadMaskAt, useCityStore, type Piece } from '../../state/useCityStore';
import { useGameStore } from '../../state/useGameStore';

const GRID_CELLS = 24; // even, so grid lines fall on cell borders when centred on a cell corner
const MAX_PICK_DISTANCE = 600;

interface Hover {
  /** Cell under the cursor (used by bulldoze / paint / select). */
  hx: number;
  hz: number;
  /** Anchor cell for placing the selected piece, centred on the cursor. */
  gx: number;
  gz: number;
}

const isPlaceTool = (tool: BuilderTool): tool is PieceType =>
  tool !== 'bulldoze' && tool !== 'paint' && tool !== 'select' && tool !== 'move';
/** Tools that keep applying while the mouse button is held and dragged across cells. */
const isDragTool = (tool: BuilderTool) => tool === 'road' || tool === 'bulldoze' || tool === 'paint';

/** Turns a model translucent and tints it green (can place) or red (blocked). */
function ghostify(root: THREE.Object3D, valid: boolean) {
  const tint = new THREE.Color(valid ? '#22ff77' : '#ff3030');
  const ghostMaterial = (material: THREE.Material): THREE.Material => {
    let ghost = material;
    if (!material.userData.isGhost) {
      ghost = material.clone();
      ghost.userData.isGhost = true;
      ghost.transparent = true;
      ghost.opacity = 0.6;
      ghost.depthWrite = false;
    }
    const standard = ghost as THREE.MeshStandardMaterial;
    if (standard.emissive) {
      standard.emissive.copy(tint);
      standard.emissiveIntensity = 0.35;
    }
    return ghost;
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ghostMaterial) : ghostMaterial(mesh.material);
  });
}

/** Tallest point of a piece (metres), including any pitched roof. */
function pieceHeight(piece: Piece): number {
  if (!PIECES[piece.type].paintable) return 0.3;
  const style = resolveStyle(piece.type, piece);
  return Math.max(
    ...style.blocks.map((b) => {
      const box = blockBox(b, style.lot);
      return box.h + (style.roofStyle === 'gable' ? roofHeightOf(box) : 0);
    }),
  );
}

/** Translucent box over a piece's footprint, used to show what a tool would act on. */
function PieceHighlight({ piece, color, opacity }: { piece: Piece; color: string; opacity: number }) {
  const [w, d] = pieceFootprint(piece);
  const h = Math.max(0.3, pieceHeight(piece));
  return (
    <mesh position={[(piece.gx + w / 2) * CELL, h / 2, (piece.gz + d / 2) * CELL]}>
      <boxGeometry args={[w * CELL + 0.1, h + 0.1, d * CELL + 0.1]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** Outlines the block being edited in the inspector, in the building's own (rotated) frame. */
function BlockHighlight({ piece, index }: { piece: Piece; index: number }) {
  const style = resolveStyle(piece.type, piece);
  const block = style.blocks[index];
  if (!block) return null;
  const box = blockBox(block, style.lot);
  const [w, d] = pieceFootprint(piece);
  return (
    <group position={[(piece.gx + w / 2) * CELL, 0, (piece.gz + d / 2) * CELL]} rotation={[0, (piece.rot * Math.PI) / 2, 0]}>
      <mesh position={[box.cx, box.h / 2 + 0.1, box.cz]}>
        <boxGeometry args={[box.w + 0.2, box.h + 0.2, box.d + 0.2]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Every placed piece, shown in both build and roam modes. */
export function PiecesLayer() {
  const pieces = useCityStore((s) => s.pieces);
  const list = useMemo(() => Object.values(pieces), [pieces]);
  return (
    <>
      {list.map((piece) => (
        <PieceView key={piece.id} piece={piece} />
      ))}
    </>
  );
}

/**
 * Build-mode interaction on the city grid: the cursor is projected onto the ground plane
 * and snapped to cells. Left-click places the selected piece (roads, delete and paint
 * also work while dragging); R rotates; Delete / X remove; Ctrl+Z undoes. The Edit tool
 * selects a building for the inspector, whose Move button carries it to a new spot.
 */
export function CityBuilder() {
  const mode = useGameStore((s) => s.mode);
  const tool = useBuilderStore((s) => s.tool);
  const rotation = useBuilderStore((s) => s.rotation);
  const facade = useBuilderStore((s) => s.facade);
  const roof = useBuilderStore((s) => s.roof);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const selectedBlock = useBuilderStore((s) => s.selectedBlock);
  const movingId = useBuilderStore((s) => s.movingId);
  const pieces = useCityStore((s) => s.pieces);
  const occupancy = useCityStore((s) => s.occupancy);
  const dom = useThree((s) => s.gl.domElement);

  const [hover, setHover] = useState<Hover | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const pointerInside = useRef(false);
  const painting = useRef(false);
  const ghostRef = useRef<THREE.Group>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(CELL * GRID_CELLS, GRID_CELLS, '#ffffff', '#ffffff');
    const material = g.material as THREE.LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    return g;
  }, []);

  const apply = (h: Hover) => {
    const city = useCityStore.getState();
    const b = useBuilderStore.getState();
    const cellId = city.occupancy[`${h.hx},${h.hz}`];
    if (b.tool === 'select') {
      b.select(cellId && PIECES[city.pieces[cellId].type].paintable ? cellId : null);
    } else if (b.tool === 'move') {
      if (b.movingId && city.movePiece(b.movingId, h.gx, h.gz, b.rotation)) {
        b.select(b.movingId);
        useBuilderStore.setState({ movingId: null, tool: 'select' });
      }
    } else if (b.tool === 'bulldoze') {
      if (cellId && cellId === b.selectedId) b.select(null);
      city.removeAt(h.hx, h.hz);
    } else if (b.tool === 'paint') {
      city.paintAt(h.hx, h.hz, b.facade, b.roof);
    } else {
      city.place({ type: b.tool, gx: h.gx, gz: h.gz, rot: b.tool === 'road' ? 0 : b.rotation, facade: b.facade, roof: b.roof });
    }
  };

  useFrame(({ camera, pointer }) => {
    const clear = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        setHover(null);
      }
    };
    if (mode !== 'build' || !pointerInside.current) return clear();

    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    if (direction.y > -1e-4) return clear();
    const t = -origin.y / direction.y;
    if (t > MAX_PICK_DISTANCE) return clear();
    const x = origin.x + direction.x * t;
    const z = origin.z + direction.z * t;

    const b = useBuilderStore.getState();
    const city = useCityStore.getState();
    let w = 1;
    let d = 1;
    if (isPlaceTool(b.tool)) {
      [w, d] = rotatedFootprint(PIECES[b.tool], b.rotation);
    } else if (b.tool === 'move' && b.movingId && city.pieces[b.movingId]) {
      const moving = city.pieces[b.movingId];
      [w, d] = rotatedFootprint(PIECES[moving.type], b.rotation, moving.lot);
    }
    const next: Hover = {
      hx: Math.floor(x / CELL),
      hz: Math.floor(z / CELL),
      gx: Math.round(x / CELL - w / 2),
      gz: Math.round(z / CELL - d / 2),
    };
    const prev = hoverRef.current;
    if (prev && prev.hx === next.hx && prev.hz === next.hz && prev.gx === next.gx && prev.gz === next.gz) return;
    hoverRef.current = next;
    setHover(next);
    if (painting.current && isDragTool(b.tool)) apply(next);
  });

  useEffect(() => {
    if (mode !== 'build') return;
    const onMove = () => (pointerInside.current = true);
    const onLeave = () => {
      pointerInside.current = false;
      painting.current = false;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !hoverRef.current) return;
      painting.current = true;
      useCityStore.getState().beginStroke(); // one undo step per click or drag
      apply(hoverRef.current);
    };
    const onUp = () => {
      painting.current = false;
      useCityStore.getState().endStroke();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const city = useCityStore.getState();
      const b = useBuilderStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) city.redo();
        else city.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        city.redo();
        return;
      }
      if (e.code === 'KeyR' && !e.repeat) b.rotate();
      if (e.code === 'Escape') {
        if (b.movingId) b.cancelMove();
        else b.select(null);
      }
      // Delete / Backspace remove the selected building, else whatever is under the cursor; X always the latter.
      const wantsDelete = e.code === 'Delete' || e.code === 'Backspace' || e.code === 'KeyX';
      if (wantsDelete) {
        e.preventDefault();
        if (b.selectedId && e.code !== 'KeyX') {
          city.removeById(b.selectedId);
          b.select(null);
        } else if (hoverRef.current) {
          const id = city.occupancy[`${hoverRef.current.hx},${hoverRef.current.hz}`];
          if (id && id === b.selectedId) b.select(null);
          city.removeAt(hoverRef.current.hx, hoverRef.current.hz);
        }
      }
    };
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      pointerInside.current = false;
      painting.current = false;
    };
  }, [mode, dom]);

  const placeType = isPlaceTool(tool) ? tool : null;
  const moving = tool === 'move' && movingId ? pieces[movingId] : undefined;
  let valid = false;
  if (hover && placeType) {
    valid = useCityStore.getState().canPlace(placeType, hover.gx, hover.gz, placeType === 'road' ? 0 : rotation);
  } else if (hover && moving) {
    valid = useCityStore.getState().canPlace(moving.type, hover.gx, hover.gz, rotation, moving.lot, moving.id);
  }

  // Re-apply the ghost tint whenever the ghost model may have been rebuilt.
  useLayoutEffect(() => {
    if (ghostRef.current) ghostify(ghostRef.current, valid);
  });

  if (mode !== 'build') return null;

  let ghost = null;
  if (hover && (placeType || moving)) {
    const type = (placeType ?? moving?.type) as PieceType;
    const rot = type === 'road' ? 0 : rotation;
    const [w, d] = rotatedFootprint(PIECES[type], rot, moving?.lot);
    ghost = (
      <group ref={ghostRef} position={[(hover.gx + w / 2) * CELL, 0.02, (hover.gz + d / 2) * CELL]} rotation={[0, (rot * Math.PI) / 2, 0]}>
        {type === 'road' ? (
          <RoadModel mask={roadMaskAt(pieces, occupancy, hover.gx, hover.gz)} />
        ) : (
          <PieceModel
            type={type}
            facade={moving?.facade ?? facade}
            roof={moving?.roof ?? roof}
            style={resolveStyle(type, moving ?? {})}
            seed={0.5}
          />
        )}
      </group>
    );
  }

  const target = hover ? pieces[occupancy[hover.hx + ',' + hover.hz]] : undefined;
  const selected = selectedId ? pieces[selectedId] : undefined;
  const targetable =
    target && (tool === 'bulldoze' || (PIECES[target.type].paintable && (tool === 'paint' || tool === 'select')));
  const highlightColor = tool === 'bulldoze' ? '#ff3030' : '#3aa0ff';

  return (
    <>
      {hover && <primitive object={grid} position={[hover.hx * CELL, 0.02, hover.hz * CELL]} />}
      {ghost}
      {selected && <PieceHighlight piece={selected} color="#ffffff" opacity={0.16} />}
      {selected && !movingId && PIECES[selected.type].paintable && <BlockHighlight piece={selected} index={selectedBlock} />}
      {targetable && <PieceHighlight piece={target} color={highlightColor} opacity={0.28} />}
    </>
  );
}
