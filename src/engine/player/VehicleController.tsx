import { useFrame, useThree } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { combat } from '../../sim/combat';
import { vehicle, type DriveInput } from '../../sim/vehicle';
import { useGameStore } from '../../state/useGameStore';
import { heightAt } from '../../terrain/terrain';
import { viewState, virtualInput } from '../viewState';

const held = new Set<string>();
const forward = new THREE.Vector3();
const target = new THREE.Vector3();
const wanted = new THREE.Vector3();

/**
 * Takes the wheel: reads the keys, steers the car (sim/vehicle.ts), and puts the camera behind it
 * or in the driver's seat. The player's walking body is switched off while driving and put back at
 * the door on the way out.
 */
export function VehicleController({ bodyRef }: { bodyRef: RefObject<RapierRigidBody | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const baseFov = useRef(camera.fov);
  const wasDriving = useRef(false);
  const scan = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      held.add(e.code);
      if (!vehicle.active) return;
      if (e.code === 'KeyV' && !e.repeat) vehicle.view = vehicle.view === 'chase' ? 'hood' : 'chase';
      // Keys the page itself would use (scrolling with Space or the arrows) are the car's while driving.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => held.delete(e.code);
    const onBlur = () => held.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const roam = useGameStore.getState().mode === 'roam';
    const body = bodyRef.current;

    // Leaving walk mode, dying or hiding drops you out of the car.
    if (vehicle.active && (!roam || !combat.player.alive || combat.player.shelter)) vehicle.exit();

    if (!vehicle.active) {
      if (wasDriving.current) {
        wasDriving.current = false;
        camera.fov = baseFov.current;
        camera.updateProjectionMatrix();
        // Back on your feet at the door.
        if (body && vehicle.exitAt) {
          const { x, z } = vehicle.exitAt;
          body.setEnabled(true);
          body.setTranslation({ x, y: Math.max(0, heightAt(x, z)) + 1.6, z }, true);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          viewState.x = x;
          viewState.z = z;
        }
        vehicle.exitAt = null;
      }
      // Look for a car within reach, a few times a second, to offer it.
      scan.current -= dt;
      if (roam && scan.current <= 0) {
        scan.current = 0.2;
        vehicle.scan(viewState.x, viewState.z);
      }
      if (!roam) vehicle.near = null;
      return;
    }

    // --- Driving ---
    if (!wasDriving.current) {
      wasDriving.current = true;
      baseFov.current = camera.fov;
      if (body) body.setEnabled(false);
      ready.current = false;
    }
    const car = vehicle.car!;
    const pad = Math.hypot(virtualInput.moveX, virtualInput.moveY) > 0.15;
    const input: DriveInput = {
      throttle: Math.max(held.has('KeyW') || held.has('ArrowUp') ? 1 : 0, pad ? Math.max(0, virtualInput.moveY) : 0),
      brake: Math.max(held.has('KeyS') || held.has('ArrowDown') ? 1 : 0, pad ? Math.max(0, -virtualInput.moveY) : 0),
      steer: Math.max(-1, Math.min(1, (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) + (pad ? virtualInput.moveX : 0))),
      handbrake: held.has('Space') || virtualInput.jump,
      horn: held.has('KeyH') || virtualInput.horn,
    };
    vehicle.update(dt, input);

    // The player's body rides along (and the simulation sees the player here).
    viewState.x = car.x;
    viewState.z = car.z;
    if (body) {
      body.setTranslation({ x: car.x, y: (car.y ?? 0) + 1.2, z: car.z }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // --- Camera ---
    const sx = Math.sin(car.heading);
    const cz = Math.cos(car.heading);
    const shake = vehicle.shake * 0.18;
    const jitter = () => (Math.random() - 0.5) * shake;
    const speed = Math.abs(vehicle.forward);
    camera.fov += (baseFov.current + Math.min(18, speed * 0.55) - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    const bus = car.kind === 'bus';
    if (vehicle.view === 'chase') {
      const back = bus ? 12 : 7.6;
      const up = bus ? 5.2 : 3.1;
      // Drifting round a corner swings the camera a little to the outside of the turn.
      const swing = Math.max(-1.2, Math.min(1.2, vehicle.slip * 0.12));
      wanted.set(car.x - sx * back + cz * swing, (car.y ?? 0) + up, car.z - cz * back - sx * swing);
      if (!ready.current) {
        camera.position.copy(wanted);
        ready.current = true;
      }
      camera.position.lerp(wanted, 1 - Math.exp(-dt * 7));
      camera.position.x += jitter();
      camera.position.y += jitter();
      target.set(car.x + sx * (3 + vehicle.lean * 5), (car.y ?? 0) + (bus ? 2.6 : 1.5), car.z + cz * (3 + vehicle.lean * 5));
      camera.lookAt(target);
    } else {
      // The driver's seat: left of centre, eyes level with the windscreen, looking where the car points.
      const seatX = Math.cos(car.heading) * (bus ? 0.8 : 0.42);
      const seatZ = -Math.sin(car.heading) * (bus ? 0.8 : 0.42);
      camera.position.set(car.x + seatX + sx * (bus ? 3.4 : 0.35) + jitter(), (car.y ?? 0) + (bus ? 2.6 : 1.3) + jitter(), car.z + seatZ + cz * (bus ? 3.4 : 0.35));
      forward.set(sx, 0, cz);
      target.copy(camera.position).addScaledVector(forward, 20);
      target.y -= 0.6 + (car.pitch ?? 0) * 8;
      camera.lookAt(target);
    }
  });

  return null;
}
