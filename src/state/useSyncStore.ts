import { create } from 'zustand';

/** Where the player's city is being kept. */
export type SyncStatus =
  | 'guest' // not signed in: saved on this device only
  | 'loading' // fetching the saved city after signing in
  | 'saving'
  | 'saved'
  | 'error' // the last cloud save failed; retrying
  | 'offline'; // signed in but the cloud is unreachable; changes stay on this device

/** First sign-in on a device where both a local city and a saved cloud city exist. */
export interface SyncConflict {
  localCount: number;
  cloudCount: number;
}

interface SyncState {
  status: SyncStatus;
  lastSavedAt: number | null;
  error: string | null;
  conflict: SyncConflict | null;
  /** Set by the sync engine while a conflict is open; the dialog calls it with the player's choice. */
  resolveConflict: (choice: 'cloud' | 'local') => void;
  /** Re-attempts a failed save right now. */
  retry: () => void;
}

export const useSyncStore = create<SyncState>(() => ({
  status: 'guest',
  lastSavedAt: null,
  error: null,
  conflict: null,
  resolveConflict: () => {},
  retry: () => {},
}));
