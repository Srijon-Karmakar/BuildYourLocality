import * as THREE from 'three';
import type { LedMode } from './catalog';

// Low-resolution canvases magnified with nearest filtering, so the screens show visible
// LED pixels. Patterns are white-on-black; each screen's colour comes from the material's
// emissive colour, so one animated texture per mode serves every screen of that mode.

const W = 96;
const H = 48;
const FPS = 20;

interface LedCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

const screens = new Map<LedMode, LedCanvas>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
let timer: number | null = null;
let last = 0;

const TICKER_TEXT = '  APNAGALI CITY  ★  OPEN 24/7  ★  WELCOME  ★  ';

function paint(mode: LedMode, ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  switch (mode) {
    case 'solid':
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      break;
    case 'wave': {
      // Periodic in x (whole sine periods per tile) so it also repeats cleanly on a wall.
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 4 + t * 2.2 + Math.sin((y / H) * Math.PI * 2 + t) * 1.2);
          const c = Math.round(255 * (0.15 + 0.85 * v * v));
          img.data.set([c, c, c, 255], (y * W + x) * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'ticker': {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(TICKER_TEXT).width;
      const x = -((t * 40) % width);
      ctx.fillText(TICKER_TEXT, x, H / 2 + 1);
      ctx.fillText(TICKER_TEXT, x + width, H / 2 + 1);
      break;
    }
    case 'bars': {
      const bars = 16;
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const level = 0.25 + 0.7 * Math.abs(Math.sin(t * (1.6 + (i % 5) * 0.5) + i * 1.7));
        const h = Math.round(level * (H - 4));
        ctx.fillStyle = '#fff';
        ctx.fillRect(i * bw + 1, H - 2 - h, bw - 2, h);
      }
      break;
    }
    case 'checker': {
      const cell = 6;
      for (let y = 0; y < H / cell; y++) {
        for (let x = 0; x < W / cell; x++) {
          const on = Math.sin(t * 3 + x * 1.3 + y * 2.1) + Math.cos(t * 2 - x * 0.7 + y * 1.1) > 0.3;
          ctx.fillStyle = on ? '#fff' : '#222';
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
      break;
    }
    case 'pulse': {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      const phase = (t * 0.7) % 1;
      g.addColorStop(Math.max(0, phase - 0.25), '#000');
      g.addColorStop(phase, '#fff');
      g.addColorStop(Math.min(1, phase + 0.25), '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
  }
}

function tick(now: number) {
  timer = requestAnimationFrame(tick);
  if (now - last < 1000 / FPS) return;
  last = now;
  const t = now / 1000;
  for (const [mode, s] of screens) {
    paint(mode, s.ctx, t);
    s.texture.needsUpdate = true;
  }
}

function getScreen(mode: LedMode): LedCanvas {
  let s = screens.get(mode);
  if (!s) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    paint(mode, ctx, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    s = { canvas, ctx, texture };
    screens.set(mode, s);
    if (timer === null) timer = requestAnimationFrame(tick);
  }
  return s;
}

/** Glowing, animated LED screen material (shared per mode and colour). */
export function getLedMaterial(mode: LedMode, color: string, intensity = 1.8): THREE.MeshStandardMaterial {
  const key = `${mode}|${color}|${intensity}`;
  let material = materials.get(key);
  if (!material) {
    const screen = getScreen(mode);
    material = new THREE.MeshStandardMaterial({
      color: '#07080b',
      emissive: color,
      emissiveMap: screen.texture,
      emissiveIntensity: intensity,
      roughness: 0.35,
      metalness: 0.2,
    });
    materials.set(key, material);
  }
  return material;
}

// --- Signs ---------------------------------------------------------------------

const signCache = new Map<string, THREE.MeshStandardMaterial>();

/** Illuminated sign board with the given text, white or coloured on a dark panel. */
export function getSignMaterial(text: string, color: string): THREE.MeshStandardMaterial {
  const key = `${text}|${color}`;
  let material = signCache.get(key);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = color;
    ctx.font = 'bold 76px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillText(text.slice(0, 14), 256, 68, 480);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    material = new THREE.MeshStandardMaterial({
      map,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: 0.9,
      roughness: 0.5,
    });
    signCache.set(key, material);
  }
  return material;
}
