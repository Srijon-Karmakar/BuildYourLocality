/**
 * The point the player is looking at / standing on, shared by whichever view is active
 * (builder camera in build mode, the player capsule in roam mode). The ground, sun and
 * shadows follow it so the world feels endless. Mutated every frame, so deliberately
 * not React state.
 */
export const viewState = {
  x: 0,
  z: 0,
  yaw: Math.PI / 4,
  pitch: 0.85,
  dist: 70,
};

/**
 * Input from on-screen controls (touch joystick and buttons), merged with the keyboard by
 * the player controller. Plain mutable object so per-frame reads don't cause React renders.
 */
export const virtualInput = {
  /** Joystick axes, -1..1: moveX strafes right, moveY moves forward. */
  moveX: 0,
  moveY: 0,
  jump: false,
  down: false,
  /** Held attack button (touch). */
  attack: false,
  /** Crouch toggle (touch). */
  crouch: false,
  /** Held run button (touch). */
  sprint: false,
  /** Held horn button while driving (touch). */
  horn: false,
};

/**
 * On-screen camera buttons held in build mode, using KeyboardEvent.code-style names so the
 * builder camera treats them like keys (KeyQ/KeyE turn) plus Zoom/Tilt actions.
 */
export const virtualKeys = new Set<string>();

