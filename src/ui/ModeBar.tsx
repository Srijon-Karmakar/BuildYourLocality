import { useState } from 'react';
import { Icon } from './icons';
import { isSoundOn, setSoundOn } from '../sim/sfx';
import { useGameStore, type RoamSubMode } from '../state/useGameStore';

const ROAM_SUBMODES: RoamSubMode[] = ['peaceful', 'normal', 'survival'];

const seg = (active: boolean) =>
  `min-h-11 whitespace-nowrap rounded-xl px-3 capitalize transition sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 ${
    active ? 'bg-white text-black' : 'text-white/75 active:bg-white/20 sm:hover:bg-white/10'
  }`;

/** Build / Walk switch. Large enough to hit with a thumb. */
export function ModeToggle() {
  const mode = useGameStore((s) => s.mode);
  const setMode = useGameStore((s) => s.setMode);
  return (
    <div className="pointer-events-auto flex gap-1 rounded-2xl bg-black/55 p-1 text-sm text-white backdrop-blur-md sm:rounded-xl">
      {(['build', 'roam'] as const).map((m) => (
        <button key={m} onClick={() => setMode(m)} className={seg(mode === m)} title={m === 'build' ? 'Build (Tab)' : 'Walk (Tab)'}>
          <Icon name={m === 'build' ? 'build' : 'walk'} className="mr-1.5 inline" />
          {m === 'build' ? 'Build' : 'Walk'}
        </button>
      ))}
    </div>
  );
}

const SUBMODE_INFO: Record<RoamSubMode, { icon: string; text: string }> = {
  peaceful: { icon: 'peaceful', text: 'Just explore. Nobody is hostile and you can fly (F).' },
  normal: { icon: 'normal', text: 'Street life bites back: muggers, angry locals and gangs. Fight with fists, a bat and weapons you find.' },
  survival: { icon: 'survival', text: 'Survive the days and nights: robbers, dinosaurs and dragons by day, monsters by night. Hide, fight and last as long as you can.' },
};

/** Walk-mode extras: how dangerous the city is, fly toggle (peaceful only) and sound. */
export function RoamOptions({ stacked = false }: { stacked?: boolean }) {
  const roamSubMode = useGameStore((s) => s.roamSubMode);
  const setRoamSubMode = useGameStore((s) => s.setRoamSubMode);
  const flying = useGameStore((s) => s.flying);
  const toggleFlying = useGameStore((s) => s.toggleFlying);
  const [sound, setSound] = useState(isSoundOn());
  const info = SUBMODE_INFO[roamSubMode];

  return (
    <div className={`pointer-events-auto flex flex-col gap-2 text-sm text-white ${stacked ? '' : 'rounded-xl bg-black/55 p-1 backdrop-blur-md'}`}>
      <div className="flex flex-wrap items-center gap-1">
        {ROAM_SUBMODES.map((sub) => (
          <button key={sub} onClick={() => setRoamSubMode(sub)} className={seg(roamSubMode === sub)}>
            <Icon name={SUBMODE_INFO[sub].icon} className="mr-1 inline" />
            {sub}
          </button>
        ))}
        {roamSubMode === 'peaceful' && (
          <button
            onClick={toggleFlying}
            className={`min-h-11 rounded-xl px-4 transition sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 ${
              flying ? 'bg-sky-400 text-black' : 'text-white/75 active:bg-white/20 sm:hover:bg-white/10'
            }`}
            title="Toggle fly mode (F). Space up, Shift down."
          >
            Fly <span className="hidden text-xs opacity-60 sm:inline">F</span>
          </button>
        )}
        <button
          onClick={() => {
            setSoundOn(!sound);
            setSound(!sound);
          }}
          className="min-h-11 rounded-xl px-3 text-white/75 active:bg-white/20 sm:min-h-0 sm:rounded-lg sm:py-1.5 sm:hover:bg-white/10"
          aria-label={sound ? 'Mute sound' : 'Unmute sound'}
          title="Sound effects"
        >
          <Icon name={sound ? 'sound' : 'mute'} />
        </button>
      </div>
      {stacked && <p className="text-xs leading-snug text-white/60">{info.text}</p>}
    </div>
  );
}

/** Desktop top-left cluster: mode switch plus walk options. */
export function ModeBar() {
  const mode = useGameStore((s) => s.mode);
  return (
    <div className="flex items-center gap-2">
      <ModeToggle />
      {mode === 'roam' && <RoamOptions />}
    </div>
  );
}
