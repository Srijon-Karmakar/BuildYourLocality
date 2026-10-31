import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useGameStore } from '../../state/useGameStore';
import { viewState } from '../viewState';

const MIN_DIST = 10;
const MAX_DIST = 250;
const MIN_PITCH = 0.25;
const MAX_PITCH = 1.5;

/**
 * City-builder camera orbiting a ground point. Right-drag rotates, middle-drag pans,
 * wheel zooms, WASD/arrows pan relative to the view, Q/E turn, Shift speeds panning.
 * Left button is left free for placing pieces.
 */
export function BuilderCamera() {
  const mode = useGameStore((s) => s.mode);
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const held = useRef(new Set<string>());

  useEffect(() => {
    if (mode !== 'build') return;
    let drag: 'rotate' | 'pan' | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button === 2) drag = 'rotate';
      else if (e.button === 1) drag = 'pan';
      else return;
      dom.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (drag === 'rotate') {
        viewState.yaw -= e.movementX * 0.005;
        viewState.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, viewState.pitch + e.movementY * 0.004));
      } else if (drag === 'pan') {
        const k = viewState.dist * 0.0016;
        const right = [Math.cos(viewState.yaw), -Math.sin(viewState.yaw)];
        const fwd = [-Math.sin(viewState.yaw), -Math.cos(viewState.yaw)];
        // "Grab the ground": dragging right/down moves the view left/forward.
        viewState.x += (-e.movementX * right[0] + e.movementY * fwd[0]) * k;
        viewState.z += (-e.movementX * right[1] + e.movementY * fwd[1]) * k;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) dom.releasePointerCapture(e.pointerId);
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      viewState.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, viewState.dist * Math.exp(e.deltaY * 0.001)));
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      held.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => held.current.delete(e.code);

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      held.current.clear();
    };
  }, [mode, dom]);

  useFrame((_, delta) => {
    if (mode !== 'build') return;
    const keys = held.current;
    const speed = viewState.dist * 0.9 * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1) * delta;
    const fx = -Math.sin(viewState.yaw);
    const fz = -Math.cos(viewState.yaw);
    const rx = Math.cos(viewState.yaw);
    const rz = -Math.sin(viewState.yaw);
    const axis = (pos: string[], neg: string[]) =>
      (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
    const forward = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const strafe = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    viewState.x += (fx * forward + rx * strafe) * speed;
    viewState.z += (fz * forward + rz * strafe) * speed;
    viewState.yaw += axis(['KeyQ'], ['KeyE']) * 1.5 * delta;

    const cp = Math.cos(viewState.pitch);
    camera.position.set(
      viewState.x + Math.sin(viewState.yaw) * cp * viewState.dist,
      Math.sin(viewState.pitch) * viewState.dist,
      viewState.z + Math.cos(viewState.yaw) * cp * viewState.dist,
    );
    camera.lookAt(viewState.x, 0, viewState.z);
  });

  return null;
}
