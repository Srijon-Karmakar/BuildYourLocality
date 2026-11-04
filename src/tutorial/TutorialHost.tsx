import { useEffect, useRef } from 'react';
import { useAuthStore } from '../state/useAuthStore';
import { useBootStore } from '../state/useBootStore';
import { useSyncStore } from '../state/useSyncStore';
import { useTutorialStore } from '../state/useTutorialStore';
import { locallySeen, rememberTutorial } from './progress';
import { TUTORIAL_MESSAGE, TUTORIAL_VERSION } from './runtime';
import { pauseWorldAudio } from '../audio/engine';

export function HelpButton() {
  const launch = useTutorialStore((s) => s.launch);
  return (
    <button onClick={launch} aria-label="Help: replay tutorial" title="Help: replay tutorial"
      className="pointer-events-auto flex h-9 shrink-0 items-center gap-1 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur-[6px] active:bg-white/20 sm:h-10 sm:text-sm">
      <span aria-hidden="true" className="text-base">?</span> Help
    </button>
  );
}

export function TutorialHost() {
  const open = useTutorialStore((s) => s.open);
  const session = useAuthStore((s) => s.session);
  const ready = useAuthStore((s) => s.ready);
  const started = useBootStore((s) => s.started);
  const conflict = useSyncStore((s) => s.conflict);
  const frame = useRef<HTMLIFrameElement>(null);
  const owner = useRef<string | null>(null);
  const shown = useRef(new Set<string>());
  const userId = session?.user.id ?? null;
  const version = Number(session?.user.user_metadata.tutorial_version) || 0;
  const dismiss = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    shown.current.add(owner.current ?? 'guest');
    void rememberTutorial(owner.current).catch(() => {});
    useTutorialStore.getState().close();
  };

  useEffect(() => {
    if (!ready || !started || conflict || open) return;
    const scope = userId ?? 'guest';
    if (shown.current.has(scope) || version >= TUTORIAL_VERSION || locallySeen(userId)) return;
    shown.current.add(scope);
    useTutorialStore.getState().launch();
  }, [ready, started, conflict, open, userId, version]);

  useEffect(() => {
    const retry = () => {
      if (locallySeen(userId)) void rememberTutorial(userId).catch(() => {});
    };
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [userId, version]);

  useEffect(() => {
    if (!open) return;
    owner.current = userId;
    const resumeAudio = pauseWorldAudio();
    const previous = document.activeElement;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow ||
        event.data?.type !== TUTORIAL_MESSAGE) return;
      dismiss();
    };
    window.addEventListener('message', onMessage);
    return () => {
      resumeAudio();
      window.removeEventListener('message', onMessage);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
    // Capture the account at launch, rather than marking a different account after a sign-in change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const url = new URL('./practice.html', window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('practice', '1');
  return (
    <div role="dialog" aria-modal="true" aria-label="Interactive tutorial" className="absolute inset-0 z-[150] bg-slate-950">
      <iframe ref={frame} title="Practice city tutorial" src={url.href} className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen" onLoad={() => frame.current?.focus()} />
      <button onClick={dismiss} aria-label="Skip tutorial" className="absolute z-10 min-h-10 rounded-full bg-slate-950 px-4 text-sm text-white"
        style={{ right: '0.75rem', top: 'calc(var(--safe-top) + 0.6rem)' }}>Skip tutorial</button>
    </div>
  );
}
