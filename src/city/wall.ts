import type { BlockBox, DoorSide } from './catalog';

const WALL_FACES: Record<DoorSide, { rotY: number; along: 'w' | 'd' }> = {
  front: { rotY: 0, along: 'w' },
  back: { rotY: Math.PI, along: 'w' },
  right: { rotY: Math.PI / 2, along: 'd' },
  left: { rotY: -Math.PI / 2, along: 'd' },
};

/**
 * Where something mounted on a block wall sits: the wall's centre point, the turn that
 * makes local +z point out of the wall, and the wall length it can slide along.
 */
export function wallPlacement(box: BlockBox, side: DoorSide): { position: [number, number, number]; rotY: number; length: number } {
  const face = WALL_FACES[side];
  const position: [number, number, number] =
    side === 'front'
      ? [box.cx, 0, box.cz + box.d / 2]
      : side === 'back'
        ? [box.cx, 0, box.cz - box.d / 2]
        : side === 'right'
          ? [box.cx + box.w / 2, 0, box.cz]
          : [box.cx - box.w / 2, 0, box.cz];
  return { position, rotY: face.rotY, length: face.along === 'w' ? box.w : box.d };
}

/** Largest door offset (metres from the wall centre) that keeps the door on its wall. */
export function maxDoorOffset(length: number): number {
  return Math.max(0, length / 2 - 1.3);
}
