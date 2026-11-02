import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CELL } from '../city/catalog';
import { viewState } from '../engine/viewState';
import { atmo } from '../scenes/atmosphere';
import { combat } from '../sim/combat';
import { useConstructionStore } from '../sim/construction';
import { sim } from '../sim/simulation';
import { vehicle } from '../sim/vehicle';
import { useGameStore } from '../state/useGameStore';
import { WATER_LEVEL, hasTerrain, heightAt } from '../terrain/terrain';
import { updateAmbience } from './ambience';
import { setListener, unlockOnGesture } from './engine';
import { playSfx } from './sounds';
import { startUiSounds } from './uiSounds';
import { driveSound, stopDriveSound, updateTraffic } from './vehicleAudio';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const dir = new THREE.Vector3();

interface Surroundings {
  pedsNear: number;
  carsNear: number;
  buildings: number;
  greenery: number;
  water: number;
}

/**
 * Conducts the sound: keeps the listener's ears on the camera, feeds the ambience what is around
 * the player, gives passing traffic its engines, drives the player's own engine, plays footsteps
 * on the right surface and the work noises of building sites.
 */
export function AudioDirector() {
  const camera = useThree((s) => s.camera);
  const around = useRef<Surroundings>({ pedsNear: 0, carsNear: 0, buildings: 0, greenery: 0, water: 0 });
  const scanTimer = useRef(0);
  const steps = useRef({ x: 0, z: 0, dist: 0, foot: 0, lastY: 0, vy: 0, hasLast: false, heart: 0, breath: 0, swim: 0 });
  const siteTimer = useRef(0);
  const time = useRef(0);
  const lastMode = useRef<string>('');
  const cars = useMemo(() => [] as { id: number; x: number; z: number; speed: number; heavy: boolean }[], []);

  useEffect(() => {
    unlockOnGesture();
    return startUiSounds();
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    time.current += dt;
    const roam = useGameStore.getState().mode === 'roam';
    const driving = vehicle.active;

    // The listener's ears are the camera's.
    camera.getWorldDirection(dir);
    setListener(camera.position.x, camera.position.y, camera.position.z, dir.x, dir.y, dir.z);

    // What is around: recomputed a few times a second.
    scanTimer.current -= dt;
    if (scanTimer.current <= 0) {
      scanTimer.current = 0.3;
      const x = viewState.x;
      const z = viewState.z;
      let peds = 0;
      for (const p of sim.peds) if (p.state !== 'inside' && (p.x - x) ** 2 + (p.z - z) ** 2 < 26 * 26) peds++;
      let moving = 0;
      for (const c of sim.cars) if (Math.abs(c.speed) > 0.5 && (c.x - x) ** 2 + (c.z - z) ** 2 < 60 * 60) moving++;
      let water = 0;
      if (hasTerrain()) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          if (heightAt(x + Math.cos(a) * 14, z + Math.sin(a) * 14) < WATER_LEVEL - 0.2) water += 1 / 6;
        }
      }
      const stats = sim.world.stats;
      around.current = {
        pedsNear: clamp01(peds / 9),
        carsNear: clamp01(moving / 6),
        buildings: clamp01(stats.buildings / 45),
        greenery: clamp01(sim.world.foliage.size / 60),
        water: clamp01(water),
      };
    }
    const a = around.current;
    // High above the city (build view) the street is farther away.
    const farAway = roam ? 1 : 0.55;

    updateAmbience({
      dt,
      daylight: atmo.daylight,
      rain: atmo.rain,
      snow: atmo.snow,
      storm: atmo.storm,
      fog: atmo.fog,
      wind: Math.min(1, Math.hypot(atmo.windX, atmo.windZ) * 0.9),
      flash: atmo.flash,
      x: viewState.x,
      z: viewState.z,
      indoors: !!combat.player.shelter,
      inCar: driving,
      pedsNear: a.pedsNear * farAway,
      carsNear: a.carsNear * farAway,
      buildings: a.buildings,
      greenery: a.greenery,
      water: a.water * farAway,
      time: time.current,
    });

    // Traffic engines: the cars near the listener (not the one being driven).
    cars.length = 0;
    for (const c of sim.cars) if (!c.driven) cars.push({ id: c.id, x: c.x, z: c.z, speed: c.speed, heavy: c.kind === 'bus' });
    updateTraffic(cars, camera.position.x, camera.position.z, dt, true);

    // The player's own engine.
    if (driving && vehicle.car) {
      driveSound(
        { speed: vehicle.forward, throttle: vehicle.throttle, slip: vehicle.slip, onRoad: vehicle.onRoad, horn: vehicle.horn, heavy: vehicle.car.kind === 'bus', cabin: vehicle.view === 'hood' },
        dt,
      );
    } else {
      stopDriveSound();
    }

    // Footsteps, landings, splashes and the body's own noises (walk mode, on foot).
    const s = steps.current;
    if (!roam || driving || !combat.player.alive) {
      s.hasLast = false;
    } else {
      const x = viewState.x;
      const z = viewState.z;
      const y = camera.position.y;
      const flying = useGameStore.getState().flying && !combat.active;
      if (s.hasLast) {
        const moved = Math.hypot(x - s.x, z - s.z);
        const speed = moved / Math.max(dt, 0.001);
        const vy = (y - s.lastY) / Math.max(dt, 0.001);
        const swimming = hasTerrain() && heightAt(x, z) < WATER_LEVEL - 0.9;
        const grounded = Math.abs(vy) < 2.2 && !flying;
        // Landing: falling fast, then suddenly not.
        if (s.vy < -6 && vy > -1.5 && !swimming) playSfx('land', clamp01(-s.vy / 14));
        s.vy = vy;
        if (swimming && speed > 0.5) {
          s.swim -= dt;
          if (s.swim <= 0) {
            s.swim = 0.55;
            playSfx('splash', 0.45);
          }
        } else if (grounded && speed > 0.8 && !combat.player.shelter) {
          s.dist += moved;
          const stride = combat.player.sprinting ? 2.2 : combat.player.crouching ? 1.2 : 1.7;
          if (s.dist >= stride) {
            s.dist = 0;
            s.foot ^= 1;
            const gx = Math.floor(x / CELL);
            const gz = Math.floor(z / CELL);
            const onRoad = sim.world.roads.has(`${gx},${gz}`);
            const kind = onRoad ? 'step_road' : sim.world.blocked.has(`${gx},${gz}`) ? 'step_stone' : 'step_grass';
            playSfx(kind, (combat.player.sprinting ? 1 : combat.player.crouching ? 0.35 : 0.7) * (s.foot ? 1 : 0.88));
          }
        }
      }
      s.x = x;
      s.z = z;
      s.lastY = y;
      s.hasLast = true;

      // A winded player pants; a badly hurt one hears their heart.
      if (combat.active) {
        s.breath -= dt;
        if (combat.player.winded && s.breath <= 0) {
          s.breath = 1.1;
          playSfx('breath', 0.8);
        }
        s.heart -= dt;
        if (combat.player.hp < 35 && s.heart <= 0) {
          s.heart = 0.5 + (combat.player.hp / 35) * 0.7;
          playSfx('heartbeat', 0.8);
        }
      }
    }

    // Building sites ring with work while the crew is on the job.
    siteTimer.current -= dt;
    if (siteTimer.current <= 0) {
      siteTimer.current = 0.45 + Math.random() * 0.5;
      const near = Object.values(useConstructionStore.getState().sites)
        .filter((site) => !site.paused && Math.hypot(site.x - camera.position.x, site.z - camera.position.z) < 70)
        .sort((p, q) => Math.hypot(p.x - camera.position.x, p.z - camera.position.z) - Math.hypot(q.x - camera.position.x, q.z - camera.position.z))
        .slice(0, 2);
      for (const site of near) {
        const r = Math.random();
        const at = { x: site.x + (Math.random() - 0.5) * 8, y: 2 + Math.random() * Math.min(site.height, 12), z: site.z + (Math.random() - 0.5) * 8 };
        playSfx(r < 0.62 ? 'hammer' : r < 0.84 ? 'saw' : 'drill', 0.8, at);
      }
    }

    // A tick when the mode changes (build <-> walk).
    const mode = roam ? 'roam' : 'build';
    if (lastMode.current && lastMode.current !== mode) playSfx('click');
    lastMode.current = mode;
  });

  return null;
}
