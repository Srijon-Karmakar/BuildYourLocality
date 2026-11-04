import { PointerLockControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

/** The HUD and look controller must lock the same element, rather than R3F's event wrapper. */
export function DesktopLook() {
  const canvas = useThree((s) => s.gl.domElement);
  return (
    <PointerLockControls
      domElement={canvas}
      selector="#game-viewport canvas"
      onLock={() => canvas.focus({ preventScroll: true })}
    />
  );
}
