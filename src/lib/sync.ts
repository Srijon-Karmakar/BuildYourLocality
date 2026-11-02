import { useAuthStore } from '../state/useAuthStore';
import { useCityStore, type Piece } from '../state/useCityStore';
import { useSyncStore } from '../state/useSyncStore';
import { isSupabaseConfigured } from './supabaseClient';
import { useTerrainStore, type TerrainCell } from '../terrain/terrain';
import { fetchPieces, parsePieces, parseTerrain, pushPieces } from './worldPersistence';

/**
 * Keeps the player's city safe without any button presses.
 *
 * - Every change is written to this device's storage within a moment, signed in or not, so a
 *   guest also picks up where they left off after a refresh.
 * - When signed in, changes are also pushed to the player's account shortly after they stop
 *   editing (and again when the tab is hidden or closed), retrying with back-off if offline.
 * - Signing in loads the saved city automatically. If the player built something as a guest
 *   and also has a saved city, they are asked which to keep.
 *
 * Each local record remembers whether it reached the cloud (`synced`), so work that was
 * never uploaded — closed tab, flaky connection — wins over the older cloud copy next time.
 */

const storageKey = (id: string) => `apnagali.city.v1.${id}`;
const SAVE_DELAY_MS = 1500;
const SAVE_MAX_WAIT_MS = 10_000;
const LOCAL_DELAY_MS = 400;

type Terrain = Record<string, TerrainCell>;

interface LocalRecord {
  pieces: Piece[];
  terrain: Terrain;
  savedAt: number;
  synced: boolean;
}

function readLocal(id: string): LocalRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<LocalRecord>;
    return { pieces: parsePieces(rec.pieces), terrain: parseTerrain({ terrain: rec.terrain }), savedAt: Number(rec.savedAt) || 0, synced: !!rec.synced };
  } catch {
    return null;
  }
}

function writeLocal(id: string, record: LocalRecord) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(record));
  } catch {
    // Storage full or blocked (private mode): the cloud copy still works for signed-in players.
  }
}

function removeLocal(id: string) {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}

// --- Engine state (module-level: there is exactly one city being synced) -------------

/** Account the city belongs to; null while playing as a guest. */
let identity: string | null = null;
let initialized = false;
let identityToken = 0;
/** True while we are writing a loaded city into the store, so it isn't mistaken for an edit. */
let applying = false;
/** Bumped on every edit; `syncedSeq` is the edit that last reached the cloud. */
let changeSeq = 0;
let syncedSeq = 0;
let pushing = false;
let retryDelay = 2000;
let localTimer: ReturnType<typeof setTimeout> | undefined;
let cloudTimer: ReturnType<typeof setTimeout> | undefined;
let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

const setStatus = (patch: Partial<ReturnType<typeof useSyncStore.getState>>) => useSyncStore.setState(patch);
const storageId = () => identity ?? 'guest';
const currentPieces = (): Piece[] => Object.values(useCityStore.getState().pieces);
const currentTerrain = (): Terrain => useTerrainStore.getState().cells;

function applyWorld(pieces: Piece[], terrain: Terrain) {
  applying = true;
  try {
    useTerrainStore.getState().setCells(terrain);
    useCityStore.getState().setPieces(pieces);
  } finally {
    applying = false;
  }
}

function persistLocal(synced: boolean) {
  clearTimeout(localTimer);
  localTimer = undefined;
  writeLocal(storageId(), { pieces: currentPieces(), terrain: currentTerrain(), savedAt: Date.now(), synced });
}

function clearCloudTimers() {
  clearTimeout(cloudTimer);
  clearTimeout(maxWaitTimer);
  clearTimeout(retryTimer);
  cloudTimer = maxWaitTimer = retryTimer = undefined;
}

function scheduleCloud(delay: number) {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => void pushNow(), delay);
  // A long editing session still gets saved periodically instead of waiting for a pause.
  maxWaitTimer ??= setTimeout(() => void pushNow(), SAVE_MAX_WAIT_MS);
}

function markDirty(delay = SAVE_DELAY_MS) {
  changeSeq++;
  if (identity) scheduleCloud(delay);
}

/** The player changed the city. */
function onChange() {
  clearTimeout(localTimer);
  localTimer = setTimeout(() => persistLocal(false), LOCAL_DELAY_MS);
  const status = useSyncStore.getState().status;
  changeSeq++;
  if (!identity || status === 'loading') return;
  if (status !== 'error' && status !== 'offline') setStatus({ status: 'saving' });
  scheduleCloud(SAVE_DELAY_MS);
}

async function pushNow(): Promise<void> {
  clearTimeout(cloudTimer);
  clearTimeout(maxWaitTimer);
  cloudTimer = maxWaitTimer = undefined;
  if (!identity || pushing || changeSeq === syncedSeq) return;

  const uid = identity;
  const seq = changeSeq;
  pushing = true;
  persistLocal(false);
  if (useSyncStore.getState().status !== 'error') setStatus({ status: 'saving' });

  let error: string | null;
  try {
    error = await pushPieces(uid, currentPieces(), currentTerrain());
  } catch (e) {
    error = e instanceof Error ? e.message : 'Network error';
  }
  pushing = false;
  if (uid !== identity) return; // signed out / switched account while saving

  if (error) {
    setStatus({ status: navigator.onLine ? 'error' : 'offline', error });
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void pushNow(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
    return;
  }
  retryDelay = 2000;
  clearTimeout(retryTimer);
  syncedSeq = seq;
  if (changeSeq === seq) {
    persistLocal(true);
    setStatus({ status: 'saved', lastSavedAt: Date.now(), error: null });
  } else {
    scheduleCloud(300); // edited again while saving
  }
}

/** Saves everything right now (used before signing out). */
export async function flushSync(): Promise<void> {
  if (localTimer) persistLocal(changeSeq === syncedSeq);
  for (let i = 0; i < 20 && pushing; i++) await new Promise((r) => setTimeout(r, 100));
  await pushNow();
}

/** Decides what to show after the account (or lack of one) is known. */
async function handleIdentity(): Promise<void> {
  const auth = useAuthStore.getState();
  if (!auth.ready) return;
  const uid = auth.session?.user.id ?? null;
  if (initialized && uid === identity) return;

  const token = ++identityToken;
  const previous = identity;
  const wasInitialized = initialized;
  initialized = true;
  setStatus({ conflict: null });

  // Leaving an account: make sure its last edits are saved first.
  if (previous && changeSeq !== syncedSeq) await pushNow();
  if (token !== identityToken) return;

  clearCloudTimers();
  identity = uid;
  changeSeq = syncedSeq = 0;
  retryDelay = 2000;

  if (!uid) {
    // Signed out (or never signed in): show this device's guest city, never the account's.
    if (wasInitialized && previous) applyWorld([], {});
    const guestRecord = readLocal('guest');
    applyWorld(guestRecord?.pieces ?? [], guestRecord?.terrain ?? {});
    setStatus({ status: 'guest', error: null });
    return;
  }

  setStatus({ status: 'loading', error: null });
  const guest = readLocal('guest');
  const mine = readLocal(uid);

  let cloud: Piece[] | null = null;
  let cloudTerrain: Terrain = {};
  let failed = false;
  try {
    const result = await fetchPieces(uid);
    if (result.error) failed = true;
    else {
      cloud = result.pieces;
      cloudTerrain = result.terrain;
    }
  } catch {
    failed = true;
  }
  if (token !== identityToken) return;

  /** Work on screen from before the cloud answered (a guest session, or edits made while loading). */
  const onScreen = currentPieces();
  const onScreenTerrain = currentTerrain();
  /** Anything built or sculpted so far counts as work worth keeping. */
  const filled = onScreen.length > 0 || Object.keys(onScreenTerrain).length > 0;

  if (failed) {
    // Couldn't reach the account: keep going from this device's copy and sync when we can.
    if (mine) applyWorld(mine.pieces, mine.terrain);
    else if (guest && !filled) applyWorld(guest.pieces, guest.terrain);
    setStatus({ status: 'offline', error: 'Could not reach your account' });
    markDirty(SAVE_DELAY_MS);
    retryTimer = setTimeout(() => void pushNow(), retryDelay);
    return;
  }

  const cloudPieces = cloud ?? [];
  const cloudFilled = cloudPieces.length > 0 || Object.keys(cloudTerrain).length > 0;

  if (mine && !mine.synced) {
    // This device has edits that never reached the cloud: they win over the older copy.
    applyWorld(mine.pieces, mine.terrain);
    markDirty(300);
    setStatus({ status: 'saving' });
  } else if (cloudFilled) {
    if (!mine && filled) {
      // First sign-in on this device with a guest city AND a saved city: let the player choose.
      const choice = await new Promise<'cloud' | 'local'>((resolve) => {
        setStatus({
          conflict: { localCount: onScreen.length + Object.keys(onScreenTerrain).length, cloudCount: cloudPieces.length + Object.keys(cloudTerrain).length },
          resolveConflict: (c) => {
            setStatus({ conflict: null });
            resolve(c);
          },
        });
      });
      if (token !== identityToken) return;
      if (choice === 'cloud') {
        applyWorld(cloudPieces, cloudTerrain);
        persistLocal(true);
        setStatus({ status: 'saved', lastSavedAt: null });
      } else {
        markDirty(300);
        setStatus({ status: 'saving' });
      }
      removeLocal('guest');
    } else {
      applyWorld(cloudPieces, cloudTerrain);
      persistLocal(true);
      setStatus({ status: 'saved', lastSavedAt: null });
    }
  } else {
    // Nothing saved in the account yet: adopt what's here (guest city or this device's copy).
    const source = filled ? { pieces: onScreen, terrain: onScreenTerrain } : { pieces: mine?.pieces ?? [], terrain: mine?.terrain ?? {} };
    if (!filled) applyWorld(source.pieces, source.terrain);
    if (source.pieces.length > 0 || Object.keys(source.terrain).length > 0) {
      markDirty(300);
      setStatus({ status: 'saving' });
      if (filled) removeLocal('guest');
    } else {
      persistLocal(true);
      setStatus({ status: 'saved', lastSavedAt: null });
    }
  }
}

let started = false;

/** Starts autosave. Call once at app start; returns a cleanup function. */
export function startSync(): () => void {
  if (started) return () => {};
  started = true;
  if (!isSupabaseConfigured) setStatus({ status: 'guest' });

  const unsubCity = useCityStore.subscribe((state, prev) => {
    if (applying || state.pieces === prev.pieces) return;
    onChange();
  });
  const unsubTerrain = useTerrainStore.subscribe((state, prev) => {
    if (applying || state.cells === prev.cells) return;
    onChange();
  });
  const unsubAuth = useAuthStore.subscribe(() => void handleIdentity());
  setStatus({
    retry: () => {
      retryDelay = 2000;
      void pushNow();
    },
  });
  void handleIdentity();

  // Leaving the page: the local copy is written synchronously (reliable); the cloud push is best effort.
  const onHide = () => {
    if (document.visibilityState === 'visible') return;
    if (localTimer || changeSeq !== syncedSeq) persistLocal(changeSeq === syncedSeq);
    void pushNow();
  };
  const onPageHide = () => {
    persistLocal(changeSeq === syncedSeq);
    void pushNow();
  };
  const onOnline = () => {
    if (identity && changeSeq !== syncedSeq) {
      retryDelay = 2000;
      void pushNow();
    }
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('online', onOnline);

  return () => {
    started = false;
    unsubCity();
    unsubTerrain();
    unsubAuth();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('online', onOnline);
    clearCloudTimers();
    clearTimeout(localTimer);
  };
}
