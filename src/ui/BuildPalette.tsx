import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  FACADES,
  PIECES,
  PIECE_TYPES,
  ROOFS,
  type Category,
  type PieceType,
} from '../city/catalog';
import { useBuilderStore, type BuilderTool } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { useIsCompact, useIsTouch } from './useMediaQuery';

const TOOLS_TAB = 'tools' as const;
type Tab = Category | typeof TOOLS_TAB;

const TABS: { id: Tab; label: string }[] = [...CATEGORIES, { id: TOOLS_TAB, label: 'Tools' }];

const ICONS: Partial<Record<BuilderTool, string>> = {
  road: '🛣️',
  house: '🏠',
  villa: '🏡',
  shop: '🏪',
  cafe: '☕',
  apartment: '🏘️',
  warehouse: '🏭',
  office: '🏢',
  hotel: '🏨',
  mall: '🛍️',
  tower: '🗼',
  skyscraper: '🌆',
  tree: '🌳',
  pine: '🌲',
  hedge: '🌿',
  park: '🏞️',
  fountain: '⛲',
  lamp: '💡',
  bench: '🪑',
  busstop: '🚏',
  billboard: '📺',
  kiosk: '🛒',
  trafficlight: '🚦',
  plaza: '⬜',
  select: '✏️',
  paint: '🎨',
  bulldoze: '🗑️',
};

const ITEMS: Record<Tab, { id: BuilderTool; label: string }[]> = {
  roads: [],
  buildings: [],
  nature: [],
  street: [],
  tools: [
    { id: 'select', label: 'Edit' },
    { id: 'paint', label: 'Paint' },
    { id: 'bulldoze', label: 'Delete' },
  ],
};
for (const type of PIECE_TYPES) ITEMS[PIECES[type].category].push({ id: type, label: PIECES[type].label });

const swatchClass = (active: boolean) =>
  `h-9 w-9 rounded-full border-2 transition sm:h-7 sm:w-7 ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;

const glass = 'bg-black/55 backdrop-blur-md';

/** The tool dock: scrollable item row, category tabs, undo/redo, plus the material picker. */
export function BuildPalette() {
  const mode = useGameStore((s) => s.mode);
  const { tool, facade, roof, selectedId, setTool, setFacade, setRoof } = useBuilderStore();
  const [tab, setTab] = useState<Tab>('roads');
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const undo = useCityStore((s) => s.undo);
  const redo = useCityStore((s) => s.redo);
  const clear = useCityStore((s) => s.clear);
  const canUndo = useCityStore((s) => s.past.length > 0);
  const canRedo = useCityStore((s) => s.future.length > 0);
  const hasPieces = useCityStore((s) => Object.keys(s.pieces).length > 0);
  const [confirmClear, setConfirmClear] = useState(false);
  const compact = useIsCompact();
  const touch = useIsTouch();

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

  // The inspector takes over the bottom of a small screen while a building is open.
  if (mode !== 'build' || (compact && selectedId)) return null;

  const selectTab = (next: Tab) => {
    setTab(next);
    const first = ITEMS[next][0];
    if (first && !ITEMS[next].some((i) => i.id === tool)) setTool(first.id);
  };
  const showMaterials = tool === 'paint' || (tool in PIECES && PIECES[tool as PieceType].paintable);
  const presetChip = (active: boolean) =>
    `col-span-4 rounded-md px-2 py-2 text-xs transition sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

  const materials = (
    <div className="flex flex-col gap-3 text-xs text-white">
      <div>
        <div className="mb-1.5 text-white/60">Facade</div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-4 sm:gap-1.5">
          <button onClick={() => setFacade('preset')} className={presetChip(facade === 'preset').replace('col-span-4', 'col-span-6 sm:col-span-4')}>
            Preset look
          </button>
          {FACADES.map((f) => (
            <button key={f.id} title={f.label} onClick={() => setFacade(f.id)} className={swatchClass(facade === f.id)} style={{ backgroundColor: f.swatch }} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-white/60">Roof</div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-4 sm:gap-1.5">
          <button onClick={() => setRoof('preset')} className={presetChip(roof === 'preset').replace('col-span-4', 'col-span-6 sm:col-span-4')}>
            Preset look
          </button>
          {ROOFS.map((r) => (
            <button key={r.id} title={r.label} onClick={() => setRoof(r.id)} className={swatchClass(roof === r.id)} style={{ backgroundColor: r.swatch }} />
          ))}
        </div>
      </div>
    </div>
  );

  const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg transition disabled:opacity-30 sm:h-8 sm:w-8 sm:text-base';

  return (
    <>
      {/* Desktop: a fixed side panel. Phone: a sheet opened from the dock's palette button. */}
      {showMaterials && !compact && (
        <div className={`pointer-events-auto absolute left-4 top-1/2 max-h-[80vh] -translate-y-1/2 overflow-y-auto rounded-xl p-3 ${glass}`}>
          {materials}
        </div>
      )}
      {showMaterials && compact && materialsOpen && (
        <div
          className={`pointer-events-auto absolute inset-x-2 max-h-[45dvh] overflow-y-auto rounded-2xl p-4 ${glass}`}
          style={{ bottom: 'calc(var(--safe-bottom) + 10.5rem)' }}
        >
          {materials}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 px-2 pt-2 sm:px-4 sm:pb-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
      >
        {/* Item row: scrolls sideways on a phone, wraps on a desktop. */}
        <div className={`no-scrollbar pointer-events-auto flex w-full max-w-full gap-1.5 overflow-x-auto rounded-2xl p-1.5 sm:w-auto sm:max-w-[92vw] sm:flex-wrap sm:justify-center sm:overflow-visible ${glass}`}>
          {ITEMS[tab].map((item, i) => (
            <button
              key={item.id}
              onClick={() => setTool(item.id)}
              className={`flex min-h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] leading-tight transition sm:min-h-0 sm:min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm ${
                tool === item.id ? 'bg-white text-black' : 'text-white/80 active:bg-white/20 sm:hover:bg-white/10'
              }`}
            >
              <span className="text-xl sm:text-base">{ICONS[item.id]}</span>
              <span className="whitespace-nowrap">
                <span className="mr-1 hidden text-xs opacity-60 sm:inline">{i + 1}</span>
                {item.label}
              </span>
            </button>
          ))}
          {tab === TOOLS_TAB && (
            <button
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
              className={`flex min-h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-[11px] transition disabled:opacity-30 sm:min-h-0 sm:flex-row sm:px-3 sm:py-1.5 sm:text-sm ${confirmClear ? 'bg-red-600 text-white' : 'text-red-300 active:bg-red-500/20 sm:hover:bg-red-500/20'}`}
              title="Delete everything (undoable)"
            >
              <span className="text-xl sm:mr-1.5 sm:text-base">💥</span>
              {confirmClear ? 'Sure?' : 'Clear all'}
            </button>
          )}
        </div>

        <div className={`no-scrollbar pointer-events-auto flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1 text-xs text-white sm:w-auto ${glass}`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`min-h-11 shrink-0 rounded-xl px-3.5 transition sm:min-h-0 sm:px-3 sm:py-1 ${
                tab === t.id ? 'bg-white/90 text-black' : 'text-white/70 active:bg-white/15 sm:hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-white/20" />
          <button className={iconBtn + ' text-white/90 hover:bg-white/10'} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
            ↶
          </button>
          <button className={iconBtn + ' text-white/90 hover:bg-white/10'} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            ↷
          </button>
          {compact && showMaterials && (
            <button
              className={iconBtn + (materialsOpen ? ' bg-white text-black' : ' text-white/90 hover:bg-white/10')}
              onClick={() => setMaterialsOpen((v) => !v)}
              aria-label="Materials"
            >
              🎨
            </button>
          )}
        </div>

        <div className="pointer-events-none rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-white/70 sm:text-xs">
          {touch
            ? 'Tap to place · Drag to pan · Pinch to zoom · Twist to rotate'
            : 'Click: place · R: rotate · Del/X: delete · Ctrl+Z: undo · WASD: pan · Q/E: turn · Right-drag: orbit · Wheel: zoom · Tab: walk'}
        </div>
      </div>
    </>
  );
}
