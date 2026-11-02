import * as THREE from 'three';
import { atmo } from '../scenes/atmosphere';
import { LED_ART_H, LED_ART_PALETTE, LED_ART_W, resolveLed, type LedFont, type LedSpec, type ResolvedLed } from './catalog';
import { registerNightEmissive } from './nightLights';

/**
 * LED screens. Each screen paints a small "logical" canvas (one canvas pixel = one LED), then
 * draws it up through a dot mask so the screen shows round or square lit pixels with gaps.
 * Everything about the content and look comes from the LedSpec, so every screen can be unique.
 */

/** Metres per LED for each detail level. */
const PITCH = { low: 0.32, medium: 0.16, high: 0.08 } as const;
const MAX_COLS = 192;
const MAX_ROWS = 96;
/** Repaint rates (frames per second) by how much the picture moves. */
const FAST_FPS = 20;
const SLOW_FPS = 2;
/** A screen only repaints while something drew it in the last moment (it is on screen). */
const SEEN_WINDOW_MS = 400;

type Rgb = [number, number, number];

const FONTS: Record<LedFont, string> = {
  bold: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  mono: '"Courier New", Consolas, monospace',
  serif: 'Georgia, "Times New Roman", serif',
  round: '"Trebuchet MS", "Arial Rounded MT Bold", Verdana, sans-serif',
  pixel: '"Lucida Console", "Courier New", monospace',
};

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbCss = (c: Rgb) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function hueToRgb(h: number): Rgb {
  const k = (n: number) => (n + h * 12) % 12;
  const f = (n: number) => 0.5 - 0.5 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

/** Grid size for a screen of this physical size: same LED pitch whatever the shape. */
export function ledGrid(spec: ResolvedLed, widthM: number, heightM: number): { cols: number; rows: number } {
  const pitch = PITCH[spec.detail];
  return {
    cols: Math.max(8, Math.min(MAX_COLS, Math.round(widthM / pitch))),
    rows: Math.max(4, Math.min(MAX_ROWS, Math.round(heightM / pitch))),
  };
}

// --- Painting ------------------------------------------------------------------------

interface Scene {
  ctx: CanvasRenderingContext2D;
  cols: number;
  rows: number;
  spec: ResolvedLed;
  /** Seconds, already multiplied by the screen's speed. */
  t: number;
  color: Rgb;
  color2: Rgb;
  bg: Rgb;
}

function fill(s: Scene, style: string | CanvasGradient) {
  s.ctx.fillStyle = style;
  s.ctx.fillRect(0, 0, s.cols, s.rows);
}

function gradientAcross(s: Scene): string | CanvasGradient {
  if (s.spec.color2 === s.spec.color) return s.spec.color;
  const g = s.ctx.createLinearGradient(0, 0, s.cols, 0);
  g.addColorStop(0, s.spec.color);
  g.addColorStop(1, s.spec.color2);
  return g;
}

/** Sets the font to the biggest size (up to the wanted one) at which `text` fits the width; returns the size. */
function fitFont(s: Scene, text: string, wanted: number, maxWidth: number, fit: boolean): number {
  let size = Math.max(5, Math.round(wanted));
  s.ctx.font = `bold ${size}px ${FONTS[s.spec.font]}`;
  while (fit && size > 5 && s.ctx.measureText(text).width > maxWidth) {
    size -= 1;
    s.ctx.font = `bold ${size}px ${FONTS[s.spec.font]}`;
  }
  return size;
}

function drawMessage(s: Scene, text: string, scroll: ResolvedLed['scroll'], colour: string | CanvasGradient) {
  const { ctx, cols, rows } = s;
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const wanted = rows * s.spec.textSize;
  const horizontal = scroll === 'left' || scroll === 'right';
  const size = fitFont(s, text, wanted, cols * 0.96, !horizontal);
  const width = ctx.measureText(text).width;
  const cy = rows / 2 + size * 0.06;

  if (scroll === 'none') {
    ctx.textAlign = 'center';
    ctx.fillText(text, cols / 2, cy);
  } else if (horizontal) {
    const gap = size * 2.5;
    const period = width + gap;
    const dir = scroll === 'left' ? -1 : 1;
    const shift = (((s.t * rows * 0.9 * dir) % period) + period) % period;
    for (let x = shift - period; x < cols; x += period) ctx.fillText(text, x, cy);
  } else {
    // Vertical roll: lines move up (or down) and wrap.
    ctx.textAlign = 'center';
    const period = rows + size * 1.4;
    const dir = scroll === 'up' ? -1 : 1;
    const shift = (((s.t * rows * 0.5 * dir) % period) + period) % period;
    ctx.fillText(text, cols / 2, shift - size * 0.7);
    ctx.fillText(text, cols / 2, shift - size * 0.7 - period);
  }
}

function drawWeatherIcon(s: Scene, cx: number, cy: number, r: number, kind: string, night: boolean) {
  const { ctx } = s;
  const warm = s.spec.color;
  const cool = s.spec.color2;
  const cloud = (dx: number, dy: number, k: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx + dx - r * 0.35 * k, cy + dy + r * 0.1 * k, r * 0.38 * k, 0, Math.PI * 2);
    ctx.arc(cx + dx + r * 0.05 * k, cy + dy - r * 0.15 * k, r * 0.48 * k, 0, Math.PI * 2);
    ctx.arc(cx + dx + r * 0.5 * k, cy + dy + r * 0.12 * k, r * 0.36 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + dx - r * 0.35 * k, cy + dy + r * 0.1 * k, r * 0.85 * k, r * 0.38 * k);
  };
  if (kind === 'clear') {
    if (night) {
      ctx.fillStyle = cool;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbCss(s.bg);
      ctx.beginPath();
      ctx.arc(cx + r * 0.3, cy - r * 0.15, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = warm;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = warm;
      ctx.lineWidth = Math.max(1, r * 0.1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + s.t * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
        ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
    }
    return;
  }
  if (kind === 'fog') {
    ctx.fillStyle = cool;
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - r * 0.8 + (i % 2) * r * 0.25, cy - r * 0.6 + i * r * 0.38, r * 1.3, Math.max(1, r * 0.14));
    return;
  }
  cloud(0, -r * 0.1, 1, kind === 'storm' ? '#9aa3b2' : cool);
  const drops = (n: number, col: string, round: boolean) => {
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, r * 0.09);
    for (let i = 0; i < n; i++) {
      const x = cx - r * 0.55 + i * (r * 1.1 / Math.max(1, n - 1));
      const y = cy + r * 0.45 + ((s.t * r * 1.4 + i * r * 0.5) % (r * 0.55));
      if (round) {
        ctx.fillRect(x - r * 0.06, y, r * 0.14, r * 0.14);
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - r * 0.12, y + r * 0.28);
        ctx.stroke();
      }
    }
  };
  if (kind === 'rain') drops(4, warm, false);
  if (kind === 'snow') drops(4, '#ffffff', true);
  if (kind === 'storm') {
    ctx.fillStyle = warm;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.1, cy + r * 0.2);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.75);
    ctx.lineTo(cx, cy + r * 0.65);
    ctx.lineTo(cx - r * 0.1, cy + r * 1.1);
    ctx.lineTo(cx + r * 0.35, cy + r * 0.5);
    ctx.lineTo(cx + r * 0.1, cy + r * 0.55);
    ctx.fill();
  }
}

function drawArt(s: Scene) {
  const { ctx, cols, rows, spec } = s;
  const art = document.createElement('canvas');
  art.width = LED_ART_W;
  art.height = LED_ART_H;
  const actx = art.getContext('2d')!;
  const pixels = spec.pixels;
  for (let i = 0; i < LED_ART_W * LED_ART_H; i++) {
    const digit = pixels.charCodeAt(i);
    const idx = digit >= 48 && digit <= 57 ? digit - 48 : digit >= 97 && digit <= 102 ? digit - 87 : 0;
    if (idx === 0) continue;
    actx.fillStyle = idx === 15 ? spec.color : LED_ART_PALETTE[idx];
    actx.fillRect(i % LED_ART_W, Math.floor(i / LED_ART_W), 1, 1);
  }
  ctx.imageSmoothingEnabled = false;
  const w = Math.min(cols, rows * (LED_ART_W / LED_ART_H));
  const h = w * (LED_ART_H / LED_ART_W);
  const y = (rows - h) / 2;
  if (spec.scroll === 'none') {
    ctx.drawImage(art, (cols - w) / 2, y, w, h);
  } else if (spec.scroll === 'left' || spec.scroll === 'right') {
    const dir = spec.scroll === 'left' ? -1 : 1;
    const period = w + w * 0.25;
    const shift = (((s.t * rows * 0.8 * dir) % period) + period) % period;
    for (let x = shift - period; x < cols; x += period) ctx.drawImage(art, x, y, w, h);
  } else {
    const dir = spec.scroll === 'up' ? -1 : 1;
    const period = rows + h * 0.2;
    const shift = (((s.t * rows * 0.5 * dir) % period) + period) % period;
    ctx.drawImage(art, (cols - w) / 2, shift - h, w, h);
    ctx.drawImage(art, (cols - w) / 2, shift - h - period, w, h);
  }
}

function paintScene(s: Scene) {
  const { ctx, cols, rows, spec, t } = s;
  fill(s, spec.bg);
  switch (spec.mode) {
    case 'solid':
      fill(s, gradientAcross(s));
      break;
    case 'text':
      drawMessage(s, spec.text || ' ', spec.scroll, gradientAcross(s));
      break;
    case 'ticker':
      drawMessage(s, spec.text || ' ', spec.scroll === 'none' ? 'left' : spec.scroll, gradientAcross(s));
      break;
    case 'slides': {
      const slides = spec.text.split('|').map((x) => x.trim()).filter(Boolean);
      if (slides.length === 0) break;
      const slot = t / 3;
      const idx = Math.floor(slot) % slides.length;
      const phase = slot - Math.floor(slot);
      const alpha = Math.min(1, phase / 0.15, (1 - phase) / 0.15);
      ctx.globalAlpha = clamp01(alpha);
      drawMessage(s, slides[idx], 'none', idx % 2 === 0 ? spec.color : spec.color2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'clock': {
      const h24 = Math.floor(atmo.hour) % 24;
      const m = Math.floor((atmo.hour % 1) * 60);
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const colon = Math.floor(performance.now() / 500) % 2 === 0 ? ':' : ' ';
      const text = `${h12}${colon}${String(m).padStart(2, '0')}`;
      const two = rows >= 20;
      ctx.fillStyle = gradientAcross(s);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const size = fitFont(s, '12:00', rows * spec.textSize * (two ? 0.8 : 1), cols * 0.9, true);
      ctx.fillText(text, cols / 2, two ? rows * 0.42 : rows / 2 + size * 0.05);
      if (two) {
        ctx.font = `bold ${Math.max(5, Math.round(rows * 0.2))}px ${FONTS[spec.font]}`;
        ctx.fillStyle = spec.color2;
        ctx.fillText(h24 < 12 ? 'AM' : 'PM', cols / 2, rows * 0.85);
      }
      break;
    }
    case 'weather': {
      const night = atmo.sunHeight < 0;
      const base = 12 + 9 * Math.sin(((atmo.hour - 9) / 24) * Math.PI * 2);
      const delta = atmo.kind === 'snow' ? -14 : atmo.kind === 'rain' || atmo.kind === 'storm' ? -3 : atmo.kind === 'fog' ? -2 : 0;
      const temp = Math.round(base + delta);
      const r = Math.min(rows * 0.5, cols * 0.28);
      drawWeatherIcon(s, cols * 0.28, rows / 2, r, atmo.kind, night);
      ctx.fillStyle = spec.color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      fitFont(s, '-10°', rows * spec.textSize * 1.1, cols * 0.42, true);
      ctx.fillText(`${temp}°`, cols * 0.55, rows / 2 + rows * 0.03);
      break;
    }
    case 'wave': {
      const img = ctx.createImageData(cols, rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = 0.5 + 0.5 * Math.sin((x / cols) * Math.PI * 4 + t * 2.2 + Math.sin((y / rows) * Math.PI * 2 + t) * 1.2);
          const c = mix(s.bg, mix(s.color, s.color2, x / cols), 0.15 + 0.85 * v * v);
          img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'rainbow': {
      const img = ctx.createImageData(cols, rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = hueToRgb((x / cols + t * 0.12 + (y / rows) * 0.25) % 1);
          img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'plasma': {
      const img = ctx.createImageData(cols, rows);
      const k = 22 / Math.max(cols, rows * 2);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v =
            (Math.sin(x * k + t) + Math.sin(y * k * 2 + t * 1.3) + Math.sin((x + y) * k * 0.7 + t * 0.7) + Math.sin(Math.hypot(x - cols / 2, (y - rows / 2) * 2) * k * 1.4 - t * 1.1) + 4) / 8;
          const c = v < 0.5 ? mix(s.bg, s.color, v * 2) : mix(s.color, s.color2, (v - 0.5) * 2);
          img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'matrix': {
      const img = ctx.createImageData(cols, rows);
      const trail = Math.max(4, rows * 0.7);
      for (let x = 0; x < cols; x++) {
        const speed = 0.35 + hash(x) * 1.1;
        const period = rows + trail;
        const head = ((t * rows * speed * 0.6 + hash(x + 99) * period) % period);
        for (let y = 0; y < rows; y++) {
          const behind = head - y;
          if (behind < 0 || behind > trail) continue;
          const lit = 1 - behind / trail;
          const flicker = 0.75 + 0.25 * hash(x * 31 + y * 7 + Math.floor(t * 6));
          const c = behind < 1 ? mix(s.color, [255, 255, 255], 0.7) : mix(s.bg, s.color, lit * flicker);
          img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4);
        }
      }
      // Fill the unlit pixels with the background.
      const bgd = s.bg;
      for (let i = 0; i < cols * rows; i++) if (img.data[i * 4 + 3] === 0) img.data.set([bgd[0], bgd[1], bgd[2], 255], i * 4);
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'stripes': {
      const width = Math.max(3, rows * 0.45);
      const img = ctx.createImageData(cols, rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const on = (((x + y + t * rows * 0.6) / width) % 2 + 2) % 2 < 1;
          const c = on ? s.color : spec.color2 === spec.color ? mix(s.bg, s.color, 0.12) : s.color2;
          img.data.set([c[0], c[1], c[2], 255], (y * cols + x) * 4);
        }
      }
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'bars': {
      const bars = Math.max(6, Math.round(cols / 6));
      const bw = cols / bars;
      const g = ctx.createLinearGradient(0, rows, 0, 0);
      g.addColorStop(0, spec.color);
      g.addColorStop(1, spec.color2);
      ctx.fillStyle = g;
      for (let i = 0; i < bars; i++) {
        const level = 0.2 + 0.75 * Math.abs(Math.sin(t * (1.6 + (i % 5) * 0.5) + i * 1.7));
        const h = Math.round(level * (rows - 2));
        ctx.fillRect(i * bw + bw * 0.1, rows - 1 - h, bw * 0.8, h);
      }
      break;
    }
    case 'checker': {
      const cell = Math.max(2, Math.round(rows / 8));
      const dim = mix(s.bg, s.color, 0.12);
      for (let y = 0; y < rows / cell; y++) {
        for (let x = 0; x < cols / cell; x++) {
          const on = Math.sin(t * 3 + x * 1.3 + y * 2.1) + Math.cos(t * 2 - x * 0.7 + y * 1.1) > 0.3;
          ctx.fillStyle = on ? ((x + y) % 2 === 0 ? spec.color : spec.color2) : rgbCss(dim);
          ctx.fillRect(x * cell + 1, y * cell + 1, cell - 1, cell - 1);
        }
      }
      break;
    }
    case 'pulse': {
      const g = ctx.createRadialGradient(cols / 2, rows / 2, 0, cols / 2, rows / 2, Math.max(cols, rows * 2) * 0.55);
      const phase = (t * 0.7) % 1;
      g.addColorStop(Math.max(0, phase - 0.25), spec.bg);
      g.addColorStop(phase, spec.color);
      g.addColorStop(Math.min(1, phase + 0.25), spec.color2 === spec.color ? spec.bg : spec.color2);
      fill(s, g);
      break;
    }
    case 'draw':
      drawArt(s);
      break;
  }
}

/** How often a screen needs a new picture: 0 = painted once, otherwise frames per second. */
function repaintRate(spec: ResolvedLed): number {
  switch (spec.mode) {
    case 'solid':
      return 0;
    case 'text':
    case 'draw':
      return spec.scroll === 'none' ? 0 : FAST_FPS;
    case 'clock':
    case 'weather':
      return spec.mode === 'weather' && (atmo.kind === 'rain' || atmo.kind === 'snow' || atmo.kind === 'storm' || atmo.kind === 'clear') ? 8 : SLOW_FPS;
    default:
      return FAST_FPS;
  }
}

// --- Textures --------------------------------------------------------------------------

interface LedScreenTexture {
  spec: ResolvedLed;
  cols: number;
  rows: number;
  logical: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  output: HTMLCanvasElement;
  octx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mask: CanvasPattern | null;
  tile: number;
  seen: number;
  lastPaint: number;
  speedClock: number;
  rate: number;
}

const screens = new Map<string, LedScreenTexture>();
const materials = new Map<string, { material: THREE.MeshStandardMaterial; screenKey: string }>();
/** Screens that were drawn recently; only these are repainted. */
const active = new Set<LedScreenTexture>();
let timer: number | null = null;
/** Most distinct screens kept in memory (editing colours or text makes a new one per change). */
const MAX_CACHED = 48;
const EVICT_AFTER_MS = 8000;

/** Tile that makes each LED look like a square or round dot with a dark gap around it. */
function dotMask(kind: 'square' | 'round', tile: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = tile;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, tile, tile);
  g.fillStyle = '#fff';
  if (kind === 'square') {
    g.fillRect(0, 0, tile - 1, tile - 1);
  } else {
    g.beginPath();
    g.arc(tile / 2, tile / 2, tile * 0.44, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

const masks = new Map<string, HTMLCanvasElement>();

function render(screen: LedScreenTexture, now: number) {
  const { spec } = screen;
  screen.speedClock += ((now - screen.lastPaint) / 1000) * spec.speed;
  screen.lastPaint = now;
  paintScene({
    ctx: screen.lctx,
    cols: screen.cols,
    rows: screen.rows,
    spec,
    t: screen.speedClock,
    color: hexToRgb(spec.color),
    color2: hexToRgb(spec.color2),
    bg: hexToRgb(spec.bg),
  });
  if (spec.dots === 'smooth') {
    screen.octx.imageSmoothingEnabled = true;
    screen.octx.drawImage(screen.logical, 0, 0, screen.output.width, screen.output.height);
  } else {
    screen.octx.globalCompositeOperation = 'source-over';
    screen.octx.imageSmoothingEnabled = false;
    screen.octx.drawImage(screen.logical, 0, 0, screen.output.width, screen.output.height);
    if (screen.mask) {
      screen.octx.globalCompositeOperation = 'multiply';
      screen.octx.fillStyle = screen.mask;
      screen.octx.fillRect(0, 0, screen.output.width, screen.output.height);
      screen.octx.globalCompositeOperation = 'source-over';
    }
  }
  screen.texture.needsUpdate = true;
}

function tick(now: number) {
  timer = requestAnimationFrame(tick);
  for (const screen of active) {
    if (now - screen.seen > SEEN_WINDOW_MS) {
      active.delete(screen); // off screen: stop repainting until something draws it again
      continue;
    }
    if (screen.rate === 0) continue;
    if (now - screen.lastPaint < 1000 / screen.rate) continue;
    render(screen, now);
  }
}

/** The part of a spec that decides what the texture looks like (placement and glow are not part of it). */
function textureKey(spec: ResolvedLed, cols: number, rows: number): string {
  return [spec.mode, spec.text, spec.color, spec.color2, spec.bg, spec.speed, spec.dots, spec.font, spec.textSize, spec.scroll, spec.pixels, cols, rows].join('|');
}

function getScreen(spec: ResolvedLed, cols: number, rows: number): LedScreenTexture {
  const key = textureKey(spec, cols, rows);
  let screen = screens.get(key);
  if (screen) return screen;

  const logical = document.createElement('canvas');
  logical.width = cols;
  logical.height = rows;
  const tile = spec.dots === 'smooth' ? 1 : cols > 128 ? 3 : 4;
  const output = document.createElement('canvas');
  output.width = cols * tile;
  output.height = rows * tile;
  const octx = output.getContext('2d')!;
  let mask: CanvasPattern | null = null;
  if (spec.dots !== 'smooth') {
    const maskKey = `${spec.dots}${tile}`;
    let maskCanvas = masks.get(maskKey);
    if (!maskCanvas) {
      maskCanvas = dotMask(spec.dots, tile);
      masks.set(maskKey, maskCanvas);
    }
    mask = octx.createPattern(maskCanvas, 'repeat');
  }
  const texture = new THREE.CanvasTexture(output);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;

  screen = {
    spec,
    cols,
    rows,
    logical,
    lctx: logical.getContext('2d')!,
    output,
    octx,
    texture,
    mask,
    tile,
    seen: performance.now(),
    lastPaint: performance.now(),
    speedClock: 0,
    rate: repaintRate(spec),
  };
  screens.set(key, screen);
  active.add(screen);
  render(screen, performance.now());
  evict();
  if (timer === null) timer = requestAnimationFrame(tick);
  return screen;
}

/** Drops screens nobody has looked at for a while once there are too many, freeing their canvases and GPU textures. */
function evict() {
  if (screens.size <= MAX_CACHED) return;
  const now = performance.now();
  for (const [key, screen] of screens) {
    if (screens.size <= MAX_CACHED) break;
    if (now - screen.seen < EVICT_AFTER_MS) continue;
    screens.delete(key);
    active.delete(screen);
    screen.texture.dispose();
    for (const [matKey, entry] of materials) {
      if (entry.screenKey === key) {
        entry.material.dispose();
        materials.delete(matKey);
      }
    }
  }
}

/**
 * Glowing LED screen material for a screen of the given physical size. Screens with identical
 * settings and size share one material and one texture.
 */
export function getLedMaterial(input: LedSpec, widthM: number, heightM: number, baseIntensity = 1.8): THREE.MeshStandardMaterial {
  const spec = resolveLed(input);
  const { cols, rows } = ledGrid(spec, widthM, heightM);
  const key = `${textureKey(spec, cols, rows)}|${spec.brightness}|${spec.power}|${baseIntensity}`;
  const cached = materials.get(key);
  if (cached) return cached.material;

  const screen = getScreen(spec, cols, rows);
  const intensity = baseIntensity * spec.brightness;
  const material = new THREE.MeshStandardMaterial({
    color: '#07080b',
    emissive: '#ffffff',
    emissiveMap: screen.texture,
    emissiveIntensity: spec.power === 'night' ? 0 : intensity,
    roughness: 0.35,
    metalness: 0.2,
  });
  // Tell the repaint loop this screen is being drawn.
  material.onBeforeRender = () => {
    screen.seen = performance.now();
    if (!active.has(screen)) active.add(screen);
  };
  if (spec.power === 'night') registerNightEmissive(material, intensity);
  materials.set(key, { material, screenKey: textureKey(spec, cols, rows) });
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
