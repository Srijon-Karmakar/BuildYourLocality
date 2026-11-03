import { MAX_SPAN_LENGTH, SPAN_PRESETS, pathLength, resolveSpan } from '../city/spans';
import { MIN_SPAN_LENGTH, commitSpanDraft } from '../city/spanTool';
import { useBuilderStore } from '../state/useBuilderStore';
import { useIsTouch } from './useMediaQuery';
import { SpanEditor } from './SpanEditor';

const button = 'min-h-9 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/85 transition hover:bg-white/20 active:bg-white/25 disabled:opacity-30 sm:min-h-0 sm:py-1';

/** The bridge tool's panel: what is being built, the points placed so far, and every design setting. */
export function SpanSettings() {
  const span = useBuilderStore((s) => s.span);
  const preset = useBuilderStore((s) => s.spanPreset);
  const draft = useBuilderStore((s) => s.spanDraft);
  const setSpan = useBuilderStore((s) => s.setSpan);
  const applySpanPreset = useBuilderStore((s) => s.applySpanPreset);
  const popSpanPoint = useBuilderStore((s) => s.popSpanPoint);
  const clearSpanDraft = useBuilderStore((s) => s.clearSpanDraft);
  const touch = useIsTouch();
  const template = SPAN_PRESETS.find((p) => p.id === preset)?.template;
  const length = pathLength(draft);
  const tooLong = length > MAX_SPAN_LENGTH;
  const ready = draft.length >= 2 && length >= MIN_SPAN_LENGTH && !tooLong;

  return (
    <div className="flex flex-col gap-3">
      {template ? (
        <p className="text-xs text-white/60">Click to drop this ramp. {touch ? '' : 'R turns it. '}End it up at deck height and join it to a bridge.</p>
      ) : (
        <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2 text-xs text-white/75">
          <div>
            {draft.length === 0
              ? 'Click the start of the bridge.'
              : draft.length === 1
                ? 'Click the next point on the path.'
                : `${draft.length} points, ${Math.round(length)} m${tooLong ? ' (too long)' : ''}. Keep clicking to bend it, or finish.`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className={button + (ready ? ' !bg-white !text-black' : '')} disabled={!ready} onClick={() => commitSpanDraft()}>
              Build it {!touch && <span className="opacity-60">Enter</span>}
            </button>
            <button className={button} disabled={draft.length === 0} onClick={popSpanPoint}>
              Undo point
            </button>
            <button className={button} disabled={draft.length === 0} onClick={clearSpanDraft}>
              Cancel
            </button>
          </div>
          {!touch && <div className="text-white/45">Click the last point again to finish. Bridges rise from the ground and pass over roads, rivers and buildings.</div>}
        </div>
      )}
      <SpanEditor spec={resolveSpan(span)} onChange={setSpan} onPreset={applySpanPreset} activePreset={preset} />
    </div>
  );
}
