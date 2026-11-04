import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useBootStore } from '../state/useBootStore';
import { useAuthStore } from '../state/useAuthStore';
import { useSyncStore } from '../state/useSyncStore';
import { SiteLinks } from './SiteLinks';
import { audio } from '../audio/engine';
import { playSfx } from '../audio/sounds';

const BANNER_DESKTOP = 'https://res.cloudinary.com/dneq7tdty/image/upload/v1793795978/banner_fmcsfl.png';
const BANNER_MOBILE = 'https://res.cloudinary.com/dneq7tdty/image/upload/v1793795978/banner-mobile_blyxor.png';

const TITLE = 'YAT-C';
const SUBTITLE = 'You And The City';
const DESCRIPTION = 'Build your own map and then play in it';
const VERSION = 'v2.112026';
const CREDITS = 'Made by Srijon Karmakar · Senevon Studio';
const LICENCES = [
  'Game © Senevon Studio. All rights reserved.',
  'Built with three.js (MIT), React (MIT), Rapier (Apache-2.0), Zustand (MIT) and Lucide / Game-icons via react-icons.',
];

/** Lines shown while it loads: a new one every couple of seconds. */
const MESSAGES = [
  'Laying the first road…',
  'Waking up the neighbours…',
  'Warming up the traffic lights…',
  'Planting trees along the avenue…',
  'Switching on the street lamps…',
  'Teaching the pigeons to behave…',
  'Polishing the glass towers…',
  'Tuning the city hum…',
  'Checking nobody left the stove on…',
];

/** Shortest time the screen stays up, so it never just flashes. */
const MIN_MS = 2600;
/** It opens regardless after this long, in case a request hangs. */
const MAX_MS = 12000;
/** The three layers leave one after another, each with its own length and delay (ms). */
const LEAVE = [
  { delay: 0, duration: 750 },
  { delay: 130, duration: 800 },
  { delay: 290, duration: 850 },
];
const LEAVE_TOTAL = 290 + 850;
const MESSAGE_MS = 2100;

const font = { fontFamily: "'Rajdhani', 'Segoe UI', system-ui, sans-serif" };
const titleFont = { fontFamily: "'Bouncy Bites', 'Orbitron', 'Segoe UI', sans-serif", fontWeight: 400 };

/**
 * The loading screen: the banner art behind the game's title, a progress bar, rotating messages,
 * and the version, credits and licences. It waits for the login lookup, the saved city and any 3D
 * assets, then fades away and removes itself.
 */
export function CurtainLoader() {
  const authReady = useAuthStore((s) => s.ready);
  const sceneReady = useBootStore((s) => s.sceneReady);
  const syncing = useSyncStore((s) => s.status === 'loading');
  const { progress, active } = useProgress();
  const [minDone, setMinDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [started, setStarted] = useState(false);
  const [gone, setGone] = useState(false);
  const [art, setArt] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState(() => Math.floor(Math.random() * MESSAGES.length));
  useEffect(() => {
    const a = window.setTimeout(() => setMinDone(true), MIN_MS);
    const b = window.setTimeout(() => setTimedOut(true), MAX_MS);
    const tick = window.setInterval(() => setElapsed((e) => e + 100), 100);
    const talk = window.setInterval(() => setMessage((m) => (m + 1) % MESSAGES.length), MESSAGE_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.clearInterval(tick);
      window.clearInterval(talk);
    };
  }, []);

  const ready = authReady && sceneReady && !syncing && !active;
  const canStart = minDone && (ready || timedOut);

  // After Start the three layers rise away; once the last has left, the screen removes itself.
  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => setGone(true), LEAVE_TOTAL + 1500);
    return () => window.clearTimeout(t);
  }, [started]);

  if (gone) return null;

  const begin = () => {
    if (started) return;
    audio(); // a tap is the one moment browsers let sound begin
    playSfx('win', 0.5);
    setStarted(true);
    useBootStore.setState({ started: true });
  };

  // Real progress when there is some; otherwise it creeps towards 90 so the bar always moves.
  const creeping = 90 * (1 - Math.exp(-elapsed / 2600));
  const shown = canStart ? 100 : Math.min(94, Math.max(creeping, progress));

  /** One of the three layers: slides off the top with its own delay and length, easing in then gliding out. */
  const leave = (i: number): React.CSSProperties => ({
    transform: started ? 'translateY(-104%)' : 'none',
    transition: `transform ${LEAVE[i].duration}ms cubic-bezier(0.7, 0, 0.18, 1) ${LEAVE[i].delay}ms`,
  });

  return (
    <div className={`absolute inset-0 z-[100] overflow-hidden text-white ${started ? 'pointer-events-none' : 'pointer-events-auto'}`} style={font} role="status" aria-label="Loading">
      {/* Back layer: solid black. It leaves last. */}
      <div className="absolute inset-0 bg-[#07080d]" style={leave(2)} onTransitionEnd={() => started && setGone(true)} />
      {/* Middle layer: solid orange, matching the banner's sky. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#f08a2e] to-[#d9601a]" style={leave(1)} />

      {/* Front layer: the banner with all the text. It leaves first. */}
      <div className="absolute inset-0 bg-[#07080d]" style={leave(0)}>
        {/* A portrait picture on phones, a wide one elsewhere; it drifts very slowly so the screen feels alive. */}
        <picture>
          <source media="(max-width: 767px)" srcSet={BANNER_MOBILE} />
          <img
            src={BANNER_DESKTOP}
            alt=""
            onLoad={() => setArt(true)}
            className="loader-drift absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
            style={{ opacity: art ? 1 : 0 }}
            decoding="async"
          />
        </picture>
        {/* Darkens the top and bottom so the text always reads, whatever the picture. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,6,12,0.65)_0%,rgba(5,6,12,0.12)_32%,rgba(5,6,12,0.1)_58%,rgba(5,6,12,0.88)_100%)]" />

        <div className="relative flex h-full flex-col items-center justify-between px-6 pb-[calc(var(--safe-bottom)+1.25rem)] pt-[calc(var(--safe-top)+2.5rem)] text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="glitch-shake">
              <h1
                data-text={TITLE}
                className="glitch bg-gradient-to-b from-white via-white to-cyan-200/70 bg-clip-text text-[clamp(3.6rem,13vw,9rem)] leading-none tracking-[0.1em] text-transparent drop-shadow-[0_6px_28px_rgba(0,200,255,0.5)]"
                style={titleFont}
              >
                {TITLE}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-[clamp(0.7rem,2vw,1.1rem)] uppercase tracking-[0.5em] text-cyan-100/85" style={{ fontFamily: "'Orbitron', sans-serif" }}>
              <span className="h-px w-8 bg-cyan-100/50 sm:w-16" />
              {SUBTITLE}
              <span className="h-px w-8 bg-cyan-100/50 sm:w-16" />
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col items-center gap-4">
            <p className="max-w-sm text-center text-[clamp(0.8rem,2vw,1.05rem)] tracking-wide text-white/80 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{DESCRIPTION}</p>
            {canStart ? (
              // Loading is over: nothing but the button.
              <button
                onClick={begin}
                autoFocus
                className="loader-line h-12 min-w-48 rounded-full border border-white/70 bg-white/10 px-10 text-xl font-semibold uppercase tracking-[0.45em] text-white shadow-[0_0_28px_rgba(110,220,255,0.55)] backdrop-blur-[3px] transition hover:bg-white hover:text-black active:scale-95"
              >
                Start
              </button>
            ) : (
              <>
                <div className="h-7 text-base tracking-wide text-white/90 sm:text-lg" aria-live="polite" key={message}>
                  <span className="loader-line inline-block">{MESSAGES[message]}</span>
                </div>
                <div className="flex w-full items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15 backdrop-blur-[2px]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 shadow-[0_0_12px_rgba(110,220,255,0.9)] transition-[width] duration-300 ease-out"
                      style={{ width: `${shown}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm tabular-nums text-white/75">{Math.round(shown)}%</span>
                </div>
              </>
            )}

            <div className="mt-2 flex w-full flex-col items-center gap-1 text-[11px] leading-snug text-white/60 sm:text-xs">
              <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-white/80">
                <span className="rounded-full border border-white/25 px-2 py-px tracking-widest">{VERSION}</span>
                <span className="tracking-wide">{CREDITS}</span>
              </div>
              {LICENCES.map((line) => (
                <div key={line}>{line}</div>
              ))}
              <SiteLinks className="mt-1 flex flex-wrap items-center justify-center" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
