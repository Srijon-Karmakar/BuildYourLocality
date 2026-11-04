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
        <span className="whitespace-nowrap rounded-full bg-sky-950/90 px-2 py-1 text-xs font-semibold text-sky-100">{lesson === 'road' ? 'Road here' : 'House here'}</span>
      </Html>
    </group>
  );
}

function PracticeTools() {
  const tool = useBuilderStore((s) => s.tool);
  return (
    <div aria-label="Practice building tools" className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 bg-gradient-to-t from-slate-950/90 to-transparent px-3 pt-8 text-sm text-white"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}>
      {(['road', 'house'] as const).map((id) => (
        <button key={id} aria-pressed={tool === id} onClick={() => useBuilderStore.setState({ tool: id, hand: false })}
          className={`min-h-11 rounded-full px-5 capitalize ${tool === id ? 'bg-white text-slate-950' : 'bg-slate-800'}`}>{id}</button>
      ))}
      <button className="min-h-11 rounded-full bg-slate-800 px-4" onClick={() => useBuilderStore.getState().rotate()}>Rotate</button>
      <button className="min-h-11 rounded-full bg-slate-800 px-4" onClick={() => useCityStore.getState().undo()}>Undo</button>
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
    <div data-tutorial-lesson={lesson.id} className="relative h-full w-full overflow-hidden bg-slate-950">
      <Scene><PracticeWorld lesson={lesson.id} /></Scene>
      {mode === 'build' ? <><PracticeTools />{touch && <><CameraPad /><ConfirmBar /></>}</> : <>
        <Crosshair arrows={touch} /><CombatHud /><VehicleHud />{touch && <WalkControls />}
      </>}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-2 px-3 text-white"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.6rem)' }}>
        <div className="rounded-full bg-slate-950/90 px-3 py-2 text-[11px] font-bold tracking-wider">PRACTICE CITY <span className="ml-2 font-normal text-sky-200">{progress.index + 1} / {LESSONS.length}</span></div>
        {window.parent === window && <button onClick={leavePractice} className="pointer-events-auto min-h-10 rounded-full bg-slate-950/90 px-4 text-sm" aria-label="Skip tutorial">Skip tutorial</button>}
      </div>
      {/* The actual survival intro stays usable instead of competing with a second instruction card. */}
      {(lesson.id !== 'survival' || progress.done) && (
        <div className={`pointer-events-none absolute z-30 ${centered ? 'inset-0 flex items-center justify-center bg-slate-950/55 p-4' : 'right-3 left-3 sm:left-auto sm:w-80'}`}
          style={centered ? undefined : { top: touch && mode === 'build' ? 'calc(var(--safe-top) + 8rem)' : 'calc(var(--safe-top) + 3.75rem)' }}>
          <section aria-label="Tutorial lesson" className={`pointer-events-auto w-full overflow-y-auto rounded-2xl border border-sky-200/20 bg-slate-950/95 p-4 text-white shadow-xl ${centered ? 'max-w-md p-6' : 'max-h-[38dvh]'}`}>
            <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true"><div className="h-full bg-sky-400 transition-all" style={{ width: `${progress.index / (LESSONS.length - 1) * 100}%` }} /></div>
            <h1 className={`font-bold ${centered ? 'text-2xl' : 'text-lg'}`}>{lesson.title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{touch ? lesson.touch : lesson.desktop}</p>
            {welcome && <p className="mt-3 text-xs text-sky-200">About 5 minutes. Learn by doing, with a training car and safe survival practice. Skip anytime.</p>}
            <div className="mt-4 flex items-center justify-between gap-2">
              <span role="status" className="text-xs text-sky-200">{!sceneReady ? 'Loading practice city...' : progress.done ? (centered ? 'Your city is safe' : 'Done!') : 'Try the action to continue'}</span>
              <button disabled={!progress.done || !sceneReady} onClick={next} aria-label={final ? 'Finish tutorial' : 'Next lesson'}
                className="min-h-11 shrink-0 rounded-xl bg-sky-300 px-4 text-sm font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400">
                {final ? 'Return to game' : welcome ? 'Start practice' : touch ? 'Next' : 'Next (Enter)'}
              </button>
            </div>
            {!centered && <p className="mt-2 text-[11px] text-slate-400">{touch ? 'Your city and account money are unaffected.' : 'Esc releases the mouse. Enter advances a completed lesson.'}</p>}
            <button onClick={() => window.location.reload()} className="mt-3 min-h-8 text-xs text-slate-400 underline decoration-slate-600 underline-offset-4" aria-label="Restart tutorial">Restart practice</button>
          </section>
        </div>
      )}
    </div>
  );
}
