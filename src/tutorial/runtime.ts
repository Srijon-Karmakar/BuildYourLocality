/** A separate JS/game context: never initialize world saving, wallets, ads or account sessions here. */
export const isPractice = typeof window !== 'undefined' && (window.location.pathname.endsWith('/practice.html') || new URLSearchParams(window.location.search).get('practice') === '1');
export const TUTORIAL_VERSION = 1;
export const TUTORIAL_MESSAGE = 'apnagali:tutorial-close';
