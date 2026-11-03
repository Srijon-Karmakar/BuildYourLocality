import * as THREE from 'three';
import { hasTerrain, heightAt } from '../terrain/terrain';
import { sampleAt, sampleSpan, spanWidth, type SpanPath, type SpanSample, type SpanSpec } from './spans';

type V = [number, number, number];

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const colourCache = new Map<string, THREE.Color>();
function colourOf(hex: string): THREE.Color {
  let c = colourCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colourCache.set(hex, c);
  }
  return c;
}

/** Collects triangles with positions, normals and a colour each; faces are wound to match their normals. */
class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];

  /** A quad whose corners go round in order; `n` is the outward direction (one for all, or one per corner). */
  quad(p: [V, V, V, V], n: V | [V, V, V, V], colour: string | THREE.Color) {
    const hints = (Array.isArray(n[0]) ? n : [n, n, n, n]) as [V, V, V, V];
    const fn = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const sum: V = [hints[0][0] + hints[1][0] + hints[2][0] + hints[3][0], hints[0][1] + hints[1][1] + hints[2][1] + hints[3][1], hints[0][2] + hints[1][2] + hints[2][2] + hints[3][2]];
    const order = dot(fn, sum) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 3, 2, 0, 2, 1];
    const c = typeof colour === 'string' ? colourOf(colour) : colour;
    for (const i of order) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(hints[i][0], hints[i][1], hints[i][2]);
      this.col.push(c.r, c.g, c.b);
    }
  }

  /** A box along the path: `f` runs along it, `l` across it. Sizes are along, up and across. */
  box(centre: V, f: V, l: V, size: V, colour: string) {
    const up: V = [0, 1, 0];
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    const at = (a: number, b: number, c: number): V => [
      centre[0] + f[0] * a * hx + up[0] * b * hy + l[0] * c * hz,
      centre[1] + f[1] * a * hx + up[1] * b * hy + l[1] * c * hz,
      centre[2] + f[2] * a * hx + up[2] * b * hy + l[2] * c * hz,
    ];
    const face = (n: V, corners: [V, V, V, V]) => this.quad(corners, n, colour);
    face(f, [at(1, -1, -1), at(1, 1, -1), at(1, 1, 1), at(1, -1, 1)]);
    face([-f[0], -f[1], -f[2]], [at(-1, -1, -1), at(-1, 1, -1), at(-1, 1, 1), at(-1, -1, 1)]);
    face(up, [at(-1, 1, -1), at(1, 1, -1), at(1, 1, 1), at(-1, 1, 1)]);
    face([0, -1, 0], [at(-1, -1, -1), at(1, -1, -1), at(1, -1, 1), at(-1, -1, 1)]);
    face(l, [at(-1, -1, 1), at(1, -1, 1), at(1, 1, 1), at(-1, 1, 1)]);
    face([-l[0], -l[1], -l[2]], [at(-1, -1, -1), at(1, -1, -1), at(1, 1, -1), at(-1, 1, -1)]);
  }

  /** A thin square bar between two points (cables, truss members, hangers). */
  tube(a: V, b: V, r: number, colour: string) {
    const axis = norm(sub(b, a));
    const ref: V = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(axis, ref));
    const w = norm(cross(axis, u));
    const corner = (p: V, su: number, sw: number): V => [p[0] + (u[0] * su + w[0] * sw) * r, p[1] + (u[1] * su + w[1] * sw) * r, p[2] + (u[2] * su + w[2] * sw) * r];
    // Corner i to corner i+1 forms the face whose outward direction is listed with corner i.
    const sides: [number, number, V][] = [
      [1, 1, w],
      [-1, 1, [-u[0], -u[1], -u[2]]],
      [-1, -1, [-w[0], -w[1], -w[2]]],
      [1, -1, u],
    ];
    for (let i = 0; i < 4; i++) {
      const [su0, sw0, n] = sides[i];
      const [su1, sw1] = sides[(i + 1) % 4];
      this.quad([corner(a, su0, sw0), corner(a, su1, sw1), corner(b, su1, sw1), corner(b, su0, sw0)], n, colour);
    }
  }

  /** An upright round column. */
  column(x: number, z: number, y0: number, y1: number, r: number, colour: string, sides = 10) {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const n0: V = [Math.cos(a0), 0, Math.sin(a0)];
      const n1: V = [Math.cos(a1), 0, Math.sin(a1)];
      this.quad(
        [
          [x + n0[0] * r, y0, z + n0[2] * r],
          [x + n1[0] * r, y0, z + n1[2] * r],
          [x + n1[0] * r, y1, z + n1[2] * r],
          [x + n0[0] * r, y1, z + n0[2] * r],
        ],
        [n0, n1, n1, n0],
        colour,
      );
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** One point of a deck cross-section; `c` colours the edge that starts here ("dash:#rrggbb" alternates with the road). */
interface ProfilePoint {
  u: number;
  v: number;
  c: string;
}

interface Frame {
  s: SpanSample;
  /** Unit vector across the path (flat). */
  lx: number;
  lz: number;
}

const frameOf = (s: SpanSample): Frame => ({ s, lx: -s.tz, lz: s.tx });

/** Extrudes a cross-section along the path between two sample indices. Closed profiles are clockwise (top left to right). */
function sweep(mesh: Mesh, frames: Frame[], profile: ProfilePoint[], closed: boolean, i0 = 0, i1 = frames.length - 1, fallback = '#888888') {
  const edges = closed ? profile.length : profile.length - 1;
  for (let i = i0; i < i1; i++) {
    const fa = frames[i];
    const fb = frames[i + 1];
    for (let e = 0; e < edges; e++) {
      const p = profile[e];
      const q = profile[(e + 1) % profile.length];
      const du = q.u - p.u;
      const dv = q.v - p.v;
      if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) continue;
      const at = (f: Frame, u: number, v: number): V => [f.s.x + f.lx * u, f.s.y + v, f.s.z + f.lz * u];
      const nrm = (f: Frame): V => norm([-dv * f.lx, du, -dv * f.lz]);
      let colour = p.c || fallback;
      if (colour.startsWith('dash:')) colour = i % 4 < 2 ? colour.slice(5) : '#3c3f44';
      mesh.quad([at(fa, p.u, p.v), at(fa, q.u, q.v), at(fb, q.u, q.v), at(fb, p.u, p.v)], [nrm(fa), nrm(fa), nrm(fb), nrm(fb)], colour);
    }
  }
  if (!closed) return;
  // End caps: a fan from the middle of the section.
  const cap = (f: Frame, sign: number) => {
    const cu = profile.reduce((a, p) => a + p.u, 0) / profile.length;
    const cv = profile.reduce((a, p) => a + p.v, 0) / profile.length;
    const n: V = [f.s.tx * sign, 0, f.s.tz * sign];
    for (let e = 0; e < profile.length; e++) {
      const p = profile[e];
      const q = profile[(e + 1) % profile.length];
      const at = (u: number, v: number): V => [f.s.x + f.lx * u, f.s.y + v, f.s.z + f.lz * u];
      mesh.quad([at(cu, cv), at(p.u, p.v), at(q.u, q.v), at(q.u, q.v)], n, p.c.startsWith('dash:') ? '#aaaaaa' : p.c || fallback);
    }
  };
  cap(frames[i0], -1);
  cap(frames[i1], 1);
}

const rect = (u0: number, u1: number, v0: number, v1: number, c: string): ProfilePoint[] => [
  { u: u0, v: v0, c },
  { u: u0, v: v1, c },
  { u: u1, v: v1, c },
  { u: u1, v: v0, c },
];

const SIDEWALK = '#b9b7b0';
const STEEL = '#a1a7ad';
const BALLAST = '#6e6a62';
const SLEEPER = '#4a3f33';

/** The top of a deck and its body, as one closed clockwise cross-section. */
function deckProfile(spec: SpanSpec, W: number, t: number): ProfilePoint[] {
  const top: ProfilePoint[] = [];
  if (spec.kind === 'road') {
    const lane = 3.3;
    const L = spec.lanes * lane;
    top.push({ u: -W / 2, v: 0.14, c: SIDEWALK }, { u: -L / 2, v: 0.14, c: spec.deck }, { u: -L / 2, v: 0, c: spec.surface });
    for (let k = 1; k < spec.lanes; k++) {
      const b = -L / 2 + k * lane;
      const centre = k * 2 === spec.lanes;
      top.push({ u: b - 0.07, v: 0, c: centre ? '#e0b020' : 'dash:#e8e8e8' }, { u: b + 0.07, v: 0, c: spec.surface });
    }
    top.push({ u: L / 2, v: 0, c: spec.deck }, { u: L / 2, v: 0.14, c: SIDEWALK }, { u: W / 2, v: 0.14, c: spec.deck });
  } else if (spec.kind === 'rail') {
    top.push({ u: -W / 2, v: 0, c: BALLAST });
    for (let k = 0; k < spec.lanes; k++) {
      const uc = (k - (spec.lanes - 1) / 2) * 4;
      for (const r of [-0.72, 0.72]) {
        top.push({ u: uc + r - 0.07, v: 0, c: STEEL }, { u: uc + r - 0.07, v: 0.17, c: STEEL }, { u: uc + r + 0.07, v: 0.17, c: STEEL }, { u: uc + r + 0.07, v: 0, c: BALLAST });
      }
    }
    top.push({ u: W / 2, v: 0, c: spec.deck });
  } else {
    top.push({ u: -W / 2, v: 0, c: spec.deck }, { u: -W / 2 + 0.25, v: 0, c: spec.surface }, { u: W / 2 - 0.25, v: 0, c: spec.deck }, { u: W / 2, v: 0, c: spec.deck });
  }
  const last = top[top.length - 1];
  const first = top[0];
  // Body below the top: a box girder (narrower at the bottom), or a plain slab under arches.
  const slab = spec.support === 'arches';
  const lower: ProfilePoint[] = slab
    ? [
        { u: last.u, v: -t, c: spec.deck },
        { u: first.u, v: -t, c: spec.deck },
      ]
    : [
        { u: last.u, v: -t * 0.3, c: spec.deck },
        { u: W * 0.3, v: -t, c: spec.deck },
        { u: -W * 0.3, v: -t, c: spec.deck },
        { u: first.u, v: -t * 0.3, c: spec.deck },
      ];
  // The top's final edge must point at the first lower corner, so give the last top point the deck colour.
  top[top.length - 1] = { ...last, c: spec.deck };
  return [...top, ...lower];
}

interface Built {
  geometry: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry | null;
  /** Solid surface for the walking player: the deck and its edge walls. */
  collider: { vertices: Float32Array; indices: Uint32Array };
}

const cache = new Map<string, Built>();
const CACHE_LIMIT = 24;

const disposeBuilt = (b: Built) => {
  b.geometry.dispose();
  b.lamps?.dispose();
};

/** Ground (or sea bed) under a point, relative to the anchor. */
const bedAt = (ax: number, az: number, x: number, z: number) => (hasTerrain() ? heightAt(ax + x, az + z) : 0);

/** The 3D geometry of a span, built once per distinct design and ground. */
export function buildSpan(spec: SpanSpec, ax: number, az: number): Built & { path: SpanPath } {
  const path = sampleSpan(spec, ax, az);
  let ground = 0;
  for (let i = 0; i < path.samples.length; i += 3) ground += bedAt(ax, az, path.samples[i].x, path.samples[i].z);
  const key = `${JSON.stringify(spec)}|${Math.round(ground * 10)}|${Math.round(path.deckY * 10)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return { ...hit, path };
  }
  const built = construct(spec, ax, az, path);
  cache.set(key, built);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string;
    disposeBuilt(cache.get(oldest)!);
    cache.delete(oldest);
  }
  return { ...built, path };
}

function construct(spec: SpanSpec, ax: number, az: number, path: SpanPath): Built {
  const W = spanWidth(spec);
  const t = Math.max(0.3, spec.thickness);
  const frames = path.samples.map(frameOf);
  const body = new Mesh();
  const lamps = new Mesh();
  const bed = (x: number, z: number) => bedAt(ax, az, x, z);
  const L = path.length;

  /** A point beside the path at distance `s`, `u` metres across and at height `y`. */
  const pt = (s: number, u: number, y: number): V => {
    const p = sampleAt(path, s);
    return [p.x - p.tz * u, y, p.z + p.tx * u];
  };
  const dir = (s: number): { f: V; l: V } => {
    const p = sampleAt(path, s);
    return { f: [p.tx, 0, p.tz], l: [-p.tz, 0, p.tx] };
  };
  const deckAt = (s: number) => sampleAt(path, s).y;

  // --- The deck ---
  sweep(body, frames, deckProfile(spec, W, t), true, 0, frames.length - 1, spec.deck);

  // --- Rail sleepers ---
  if (spec.kind === 'rail') {
    for (let s = 0.5; s < L; s += 1) {
      const p = sampleAt(path, s);
      const f: V = [p.tx, 0, p.tz];
      const l: V = [-p.tz, 0, p.tx];
      for (let k = 0; k < spec.lanes; k++) {
        const uc = (k - (spec.lanes - 1) / 2) * 4;
        body.box([p.x + l[0] * uc, p.y + 0.04, p.z + l[2] * uc], f, l, [0.28, 0.08, 2.5], SLEEPER);
      }
    }
  }

  // --- Railings along both edges ---
  const edgeU = W / 2 - 0.12;
  const barBase = spec.kind === 'road' ? 0.14 : 0;
  if (spec.railing === 'parapet') {
    const prof = rect(W / 2 - 0.34, W / 2, barBase, barBase + 1.0, spec.deck);
    sweep(body, frames, prof, true);
    sweep(body, frames, rect(-W / 2, -W / 2 + 0.34, barBase, barBase + 1.0, spec.deck), true);
  } else if (spec.railing === 'glass') {
    for (const side of [-1, 1]) {
      sweep(body, frames, rect(side * edgeU - 0.03, side * edgeU + 0.03, barBase + 0.1, barBase + 1.15, '#a9d3e6'), true);
      sweep(body, frames, rect(side * edgeU - 0.06, side * edgeU + 0.06, barBase + 1.15, barBase + 1.25, spec.frame), true);
    }
  } else if (spec.railing === 'rail') {
    for (const side of [-1, 1]) {
      sweep(body, frames, rect(side * edgeU - 0.04, side * edgeU + 0.04, barBase + 1.0, barBase + 1.1, spec.frame), true);
      sweep(body, frames, rect(side * edgeU - 0.03, side * edgeU + 0.03, barBase + 0.5, barBase + 0.56, spec.frame), true);
      for (let s = 0; s <= L; s += 2.5) {
        const d = dir(s);
        const p = pt(s, side * edgeU, deckAt(s) + barBase + 0.55);
        body.box(p, d.f, d.l, [0.08, 1.1, 0.08], spec.frame);
      }
    }
  }

  // --- Lamp posts ---
  if (spec.lights && spec.kind !== 'rail') {
    const h = spec.kind === 'road' ? 5.5 : 3.4;
    for (let s = 6; s < L - 3; s += 12) {
      for (const side of [-1, 1]) {
        const d = dir(s);
        const y = deckAt(s) + barBase;
        const post = pt(s, side * (W / 2 - 0.3), y + h / 2);
        body.box(post, d.f, d.l, [0.12, h, 0.12], '#2b2f35');
        const head = pt(s, side * (W / 2 - 0.3 - 0.45), y + h);
        body.box(head, d.f, d.l, [0.16, 0.12, 0.95], '#2b2f35');
        lamps.box([head[0], head[1] - 0.09, head[2]], d.f, d.l, [0.5, 0.05, 0.4], '#fff4d8');
      }
    }
  }

  // --- Supports ---
  const stations = Math.max(1, Math.round(L / Math.max(6, spec.spacing)));
  if (spec.support === 'pillars' || spec.support === 'piers') {
    for (let k = 1; k < stations; k++) {
      const s = (L * k) / stations;
      const p = sampleAt(path, s);
      const under = p.y - t;
      const floor = bed(p.x, p.z);
      if (under - floor < 1) continue;
      const d = dir(s);
      if (spec.support === 'pillars') {
        const two = W > 9;
        const offsets = two ? [-W * 0.27, W * 0.27] : [0];
        for (const u of offsets) {
          const c = pt(s, u, 0);
          body.column(c[0], c[2], floor - 0.5, under, Math.max(0.3, spec.pillar / 2), spec.support_colour);
        }
        if (two) body.box(pt(s, 0, under - 0.45), d.f, d.l, [spec.pillar * 1.5, 0.9, W * 0.6 + spec.pillar], spec.support_colour);
      } else {
        const wide = Math.max(2, W * 0.5);
        body.box(pt(s, 0, (floor - 0.5 + under - 0.9) / 2), d.f, d.l, [spec.pillar, under - 0.9 - (floor - 0.5), wide], spec.support_colour);
        body.box(pt(s, 0, under - 0.45), d.f, d.l, [spec.pillar * 1.3, 0.9, W * 0.85], spec.support_colour);
      }
    }
  } else if (spec.support === 'arches') {
    const Wb = W * 0.62;
    const bay = L / stations;
    const N = 10;
    for (let k = 0; k < stations; k++) {
      const sa = k * bay;
      const mid = sampleAt(path, sa + bay / 2);
      const clearance = mid.y - t - bed(mid.x, mid.z);
      if (clearance < 2.5) continue;
      const rise = Math.min(clearance * 0.6, bay * 0.42);
      const intrados = (s: number) => {
        const q = sampleAt(path, s);
        const f = (s - sa) / bay;
        return Math.max(bed(q.x, q.z) + 0.2, q.y - t - 0.9 - rise * (1 - Math.sin(Math.PI * f)));
      };
      for (let j = 0; j < N; j++) {
        const s0 = sa + (bay * j) / N;
        const s1 = sa + (bay * (j + 1)) / N;
        const h0 = intrados(s0);
        const h1 = intrados(s1);
        const u0 = deckAt(s0) - t;
        const u1 = deckAt(s1) - t;
        for (const side of [-1, 1]) {
          const n: V = [side * -sampleAt(path, s0).tz, 0, side * sampleAt(path, s0).tx];
          body.quad([pt(s0, side * Wb / 2, h0), pt(s0, side * Wb / 2, u0), pt(s1, side * Wb / 2, u1), pt(s1, side * Wb / 2, h1)], n, spec.support_colour);
        }
        body.quad([pt(s0, -Wb / 2, h0), pt(s0, Wb / 2, h0), pt(s1, Wb / 2, h1), pt(s1, -Wb / 2, h1)], [0, -1, 0], spec.support_colour);
      }
    }
    for (let k = 1; k < stations; k++) {
      const s = k * bay;
      const p = sampleAt(path, s);
      const floor = bed(p.x, p.z);
      const spring = p.y - t - 0.9 - Math.min((p.y - t - floor) * 0.6, bay * 0.42);
      if (spring - floor < 0.8) continue;
      const d = dir(s);
      body.box(pt(s, 0, (floor - 0.5 + spring) / 2), d.f, d.l, [Math.max(spec.pillar, bay * 0.1), spring - (floor - 0.5), Wb], spec.support_colour);
    }
  }

  // --- The frame above the deck ---
  const lf = path.levelFrom;
  const lt = path.levelTo;
  const Lm = lt - lf;
  const top = path.deckY;
  const H = spec.frameH;
  const frame = spec.frame;
  const towerU = W / 2 + 0.4;

  if (spec.structure === 'arch' && Lm > 12) {
    const M = Math.max(6, Math.ceil(Lm / 3));
    const rim = (u: number, j: number): V => {
      const q = j / M;
      return pt(lf + Lm * q, u, top + 0.2 + H * (1 - (2 * q - 1) ** 2));
    };
    for (const sd of [-1, 1]) {
      const u = sd * (W / 2 - 0.25);
      for (let j = 0; j < M; j++) body.tube(rim(u, j), rim(u, j + 1), 0.34, frame);
      for (let j = 1; j < M; j++) {
        const a = rim(u, j);
        if (a[1] - top > 1) body.tube(a, pt(lf + (Lm * j) / M, u, top + 0.3), 0.07, frame);
      }
    }
    for (let j = 2; j < M - 1; j += 2) {
      const a = rim(-(W / 2 - 0.25), j);
      if (a[1] - top > 4) body.tube(a, rim(W / 2 - 0.25, j), 0.24, frame);
    }
  } else if (spec.structure === 'truss' && Lm > 12) {
    const panels = Math.max(2, Math.round(Lm / Math.max(3, H * 1.1)));
    for (const sd of [-1, 1]) {
      const u = sd * (W / 2 - 0.15);
      const node = (i: number, high: boolean) => pt(lf + (Lm * i) / panels, u, top + (high ? H : 0.2));
      body.tube(node(0, false), node(panels, false), 0.2, frame);
      body.tube(node(0, true), node(panels, true), 0.22, frame);
      for (let i = 0; i <= panels; i++) body.tube(node(i, false), node(i, true), 0.16, frame);
      for (let i = 0; i < panels; i++) {
        if (i < panels / 2) body.tube(node(i, false), node(i + 1, true), 0.14, frame);
        else body.tube(node(i, true), node(i + 1, false), 0.14, frame);
      }
    }
    for (let i = 0; i <= panels; i += 2) body.tube(pt(lf + (Lm * i) / panels, -(W / 2 - 0.15), top + H), pt(lf + (Lm * i) / panels, W / 2 - 0.15, top + H), 0.14, frame);
  } else if (spec.structure === 'suspension' && Lm > 50) {
    const sA = lf + Lm * 0.17;
    const sB = lf + Lm * 0.83;
    const towerTop = top + H;
    const cableY = (s: number) => {
      if (s <= sA) return top + 0.6 + (towerTop - top - 0.6) * ((s - lf) / (sA - lf));
      if (s >= sB) return top + 0.6 + (towerTop - top - 0.6) * ((lt - s) / (lt - sB));
      const q = (s - sA) / (sB - sA);
      return top + 2.2 + (towerTop - top - 2.2) * (2 * q - 1) ** 2;
    };
    for (const sTower of [sA, sB]) {
      const p = sampleAt(path, sTower);
      const d = dir(sTower);
      const floor = bed(p.x, p.z);
      for (const sd of [-1, 1]) {
        const base = pt(sTower, sd * towerU, 0);
        const y0 = floor - 0.5;
        body.box([base[0], (y0 + towerTop) / 2, base[2]], d.f, d.l, [2.2, towerTop - y0, 1.6], frame);
      }
      for (const level of [0.5, 0.96]) body.box(pt(sTower, 0, top + H * level), d.f, d.l, [1.4, 1.3, towerU * 2], frame);
    }
    const stops = [lf, sA, sB, lt];
    for (const sd of [-1, 1]) {
      const u = sd * towerU;
      for (let a = 0; a < stops.length - 1; a++) {
        const n = a === 1 ? Math.max(6, Math.ceil((sB - sA) / 4)) : 2;
        for (let j = 0; j < n; j++) {
          const s0 = stops[a] + ((stops[a + 1] - stops[a]) * j) / n;
          const s1 = stops[a] + ((stops[a + 1] - stops[a]) * (j + 1)) / n;
          body.tube(pt(s0, u, cableY(s0)), pt(s1, u, cableY(s1)), 0.3, frame);
        }
      }
      for (let s = lf + 6; s < lt - 3; s += 6) {
        const y = cableY(s);
        if (y - top > 1.2) body.tube(pt(s, u, y), pt(s, u, top + 0.3), 0.07, frame);
      }
    }
  } else if (spec.structure === 'cable' && Lm > 50) {
    const towers = Lm < 140 ? [lf + Lm / 2] : [lf + Lm * 0.3, lf + Lm * 0.7];
    const towerTop = top + H;
    for (const sTower of towers) {
      const p = sampleAt(path, sTower);
      const d = dir(sTower);
      const floor = bed(p.x, p.z);
      for (const sd of [-1, 1]) {
        const base = pt(sTower, sd * towerU, 0);
        body.box([base[0], (floor - 0.5 + towerTop) / 2, base[2]], d.f, d.l, [1.8, towerTop - (floor - 0.5), 1.4], frame);
      }
      body.box(pt(sTower, 0, towerTop - 0.6), d.f, d.l, [1.2, 1.2, towerU * 2], frame);
      body.box(pt(sTower, 0, top + H * 0.45), d.f, d.l, [1.2, 1, towerU * 2], frame);
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 8; k++) {
          const attach = towerTop - 1 - (H * 0.45 * (7 - k)) / 7;
          for (const away of [-1, 1]) {
            const sAnchor = sTower + away * (7 + k * (Lm / 2 / 9));
            if (sAnchor < 2 || sAnchor > L - 2) continue;
            body.tube(pt(sTower, sd * towerU, attach), pt(sAnchor, sd * (W / 2 - 0.3), deckAt(sAnchor) + 0.3), 0.1, frame);
          }
        }
      }
    }
  }

  // --- What the walking player stands on: the deck and a low wall along each edge ---
  const phys = new Mesh();
  sweep(phys, frames, rect(-W / 2, W / 2, -t, 0, '#888888'), true);
  const wall = spec.railing === 'none' ? 0.5 : 1.2;
  sweep(phys, frames, rect(W / 2 - 0.3, W / 2, 0, wall, '#888888'), true);
  sweep(phys, frames, rect(-W / 2, -W / 2 + 0.3, 0, wall, '#888888'), true);
  const vertices = new Float32Array(phys.pos);
  const indices = new Uint32Array(vertices.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;

  return { geometry: body.geometry(), lamps: lamps.pos.length > 0 ? lamps.geometry() : null, collider: { vertices, indices } };
}
