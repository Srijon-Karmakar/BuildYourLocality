import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { combat, WEAPON_ORDER, WEAPONS, type WeaponId } from '../../sim/combat';
import { useGameStore } from '../../state/useGameStore';
import { viewState, virtualInput } from '../viewState';
import { vehicle } from '../../sim/vehicle';

const skin = new THREE.MeshStandardMaterial({ color: '#d9a577', roughness: 0.8 });
const steel = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.35, metalness: 0.8 });
const darkSteel = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.5, metalness: 0.6 });
const wood = new THREE.MeshStandardMaterial({ color: '#a8743a', roughness: 0.7 });
const grip = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.9 });
const taserBody = new THREE.MeshStandardMaterial({ color: '#e8c21a', roughness: 0.5 });
const flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const boltMaterial = new THREE.MeshBasicMaterial({ color: '#7de3ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

/** How far in front of the camera each gun's muzzle is, for the flash. */
const MUZZLE_Z: Partial<Record<WeaponId, number>> = { shotgun: -0.95, rifle: -1.15, smg: -0.7, revolver: -0.55, bomber: -1.0 };

/** The weapon held in front of the camera, with a swing / recoil animation. */
function Viewmodel() {
  const root = useRef<THREE.Group>(null);
  const groups = useRef<Partial<Record<WeaponId, THREE.Group | null>>>({});
  const flash = useRef<THREE.Mesh>(null);
  const bolt = useRef<THREE.Mesh>(null);
  const bob = useRef(0);
  const last = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);

  useFrame((state, dt) => {
    const r = root.current;
    if (!r) return;
    const p = combat.player;
    const show = useGameStore.getState().mode === 'roam' && (combat.active || combat.arms) && p.alive && !p.shelter && !vehicle.active;
    r.visible = show;
    if (!show) return;

    const speed = camera.position.distanceTo(last.current) / Math.max(dt, 1e-3);
    last.current.copy(camera.position);
    bob.current += Math.min(speed, 8) * dt * 1.5;
    const walk = Math.min(1, speed / 5);
    const q = 1 - p.swing; // 0 at the start of a swing, 1 when done
    const arc = Math.sin(Math.min(1, q) * Math.PI);

    for (const id of WEAPON_ORDER) {
      const g = groups.current[id];
      if (g) g.visible = id === p.weapon;
    }
    const crouch = p.crouchAmount;
    r.position.set(0.3, -0.3 + Math.sin(bob.current) * 0.012 * walk + crouch * 0.02, -0.56 + Math.abs(Math.cos(bob.current)) * 0.01 * walk);
    r.rotation.set(0, 0, 0);

    const g = groups.current[p.weapon];
    if (g) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      switch (p.weapon) {
        case 'bat':
          g.rotation.set(-0.2 - arc * 1.5, -arc * 0.6, 0.35 - arc * 0.9);
          g.position.set(-arc * 0.25, arc * 0.08, -arc * 0.2);
          break;
        case 'fists': {
          const left = groups.current.fists?.children[0];
          const right = groups.current.fists?.children[1];
          if (left && right) {
            left.position.set(-0.5, -0.04, -0.1);
            right.position.set(-0.1, -0.04, -0.1);
            const punch = p.swingHand === 0 ? left : right;
            punch.position.z = -0.1 - arc * 0.5;
            punch.position.y = -0.04 + arc * 0.1;
            (p.swingHand === 0 ? right : left).position.z = -0.1 + arc * 0.04;
          }
          break;
        }
        default:
          // Guns kick back and up.
          g.position.z = p.swing * 0.12;
          g.rotation.x = p.swing * 0.28;
      }
    }

    // Muzzle flash on the first moments after a shot.
    const f = flash.current;
    if (f) {
      const shot = !WEAPONS[p.weapon].melee && p.weapon !== 'taser' && p.weapon !== 'crossbow' && p.swing > 0.82;
      f.visible = shot;
      if (shot) {
        const s = 0.14 + Math.random() * 0.08;
        f.scale.set(s, s, s);
        f.rotation.z = Math.random() * 6;
        f.position.set(0.03, 0.06, MUZZLE_Z[p.weapon] ?? -0.62);
      }
    }
    const b = bolt.current;
    if (b) {
      const zap = p.weapon === 'taser' && p.swing > 0.5;
      b.visible = zap;
      if (zap) {
        const s = 0.1 + Math.random() * 0.1;
        b.scale.set(s, s, s);
        b.rotation.z = Math.random() * 6;
        b.position.set(0, 0.06, -0.5);
      }
    }
    void state;
  });

  const setRef = (id: WeaponId) => (g: THREE.Group | null) => {
    groups.current[id] = g;
  };

  return (
    <group ref={root}>
      <group ref={setRef('fists')}>
        {[0, 1].map((i) => (
          <mesh key={i} material={skin}>
            <boxGeometry args={[0.085, 0.08, 0.15]} />
          </mesh>
        ))}
      </group>
      <group ref={setRef('bat')} position={[0, 0, 0]}>
        <mesh position={[0, 0.2, 0]} rotation={[0.25, 0, 0]} material={wood}>
          <cylinderGeometry args={[0.04, 0.025, 0.85, 12]} />
        </mesh>
        <mesh position={[0, -0.18, 0.04]} rotation={[0.25, 0, 0]} material={grip}>
          <cylinderGeometry args={[0.026, 0.026, 0.2, 10]} />
        </mesh>
      </group>
      <group ref={setRef('pistol')}>
        <mesh position={[0, 0.02, -0.18]} material={steel}>
          <boxGeometry args={[0.07, 0.09, 0.4]} />
        </mesh>
        <mesh position={[0, -0.09, -0.04]} rotation={[0.25, 0, 0]} material={grip}>
          <boxGeometry args={[0.065, 0.17, 0.08]} />
        </mesh>
        <mesh position={[0, 0.075, -0.2]} material={darkSteel}>
          <boxGeometry args={[0.03, 0.025, 0.34]} />
        </mesh>
      </group>
      <group ref={setRef('shotgun')}>
        <mesh position={[0, 0.02, -0.3]} material={darkSteel}>
          <cylinderGeometry args={[0.028, 0.028, 0.9, 10]} />
        </mesh>
        <mesh position={[0, 0.02, -0.3]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 10]} />
        </mesh>
        <mesh position={[0, -0.04, 0.12]} rotation={[0.1, 0, 0]} material={wood}>
          <boxGeometry args={[0.08, 0.12, 0.38]} />
        </mesh>
      </group>
      <group ref={setRef('revolver')}>
        <mesh position={[0, 0.03, -0.2]} material={steel}>
          <boxGeometry args={[0.06, 0.07, 0.42]} />
        </mesh>
        <mesh position={[0, 0.02, -0.1]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel}>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 10]} />
        </mesh>
        <mesh position={[0, -0.09, -0.0]} rotation={[0.35, 0, 0]} material={wood}>
          <boxGeometry args={[0.06, 0.17, 0.08]} />
        </mesh>
      </group>
      <group ref={setRef('smg')}>
        <mesh position={[0, 0.02, -0.2]} material={darkSteel}>
          <boxGeometry args={[0.08, 0.1, 0.5]} />
        </mesh>
        <mesh position={[0, 0.02, -0.52]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.018, 0.018, 0.2, 8]} />
        </mesh>
        <mesh position={[0, -0.14, -0.14]} material={steel}>
          <boxGeometry args={[0.05, 0.2, 0.07]} />
        </mesh>
        <mesh position={[0, -0.1, 0.05]} rotation={[0.3, 0, 0]} material={grip}>
          <boxGeometry args={[0.06, 0.15, 0.07]} />
        </mesh>
      </group>
      <group ref={setRef('rifle')}>
        <mesh position={[0, 0.03, -0.45]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel}>
          <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
        </mesh>
        <mesh position={[0, 0.0, -0.1]} material={wood}>
          <boxGeometry args={[0.07, 0.1, 0.5]} />
        </mesh>
        <mesh position={[0, -0.03, 0.2]} rotation={[0.12, 0, 0]} material={wood}>
          <boxGeometry args={[0.08, 0.14, 0.34]} />
        </mesh>
        <mesh position={[0, 0.1, -0.2]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
        </mesh>
      </group>
      <group ref={setRef('crossbow')}>
        <mesh position={[0, 0.0, -0.1]} material={wood}>
          <boxGeometry args={[0.06, 0.07, 0.6]} />
        </mesh>
        <mesh position={[0, 0.02, -0.36]} material={darkSteel}>
          <boxGeometry args={[0.62, 0.025, 0.04]} />
        </mesh>
        <mesh position={[0, 0.045, -0.2]} material={steel}>
          <boxGeometry args={[0.012, 0.012, 0.5]} />
        </mesh>
        <mesh position={[0, -0.08, 0.12]} rotation={[0.3, 0, 0]} material={grip}>
          <boxGeometry args={[0.06, 0.14, 0.07]} />
        </mesh>
      </group>
      <group ref={setRef('bomber')}>
        <mesh position={[0, 0.02, -0.4]} rotation={[Math.PI / 2, 0, 0]} material={darkSteel}>
          <cylinderGeometry args={[0.075, 0.09, 0.95, 14]} />
        </mesh>
        <mesh position={[0, 0.02, -0.9]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.095, 0.075, 0.12, 14]} />
        </mesh>
        <mesh position={[0, 0.02, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.11, 0.11, 0.1, 14]} />
        </mesh>
        <mesh position={[0, -0.12, -0.2]} rotation={[0.25, 0, 0]} material={grip}>
          <boxGeometry args={[0.06, 0.2, 0.07]} />
        </mesh>
        <mesh position={[0, 0.14, -0.35]} material={taserBody}>
          <boxGeometry args={[0.03, 0.05, 0.3]} />
        </mesh>
      </group>
      <group ref={setRef('taser')}>
        <mesh position={[0, 0, -0.12]} material={taserBody}>
          <boxGeometry args={[0.09, 0.1, 0.3]} />
        </mesh>
        <mesh position={[0, -0.1, -0.02]} rotation={[0.2, 0, 0]} material={grip}>
          <boxGeometry args={[0.07, 0.16, 0.08]} />
        </mesh>
        <mesh position={[0, 0.02, -0.3]} material={steel}>
          <boxGeometry args={[0.04, 0.04, 0.1]} />
        </mesh>
      </group>
      <mesh ref={flash} material={flashMaterial} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={bolt} material={boltMaterial} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </group>
  );
}

const MAX_TRACERS = 24;

/** Bullet streaks: a pool of line segments updated from the combat system. */
function Tracers() {
  const lines = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    return mesh;
  }, []);
  const colour = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const list = combat.tracers;
    const n = Math.min(list.length, MAX_TRACERS);
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const t = list[i];
      pos.setXYZ(i * 2, t.x0, t.y0, t.z0);
      pos.setXYZ(i * 2 + 1, t.x1, t.y1, t.z1);
      colour.setHex(t.colour);
      col.setXYZ(i * 2, colour.r, colour.g, colour.b);
      col.setXYZ(i * 2 + 1, colour.r * 0.3, colour.g * 0.3, colour.b * 0.3);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    lines.geometry.setDrawRange(0, n * 2);
    lines.visible = n > 0;
  });

  return <primitive object={lines} />;
}

/**
 * Walk-mode fighting: reads the keyboard, mouse and touch buttons, aims along the camera,
 * and shows the weapon in hand and its tracer fire.
 */
export function CombatController() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const attackHeld = useRef(false);
  const crouchKey = useRef(false);
  const dir = useMemo(() => new THREE.Vector3(), []);

  // The camera has to be part of the scene for things attached to it (the weapon) to draw.
  useEffect(() => {
    scene.add(camera);
    return () => {
      scene.remove(camera);
    };
  }, [scene, camera]);

  useEffect(() => {
    const typing = (e: Event) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || useGameStore.getState().mode !== 'roam') return;
      const digit = /^Digit([0-9])$/.exec(e.code);
      if (digit) combat.selectWeapon(WEAPON_ORDER[(Number(digit[1]) + 9) % 10]);
      if (e.code === 'KeyC' || e.code === 'ControlLeft') crouchKey.current = true;
      if (e.code === 'KeyE' && !e.repeat) {
        if (vehicle.active) vehicle.exit();
        else if (!combat.player.alive || !vehicle.tryEnter(viewState.x, viewState.z)) combat.interact();
      }
      if (e.code === 'KeyL' && !e.repeat) combat.player.flashlight = !combat.player.flashlight;
      if (e.code === 'KeyQ' && !e.repeat) combat.cycleWeapon(1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyC' || e.code === 'ControlLeft') crouchKey.current = false;
    };
    const onDown = (e: MouseEvent) => {
      // Only count clicks once the pointer is locked: the click that locks it is not an attack.
      if (e.button === 0 && document.pointerLockElement) attackHeld.current = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) attackHeld.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement && useGameStore.getState().mode === 'roam') combat.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  useFrame(() => {
    if (useGameStore.getState().mode !== 'roam') {
      attackHeld.current = false;
      return;
    }
    // Menus and end screens need the mouse back.
    if ((combat.run.intro || combat.run.outcome !== 'none' || !combat.player.alive) && document.pointerLockElement) document.exitPointerLock();
    camera.getWorldDirection(dir);
    combat.aim = { x: camera.position.x, y: camera.position.y, z: camera.position.z, dx: dir.x, dy: dir.y, dz: dir.z };
    combat.setCrouch(crouchKey.current || virtualInput.crouch);
    if ((attackHeld.current || virtualInput.attack) && (combat.active || combat.arms)) combat.attack();
  });

  return (
    <>
      {createPortal(<Viewmodel />, camera)}
      <Tracers />
    </>
  );
}
