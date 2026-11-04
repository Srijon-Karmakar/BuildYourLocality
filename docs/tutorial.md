# First-player tutorial

The top-bar **Help** button opens an interactive practice city in English. The 15 lessons
cover camera movement, placing a road and a house, looking and walking, entering/driving/
exiting a car, starting survival, crouching, using the torch, attacking, and entering/leaving
shelter. Each action enables the next lesson. Desktop players can press Enter to advance a
completed lesson and Esc to release the mouse. Touch instructions explain the joystick,
buttons and tap-to-confirm building flow. Skip and Restart practice are available.

The tutorial appears after Start for an account without the current tutorial version.
Completing or skipping stores `tutorial_version` in Supabase Auth user metadata; no database
migration is required. A per-account local acknowledgement handles offline play and is retried
when online. Guests use a separate device-local acknowledgement. Help always permits replay,
even after an acknowledgement, and starts with a fresh practice city.

`practice.html` loads the practice app in a separate same-origin iframe. It starts no world
sync, wallet sync, account session, co-op connection or ads. Settings, sky, politics, missions
and city-stat persistence are disabled in this context. Tutorial buildings and money belong
only to that context. The original world's renderer/physics/simulation and audio are paused;
closing the tutorial destroys the practice context and resumes the original world. Survival
practice clears threats and maintains player health so learning controls is safe.

The tutorial code is loaded on demand. The practice city uses the player's graphics settings
and a small fixed scene. Beginning the first action waits for an actual rendered frame so
input is not requested before physics and camera controls are ready.

## Verification

Run the dev server in one terminal, then run the browser checks in another:

```sh
npm run dev -- --host 127.0.0.1
node scripts/check-tutorial.mjs
node scripts/check-survival-controls.mjs
```

The browser checks require installed Chrome/Chromium (or Edge on Windows). `CHROME_PATH`
overrides the executable and `APNAGALI_TEST_URL` overrides the local dev URL. They use fresh
test profiles under ignored `node_modules/.tmp` and do not use the player's browser profile.
Run the browser scripts sequentially because they share a debugging port.

```sh
node scripts/check-tutorial-progress.mjs
node scripts/check-performance.mjs
npm run build
npm run lint
```

The account-progress check uses a mocked Auth client; it never updates a real account.
It verifies account metadata, account changes, acknowledgement deduplication, offline retry,
and the guest fallback. Real cross-device account behavior requires a configured Supabase
account and network access.
