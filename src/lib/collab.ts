import type { RealtimeChannel } from '@supabase/supabase-js';
import { useGameStore } from '../state/useGameStore';
import { useWorldsStore, type Collaborator } from '../state/useWorldsStore';
import { supabase } from './supabaseClient';
import type { WorldPatch } from './worldPersistence';

/**
 * Live link between the players who have the same world open. Each one announces their saved
 * changes on a channel named after the world and the others apply them straight away; the
 * database copy is updated separately by apply_world_patch, so nothing here needs the owner.
 */

let channel: RealtimeChannel | null = null;
let channelWorld: string | null = null;
let stopMode: (() => void) | null = null;

const setOnline = (online: Collaborator[]) => useWorldsStore.setState({ online });

/** Starts listening to a world. Calling it again for the same world does nothing. */
export function joinWorldChannel(worldId: string, me: Collaborator, onPatch: (patch: WorldPatch, from: string) => void) {
  if (channel && channelWorld === worldId) return;
  leaveWorldChannel();
  channelWorld = worldId;
  const ch = supabase.channel(`world:${worldId}`, { config: { broadcast: { self: false }, presence: { key: me.userId } } });
  ch.on('broadcast', { event: 'patch' }, ({ payload }) => {
    const msg = payload as { from?: string; patch?: WorldPatch } | null;
    if (msg?.patch && msg.from !== me.userId) onPatch(msg.patch, msg.from ?? '');
  });
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState() as Record<string, { name?: string; mode?: 'build' | 'roam' }[]>;
    const others: Collaborator[] = [];
    for (const [userId, metas] of Object.entries(state)) {
      if (userId === me.userId) continue;
      others.push({ userId, name: String(metas[0]?.name ?? 'Player'), mode: metas[0]?.mode });
    }
    setOnline(others);
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ name: me.name, mode: useGameStore.getState().mode });
  });
  // Tell the others when this player switches between building and walking around.
  stopMode = useGameStore.subscribe((state, prev) => {
    if (state.mode !== prev.mode) void ch.track({ name: me.name, mode: state.mode });
  });
  channel = ch;
}

export function broadcastPatch(me: string, patch: WorldPatch) {
  if (!channel) return;
  void channel.send({ type: 'broadcast', event: 'patch', payload: { from: me, patch } });
}

export function leaveWorldChannel() {
  stopMode?.();
  stopMode = null;
  if (channel) void supabase.removeChannel(channel);
  channel = null;
  channelWorld = null;
  setOnline([]);
}
