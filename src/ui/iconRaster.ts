import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { iconComponent } from './icons';

/** Badge colours for the speech bubbles above people. */
const BADGES: Record<string, string> = {
  angry: '#d93a2f',
  scared: '#e0a41a',
  chat: '#3b82c4',
  stars: '#7a5fd6',
  siren: '#d93a2f',
  money: '#2fa65a',
  eye: '#555b66',
  hammer: '#e07a1f',
  party: '#d6469b',
};

/**
 * Draws a react-icons glyph into a canvas so it can be used as a texture in the 3D scene (speech
 * bubbles, site tags). The canvas fills in once the SVG has decoded; `onReady` fires then.
 */
export function rasterIcon(name: string, size = 96, onReady?: () => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const badge = BADGES[name] ?? '#2b2f36';
  ctx.fillStyle = badge;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  const svg = renderToStaticMarkup(createElement(iconComponent(name), { size: size * 0.56, color: '#ffffff' }));
  const image = new Image();
  image.onload = () => {
    const s = size * 0.56;
    ctx.drawImage(image, (size - s) / 2, (size - s) / 2, s, s);
    onReady?.();
  };
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  return canvas;
}

/** Plain glyph on a transparent background in the given colour (for labels). */
export function rasterGlyph(name: string, size: number, color: string, onReady?: () => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const svg = renderToStaticMarkup(createElement(iconComponent(name), { size, color }));
  const image = new Image();
  image.onload = () => {
    ctx.drawImage(image, 0, 0, size, size);
    onReady?.();
  };
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  return canvas;
}
