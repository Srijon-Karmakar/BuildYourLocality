import type * as THREE from 'three';

/**
 * LED screens that are standing in the city, so the night lighting can find the ones near the
 * player and let them light up their surroundings in the colour they are showing.
 */
export interface LedSource {
  /** The wall the screen is mounted on: +z points out of the wall. */
  object: THREE.Object3D;
  /** Centre of the screen in the wall's own frame. */
  local: [number, number, number];
  width: number;
  height: number;
  brightness: number;
  glowAmount: number;
  /** What the screen shows right now, 0..1 per channel. */
  colour: () => [number, number, number];
}

export const ledSources = new Map<number, LedSource>();
let nextId = 1;

export function registerLed(source: LedSource): () => void {
  const id = nextId++;
  ledSources.set(id, source);
  return () => void ledSources.delete(id);
}
