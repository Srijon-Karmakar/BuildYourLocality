import { combat } from '../sim/combat';
import { useAuthStore } from '../state/useAuthStore';
import { useWalletStore } from '../state/useWalletStore';
import { formatMoney } from './currency';
import { AD_COOLDOWN_S, MAX_ADS_PER_DAY, MONEY_PER_AD, REVIVE_COST, rewardById } from './rewards';
import { showRewardedAd } from './rewardedAd';
import { grantGuestWorldSlot, setServerWorldSlots } from './sync';
import { callWallet, type WalletRow } from './worldPersistence';

/**
 * Money and unlocks.
 *
 * Signed in, the wallet lives on the server and the game can only ask for changes (an ad was
 * watched, an item was bought); the server applies the prices and limits, so nobody can raise
 * their own balance by editing the browser. Playing as a guest keeps a small wallet on this
 * device only, which never reaches an account.
 */

/** Money a guest starts with, and what a new account is given by the server. */
const START_MONEY = 100;
const KEY = 'apnagali.wallet.v2.guest';
const ADS_KEY = 'apnagali.ads.v1';
/** How long found or lost street money waits before it is reported to the server. */
const FLUSH_DELAY_MS = 6000;
const RETRY_MS = 10_000;

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => useAuthStore.getState().session?.user.id ?? null;
const wallet = () => useWalletStore.getState();

function readGuest(): { money: number; unlocks: string[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { money?: unknown; unlocks?: unknown } | null;
    if (!raw) return { money: START_MONEY, unlocks: [] };
    return {
      money: Math.max(0, Math.floor(Number(raw.money) || 0)),
      unlocks: Array.isArray(raw.unlocks) ? raw.unlocks.filter((u): u is string => typeof u === 'string') : [],
    };
  } catch {
    return { money: START_MONEY, unlocks: [] };
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

let loadedFor: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | null = null;

/** Takes the server's wallet as the truth, keeping street money that has not been reported yet. */
function applyServer(w: WalletRow, unlocks = true) {
  useWalletStore.setState((s) => ({
    money: w.money + s.pendingDelta,
    ...(unlocks ? { unlocks: w.unlocks } : {}),
  }));
  setServerWorldSlots(w.extraWorlds);
}

async function load() {
  const id = uid();
  loadedFor = null;
  clearTimeout(retryTimer);
  const ads = readAds();
  if (!id) {
    useWalletStore.setState({ ...readGuest(), pendingDelta: 0, ...ads });
    return;
  }
  // Until the server answers there is nothing to show or spend.
  useWalletStore.setState({ money: 0, unlocks: [], pendingDelta: 0, ...ads });
  const { wallet: w } = await callWallet('wallet_ensure');
  if (uid() !== id) return;
  if (!w) {
    retryTimer = setTimeout(() => void load(), RETRY_MS);
    return;
  }
  loadedFor = id;
  applyServer(w);
}

/** Tells the server about street money found or lost since the last report. */
export function flushWallet(): Promise<void> {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  if (flushing) return flushing;
  const id = uid();
  const delta = wallet().pendingDelta;
  if (!id || loadedFor !== id || delta === 0) return Promise.resolve();
  useWalletStore.setState({ pendingDelta: 0 });
  flushing = (async () => {
    const { wallet: w } = delta > 0 ? await callWallet('wallet_earn_walk', { p_amount: delta }) : await callWallet('wallet_lose', { p_amount: -delta });
    flushing = null;
    if (uid() !== id) return;
    if (w) {
      applyServer(w);
    } else {
      // Not reported: keep it and try again shortly.
      useWalletStore.setState((s) => ({ pendingDelta: s.pendingDelta + delta }));
      flushTimer = setTimeout(() => void flushWallet(), RETRY_MS);
    }
  })();
  return flushing;
}

/** Starts keeping the wallet in step. Call once at app start; returns a cleanup function. */
export function startWallet(): () => void {
  void load();
  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if (s.session?.user.id !== prev.session?.user.id) void load();
  });
  const unsubWallet = useWalletStore.subscribe((s, prev) => {
    if (uid()) {
      if (s.pendingDelta !== prev.pendingDelta && s.pendingDelta !== 0 && !flushTimer) flushTimer = setTimeout(() => void flushWallet(), FLUSH_DELAY_MS);
      return;
    }
    if (s.money === prev.money && s.unlocks === prev.unlocks) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ money: s.money, unlocks: s.unlocks }));
    } catch {
      // storage blocked: the balance lasts until the page closes
    }
  });
  const onHide = () => {
    if (document.visibilityState !== 'visible') void flushWallet();
  };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    unsubAuth();
    unsubWallet();
    document.removeEventListener('visibilitychange', onHide);
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
  };
}

// --- Earning --------------------------------------------------------------------------------

/** Why an ad cannot be offered right now, or null when it can. */
export function adBlockedReason(): string | null {
  const { adsToday, lastAdAt, watching } = wallet();
  if (watching) return 'An ad is already playing.';
  if (adsToday.day === today() && adsToday.count >= MAX_ADS_PER_DAY) return 'That is all the ads for today. Come back tomorrow.';
  const wait = Math.ceil(AD_COOLDOWN_S - (Date.now() - lastAdAt) / 1000);
  if (wait > 0) return `Next ad in ${wait}s.`;
  return null;
}

function noteAdWatched() {
  const state = wallet();
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

/** Watch an ad, get money. Resolves to a message for the player (success or why not). */
export async function watchAdForMoney(): Promise<string> {
  const { earned, message } = await playAd('earn_money');
  if (!earned) return message ?? UNAVAILABLE;
  if (uid()) {
    const { wallet: w, error } = await callWallet('wallet_earn_ad');
    if (!w) return error ?? UNAVAILABLE;
    applyServer(w);
  } else {
    useWalletStore.setState((s) => ({ money: s.money + MONEY_PER_AD }));
  }
  return `+${formatMoney(MONEY_PER_AD)}`;
}

/**
 * Redeems a developer code. The code is checked on the server (it is never in the game files) and
 * the balance it returns replaces the local one. Resolves to a message for the player.
 */
export async function redeemCode(code: string): Promise<string> {
  const clean = code.trim();
  if (!clean) return 'Enter a code.';
  if (!uid()) return 'Sign in to redeem a code.';
  await flushWallet();
  const { wallet: w, added, error } = await callWallet('redeem_money_code', { p_code: clean });
  if (!w) return error ?? 'Could not check the code.';
  if (!added || added <= 0) return 'That code is not valid.';
  applyServer(w, false);
  return `Code accepted: +${formatMoney(added)}`;
}

// --- Spending -------------------------------------------------------------------------------

export const owns = (id: string) => wallet().unlocks.includes(id);

/** Buys an item with money. Resolves to a message for the player. */
export async function buyReward(id: string): Promise<string> {
  const reward = rewardById(id);
  if (!reward) return 'Unknown reward.';
  const { money, unlocks } = wallet();
  if (!reward.repeatable && unlocks.includes(id)) return 'You already own this.';
  if (money < reward.cost) return `You need ${formatMoney(reward.cost - money)} more.`;

  if (uid()) {
    await flushWallet();
    const { wallet: w, error } = await callWallet('wallet_buy', { p_item: id });
    if (!w) return error ?? 'The purchase did not go through.';
    applyServer(w);
    return reward.id === 'slot' ? 'World slot unlocked.' : `${reward.label} unlocked.`;
  }

  useWalletStore.setState({ money: money - reward.cost });
  if (reward.id === 'slot') {
    grantGuestWorldSlot();
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

/** After a knock-out: pay to carry on from where you fell. Resolves to a message when it fails. */
export async function reviveWithMoney(): Promise<string | null> {
  const { money } = wallet();
  if (money < REVIVE_COST) return `You need ${formatMoney(REVIVE_COST - money)} more.`;
  if (uid()) {
    await flushWallet();
    const { wallet: w, error } = await callWallet('wallet_buy', { p_item: 'revive' });
    if (!w) return error ?? 'The purchase did not go through.';
    applyServer(w);
  } else {
    useWalletStore.setState({ money: money - REVIVE_COST });
  }
  combat.revive();
  return null;
}
