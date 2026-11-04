import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { heightAt } from '../terrain/terrain';
import { incidents } from './incidents';
import { sim } from './simulation';

const MAX_FLAMES = 40;
const MAX_SMOKE = 56;
const PUFFS = 6;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _hot = new THREE.Color('#ff7a1a');
const _bright = new THREE.Color('#ffd23f');
const _dark = new THREE.Color('#3a3a3d');
const _pale = new THREE.Color('#9a9a9e');

/** Flames on burning buildings and smoke rising from them and from crashed cars, as two instanced meshes. */
export function IncidentLayer() {
  const flames = useRef<THREE.InstancedMesh>(null);
  const smoke = useRef<THREE.InstancedMesh>(null);
  const flameGeometry = useMemo(() => new THREE.ConeGeometry(0.55, 1.5, 6).translate(0, 0.75, 0), []);
  const smokeGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);

  useFrame(() => {
    const f = flames.current;
    const sm = smoke.current;
    if (!f || !sm) return;
    const t = sim.time;
    let nf = 0;
    let ns = 0;
    for (const inc of incidents.list) {
      if (inc.status === 'resolved') continue;
      const ground = Math.max(0, heightAt(inc.x, inc.z));
      if (inc.kind === 'fire' && inc.intensity > 0.03) {
        for (const fl of inc.flames) {
          if (nf >= MAX_FLAMES) break;
          const flicker = 0.8 + 0.3 * Math.sin(t * 9 + fl.phase) + 0.1 * Math.sin(t * 17 + fl.phase * 2);
          const k = fl.size * inc.intensity * flicker;
          _q.setFromAxisAngle(_p.set(0, 1, 0), t * 1.5 + fl.phase);
          f.setMatrixAt(nf, _m.compose(_p.set(fl.x, ground + fl.y, fl.z), _q, _s.set(k, k * (1 + 0.25 * Math.sin(t * 12 + fl.phase)), k)));
          f.setColorAt(nf, _c.copy(_hot).lerp(_bright, 0.5 + 0.5 * Math.sin(t * 7 + fl.phase)));
          nf++;
        }
        for (let src = 0; src < 2; src++) {
          const strength = Math.min(1, inc.intensity + 0.2);
          for (let k = 0; k < PUFFS && ns < MAX_SMOKE; k++) {
            const u = (t * 0.3 + k / PUFFS + src * 0.5) % 1;
            const size = (0.9 + u * 3.4) * strength * (1 + inc.height * 0.03);
            sm.setMatrixAt(ns, _m.compose(_p.set(inc.x + (src - 0.5) * 3 + u * 4, ground + inc.height + u * 12, inc.z + (k % 2) * 1.5 + u * 2), _q.identity(), _s.setScalar(size)));
            sm.setColorAt(ns, _c.copy(_dark).lerp(_pale, u));
            ns++;
          }
        }
      } else if (inc.kind === 'accident') {
        for (const w of inc.wrecks) {
          if (w.wreck <= 0) continue;
          for (let k = 0; k < 3 && ns < MAX_SMOKE; k++) {
            const u = (t * 0.35 + k / 3 + w.id * 0.37) % 1;
            sm.setMatrixAt(ns, _m.compose(_p.set(w.x + u * 1.5, Math.max(0, heightAt(w.x, w.z)) + 1.2 + u * 5, w.z), _q.identity(), _s.setScalar(0.5 + u * 1.6)));
            sm.setColorAt(ns, _c.copy(_dark).lerp(_pale, u));
            ns++;
          }
        }
      }
    }
    f.count = nf;
    sm.count = ns;
    f.instanceMatrix.needsUpdate = sm.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={flames} args={[flameGeometry, undefined, MAX_FLAMES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={smoke} args={[smokeGeometry, undefined, MAX_SMOKE]} frustumCulled={false} renderOrder={5}>
        <meshBasicMaterial transparent opacity={0.3} depthWrite={false} />
      </instancedMesh>
    </>
  );
}
