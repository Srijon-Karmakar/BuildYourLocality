import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

// Exercise account persistence without credentials or requests to a real account.
const mock = `
export const state = { session: null };
export const calls = [];
export let offline = false;
export function setOffline(value) { offline = value; }
export const useAuthStore = {
  getState: () => state,
  setState: patch => Object.assign(state, typeof patch === 'function' ? patch(state) : patch),
};
export const supabase = { auth: { updateUser: async patch => {
  calls.push(patch);
  if (offline) return { data: { user: null }, error: new Error('offline') };
  return { data: { user: { ...state.session.user, user_metadata: { ...state.session.user.user_metadata, ...patch.data } } }, error: null };
} } };
`;
const bundle = await rolldown({
  input: 'progress-entry',
  plugins: [{
    name: 'test-account',
    resolveId(id) {
      if (id === 'progress-entry') return '\0entry';
      if (id === 'test-account' || id.endsWith('/useAuthStore') || id.endsWith('/supabaseClient')) return '\0account';
    },
    load(id) {
      if (id === '\0account') return mock;
      if (id === '\0entry') return `export * from ${JSON.stringify(resolve('src/tutorial/progress.ts'))}; export * from 'test-account';`;
    },
  }],
});
const { output } = await bundle.generate({ format: 'es' });
await bundle.close();
await mkdir(resolve('node_modules/.tmp'), { recursive: true });
const generated = resolve('node_modules/.tmp/tutorial-progress-check.mjs');
await writeFile(generated, output[0].code);
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
const { state, calls, setOffline, rememberTutorial, locallySeen } = await import(pathToFileURL(generated));

state.session = { user: { id: 'account-a', user_metadata: { display_name: 'Player A' } } };
await rememberTutorial('account-a');
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], { data: { tutorial_version: 1 } });
assert.equal(state.session.user.user_metadata.display_name, 'Player A');
assert.equal(state.session.user.user_metadata.tutorial_version, 1);
assert.equal(locallySeen('account-a'), true);
await rememberTutorial('account-a');
assert.equal(calls.length, 1, 'acknowledged account must not repeat requests');
assert.equal(locallySeen('account-b'), false, 'completion is scoped to the account');

state.session = { user: { id: 'account-b', user_metadata: {} } };
await rememberTutorial('account-a');
assert.equal(calls.length, 1, 'finishing after an account switch must not mark the new account');
setOffline(true);
await rememberTutorial('account-b');
assert.equal(locallySeen('account-b'), true, 'offline completion is remembered on this device');
assert.equal(state.session.user.user_metadata.tutorial_version, undefined);
setOffline(false);
await rememberTutorial('account-b');
assert.equal(state.session.user.user_metadata.tutorial_version, 1, 'online retry stores completion on the account');
await rememberTutorial(null);
assert.equal(locallySeen(null), true, 'guest completion has a separate device fallback');
assert.equal(calls.length, 3);
console.log('PASS: account metadata, account separation, offline acknowledgement/retry, guest fallback, no real account requests');
