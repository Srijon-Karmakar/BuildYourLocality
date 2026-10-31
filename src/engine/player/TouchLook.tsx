import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../../state/useGameStore';

const LOOK_SPEED = 0.0042;
const MAX_PITCH = 1.45;

/**
 * Walk-mode look control for touch screens, where pointer lock doesn't exist: dragging a
 * finger on the 3D view turns the camera. (Fingers on the joystick and buttons are DOM
 * overlays, so they never reach the canvas and don't turn the view.)
 */
export function TouchLook() {
  const mode = useGameStore((s) => s.mode);
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);

  useEffect(() => {
    if (mode !== 'roam') return;
    const last = new Map<number, { x: number; y: number }>();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') last.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent) => {
      const prev = last.get(e.pointerId);
      if (!prev) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= (e.clientX - prev.x) * LOOK_SPEED;
      euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x - (e.clientY - prev.y) * LOOK_SPEED));
      camera.quaternion.setFromEuler(euler);
      last.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => last.delete(e.pointerId);

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
    };
  }, [mode, camera, dom]);

  return null;
}
