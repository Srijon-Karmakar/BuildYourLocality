import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useEffect } from 'react';
import { useGameStore } from '../../state/useGameStore';
import { viewState } from '../viewState';
import { useKeyboardControls } from './useKeyboardControls';

const RADIUS = 0.4;
const HALF_HEIGHT = 0.5; // half-height of the cylindrical part only (Rapier capsule convention)
const EYE_OFFSET = HALF_HEIGHT + RADIUS - 0.15; // camera height above body center, just under the cap
const WALK_SPEED = 6;
const JUMP_SPEED = 7;
const FLY_SPEED = 14;
const GROUND_CHECK_DISTANCE = HALF_HEIGHT + RADIUS + 0.15;

interface PlayerControllerProps {
  start?: [number, number, number];
  /** Shared with BuildInteraction so its raycast can exclude the player's own capsule
   *  collider — the camera sits inside it, so an un-excluded ray self-intersects at
   *  toi=0 instead of reaching the world. */
  bodyRef: RefObject<RapierRigidBody | null>;
}

/**
 * First-person grounded controller: a capsule RigidBody driven by WASD (relative to
 * camera yaw) plus gravity from the Physics world, with a downward raycast for jump/
 * grounded state. The camera is not a child of the rigid body — its position is
 * synced to the body's translation every frame so PointerLockControls (which owns
 * camera rotation) and this controller (which owns camera position) don't fight.
 */
export function PlayerController({ start = [0, 2, 0], bodyRef }: PlayerControllerProps) {
  const keys = useKeyboardControls();
  const { camera } = useThree();
  const { world, rapier } = useRapier();

  // F toggles fly mode (ignored while typing in a form field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyF' && !e.repeat) useGameStore.getState().toggleFlying();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wishDir = new THREE.Vector3();

  useFrame(() => {
    const body = bodyRef.current;
    // In build mode the builder camera owns the view; the capsule just rests on the ground.
    if (!body || useGameStore.getState().mode !== 'roam') return;

    // Movement direction from camera yaw only — ignore pitch so looking up/down
    // doesn't slow or fly the player.
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x); // forward x up

    wishDir.set(0, 0, 0);
    const k = keys.current;
    if (k.forward) wishDir.add(forward);
    if (k.back) wishDir.sub(forward);
    if (k.right) wishDir.add(right);
    if (k.left) wishDir.sub(right);
    const flying = useGameStore.getState().flying;
    if (wishDir.lengthSq() > 0) wishDir.normalize().multiplyScalar(flying ? FLY_SPEED : WALK_SPEED);
    body.setGravityScale(flying ? 0 : 1, true);

    const linvel = body.linvel();
    const translation = body.translation();
    viewState.x = translation.x;
    viewState.z = translation.z;

    // Grounded check via a short downward raycast, excluding the player's own body.
    const origin = { x: translation.x, y: translation.y, z: translation.z };
    const ray = new rapier.Ray(origin, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(ray, GROUND_CHECK_DISTANCE, true, undefined, undefined, undefined, body);
    const grounded = hit !== null;

    if (flying) {
      // Vertical velocity comes straight from Space/Shift; releasing both hovers in place.
      const vy = (k.jump ? FLY_SPEED : 0) - (k.down ? FLY_SPEED : 0);
      body.setLinvel({ x: wishDir.x, y: vy, z: wishDir.z }, true);
      camera.position.set(translation.x, translation.y + EYE_OFFSET, translation.z);
      return;
    }

    const nextY = k.jump && grounded ? JUMP_SPEED : linvel.y;
    body.setLinvel({ x: wishDir.x, y: nextY, z: wishDir.z }, true);

    camera.position.set(translation.x, translation.y + EYE_OFFSET, translation.z);
  });

  return (
    <RigidBody
      ref={bodyRef}
      position={start}
      colliders={false}
      mass={1}
      lockRotations
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[HALF_HEIGHT, RADIUS]} />
    </RigidBody>
  );
}
