import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { combat } from '../sim/combat';
import { sim } from '../sim/simulation';
import { ledSources } from '../city/ledRegistry';
import { viewState } from '../engine/viewState';
import { useGameStore } from '../state/useGameStore';
import { atmo } from './atmosphere';

/**
 * Real light sources for the night: a pool of point lights that hop to the street lamps nearest
 * the view, spot lights on the nearest cars' headlamps, and the player's torch (L). The number
 * of lights never changes while playing (changing it would recompile every material), so the
 * pools are small and sized by the graphics preset; each slot just fades to wherever it is
 * needed next.
 */

const POOLS = {
  low: { lamps: 2, cars: 1, leds: 0 },
  medium: { lamps: 5, cars: 3, leds: 2 },
  high: { lamps: 10, cars: 5, leds: 4 },
} as const;
const LED_INTENSITY = 90;

const LAMP_HEIGHT = 4.9;
const LAMP_INTENSITY = 150;
const CAR_INTENSITY = 230;
const TORCH_INTENSITY = 420;
const REASSIGN_EVERY = 0.2;
const centre = new THREE.Vector3();
const out = new THREE.Vector3();

interface Slot {
  /** What this slot is lighting right now (a lamp index or a car id); -1 when free. */
  key: number;
  level: number;
  target: number;
}

export function NightLights() {
  const preset = useGameStore((s) => s.graphics.preset);
  const size = POOLS[preset === 'custom' ? 'medium' : preset];
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const rig = useMemo(() => {
    const lamps = Array.from({ length: size.lamps }, () => {
      const l = new THREE.PointLight('#ffd49a', 0, 30, 2);
      l.castShadow = false;
      return l;
    });
    const cars = Array.from({ length: size.cars }, () => {
      const l = new THREE.SpotLight('#fff1cc', 0, 34, 0.5, 0.6, 1.6);
      l.castShadow = false;
      return l;
    });
    const leds = Array.from({ length: size.leds }, () => {
      const l = new THREE.PointLight('#ffffff', 0, 28, 2);
      l.castShadow = false;
      return l;
    });
    const torch = new THREE.SpotLight('#fff4d8', 0, 48, 0.46, 0.55, 1.5);
    torch.castShadow = false;
    const torchTarget = new THREE.Object3D();
    torchTarget.position.set(0, 0, -5);
    torch.target = torchTarget;
    return {
      lamps,
      cars,
      leds,
      ledSlots: leds.map((): Slot => ({ key: -1, level: 0, target: 0 })),
      /** Where each LED screen's light goes, refreshed with the assignments. */
      ledPlace: new Map<number, { x: number; y: number; z: number; nx: number; nz: number }>(),
      torch,
      torchTarget,
      lampSlots: lamps.map((): Slot => ({ key: -1, level: 0, target: 0 })),
      carSlots: cars.map((): Slot => ({ key: -1, level: 0, target: 0 })),
      timer: 0,
    };
  }, [size.lamps, size.cars, size.leds]);

  useEffect(() => {
    for (const l of rig.lamps) scene.add(l);
    for (const l of rig.leds) scene.add(l);
    for (const l of rig.cars) {
      scene.add(l);
      scene.add(l.target);
    }
    camera.add(rig.torch);
    camera.add(rig.torchTarget);
    return () => {
      for (const l of rig.lamps) scene.remove(l);
      for (const l of rig.leds) scene.remove(l);
      for (const l of rig.cars) {
        scene.remove(l);
        scene.remove(l.target);
      }
      camera.remove(rig.torch);
      camera.remove(rig.torchTarget);
      [...rig.lamps, ...rig.leds, ...rig.cars, rig.torch].forEach((l) => l.dispose());
    };
  }, [rig, scene, camera]);

  useFrame((_, dt) => {
    const night = atmo.lamps;
    const roam = useGameStore.getState().mode === 'roam';
    const fx = viewState.x;
    const fz = viewState.z;

    // --- Choose what each slot lights (a few times a second) ---
    rig.timer -= dt;
    if (rig.timer <= 0) {
      rig.timer = REASSIGN_EVERY;
      if (night > 0.02) {
        const lampList = sim.world.lamps;
        // Nearest lamps first; slots already on a lamp that is still among the nearest keep it.
        const near: { i: number; d: number }[] = [];
        for (let i = 0; i < lampList.length; i++) {
          const d = (lampList[i].x - fx) ** 2 + (lampList[i].z - fz) ** 2;
          if (d < 90 * 90) near.push({ i, d });
        }
        near.sort((a, b) => a.d - b.d);
        assign(rig.lampSlots, near.slice(0, size.lamps).map((n) => n.i));

        const carNear: { id: number; d: number }[] = [];
        for (const c of sim.cars) {
          const d = (c.x - fx) ** 2 + (c.z - fz) ** 2;
          if (d < 70 * 70) carNear.push({ id: c.id, d });
        }
        carNear.sort((a, b) => a.d - b.d);
        assign(rig.carSlots, carNear.slice(0, size.cars).map((n) => n.id));

        // The brightest screens close by lend their light to the street.
        if (size.leds > 0) {
          const ledNear: { id: number; d: number }[] = [];
          for (const [id, led] of ledSources) {
            led.object.updateWorldMatrix(true, false);
            const m = led.object.matrixWorld;
            centre.set(led.local[0], led.local[1], led.local[2]).applyMatrix4(m);
            out.set(0, 0, 1).transformDirection(m);
            const d = (centre.x - fx) ** 2 + (centre.z - fz) ** 2;
            if (d > 80 * 80) continue;
            rig.ledPlace.set(id, { x: centre.x, y: centre.y, z: centre.z, nx: out.x, nz: out.z });
            ledNear.push({ id, d: d / Math.max(0.4, Math.sqrt(led.width * led.height) * led.brightness * led.glowAmount * 0.1) });
          }
          ledNear.sort((a, b) => a.d - b.d);
          assign(rig.ledSlots, ledNear.slice(0, size.leds).map((n) => n.id));
        }
      } else {
        for (const s of [...rig.lampSlots, ...rig.carSlots, ...rig.ledSlots]) s.target = 0;
      }
    }

    // --- Move and fade the lights ---
    const fade = Math.min(1, dt * 4);
    rig.lampSlots.forEach((slot, i) => {
      const light = rig.lamps[i];
      slot.level += (slot.target * night - slot.level) * fade;
      const lamp = sim.world.lamps[slot.key];
      if (lamp) light.position.set(lamp.x, LAMP_HEIGHT, lamp.z);
      light.intensity = slot.key >= 0 ? LAMP_INTENSITY * slot.level : 0;
    });
    rig.carSlots.forEach((slot, i) => {
      const light = rig.cars[i];
      slot.level += (slot.target * night - slot.level) * fade;
      const car = sim.cars.find((c) => c.id === slot.key);
      if (car) {
        const sx = Math.sin(car.heading);
        const cz = Math.cos(car.heading);
        light.position.set(car.x + sx * 2.1, 0.95, car.z + cz * 2.1);
        light.target.position.set(car.x + sx * 16, 0.2, car.z + cz * 16);
        light.target.updateMatrixWorld();
      }
      light.intensity = car ? CAR_INTENSITY * slot.level : 0;
    });

    rig.ledSlots.forEach((slot, i) => {
      const light = rig.leds[i];
      slot.level += (slot.target * night - slot.level) * fade;
      const led = ledSources.get(slot.key);
      const place = rig.ledPlace.get(slot.key);
      if (led && place) {
        // Out in front of the wall and no higher than street height, where it lights the road and the faces nearby.
        light.position.set(place.x + place.nx * 3.5, Math.min(place.y, 7), place.z + place.nz * 3.5);
        const [r, g, b] = led.colour();
        const peak = Math.max(r, g, b, 0.001);
        light.color.setRGB(r / peak, g / peak, b / peak);
        const areaFactor = Math.min(1.6, Math.sqrt(led.width * led.height) / 10);
        light.intensity = LED_INTENSITY * Math.min(1, peak * 1.7) * led.brightness * led.glowAmount * areaFactor * slot.level;
      } else {
        light.intensity = 0;
      }
    });

    // --- The player's torch ---
    const on = roam && combat.player.flashlight && (combat.player.alive || !combat.active);
    rig.torch.intensity += ((on ? TORCH_INTENSITY : 0) - rig.torch.intensity) * Math.min(1, dt * 12);
  });

  return null;
}

/** Keeps slots on the same things where possible; hands free slots to newcomers. */
function assign(slots: Slot[], wanted: number[]) {
  const set = new Set(wanted);
  const taken = new Set<number>();
  for (const s of slots) {
    if (s.key >= 0 && set.has(s.key)) {
      s.target = 1;
      taken.add(s.key);
    } else if (s.key >= 0) {
      s.target = 0;
      if (s.level < 0.03) s.key = -1; // faded out: free for reuse
    }
  }
  for (const key of wanted) {
    if (taken.has(key)) continue;
    const free = slots.find((s) => s.key < 0);
    if (!free) break;
    free.key = key;
    free.level = 0;
    free.target = 1;
    taken.add(key);
  }
}
