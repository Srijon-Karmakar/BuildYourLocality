import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { disasters } from './disasters';
import { sim } from './simulation';

const SEGMENTS = 7;
const MAX_FUNNELS = 2;

/** The tornado's funnel: a stack of dark, translucent rings that widen upwards and spin at different speeds. */
export function DisasterLayer() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 0.6, 1, 18, 1, true), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#5b6068', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }), []);

  useFrame(() => {
    const funnels = disasters.tornadoes;
    for (let i = 0; i < MAX_FUNNELS; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const t = funnels[i];
      g.visible = !!t;
      if (!t) continue;
      g.position.set(t.x, Math.max(0, heightAt(t.x, t.z)), t.z);
      // Grows in over the first few seconds and shrinks away at the end.
      const life = Math.min(1, t.age / 3, (t.duration - t.age) / 3);
      g.scale.setScalar(Math.max(0.01, life));
      g.children.forEach((child, k) => {
        child.rotation.y = sim.time * (2.4 + k * 0.5);
        child.position.x = Math.sin(sim.time * 1.7 + k) * 0.8 * (k / SEGMENTS);
      });
    }
  });

  return (
    <>
      {Array.from({ length: MAX_FUNNELS }, (_, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)} visible={false}>
          {Array.from({ length: SEGMENTS }, (_, k) => (
            <mesh key={k} geometry={geometry} material={material} position={[0, 4 + k * 7, 0]} scale={[4 + k * 2.6, 7.2, 4 + k * 2.6]} frustumCulled={false} />
          ))}
        </group>
      ))}
    </>
  );
}
