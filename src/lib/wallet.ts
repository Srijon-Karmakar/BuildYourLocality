import { combat } from '../sim/combat';
import { useAuthStore } from '../state/useAuthStore';
import { useWalletStore } from '../state/useWalletStore';
import { AD_COOLDOWN_S, MAX_ADS_PER_DAY, REVIVE_COST, TOKENS_PER_AD, rewardById } from './rewards';
import { showRewardedAd } from './rewardedAd';
import { grantWorldSlot } from './sync';
import { fetchWallet, saveWallet } from './worldPersistence';

/**
 * Tokens and unlocks. They are kept on this device for everyone and also in the account when
 * signed in (cloud wins when it can be read). Rewarded ads give no server-side proof of a
 * viewing, so the balance is trusted to the client: fine for a casual game, not for real money.
 */

const KEY = 'apnagali.wallet.v1.';
const ADS_KEY = 'apnagali.ads.v1';
const SAVE_DELAY_MS = 1200;

const today = () => new Date().toISOString().slice(0, 10);
const scope = () => useAuthStore.getState().session?.user.id ?? 'guest';

function readLocal(id: string): { tokens: number; unlocks: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY + id) ?? 'null') as { tokens?: unknown; unlocks?: unknown } | null;
    return {
      tokens: Math.max(0, Math.floor(Number(raw?.tokens) || 0)),
      unlocks: Array.isArray(raw?.unlocks) ? raw.unlocks.filter((u): u is string => typeof u === 'string') : [],
    };
  } catch {
    return { tokens: 0, unlocks: [] };
  }
}

function readAds() {
  try {
    const raw = JSON.parse(localStorage.getItem(ADS_KEY) ?? 'null') as { day?: string; count?: number; last?: number } | null;
    const fresh = raw?.day === today();
    return { adsToday: { day: today(), count: fresh ? Number(raw?.count) || 0 : 0 }, lastAdAt: Number(raw?.last) || 0 };
  } catch {
    return { adsToday: { day: today(), count: 0 }, lastAdAt: 0 };
  }
}

let applying = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let loadedFor: string | null = null;

function pushToCloud() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const uid = useAuthStore.getState().session?.user.id;
  if (!uid || loadedFor !== uid) return;
  const { tokens, unlocks } = useWalletStore.getState();
  void saveWallet(uid, { tokens, unlocks });
}

async function load() {
  const id = scope();
  loadedFor = null;
  applying = true;
  useWalletStore.setState({ ...readLocal(id), ...readAds() });
  applying = false;
  if (id === 'guest') return;
  let cloud = null;
  try {
    cloud = await fetchWallet(id);
  } catch {
    // keep the device copy
  }
  if (scope() !== id) return;
  if (cloud) {
    applying = true;
    useWalletStore.setState(cloud);
    applying = false;
    localStorage.setItem(KEY + id, JSON.stringify(cloud));
  }
  loadedFor = id;
}

/** Starts keeping the wallet saved. Call once at app start; returns a cleanup function. */
export function startWallet(): () => void {
  void load();
  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if (s.session?.user.id !== prev.session?.user.id) void load();
  });
  const unsubWallet = useWalletStore.subscribe((s, prev) => {
    if (applying || (s.tokens === prev.tokens && s.unlocks === prev.unlocks)) return;
    try {
      localStorage.setItem(KEY + scope(), JSON.stringify({ tokens: s.tokens, unlocks: s.unlocks }));
    } catch {
      // storage blocked: the balance lasts until the page closes
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushToCloud, SAVE_DELAY_MS);
  });
  const onHide = () => {
    if (document.visibilityState !== 'visible') pushToCloud();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsubAuth();
    unsubWallet();
    document.removeEventListener('visibilitychange', onHide);
    clearTimeout(saveTimer);
  };
}

// --- Earning --------------------------------------------------------------------------------

/** Why an ad cannot be offered right now, or null when it can. */
export function adBlockedReason(): string | null {
  const { adsToday, lastAdAt, watching } = useWalletStore.getState();
  if (watching) return 'An ad is already playing.';
  if (adsToday.day === today() && adsToday.count >= MAX_ADS_PER_DAY) return 'That is all the ads for today. Come back tomorrow.';
  const wait = Math.ceil(AD_COOLDOWN_S - (Date.now() - lastAdAt) / 1000);
  if (wait > 0) return `Next ad in ${wait}s.`;
  return null;
}

function noteAdWatched() {
  const state = useWalletStore.getState();
  const count = (state.adsToday.day === today() ? state.adsToday.count : 0) + 1;
  const now = Date.now();
  useWalletStore.setState({ adsToday: { day: today(), count }, lastAdAt: now });
  try {
    localStorage.setItem(ADS_KEY, JSON.stringify({ day: today(), count, last: now }));
  } catch {
    // ignore
  }
}

const UNAVAILABLE = 'No ad is available right now. Try again in a little while.';

/** Plays an ad for the given reason; resolves `earned` / a message for the player when it did not pay out. */
async function playAd(name: string): Promise<{ earned: boolean; message: string | null }> {
  const blocked = adBlockedReason();
  if (blocked) return { earned: false, message: blocked };
  useWalletStore.setState({ watching: true });
  try {
    const result = await showRewardedAd(name);
    if (result === 'earned') {
      noteAdWatched();
      return { earned: true, message: null };
    }
    return { earned: false, message: result === 'dismissed' ? 'The ad was closed early, so no reward.' : UNAVAILABLE };
  } finally {
    useWalletStore.setState({ watching: false });
  }
}

/** Watch an ad, get tokens. Resolves to a message for the player (success or why not). */
export async function watchAdForTokens(): Promise<string> {
  const { earned, message } = await playAd('earn_tokens');
  if (!earned) return message ?? UNAVAILABLE;
  useWalletStore.setState((s) => ({ tokens: s.tokens + TOKENS_PER_AD }));
  return `+${TOKENS_PER_AD} tokens`;
}

// --- Spending -------------------------------------------------------------------------------

export const owns = (id: string) => useWalletStore.getState().unlocks.includes(id);

/** Buys a reward with tokens. Resolves to a message for the player. */
export async function buyReward(id: string): Promise<string> {
  const reward = rewardById(id);
  if (!reward) return 'Unknown reward.';
  const { tokens, unlocks } = useWalletStore.getState();
  if (!reward.repeatable && unlocks.includes(id)) return 'You already own this.';
  if (tokens < reward.cost) return `You need ${reward.cost - tokens} more tokens.`;
  useWalletStore.setState({ tokens: tokens - reward.cost });
  if (reward.id === 'slot') {
    const error = await grantWorldSlot();
    if (error) {
      useWalletStore.setState((s) => ({ tokens: s.tokens + reward.cost }));
      return error;
    }
    return 'World slot unlocked.';
  }
  useWalletStore.setState((s) => ({ unlocks: [...s.unlocks, id] }));
  return `${reward.label} unlocked.`;
}

// --- Reviving -------------------------------------------------------------------------------

/** After a knock-out: watch an ad to carry on from where you fell. */
export async function reviveWithAd(): Promise<string | null> {
  const { earned, message } = await playAd('revive');
  if (!earned) return message;
  combat.revive();
  return null;
}

export function reviveWithTokens(): string | null {
  const { tokens } = useWalletStore.getState();
  if (tokens < REVIVE_COST) return `You need ${REVIVE_COST - tokens} more tokens.`;
  useWalletStore.setState({ tokens: tokens - REVIVE_COST });
  combat.revive();
  return null;
}
