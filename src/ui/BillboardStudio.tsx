import { useState } from 'react';
import {
  LED_LAYER_ANIMS,
  LED_LAYER_KINDS,
  LED_MAX_LAYERS,
  resolveBoard,
  type BoardSpec,
  type LedFont,
  type LedLayer,
  type LedLayerAnim,
  type LedLayerKind,
  type LedSpec,
} from '../city/catalog';
import { Chips, Colour, Group, Slider, chip, useDraft } from './LedEditor';

const newLayerId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

const LAYER_DEFAULTS: Record<LedLayerKind, Partial<LedLayer>> = {
  text: { text: 'SALE', x: 0.5, y: 0.5, w: 0.6, h: 0.4, color: '#ffffff' },
  rect: { x: 0.5, y: 0.5, w: 0.4, h: 0.3, color: '#ff3b30' },
  ellipse: { x: 0.5, y: 0.5, w: 0.25, h: 0.5, color: '#ffd60a' },
  line: { x: 0.5, y: 0.5, w: 0.7, h: 0.04, color: '#32d4ff' },
};

/** A text box that passes its value on a moment after typing stops. */
function DraftText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useDraft(value, onChange, 250);
  return (
    <input
      value={draft}
      maxLength={80}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      className="min-h-9 w-full rounded-lg bg-white/10 px-3 py-2 text-base text-white outline-none placeholder:text-white/35 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 sm:text-sm"
    />
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Everything a billboard can be: its size, supports and lean, and any number of layers (words and
 * shapes with their own place, size, turn, colour and movement) painted over the screen's look.
 */
export function BillboardStudio({ spec, onChange }: { spec: LedSpec; onChange: (change: Partial<LedSpec>) => void }) {
  const board = resolveBoard(spec.board);
  const layers = spec.layers ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const setBoard = (patch: Partial<BoardSpec>) => onChange({ board: { ...spec.board, ...patch } });
  const setLayers = (next: LedLayer[]) => onChange({ layers: next });
  const patchLayer = (id: string, patch: Partial<LedLayer>) => setLayers(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const move = (id: string, by: number) => {
    const i = layers.findIndex((l) => l.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= layers.length) return;
    const next = layers.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  };
  const add = (kind: LedLayerKind) => {
    if (layers.length >= LED_MAX_LAYERS) return;
    const layer: LedLayer = { id: newLayerId(), kind, x: 0.5, y: 0.5, w: 0.3, h: 0.3, rot: 0, color: '#ffffff', opacity: 1, anim: 'none', speed: 1, ...LAYER_DEFAULTS[kind] };
    setLayers([...layers, layer]);
    setSelectedId(layer.id);
  };

  return (
    <div className="flex flex-col gap-3 text-xs sm:text-sm">
      <Group title="Board">
        <Slider label="Width" value={board.w} min={3} max={30} step={0.5} format={(v) => `${v} m`} onChange={(w) => setBoard({ w })} />
        <Slider label="Height" value={board.h} min={1.5} max={14} step={0.5} format={(v) => `${v} m`} onChange={(h) => setBoard({ h })} />
        <Slider label="Stand height" value={board.mast} min={0} max={30} step={0.5} format={(v) => `${v} m`} onChange={(mast) => setBoard({ mast })} />
        <Slider label="Lean back" value={board.tilt} min={-30} max={30} step={1} format={(v) => `${v}°`} onChange={(tilt) => setBoard({ tilt })} />
        <Slider label="Frame" value={board.thick} min={0.1} max={1.2} step={0.05} format={(v) => `${v} m`} onChange={(thick) => setBoard({ thick })} />
        <Chips<BoardSpec['poles']>
          value={board.poles}
          options={[
            { id: 'two', label: 'Two posts' },
            { id: 'one', label: 'One post' },
            { id: 'none', label: 'No posts' },
          ]}
          onChange={(poles) => setBoard({ poles })}
        />
        <Chips<BoardSpec['sides']>
          value={board.sides}
          options={[
            { id: 'two', label: 'Both sides' },
            { id: 'one', label: 'Front only' },
          ]}
          onChange={(sides) => setBoard({ sides })}
        />
      </Group>

      <Group title={`Layers (${layers.length})`}>
        <div className="flex flex-wrap gap-1.5">
          {LED_LAYER_KINDS.map((k) => (
            <button key={k.id} className={chip(false)} onClick={() => add(k.id)}>
              + {k.label}
            </button>
          ))}
        </div>
        {layers.length === 0 && <p className="text-white/45">Add text and shapes on top of the screen. There is no limit.</p>}
        <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
          {layers.map((l, i) => (
            <li key={l.id}>
              <button
                onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${l.id === selectedId ? 'bg-white text-black' : 'bg-white/10 text-white/85 hover:bg-white/15'}`}
              >
                <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-white/30" style={{ background: l.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}. {l.kind === 'text' ? l.text || 'Text' : LED_LAYER_KINDS.find((k) => k.id === l.kind)?.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Group>

      {selected && (
        <Group title="Selected layer">
          {selected.kind === 'text' && (
            <>
              <DraftText value={selected.text ?? ''} placeholder="Words to show" onChange={(text) => patchLayer(selected.id, { text })} />
              <Chips<LedFont>
                value={selected.font ?? 'bold'}
                options={[
                  { id: 'bold', label: 'Bold' },
                  { id: 'round', label: 'Round' },
                  { id: 'serif', label: 'Serif' },
                  { id: 'mono', label: 'Mono' },
                  { id: 'pixel', label: 'Pixel' },
                ]}
                onChange={(font) => patchLayer(selected.id, { font })}
              />
            </>
          )}
          <Slider label="Across" value={selected.x} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(x) => patchLayer(selected.id, { x })} />
          <Slider label="Down" value={selected.y} min={-0.5} max={1.5} step={0.01} format={pct} onChange={(y) => patchLayer(selected.id, { y })} />
          {selected.kind !== 'text' && (
            <Slider label={selected.kind === 'line' ? 'Length' : 'Width'} value={selected.w} min={0.01} max={3} step={0.01} format={pct} onChange={(w) => patchLayer(selected.id, { w })} />
          )}
          <Slider
            label={selected.kind === 'text' ? 'Letter size' : selected.kind === 'line' ? 'Thickness' : 'Height'}
            value={selected.h}
            min={0.01}
            max={selected.kind === 'line' ? 0.5 : 3}
            step={0.01}
            format={pct}
            onChange={(h) => patchLayer(selected.id, { h })}
          />
          <Slider label="Turn" value={selected.rot} min={-180} max={180} step={1} format={(v) => `${v}°`} onChange={(rot) => patchLayer(selected.id, { rot })} />
          <Slider label="Opacity" value={selected.opacity} min={0.05} max={1} step={0.05} format={pct} onChange={(opacity) => patchLayer(selected.id, { opacity })} />
          <div className="grid grid-cols-3 items-end gap-2">
            <Colour label="Colour" value={selected.color} onChange={(color) => patchLayer(selected.id, { color })} />
            <Colour label="Fade to" value={selected.color2 ?? selected.color} onChange={(color2) => patchLayer(selected.id, { color2 })} />
            <button className={chip(false)} disabled={!selected.color2} onClick={() => patchLayer(selected.id, { color2: undefined })}>
              No fade
            </button>
          </div>
          <Chips<LedLayerAnim> value={selected.anim} options={LED_LAYER_ANIMS} onChange={(anim) => patchLayer(selected.id, { anim })} />
          {selected.anim !== 'none' && <Slider label="Speed" value={selected.speed} min={0.25} max={3} step={0.25} format={(v) => `${v}x`} onChange={(speed) => patchLayer(selected.id, { speed })} />}
          <div className="flex flex-wrap gap-1.5">
            <button className={chip(false)} onClick={() => move(selected.id, 1)}>
              Up
            </button>
            <button className={chip(false)} onClick={() => move(selected.id, -1)}>
              Down
            </button>
            <button
              className={chip(false)}
              onClick={() => {
                if (layers.length >= LED_MAX_LAYERS) return;
                const copy = { ...selected, id: newLayerId(), x: selected.x + 0.03, y: selected.y + 0.03 };
                setLayers([...layers, copy]);
                setSelectedId(copy.id);
              }}
            >
              Copy
            </button>
            <button
              className={`${chip(false)} !text-red-300`}
              onClick={() => {
                setLayers(layers.filter((l) => l.id !== selected.id));
                setSelectedId(null);
              }}
            >
              Delete
            </button>
          </div>
        </Group>
      )}
      {layers.length > 1 && (
        <button
          className={`${chip(false)} self-start !text-red-300`}
          onClick={() => {
            setLayers([]);
            setSelectedId(null);
          }}
        >
          Remove all layers
        </button>
      )}
    </div>
  );
}
