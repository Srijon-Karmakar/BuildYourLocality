import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  FACADES,
  PIECES,
  PIECE_TYPES,
  ROOFS,
  type Category,
} from '../city/catalog';
import { useBuilderStore, type BuilderTool } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';

const TOOLS_TAB = 'tools' as const;
type Tab = Category | typeof TOOLS_TAB;

const TABS: { id: Tab; label: string }[] = [...CATEGORIES, { id: TOOLS_TAB, label: 'Tools' }];

const ITEMS: Record<Tab, { id: BuilderTool; label: string }[]> = {
  roads: [],
  buildings: [],
  nature: [],
  tools: [
    { id: 'select', label: 'Edit building' },
    { id: 'paint', label: 'Paint' },
    { id: 'bulldoze', label: 'Delete' },
  ],
};
for (const type of PIECE_TYPES) ITEMS[PIECES[type].category].push({ id: type, label: PIECES[type].label });

const swatchClass = (active: boolean) =>
  `h-7 w-7 rounded-full border-2 transition ${active ? 'border-white scale-110' : 'border-white/20 hover:border-white/60'}`;

/** Bottom hotbar (category tabs + pieces) and a left-hand material picker. Build mode only. */
export function BuildPalette() {
  const mode = useGameStore((s) => s.mode);
  const { tool, facade, roof, setTool, setFacade, setRoof } = useBuilderStore();
  const [tab, setTab] = useState<Tab>('roads');
  const undo = useCityStore((s) => s.undo);
  const redo = useCityStore((s) => s.redo);
  const clear = useCityStore((s) => s.clear);
  const canUndo = useCityStore((s) => s.past.length > 0);
  const canRedo = useCityStore((s) => s.future.length > 0);
  const hasPieces = useCityStore((s) => Object.keys(s.pieces).length > 0);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (mode !== 'build') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const match = /^Digit([1-9])$/.exec(e.code);
      const item = match ? ITEMS[tab][Number(match[1]) - 1] : undefined;
      if (item) setTool(item.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, tab, setTool]);

  if (mode !== 'build') return null;

  const selectTab = (next: Tab) => {
    setTab(next);
    const first = ITEMS[next][0];
    if (first && !ITEMS[next].some((i) => i.id === tool)) setTool(first.id);
  };
  const showMaterials = tool === 'paint' || (tool in PIECES && PIECES[tool as keyof typeof PIECES].paintable);
  const small = 'rounded-lg px-3 py-1 text-xs transition disabled:opacity-30 ';

  return (
    <>
      {showMaterials && (
        <div className="pointer-events-auto absolute left-4 top-1/2 flex -translate-y-1/2 flex-col gap-3 rounded-xl bg-black/55 p-3 text-xs text-white backdrop-blur-sm">
          <div>
            <div className="mb-1.5 text-white/60">Facade</div>
            <div className="grid grid-cols-3 gap-1.5">
              {FACADES.map((f) => (
                <button
                  key={f.id}
                  title={f.label}
                  onClick={() => setFacade(f.id)}
                  className={swatchClass(facade === f.id)}
                  style={{ backgroundColor: f.swatch }}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-white/60">Roof</div>
            <div className="grid grid-cols-3 gap-1.5">
              {ROOFS.map((r) => (
                <button
                  key={r.id}
                  title={r.label}
                  onClick={() => setRoof(r.id)}
                  className={swatchClass(roof === r.id)}
                  style={{ backgroundColor: r.swatch }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 p-4">
        <div className="flex gap-1 rounded-xl bg-black/50 p-1.5 text-sm text-white backdrop-blur-sm">
          {ITEMS[tab].map((item, i) => (
            <button
              key={item.id}
              onClick={() => setTool(item.id)}
              className={`rounded-lg px-3 py-1.5 transition ${
                tool === item.id ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
              }`}
            >
              <span className="mr-1.5 text-xs opacity-60">{i + 1}</span>
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-black/40 p-1 text-xs text-white backdrop-blur-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`rounded-lg px-3 py-1 transition ${
                tab === t.id ? 'bg-white/90 text-black' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/20" />
          <button className={small + 'text-white/80 hover:bg-white/10'} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className={small + 'text-white/80 hover:bg-white/10'} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <button
            className={small + (confirmClear ? 'bg-red-600 text-white' : 'text-red-300 hover:bg-red-500/20')}
            disabled={!hasPieces}
            onBlur={() => setConfirmClear(false)}
            onClick={() => {
              if (confirmClear) {
                clear();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
              }
            }}
            title="Delete everything (undoable)"
          >
            {confirmClear ? 'Really clear?' : 'Clear all'}
          </button>
        </div>
        <div className="rounded-md bg-black/40 px-2 py-0.5 text-xs text-white/70">
          Click: place · R: rotate · Del/X: delete · Ctrl+Z: undo · WASD: pan · Q/E: turn · Right-drag: orbit · Wheel: zoom · Tab: walk
        </div>
      </div>
    </>
  );
}
