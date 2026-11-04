import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { pictureForLed } from '../lib/ledImage';
import {
  LED_DEFAULT_ADS,
  LED_MAX_ADS,
  type LedAd,
  type LedFit,
  type LedLayout,
  type LedLink,
  type LedPanels,
  type LedSync,
  type LedTransition,
  LED_ART_H,
  LED_ART_PALETTE,
  LED_ART_W,
  LED_DEFAULT_TEXT,
  LED_MODES,
  LED_PRESETS,
  resolveLed,
  type LedBezel,
  type LedDetail,
  type LedDots,
  type LedFont,
  type LedMode,
  type LedScroll,
  type LedSpec,
} from '../city/catalog';
import { useTownMaster } from '../city/ledNet';
import { Icon } from './icons';

export const chip = (active: boolean) =>
  `min-h-9 rounded-lg px-3 py-2 text-center transition disabled:opacity-30 sm:min-h-0 sm:rounded-md sm:px-2 sm:py-1 ${active ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/20 active:bg-white/25'}`;

const TEXT_MODES: LedMode[] = ['text', 'ticker', 'slides'];
const ADS_FONT: LedMode[] = ['ads'];
const SCROLL_MODES: LedMode[] = ['text', 'ticker', 'draw'];
const FONT_MODES: LedMode[] = ['text', 'ticker', 'slides', 'clock', 'weather', ...ADS_FONT];
const TWO_COLOUR_MODES: LedMode[] = ['text', 'ticker', 'slides', 'clock', 'weather', 'wave', 'plasma', 'stripes', 'bars', 'checker', 'pulse', 'solid', 'aurora', 'skyline', 'fire', 'ripple'];
const BG_MODES: LedMode[] = ['text', 'ticker', 'slides', 'ads', 'clock', 'weather', 'wave', 'plasma', 'matrix', 'stripes', 'bars', 'checker', 'pulse', 'solid', 'draw', 'aurora', 'skyline', 'fire', 'ripple'];

/** Snaps each colour channel to a multiple of 8, so dragging a picker can't create unbounded textures. */
function quantize(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const snap = (v: number) => Math.min(255, Math.round(v / 8) * 8);
  const out = (snap((n >> 16) & 255) << 16) | (snap((n >> 8) & 255) << 8) | snap(n & 255);
  return '#' + out.toString(16).padStart(6, '0');
}

/** Holds a value locally while it is being dragged or typed and passes it on shortly after, so one drag is one edit. */
export function useDraft<T>(value: T, commit: (v: T) => void, delay = 220): [T, (v: T) => void] {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | null>(null);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => setDraft(value), [value]);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const set = (next: T) => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(next), delay);
  };
  return [draft, set];
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-white/55">{title}</div>
      {children}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} className={chip(value === o.id)} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useDraft(value, onChange);
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-white/70">{label}</span>
      <input type="range" min={min} max={max} step={step} value={draft} onChange={(e) => setDraft(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-10 text-right tabular-nums text-white/70">{format(draft)}</span>
    </label>
  );
}

export function Colour({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useDraft(value, onChange);
  return (
    <label className="flex flex-col items-center gap-1">
      <input type="color" value={draft} onChange={(e) => setDraft(quantize(e.target.value))} className="h-9 w-full min-w-10 cursor-pointer rounded border border-white/20 bg-transparent sm:h-8" />
      <span className="text-white/60">{label}</span>
    </label>
  );
}

/** Draw your own picture, 32 x 16 pixels, with a finger or the mouse. */
function PixelEditor({ pixels, color, onChange }: { pixels: string; color: string; onChange: (pixels: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const data = useRef<string[]>([]);
  const painting = useRef<{ erase: boolean } | null>(null);
  const [pen, setPen] = useState(15);
  const [version, setVersion] = useState(0);
  const commitTimer = useRef<number | null>(null);

  // Load from props whenever they change from outside (a preset, undo, another piece).
  useEffect(() => {
    const blank = '0'.repeat(LED_ART_W * LED_ART_H);
    const source = pixels.length === LED_ART_W * LED_ART_H ? pixels : blank;
    if (data.current.join('') !== source) {
      data.current = source.split('');
      setVersion((v) => v + 1);
    }
  }, [pixels]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const cell = c.width / LED_ART_W;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < LED_ART_W * LED_ART_H; i++) {
      const d = data.current[i]?.charCodeAt(0) ?? 48;
      const idx = d >= 48 && d <= 57 ? d - 48 : d >= 97 && d <= 102 ? d - 87 : 0;
      const x = (i % LED_ART_W) * cell;
      const y = Math.floor(i / LED_ART_W) * cell;
      ctx.fillStyle = idx === 0 ? '#12161c' : idx === 15 ? color : LED_ART_PALETTE[idx];
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }, [version, color]);

  const scheduleCommit = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => onChange(data.current.join('')), 250);
  };

  const paintAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current;
    if (!c || !painting.current) return;
    const rect = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * LED_ART_W);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * LED_ART_H);
    if (x < 0 || y < 0 || x >= LED_ART_W || y >= LED_ART_H) return;
    const value = painting.current.erase ? '0' : pen.toString(16);
    const i = y * LED_ART_W + x;
    if (data.current[i] === value) return;
    data.current[i] = value;
    setVersion((v) => v + 1);
    scheduleCommit();
  };

  const fillAll = (digit: string) => {
    data.current = Array(LED_ART_W * LED_ART_H).fill(digit);
    setVersion((v) => v + 1);
    scheduleCommit();
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvas}
        width={LED_ART_W * 16}
        height={LED_ART_H * 16}
        className="w-full touch-none rounded-md border border-white/15"
        style={{ aspectRatio: `${LED_ART_W} / ${LED_ART_H}` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          painting.current = { erase: pen === 0 };
          paintAt(e);
        }}
        onPointerMove={paintAt}
        onPointerUp={() => (painting.current = null)}
        onPointerCancel={() => (painting.current = null)}
      />
      <div className="grid grid-cols-8 gap-1.5">
        {LED_ART_PALETTE.map((colour, i) => (
          <button
            key={i}
            aria-label={i === 0 ? 'Eraser' : `Colour ${i}`}
            onClick={() => setPen(i)}
            className={`flex h-9 items-center justify-center rounded-md border text-xs sm:h-7 ${pen === i ? 'border-white ring-2 ring-white/70' : 'border-white/20'}`}
            style={{ backgroundColor: i === 0 ? '#12161c' : i === 15 ? color : colour }}
          >
            {i === 0 ? '⌫' : i === 15 ? '●' : ''}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(false)} onClick={() => fillAll('0')}>
          Clear
        </button>
        <button className={chip(false)} onClick={() => fillAll(pen.toString(16))}>
          Fill with pen
        </button>
        <button
          className={chip(false)}
          onClick={() => {
            const rows: string[][] = [];
            for (let y = 0; y < LED_ART_H; y++) rows.push(data.current.slice(y * LED_ART_W, (y + 1) * LED_ART_W).reverse());
            data.current = rows.flat();
            setVersion((v) => v + 1);
            scheduleCommit();
          }}
        >
          <Icon name="flip" className="mr-1 inline" />Flip
        </button>
        <button className={chip(false)} onClick={() => { data.current = HEART.split(''); setVersion((v) => v + 1); scheduleCommit(); }}>
          Example
        </button>
      </div>
    </div>
  );
}

/** A starter picture: a red heart on a 32 x 16 grid. */
const HEART = (() => {
  const rows = [
    '................................',
    '..........2222....2222..........',
    '.........222222..222222.........',
    '........22222222222222222.......'.slice(0, 32),
    '........2222222222222222........',
    '........2222222222222222........',
    '.........22222222222222.........',
    '..........222222222222..........',
    '...........2222222222...........',
    '............22222222............',
    '.............222222.............',
    '..............2222..............',
    '...............22...............',
    '................................',
    '................................',
    '................................',
  ];
  return rows.map((r) => r.replace(/\./g, '0')).join('');
})();

/** One ad in the playlist: caption, colours, time on screen, and a picture if it has one. */
function AdRow({ ad, index, count, onChange, onMove, onRemove }: { ad: LedAd; index: number; count: number; onChange: (change: Partial<LedAd>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const [text, setText] = useDraft(ad.text, (v) => onChange({ text: v }), 300);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-white/5 p-2">
      <div className="flex items-center gap-1.5">
        <span className="w-4 shrink-0 text-center text-white/45">{index + 1}</span>
        {ad.image ? (
          <img src={ad.image} alt="" className="h-9 w-12 shrink-0 rounded object-contain" style={{ backgroundColor: ad.bg }} />
        ) : (
          <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded text-[10px] font-bold" style={{ backgroundColor: ad.bg, color: ad.color }}>
            Aa
          </span>
        )}
        <input
          value={text}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          placeholder={ad.image ? 'Caption (optional)' : 'Your message'}
          className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1.5 text-base outline-none placeholder:text-white/35 sm:text-xs"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input type="color" value={ad.color} onChange={(e) => onChange({ color: quantize(e.target.value) })} className="h-7 w-9 shrink-0 cursor-pointer rounded border border-white/20 bg-transparent" title="Text colour" />
        <input type="color" value={ad.bg} onChange={(e) => onChange({ bg: quantize(e.target.value) })} className="h-7 w-9 shrink-0 cursor-pointer rounded border border-white/20 bg-transparent" title="Background" />
        <button className={chip(false) + ' w-8 px-0'} disabled={ad.seconds <= 1} onClick={() => onChange({ seconds: ad.seconds - 1 })} aria-label="Shorter">
          −
        </button>
        <span className="w-9 text-center tabular-nums text-white/70">{ad.seconds}s</span>
        <button className={chip(false) + ' w-8 px-0'} disabled={ad.seconds >= 30} onClick={() => onChange({ seconds: ad.seconds + 1 })} aria-label="Longer">
          +
        </button>
        <span className="flex-1" />
        <button className={chip(false) + ' w-8 px-0'} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Earlier">
          ↑
        </button>
        <button className={chip(false) + ' w-8 px-0'} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Later">
          ↓
        </button>
        <button className={chip(false) + ' w-8 px-0'} onClick={onRemove} aria-label="Remove ad">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

/** Build the ad rotation: messages and your own pictures, each with its own colours and time. */
function AdsEditor({ spec, onChange }: { spec: LedSpec; onChange: (change: Partial<LedSpec>) => void }) {
  const ads = spec.ads && spec.ads.length > 0 ? spec.ads : LED_DEFAULT_ADS;
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const save = (next: LedAd[]) => onChange({ ads: next });
  const edit = (i: number, change: Partial<LedAd>) => save(ads.map((a, k) => (k === i ? { ...a, ...change } : a)));

  const addPicture = async (file: File | undefined) => {
    if (!file) return;
    const result = await pictureForLed(file);
    if ('error' in result) return setNote(result.error);
    setNote(null);
    save([...ads, { text: '', image: result.url, color: '#ffffff', bg: '#000000', seconds: 5 }]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {ads.map((ad, i) => (
        <AdRow
          key={i}
          ad={ad}
          index={i}
          count={ads.length}
          onChange={(change) => edit(i, change)}
          onMove={(dir) => {
            const next = ads.slice();
            [next[i], next[i + dir]] = [next[i + dir], next[i]];
            save(next);
          }}
          onRemove={() => save(ads.filter((_, k) => k !== i))}
        />
      ))}
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(false)} disabled={ads.length >= LED_MAX_ADS} onClick={() => save([...ads, { text: 'NEW AD', color: '#ffffff', bg: '#101820', seconds: 4 }])}>
          + Message
        </button>
        <button className={chip(false)} disabled={ads.length >= LED_MAX_ADS} onClick={() => picker.current?.click()}>
          + Picture
        </button>
        <span className="self-center text-white/45">
          {ads.length} / {LED_MAX_ADS}
        </span>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void addPicture(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {note && <div className="rounded-md bg-amber-500/20 px-2 py-1 text-amber-200">{note}</div>}
      <p className="text-white/45">Pictures are shrunk to fit and never stretched. A caption appears under the picture.</p>
    </div>
  );
}

/**
 * Everything about what an LED screen shows and how it looks: content, colours, motion, text style,
 * pixel style, frame and glow. Where the screen sits on a building is handled by the caller.
 */
export function LedEditor({ spec, onChange, onMaster }: { spec: LedSpec; onChange: (change: Partial<LedSpec>) => void; onMaster?: (on: boolean) => void }) {
  const look = resolveLed(spec);
  const mode = spec.mode;
  const [text, setText] = useDraft(spec.text ?? LED_DEFAULT_TEXT, (v) => onChange({ text: v }), 300);
  const [advanced, setAdvanced] = useState(false);
  const link = spec.link ?? 'none';
  const town = useTownMaster(link === 'town');

  const linkGroup = (
    <Group title="Same picture as">
      <Chips<LedLink>
        value={link}
        options={[
          { id: 'none', label: 'Its own' },
          { id: 'building', label: "Building's main screen" },
          { id: 'town', label: 'Town broadcast' },
        ]}
        onChange={(next) => onChange({ link: next === 'none' ? undefined : next, ...(next !== 'none' ? { master: false } : {}) })}
      />
      {link === 'none' && onMaster && (
        <label className="flex min-h-9 items-center justify-between sm:min-h-0">
          <span className="text-white/80">Broadcast this to the whole town</span>
          <input type="checkbox" className="h-5 w-5" checked={!!spec.master} onChange={(e) => onMaster(e.target.checked)} />
        </label>
      )}
      <p className="text-white/45">
        {link === 'building'
          ? "Shows what the first screen on this building with its own look shows, at this screen's size."
          : link === 'town'
            ? town
              ? 'Shows what the broadcasting screen shows. Change that one and every linked screen follows.'
              : 'No screen is broadcasting yet. Pick one and tick "Broadcast this to the whole town", then every town-linked screen will copy it.'
            : 'Screens linked to this one (on this building, or all over town) copy its picture and stay in step.'}
      </p>
    </Group>
  );
  // A linked screen has no look of its own to edit: it is the picture of the one it follows.
  if (link !== 'none') return <div className="flex flex-col gap-3">{linkGroup}</div>;

  return (
    <div className="flex flex-col gap-3">
      {linkGroup}
      <Group title="Quick looks">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {LED_PRESETS.map((p) => (
            <button key={p.id} className={chip(false) + ' shrink-0 whitespace-nowrap'} onClick={() => onChange(p.spec)}>
              <Icon name={p.icon} className="mr-1 inline" />
              {p.label}
            </button>
          ))}
        </div>
      </Group>

      <Group title="Show">
        <div className="grid grid-cols-3 gap-1.5">
          {LED_MODES.map((m) => (
            <button key={m.id} className={chip(mode === m.id) + ' flex flex-col items-center gap-0.5 leading-tight'} onClick={() => onChange({ mode: m.id })}>
              <Icon name={m.icon} className="text-base" />
              <span className="text-[11px]">{m.label}</span>
            </button>
          ))}
        </div>
      </Group>

      {TEXT_MODES.includes(mode) && (
        <Group title={mode === 'slides' ? 'Slides (separate with |)' : 'Message'}>
          <textarea
            value={text}
            maxLength={120}
            rows={mode === 'slides' ? 3 : 2}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'slides' ? 'SALE|50% OFF|TODAY ONLY' : 'Type your message'}
            className="w-full resize-none rounded-md bg-white/10 px-2 py-1.5 text-base outline-none placeholder:text-white/35 sm:text-xs"
          />
        </Group>
      )}

      {mode === 'ads' && (
        <Group title="Ad playlist">
          <AdsEditor spec={spec} onChange={onChange} />
          <Chips<LedTransition>
            value={look.transition}
            options={[
              { id: 'fade', label: 'Fade' },
              { id: 'slide', label: 'Slide' },
              { id: 'cut', label: 'Cut' },
            ]}
            onChange={(transition) => onChange({ transition })}
          />
        </Group>
      )}

      {mode === 'draw' && (
        <Group title="Pixel art">
          <PixelEditor pixels={spec.pixels ?? ''} color={spec.color} onChange={(pixels) => onChange({ pixels })} />
        </Group>
      )}

      <Group title="Colours">
        <div className="grid grid-cols-3 gap-2">
          <Colour label="Colour" value={spec.color} onChange={(color) => onChange({ color })} />
          {TWO_COLOUR_MODES.includes(mode) && <Colour label="Colour 2" value={look.color2} onChange={(color2) => onChange({ color2 })} />}
          {BG_MODES.includes(mode) && <Colour label="Background" value={look.bg} onChange={(bg) => onChange({ bg })} />}
        </div>
      </Group>

      <Group title="Layout">
        <Chips<LedLayout>
          value={look.layout}
          options={[
            { id: 'auto', label: 'Auto' },
            { id: 'full', label: 'One picture' },
            { id: 'square', label: 'Square panels' },
            { id: 'wide', label: 'Banner panels' },
          ]}
          onChange={(layout) => onChange({ layout })}
        />
        {look.layout !== 'full' && (
          <Chips<LedPanels>
            value={look.panels}
            options={[
              { id: 'same', label: 'Same on each' },
              { id: 'next', label: 'Next ad on each' },
              { id: 'chase', label: 'Ripple' },
            ]}
            onChange={(panels) => onChange({ panels })}
          />
        )}
        {(mode === 'ads' || mode === 'draw') && (
          <Chips<LedFit>
            value={look.fit}
            options={[
              { id: 'contain', label: 'Show whole picture' },
              { id: 'cover', label: 'Fill screen' },
            ]}
            onChange={(fit) => onChange({ fit })}
          />
        )}
        <p className="text-white/45">Text and pictures keep their shape: a tall screen becomes a stack of panels instead of stretching one.</p>
      </Group>

      <Group title="Keeping time">
        <Chips<LedSync>
          value={look.sync}
          options={[
            { id: 'together', label: 'All in step' },
            { id: 'chase', label: 'Round the building' },
            { id: 'solo', label: 'On its own' },
          ]}
          onChange={(sync) => onChange({ sync })}
        />
      </Group>

      <Group title="Motion">
        <Slider label="Speed" value={look.speed} min={0.25} max={3} step={0.25} format={(v) => `${v}×`} onChange={(speed) => onChange({ speed })} />
        {SCROLL_MODES.includes(mode) && (
          <Chips<LedScroll>
            value={look.scroll}
            options={[
              { id: 'none', label: 'Still' },
              { id: 'left', label: 'Left' },
              { id: 'right', label: 'Right' },
              { id: 'up', label: 'Up' },
              { id: 'down', label: 'Down' },
            ]}
            onChange={(scroll) => onChange({ scroll })}
          />
        )}
      </Group>

      {FONT_MODES.includes(mode) && (
        <Group title="Text">
          <Chips<LedFont>
            value={look.font}
            options={[
              { id: 'bold', label: 'Bold' },
              { id: 'round', label: 'Rounded' },
              { id: 'mono', label: 'Mono' },
              { id: 'serif', label: 'Serif' },
              { id: 'pixel', label: 'Console' },
            ]}
            onChange={(font) => onChange({ font })}
          />
          <Slider label="Size" value={look.textSize} min={0.3} max={0.95} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(textSize) => onChange({ textSize })} />
        </Group>
      )}

      <button className="flex min-h-9 items-center justify-between text-white/70 sm:min-h-0" onClick={() => setAdvanced((v) => !v)}>
        Screen hardware
        <span className={`transition ${advanced ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {advanced && (
        <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
          <Group title="Pixel density">
            <Chips<LedDetail>
              value={look.detail}
              options={[
                { id: 'low', label: 'Chunky' },
                { id: 'medium', label: 'Standard' },
                { id: 'high', label: 'Fine' },
              ]}
              onChange={(detail) => onChange({ detail })}
            />
          </Group>
          <Group title="Pixel shape">
            <Chips<LedDots>
              value={look.dots}
              options={[
                { id: 'square', label: 'Square' },
                { id: 'round', label: 'Round' },
                { id: 'smooth', label: 'Smooth' },
              ]}
              onChange={(dots) => onChange({ dots })}
            />
          </Group>
          <Slider label="Brightness" value={look.brightness} min={0.4} max={3} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(brightness) => onChange({ brightness })} />
          <Group title="Switched on">
            <Chips<'always' | 'night'>
              value={look.power}
              options={[
                { id: 'always', label: 'All day' },
                { id: 'night', label: 'Night only' },
              ]}
              onChange={(power) => onChange({ power })}
            />
          </Group>
          <Group title="Frame">
            <Chips<LedBezel>
              value={look.bezel}
              options={[
                { id: 'none', label: 'None' },
                { id: 'thin', label: 'Thin' },
                { id: 'thick', label: 'Thick' },
              ]}
              onChange={(bezel) => onChange({ bezel })}
            />
            {look.bezel !== 'none' && (
              <div className="grid grid-cols-3 gap-2">
                <Colour label="Frame colour" value={look.frame} onChange={(frame) => onChange({ frame })} />
              </div>
            )}
          </Group>
          <Slider label="Light spill" value={look.glowAmount} min={0} max={2} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(glowAmount) => onChange({ glowAmount })} />
          <label className="flex min-h-9 items-center justify-between sm:min-h-0">
            <span className="text-white/80">Glow at night</span>
            <input type="checkbox" className="h-5 w-5" checked={look.glow} onChange={(e) => onChange({ glow: e.target.checked })} />
          </label>
        </div>
      )}
    </div>
  );
}
