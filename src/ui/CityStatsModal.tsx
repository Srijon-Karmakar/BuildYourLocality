import { useEffect, useRef, useState } from 'react';
import { incidents } from '../sim/incidents';
import type { CityStats } from '../sim/cityStats';
import { useCityStatsStore, type StatsTab } from '../state/useCityStatsStore';
import { TERM_LENGTH, usePoliticsStore, type Level } from '../state/usePoliticsStore';
import { Icon } from './icons';

const TABS: { id: StatsTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'stats' },
  { id: 'services', label: 'Services', icon: 'hospital' },
  { id: 'traffic', label: 'Traffic & air', icon: 'car' },
  { id: 'economy', label: 'Economy', icon: 'coins' },
  { id: 'government', label: 'Government', icon: 'government' },
];

/** Red at 0 through amber to green at 100. */
const tone = (score: number) => `hsl(${Math.round(Math.max(0, Math.min(100, score)) * 1.25)} 70% 52%)`;
const fmt = (n: number) => Math.round(n).toLocaleString();
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;

const card = 'rounded-2xl bg-black/25 p-3.5';
const label = 'text-[11px] uppercase tracking-wider text-white/50';

function Bar({ name, value, hint, invert }: { name: string; value: number; hint?: string; invert?: boolean }) {
  const good = invert ? 100 - value : value;
  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-white/80">{name}</span>
        <span className="tabular-nums text-white/60">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, value)}%`, background: tone(good) }} />
      </div>
    </div>
  );
}

function Ring({ value, mood }: { value: number; mood: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-36 w-36 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={tone(value)} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums">{value}</span>
        <span className="text-xs text-white/60">{mood}</span>
      </div>
    </div>
  );
}

/** A small line chart of recent values. */
function Spark({ values, color, height = 44 }: { values: number[]; color: string; height?: number }) {
  if (values.length < 2) return <div className="flex items-center justify-center text-[11px] text-white/35" style={{ height }}>Collecting data…</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${height - 3 - ((v - min) / span) * (height - 6)}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Overview({ s }: { s: CityStats }) {
  const worst = [...s.factors].sort((a, b) => (100 - a.score) * a.weight - (100 - b.score) * b.weight).reverse().slice(0, 3);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} flex flex-col items-center gap-3 sm:col-span-2 sm:flex-row sm:gap-6`}>
        <Ring value={s.happiness} mood={s.mood} />
        <div className="grid w-full flex-1 grid-cols-2 gap-3">
          <div>
            <div className={label}>Population</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(s.residents)}</div>
            <div className="text-[11px] text-white/50">of {fmt(s.capacity)} homes</div>
          </div>
          <div>
            <div className={label}>Jobs</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(s.jobs)}</div>
            <div className="text-[11px] text-white/50">{fmt(s.employed)} filled</div>
          </div>
          <div>
            <div className={label}>Unemployment</div>
            <div className="text-2xl font-semibold tabular-nums">{Math.round(s.unemployment * 100)}%</div>
          </div>
          <div>
            <div className={label}>Treasury</div>
            <div className={`text-2xl font-semibold tabular-nums ${s.economy.treasury < 0 ? 'text-red-400' : ''}`}>{fmt(s.economy.treasury)}</div>
            <div className="text-[11px] text-white/50">{signed(s.economy.net)} / min</div>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className={`${label} mb-2.5`}>What people think</div>
        <div className="flex flex-col gap-2.5">
          {s.factors.map((f) => (
            <Bar key={f.id} name={f.label} value={f.score} hint={f.tip} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className={card}>
          <div className={`${label} mb-2`}>Needs attention</div>
          <ul className="flex flex-col gap-2 text-xs">
            {worst.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: tone(f.score) }} />
                <span>
                  <span className="font-medium text-white">{f.label} {Math.round(f.score)}.</span> <span className="text-white/65">{f.tip}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className={card}>
          <div className={`${label} mb-1`}>Happiness over time</div>
          <Spark values={s.history.map((h) => h.happiness)} color="#7ee0a0" />
          <div className={`${label} mb-1 mt-2`}>Population</div>
          <Spark values={s.history.map((h) => h.population)} color="#8ab4ff" />
        </div>
      </div>
    </div>
  );
}

/** Where homes are well served (green) and where they are not (red), with roads in grey. */
function HeatMap({ heat }: { heat: CityStats['heat'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const size = 280;
    const cell = Math.max(3, Math.min(14, Math.floor(size / Math.max(heat.w, heat.d, 1))));
    canvas.width = Math.max(1, heat.w) * cell;
    canvas.height = Math.max(1, heat.d) * cell;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    for (const [gx, gz] of heat.roads) g.fillRect((gx - heat.minX) * cell, (gz - heat.minZ) * cell, cell, cell);
    for (const [gx, gz, score] of heat.cells) {
      g.fillStyle = tone(score * 100);
      g.fillRect((gx - heat.minX) * cell + 1, (gz - heat.minZ) * cell + 1, Math.max(2, cell - 2), Math.max(2, cell - 2));
    }
  }, [heat]);
  if (heat.cells.length === 0) return <p className="py-6 text-center text-xs text-white/50">Place houses or apartments to see how well they are served.</p>;
  return <canvas ref={ref} className="mx-auto max-w-full rounded-lg" style={{ imageRendering: 'pixelated' }} />;
}

function Services({ s }: { s: CityStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} flex flex-col gap-3`}>
        {s.services.map((v) => (
          <div key={v.id}>
            <Bar name={v.label} value={v.score} />
            <div className="mt-1 text-[11px] text-white/45">
              {v.id === 'green' ? `${v.count} green points` : v.id === 'government' ? `${v.count} government building${v.count === 1 ? '' : 's'}` : `${v.count} ${v.id === 'transport' ? 'stops' : 'building' + (v.count === 1 ? '' : 's')} · ${v.coverage}% of homes covered`}
            </div>
          </div>
        ))}
      </div>
      <div className={card}>
        <div className={`${label} mb-2`}>Home coverage map</div>
        <HeatMap heat={s.heat} />
        <p className="mt-2 text-[11px] leading-snug text-white/50">Each square is a home. Green means police, fire, hospital, school and transport all reach it; red means few do. Police, fire and hospital need a road beside them to send crews out.</p>
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, string> = { fire: 'firestation', accident: 'car', crime: 'siren', call: 'siren' };

function Traffic({ s }: { s: CityStats }) {
  const [, redraw] = useState(0);
  const live = s.incidents.filter((i) => i.status === 'active');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} flex flex-col gap-3`}>
        <Bar name="Congestion" value={s.traffic.congestion} invert hint="Share of cars standing still when they should be moving" />
        <Bar name="Pollution" value={s.environment.pollution} invert />
        <Bar name="Noise" value={s.environment.noise} invert />
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.traffic.avgKmh}</div>
            <div className="text-[10px] text-white/45">km/h average</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.traffic.cars}</div>
            <div className="text-[10px] text-white/45">cars</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.traffic.people}</div>
            <div className="text-[10px] text-white/45">on foot</div>
          </div>
        </div>
        <div>
          <div className={`${label} mb-1`}>Congestion over time</div>
          <Spark values={s.history.map((h) => h.congestion)} color="#f4b942" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <span className={label}>Emergencies now</span>
            <button
              onClick={() => {
                incidents.enabled = !incidents.enabled;
                redraw((n) => n + 1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] ${incidents.enabled ? 'bg-white text-black' : 'bg-white/10 text-white/70'}`}
              aria-pressed={incidents.enabled}
            >
              {incidents.enabled ? 'Emergencies on' : 'Emergencies off'}
            </button>
          </div>
          {live.length === 0 ? (
            <p className="text-xs text-white/50">All quiet. Fires, crashes and robberies turn up now and then; build police, fire and hospital buildings next to a road to answer them.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {live.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-xl bg-red-500/15 px-2.5 py-2 text-xs">
                  <Icon name={KIND_ICON[i.kind] ?? 'siren'} className="text-base text-red-300" />
                  <span className="flex-1">{i.label}</span>
                  <span className="tabular-nums text-white/50">{i.age}s</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`${card} grid grid-cols-3 gap-2 text-center`}>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.totals.fires}</div>
            <div className="text-[10px] text-white/45">fires</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.totals.accidents}</div>
            <div className="text-[10px] text-white/45">crashes</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.totals.crimes}</div>
            <div className="text-[10px] text-white/45">robberies</div>
          </div>
          <div className="col-span-3 text-[11px] text-white/50">
            {s.totals.solved} handled · {s.totals.failed} missed
          </div>
        </div>
      </div>
    </div>
  );
}

function Economy({ s }: { s: CityStats }) {
  const e = s.economy;
  const rows = (parts: { label: string; amount: number }[], sign: string) =>
    parts
      .filter((p) => p.amount > 0.05)
      .map((p) => (
        <li key={p.label} className="flex justify-between text-xs">
          <span className="text-white/75">{p.label}</span>
          <span className="tabular-nums text-white/60">
            {sign}
            {fmt(p.amount)}
          </span>
        </li>
      ));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={`${card} sm:col-span-2`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className={label}>City treasury</div>
            <div className={`text-3xl font-semibold tabular-nums ${e.treasury < 0 ? 'text-red-400' : 'text-amber-300'}`}>{fmt(e.treasury)}</div>
            {e.treasury < 0 && <div className="text-[11px] text-red-300">In debt: services work at 70%.</div>}
          </div>
          <div className="text-right">
            <div className={label}>Per minute</div>
            <div className={`text-2xl font-semibold tabular-nums ${e.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signed(e.net)}</div>
          </div>
        </div>
        <div className="mt-2">
          <Spark values={s.history.map((h) => h.treasury)} color="#f4b942" height={52} />
        </div>
      </div>
      <div className={card}>
        <div className="mb-2 flex justify-between">
          <span className={label}>Income</span>
          <span className="text-xs tabular-nums text-emerald-300">+{fmt(e.income)}</span>
        </div>
        <ul className="flex flex-col gap-1.5">{rows(e.incomeParts, '+')}</ul>
      </div>
      <div className={card}>
        <div className="mb-2 flex justify-between">
          <span className={label}>Running costs</span>
          <span className="text-xs tabular-nums text-red-300">−{fmt(e.costs)}</span>
        </div>
        <ul className="flex flex-col gap-1.5">{rows(e.costParts, '−')}</ul>
      </div>
      <p className="px-1 text-[11px] leading-snug text-white/45 sm:col-span-2">
        The city treasury is separate from your wallet. It pays for the city's services and is hit by fires, crashes and robberies nobody answered. Happy residents pay more tax.
      </p>
    </div>
  );
}

const LEVELS = ['Low', 'Normal', 'High'] as const;

/** Segmented Low / Normal / High control. */
function LevelPick({ name, value, onChange, locked, note }: { name: string; value: Level; onChange: (l: Level) => void; locked: boolean; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-white/85">{name}</div>
        <div className="truncate text-[11px] text-white/45">{note}</div>
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-full bg-white/10 p-0.5">
        {LEVELS.map((label, i) => (
          <button key={label} disabled={locked} onClick={() => onChange(i as Level)} className={`rounded-full px-2.5 py-1 text-[11px] transition disabled:opacity-40 ${value === i ? 'bg-white text-black' : 'text-white/75'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ name, on, onChange, locked, note }: { name: string; on: boolean; onChange: (v: boolean) => void; locked: boolean; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-white/85">{name}</div>
        <div className="truncate text-[11px] text-white/45">{note}</div>
      </div>
      <button disabled={locked} aria-pressed={on} onClick={() => onChange(!on)} className={`rounded-full px-3 py-1 text-[11px] disabled:opacity-40 ${on ? 'bg-white text-black' : 'bg-white/10 text-white/75'}`}>
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

/** The mayor, the vote, the policies and what citizens are grumbling about. */
function Government({ s }: { s: CityStats }) {
  const pol = usePoliticsStore();
  const hasHall = s.gov.hall > 0;
  const left = Math.max(0, Math.round(TERM_LENGTH - pol.term));
  const set = pol.setPolicy;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={card}>
        <div className={label}>Mayor</div>
        <div className="text-xl font-semibold">{pol.mayor}</div>
        <div className="mt-3">
          <Bar name="Approval" value={pol.approval} />
        </div>
        {hasHall ? (
          <div className="mt-3 text-[11px] text-white/55">
            Election in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · {pol.termsWon} term{pol.termsWon === 1 ? '' : 's'} won
          </div>
        ) : (
          <div className="mt-3 text-[11px] text-amber-300">Build a City hall (Services tab) to run policies and hold elections.</div>
        )}
        {pol.lastElection && (
          <div className="mt-1 text-[11px] text-white/55">Last vote: {pol.lastElection.won ? `won with ${pol.lastElection.share}%` : `lost at ${pol.lastElection.share}%`}</div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.gov.hall}</div>
            <div className="text-[10px] text-white/45">city hall</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.gov.court}</div>
            <div className="text-[10px] text-white/45">courts</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">{s.gov.jail}</div>
            <div className="text-[10px] text-white/45">jails</div>
          </div>
        </div>
      </div>

      <div className={`${card} flex flex-col gap-3`}>
        <div className={label}>Policies {hasHall ? '' : '(locked)'}</div>
        <LevelPick name="Taxes" value={pol.policies.tax} locked={!hasHall} onChange={(l) => set('tax', l)} note="More money, less happiness" />
        <LevelPick name="Police budget" value={pol.policies.police} locked={!hasHall} onChange={(l) => set('police', l)} note="Safer streets, higher cost" />
        <LevelPick name="Health budget" value={pol.policies.health} locked={!hasHall} onChange={(l) => set('health', l)} note="Better care, higher cost" />
        <LevelPick name="Education budget" value={pol.policies.education} locked={!hasHall} onChange={(l) => set('education', l)} note="Better schools, higher cost" />
        <Switch name="Free public transport" on={pol.policies.freeTransit} locked={!hasHall} onChange={(v) => set('freeTransit', v)} note="Popular, costs more to run" />
        <Switch name="Green rules" on={pol.policies.greenRules} locked={!hasHall} onChange={(v) => set('greenRules', v)} note="Cleaner air, hurts business" />
      </div>

      <div className={`${card} sm:col-span-2`}>
        <div className={`${label} mb-2`}>Citizens say</div>
        {pol.complaints.length === 0 ? (
          <p className="text-xs text-white/55">Nothing to complain about right now.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-xs italic text-white/75">
            {pol.complaints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The city dashboard: a glass pop-up with population, happiness, services, traffic and money. */
export function CityStatsModal() {
  const open = useCityStatsStore((s) => s.open);
  const tab = useCityStatsStore((s) => s.tab);
  const stats = useCityStatsStore((s) => s.stats);
  const setTab = useCityStatsStore((s) => s.setTab);
  const hide = useCityStatsStore((s) => s.hide);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-[80] flex items-center justify-center bg-black/35 p-3 sm:p-6" onClick={hide} role="dialog" aria-modal="true" aria-label="City stats">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/10 text-white shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="flex-1 text-lg font-semibold tracking-wide">City</h2>
          {stats?.hasCity && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-sm font-semibold tabular-nums" style={{ color: tone(stats.happiness) }}>
              <Icon name="heart" />
              {stats.happiness}
            </span>
          )}
          <button onClick={hide} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg active:bg-white/25 sm:hover:bg-white/20">
            <Icon name="close" />
          </button>
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${tab === t.id ? 'bg-white text-black' : 'bg-white/10 text-white/80 active:bg-white/20 sm:hover:bg-white/15'}`}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {!stats || !stats.hasCity ? (
            <p className="py-14 text-center text-sm text-white/60">Build some homes (houses, villas, apartments) and workplaces to start a city. The numbers appear here.</p>
          ) : tab === 'overview' ? (
            <Overview s={stats} />
          ) : tab === 'services' ? (
            <Services s={stats} />
          ) : tab === 'traffic' ? (
            <Traffic s={stats} />
          ) : tab === 'economy' ? (
            <Economy s={stats} />
          ) : (
            <Government s={stats} />
          )}
        </div>
      </div>
    </div>
  );
}
