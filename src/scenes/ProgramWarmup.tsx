import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getFacadeMaterial, getRoofMaterial } from '../city/cityTextures';
import { useGameStore } from '../state/useGameStore';

/**
 * Shader programs are compiled the first time a kind of material is drawn, which stalls the game
 * for a moment on a phone. Building materials come in only a handful of kinds (with or without
 * window glow, with or without sky reflections ...), so one tiny mesh of each is drawn far below
 * the ground a little after start-up, one at a time, and picking any texture later is smooth.
 */
export function ProgramWarmup() {
  const quality = useGameStore((s) => s.graphics.textureQuality);
  const [shown, setShown] = useState(0);

  const materials = useMemo<THREE.Material[]>(
    () => [
      getFacadeMaterial('brick', 'punched', '#ffffff', quality), // plain wall with lit windows
      getFacadeMaterial('brick', 'none', '#ffffff', quality), // plain wall, no glass
      getFacadeMaterial('ceramic', 'punched', '#ffffff', quality), // glossy wall with lit windows
      getFacadeMaterial('metal', 'none', '#ffffff', quality), // glossy wall, no glass
      getFacadeMaterial('mirror', 'none', '#ffffff', quality), // curtain wall
      getRoofMaterial('slate', quality),
      getRoofMaterial('copper', quality), // roof with sky reflections
    ],
    [quality],
  );

  useEffect(() => {
    if (shown >= materials.length) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 4000 : 700);
    return () => window.clearTimeout(t);
  }, [shown, materials.length]);

  return (
    <group position={[0, -3000, 0]}>
      {materials.slice(0, shown).map((material, i) => (
        // Far outside the camera's range, but never culled, so the renderer still sets the program up.
        <mesh key={i} material={material} frustumCulled={false}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
        </mesh>
      ))}
    </group>
  );
}
