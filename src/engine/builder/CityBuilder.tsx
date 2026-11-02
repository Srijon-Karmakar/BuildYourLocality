import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CELL,
  PIECES,
  blockBox,
  pieceFootprint,
  ROAD_LIKE,
  presetStyle,
  resolveLook,
  resolveStyle,
  roofHeightOf,
  rotatedFootprint,
  type PieceType,
} from '../../city/catalog';
import { PieceModel, RoadModel } from '../../city/models';
import { isDragTool, useBuilderStore, type BuilderTool } from '../../state/useBuilderStore';
import { clearForest, plantForest } from '../../city/forest';
import { WallModel } from '../../city/WallModel';
import { edgeCentre, edgeNear, resolveWall, type Edge } from '../../city/walls';
import { roadMaskAt, topIdAt, useCityStore, wallNear, type Piece } from '../../state/useCityStore';
import { useGameStore } from '../../state/useGameStore';
import { brushOf, heightAt, isWaterCell, raycastTerrain, useTerrainStore } from '../../terrain/terrain';
import { useTouchStore } from '../../state/useTouchStore';

const GRID_CELLS = 24; // even, so grid lines fall on cell borders when centred on a cell corner
const MAX_PICK_DISTANCE = 1400;

interface Hover {
  /** Cell under the cursor (used by bulldoze / paint / select). */
  hx: number;
  hz: number;
  /** Anchor cell for placing the selected piece, centred on the cursor. */
  gx: number;
  gz: number;
  /** Exact ground point under the cursor (the terrain brush works in metres, not cells). */
  px: number;
  pz: number;
  /** The grid edge nearest the cursor (for walls). */
  edge: Edge;
}

const isPlaceTool = (tool: BuilderTool): tool is PieceType =>
  tool !== 'bulldoze' && tool !== 'paint' && tool !== 'select' && tool !== 'move' && tool !== 'terrain' && tool !== 'forest' && tool !== 'wall';

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
  if (piece.type === 'wall') {
    const c = edgeCentre({ gx: piece.gx, gz: piece.gz, rot: piece.rot as 0 | 1 }, CELL);
    const spec = resolveWall(piece.wall);
    return (
      <mesh position={[c.x, spec.height / 2 + 0.1, c.z]} rotation={[0, piece.rot === 0 ? 0 : Math.PI / 2, 0]}>
        <boxGeometry args={[CELL + 0.2, spec.height + 0.4, Math.max(spec.thickness, 0.3) + 0.3]} />
        <meshBasicMaterial color={color} transparent opacity={opacity + 0.12} depthWrite={false} />
      </mesh>
    );
  }
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

/** World-space point on the ground (hills and mountains included) under a screen position. */
function groundPoint(raycaster: THREE.Raycaster, camera: THREE.Camera, ndc: THREE.Vector2): { x: number; z: number } | null {
  raycaster.setFromCamera(ndc, camera);
  const { origin, direction } = raycaster.ray;
  const hit = raycastTerrain(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, MAX_PICK_DISTANCE);
  return hit ? { x: hit.x, z: hit.z } : null;
}

/** Cells under a ground point for whatever the current tool would act on. */
function hoverFromPoint(x: number, z: number): Hover {
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
  return {
    hx: Math.floor(x / CELL),
    hz: Math.floor(z / CELL),
    gx: Math.round(x / CELL - w / 2),
    gz: Math.round(z / CELL - d / 2),
    px: x,
    pz: z,
    edge: edgeNear(x, z, CELL),
  };
}

const sameHover = (a: Hover | null, b: Hover | null) => {
  if (!a || !b || a.hx !== b.hx || a.hz !== b.hz || a.gx !== b.gx || a.gz !== b.gz) return false;
  if (useBuilderStore.getState().tool === 'wall') return a.edge.gx === b.edge.gx && a.edge.gz === b.edge.gz && a.edge.rot === b.edge.rot;
  // The terrain brush follows the cursor in metres, not just by cell.
  return useBuilderStore.getState().tool !== 'terrain' || (Math.abs(a.px - b.px) < 1.5 && Math.abs(a.pz - b.pz) < 1.5);
};

const beginStrokes = () => {
  useCityStore.getState().beginStroke();
  useTerrainStore.getState().beginStroke();
};
const endStrokes = () => {
  useCityStore.getState().endStroke();
  useTerrainStore.getState().endStroke();
};

/** The brush footprint: a ring that follows the ground under the cursor. */
function BrushRing({ x, z, radius }: { x: number; z: number; radius: number }) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      points.push(new THREE.Vector3(px, Math.max(heightAt(px, pz), -0.2) + 0.5, pz));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [x, z, radius]);
  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} />
    </lineLoop>
  );
}

/** A finger that moves less than this (px) and lifts quickly counts as a tap, not a drag. */
const TAP_SLOP = 12;
const TAP_MAX_MS = 500;

/**
 * Build-mode interaction on the city grid: the cursor is projected onto the ground plane
 * and snapped to cells.
 *
 * Mouse: left-click places the selected piece (roads, delete and paint also work while
 * dragging); R rotates; Delete / X remove; Ctrl+Z undoes.
 * Touch: draw-style tools (road, delete, paint) act while you drag one finger. Everything
 * else is two-step: tap to put a ghost on the map, then confirm with the on-screen button
 * or by tapping the ghost's spot again. Dragging pans the camera instead of placing.
 * The Edit tool selects a building on tap; its Move button carries it to a new spot.
 */
export function CityBuilder() {
  const mode = useGameStore((s) => s.mode);
  const tool = useBuilderStore((s) => s.tool);
  const rotation = useBuilderStore((s) => s.rotation);
  const facade = useBuilderStore((s) => s.facade);
  const roof = useBuilderStore((s) => s.roof);
  const roadSpec = useBuilderStore((s) => s.roadSpec);
  const brushRadius = useBuilderStore((s) => s.brushRadius);
  const forestRadius = useBuilderStore((s) => s.forest.radius);
  const wall = useBuilderStore((s) => s.wall);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const selectedIds = useBuilderStore((s) => s.selectedIds);
  const selectedBlock = useBuilderStore((s) => s.selectedBlock);
  const movingId = useBuilderStore((s) => s.movingId);
  const pieces = useCityStore((s) => s.pieces);
  const occupancy = useCityStore((s) => s.occupancy);
  const dom = useThree((s) => s.gl.domElement);
  const getThree = useThree((s) => s.get);

  const [hover, setHover] = useState<Hover | null>(null);
  /** Touch: ground point of the tapped spot waiting for confirmation. */
  const [pendingPoint, setPendingPoint] = useState<{ x: number; z: number } | null>(null);
  const hoverRef = useRef<Hover | null>(null);
  const pendingRef = useRef<{ x: number; z: number } | null>(null);
  const pointerInside = useRef(false);
  const painting = useRef(false);
  /** Shift / Ctrl held at the last mouse press: add to the selection instead of replacing it. */
  const multiKey = useRef(false);
  /** Corner cell where a drag-to-select box began, and the box as it grows. */
  const marqueeStart = useRef<Hover | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; z0: number; x1: number; z1: number } | null>(null);
  const touchMode = useRef(false);
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

  const apply = (h: Hover, dragging = false) => {
    const city = useCityStore.getState();
    const b = useBuilderStore.getState();
    /** The piece that claims the cell (roads, buildings) and what a click on it means (a tree planted over it wins). */
    const cellId = city.occupancy[`${h.hx},${h.hz}`];
    // A wall runs along a cell edge, so clicking beside it (within a metre or so) means the wall.
    const wallHit = b.tool === 'select' || b.tool === 'bulldoze' ? wallNear(city.pieces, h.px, h.pz, 1.3) : undefined;
    const topId = wallHit?.id ?? topIdAt(city.pieces, city.occupancy, h.hx, h.hz);
    if (b.tool === 'wall') {
      // Drawing over an existing wall restyles it; elsewhere a new one goes up.
      const existing = Object.values(city.pieces).find((p) => p.type === 'wall' && p.gx === h.edge.gx && p.gz === h.edge.gz && p.rot === h.edge.rot);
      if (existing) city.updatePiece(existing.id, { wall: { ...b.wall } });
      else city.place({ type: 'wall', gx: h.edge.gx, gz: h.edge.gz, rot: h.edge.rot, facade: 'brick', roof: 'gravel', wall: { ...b.wall } });
    } else if (b.tool === 'forest') {
      if (b.forest.mode === 'clear') clearForest(h.px, h.pz, b.forest);
      else plantForest(h.px, h.pz, b.forest, dragging);
    } else if (b.tool === 'terrain') {
      useTerrainStore.getState().paint(brushOf(b.brush), h.px, h.pz, b.brushRadius, b.brushMagnitude);
    } else if (b.tool === 'select') {
      const pickable = !!topId && PIECES[city.pieces[topId].type].customisable;
      if (multiKey.current || b.multiSelect) {
        // Roads have their own stretch editor, so a group is buildings and props only.
        if (topId && pickable && city.pieces[topId].type !== 'road') b.toggleSelect(topId);
      } else {
        b.select(pickable ? topId! : null);
      }
    } else if (b.tool === 'move') {
      if (b.movingId && city.movePiece(b.movingId, h.gx, h.gz, b.rotation)) {
        b.select(b.movingId);
        useBuilderStore.setState({ movingId: null, tool: 'select' });
      }
    } else if (b.tool === 'bulldoze') {
      if (topId && topId === b.selectedId) b.select(null);
      if (wallHit) city.removeById(wallHit.id);
      else city.removeAt(h.hx, h.hz);
    } else if (b.tool === 'paint') {
      const target = cellId ? city.pieces[cellId] : undefined;
      if (target) {
        const look = resolveLook(target.type, b.facade, b.roof);
        city.paintAt(h.hx, h.hz, look.facade, look.roof);
      }
    } else if (b.tool === 'crossing' && cellId && city.pieces[cellId]?.type === 'road') {
      // A level crossing replaces the road cell it is laid on, keeping the road's direction.
      const road = city.pieces[cellId];
      const mask = roadMaskAt(city.pieces, city.occupancy, road.gx, road.gz);
      const rot = mask & 5 && !(mask & 10) ? 0 : mask & 10 && !(mask & 5) ? 1 : b.rotation;
      city.removeById(cellId);
      if (!city.place({ type: 'crossing', gx: road.gx, gz: road.gz, rot, facade: 'brick', roof: 'gravel' })) {
        city.place({ ...road }); // put the road back if the crossing can't go here
      }
    } else if (b.tool === 'road' && cellId && city.pieces[cellId]?.type === 'road') {
      // Painting road over road restyles it with the chosen road settings.
      city.updateRoads([cellId], b.roadSpec);
    } else {
      const look = resolveLook(b.tool, b.facade, b.roof);
      city.place({
        type: b.tool,
        gx: h.gx,
        gz: h.gz,
        rot: b.tool === 'road' ? 0 : b.rotation,
        ...look,
        ...presetStyle(b.tool),
        ...(b.tool === 'road' ? { road: b.roadSpec } : {}),
      });
    }
  };

  const setPending = (point: { x: number; z: number } | null) => {
    pendingRef.current = point;
    setPendingPoint(point);
  };

  useFrame(({ camera, pointer }) => {
    const clear = () => {
      if (hoverRef.current) {
        hoverRef.current = null;
        setHover(null);
      }
    };
    if (mode !== 'build' || !pointerInside.current) return clear();

    const point = groundPoint(raycaster, camera, pointer);
    if (!point) return clear();
    const next = hoverFromPoint(point.x, point.z);
    if (sameHover(hoverRef.current, next)) return;
    hoverRef.current = next;
    setHover(next);
    const anchor = marqueeStart.current;
    if (anchor && painting.current) setMarquee({ x0: Math.min(anchor.gx, next.gx), z0: Math.min(anchor.gz, next.gz), x1: Math.max(anchor.gx, next.gx) + 1, z1: Math.max(anchor.gz, next.gz) + 1 });
    if (painting.current && isDragTool(useBuilderStore.getState().tool)) apply(next, true);
  });

  useEffect(() => {
    if (mode !== 'build') return;
    const touches = new Set<number>();
    let tap: { id: number; x: number; y: number; t: number; multi: boolean } | null = null;

    const pointFromClient = (clientX: number, clientY: number) => {
      const { camera } = getThree();
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      return groundPoint(raycaster, camera, ndc);
    };

    const onMove = () => (pointerInside.current = true);
    const onLeave = () => {
      pointerInside.current = false;
      painting.current = false;
    };
    const onDown = (e: PointerEvent) => {
      pointerInside.current = true;
      if (e.pointerType === 'touch') {
        touchMode.current = true;
        touches.add(e.pointerId);
        if (touches.size > 1) {
          // A second finger means a camera gesture: abandon any stroke or tap in progress.
          painting.current = false;
          endStrokes();
          if (tap) tap.multi = true;
          return;
        }
        multiKey.current = false;
        tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), multi: false };
        if (isDragTool(useBuilderStore.getState().tool)) {
          // Draw-style tools act right away and while dragging, like the mouse.
          const point = pointFromClient(e.clientX, e.clientY);
          if (!point) return;
          const h = hoverFromPoint(point.x, point.z);
          hoverRef.current = h;
          setHover(h);
          painting.current = true;
          beginStrokes();
          apply(h);
        }
        return;
      }
      touchMode.current = false;
      if (e.button !== 0 || !hoverRef.current) return;
      multiKey.current = e.shiftKey || e.ctrlKey || e.metaKey;
      marqueeStart.current = useBuilderStore.getState().tool === 'select' ? hoverRef.current : null;
      painting.current = true;
      beginStrokes(); // one undo step per click or drag
      apply(hoverRef.current);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        // Treat a short, still, single-finger touch as a tap.
        if (tap && tap.id === e.pointerId && !tap.multi && !painting.current) {
          const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y);
          if (moved < TAP_SLOP && performance.now() - tap.t < TAP_MAX_MS) onTap(e.clientX, e.clientY);
        }
        if (tap?.id === e.pointerId) tap = null;
      }
      finishMarquee();
      painting.current = false;
      endStrokes();
    };

    /** A drag in the select tool picks every building and prop inside the box. */
    const finishMarquee = () => {
      const start = marqueeStart.current;
      const end = hoverRef.current;
      marqueeStart.current = null;
      setMarquee(null);
      if (!start || !end || (start.gx === end.gx && start.gz === end.gz)) return;
      const x0 = Math.min(start.gx, end.gx);
      const x1 = Math.max(start.gx, end.gx);
      const z0 = Math.min(start.gz, end.gz);
      const z1 = Math.max(start.gz, end.gz);
      const { pieces } = useCityStore.getState();
      const inside = Object.values(pieces)
        .filter((p) => PIECES[p.type].customisable && p.type !== 'road' && !ROAD_LIKE.includes(p.type))
        .filter((p) => {
          const [w, d] = pieceFootprint(p);
          return p.gx <= x1 && p.gx + w - 1 >= x0 && p.gz <= z1 && p.gz + d - 1 >= z0;
        })
        .map((p) => p.id);
      if (inside.length > 0) useBuilderStore.getState().selectMany(inside, multiKey.current || useBuilderStore.getState().multiSelect);
    };

    const onTap = (clientX: number, clientY: number) => {
      const point = pointFromClient(clientX, clientY);
      if (!point) return;
      const b = useBuilderStore.getState();
      const h = hoverFromPoint(point.x, point.z);
      if (b.tool === 'select') {
        apply(h);
        return;
      }
      const pending = pendingRef.current && hoverFromPoint(pendingRef.current.x, pendingRef.current.z);
      // Tapping the ghost's own spot again confirms; tapping elsewhere moves the ghost.
      if (pending && pending.gx === h.gx && pending.gz === h.gz) {
        apply(pending);
        setPending(null);
      } else {
        setPending(point);
      }
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
        setPending(null);
      }
      // Delete / Backspace remove the selected building, else whatever is under the cursor; X always the latter.
      const wantsDelete = e.code === 'Delete' || e.code === 'Backspace' || e.code === 'KeyX';
      if (wantsDelete) {
        e.preventDefault();
        if (b.selectedIds.length > 1 && e.code !== 'KeyX') {
          city.removeMany(b.selectedIds);
          b.select(null);
        } else if (b.selectedId && e.code !== 'KeyX') {
          city.removeById(b.selectedId);
          b.select(null);
        } else if (hoverRef.current) {
          const hovered = hoverRef.current;
          const wall = wallNear(city.pieces, hovered.px, hovered.pz, 1.3);
          const id = wall?.id ?? topIdAt(city.pieces, city.occupancy, hovered.hx, hovered.hz);
          if (id && id === b.selectedId) b.select(null);
          if (wall) city.removeById(wall.id);
          else city.removeAt(hovered.hx, hovered.hz);
        }
      }
    };
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKeyDown);
      pointerInside.current = false;
      painting.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dom, getThree, raycaster]);

  // A pending touch placement belongs to the tool it was made with.
  useEffect(() => {
    setPending(null);
  }, [tool, movingId, mode]);

  const placeType = isPlaceTool(tool) ? tool : null;
  const moving = tool === 'move' && movingId ? pieces[movingId] : undefined;
  const touchGhost = touchMode.current && (placeType || moving);
  // On touch the ghost sits where the player tapped; with a mouse it follows the cursor.
  const shown: Hover | null = touchGhost ? (pendingPoint ? hoverFromPoint(pendingPoint.x, pendingPoint.z) : null) : hover;

  let valid = false;
  if (shown && placeType) {
    const city = useCityStore.getState();
    const existing = city.pieces[city.occupancy[`${shown.gx},${shown.gz}`]];
    valid =
      existing?.type === 'road' && (placeType === 'road' || placeType === 'crossing')
        ? true // restyle the road that is already here (or turn it into a level crossing)
        : city.canPlace(placeType, shown.gx, shown.gz, placeType === 'road' ? 0 : rotation, undefined, undefined, roadSpec);
  } else if (shown && moving) {
    valid = useCityStore.getState().canPlace(moving.type, shown.gx, shown.gz, rotation, moving.lot, moving.id);
  }

  // Let the on-screen confirm bar know whether something is waiting, and how to act on it.
  const pendingActive = !!(touchGhost && pendingPoint);
  useEffect(() => {
    useTouchStore.getState().setPending(pendingActive, valid);
  }, [pendingActive, valid]);
  useEffect(() => {
    useTouchStore.getState().setHandlers(
      () => {
        const p = pendingRef.current;
        if (p) {
          apply(hoverFromPoint(p.x, p.z));
          setPending(null);
        }
      },
      () => setPending(null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply the ghost tint whenever the ghost model may have been rebuilt.
  useLayoutEffect(() => {
    if (ghostRef.current) ghostify(ghostRef.current, ghostRef.current.userData.ok ?? valid);
  });

  if (mode !== 'build') return null;

  let ghost = null;
  if (shown && (placeType || moving)) {
    const type = (placeType ?? moving?.type) as PieceType;
    const rot = type === 'road' ? 0 : rotation;
    const [w, d] = rotatedFootprint(PIECES[type], rot, moving?.lot);
    ghost = (
      <group ref={ghostRef} position={[(shown.gx + w / 2) * CELL, 0.02, (shown.gz + d / 2) * CELL]} rotation={[0, (rot * Math.PI) / 2, 0]}>
        {type === 'road' ? (
          <RoadModel mask={roadMaskAt(pieces, occupancy, shown.gx, shown.gz)} road={moving?.road ?? roadSpec} bridge={isWaterCell(shown.gx, shown.gz)} />
        ) : (
          <PieceModel
            type={type}
            facade={moving?.facade ?? resolveLook(type, facade, roof).facade}
            roof={moving?.roof ?? resolveLook(type, facade, roof).roof}
            style={resolveStyle(type, moving ?? presetStyle(type))}
            accent={moving?.accent}
            scale={moving?.scale}
            rot={rot}
            gx={shown.gx}
            gz={shown.gz}
            seed={0.5}
          />
        )}
      </group>
    );
  }

  // The wall about to be drawn follows the nearest grid edge.
  let wallGhost = null;
  if (hover && tool === 'wall') {
    const c = edgeCentre(hover.edge, CELL);
    const taken = Object.values(pieces).some((p) => p.type === 'wall' && p.gx === hover.edge.gx && p.gz === hover.edge.gz && p.rot === hover.edge.rot);
    const ok = taken || useCityStore.getState().canPlace('wall', hover.edge.gx, hover.edge.gz, hover.edge.rot);
    wallGhost = (
      <group ref={ghostRef} position={[c.x, 0.02, c.z]} rotation={[0, hover.edge.rot === 0 ? 0 : Math.PI / 2, 0]} userData={{ ok }}>
        <WallModel spec={wall} />
      </group>
    );
  }

  const gridAt = touchGhost ? shown : hover;
  const hoveredWall = hover && (tool === 'select' || tool === 'bulldoze') ? wallNear(pieces, hover.px, hover.pz, 1.3) : undefined;
  const target = hoveredWall ?? (hover ? pieces[topIdAt(pieces, occupancy, hover.hx, hover.hz) ?? ''] : undefined);
  const selected = selectedId ? pieces[selectedId] : undefined;
  const targetable =
    target &&
    ((tool === 'bulldoze') || (tool === 'paint' && PIECES[target.type].paintable) || (tool === 'select' && PIECES[target.type].customisable));
  const highlightColor = tool === 'bulldoze' ? '#ff3030' : '#3aa0ff';

  return (
    <>
      {gridAt && tool !== 'terrain' && <primitive object={grid} position={[gridAt.hx * CELL, 0.02, gridAt.hz * CELL]} />}
      {hover && tool === 'terrain' && <BrushRing x={hover.px} z={hover.pz} radius={brushRadius * CELL} />}
      {hover && tool === 'forest' && <BrushRing x={hover.px} z={hover.pz} radius={forestRadius * CELL} />}
      {ghost}
      {wallGhost}
      {selectedIds.length > 1 && selectedIds.map((id) => (pieces[id] ? <PieceHighlight key={id} piece={pieces[id]} color="#ffd23f" opacity={0.22} /> : null))}
      {selectedIds.length <= 1 && selected && <PieceHighlight piece={selected} color="#ffffff" opacity={0.16} />}
      {marquee && (
        <mesh position={[((marquee.x0 + marquee.x1) / 2) * CELL, 0.4, ((marquee.z0 + marquee.z1) / 2) * CELL]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[(marquee.x1 - marquee.x0) * CELL, (marquee.z1 - marquee.z0) * CELL]} />
          <meshBasicMaterial color="#3aa0ff" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {selectedIds.length <= 1 && selected && !movingId && PIECES[selected.type].paintable && <BlockHighlight piece={selected} index={selectedBlock} />}
      {targetable && <PieceHighlight piece={target} color={highlightColor} opacity={0.28} />}
    </>
  );
}
