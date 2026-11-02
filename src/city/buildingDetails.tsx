import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLOOR_H, type BlockBox, type CornerStyle, type CorniceStyle } from './catalog';
import { LOT_HEIGHT } from './geometries';
import { solidMaterial } from './materials';

/**
 * Architectural detailing drawn on the outside of a block: the moulding under the roof, trim
 * bands at the floor lines, and quoin stones or pilasters up the corners. All of it is trim
 * coloured; the block's own box is in the lot frame, so this sits in the same group as the walls.
 */

interface DetailProps {
  box: BlockBox;
  floors: number;
  trim: string;
  cornice: CorniceStyle;
  corners: CornerStyle;
  bands: boolean;
}

/** Most trim bands drawn on one block, so a 200-storey tower does not get 200 slabs. */
const MAX_BANDS = 24;
/** Most quoin stones per corner. */
const MAX_QUOINS = 80;

export function BlockDetails({ box, floors, trim, cornice, corners, bands }: DetailProps) {
  const material = useMemo(() => solidMaterial(trim, 0.88), [trim]);
  const top = LOT_HEIGHT + box.h;

  const bandYs = useMemo(() => {
    if (!bands || floors < 2) return [];
    const step = Math.max(1, Math.ceil((floors - 1) / MAX_BANDS));
    const ys: number[] = [];
    for (let f = 1; f < floors; f += step) ys.push(LOT_HEIGHT + f * FLOOR_H);
    return ys;
  }, [bands, floors]);

  return (
    <group>
      {cornice === 'ledge' && (
        <mesh position={[0, top - 0.1, 0]} material={material} castShadow receiveShadow>
          <boxGeometry args={[box.w + 0.5, 0.22, box.d + 0.5]} />
        </mesh>
      )}
      {cornice === 'classic' && (
        <>
          <mesh position={[0, top - 0.08, 0]} material={material} castShadow receiveShadow>
            <boxGeometry args={[box.w + 0.8, 0.2, box.d + 0.8]} />
          </mesh>
          <mesh position={[0, top - 0.3, 0]} material={material} castShadow receiveShadow>
            <boxGeometry args={[box.w + 0.45, 0.26, box.d + 0.45]} />
          </mesh>
          <mesh position={[0, top - 0.55, 0]} material={material} castShadow receiveShadow>
            <boxGeometry args={[box.w + 0.2, 0.26, box.d + 0.2]} />
          </mesh>
        </>
      )}

      {bandYs.map((y) => (
        <mesh key={y} position={[0, y - 0.03, 0]} material={material} receiveShadow>
          <boxGeometry args={[box.w + 0.16, 0.2, box.d + 0.16]} />
        </mesh>
      ))}

      {corners === 'pilasters' &&
        [-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh
              key={`${sx},${sz}`}
              position={[sx * (box.w / 2 - 0.12), LOT_HEIGHT + (box.h - 0.2) / 2 + 0.1, sz * (box.d / 2 - 0.12)]}
              material={material}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.6, box.h - 0.2, 0.6]} />
            </mesh>
          )),
        )}
      {corners === 'quoins' && <Quoins box={box} floors={floors} material={material} />}
    </group>
  );
}

/** Alternating long and short corner stones, one instanced mesh for all four corners. */
function Quoins({ box, floors, material }: { box: BlockBox; floors: number; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const perCorner = Math.min(MAX_QUOINS, Math.max(2, floors * 2));
  const count = perCorner * 4;
  const segment = box.h / perCorner;

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const q = new THREE.Quaternion();
    let i = 0;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let k = 0; k < perCorner; k++) {
          // Even stones run long on the x wall, odd ones long on the z wall.
          const long = 0.95;
          const short = 0.5;
          const w = k % 2 === 0 ? long : short;
          const d = k % 2 === 0 ? short : long;
          p.set(sx * (box.w / 2 - w / 2 + 0.07), LOT_HEIGHT + segment * (k + 0.5), sz * (box.d / 2 - d / 2 + 0.07));
          s.set(w, segment - 0.06, d);
          mesh.current.setMatrixAt(i++, m.compose(p, q, s));
        }
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [box.w, box.d, segment, perCorner]);

  return (
    <instancedMesh key={count} ref={mesh} args={[undefined, undefined, count]} material={material} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}
