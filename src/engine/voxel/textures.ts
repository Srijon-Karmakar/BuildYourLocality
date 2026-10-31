import * as THREE from 'three';
import type { GraphicsSettings } from '../../state/useGameStore';

/** Tiles in the procedural atlas, laid out left to right in one row. */
export const TILE = { grassTop: 0, grassSide: 1, dirt: 2, stone: 3 } as const;
export const TILE_COUNT = 4;

type Quality = GraphicsSettings['textureQuality'];
const TILE_SIZE: Record<Quality, number> = { low: 32, medium: 64, high: 128 };

// --- Tileable noise -------------------------------------------------------------
// Everything wraps at the tile edge so neighbouring blocks repeat the tile seamlessly.

export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Value noise on a px x py lattice over u,v in [0,1), wrapping at the edges. */
export function tileNoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(wrap(x0, px), wrap(y0, py), seed);
  const b = hash2(wrap(x0 + 1, px), wrap(y0, py), seed);
  const c = hash2(wrap(x0, px), wrap(y0 + 1, py), seed);
  const d = hash2(wrap(x0 + 1, px), wrap(y0 + 1, py), seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

export function fbm(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += tileNoise(u, v, p, p, seed + i * 17) * amp;
    total += amp;
    amp /= 2;
    p *= 2;
  }
  return sum / total;
}

// --- Per-material painters ------------------------------------------------------
// Each returns a colour (0-255 rgb) and a height (0-1) used for the normal map.

type Sample = { rgb: [number, number, number]; height: number };

export function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function grass(u: number, v: number): Sample {
  const blades = tileNoise(u, v, 28, 5, 5); // thin vertical streaks
  const h = fbm(u, v, 4, 4, 1) * 0.55 + blades * 0.45;
  const patch = tileNoise(u, v, 3, 3, 9); // large light/dark patches
  const rgb = mix([46, 92, 34], [128, 176, 74], h * 0.7 + patch * 0.3);
  return { rgb, height: h };
}

function dirt(u: number, v: number): Sample {
  const h = fbm(u, v, 6, 4, 2);
  const pebble = smooth(0.78, 0.9, tileNoise(u, v, 14, 14, 7));
  const base = mix([74, 49, 31], [124, 88, 56], h);
  const rgb = mix(base, [128, 116, 104], pebble * 0.7);
  return { rgb, height: Math.min(1, h * 0.7 + pebble * 0.5) };
}

function stone(u: number, v: number): Sample {
  const h = fbm(u, v, 3, 5, 3);
  const ridge = 1 - Math.abs(2 * tileNoise(u, v, 5, 5, 13) - 1); // ridged noise: 1 along cracks
  const crack = smooth(0.9, 0.98, ridge);
  const base = mix([104, 104, 108], [158, 156, 152], h);
  const rgb = mix(base, [48, 48, 52], crack * 0.8);
  return { rgb, height: Math.max(0, h * 0.8 - crack * 0.5 + 0.2) };
}

function grassSide(u: number, v: number): Sample {
  // v = 1 is the top edge of the block: a ragged grass fringe over dirt.
  const edge = 0.72 + 0.14 * tileNoise(u, 0, 10, 1, 11);
  return v > edge ? grass(u, v) : dirt(u, v);
}

export const PAINTERS = [grass, grassSide, dirt, stone] as const;

// --- Atlas + material -----------------------------------------------------------

function buildAtlas(size: number): { colorMap: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const width = size * TILE_COUNT;
  const color = new ImageData(width, size);
  const normal = new ImageData(width, size);

  for (let t = 0; t < TILE_COUNT; t++) {
    const heights = new Float32Array(size * size);
    const rgbs: [number, number, number][] = new Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // canvas y runs downward; v = 1 is the tile's top.
        const s = PAINTERS[t](x / size, 1 - y / size);
        heights[y * size + x] = s.height;
        rgbs[y * size + x] = s.rgb;
      }
    }
    const strength = 2.2 * (size / 32);
    const h = (x: number, y: number) => heights[wrap(y, size) * size + wrap(x, size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = ((y * width) + t * size + x) * 4;
        const [r, g, b] = rgbs[y * size + x];
        color.data.set([r, g, b, 255], i);

        const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
        const dy = (h(x, y - 1) - h(x, y + 1)) * strength; // +Y is up in tangent space
        const len = Math.hypot(dx, dy, 1);
        normal.data.set(
          [(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255, 255],
          i,
        );
      }
    }
  }

  const toTexture = (data: ImageData, srgb: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    return tex;
  };
  return { colorMap: toTexture(color, true), normalMap: toTexture(normal, false) };
}

const materialCache = new Map<Quality, THREE.MeshStandardMaterial>();

/** Shared terrain material for a texture-quality level (built once, then cached). */
export function getVoxelMaterial(quality: Quality): THREE.MeshStandardMaterial {
  let material = materialCache.get(quality);
  if (!material) {
    const { colorMap, normalMap } = buildAtlas(TILE_SIZE[quality]);
    material = new THREE.MeshStandardMaterial({
      map: colorMap,
      normalMap,
      normalScale: new THREE.Vector2(1, 1),
      vertexColors: true, // baked ambient occlusion + per-block brightness variation
      roughness: 0.95,
      metalness: 0,
    });
    materialCache.set(quality, material);
  }
  return material;
}
