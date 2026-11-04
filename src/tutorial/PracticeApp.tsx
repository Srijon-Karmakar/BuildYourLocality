import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Scene } from '../scenes/Scene';
import { CELL } from '../city/catalog';
import { atmo } from '../scenes/atmosphere';
import { combat } from '../sim/combat';
import { sim } from '../sim/simulation';
import { useCityStore } from '../state/useCityStore';
import { useBuilderStore } from '../state/useBuilderStore';
import { useGameStore } from '../state/useGameStore';
import { useBootStore } from '../state/useBootStore';
import { CombatHud } from '../ui/CombatHud';
import { VehicleHud } from '../ui/VehicleHud';
import { Crosshair } from '../ui/Crosshair';
import { CameraPad, ConfirmBar, WalkControls } from '../ui/TouchControls';
import { useIsTouch } from '../ui/useMediaQuery';
import { audio } from '../audio/engine';
import { LESSONS, type LessonId } from './lessons';
import { HOUSE_TARGET, initializePractice, lessonPassed, observation, practiceView, prepareLesson, ROAD_TARGET } from './practiceWorld';
import { isPractice, TUTORIAL_MESSAGE, TUTORIAL_VERSION } from './runtime';

if (isPractice) initializePractice();

/** Poppins: a clean geometric face, used for every tutorial label. */
const KEYFRAMES = `
@keyframes tut-pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
@keyframes tut-ring{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.2);opacity:0}}
@keyframes tut-pulse{0%,100%{box-shadow:0 0 0 0 rgba(251,146,60,.55)}50%{box-shadow:0 0 0 8px rgba(251,146,60,0)}}
@keyframes tut-rise{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
`;
const FONT = { fontFamily: "'Poppins', system-ui, sans-serif" } as const;

function leavePractice() {
  if (document.pointerLockElement) document.exitPointerLock();
  if (window.parent !== window) window.parent.postMessage({ type: TUTORIAL_MESSAGE }, window.location.origin);
  else {
    try { localStorage.setItem('apnagali.tutorial.v1.guest', String(TUTORIAL_VERSION)); } catch { /* storage blocked */ }
    window.location.replace(window.location.pathname);
  }
}

function PracticeWorld({ lesson }: { lesson: LessonId }) {
  const camera = useThree((s) => s.camera);
  const mode = useGameStore((s) => s.mode);
  useEffect(() => {
    practiceView.camera = camera;
    return () => { practiceView.camera = null; };
  }, [camera]);
  useFrame(() => {
    // Practice-only safety, after the normal game systems update. No main-world simulation is shared.
    if (combat.active) {
      combat.monsters.length = 0;
      combat.fireballs.length = 0;
      sim.peds.length = 0;
      combat.player.hp = combat.player.maxHp;
      combat.player.alive = true;
      combat.run.outcome = 'none';
      atmo.rateOverride = 0;
    }
  });
  if (mode !== 'build' || (lesson !== 'road' && lesson !== 'house')) return null;
  const [gx, gz] = lesson === 'road' ? ROAD_TARGET : HOUSE_TARGET;
  return (
    <group position={[(gx + 0.5) * CELL, 0.07, (gz + 0.5) * CELL]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <ringGeometry args={[2.2, 2.75, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      <Html position={[0, 0.2, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="whitespace-nowrap rounded-full border border-white/30 bg-sky-900/55 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-xl" style={FONT}>{lesson === 'road' ? 'Road here' : 'House here'}</span>
      </Html>
    </group>
  );
}

function PracticeTools() {
  const tool = useBuilderStore((s) => s.tool);
  return (
    <div aria-label="Practice building tools" className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 text-sm font-medium text-white"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)', ...FONT }}>
      <div className="flex gap-2 rounded-full border border-white/25 bg-white/12 p-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-2xl">
      {(['road', 'house'] as const).map((id) => (
        <button key={id} aria-pressed={tool === id} onClick={() => useBuilderStore.setState({ tool: id, hand: false })}
          className={`min-h-11 rounded-full px-5 capitalize transition ${tool === id ? 'bg-white text-slate-900 shadow-md' : 'text-white hover:bg-white/15 active:bg-white/25'}`}>{id}</button>
      ))}
      <button className="min-h-11 rounded-full px-4 text-white hover:bg-white/15 active:bg-white/25" onClick={() => useBuilderStore.getState().rotate()}>Rotate</button>
      <button className="min-h-11 rounded-full px-4 text-white hover:bg-white/15 active:bg-white/25" onClick={() => useCityStore.getState().undo()}>Undo</button>
      </div>
    </div>
  );
}

export default function PracticeApp() {
  const [progress, setProgress] = useState({ index: 0, done: true });
  const baseline = useRef(observation());
  const mode = useGameStore((s) => s.mode);
  const touch = useIsTouch();
  const sceneReady = useBootStore((s) => s.sceneReady);
  const lesson = LESSONS[progress.index];
  const final = lesson.id === 'finish';
  const welcome = lesson.id === 'welcome';

  useEffect(() => {
    if (!sceneReady) return;
    prepareLesson(LESSONS[progress.index].id);
    let armed = false;
    const settle = window.setTimeout(() => { baseline.current = observation(); armed = true; }, 600);
    const poll = window.setInterval(() => {
      if (!armed || !lessonPassed(LESSONS[progress.index].id, baseline.current)) return;
      setProgress((s) => s.index === progress.index && !s.done ? { ...s, done: true } : s);
    }, 80);
    return () => { window.clearTimeout(settle); window.clearInterval(poll); };
  }, [sceneReady, progress.index]);

  const next = () => {
    if (!progress.done || !sceneReady) return;
    if (final) leavePractice();
    else {
      audio();
      setProgress({ index: progress.index + 1, done: false });
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sceneReady || !progress.done || e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (progress.index === LESSONS.length - 1) leavePractice();
      else { audio(); setProgress({ index: progress.index + 1, done: false }); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sceneReady, progress.done, progress.index]);

  const centered = welcome || final;
  return (
    <div data-tutorial-lesson={lesson.id} className="relative h-full w-full overflow-hidden bg-slate-950" style={FONT}>
      <style>{KEYFRAMES}</style>
      <Scene><PracticeWorld lesson={lesson.id} /></Scene>
      {mode === 'build' ? <><PracticeTools />{touch && <><CameraPad /><ConfirmBar /></>}</> : <>
        <Crosshair arrows={touch} /><CombatHud /><VehicleHud />{touch && <WalkControls />}
      </>}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 text-white"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.6rem)' }}>
        <div className="rounded-full border border-white/25 bg-white/12 px-4 py-2 text-[11px] font-semibold tracking-[0.18em] shadow-lg backdrop-blur-2xl">PRACTICE CITY <span className="ml-2 font-medium tracking-normal text-sky-100">{progress.index + 1} / {LESSONS.length}</span></div>
        {window.parent === window && <button onClick={leavePractice} className="pointer-events-auto min-h-10 rounded-full border border-white/25 bg-white/12 px-5 text-sm font-medium shadow-lg backdrop-blur-2xl hover:bg-white/20 active:bg-white/25" aria-label="Skip tutorial">Skip tutorial</button>}
      </div>
      {/* The actual survival intro stays usable instead of competing with a second instruction card. */}
      {(lesson.id !== 'survival' || progress.done) && (
        <div className={`pointer-events-none absolute z-30 ${centered ? 'inset-0 flex items-center justify-center bg-slate-950/35 p-4' : 'right-3 left-3 sm:left-auto sm:w-80'}`}
          style={centered ? undefined : { top: touch && mode === 'build' ? 'calc(var(--safe-top) + 8rem)' : 'calc(var(--safe-top) + 3.75rem)' }}>
          <section aria-label="Tutorial lesson" className={`pointer-events-auto w-full overflow-y-auto rounded-3xl p-5 text-white border border-white/25 bg-slate-900/50 shadow-[0_8px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-2xl transition-[border-color,box-shadow] duration-500 ${progress.done && sceneReady && !centered ? '!border-emerald-300/70' : ''} ${centered ? 'max-w-md p-7' : 'max-h-[70dvh]'}`} style={{ animation: 'tut-rise .35s ease-out' }} key={lesson.id}>
            <div className="mb-4 flex items-center gap-2" aria-hidden="true">
              <div className="flex flex-1 gap-1">
                {LESSONS.map((l, i) => (
                  <span key={l.id} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < progress.index ? 'bg-emerald-300' : i === progress.index ? (progress.done ? 'bg-emerald-300' : 'bg-orange-400') : 'bg-white/20'}`} />
                ))}
              </div>
              <span className="text-[11px] font-medium tabular-nums text-white/80">{progress.index + 1}/{LESSONS.length}</span>
            </div>
            <h1 className={`font-semibold leading-tight tracking-tight text-orange-400 ${centered ? 'text-2xl' : 'text-lg'}`}>{lesson.title}</h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-white">{touch ? lesson.touch : lesson.desktop}</p>
            {welcome && <p className="mt-3 text-xs leading-relaxed text-sky-100">About 5 minutes. Learn by doing, with a training car and safe survival practice. Skip anytime.</p>}
            {!centered && sceneReady && (
              <div role="status" className={`mt-4 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors duration-500 ${progress.done ? 'bg-emerald-400/20 text-emerald-200' : 'bg-orange-400/15 text-orange-200'}`}>
                {progress.done ? (
                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-slate-900" style={{ animation: 'tut-pop .45s ease-out' }}>
                    ✓<span className="absolute inset-0 rounded-full border-2 border-emerald-300" style={{ animation: 'tut-ring .8s ease-out forwards' }} />
                  </span>
                ) : (
                  <span className="h-3 w-3 shrink-0 rounded-full bg-orange-400" style={{ animation: 'tut-pulse 1.4s ease-in-out infinite' }} />
                )}
                {progress.done ? 'Nice work! Lesson complete.' : 'Waiting for you: try it now'}
              </div>
            )}
            {(centered || !sceneReady) && <span role="status" className="mt-4 block text-xs font-medium text-sky-100">{!sceneReady ? 'Loading practice city...' : 'Your city is safe'}</span>}
            <div className="mt-4 flex items-center justify-between gap-2">
              <button disabled={progress.index === 0 || !sceneReady} onClick={() => setProgress({ index: progress.index - 1, done: true })} aria-label="Previous lesson"
                className="min-h-11 rounded-2xl border border-white/25 px-4 text-sm font-medium text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-0">Back</button>
              <button disabled={!progress.done || !sceneReady} onClick={next} aria-label={final ? 'Finish tutorial' : 'Next lesson'}
                style={progress.done && sceneReady ? { animation: 'tut-pulse 1.4s ease-in-out infinite' } : undefined}
                className="min-h-11 shrink-0 rounded-2xl bg-orange-400 px-5 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-orange-300 active:scale-95 disabled:bg-white/15 disabled:text-white/50 disabled:shadow-none">
                {final ? 'Return to game' : welcome ? 'Start practice' : touch ? 'Next' : 'Next (Enter)'}
              </button>
            </div>
            {!centered && <p className="mt-2.5 text-[11px] text-white/70">{touch ? 'Your city and account money are unaffected.' : 'Esc releases the mouse. Enter advances a completed lesson.'}</p>}
            <button onClick={() => window.location.reload()} className="mt-2 min-h-8 text-xs text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white" aria-label="Restart tutorial">Restart practice</button>
          </section>
        </div>
      )}
    </div>
  );
}
