import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CELL, PIECES, resolveStyle, rotatedFootprint } from '../../city/catalog';
import { PieceModel, RoadModel } from '../../city/models';
import { generateBlock, type BlockConfig } from '../../lib/blockGen';

/** Makes everything under `root` see-through, so the preview reads as "not built yet". */
function fade(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const faded = (m: THREE.Material) => {
      if (m.userData.isGhost) return m;
      const c = m.clone();
      c.userData.isGhost = true;
      c.transparent = true;
      c.opacity = 0.72;
      c.depthWrite = false;
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(faded) : faded(mesh.material);
  });
}

/** The live 3D preview of the block that a click would stamp, hovering where the cursor is. */
export function BlockGhost({ config, hx, hz }: { config: BlockConfig; hx: number; hz: number }) {
  const ox = hx - Math.floor(config.w / 2);
  const oz = hz - Math.floor(config.d / 2);
  // Generated at the origin, then moved as one group, so moving the cursor never regenerates the block.
  const pieces = useMemo(() => generateBlock(config, 0, 0), [config]);
  const roads = useMemo(() => new Set(pieces.filter((p) => p.type === 'road').map((p) => `${p.gx},${p.gz}`)), [pieces]);
  const group = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (group.current) fade(group.current);
  }, [pieces]);

  const mask = (gx: number, gz: number) =>
    (roads.has(`${gx},${gz - 1}`) ? 1 : 0) | (roads.has(`${gx + 1},${gz}`) ? 2 : 0) | (roads.has(`${gx},${gz + 1}`) ? 4 : 0) | (roads.has(`${gx - 1},${gz}`) ? 8 : 0);

  return (
    <group ref={group} position={[ox * CELL, 0.03, oz * CELL]}>
      {pieces.map((p, i) => {
        const [fw, fd] = rotatedFootprint(PIECES[p.type], p.rot, p.lot);
        const position: [number, number, number] = [(p.gx + fw / 2) * CELL + (p.offset?.[0] ?? 0), 0, (p.gz + fd / 2) * CELL + (p.offset?.[1] ?? 0)];
        if (p.type === 'road') {
          return (
            <group key={i} position={position}>
              <RoadModel mask={mask(p.gx, p.gz)} road={p.road} />
            </group>
          );
        }
        return (
          <group key={i} position={position} rotation={[0, (p.rot * Math.PI) / 2, 0]}>
            <PieceModel
              type={p.type}
              facade={p.facade}
              roof={p.roof}
              style={resolveStyle(p.type, p)}
              accent={p.accent}
              scale={p.scale}
              tree={p.tree}
              rot={p.rot}
              gx={p.gx}
              gz={p.gz}
              seed={((i * 37) % 100) / 100}
            />
          </group>
        );
      })}
    </group>
  );
}
