import * as THREE from 'three';
import { PAINTERS, fbm, hash2, lerp, mix, tileNoise, wrap } from '../engine/voxel/textures';
import type { GraphicsSettings } from '../state/useGameStore';
import type { FacadeId, RoofId, WindowStyle } from './catalog';
import { getLedMaterial } from './ledTextures';
import { enableNightWindows, registerReflection } from './nightLights';

type Quality = GraphicsSettings['textureQuality'];
type RGB = [number, number, number];

/** Texture pixels per design pixel: sharper bricks, seams and window frames at higher quality. */
const SCALE: Record<Quality, number> = { low: 1, medium: 2, high: 3 };

/** Converts a height field into a tangent-space normal map (wrapping at the edges). */
function heightsToNormals(heights: Float32Array, w: number, h: number, strength: number): ImageData {
  const out = new ImageData(w, h);
  const at = (x: number, y: number) => heights[wrap(y, h) * w + wrap(x, w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength; // +Y is up in tangent space
      const len = Math.hypot(dx, dy, 1);
      out.data.set(
        [(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255, 255],
        (y * w + x) * 4,
      );
    }
  }
  return out;
}

function grayscale(values: Float32Array, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  for (let i = 0; i < values.length; i++) {
    const v = Math.max(0, Math.min(255, values[i] * 255));
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

function toTexture(data: ImageData | HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  let canvas: HTMLCanvasElement;
  if (data instanceof ImageData) {
    canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext('2d')!.putImageData(data, 0, 0);
  } else {
    canvas = data;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, v));

// --- Ground --------------------------------------------------------------------

const GROUND_SIZE: Record<Quality, number> = { low: 64, medium: 128, high: 256 };
const groundCache = new Map<Quality, { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }>();

/** One tileable grass tile (the same painter the voxel terrain used). */
export function getGroundTextures(quality: Quality) {
  let tex = groundCache.get(quality);
  if (!tex) {
    const size = GROUND_SIZE[quality];
    const color = new ImageData(size, size);
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = PAINTERS[0](x / size, 1 - y / size);
        color.data.set([s.rgb[0], s.rgb[1], s.rgb[2], 255], (y * size + x) * 4);
        heights[y * size + x] = s.height;
      }
    }
    tex = {
      map: toTexture(color, true),
      normalMap: toTexture(heightsToNormals(heights, size, size, 2 * (size / 64)), false),
    };
    groundCache.set(quality, tex);
  }
  return tex;
}

let variationTexture: THREE.CanvasTexture | null = null;

/**
 * Large, soft light/dark blotches (period far bigger than the grass tile) that are
 * multiplied over the ground to break up the grass tile's visible repetition.
 */
export function getGroundVariationTexture(): THREE.CanvasTexture {
  if (!variationTexture) {
    const size = 256;
    const data = new ImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x / size, y / size, 4, 4, 77);
        const v = clamp255(255 * (0.7 + 0.45 * n));
        data.data.set([v, v * 0.99, v * 0.95, 255], (y * size + x) * 4);
      }
    }
    variationTexture = toTexture(data, true);
  }
  return variationTexture;
}

// --- Facades -------------------------------------------------------------------
// One module = 3 m wide x one storey (FLOOR_H) tall, tiled across a wall. Painters work
// in a 160 x 128 design space (3 : 2.4); the texture is rendered at SCALE x that.

const FW = 160;
const FH = 128;

interface WallSample {
  rgb: RGB;
  height: number;
  /** Surface roughness 0-1; defaults to the facade's base roughness. */
  rough?: number;
}

interface FacadePaint {
  wall: (x: number, y: number) => WallSample;
  windowFrame: string;
  /** Glass walls are all window, so they skip the punched-window pass. */
  curtain?: boolean;
  roughness: number;
  /** 0-1; mirror and metal cladding are mostly metallic. */
  metalness?: number;
  /** Reflects the sky environment strongly (mirror, glass, ceramic, metal). */
  reflective?: boolean;
}

/** Brick bond painter: running bond, per-brick tone, recessed mortar. */
function brickWall(brick: RGB, mortar: RGB, seed: number): FacadePaint['wall'] {
  return (x, y) => {
    const row = Math.floor(y / 8);
    const off = (row % 2) * 20;
    const bx = (x + off) % 40;
    const isMortar = y % 8 < 1.8 || bx < 1.8;
    const tone = 0.85 + 0.3 * hash2(row, Math.floor(((x + off) % FW) / 40), seed);
    const grain = fbm(x / FW, y / FH, 8, 3, seed + 3);
    if (isMortar) return { rgb: mortar, height: 0.15 };
    const shade = tone * (0.88 + grain * 0.24);
    return { rgb: [brick[0] * shade, brick[1] * shade, brick[2] * shade], height: 0.7 + grain * 0.2 };
  };
}

const FACADE_PAINT: Record<FacadeId, FacadePaint> = {
  brick: { wall: brickWall([164, 73, 47], [205, 195, 179], 5), windowFrame: '#f1ece2', roughness: 0.92 },
  darkbrick: { wall: brickWall([72, 64, 62], [118, 112, 106], 8), windowFrame: '#1d2329', roughness: 0.9 },
  concrete: {
    wall: (x, y) => {
      const n = fbm(x / FW, y / FH, 6, 4, 11);
      const stain = fbm(x / FW, y / FH, 3, 3, 12);
      const seam = x % 80 < 1.5 || y % 64 < 1.5;
      const tie = (x % 40 > 18 && x % 40 < 21) && (y % 32 > 14 && y % 32 < 17); // formwork tie holes
      const v = (seam ? 0.74 : tie ? 0.7 : 1) * (0.84 + n * 0.22) * (0.94 + stain * 0.1);
      return { rgb: [156 * v, 156 * v, 152 * v], height: seam || tie ? 0.1 : 0.6 + n * 0.3 };
    },
    windowFrame: '#2a333b',
    roughness: 0.93,
  },
  glass: {
    wall: (x, y) => {
      const mullion = x % 40 < 1.6 || y % 64 < 2;
      const spandrel = y % 64 > 50; // opaque panel hiding the floor slab
      const t = y / FH;
      const sky = mix([128, 178, 214], [40, 84, 120], t);
      const streak = 0.9 + 0.2 * tileNoise(x / FW, y / FH, 5, 3, 21);
      if (mullion) return { rgb: [30, 38, 46], height: 0.9, rough: 0.35 };
      if (spandrel) return { rgb: [52, 70, 84], height: 0.5, rough: 0.3 };
      return { rgb: [sky[0] * streak, sky[1] * streak, sky[2] * streak], height: 0.3, rough: 0.06 };
    },
    windowFrame: '#1f2a33',
    curtain: true,
    roughness: 0.06,
  },
  wood: {
    wall: (x, y) => {
      const row = Math.floor(y / 8);
      const gap = y % 8 < 1;
      const tone = 0.82 + 0.3 * hash2(row, 0, 9);
      const grain = tileNoise(x / FW, y / FH, 18, 40, 4);
      const knot = tileNoise(x / FW, y / FH, 5, 16, 6);
      const v = tone * (0.88 + grain * 0.2) * (knot > 0.82 ? 0.78 : 1);
      if (gap) return { rgb: [64, 42, 24], height: 0.1 };
      return { rgb: [154 * v, 107 * v, 63 * v], height: 0.7 + grain * 0.15 };
    },
    windowFrame: '#f4f1ea',
    roughness: 0.82,
  },
  plaster: {
    wall: (x, y) => {
      const n = fbm(x / FW, y / FH, 10, 3, 31);
      const v = 0.94 + n * 0.1;
      return { rgb: [238 * v, 230 * v, 214 * v], height: 0.5 + n * 0.3 };
    },
    windowFrame: '#3b3f44',
    roughness: 0.95,
  },
  sandstone: {
    wall: (x, y) => {
      const row = Math.floor(y / 16);
      const off = (row % 2) * 40;
      const bx = (x + off) % 80;
      const seam = y % 16 < 1.6 || bx < 1.6;
      const tone = 0.9 + 0.2 * hash2(row, Math.floor(((x + off) % FW) / 80), 14);
      const n = fbm(x / FW, y / FH, 8, 3, 15);
      if (seam) return { rgb: [140, 118, 88], height: 0.15 };
      return { rgb: [207 * tone, 174 * tone * (0.95 + n * 0.1), 127 * tone], height: 0.65 + n * 0.25 };
    },
    windowFrame: '#f1ece2',
    roughness: 0.92,
  },
  metal: {
    wall: (x, y) => {
      const seam = x % 20 < 1.2;
      const brushed = tileNoise(x / FW, y / FH, 3, 80, 41);
      const v = 0.88 + brushed * 0.24;
      if (seam) return { rgb: [86, 94, 102], height: 0.95, rough: 0.4 };
      return { rgb: [138 * v, 148 * v, 158 * v], height: 0.5, rough: 0.34 };
    },
    windowFrame: '#20262c',
    roughness: 0.34,
    metalness: 0.75,
    reflective: true,
  },
  mirror: {
    wall: (x, y) => {
      // Full mirror curtain wall: a faint sky-to-ground gradient per pane and hairline joints.
      const joint = x % 80 < 1.2 || y % 64 < 1.2;
      const t = (y % 64) / 64;
      const pane = mix([214, 226, 238], [150, 172, 196], t);
      const n = 0.96 + 0.06 * tileNoise(x / FW, y / FH, 4, 4, 51);
      if (joint) return { rgb: [40, 46, 54], height: 0.8, rough: 0.4 };
      return { rgb: [pane[0] * n, pane[1] * n, pane[2] * n], height: 0.4, rough: 0.02 };
    },
    windowFrame: '#20262c',
    curtain: true,
    roughness: 0.02,
    metalness: 0.95,
    reflective: true,
  },
  ceramic: {
    wall: (x, y) => {
      const joint = x % 80 < 1.5 || y % 64 < 1.5;
      const n = fbm(x / FW, y / FH, 5, 3, 61);
      const v = 0.96 + n * 0.06;
      if (joint) return { rgb: [150, 154, 158], height: 0.1, rough: 0.7 };
      return { rgb: [232 * v, 234 * v, 235 * v], height: 0.7, rough: 0.28 };
    },
    windowFrame: '#252a30',
    roughness: 0.3,
    reflective: true,
  },
  corten: {
    wall: (x, y) => {
      const seam = x % 40 < 1.4;
      const patina = fbm(x / FW, y / FH, 6, 4, 71);
      const streak = tileNoise(x / FW, y / FH, 40, 3, 72);
      const v = 0.75 + patina * 0.5;
      if (seam) return { rgb: [60, 34, 22], height: 0.1 };
      return { rgb: [140 * v * (0.9 + streak * 0.2), 76 * v, 42 * v], height: 0.5 + patina * 0.3 };
    },
    windowFrame: '#1e2226',
    roughness: 0.82,
  },
  slats: {
    wall: (x, y) => {
      const slat = Math.floor(x / 8);
      const gap = x % 8 < 2;
      const tone = 0.8 + 0.35 * hash2(slat, 0, 81);
      const grain = tileNoise(x / FW, y / FH, 6, 60, 82);
      const v = tone * (0.9 + grain * 0.2);
      if (gap) return { rgb: [34, 26, 20], height: 0.05 };
      return { rgb: [190 * v, 136 * v, 82 * v], height: 0.75 + grain * 0.1 };
    },
    windowFrame: '#1f1a16',
    roughness: 0.68,
  },
  stone: {
    wall: (x, y) => {
      const row = Math.floor(y / 32);
      const off = (row % 2) * 40;
      const bx = (x + off) % 80;
      const joint = y % 32 < 1.4 || bx < 1.4;
      const tone = 0.88 + 0.22 * hash2(row, Math.floor(((x + off) % FW) / 80), 91);
      const vein = Math.abs(2 * fbm(x / FW, y / FH, 5, 4, 92) - 1);
      const v = tone * (0.85 + 0.3 * vein);
      if (joint) return { rgb: [70, 72, 76], height: 0.1 };
      return { rgb: [138 * v, 141 * v, 146 * v], height: 0.6 + vein * 0.2, rough: 0.55 };
    },
    windowFrame: '#23282e',
    roughness: 0.6,
  },
  whitebrick: { wall: brickWall([226, 222, 214], [168, 164, 156], 21), windowFrame: '#2b3036', roughness: 0.9 },
  basketweave: {
    // 16 x 16 blocks, each two bricks laid flat or on end, alternating like a checkerboard.
    wall: (x, y) => {
      const bi = Math.floor(x / 16);
      const bj = Math.floor(y / 16);
      const bx = x % 16;
      const by = y % 16;
      const flat = (bi + bj) % 2 === 0;
      const seam = flat ? by % 8 < 1.4 || bx < 1.4 : bx % 8 < 1.4 || by < 1.4;
      const brickId = flat ? Math.floor(by / 8) : Math.floor(bx / 8);
      const tone = 0.84 + 0.3 * hash2(bi * 2 + brickId, bj, 23);
      const grain = fbm(x / FW, y / FH, 10, 3, 24);
      if (seam) return { rgb: [196, 186, 170], height: 0.12 };
      const v = tone * (0.9 + grain * 0.2);
      return { rgb: [168 * v, 85 * v, 59 * v], height: 0.7 + grain * 0.15 };
    },
    windowFrame: '#efe9dc',
    roughness: 0.9,
  },
  limestone: {
    // Ashlar courses: rows of 40 and 80 wide blocks, with fine pitting.
    wall: (x, y) => {
      const row = Math.floor(y / 16);
      const width = row % 2 === 0 ? 80 : 40;
      const off = (row % 2) * 20;
      const bx = (x + off) % width;
      const seam = y % 16 < 1.3 || bx < 1.3;
      const tone = 0.9 + 0.2 * hash2(row, Math.floor((x + off) / width), 33);
      const pit = fbm(x / FW, y / FH, 24, 2, 34);
      const n = fbm(x / FW, y / FH, 6, 3, 35);
      if (seam) return { rgb: [160, 148, 124], height: 0.12 };
      const v = tone * (0.9 + n * 0.16) * (pit > 0.72 ? 0.86 : 1);
      return { rgb: [228 * v, 214 * v, 184 * v], height: 0.62 + n * 0.2 };
    },
    windowFrame: '#3b3f44',
    roughness: 0.9,
  },
  stucco: {
    // Hand-trowelled render in a warm clay colour, with swirls and the odd patch.
    wall: (x, y) => {
      const swirl = fbm(x / FW, y / FH, 5, 4, 36);
      const grit = tileNoise(x / FW, y / FH, 48, 48, 37);
      const patch = fbm(x / FW, y / FH, 2, 3, 38);
      const v = (0.88 + swirl * 0.2) * (0.96 + grit * 0.08) * (0.94 + patch * 0.1);
      return { rgb: [218 * v, 152 * v, 108 * v], height: 0.4 + swirl * 0.35 + grit * 0.1 };
    },
    windowFrame: '#f3ece0',
    roughness: 0.97,
  },
  rammed: {
    // Layers of compacted earth in slightly different browns, with formwork joints.
    wall: (x, y) => {
      const layer = Math.floor(y / 6.4);
      const tone = 0.8 + 0.4 * hash2(layer, 0, 39);
      const strat = tileNoise(x / FW, y / FH, 3, 60, 40);
      const grit = fbm(x / FW, y / FH, 20, 2, 41);
      const edge = y % 6.4 < 0.7;
      const joint = x % 80 < 1.2;
      const v = tone * (0.88 + strat * 0.24) * (0.94 + grit * 0.12) * (edge ? 0.86 : 1) * (joint ? 0.74 : 1);
      return { rgb: [180 * v, 130 * v, 94 * v], height: edge || joint ? 0.25 : 0.55 + grit * 0.3 };
    },
    windowFrame: '#2a2420',
    roughness: 0.96,
  },
  shingle: {
    // Staggered cedar shingles, each a little lighter at the exposed tip.
    wall: (x, y) => {
      const row = Math.floor(y / 8);
      const off = (row % 2) * 10;
      const col = Math.floor(((x + off) % FW) / 20);
      const tone = 0.78 + 0.4 * hash2(row, col, 43);
      const along = y % 8;
      const edge = (x + off) % 20 < 1.1;
      const grain = tileNoise(x / FW, y / FH, 5, 70, 44);
      const shadow = along < 1.6 ? 0.55 : 0.85 + (along / 8) * 0.25;
      const v = tone * shadow * (0.9 + grain * 0.2) * (edge ? 0.7 : 1);
      return { rgb: [146 * v, 112 * v, 80 * v], height: 0.3 + (along / 8) * 0.6 };
    },
    windowFrame: '#f2efe8',
    roughness: 0.88,
  },
  marble: {
    // Polished slabs with grey veining.
    wall: (x, y) => {
      const joint = x % 80 < 1.1 || y % 64 < 1.1;
      const warp = fbm(x / FW, y / FH, 4, 3, 45);
      const vein = Math.abs(2 * fbm(x / FW + warp * 0.18, y / FH, 3, 5, 46) - 1);
      const line = vein < 0.018 ? 0.66 : vein < 0.05 ? 0.88 : 1;
      const v = (0.95 + warp * 0.07) * line;
      if (joint) return { rgb: [150, 150, 148], height: 0.15, rough: 0.6 };
      return { rgb: [238 * v, 238 * v, 234 * v], height: 0.7, rough: 0.16 };
    },
    windowFrame: '#2c3036',
    roughness: 0.2,
    reflective: true,
  },
  subway: {
    // Glazed subway tile: glossy teal bricks in a running bond over pale grout.
    wall: (x, y) => {
      const row = Math.floor(y / 8);
      const off = (row % 2) * 10;
      const bx = (x + off) % 20;
      const grout = y % 8 < 1.1 || bx < 1.1;
      const tone = 0.9 + 0.2 * hash2(row, Math.floor(((x + off) % FW) / 20), 47);
      const sheen = 0.94 + 0.1 * tileNoise(x / FW, y / FH, 4, 4, 48);
      if (grout) return { rgb: [196, 198, 194], height: 0.1, rough: 0.85 };
      return { rgb: [66 * tone * sheen, 154 * tone * sheen, 164 * tone * sheen], height: 0.7, rough: 0.14 };
    },
    windowFrame: '#f4f1ea',
    roughness: 0.2,
    reflective: true,
  },
  perforated: {
    // Anodised bronze panels punched with a grid of round holes over a dark backing.
    wall: (x, y) => {
      const cx = (x % 8) - 4;
      const cy = (y % 8) - 4;
      const hole = Math.hypot(cx, cy) < 2.3;
      const seam = x % 40 < 1.2 || y % 64 < 1.2;
      const brushed = tileNoise(x / FW, y / FH, 3, 60, 49);
      if (seam) return { rgb: [80, 62, 44], height: 0.9, rough: 0.5 };
      if (hole) return { rgb: [26, 28, 32], height: 0.05, rough: 0.9 };
      const v = 0.9 + brushed * 0.2;
      return { rgb: [172 * v, 138 * v, 96 * v], height: 0.6, rough: 0.38 };
    },
    windowFrame: '#2a2218',
    roughness: 0.4,
    metalness: 0.7,
    reflective: true,
  },
  // Rendered with the animated LED material instead (see getFacadeMaterial); this is
  // only the unlit panel pattern.
  led: {
    wall: (x, y) => {
      const grid = x % 20 < 1 || y % 16 < 1;
      return { rgb: grid ? [10, 12, 18] : [28, 32, 44], height: grid ? 0.2 : 0.7 };
    },
    windowFrame: '#0b0d12',
    curtain: true,
    roughness: 0.4,
  },
};

/** A rectangle painted in design space: colour plus the relief/roughness it should leave. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string | [string, string]; // flat colour, or [top, bottom] gradient
  height: number;
  rough: number;
  /** Outline: a plain rectangle unless set. An arch has a half-round top. */
  shape?: 'arch' | 'ellipse';
}

/** Adds the rect's outline to the canvas path. */
function tracePath(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.beginPath();
  if (r.shape === 'ellipse') {
    ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  } else if (r.shape === 'arch') {
    const rad = r.w / 2;
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x, r.y + rad);
    ctx.arc(r.x + rad, r.y + rad, rad, Math.PI, 0);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.closePath();
  } else {
    ctx.rect(r.x, r.y, r.w, r.h);
  }
}

/** Is the design-space point inside the rect's outline? */
function insideRect(r: Rect, x: number, y: number): boolean {
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
  if (r.shape === 'ellipse') {
    const dx = (x - (r.x + r.w / 2)) / (r.w / 2);
    const dy = (y - (r.y + r.h / 2)) / (r.h / 2);
    return dx * dx + dy * dy <= 1;
  }
  if (r.shape === 'arch') {
    const rad = r.w / 2;
    if (y >= r.y + rad) return true;
    return Math.hypot(x - (r.x + rad), y - (r.y + rad)) <= rad;
  }
  return true;
}

function windowRects(style: WindowStyle, frame: string): Rect[] {
  const paneTop = '#a9cfe6';
  const paneBottom = '#35607e';
  const pane = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h, fill: [paneTop, paneBottom], height: 0.2, rough: 0.07 });
  const bar = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h, fill: frame, height: 0.85, rough: 0.5 });
  const shaped = (shape: 'arch' | 'ellipse', x: number, y: number, w: number, h: number, glass: boolean): Rect =>
    glass ? { ...pane(x, y, w, h), shape } : { ...bar(x, y, w, h), shape };
  const sill = (x: number, y: number, w: number): Rect => ({ x, y, w, h: 5, fill: '#d8d3c8', height: 0.9, rough: 0.7 });
  switch (style) {
    case 'arched':
      return [
        shaped('arch', 46, 18, 68, 82, false),
        shaped('arch', 50, 22, 60, 78, true),
        bar(78.5, 22, 3, 78),
        bar(50, 60, 60, 3),
        sill(38, 100, 84),
      ];
    case 'shuttered': {
      // A narrower sash flanked by louvred shutters (painted in the frame colour's complement).
      const shutter = '#4c6b57';
      const leaf = (x: number): Rect[] => [
        { x, y: 26, w: 13, h: 72, fill: shutter, height: 0.8, rough: 0.6 },
        ...[36, 46, 56, 66, 76, 86].map((y): Rect => ({ x: x + 1.5, y, w: 10, h: 2.2, fill: '#35503f', height: 0.4, rough: 0.7 })),
      ];
      return [
        bar(60, 26, 40, 72),
        pane(63, 29, 34, 66),
        bar(78.5, 29, 3, 66),
        bar(63, 60.5, 34, 3),
        ...leaf(44),
        ...leaf(103),
        sill(42, 98, 76),
      ];
    }
    case 'loft': {
      const cols = [20, 60, 100];
      return [
        bar(16, 14, 128, 100),
        ...cols.flatMap((x) => [pane(x, 18, 36, 42), pane(x, 66, 36, 44)]),
        bar(16, 61, 128, 3),
      ];
    }
    case 'slit':
      return [24, 56, 88, 120].flatMap((x) => [bar(x - 2, 10, 12, 108), pane(x, 12, 8, 104)]);
    case 'round':
      return [
        shaped('ellipse', 46, 30, 68, 68, false),
        shaped('ellipse', 51, 35, 58, 58, true),
        bar(79, 35, 2, 58),
        bar(51, 63, 58, 2),
      ];
    case 'punched':
      return [
        bar(48, 26, 64, 72),
        pane(52, 30, 56, 64),
        bar(78.5, 30, 3, 64),
        bar(52, 61.5, 56, 3),
        { x: 40, y: 98, w: 80, h: 5, fill: '#d8d3c8', height: 0.9, rough: 0.7 },
      ];
    case 'ribbon':
      return [
        bar(0, 32, FW, 4),
        pane(0, 36, FW, 44),
        bar(0, 80, FW, 4),
        bar(0, 36, 2, 44),
        bar(78, 36, 4, 44),
        bar(158, 36, 2, 44),
      ];
    case 'tall':
      return [
        bar(18, 10, 56, 112),
        pane(21, 13, 50, 106),
        bar(44.5, 13, 3, 106),
        bar(86, 10, 56, 112),
        pane(89, 13, 50, 106),
        bar(112.5, 13, 3, 106),
      ];
    case 'none':
      return [];
  }
}

const facadeCache = new Map<string, THREE.MeshStandardMaterial>();

/** Sky reflection map shared by glossy materials; set once the renderer exists. */
let reflectionEnv: THREE.Texture | null = null;
const reflectiveMaterials = new Set<THREE.MeshStandardMaterial>();

/** Called by the scene when the sky environment is ready (and cleared on teardown). */
export function setReflectionEnvironment(texture: THREE.Texture | null) {
  reflectionEnv = texture;
  for (const m of reflectiveMaterials) {
    m.envMap = texture;
    m.needsUpdate = true;
  }
}

function registerReflective(material: THREE.MeshStandardMaterial, intensity: number) {
  material.envMap = reflectionEnv;
  material.envMapIntensity = intensity;
  reflectiveMaterials.add(material);
  registerReflection(material, intensity);
}
const facadeTextureCache = new Map<
  string,
  { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; glow: THREE.CanvasTexture | null }
>();

/**
 * Wall material for a facade: albedo, normal and roughness maps from one painted
 * module (glass panes are glossy, frames and masonry rough), optionally tinted.
 */
export function getFacadeMaterial(
  id: FacadeId,
  windows: WindowStyle,
  tint: string,
  quality: Quality,
): THREE.MeshStandardMaterial {
  const matKey = `${id}|${windows}|${tint}|${quality}`;
  const cached = facadeCache.get(matKey);
  if (cached) return cached;

  if (id === 'led') {
    // Media wall: the tint picks the LED colour (white = cyan).
    const led = getLedMaterial({ mode: 'wave', color: tint === '#ffffff' ? '#35e0ff' : tint, detail: 'high', block: 0, side: 'front', bottom: 0, height: 1, width: 0, offset: 0 }, 3, 2.4, 1.5);
    facadeCache.set(matKey, led);
    return led;
  }

  const paint = FACADE_PAINT[id];
  const style: WindowStyle = paint.curtain ? 'none' : windows;
  const texKey = `${id}|${style}|${quality}`;
  let textures = facadeTextureCache.get(texKey);

  if (!textures) {
    const S = SCALE[quality];
    const W = FW * S;
    const H = FH * S;
    const color = new ImageData(W, H);
    const heights = new Float32Array(W * H);
    const rough = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = paint.wall(x / S, y / S);
        color.data.set([clamp255(s.rgb[0]), clamp255(s.rgb[1]), clamp255(s.rgb[2]), 255], (y * W + x) * 4);
        heights[y * W + x] = s.height;
        rough[y * W + x] = s.rough ?? paint.roughness;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(color, 0, 0);
    ctx.scale(S, S);

    for (const r of windowRects(style, paint.windowFrame)) {
      if (Array.isArray(r.fill)) {
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, r.fill[0]);
        g.addColorStop(1, r.fill[1]);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = r.fill;
      }
      tracePath(ctx, r);
      ctx.fill();
      for (let y = Math.floor(r.y * S); y < Math.ceil((r.y + r.h) * S) && y < H; y++) {
        for (let x = Math.floor(r.x * S); x < Math.ceil((r.x + r.w) * S) && x < W; x++) {
          if (!insideRect(r, (x + 0.5) / S, (y + 0.5) / S)) continue;
          heights[y * W + x] = r.height;
          rough[y * W + x] = r.rough;
        }
      }
    }
    // Soft diagonal reflection across the glass of a single window / ribbon.
    if (style === 'punched') {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(52, 94);
      ctx.lineTo(74, 30);
      ctx.lineTo(90, 30);
      ctx.lineTo(68, 94);
      ctx.fill();
    }

    // Glass panes light up at night: white where there is glass, black where there is wall.
    let glow: THREE.CanvasTexture | null = null;
    const panes = windowRects(style, paint.windowFrame).filter((r) => Array.isArray(r.fill));
    if (paint.curtain || panes.length > 0) {
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = W;
      glowCanvas.height = H;
      const g = glowCanvas.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.scale(S, S);
      g.fillStyle = '#fff';
      if (paint.curtain) {
        // Curtain wall: the whole module is glass except for hairline mullions.
        g.fillRect(0, 0, FW, FH);
        g.fillStyle = '#000';
        g.fillRect(0, 0, FW, 3);
        g.fillRect(0, 0, 3, FH);
        g.fillRect(FW / 2 - 1.5, 0, 3, FH);
      } else {
        for (const r of panes) {
          tracePath(g, r);
          g.fill();
        }
      }
      glow = toTexture(glowCanvas, true);
    }

    textures = {
      glow,
      map: toTexture(canvas, true),
      normalMap: toTexture(heightsToNormals(heights, W, H, (id === 'glass' ? 1.2 : 2.6) * S * 0.6), false),
      roughnessMap: toTexture(grayscale(rough, W, H), false),
    };
    facadeTextureCache.set(texKey, textures);
  }

  const { glow, ...pbr } = textures;
  const material = new THREE.MeshStandardMaterial({
    ...pbr,
    normalMap: quality === 'low' ? null : pbr.normalMap,
    color: tint,
    roughness: 1, // the roughness map carries the real values
    metalness: paint.metalness ?? (id === 'glass' ? 0.25 : 0),
    envMapIntensity: 0.6,
  });
  if (glow) {
    material.emissive = new THREE.Color('#ffffff');
    material.emissiveMap = glow;
    enableNightWindows(material);
  }
  if (paint.reflective || id === 'glass') registerReflective(material, id === 'mirror' ? 1.5 : id === 'glass' ? 1.2 : 0.9);
  facadeCache.set(matKey, material);
  return material;
}

/**
 * Paints every facade and roof texture a little at a time while the game is idle, so choosing a
 * material later never stalls on generating it. Returns a function that cancels the warm-up.
 */
export function warmTextures(quality: Quality, facades: readonly FacadeId[], roofs: readonly RoofId[]): () => void {
  const jobs: (() => void)[] = [
    ...facades.map((id) => () => void getFacadeMaterial(id, 'punched', '#ffffff', quality)),
    ...roofs.map((id) => () => void getRoofMaterial(id, quality)),
  ];
  let handle = 0;
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    job();
    handle = window.setTimeout(next, 120);
  };
  handle = window.setTimeout(next, 1500);
  return () => window.clearTimeout(handle);
}

// --- Roofs ---------------------------------------------------------------------

const RS = 64;
const ROOF_BASE: Record<RoofId, RGB> = {
  slate: [74, 85, 104],
  terracotta: [180, 85, 58],
  green: [79, 122, 74],
  gravel: [138, 138, 133],
  membrane: [214, 217, 217],
  solar: [30, 56, 94],
  sedum: [111, 143, 78],
  asphalt: [72, 72, 78],
  shake: [128, 98, 68],
  copper: [92, 158, 138],
  thatch: [178, 150, 88],
  concrete: [152, 152, 148],
};

const roofCache = new Map<string, THREE.MeshStandardMaterial>();

/** Tileable roof covering: shingles, clay tiles, standing-seam metal, or gravel. */
export function getRoofMaterial(id: RoofId, quality: Quality): THREE.MeshStandardMaterial {
  const key = `${id}|${quality}`;
  const cached = roofCache.get(key);
  if (cached) return cached;

  const S = SCALE[quality];
  const N = RS * S;
  const base = ROOF_BASE[id];
  const color = new ImageData(N, N);
  const heights = new Float32Array(N * N);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = px / S;
      const y = py / S;
      const u = x / RS;
      const v = y / RS;
      let tone = 1;
      let height = 0.5;
      if (id === 'slate') {
        const row = Math.floor(y / 8);
        const col = Math.floor(((x + (row % 2) * 8) % RS) / 16);
        const edge = (x + (row % 2) * 8) % 16 < 0.8;
        tone = (0.8 + 0.4 * hash2(row, col, 2)) * (edge ? 0.7 : 1);
        height = ((y % 8) / 8) * 0.8 + 0.1;
      } else if (id === 'terracotta') {
        const row = Math.floor(y / 10);
        tone = 0.85 + 0.3 * hash2(row, Math.floor(x / 8), 6);
        height = 0.5 + 0.2 * Math.sin((x / 8) * Math.PI * 2) + ((y % 10) / 10) * 0.2;
      } else if (id === 'green') {
        const seam = x % 16 < 1.6;
        tone = seam ? 0.7 : 0.95 + 0.1 * tileNoise(u, v, 4, 8, 3);
        height = seam ? 0.95 : 0.4;
      } else if (id === 'membrane') {
        const seam = x % 32 < 0.8;
        tone = (seam ? 0.82 : 0.96) + 0.06 * tileNoise(u, v, 8, 8, 5);
        height = seam ? 0.8 : 0.5;
      } else if (id === 'solar') {
        // Monocrystalline cells: dark-blue grid with bright busbars.
        const cellX = x % 16;
        const cellY = y % 16;
        const gap = cellX < 0.8 || cellY < 0.8;
        const bus = Math.abs(cellX - 8) < 0.4 || Math.abs(cellY - 5) < 0.3 || Math.abs(cellY - 11) < 0.3;
        tone = gap ? 0.3 : bus ? 1.9 : 0.85 + 0.25 * tileNoise(u, v, 4, 4, 3);
        height = gap ? 0.1 : 0.6;
      } else if (id === 'asphalt') {
        // Three-tab shingles with a dusting of granules.
        const row = Math.floor(y / 8);
        const col = Math.floor(((x + (row % 2) * 4) % RS) / 8);
        const gap = (x + (row % 2) * 4) % 8 < 0.7 || y % 8 < 0.9;
        const granule = tileNoise(u, v, 40, 40, 11);
        tone = (0.78 + 0.32 * hash2(row, col, 12)) * (0.88 + granule * 0.24) * (gap ? 0.55 : 1);
        height = gap ? 0.15 : 0.45 + ((y % 8) / 8) * 0.4;
      } else if (id === 'shake') {
        // Rough cedar boards, each a different length and shade.
        const row = Math.floor(y / 8);
        const shift = hash2(row, 0, 13) * 8;
        const col = Math.floor(((x + shift) % RS) / 8);
        const gap = (x + shift) % 8 < 0.8 || y % 8 < 1.2;
        const grain = tileNoise(u, v, 3, 40, 14);
        tone = (0.72 + 0.5 * hash2(row, col, 16)) * (0.86 + grain * 0.28) * (gap ? 0.5 : 1);
        height = gap ? 0.1 : 0.4 + ((y % 8) / 8) * 0.5;
      } else if (id === 'copper') {
        // Standing-seam copper gone green, streaked where the rain runs.
        const seam = x % 16 < 1.4;
        const streak = tileNoise(u, v, 4, 14, 17);
        const patina = fbm(u, v, 5, 3, 18);
        tone = seam ? 0.62 : 0.78 + streak * 0.3 + patina * 0.2;
        height = seam ? 0.95 : 0.42;
      } else if (id === 'thatch') {
        // Bundled straw: long strands running down the slope, with a rib every bundle.
        const strand = tileNoise(u, v, 56, 5, 19);
        const bundle = (y % 16) / 16;
        tone = (0.62 + strand * 0.7) * (0.85 + bundle * 0.25);
        height = 0.35 + strand * 0.4 + bundle * 0.2;
      } else if (id === 'concrete') {
        // Flat interlocking tiles with a groove down each joint.
        const row = Math.floor(y / 16);
        const gx = (x + (row % 2) * 8) % 16;
        const groove = gx < 1.2 || y % 16 < 1.6;
        const n = tileNoise(u, v, 12, 12, 20);
        tone = (0.88 + 0.1 * hash2(row, Math.floor(((x + (row % 2) * 8) % RS) / 16), 21) + n * 0.1) * (groove ? 0.7 : 1);
        height = groove ? 0.12 : 0.6;
      } else if (id === 'sedum') {
        const clump = fbm(u, v, 8, 3, 15);
        tone = 0.65 + clump * 0.7;
        height = clump;
      } else {
        tone = 0.75 + 0.5 * tileNoise(u, v, 24, 24, 8) * (0.6 + 0.4 * tileNoise(u, v, 6, 6, 9));
        height = tileNoise(u, v, 24, 24, 8);
      }
      color.data.set(
        [clamp255(base[0] * tone), clamp255(base[1] * tone), clamp255(base[2] * tone), 255],
        (py * N + px) * 4,
      );
      heights[py * N + px] = lerp(0.2, 0.9, height);
    }
  }

  const material = new THREE.MeshStandardMaterial({
    map: toTexture(color, true),
    normalMap: quality === 'low' ? null : toTexture(heightsToNormals(heights, N, N, 2.2 * S * 0.6), false),
    roughness: id === 'green' ? 0.4 : id === 'copper' ? 0.42 : id === 'solar' ? 0.12 : id === 'membrane' ? 0.7 : 0.88,
    metalness: id === 'green' ? 0.55 : id === 'copper' ? 0.5 : id === 'solar' ? 0.5 : 0,
    side: THREE.DoubleSide,
  });
  if (id === 'green' || id === 'solar' || id === 'copper') registerReflective(material, id === 'solar' ? 1.4 : 1.1);
  roofCache.set(key, material);
  return material;
}

// --- Terrain: rock, sand and water ---------------------------------------------------------

const terrainCache = new Map<Quality, { rock: THREE.CanvasTexture; sand: THREE.CanvasTexture }>();

/** Tileable rock (the cracked-stone painter) and sand textures for slopes and shores. */
export function getTerrainTextures(quality: Quality) {
  let tex = terrainCache.get(quality);
  if (!tex) {
    const size = GROUND_SIZE[quality];
    const paintTile = (paint: (u: number, v: number) => { rgb: RGB; height: number }) => {
      const data = new ImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = paint(x / size, 1 - y / size);
          data.data.set([clamp255(s.rgb[0]), clamp255(s.rgb[1]), clamp255(s.rgb[2]), 255], (y * size + x) * 4);
        }
      }
      return toTexture(data, true);
    };
    tex = {
      rock: paintTile(PAINTERS[3]),
      sand: paintTile((u, v) => {
        const grain = fbm(u, v, 16, 3, 41);
        const ripple = tileNoise(u, v, 6, 14, 42);
        const t = 0.82 + grain * 0.22 + (ripple - 0.5) * 0.12;
        return { rgb: [218 * t, 193 * t, 140 * t], height: grain };
      }),
    };
    terrainCache.set(quality, tex);
  }
  return tex;
}

let waterNormals: THREE.CanvasTexture | null = null;

/** Tileable ripple normal map for lakes, rivers and the sea (scrolled by the water mesh). */
export function getWaterNormals(): THREE.CanvasTexture {
  if (!waterNormals) {
    const size = 256;
    const heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        heights[y * size + x] = fbm(u, v, 8, 4, 61) * 0.7 + (1 - Math.abs(2 * tileNoise(u, v, 6, 6, 62) - 1)) * 0.3;
      }
    }
    waterNormals = toTexture(heightsToNormals(heights, size, size, 3.2), false);
  }
  return waterNormals;
}
