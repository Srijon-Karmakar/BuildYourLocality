import { PIECES, isCornerType, type PieceType } from '../city/catalog';
import { useBuilderStore } from '../state/useBuilderStore';
import { useGameStore } from '../state/useGameStore';
import { Icon } from './icons';

/** Tools that place a single piece which can be turned (roads and brushes are not among them). */
const turnable = (tool: string, moving: boolean) => moving || (tool in PIECES && tool !== 'road' && tool !== 'span');

/**
 * A turn control that is always on screen while placing or moving something: left and right in quarter-turns
 * (R still works too). Streetlights and traffic lights start in "Auto" (arm over the nearest road) until turned.
 */
export function RotateControl() {
  const mode = useGameStore((s) => s.mode);
  const tool = useBuilderStore((s) => s.tool);
  const moving = useBuilderStore((s) => !!s.movingId);
  const rotation = useBuilderStore((s) => s.rotation);
  const auto = useBuilderStore((s) => s.rotationAuto);
  const rotate = useBuilderStore((s) => s.rotate);
  const rotateBack = useBuilderStore((s) => s.rotateBack);
  const resetRotation = useBuilderStore((s) => s.resetRotation);
  if (mode !== 'build' || !turnable(tool, moving)) return null;
  const corner = !moving && isCornerType(tool as PieceType);
  const label = corner && auto ? 'Auto' : `${rotation * 90}°`;
  const btn = 'flex h-10 w-10 items-center justify-center rounded-full text-lg text-white active:bg-white/30 sm:h-9 sm:w-9 sm:hover:bg-white/20';
  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-1 rounded-full bg-black/45 p-1 backdrop-blur-[6px] pointer-coarse:bg-black/70"
      style={{ right: 'calc(var(--safe-right) + 0.75rem)', bottom: 'calc(var(--safe-bottom) + 6.2rem)' }}
    >
      <button className={btn} onClick={rotateBack} aria-label="Turn left" title="Turn left (Shift+R)">
        <Icon name="rotateBack" />
      </button>
      <button
        className="min-w-12 px-1 text-center text-xs tabular-nums text-white/85"
        onClick={resetRotation}
        aria-label="Reset the turn"
        title={corner ? 'Back to automatic (arm over the road)' : 'Back to 0°'}
      >
        {label}
      </button>
      <button className={btn} onClick={rotate} aria-label="Turn right" title="Turn right (R)">
        <Icon name="rotate" />
      </button>
    </div>
  );
}
