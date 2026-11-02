import { useEffect, useState, type ReactNode } from 'react';
import { atmo, formatHour } from '../scenes/atmosphere';
import { combat, SURVIVAL_HOURS, WEAPONS, WEAPON_ORDER, type Stealth, type Toast, type WeaponId } from '../sim/combat';
import { REVIVE_COST } from '../lib/rewards';
import { reviveWithAd, reviveWithTokens } from '../lib/wallet';
import { useGameStore } from '../state/useGameStore';
import { useWalletStore } from '../state/useWalletStore';
import { Icon } from './icons';
import { useIsCompact, useIsTouch } from './useMediaQuery';

interface Snapshot {
  hp: number;
  maxHp: number;
  cash: number;
  alive: boolean;
  weapon: WeaponId;
  owned: Record<WeaponId, boolean>;
  ammoOf: Record<WeaponId, number | null>;
  stealth: Stealth;
  hurt: number;
  hitMarker: number;
  shelter: boolean;
  alarm: number;
  nearDoor: boolean;
  toasts: Toast[];
  runActive: boolean;
  intro: boolean;
  outcome: 'none' | 'won' | 'lost';
  progress: number;
  hour: number;
  day: number;
  isDay: boolean;
  kills: number;
  monsters: number;
  stamina: number;
  winded: boolean;
  flashlight: boolean;
}

function snapshot(): Snapshot {
  const p = combat.player;
  const ammoOf = {} as Record<WeaponId, number | null>;
  for (const id of WEAPON_ORDER) {
    const kind = WEAPONS[id].ammo;
    ammoOf[id] = kind ? p.ammo[kind] : null;
  }
  return {
    hp: p.hp,
    maxHp: p.maxHp,
    cash: p.cash,
    alive: p.alive,
    weapon: p.weapon,
    owned: { ...p.owned },
    ammoOf,
    stealth: p.stealth,
    hurt: p.hurt,
    hitMarker: p.hitMarker,
    shelter: !!p.shelter,
    alarm: p.alarm,
    nearDoor: !!p.nearDoor,
    toasts: [...combat.toasts],
    runActive: combat.run.active,
    intro: combat.run.intro,
    outcome: combat.run.outcome,
    progress: combat.nightProgress,
    hour: atmo.hour,
    day: combat.run.day,
    isDay: combat.isDay,
    kills: p.kills,
    monsters: combat.monsters.filter((m) => m.state !== 'dying').length,
    stamina: p.stamina,
    winded: p.winded,
    flashlight: p.flashlight,
  };
}

/** The combat state as plain data, refreshed ten times a second (it changes every frame; the screen does not need to). */
function useSnapshot(): Snapshot {
  const [snap, setSnap] = useState(snapshot);
  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapshot()), 100);
    return () => window.clearInterval(id);
  }, []);
  return snap;
}

const card = 'rounded-2xl bg-black/40 pointer-coarse:bg-black/64 text-white backdrop-blur-[6px]';

const STEALTH_VIEW: Record<Stealth, { icon: string; label: string; tone: string }> = {
  hidden: { icon: 'eyeOff', label: 'Hidden', tone: 'bg-emerald-500/80 text-black' },
  exposed: { icon: 'eye', label: 'Exposed', tone: 'bg-amber-400/90 text-black' },
  spotted: { icon: 'siren', label: 'Spotted!', tone: 'bg-red-600/90 text-white animate-pulse' },
};

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/15">
      <div className={`h-full rounded-full transition-[width] duration-150 ${tone}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function StatusStrip({ s, survival }: { s: Snapshot; survival: boolean }) {
  const view = STEALTH_VIEW[s.stealth];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex flex-col items-start gap-1.5 px-2 sm:px-4"
      style={{ top: "calc(var(--safe-top) + 3.25rem)", paddingLeft: 'calc(var(--safe-left) + 0.5rem)', paddingRight: 'calc(var(--safe-right) + 0.5rem)' }}
    >
      <div className={`flex w-full max-w-[15rem] items-center gap-2 px-3 py-1.5 sm:max-w-xs sm:py-2 ${card}`}>
        <Icon name="heart" className="text-rose-400" />
        <Bar value={s.hp / s.maxHp} tone={s.hp / s.maxHp > 0.35 ? 'bg-rose-500' : 'bg-red-600 animate-pulse'} />
        <span className="w-8 text-right text-xs tabular-nums">{Math.ceil(s.hp)}</span>
        <span className="ml-1 text-sm font-medium text-emerald-300 tabular-nums">${s.cash}</span>
      </div>
      {s.stamina < 0.98 && (
        <div className={`flex w-full max-w-[11rem] items-center gap-2 px-3 py-1.5 ${card}`}>
          <Icon name="run" className={s.winded ? 'text-red-400' : 'text-sky-300'} />
          <Bar value={s.stamina} tone={s.winded ? 'bg-red-500' : 'bg-sky-400'} />
        </div>
      )}
      {survival && (
        <div className={`flex w-full max-w-[15rem] items-center gap-2 px-3 py-1.5 sm:max-w-xs sm:py-2 ${card}`}>
          <Icon name={s.isDay ? 'sun' : 'moon'} className={s.isDay ? 'text-amber-300' : 'text-indigo-300'} />
          <span className="text-xs font-semibold tabular-nums">Day {s.day}</span>
          <Bar value={s.progress} tone="bg-indigo-400" />
          <span className="w-16 text-right text-xs tabular-nums">{formatHour(s.hour)}</span>
        </div>
      )}
      {survival && !s.intro && s.outcome === 'none' && (
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${view.tone}`}>
          <Icon name={view.icon} />
          {s.shelter ? 'Sheltered' : view.label}
          {s.monsters > 0 && <span className="ml-1 font-normal opacity-80">· {s.monsters} nearby</span>}
        </div>
      )}
    </div>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  const tone = { info: 'bg-black/48 pointer-coarse:bg-black/72 text-white', good: 'bg-emerald-600/85 text-white', bad: 'bg-red-600/85 text-white', warn: 'bg-amber-500/90 text-black' };
  return (
    <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-1.5 px-4" style={{ top: 'calc(var(--safe-top) + 4rem)' }}>
      {toasts.map((t) => (
        <div key={t.id} className={`max-w-sm rounded-xl px-3 py-1.5 text-center text-sm shadow-lg backdrop-blur-[6px] ${tone[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Weapon slots (desktop) or a single tap-to-switch chip (phone). */
function WeaponBar({ s, compact }: { s: Snapshot; compact: boolean }) {
  const current = WEAPONS[s.weapon];
  const ammo = s.ammoOf[s.weapon];
  if (compact) {
    return (
      <button
        onClick={() => combat.cycleWeapon(1)}
        className={`pointer-events-auto absolute flex items-center gap-1.5 px-2.5 py-1.5 text-sm active:bg-white/20 ${card}`}
        style={{ left: "calc(var(--safe-left) + 0.75rem)", bottom: "calc(var(--safe-bottom) + 8.25rem)" }}
        aria-label="Next weapon"
      >
        <Icon name={current.icon} className="text-lg" />
        <span className="tabular-nums">{ammo === null ? '∞' : ammo}</span>
      </button>
    );
  }
  return (
    <div className={`pointer-events-auto absolute left-1/2 flex -translate-x-1/2 gap-1.5 p-1.5 ${card}`} style={{ bottom: 'calc(var(--safe-bottom) + 2.75rem)' }}>
      {WEAPON_ORDER.map((id, i) => {
        const w = WEAPONS[id];
        const owned = s.owned[id];
        const n = s.ammoOf[id];
        return (
          <button
            key={id}
            disabled={!owned}
            onClick={() => combat.selectWeapon(id)}
            title={`${w.label} (${i + 1})`}
            className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-xl transition ${
              s.weapon === id ? 'bg-white text-black' : owned ? 'bg-white/10 hover:bg-white/20' : 'bg-white/5 opacity-30'
            }`}
          >
            <Icon name={w.icon} />
            <span className="text-[10px] leading-none tabular-nums opacity-80">
              <span className="mr-0.5 opacity-60">{i + 1}</span>
              {owned ? (n === null ? '' : n) : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Get back up where you fell: watch an ad, or spend tokens. */
function ReviveOptions() {
  const tokens = useWalletStore((s) => s.tokens);
  const watching = useWalletStore((s) => s.watching);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button
        disabled={watching}
        className={primary + ' flex w-full items-center justify-center gap-2 disabled:opacity-50'}
        onClick={async () => setMessage(await reviveWithAd())}
      >
        <Icon name="watchad" />
        {watching ? 'Ad playing…' : 'Watch an ad to get back up'}
      </button>
      <button
        disabled={tokens < REVIVE_COST}
        className={secondary + ' flex w-full items-center justify-center gap-2 disabled:opacity-40'}
        onClick={() => setMessage(reviveWithTokens())}
      >
        <Icon name="coins" />
        Get back up for {REVIVE_COST} tokens
        <span className="text-white/50">({tokens})</span>
      </button>
      {message && <p className="text-xs text-amber-300">{message}</p>}
    </div>
  );
}

function Overlay({ children, tone = 'bg-black/52 pointer-coarse:bg-black/76' }: { children: ReactNode; tone?: string }) {
  return <div className={`pointer-events-auto absolute inset-0 z-20 flex items-center justify-center p-6 ${tone} backdrop-blur-[4px]`}>{children}</div>;
}

const primary = 'min-h-10 rounded-xl bg-white px-6 py-2 text-base font-semibold text-black active:bg-white/80';
const secondary = 'min-h-10 rounded-xl bg-white/15 px-5 py-2 text-base text-white active:bg-white/25';

function Tip({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 shrink-0 text-base text-white/70" />
      <span>{children}</span>
    </li>
  );
}

/** Health, cash, weapons, stealth and the day count, plus the screens for starting, winning and losing. */
export function CombatHud() {
  const mode = useGameStore((s) => s.mode);
  const sub = useGameStore((s) => s.roamSubMode);
  const compact = useIsCompact();
  const touch = useIsTouch();
  const s = useSnapshot();

  if (mode !== 'roam' || sub === 'peaceful') return null;
  const survival = sub === 'survival';
  const days = Math.round(SURVIVAL_HOURS / 24);

  return (
    <>
      {/* Red flash when hurt. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{ opacity: Math.min(1, s.hurt * 1.4), background: 'radial-gradient(ellipse at center, rgba(120,0,0,0) 35%, rgba(190,10,10,0.75) 100%)' }}
      />
      {s.hp / s.maxHp < 0.3 && s.alive && (
        <div className="pointer-events-none absolute inset-0 animate-pulse" style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(140,0,0,0.5) 100%)' }} />
      )}
      {s.hitMarker > 0.05 && !touch && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-red-500" style={{ opacity: s.hitMarker }}>
          <Icon name="close" />
        </div>
      )}

      <StatusStrip s={s} survival={survival} />
      <Toasts toasts={s.toasts} />
      {!s.shelter && s.alive && <WeaponBar s={s} compact={compact} />}

      {/* Prompt to hide in a building. */}
      {s.nearDoor && !s.shelter && s.alive && !s.intro && s.outcome === 'none' && !touch && (
        <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 px-4 py-2 text-sm ${card}`} style={{ top: '62%' }}>
          <kbd className="rounded bg-white/20 px-1.5">E</kbd> Hide inside
        </div>
      )}

      {s.shelter && (
        <Overlay tone="bg-black/68">
          <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center text-white">
            <Icon name="door" size={48} />
            <div className="text-xl font-semibold">Hiding inside</div>
            <p className="text-sm text-white/70">Stay quiet. You recover while nothing is close. If they gather outside, the door will not hold.</p>
            <div className="w-full">
              <div className="mb-1 flex justify-between text-xs text-white/60">
                <span>Door</span>
                <span>{s.alarm > 0.05 ? 'They are at the door!' : 'Quiet'}</span>
              </div>
              <Bar value={s.alarm} tone={s.alarm > 0.6 ? 'bg-red-500' : 'bg-amber-400'} />
            </div>
            <button className={secondary} onClick={() => combat.interact()}>
              Leave (E)
            </button>
          </div>
        </Overlay>
      )}

      {survival && s.intro && (
        <Overlay>
          <div className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto text-white">
            <h2 className="text-center text-2xl font-bold">Survive {days} days</h2>
            <p className="text-center text-sm text-white/75">The city is not safe, day or night. Last until the morning of day {days + 1}.</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-amber-400/15 p-3">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-amber-200">
                  <Icon name="sun" /> By day
                </div>
                <div className="flex flex-col gap-1 text-white/85">
                  <span className="flex items-center gap-1.5">
                    <Icon name="robber" /> Armed robbers
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="dino" /> Raptors and rexes
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="dragon" /> Fire-breathing dragons
                  </span>
                </div>
              </div>
              <div className="rounded-xl bg-indigo-400/15 p-3">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-indigo-200">
                  <Icon name="moon" /> By night
                </div>
                <div className="flex flex-col gap-1 text-white/85">
                  <span className="flex items-center gap-1.5">
                    <Icon name="shade" /> Shades that hunt by sight and sound
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="monster" /> Hulking brutes
                  </span>
                </div>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 rounded-xl bg-white/10 p-3 text-sm text-white/85">
              <Tip icon="eyeOff">
                <b>Stay out of sight.</b> Buildings block their view. Trees and hedges hide you; lamplight and your torch give you away.
              </Tip>
              <Tip icon="person">
                <b>Crouch</b> ({touch ? 'button' : 'Ctrl or C'}) to be quiet. <b>Run</b> ({touch ? 'button' : 'Shift'}) when you must: it costs stamina and is loud.
              </Tip>
              <Tip icon="door">
                <b>Hide inside</b> a building ({touch ? 'button' : 'E'}) near a door, but not for ever.
              </Tip>
              <Tip icon="flashlight">
                <b>Torch</b> ({touch ? 'button' : 'L'}) lights the dark but makes you easy to spot.
              </Tip>
              <Tip icon="pistol">Gunfire is loud. A taser stuns without a sound. Dragons can be shot down.</Tip>
            </ul>
            <button className={primary} onClick={() => combat.beginRun()}>
              Begin day 1
            </button>
          </div>
        </Overlay>
      )}

      {survival && s.outcome === 'lost' && (
        <Overlay tone="bg-red-950/80">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 text-center text-white">
            <Icon name="skull" size={56} />
            <h2 className="text-2xl font-bold">You did not make it</h2>
            <p className="text-sm text-white/70">
              You lasted until day {s.day}, {formatHour(atmo.hour)}, and took down {s.kills} creature{s.kills === 1 ? '' : 's'}.
            </p>
            <ReviveOptions />
            <button className={secondary} onClick={() => combat.retry()}>
              Try again from the start
            </button>
          </div>
        </Overlay>
      )}

      {survival && s.outcome === 'won' && (
        <Overlay tone="bg-amber-900/70">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 text-center text-white">
            <Icon name="sunrise" size={56} />
            <h2 className="text-2xl font-bold">You survived {days} days!</h2>
            <p className="text-sm text-white/80">
              {s.kills} creature{s.kills === 1 ? '' : 's'} downed, ${s.cash} in your pocket.
            </p>
            <div className="flex gap-2">
              <button className={primary} onClick={() => combat.retry()}>
                Play again
              </button>
              <button className={secondary} onClick={() => combat.dismiss()}>
                Keep exploring
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {!survival && !s.alive && (
        <Overlay tone="bg-black/45 pointer-coarse:bg-black/69">
          <div className="flex flex-col items-center text-center text-white">
            <Icon name="stars" size={48} />
            <h2 className="mt-2 text-xl font-bold">Knocked out</h2>
            <p className="text-sm text-white/70">You wake up back where you started.</p>
          </div>
        </Overlay>
      )}
    </>
  );
}
