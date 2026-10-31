import * as THREE from 'three';

export const slabMaterial = new THREE.MeshStandardMaterial({ color: '#a3a69c', roughness: 0.95 });
export const plinthMaterial = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.85 });
export const metalMaterial = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.45, metalness: 0.7 });
export const darkMetalMaterial = new THREE.MeshStandardMaterial({ color: '#2b2f35', roughness: 0.5, metalness: 0.6 });
export const glassMaterial = new THREE.MeshStandardMaterial({
  color: '#9ccbe6',
  roughness: 0.06,
  metalness: 0.2,
  transparent: true,
  opacity: 0.55,
});
export const glassDoorMaterial = new THREE.MeshStandardMaterial({ color: '#7fb6d6', roughness: 0.08, metalness: 0.3 });

const solidCache = new Map<string, THREE.MeshStandardMaterial>();

/** Plain painted material, cached per colour so recolouring doesn't pile up materials. */
export function solidMaterial(color: string, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}`;
  let material = solidCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    solidCache.set(key, material);
  }
  return material;
}
