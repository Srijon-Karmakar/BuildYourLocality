import { DynamicDrawUsage, type InstancedMesh } from 'three';

/** Upload only the live prefix, rather than every slot in a maximum-capacity instance pool. */
export function uploadInstances(mesh: InstancedMesh, colors = true) {
  if (mesh.count === 0) return;
  const matrix = mesh.instanceMatrix;
  matrix.setUsage(DynamicDrawUsage);
  matrix.clearUpdateRanges();
  matrix.addUpdateRange(0, mesh.count * matrix.itemSize);
  matrix.needsUpdate = true;
  if (colors && mesh.instanceColor) {
    const color = mesh.instanceColor;
    color.setUsage(DynamicDrawUsage);
    color.clearUpdateRanges();
    color.addUpdateRange(0, mesh.count * color.itemSize);
    color.needsUpdate = true;
  }
}
