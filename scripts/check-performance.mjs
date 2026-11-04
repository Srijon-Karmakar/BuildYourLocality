import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { rolldown } from 'rolldown';
import * as THREE from 'three';

// Use the installed bundler to run real TS modules, without adding a test runtime dependency.
const entry = [
  ['src/engine/renderBudget.ts', ['RenderBudget']],
  ['src/engine/instanceUploads.ts', ['uploadInstances']],
  ['src/engine/builder/batching.ts', ['mergeMeshes', 'fingerprint']],
  ['src/sim/pathfinding.ts', ['findPath']],
  ['src/sim/world.ts', ['emptyWorld', 'isWalkable', 'DIRS']],
].map(([file, names]) => `export { ${names.join(', ')} } from ${JSON.stringify(resolve(file))};`).join('\n');
const bundle = await rolldown({
  input: 'performance-check-entry',
  external: [/^three(?:\/|$)/, /^react(?:\/|$)/, /^zustand(?:\/|$)/],
  plugins: [{
    name: 'performance-check-entry',
    resolveId: id => id === 'performance-check-entry' ? '\0performance-check-entry' : null,
    load: id => id === '\0performance-check-entry' ? entry : null,
  }],
});
const { output } = await bundle.generate({ format: 'es' });
await bundle.close();
const generated = resolve('node_modules/.tmp/apnagali-performance-check.mjs');
await mkdir(resolve('node_modules/.tmp'), { recursive: true });
await writeFile(generated, output[0].code);
const { RenderBudget, uploadInstances, mergeMeshes, fingerprint, findPath, emptyWorld, isWalkable, DIRS } = await import(pathToFileURL(generated));

function frames(budget, fps, seconds) {
  for (let i = 0; i < fps * seconds; i++) budget.sample(1 / fps);
}

const budget = new RenderBudget(0.65, 0.85);
frames(budget, 60, 10);
assert.equal(budget.dpr, 0.85);
frames(budget, 24, 12);
assert.equal(budget.dpr, 0.65);
frames(budget, 60, 30);
assert.equal(budget.dpr, 0.85);
// Continue adapting after repeated thermal/load changes, beyond the old four-change limit.
for (let i = 0; i < 8; i++) {
  frames(budget, 24, 12);
  assert.equal(budget.dpr, 0.65);
  frames(budget, 60, 30);
  assert.equal(budget.dpr, 0.85);
}
budget.sample(3);
frames(budget, 60, 4);
assert.equal(budget.dpr, 0.85, 'tab restoration must not reduce resolution');
frames(budget, 40, 0.5);
frames(budget, 60, 5);
assert.equal(budget.dpr, 0.85, 'short spikes must not trigger a resize');
frames(budget, 3, 12);
assert.equal(budget.dpr, 0.65, 'sustained frames over 250 ms must still scale down');
console.log('PASS: sustained load, recovery, repeated adaptation, transient stalls');

const instance = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1000);
instance.setColorAt(0, new THREE.Color('red'));
instance.count = 3;
uploadInstances(instance);
assert.deepEqual(instance.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
assert.deepEqual(instance.instanceColor.updateRanges, [{ start: 0, count: 9 }]);
assert.equal(instance.instanceMatrix.usage, THREE.DynamicDrawUsage);
instance.count = 0;
const version = instance.instanceMatrix.version;
uploadInstances(instance);
assert.equal(instance.instanceMatrix.version, version, 'empty pools must not upload');
console.log('PASS: instance uploads scale with live count, empty pools skip uploads');

// Compare every rendered triangle's attributes against the pre-batching geometry.
function expanded(geometry, matrix) {
  const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  copy.applyMatrix4(matrix);
  return copy;
}
const paint = new THREE.MeshStandardMaterial();
const root = new THREE.Group();
root.position.set(3, 2, -5);
const sphere = new THREE.Mesh(new THREE.SphereGeometry(2, 24, 16), paint);
sphere.scale.set(-2, 1, 1);
const box = new THREE.Mesh(new THREE.BoxGeometry().toNonIndexed(), paint);
box.position.set(8, 0, 0);
root.add(sphere, box);
root.updateWorldMatrix(true, true);
const expected = [sphere, box].map(mesh => expanded(mesh.geometry, mesh.matrixWorld));
// Restore winding on the mirrored reference, as the original non-indexed batcher did.
for (const attribute of Object.values(expected[0].attributes)) {
  for (let i = 0; i < attribute.count; i += 3) {
    for (let k = 0; k < attribute.itemSize; k++) {
      const a = (i + 1) * attribute.itemSize + k;
      const b = (i + 2) * attribute.itemSize + k;
      [attribute.array[a], attribute.array[b]] = [attribute.array[b], attribute.array[a]];
    }
  }
}
const merged = mergeMeshes([root]);
assert.equal(merged.length, 1);
const actual = merged[0].geometry.toNonIndexed();
for (const name of ['position', 'normal', 'uv']) {
  const values = expected.flatMap(g => Array.from(g.getAttribute(name).array));
  assert.deepEqual(Array.from(actual.getAttribute(name).array), values, `${name} must be visually identical`);
}
const bytes = g => Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (g.index?.array.byteLength ?? 0);
const oldBytes = expected.reduce((n, g) => n + bytes(g), 0);
const newBytes = bytes(merged[0].geometry);
assert.ok(newBytes < oldBytes * 0.5);
console.log(`PASS: identical triangles/normals/UVs; fixture geometry memory ${oldBytes} -> ${newBytes} bytes (${Math.round((1 - newBytes / oldBytes) * 100)}% less)`);

const multi = new THREE.Mesh(new THREE.BoxGeometry(), Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial()));
assert.equal(mergeMeshes([multi]).reduce((n, m) => n + m.geometry.index.count, 0), 36);
const withoutNormals = new THREE.SphereGeometry(1, 8, 6);
withoutNormals.deleteAttribute('normal');
const flatReference = withoutNormals.toNonIndexed();
flatReference.computeVertexNormals();
const flatBatch = mergeMeshes([new THREE.Mesh(withoutNormals, paint)])[0].geometry.toNonIndexed();
assert.deepEqual(flatBatch.getAttribute('normal').array, flatReference.getAttribute('normal').array);
const colored = new THREE.InstancedMesh(new THREE.BoxGeometry(), paint, 2);
colored.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 2, 3));
colored.setColorAt(0, new THREE.Color('red'));
colored.count = 1;
const copy = mergeMeshes([colored])[0];
assert.ok(copy.isInstancedMesh);
assert.equal(copy.count, 1);
assert.deepEqual(copy.instanceMatrix.array, colored.instanceMatrix.array);
assert.deepEqual(copy.instanceColor.array, colored.instanceColor.array);
const before = fingerprint(colored);
colored.instanceMatrix.needsUpdate = true;
assert.notEqual(fingerprint(colored), before);
console.log('PASS: multi-material faces and colored instance transforms remain intact');

// Original array-based A*: independent reference preserves route choices, costs and search limit.
function referencePath(world, start, goal) {
  if (start[0] === goal[0] && start[1] === goal[1]) return [start];
  if (!isWalkable(world, ...goal)) return null;
  const key = (x, z) => `${x},${z}`;
  const h = (x, z) => Math.abs(x - goal[0]) + Math.abs(z - goal[1]);
  const step = k => world.roads.has(k) ? world.crossings.has(k) ? 1 : world.roadInfo.get(k)?.crosswalk ? 1.4 : 6
    : world.rails.has(k) ? 5 : world.wideCells.has(k) ? 2.2 : world.pleasant.has(k) ? 0.8 : 1.1;
  const startKey = key(...start), goalKey = key(...goal);
  const g = new Map([[startKey, 0]]), parent = new Map(), closed = new Set();
  const open = [{ key: startKey, gx: start[0], gz: start[1], f: h(...start) }];
  for (let n = 0; n < 900 && open.length; n++) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur.key === goalKey) {
      const path = [];
      for (let k = goalKey; k; k = parent.get(k)) path.push(k.split(',').map(Number));
      return path.reverse();
    }
    closed.add(cur.key);
    for (const { dx, dz } of DIRS) {
      const nx = cur.gx + dx, nz = cur.gz + dz, nk = key(nx, nz);
      if (closed.has(nk) || !isWalkable(world, nx, nz)) continue;
      const cost = g.get(cur.key) + step(nk);
      if (cost >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, cost);
      parent.set(nk, cur.key);
      const existing = open.find(o => o.key === nk);
      if (existing) existing.f = cost + h(nx, nz);
      else open.push({ key: nk, gx: nx, gz: nz, f: cost + h(nx, nz) });
    }
  }
  return null;
}
let seed = 712363;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const fixtures = [];
for (let i = 0; i < 160; i++) {
  const world = emptyWorld();
  world.bounds = { minX: -16, minZ: -16, maxX: 16, maxZ: 16 };
  for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++) {
    const k = `${x},${z}`, v = random();
    if (v < 0.17) world.blocked.add(k);
    else if (v < 0.32) { world.roads.set(k, 15); if (v < 0.22) world.crossings.add(k); }
    else if (v < 0.4) world.rails.set(k, 15);
    else if (v < 0.5) world.wideCells.add(k);
    else if (v < 0.7) world.pleasant.add(k);
  }
  const start = [-15, -15], goal = [15, 15];
  world.blocked.delete(start.join(','));
  world.blocked.delete(goal.join(','));
  assert.deepEqual(findPath(world, start, goal), referencePath(world, start, goal), `route fixture ${i}`);
  fixtures.push([world, start, goal]);
}
const world = emptyWorld();
assert.deepEqual(findPath(world, [0, 0], [0, 0]), [[0, 0]]);
assert.equal(findPath(world, [0, 0], [1, 1]), null);
for (let i = 0; i < 2; i++) for (const args of fixtures) { referencePath(...args); findPath(...args); }
const measure = fn => {
  const start = performance.now();
  for (let i = 0; i < 3; i++) for (const args of fixtures) fn(...args);
  return performance.now() - start;
};
const oldMs = measure(referencePath), newMs = measure(findPath);
console.log(`PASS: 160 seeded weighted/blocked route fixtures match exactly; 480 queries: array ${oldMs.toFixed(1)} ms, heap ${newMs.toFixed(1)} ms`);
console.log('All performance regression checks passed. Timing is a local CPU microbenchmark, not a mobile FPS measurement.');
