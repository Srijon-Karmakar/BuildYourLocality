import { useAuthStore } from '../state/useAuthStore';
import { useCityStore, type Piece } from '../state/useCityStore';
import { useSyncStore } from '../state/useSyncStore';
import { useWorldsStore, worldLimit, type WorldMeta } from '../state/useWorldsStore';
import { isSupabaseConfigured } from './supabaseClient';
import { useTerrainStore, type TerrainCell } from '../terrain/terrain';
import {
  deleteWorldRow,
  fetchExtraSlots,
  fetchWorld,
  listWorlds,
  parsePieces,
  parseTerrain,
  pushWorld,
  renameWorldRow,
  saveExtraSlots,
} from './worldPersistence';

/**
 * Keeps the player's worlds safe without any button presses.
 *
 * - A player keeps several worlds (see useWorldsStore for the limit). One is open at a time.
 * - Every change to the open world is written to this device's storage within a moment, signed
 *   in or not, so a guest also picks up where they left off after a refresh.
 * - When signed in, changes are also pushed to the player's account shortly after they stop
 *   editing (and again when the tab is hidden or closed), retrying with back-off if offline.
 * - Signing in loads the saved worlds automatically. If the player built something as a guest
 *   and the account already has a saved world, they are asked which to keep.
 *
 * Each local record remembers whether it reached the cloud (`synced`), so work that was
 * never uploaded (closed tab, flaky connection) wins over the older cloud copy next time.
 */

/** The single-world format, read once to move old saves into the new layout. */
const legacyKey = (scope: string) => `apnagali.city.v1.${scope}`;
const cityKey = (scope: string, id: string) => `apnagali.city.v2.${scope}.${id}`;
const listKey = (scope: string) => `apnagali.worlds.v1.${scope}`;
const activeKey = (scope: string) => `apnagali.world.active.${scope}`;
const slotsKey = (scope: string) => `apnagali.world.slots.${scope}`;
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

function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked (private mode): the cloud copy still works for signed-in players.
  }
}

function delItem(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseRecord(raw: string | null): LocalRecord | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as Partial<LocalRecord>;
    return { pieces: parsePieces(rec.pieces), terrain: parseTerrain({ terrain: rec.terrain }), savedAt: Number(rec.savedAt) || 0, synced: !!rec.synced };
  } catch {
    return null;
  }
}

const readLocal = (scope: string, id: string) => parseRecord(getItem(cityKey(scope, id)));
const writeLocal = (scope: string, id: string, record: LocalRecord) => setItem(cityKey(scope, id), JSON.stringify(record));
const removeLocal = (scope: string, id: string) => delItem(cityKey(scope, id));

function readList(scope: string): WorldMeta[] {
  try {
    const raw = JSON.parse(getItem(listKey(scope)) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((w): w is WorldMeta => !!w && typeof w.id === 'string' && typeof w.name === 'string')
      .map((w) => ({ id: w.id, name: w.name, updatedAt: Number(w.updatedAt) || 0, pieces: typeof w.pieces === 'number' ? w.pieces : undefined }));
  } catch {
    return [];
  }
}

const writeList = (scope: string, list: WorldMeta[]) => setItem(listKey(scope), JSON.stringify(list));
const readSlots = (scope: string) => Math.max(0, Math.floor(Number(getItem(slotsKey(scope))) || 0));
const writeSlots = (scope: string, n: number) => setItem(slotsKey(scope), String(n));

/** A v4 uuid (the cloud column is a uuid; randomUUID only exists on secure origins). */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

const makeMeta = (name: string): WorldMeta => ({ id: newId(), name, updatedAt: Date.now(), pieces: 0 });

/** Moves a pre-worlds save into the new layout so nobody loses their city. */
function migrateLegacy(scope: string, list: WorldMeta[]): WorldMeta[] {
  const raw = getItem(legacyKey(scope));
  if (!raw) return list;
  const rec = parseRecord(raw);
  delItem(legacyKey(scope));
  if (!rec) return list;
  if (list.length === 0) {
    const meta = { ...makeMeta('My World'), updatedAt: rec.savedAt || Date.now(), pieces: rec.pieces.length };
    // For an account this world is not in the cloud yet, so it must upload.
    writeLocal(scope, meta.id, { ...rec, synced: scope === 'guest' ? rec.synced : false });
    writeList(scope, [meta]);
    return [meta];
  }
  const target = list[0];
  if (!readLocal(scope, target.id)) writeLocal(scope, target.id, rec);
  return list;
}

// --- Engine state (module-level: there is exactly one city being synced) -------------

/** Account the city belongs to; null while playing as a guest. */
let identity: string | null = null;
let initialized = false;
let identityToken = 0;
/** Bumped whenever the open world changes, so a slow load for a world we left is ignored. */
let worldToken = 0;
/** The world being edited (null only for a moment while switching). */
let activeWorldId: string | null = null;
/** The cloud copy could not be read and there is no local copy: saving now could erase it. */
let blocked = false;
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
const scopeOf = () => identity ?? 'guest';
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

const worldsNow = () => useWorldsStore.getState().worlds;

function setWorlds(list: WorldMeta[]) {
  useWorldsStore.setState({ worlds: list });
  writeList(scopeOf(), list);
}

const activeName = () => worldsNow().find((w) => w.id === activeWorldId)?.name ?? 'My World';

/** Keeps the picker's piece count (and, after an edit, "last saved") for the open world current. */
function touchActive(edited: boolean) {
  if (!activeWorldId) return;
  const list = worldsNow();
  const i = list.findIndex((w) => w.id === activeWorldId);
  if (i < 0) return;
  const pieces = currentPieces().length;
  if (list[i].pieces === pieces && !edited) return;
  const next = list.slice();
  next[i] = { ...list[i], pieces, updatedAt: edited ? Date.now() : list[i].updatedAt };
  setWorlds(next);
}

function activate(id: string) {
  activeWorldId = id;
  setItem(activeKey(scopeOf()), id);
  useWorldsStore.setState({ activeId: id });
}

function persistLocal(synced: boolean) {
  clearTimeout(localTimer);
  localTimer = undefined;
  if (!activeWorldId) return;
  writeLocal(scopeOf(), activeWorldId, { pieces: currentPieces(), terrain: currentTerrain(), savedAt: Date.now(), synced });
  touchActive(!synced);
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
  if (!identity || !activeWorldId || pushing || changeSeq === syncedSeq) return;
  if (blocked) {
    // Never save over a cloud world we could not read: try reading it again first.
    void loadCloudWorld(identity, activeWorldId, worldToken);
    return;
  }

  const uid = identity;
  const wid = activeWorldId;
  const name = activeName();
  const seq = changeSeq;
  pushing = true;
  persistLocal(false);
  if (useSyncStore.getState().status !== 'error') setStatus({ status: 'saving' });

  let error: string | null;
  try {
    error = await pushWorld(uid, wid, name, currentPieces(), currentTerrain());
  } catch (e) {
    error = e instanceof Error ? e.message : 'Network error';
  }
  pushing = false;
  if (uid !== identity || wid !== activeWorldId) return; // signed out / switched world while saving

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

/** Loads one cloud world into the editor, reconciling it with this device's copy. */
async function loadCloudWorld(
  uid: string,
  id: string,
  token: number,
  fetched?: { pieces: Piece[] | null; terrain: Terrain; error: string | null },
): Promise<void> {
  const mine = readLocal(uid, id);
  let result = fetched;
  if (!result) {
    try {
      result = await fetchWorld(uid, id);
    } catch {
      result = { pieces: null, terrain: {}, error: 'Network error' };
    }
  }
  if (token !== worldToken || uid !== identity) return;

  if (result.error) {
    // Couldn't reach the account: keep going from this device's copy and sync when we can.
    applyWorld(mine?.pieces ?? [], mine?.terrain ?? {});
    blocked = !mine;
    setStatus({ status: 'offline', error: 'Could not reach your account' });
    if (mine && !mine.synced) markDirty(SAVE_DELAY_MS);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void (blocked ? loadCloudWorld(uid, id, worldToken) : pushNow()), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
    return;
  }

  blocked = false;
  if (mine && !mine.synced) {
    // This device has edits that never reached the cloud: they win over the older copy.
    applyWorld(mine.pieces, mine.terrain);
    markDirty(300);
    setStatus({ status: 'saving', error: null });
  } else if (result.pieces) {
    applyWorld(result.pieces, result.terrain);
    persistLocal(true);
    setStatus({ status: 'saved', lastSavedAt: null, error: null });
  } else {
    // Not in the account yet (a world created offline, or deleted elsewhere): upload this copy.
    applyWorld(mine?.pieces ?? [], mine?.terrain ?? {});
    markDirty(300);
    setStatus({ status: 'saving', error: null });
  }
}

/** Shows the guest's saved world for this device. */
function loadGuest() {
  let list = migrateLegacy('guest', readList('guest'));
  if (list.length === 0) list = [makeMeta('My World')];
  setWorlds(list);
  useWorldsStore.setState({ extraSlots: readSlots('guest'), error: null });
  const id = list.find((w) => w.id === getItem(activeKey('guest')))?.id ?? list[0].id;
  activate(id);
  const record = readLocal('guest', id);
  applyWorld(record?.pieces ?? [], record?.terrain ?? {});
  setStatus({ status: 'guest', error: null });
}

/** Decides what to show after the account (or lack of one) is known. */
async function handleIdentity(): Promise<void> {
  const auth = useAuthStore.getState();
  if (!auth.ready) return;
  const uid = auth.session?.user.id ?? null;
  if (initialized && uid === identity) return;

  const token = ++identityToken;
  ++worldToken;
  const previous = identity;
  const wasInitialized = initialized;
  initialized = true;
  setStatus({ conflict: null });

  // Leaving an account: make sure its last edits are saved first.
  if (previous && changeSeq !== syncedSeq) await pushNow();
  if (token !== identityToken) return;

  // The world on screen is a guest world when we were not signed in.
  const guestWorldId = previous === null ? activeWorldId : null;
  clearCloudTimers();
  identity = uid;
  activeWorldId = null;
  blocked = false;
  changeSeq = syncedSeq = 0;
  retryDelay = 2000;
  const wtoken = worldToken;

  if (!uid) {
    // Signed out (or never signed in): show this device's guest worlds, never the account's.
    if (wasInitialized && previous) applyWorld([], {});
    loadGuest();
    return;
  }

  setStatus({ status: 'loading', error: null });

  let cloudList: WorldMeta[] | null = null;
  try {
    const listed = await listWorlds(uid);
    if (!listed.error) cloudList = listed.worlds;
  } catch {
    // offline: fall back to the list cached on this device
  }
  let extra: number | null = null;
  try {
    extra = await fetchExtraSlots(uid);
  } catch {
    // keep the cached count
  }
  if (token !== identityToken) return;

  const cached = readList(uid);
  let worlds: WorldMeta[];
  if (cloudList) {
    const inCloud = new Set(cloudList.map((w) => w.id));
    // Worlds made on this device that have not reached the account yet stay in the list.
    const pending = cached.filter((w) => !inCloud.has(w.id) && readLocal(uid, w.id)?.synced === false);
    worlds = [...cloudList.map((w) => ({ ...w, pieces: cached.find((c) => c.id === w.id)?.pieces })), ...pending];
  } else {
    worlds = cached;
  }
  worlds = migrateLegacy(uid, worlds);
  const slots = extra ?? readSlots(uid);
  writeSlots(uid, slots);
  useWorldsStore.setState({ extraSlots: slots, error: null });
  const failed = cloudList === null;

  /** Work on screen from before the cloud answered (a guest session, or edits made while loading). */
  const onScreen = currentPieces();
  const onScreenTerrain = currentTerrain();
  /** Anything built or sculpted so far counts as work worth keeping. */
  const filled = onScreen.length > 0 || Object.keys(onScreenTerrain).length > 0;

  const dropGuestWorld = () => {
    if (!guestWorldId) return;
    writeList('guest', readList('guest').filter((w) => w.id !== guestWorldId));
    removeLocal('guest', guestWorldId);
  };

  if (worlds.length === 0) {
    // Nothing saved in the account yet: the first world is whatever is on screen (or empty).
    const meta = makeMeta('My World');
    setWorlds([meta]);
    activate(meta.id);
    if (!filled) applyWorld([], {});
    dropGuestWorld();
    markDirty(300);
    if (failed) {
      setStatus({ status: 'offline', error: 'Could not reach your account' });
      retryTimer = setTimeout(() => void pushNow(), retryDelay);
    } else {
      setStatus({ status: 'saving' });
    }
    return;
  }

  setWorlds(worlds);
  const target = worlds.find((w) => w.id === getItem(activeKey(uid))) ?? worlds[0];
  activate(target.id);

  if (failed) {
    await loadCloudWorld(uid, target.id, wtoken, { pieces: null, terrain: {}, error: 'offline' });
    return;
  }

  if (filled && !readLocal(uid, target.id)) {
    // Signed in with a guest world on screen AND a saved world in the account: let the player choose.
    let cloud: { pieces: Piece[] | null; terrain: Terrain; error: string | null };
    try {
      cloud = await fetchWorld(uid, target.id);
    } catch {
      cloud = { pieces: null, terrain: {}, error: 'Network error' };
    }
    if (token !== identityToken) return;
    if (cloud.error) {
      await loadCloudWorld(uid, target.id, wtoken, cloud);
      return;
    }
    const cloudPieces = cloud.pieces ?? [];
    const cloudCount = cloudPieces.length + Object.keys(cloud.terrain).length;
    if (cloudCount === 0) {
      // The saved world is empty: no choice to make, the guest work moves in.
      dropGuestWorld();
      markDirty(300);
      setStatus({ status: 'saving' });
      return;
    }
    const canAdd = worlds.length < worldLimit(slots);
    const choice = await new Promise<'cloud' | 'local'>((resolve) => {
      setStatus({
        conflict: { localCount: onScreen.length + Object.keys(onScreenTerrain).length, cloudCount, canAdd },
        resolveConflict: (c) => {
          setStatus({ conflict: null });
          resolve(c);
        },
      });
    });
    if (token !== identityToken) return;
    if (choice === 'cloud') {
      applyWorld(cloudPieces, cloud.terrain);
      persistLocal(true);
      setStatus({ status: 'saved', lastSavedAt: null });
    } else {
      if (canAdd) {
        // Keep both: the guest work becomes a new world next to the saved one.
        const meta = makeMeta(`World ${worlds.length + 1}`);
        setWorlds([...worlds, meta]);
        activate(meta.id);
      }
      markDirty(300);
      setStatus({ status: 'saving' });
    }
    dropGuestWorld();
    return;
  }

  setStatus({ status: 'loading' });
  await loadCloudWorld(uid, target.id, wtoken);
}

// --- Worlds: open, create, rename, delete, unlock ---------------------------------------------

const setBusy = (busy: boolean, error: string | null = null) => useWorldsStore.setState({ busy, error });

/** Saves the open world, then shows another one. `flush: false` when the open world is gone. */
async function switchTo(id: string, flush: boolean): Promise<void> {
  if (flush) await flushSync();
  clearCloudTimers();
  clearTimeout(localTimer);
  localTimer = undefined;
  changeSeq = syncedSeq = 0;
  retryDelay = 2000;
  blocked = false;
  const token = ++worldToken;
  activate(id);
  const uid = identity;
  if (!uid) {
    const record = readLocal('guest', id);
    applyWorld(record?.pieces ?? [], record?.terrain ?? {});
    setStatus({ status: 'guest', error: null });
    return;
  }
  setStatus({ status: 'loading', error: null });
  await loadCloudWorld(uid, id, token);
}

/** Opens one of the player's worlds. */
export async function openWorld(id: string): Promise<void> {
  if (useWorldsStore.getState().busy || id === activeWorldId) return;
  if (!worldsNow().some((w) => w.id === id)) return;
  setBusy(true);
  try {
    await switchTo(id, true);
  } finally {
    setBusy(false);
  }
}

/** Starts a new empty world and opens it. Resolves to an error message (or null). */
export async function createWorld(name?: string): Promise<string | null> {
  const state = useWorldsStore.getState();
  if (state.busy) return null;
  if (state.worlds.length >= worldLimit(state.extraSlots)) return 'limit';
  setBusy(true);
  try {
    await flushSync();
    clearCloudTimers();
    const list = worldsNow();
    const meta = makeMeta(cleanName(name) || `World ${list.length + 1}`);
    setWorlds([...list, meta]);
    changeSeq = syncedSeq = 0;
    retryDelay = 2000;
    blocked = false;
    ++worldToken;
    activate(meta.id);
    applyWorld([], {});
    if (identity) {
      markDirty(0); // creates the row straight away so the world survives a reload
      setStatus({ status: 'saving', error: null });
    } else {
      persistLocal(false);
    }
    return null;
  } finally {
    setBusy(false);
  }
}

const cleanName = (name: string | undefined) => (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);

/** Renames a world. Resolves to an error message (or null). */
export async function renameWorld(id: string, name: string): Promise<string | null> {
  const next = cleanName(name);
  if (!next) return 'Give the world a name.';
  setWorlds(worldsNow().map((w) => (w.id === id ? { ...w, name: next } : w)));
  return identity ? renameWorldRow(identity, id, next) : null;
}

/** Deletes a world for good. Deleting the open one opens another (or starts a fresh one). */
export async function deleteWorld(id: string): Promise<string | null> {
  if (useWorldsStore.getState().busy) return null;
  setBusy(true);
  try {
    const wasOpen = id === activeWorldId;
    if (wasOpen) {
      // Let an in-flight save finish so it cannot bring the world back.
      clearCloudTimers();
      for (let i = 0; i < 30 && pushing; i++) await new Promise((r) => setTimeout(r, 100));
    }
    if (identity) {
      const error = await deleteWorldRow(identity, id);
      if (error) return error;
    }
    removeLocal(scopeOf(), id);
    const rest = worldsNow().filter((w) => w.id !== id);
    setWorlds(rest);
    if (!wasOpen) return null;

    clearTimeout(localTimer);
    localTimer = undefined;
    activeWorldId = null;
    if (rest.length > 0) {
      await switchTo(rest[0].id, false);
    } else {
      const meta = makeMeta('My World');
      setWorlds([meta]);
      changeSeq = syncedSeq = 0;
      ++worldToken;
      activate(meta.id);
      applyWorld([], {});
      if (identity) {
        markDirty(300);
        setStatus({ status: 'saving' });
      } else {
        persistLocal(false);
      }
    }
    return null;
  } finally {
    setBusy(false);
  }
}

/** Adds one world slot (called once an ad has been watched). Resolves to an error message (or null). */
export async function grantWorldSlot(): Promise<string | null> {
  const before = useWorldsStore.getState().extraSlots;
  const next = before + 1;
  useWorldsStore.setState({ extraSlots: next });
  writeSlots(scopeOf(), next);
  if (!identity) return null;
  const error = await saveExtraSlots(identity, next);
  if (error) {
    useWorldsStore.setState({ extraSlots: before });
    writeSlots(scopeOf(), before);
  }
  return error;
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
