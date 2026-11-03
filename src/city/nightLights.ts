import * as THREE from 'three';

/**
 * Shared, mutable lighting state for things that change with the time of day and weather.
 * Models register their materials here once; the atmosphere driver updates them a few times
 * a second, so nothing re-renders through React.
 */

/** 0 = day, 1 = deep night. Drives how many facade windows are lit (shared by every facade material). */
export const nightUniform = { value: 0 };

interface NightEmissive {
  material: THREE.MeshStandardMaterial;
  max: number;
}
const nightEmissives = new Set<NightEmissive>();

/** Material that glows after dark (tram windows, lamp bulbs, shop signs): emissive = max * night level. */
export function registerNightEmissive(material: THREE.MeshStandardMaterial, max: number) {
  const entry = { material, max };
  nightEmissives.add(entry);
  return () => nightEmissives.delete(entry);
}

interface Wettable {
  material: THREE.MeshStandardMaterial;
  roughness: number;
  color: THREE.Color;
}
const wettables = new Set<Wettable>();

/** Surface that darkens and turns glossy in the rain. */
export function registerWet(material: THREE.MeshStandardMaterial) {
  wettables.add({ material, roughness: material.roughness, color: material.color.clone() });
}

interface Reflective {
  material: THREE.MeshStandardMaterial;
  base: number;
}
const reflectives = new Set<Reflective>();

/** Glossy material whose sky reflection should fade at night. */
export function registerReflection(material: THREE.MeshStandardMaterial, base: number) {
  reflectives.add({ material, base });
}

/** Shared glow sprite texture: soft radial falloff, used for lamp pools and headlight beams. */
let glowTexture: THREE.CanvasTexture | null = null;
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** Additive pool of light on the ground under a street lamp. One material for every lamp. */
export const lampGlowMaterial = new THREE.MeshBasicMaterial({
  color: '#ffd9a0',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  visible: false,
});

/** Additive beam on the road ahead of a car. */
export const headlightBeamMaterial = new THREE.MeshBasicMaterial({
  color: '#ffe9b8',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  visible: false,
});

/** Soft additive halo behind an LED screen, brighter after dark. Shared per colour. */
const halos = new Map<string, THREE.MeshBasicMaterial>();
export function getHaloMaterial(color: string): THREE.MeshBasicMaterial {
  let material = halos.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color,
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    halos.set(color, material);
  }
  return material;
}

let lastWet = -1;
let lastNight = -1;
let lastReflect = -1;

export interface NightLevels {
  /** Street lights and vehicle lights, 0..1. */
  lamps: number;
  /** Window glow, 0..1. */
  windows: number;
  /** Rain-slick surfaces, 0..1. */
  wet: number;
  /** Strength of the daytime sky reflection, 0..1. */
  reflect: number;
}

/** Pushes the current levels into every registered material (skips work when nothing moved). */
export function applyLevels(levels: NightLevels) {
  nightUniform.value = levels.windows;

  if (Math.abs(levels.lamps - lastNight) > 0.004) {
    lastNight = levels.lamps;
    for (const { material, max } of nightEmissives) material.emissiveIntensity = max * levels.lamps;
    const on = levels.lamps > 0.02;
    lampGlowMaterial.visible = on;
    lampGlowMaterial.opacity = levels.lamps * 0.5;
    headlightBeamMaterial.visible = on;
    headlightBeamMaterial.opacity = levels.lamps * 0.42;
    for (const halo of halos.values()) halo.opacity = 0.05 + 0.4 * levels.lamps;
  }

  if (Math.abs(levels.wet - lastWet) > 0.01) {
    lastWet = levels.wet;
    for (const w of wettables) {
      w.material.roughness = w.roughness * (1 - 0.62 * levels.wet);
      w.material.color.copy(w.color).multiplyScalar(1 - 0.3 * levels.wet);
    }
  }

  if (Math.abs(levels.reflect - lastReflect) > 0.01) {
    lastReflect = levels.reflect;
    for (const r of reflectives) r.material.envMapIntensity = r.base * levels.reflect;
  }
}

/**
 * Patches a MeshStandardMaterial so the glass panes in its emissive map light up at night.
 * Which windows are lit comes from a hash of the tile + the wall's world position, so a
 * block of flats shows a believable scatter of lit and dark windows that fills in at dusk.
 */
export function enableNightWindows(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNightPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vNightPos;\nfloat nightHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          vec2 tile = floor(vEmissiveMapUv) + floor(vNightPos.xz * 0.5) * 7.0 + floor(vNightPos.y * 0.01) * 3.0;
          float h = nightHash(tile);
          // Most windows stay dark: at the very most about a quarter of them are lit, and not all equally bright.
          float lit = step(h, uNight * 0.26) * (0.55 + 0.45 * fract(h * 31.7));
          float cool = step(0.82, fract(h * 9.7));
          vec3 warm = mix(vec3(1.0, 0.8, 0.5), vec3(0.75, 0.88, 1.0), cool);
          totalEmissiveRadiance *= emissiveColor.rgb * warm * lit * 1.5;
        #endif
        `,
      );
  };
}
