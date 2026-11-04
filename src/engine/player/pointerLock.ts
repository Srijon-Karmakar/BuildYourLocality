/** Called synchronously from a click/Enter gesture so browsers permit mouse capture. */
export function captureGamePointer() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-viewport canvas');
  if (!canvas) return;
  canvas.focus({ preventScroll: true });
  if (document.pointerLockElement === canvas) return;
  try {
    // Some browsers return void; others reject a Promise when capture is unavailable.
    const request = canvas.requestPointerLock?.();
    request?.catch(() => { /* The player can click the viewport again to capture the mouse. */ });
  } catch {
    // Keep keyboard input usable when browser policy temporarily refuses mouse capture.
  }
}
