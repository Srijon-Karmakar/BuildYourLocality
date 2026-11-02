import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useFrame, useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useEffect } from 'react';
import { combat } from '../../sim/combat';
import { vehicle } from '../../sim/vehicle';
import { useGameStore } from '../../state/useGameStore';
import { WATER_LEVEL, hasTerrain, heightAt } from '../../terrain/terrain';
import { viewState, virtualInput } from '../viewState';
import { useKeyboardControls } from './useKeyboardControls';

const RADIUS = 0.4;
const HALF_HEIGHT = 0.5; // half-height of the cylindrical part only (Rapier capsule convention)
const EYE_OFFSET = HALF_HEIGHT + RADIUS - 0.15; // camera height above body center, just under the cap
const WALK_SPEED = 6;
const RUN_FACTOR = 1.75;
const JUMP_SPEED = 7;
const FLY_SPEED = 14;
const GROUND_CHECK_DISTANCE = HALF_HEIGHT + RADIUS + 0.15;
/** Walking sway: radians of step phase per metre travelled, and how far the eye moves. */
const STRIDE = 1.9;
const BOB_UP = 0.055;
const BOB_SIDE = 0.04;

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
      // Flying is for peaceful exploring only; in a dangerous mode it would be cheating.
      if (e.code === 'KeyF' && !e.repeat && !combat.active) useGameStore.getState().toggleFlying();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Development only: lets tests put the player somewhere.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __teleport?: (x: number, z: number) => void }).__teleport = (x, z) => {
      bodyRef.current?.setTranslation({ x, y: Math.max(0, heightAt(x, z)) + 1.5, z }, true);
      bodyRef.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
    };
  }, [bodyRef]);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wishDir = new THREE.Vector3();
  const bob = { phase: 0, amp: 0 };

  useFrame((_, dt) => {
    const body = bodyRef.current;
    // In build mode the builder camera owns the view; the capsule just rests on the ground.
    if (!body || useGameStore.getState().mode !== 'roam') return;
    // Behind the wheel the car moves the player (see VehicleController).
    if (vehicle.active) return;

    // Put the player back after being knocked out.
    if (combat.respawn) {
      const { x, z } = combat.respawn;
      combat.respawn = null;
      body.setTranslation({ x, y: Math.max(0, heightAt(x, z)) + 2, z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    const fighter = combat.player;
    const frozen = combat.active && (!fighter.alive || !!fighter.shelter || combat.run.intro);

    // Movement direction from camera yaw only — ignore pitch so looking up/down
    // doesn't slow or fly the player.
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.set(-forward.z, 0, forward.x); // forward x up

    wishDir.set(0, 0, 0);
    const k = keys.current;
    if (frozen) {
      k.forward = k.back = k.left = k.right = false;
    }
    if (k.forward) wishDir.add(forward);
    if (k.back) wishDir.sub(forward);
    if (k.right) wishDir.add(right);
    if (k.left) wishDir.sub(right);
    // On-screen joystick (touch): small deflections are ignored so the thumb can rest on it.
    if (Math.hypot(virtualInput.moveX, virtualInput.moveY) > 0.2) {
      wishDir.addScaledVector(forward, virtualInput.moveY).addScaledVector(right, virtualInput.moveX);
    }
    const jump = k.jump || virtualInput.jump;
    const descend = k.down || virtualInput.down;
    const flying = useGameStore.getState().flying && !combat.active;
    // Crouch (Ctrl / C) lowers you and slows you down; Shift runs, for as long as stamina lasts.
    fighter.crouchAmount += ((fighter.crouching ? 1 : 0) - fighter.crouchAmount) * Math.min(1, dt * 9);
    if (frozen) wishDir.set(0, 0, 0);
    const moving = wishDir.lengthSq() > 0;
    const wantsRun = (k.down || virtualInput.sprint) && moving && !flying && fighter.crouchAmount < 0.3;
    const canRun = !combat.active || (fighter.winded ? fighter.stamina > 0.3 : fighter.stamina > 0.02);
    const sprinting = wantsRun && canRun;
    fighter.sprinting = sprinting;
    if (combat.active) {
      fighter.stamina = Math.min(1, Math.max(0, fighter.stamina + (sprinting ? -0.2 : 0.14) * dt));
      if (fighter.stamina <= 0.02) fighter.winded = true;
      else if (fighter.stamina > 0.3) fighter.winded = false;
    } else {
      fighter.stamina = 1;
      fighter.winded = false;
    }
    const pace = (1 - 0.5 * fighter.crouchAmount) * (sprinting ? RUN_FACTOR : 1);
    if (moving) wishDir.normalize().multiplyScalar((flying ? FLY_SPEED : WALK_SPEED) * pace);
    // Knock-back from hits fades quickly.
    const pushX = fighter.pushX;
    const pushZ = fighter.pushZ;
    const decay = Math.exp(-dt * 6);
    fighter.pushX *= decay;
    fighter.pushZ *= decay;
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

    // Deep water: swim at the surface (jump to rise, shift to dive) instead of walking the bed.
    const swimming =
      !flying && hasTerrain() && heightAt(translation.x, translation.z) < WATER_LEVEL - 0.9 && translation.y - (HALF_HEIGHT + RADIUS) < WATER_LEVEL;
    body.setGravityScale(flying || swimming ? 0 : 1, true);
    if (swimming) {
      const vy = jump ? 3 : descend ? -3 : Math.max(-3, Math.min(3, (WATER_LEVEL - translation.y) * 3));
      body.setLinvel({ x: wishDir.x * 0.55, y: vy, z: wishDir.z * 0.55 }, true);
      camera.position.set(translation.x, translation.y + EYE_OFFSET, translation.z);
      return;
    }

    if (flying) {
      // Vertical velocity comes straight from Space/Shift; releasing both hovers in place.
      const vy = (jump ? FLY_SPEED : 0) - (descend ? FLY_SPEED : 0);
      body.setLinvel({ x: wishDir.x, y: vy, z: wishDir.z }, true);
      camera.position.set(translation.x, translation.y + EYE_OFFSET, translation.z);
      return;
    }

    const nextY = jump && grounded && !frozen ? JUMP_SPEED : linvel.y;
    if (jump && grounded && combat.active) {
      fighter.noiseBurst = Math.max(fighter.noiseBurst, 11);
      fighter.burstTimer = 0.5;
    }
    body.setLinvel({ x: wishDir.x + pushX, y: nextY, z: wishDir.z + pushZ }, true);

    // Eye height drops when crouching or knocked out; getting hit shakes the view.
    const down = fighter.crouchAmount * 0.6 + (combat.active && !fighter.alive ? 0.9 : 0);
    const shake = combat.active ? fighter.hurt * 0.07 : 0;
    // Walking sway: the eye dips with every step and drifts side to side, stronger when running.
    // It follows the speed you actually move at, so pushing against a wall or standing still calms it.
    const speed = Math.hypot(linvel.x, linvel.z);
    const swaying = grounded && !frozen && useGameStore.getState().graphics.headBob;
    bob.amp += ((swaying ? Math.min(1.4, speed / WALK_SPEED) : 0) - bob.amp) * Math.min(1, dt * 8);
    bob.phase += dt * speed * STRIDE;
    const calm = bob.amp * (1 - 0.5 * fighter.crouchAmount);
    const bobY = Math.sin(bob.phase * 2) * BOB_UP * calm;
    const bobSide = Math.sin(bob.phase) * BOB_SIDE * calm;
    camera.position.set(
      translation.x + (Math.random() - 0.5) * shake + right.x * bobSide,
      translation.y + EYE_OFFSET - down + bobY + (Math.random() - 0.5) * shake,
      translation.z + (Math.random() - 0.5) * shake + right.z * bobSide,
    );
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
