import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useTerrainStore } from '../terrain/terrain';
import type { Piece } from '../state/useCityStore';
import { CELL } from './catalog';
import { registerNightEmissive, registerWet } from './nightLights';
import { buildSpan } from './spanGeometry';
import { resolveSpan, type SpanSpec } from './spans';

const spanMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.08 });
registerWet(spanMaterial);
const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffd9a0', emissiveIntensity: 0 });
registerNightEmissive(lampMaterial, 1.8);
const highlightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

/** The bridge as seen from its anchor cell's centre. Rebuilt when the design or the ground under it changes. */
function useBuilt(spec: Partial<SpanSpec> | undefined, gx: number, gz: number) {
  const cells = useTerrainStore((s) => s.cells);
  const resolved = resolveSpan(spec);
  const key = JSON.stringify(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildSpan(resolved, (gx + 0.5) * CELL, (gz + 0.5) * CELL), [key, gx, gz, cells]);
}

/** A bridge without anything solid about it: for the placement ghost. The group it sits in is at the anchor cell's centre. */
export function SpanModel({ spec, gx, gz }: { spec: Partial<SpanSpec> | undefined; gx: number; gz: number }) {
  const built = useBuilt(spec, gx, gz);
  return (
    <>
      <mesh geometry={built.geometry} material={spanMaterial} castShadow receiveShadow />
      {built.lamps && <mesh geometry={built.lamps} material={lampMaterial} />}
    </>
  );
}

/** A placed bridge: the model, plus a solid deck and edge walls for the walking player. */
export function SpanView({ piece }: { piece: Piece }) {
  const built = useBuilt(piece.span, piece.gx, piece.gz);
  return (
    <RigidBody key={built.geometry.uuid} type="fixed" position={[(piece.gx + 0.5) * CELL, 0, (piece.gz + 0.5) * CELL]}>
      <TrimeshCollider args={[built.collider.vertices, built.collider.indices]} />
      <mesh geometry={built.geometry} material={spanMaterial} castShadow receiveShadow />
      {built.lamps && <mesh geometry={built.lamps} material={lampMaterial} />}
    </RigidBody>
  );
}

/** A translucent skin over a bridge, to show which one a tool would act on. */
export function SpanHighlight({ piece, color, opacity }: { piece: Piece; color: string; opacity: number }) {
  const built = useBuilt(piece.span, piece.gx, piece.gz);
  const material = useMemo(() => {
    const m = highlightMaterial.clone();
    m.color.set(color);
    m.opacity = opacity + 0.1;
    return m;
  }, [color, opacity]);
  return <mesh geometry={built.geometry} material={material} position={[(piece.gx + 0.5) * CELL, 0.05, (piece.gz + 0.5) * CELL]} scale={[1, 1.01, 1]} />;
}
