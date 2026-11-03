import { CELL } from './catalog';
import { MAX_SPAN_LENGTH, MAX_SPAN_POINTS, SPAN_PRESETS, pathLength, resolveSpan, type SpanSpec } from './spans';
import { useBuilderStore } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';

/** Waypoints sit on a half-cell grid (3 m), which lines up with the centres and edges of the city grid. */
const SNAP = CELL / 2;
export const snapSpanPoint = (x: number, z: number): [number, number] => [Math.round(x / SNAP) * SNAP, Math.round(z / SNAP) * SNAP];

/** Shortest and longest bridge that can be built, in metres. */
export const MIN_SPAN_LENGTH = 6;

/** Turns world-space waypoints into a piece (anchored at the first one's cell) and places it. */
export function placeSpan(points: [number, number][], spec: Partial<SpanSpec>): boolean {
  if (points.length < 2 || points.length > MAX_SPAN_POINTS) return false;
  const length = pathLength(points);
  if (length < MIN_SPAN_LENGTH || length > MAX_SPAN_LENGTH) return false;
  const gx = Math.floor(points[0][0] / CELL);
  const gz = Math.floor(points[0][1] / CELL);
  const cx = (gx + 0.5) * CELL;
  const cz = (gz + 0.5) * CELL;
  const pts = points.map(([x, z]): [number, number] => [Math.round((x - cx) * 10) / 10, Math.round((z - cz) * 10) / 10]);
  return useCityStore.getState().place({ type: 'span', gx, gz, rot: 0, facade: 'brick', roof: 'gravel', span: { ...spec, pts } });
}

/** The drawing brush without its path. */
export function brushSpec(): Partial<SpanSpec> {
  const { pts: _pts, ...rest } = resolveSpan(useBuilderStore.getState().span);
  void _pts;
  return rest;
}

/** Finishes the bridge being drawn. Returns false when it is too short or too long. */
export function commitSpanDraft(): boolean {
  const b = useBuilderStore.getState();
  if (!placeSpan(b.spanDraft, brushSpec())) return false;
  b.clearSpanDraft();
  return true;
}

/** A ready-made path (loop or slip ramp) of the active preset, turned by quarter-turns and moved to a point. */
export function templatePoints(x: number, z: number, rotation: number): [number, number][] | null {
  const b = useBuilderStore.getState();
  const template = SPAN_PRESETS.find((p) => p.id === b.spanPreset)?.template;
  if (!template) return null;
  const [sx, sz] = snapSpanPoint(x, z);
  const a = (rotation * Math.PI) / 2;
  const cos = Math.round(Math.cos(a));
  const sin = Math.round(Math.sin(a));
  return template.map(([px, pz]): [number, number] => [sx + px * cos - pz * sin, sz + px * sin + pz * cos]);
}

/** Places the active preset's ready-made path at a point. */
export function placeTemplate(x: number, z: number, rotation: number): boolean {
  const points = templatePoints(x, z, rotation);
  return points ? placeSpan(points, brushSpec()) : false;
}
