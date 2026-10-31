/**
 * The world is unbounded horizontally: chunks are generated on demand around the
 * player. Vertically it is capped at WORLD_MAX_CY + 1 chunk layers (cy = 0..WORLD_MAX_CY),
 * i.e. 128 voxels tall; edits below cy = 0 are ignored (the world floor).
 */
export const WORLD_MAX_CY = 7;

/** Chunks within this many chunks (Chebyshev distance) of the player get physics colliders. */
export const PHYSICS_RADIUS = 2;
