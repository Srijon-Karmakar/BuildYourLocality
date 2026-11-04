import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  FACADES,
  PIECES,
  ROAD_PRESETS,
  PIECE_TYPES,
  ROOFS,
  type Category,
  type PieceType,
} from '../city/catalog';
import { useBuilderStore, type BuilderTool } from '../state/useBuilderStore';
import { useCityStore } from '../state/useCityStore';
import { useGameStore } from '../state/useGameStore';
import { BRUSHES, type BrushId } from '../terrain/terrain';
import { WALL_STYLES, type WallStyleId } from '../city/walls';
import { SPAN_PRESETS } from '../city/spans';
import { SpanSettings } from './SpanSettings';
import { WallSettings } from './WallSettings';
import { RoadSettings } from './RoadSettings';
import { ForestSettings } from './ForestSettings';
import { TerrainSettings } from './TerrainSettings';
import { Icon } from './icons';
import { SidePanel } from './SidePanel';
import { useIsCompact, useIsTouch } from './useMediaQuery';

const TOOLS_TAB = 'tools' as const;
type Tab = Category | typeof TOOLS_TAB | 'terrain';

const TABS: { id: Tab; label: string }[] = [...CATEGORIES, { id: 'terrain', label: 'Terrain' }, { id: TOOLS_TAB, label: 'Tools' }];

interface Item {
  id: BuilderTool;
  label: string;
  icon?: string;
  /** Terrain items share the 'terrain' tool and differ by brush. */
  brush?: BrushId;
  /** Wall items share the 'wall' tool and differ by material. */
  wallStyle?: WallStyleId;
  /** Bridge items share the 'span' tool and differ by preset. */
  spanPreset?: string;
}

const ICON_BY_TOOL: Partial<Record<BuilderTool, string>> = {
  bulldoze: 'bulldoze',
};

const ITEMS: Record<Tab, Item[]> = {
  terrain: BRUSHES.map((b) => ({ id: 'terrain' as const, label: b.label, icon: b.icon, brush: b.id })),
  roads: [],
  bridges: SPAN_PRESETS.map((p) => ({ id: 'span' as const, label: p.label, icon: p.icon, spanPreset: p.id })),
  buildings: [],
  nature: [],
  walls: WALL_STYLES.map((s) => ({ id: 'wall' as const, label: s.label, icon: s.icon, wallStyle: s.id })),
  street: [],
  transit: [],
  airport: [],
  port: [],
  tools: [
    { id: 'select', label: 'Edit' },
    { id: 'paint', label: 'Paint' },
    { id: 'bulldoze', label: 'Delete' },
  ],
};
for (const type of PIECE_TYPES) if (type !== 'span') ITEMS[PIECES[type].category].push({ id: type, label: PIECES[type].label });
ITEMS.nature.push({ id: 'forest', label: 'Forest brush', icon: 'woods' });

const swatchClass = (active: boolean) =>
  `h-9 w-9 rounded-full border-2 transition sm:h-7 sm:w-7 ${active ? 'scale-110 border-white' : 'border-white/20 hover:border-white/60'}`;

const glass = 'bg-black/40 pointer-coarse:bg-black/64 backdrop-blur-[6px]';

const HINT_KEY = 'apnagali.hint.seen';

/** Control reminder. On a phone it is a one-time tip that fades after a few seconds, to keep the screen clear. */
function ControlsHint({ touch }: { touch: boolean }) {
  const [visible, setVisible] = useState(() => {
    if (!touch) return true;
    try {
      return localStorage.getItem(HINT_KEY) !== '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!touch || !visible) return;
    const id = window.setTimeout(() => {
      setVisible(false);
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {
        /* nothing to remember it with */
      }
    }, 9000);
    return () => window.clearTimeout(id);
  }, [touch, visible]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none rounded-md bg-black/40 pointer-coarse:bg-black/64 px-2 py-0.5 text-[11px] text-white/70 sm:text-xs">
      {touch
        ? 'Tap to place · Drag to pan · Pinch to zoom · Twist to rotate'
        : 'Click: place · R: rotate · Del/X: delete · Ctrl+Z: undo · H: hand · E: edit · WASD: pan · Q/Z: turn · Right-drag: orbit · Wheel: zoom · Tab: walk'}
    </div>
  );
}

/** The tool dock: scrollable item row, category tabs, undo/redo, plus the material picker. */
export function BuildPalette() {
  const mode = useGameStore((s) => s.mode);
  const { tool, brush, facade, roof, selectedId, multiSelect, setMultiSelect, roadSpec, roadPreset, setTool, setBrush, setFacade, setRoof, setRoadSpec, applyRoadPreset, wall, applyWallStyle, spanPreset, applySpanPreset, hand, setHand } = useBuilderStore();
  const activate = (item: Item) => {
    setTool(item.id);
    if (item.brush) setBrush(item.brush);
    if (item.wallStyle) applyWallStyle(item.wallStyle);
    if (item.spanPreset) applySpanPreset(item.spanPreset);
  };
  const isActive = (item: Item) => tool === item.id && (!item.brush || brush === item.brush) && (!item.wallStyle || wall.style === item.wallStyle) && (!item.spanPreset || spanPreset === item.spanPreset);
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
      if (item) {
        setTool(item.id);
        if (item.brush) setBrush(item.brush);
        if (item.wallStyle) useBuilderStore.getState().applyWallStyle(item.wallStyle);
        if (item.spanPreset) useBuilderStore.getState().applySpanPreset(item.spanPreset);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, tab, setTool, setBrush]);

  // The inspector takes over the bottom of a small screen while a building is open.
  if (mode !== 'build' || (compact && selectedId)) return null;

  const selectTab = (next: Tab) => {
    setTab(next);
    const first = ITEMS[next][0];
    if (first && !ITEMS[next].some((i) => isActive(i))) activate(first);
  };
  const roadTool = tool === 'road';
  const terrainTool = tool === 'terrain';
  const forestTool = tool === 'forest';
  const wallTool = tool === 'wall';
  const spanTool = tool === 'span';
  const showMaterials = roadTool || terrainTool || forestTool || wallTool || spanTool || tool === 'paint' || (tool in PIECES && PIECES[tool as PieceType].paintable);
  const presetChip = (active: boolean) =>
    `col-span-4 rounded-md px-2 py-2 text-xs transition sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`;

  const materials = spanTool ? (
    <SpanSettings />
  ) : wallTool ? (
    <WallSettings />
  ) : forestTool ? (
    <ForestSettings />
  ) : terrainTool ? (
    <TerrainSettings />
  ) : roadTool ? (
    <RoadSettings spec={roadSpec} onChange={setRoadSpec} onPreset={applyRoadPreset} activePreset={roadPreset} />
  ) : (
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

  const iconBtn = 'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl text-base transition disabled:opacity-30 sm:h-8 sm:w-8 sm:text-base';

  return (
    <>
      {/* Desktop: a fixed side panel. Phone: a sheet opened from the dock's palette button. */}
      {showMaterials && !compact && !selectedId && (
        <SidePanel
          id="materials"
          side="left"
          title={spanTool ? 'Bridge options' : roadTool ? 'Road options' : terrainTool ? 'Terrain' : forestTool ? 'Forest brush' : wallTool ? 'Wall options' : 'Materials'}
          className={`pointer-events-auto absolute left-4 top-1/2 flex max-h-[80vh] flex-col gap-2 ${roadTool || terrainTool || forestTool || wallTool || spanTool ? 'w-64' : ''} -translate-y-1/2 overflow-y-auto rounded-2xl p-3 ${glass}`}
        >
          {materials}
        </SidePanel>
      )}
      {showMaterials && compact && materialsOpen && (
        <div
          className={`pointer-events-auto absolute inset-x-2 max-h-[42dvh] overflow-y-auto rounded-2xl p-3 ${glass}`}
          style={{ bottom: 'calc(var(--safe-bottom) + 8.25rem)' }}
        >
          {materials}
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-2 pt-2 sm:gap-1.5 sm:px-4 sm:pb-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
      >
        {/* Item row: scrolls sideways on a phone, wraps on a desktop. */}
        <div className={`no-scrollbar pointer-events-auto flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-2xl p-0.5 sm:gap-1 sm:p-1.5 sm:w-auto sm:max-w-[92vw] sm:flex-wrap sm:justify-center sm:overflow-visible ${glass}`}>
          {ITEMS[tab].map((item, i) => (
            <button
              // Bridges and walls share one tool id, so the key must tell their variants apart or the row keeps stale buttons.
              key={`${item.id}:${item.brush ?? item.wallStyle ?? item.spanPreset ?? ''}`}
              onClick={() => activate(item)}
              className={`flex min-h-9 min-w-[3rem] max-sm:text-[10px] shrink-0 flex-col items-center justify-center gap-0 rounded-xl px-1.5 text-[11px] leading-tight transition sm:min-h-0 sm:min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm ${
                isActive(item) ? 'bg-white text-black' : 'text-white/80 active:bg-white/20 sm:hover:bg-white/10'
              }`}
            >
              <span className="text-base sm:text-base"><Icon name={item.icon ?? ICON_BY_TOOL[item.id] ?? item.id} /></span>
              <span className="whitespace-nowrap">
                <span className="mr-1 hidden text-xs opacity-60 sm:inline">{i + 1}</span>
                {item.label}
              </span>
            </button>
          ))}
          {/* A phone has no side panel, so the road types sit right in the row, and "Options" opens the rest. */}
          {compact && roadTool &&
            ROAD_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyRoadPreset(p.id)}
                className={`flex min-h-9 min-w-[3rem] max-sm:text-[10px] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 text-[11px] leading-tight transition ${
                  roadPreset === p.id ? 'bg-white text-black' : 'text-white/80 active:bg-white/20'
                }`}
              >
                <span className="text-lg">
                  <Icon name={p.icon} />
                </span>
                <span className="whitespace-nowrap">{p.label}</span>
              </button>
            ))}
          {compact && showMaterials && (
            <button
              onClick={() => setMaterialsOpen((v) => !v)}
              className={`flex min-h-9 min-w-[3rem] max-sm:text-[10px] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 text-[11px] leading-tight transition ${
                materialsOpen ? 'bg-white text-black' : 'bg-white/15 text-white'
              }`}
              aria-label="Options"
            >
              <span className="text-lg">
                <Icon name="sliders" />
              </span>
              Options
            </button>
          )}
          {tab === TOOLS_TAB && (
            <button
              onClick={() => {
                setMultiSelect(!multiSelect);
                setTool('select');
              }}
              title="Pick several buildings and plants and edit them together (Shift+click, or drag a box)"
              className={`flex min-h-9 min-w-[3rem] max-sm:text-[10px] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 text-[11px] leading-tight transition sm:min-h-0 sm:min-w-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm ${
                multiSelect ? 'bg-white text-black' : 'text-white/80 active:bg-white/20 sm:hover:bg-white/10'
              }`}
            >
              <span className="text-lg sm:text-base">
                <Icon name="check" />
              </span>
              Multi-select
            </button>
          )}
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
              className={`flex min-h-9 min-w-[3rem] max-sm:text-[10px] shrink-0 flex-col items-center justify-center rounded-xl px-1.5 text-[11px] transition disabled:opacity-30 sm:min-h-0 sm:flex-row sm:px-3 sm:py-1.5 sm:text-sm ${confirmClear ? 'bg-red-600 text-white' : 'text-red-300 active:bg-red-500/20 sm:hover:bg-red-500/20'}`}
              title="Delete everything (undoable)"
            >
              <span className="text-lg sm:mr-1.5 sm:text-base"><Icon name="clearall" /></span>
              {confirmClear ? 'Sure?' : 'Clear all'}
            </button>
          )}
        </div>

        <div className={`no-scrollbar pointer-events-auto flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1 text-xs text-white sm:w-auto ${glass}`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`min-h-7 shrink-0 rounded-xl px-2 text-[11px] transition sm:text-xs sm:min-h-0 sm:px-3 sm:py-1 ${
                tab === t.id ? 'bg-white/90 text-black' : 'text-white/70 active:bg-white/15 sm:hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-white/20" />
          {!touch && (
          <button
            className={iconBtn + (!hand && tool === 'select' ? ' bg-white text-black' : ' text-white/90 hover:bg-white/10')}
            onClick={() => {
              setHand(false);
              setTool('select');
            }}
            title="Edit (E): click a building to customise it"
            aria-label="Edit"
          >
            <Icon name="edit" />
          </button>
          )}
          {!touch && (
          <button
            className={iconBtn + (hand ? ' bg-white text-black' : ' text-white/90 hover:bg-white/10')}
            onClick={() => setHand(!hand)}
            title="Hand mode (H): drag to move the view, wheel to zoom"
            aria-label="Hand mode"
            aria-pressed={hand}
          >
            <Icon name="hand" />
          </button>
          )}
          <button className={iconBtn + ' text-white/90 hover:bg-white/10'} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Icon name="undo" />
          </button>
          <button className={iconBtn + ' text-white/90 hover:bg-white/10'} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            <Icon name="redo" />
          </button>
          {compact && showMaterials && (
            <button
              className={iconBtn + (materialsOpen ? ' bg-white text-black' : ' text-white/90 hover:bg-white/10')}
              onClick={() => setMaterialsOpen((v) => !v)}
              aria-label="Materials"
            >
              <Icon name="paint" />
            </button>
          )}
        </div>

        <ControlsHint touch={touch} />
      </div>
    </>
  );
}
