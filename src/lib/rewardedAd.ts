import { create } from 'zustand';
import { isSoundOn, setSoundOn } from '../sim/sfx';

/**
 * Rewarded ads through Google's H5 Games Ads "Ad Placement API" (the adBreak call that ships in
 * the same adsbygoogle.js file as AdSense). The script is loaded from index.html.
 *
 * Rewarded ads only run once Google has enabled H5 Games Ads for the site. Until then the call
 * reports "not ready", and `showRewardedAd` resolves `unavailable`. In development a short
 * sample ad stands in so the whole reward flow can be tried without an approved site.
 */

export type AdResult = 'earned' | 'dismissed' | 'unavailable';

interface BreakInfo {
  breakType?: string;
  breakName?: string;
  breakFormat?: string;
  breakStatus?: string;
}

interface AdBreakOptions {
  type: 'reward';
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAd: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: BreakInfo) => void;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (options: AdBreakOptions) => void;
    adConfig?: (options: Record<string, unknown>) => void;
  }
}

let initialised = false;

/** Sets up the global adBreak / adConfig helpers. Call once at start-up. */
export function initAds() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  window.adsbygoogle = window.adsbygoogle || [];
  const queue = window.adsbygoogle;
  const push = (options: unknown) => void queue.push(options);
  window.adBreak = push;
  window.adConfig = push;
  push({ preloadAdBreaks: 'on', sound: 'on' });
}

// --- Dev-only sample ad --------------------------------------------------------------------

/** Seconds the sample ad runs for. */
export const SAMPLE_AD_SECONDS = 8;

interface SampleAdState {
  /** Seconds left; null when no sample ad is showing. */
  left: number | null;
  /** Called by the overlay's Close button. */
  cancel: () => void;
}

export const useSampleAd = create<SampleAdState>(() => ({ left: null, cancel: () => {} }));

function showSampleAd(): Promise<AdResult> {
  return new Promise((resolve) => {
    let left = SAMPLE_AD_SECONDS;
    const finish = (result: AdResult) => {
      clearInterval(timer);
      useSampleAd.setState({ left: null, cancel: () => {} });
      resolve(result);
    };
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) finish('earned');
      else useSampleAd.setState({ left });
    }, 1000);
    useSampleAd.setState({ left, cancel: () => finish('dismissed') });
  });
}

// --- Real ads ------------------------------------------------------------------------------

/** How long to wait for Google to say an ad is ready before giving up. */
const READY_TIMEOUT_MS = 8000;

function showGoogleAd(name: string): Promise<AdResult> {
  return new Promise((resolve) => {
    if (!window.adBreak) return resolve('unavailable');
    let viewed = false;
    let started = false;
    let done = false;
    let wasSoundOn = true;
    const finish = (result: AdResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    // adBreakDone never fires when the script was blocked, so do not wait forever.
    const timer = setTimeout(() => {
      if (!started) finish('unavailable');
    }, READY_TIMEOUT_MS);

    window.adBreak({
      type: 'reward',
      name,
      // The player already asked for the ad, so show it the moment Google has one.
      beforeReward: (showAd) => {
        started = true;
        showAd();
      },
      beforeAd: () => {
        started = true;
        wasSoundOn = isSoundOn();
        setSoundOn(false);
      },
      afterAd: () => {
        if (wasSoundOn) setSoundOn(true);
      },
      adViewed: () => {
        viewed = true;
      },
      adDismissed: () => finish('dismissed'),
      adBreakDone: (info) => {
        if (viewed || info.breakStatus === 'viewed') finish('earned');
        else if (info.breakStatus === 'dismissed') finish('dismissed');
        else finish('unavailable');
      },
    });
  });
}

/** Plays a rewarded ad. Resolves `earned` only when the viewer watched it to the end. */
export async function showRewardedAd(name: string): Promise<AdResult> {
  initAds();
  let result = await showGoogleAd(name);
  if (result === 'unavailable' && import.meta.env.DEV) result = await showSampleAd();
  return result;
}
