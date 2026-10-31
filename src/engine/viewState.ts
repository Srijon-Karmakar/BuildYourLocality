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
