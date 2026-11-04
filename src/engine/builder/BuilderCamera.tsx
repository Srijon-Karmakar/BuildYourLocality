import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useBuilderStore, isDragTool } from '../../state/useBuilderStore';
import { useGameStore } from '../../state/useGameStore';
import { heightAt } from '../../terrain/terrain';
import { viewState, virtualKeys } from '../viewState';

const MIN_DIST = 10;
const MAX_DIST = 520; // far enough to see over a 200-storey (480 m) tower
const MIN_PITCH = 0.25;
const MAX_PITCH = 1.5;

const clampDist = (d: number) => Math.min(MAX_DIST, Math.max(MIN_DIST, d));

/** Moves the view target as if the ground were grabbed and dragged by (dx, dy) screen pixels. */
function panBy(dx: number, dy: number) {
  const k = viewState.dist * 0.0016;
  const right = [Math.cos(viewState.yaw), -Math.sin(viewState.yaw)];
  const fwd = [-Math.sin(viewState.yaw), -Math.cos(viewState.yaw)];
  viewState.x += (-dx * right[0] + dy * fwd[0]) * k;
  viewState.z += (-dx * right[1] + dy * fwd[1]) * k;
}

/**
 * City-builder camera orbiting a ground point.
 *
 * Mouse: right-drag rotates, middle-drag pans, wheel zooms, WASD/arrows pan, Q/Z turn, E edit, H hand.
 * Touch: two fingers pan + pinch-zoom + twist-rotate; one finger pans too, except while a
 * drag-to-draw tool (road / delete / paint) is active, where it draws instead. On-screen
 * camera buttons feed virtualKeys for rotate / tilt / zoom.
 * The left mouse button is left free for placing pieces.
 */
export function BuilderCamera() {
  const mode = useGameStore((s) => s.mode);
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const held = useRef(new Set<string>());

  useEffect(() => {
    if (mode !== 'build') return;
    let drag: 'rotate' | 'pan' | null = null;
    const handOn = () => useBuilderStore.getState().hand;
    const touches = new Map<number, { x: number; y: number }>();
    let gesture: { cx: number; cy: number; dist: number; angle: number } | null = null;

    const measure = () => {
      const [a, b] = [...touches.values()];
      return {
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) gesture = measure();
        return;
      }
      if (e.button === 2) drag = 'rotate';
      else if (e.button === 0 && handOn()) drag = 'pan';
      else if (e.button === 1) drag = 'pan';
      else return;
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const prev = touches.get(e.pointerId);
        if (!prev) return;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2 && gesture) {
          const next = measure();
          panBy(next.cx - gesture.cx, next.cy - gesture.cy);
          viewState.dist = clampDist(viewState.dist * (gesture.dist / next.dist));
          let dAngle = next.angle - gesture.angle;
          if (dAngle > Math.PI) dAngle -= Math.PI * 2;
          if (dAngle < -Math.PI) dAngle += Math.PI * 2;
          viewState.yaw -= dAngle;
          gesture = next;
        } else if (touches.size === 1 && (handOn() || !isDragTool(useBuilderStore.getState().tool))) {
          panBy(dx, dy);
        }
        return;
      }
      if (drag === 'rotate') {
        viewState.yaw -= e.movementX * 0.005;
        viewState.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, viewState.pitch + e.movementY * 0.004));
      } else if (drag === 'pan') {
        panBy(e.movementX, e.movementY);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        gesture = touches.size >= 2 ? measure() : null;
        return;
      }
      if (drag) dom.releasePointerCapture(e.pointerId);
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      viewState.dist = clampDist(viewState.dist * Math.exp(e.deltaY * 0.001));
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyH' && !e.repeat && !e.ctrlKey && !e.metaKey) {
        const b = useBuilderStore.getState();
        b.setHand(!b.hand);
        return;
      }
      if (e.code === 'KeyE' && !e.repeat && !e.ctrlKey && !e.metaKey) {
        const b = useBuilderStore.getState();
        b.setHand(false);
        b.setTool('select');
        return;
      }
      held.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => held.current.delete(e.code);
    const onBlur = () => { held.current.clear(); touches.clear(); drag = null; gesture = null; };

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    const keys = held.current;
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    };
  }, [mode, dom]);

  // An open hand while hand mode is on.
  const hand = useBuilderStore((st) => st.hand);
  useEffect(() => {
    dom.style.cursor = hand && mode === 'build' ? 'grab' : '';
    return () => {
      dom.style.cursor = '';
    };
  }, [hand, mode, dom]);

  useFrame((_, delta) => {
    if (mode !== 'build') return;
    const keys = held.current;
    const down = (code: string) => keys.has(code) || virtualKeys.has(code);
    const speed = viewState.dist * 0.9 * (down('ShiftLeft') || down('ShiftRight') ? 2.5 : 1) * delta;
    const fx = -Math.sin(viewState.yaw);
    const fz = -Math.cos(viewState.yaw);
    const rx = Math.cos(viewState.yaw);
    const rz = -Math.sin(viewState.yaw);
    const axis = (pos: string[], neg: string[]) =>
      (pos.some(down) ? 1 : 0) - (neg.some(down) ? 1 : 0);
    const forward = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const strafe = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    viewState.x += (fx * forward + rx * strafe) * speed;
    viewState.z += (fz * forward + rz * strafe) * speed;
    viewState.yaw += axis(['KeyQ'], ['KeyZ', 'KeyE']) * 1.5 * delta;
    viewState.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, viewState.pitch + axis(['TiltUp'], ['TiltDown']) * 0.9 * delta));
    viewState.dist = clampDist(viewState.dist * Math.exp(axis(['ZoomOut'], ['ZoomIn']) * 1.1 * delta));

    // Look at the ground itself (so mountains don't swallow the camera) and stay above it.
    const ground = Math.max(0, heightAt(viewState.x, viewState.z));
    const cp = Math.cos(viewState.pitch);
    const cx = viewState.x + Math.sin(viewState.yaw) * cp * viewState.dist;
    const cz = viewState.z + Math.cos(viewState.yaw) * cp * viewState.dist;
    const cy = Math.max(ground + Math.sin(viewState.pitch) * viewState.dist, heightAt(cx, cz) + 4);
    camera.position.set(cx, cy, cz);
    camera.lookAt(viewState.x, ground, viewState.z);
  });

  return null;
}
