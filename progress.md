# Apnagali — Progress Log

> Update this after every meaningful work session. Newest entry on top. Keep entries short —
> what changed, what's next, what's blocked.

## 2026-10-29 — Build mode: block placement/removal, plus atmosphere fix

**Status:** Build mode now actually does something — left-click removes the targeted voxel,
right-click places a stone block into the empty voxel next to it, and the world visibly updates.
Also fixed the scene looking like an empty black void.

**Triggered by user feedback:** after testing the previous movement milestone, the user reported
the game looked "totally empty" (screenshot: flat green ground, black sky, Build mode doing
nothing). This was accurate — Build mode had no placement interaction yet, and the world was a
single flat color with no sky gradient or reference objects. Treated as a real gap, not just
framing.

**Built:**
- Atmosphere: sky-colored `background` + `fog` on the Canvas (`Scene.tsx`) instead of flat black,
  and a crosshair reticle (`ui/Crosshair.tsx`) so the viewport reads as an active game.
- `state/useWorldStore.ts`: lifted chunk data out of `World.tsx`'s local state into a Zustand
  store so it can be mutated. `setVoxelWorld(wx, wy, wz, voxelId)` converts world voxel
  coordinates to chunk + local coordinates, clones the affected chunk's `Uint8Array` (so React/
  `useMemo` sees a new reference and re-meshes), and no-ops if the target chunk doesn't exist yet
  (outside the generated bounds) or the voxel is already that value.
- `engine/player/BuildInteraction.tsx`: every frame, raycasts from the camera via
  `world.castRayAndGetNormal` (reusing the chunks' physics colliders rather than a separate
  Three.js raycast path) to find the targeted voxel (for removal) and the empty voxel just past
  it along the hit normal (for placement). Left-click removes, right-click places (hardcoded to
  stone — no block palette yet). A wireframe box highlights the targeted voxel.

**Three real bugs found and fixed during verification** (not caught by `tsc`, only by actually
driving the app):
1. **Stale physics collider after editing.** `@react-three/rapier`'s automatic
   `colliders="trimesh"` only scans a RigidBody's children for geometry once, on mount — it does
   *not* react to the mesh's geometry changing later (confirmed by reading its source: the
   generating effect's dependency array is `[options.colliders]` only). So after the very first
   edit, the chunk's mesh would visually update but its collider — and therefore any raycast
   against it — would still reflect the pre-edit shape. Fixed by adding a `chunkVersions` counter
   to the store, bumped per chunk on every edit, and folding it into the `key` prop in
   `World.tsx` so the edited chunk's `RigidBody` fully remounts (forcing fresh collider
   generation) whenever its data changes.
2. **Wrong Rapier property name.** Used `hit.toi`, which is `undefined` — the actual field is
   `hit.timeOfImpact`. This produced `NaN` world coordinates that silently failed the "does this
   chunk exist" check in the store (no chunk key `"NaN,NaN,NaN"`), so placement/removal just
   quietly did nothing, with no error anywhere. Only caught by directly inspecting the raycast
   hit object's actual shape against Rapier's type declarations, after screenshots and solid-voxel
   counts showed no effect from clicking.
3. **Self-intersection with the player's own collider.** The raycast originates at the camera,
   which sits inside the player's own capsule collider. Without excluding that body, the ray hit
   itself at `timeOfImpact: 0` every frame (a plausible-looking but bogus "hit"), long before this
   was traced back to bug #2 being masked by bug #3 underneath it — fixing the `.toi` typo alone
   wasn't enough until this was found too. Fixed by lifting the player's body ref up into
   `Scene.tsx` and passing it into both `PlayerController` (which owns it) and `BuildInteraction`
   (which now passes it as `filterExcludeRigidBody`) — `PlayerController` was changed to accept
   `bodyRef` as a prop instead of creating its own.

**Verification approach:** screenshots alone were not reliable here (confirmed again — a
before/after diff looked identical even once things were working, because the targeted voxel can
shift to a different surface the moment geometry changes mid-interaction). What actually caught
the bugs was reading the Rapier raycast hit object and the Zustand store's raw chunk arrays
directly via a temporary `window.__debug*` handle in headless Chromium, removed after use. Final
state was then confirmed visually too (screenshot shows the grass block gone and brown dirt
exposed underneath, matching the store-level change) as a sanity check that the visual and data
layers agree.

**Next up:**
- Block palette (currently every placement is hardcoded to stone).
- Give build mode a separate no-gravity "fly" movement instead of sharing roam's grounded walk.
- Mobile touch control scheme (project-details.md §9).
- Create the actual Supabase project and wire real auth + world save/load.

## 2026-10-29 — Player movement: grounded walk + jump

**Status:** Player can fall under gravity, land on the voxel ground, walk with WASD, and jump.
Movement is relative to look direction (yaw only). No build-mode block editing yet.

**Built:**
- `src/engine/player/useKeyboardControls.ts`: tracks held WASD/arrow/space keys in a ref (not
  React state) so the per-frame physics loop can read input without re-rendering on every
  keypress.
- `src/engine/player/PlayerController.tsx`: a Rapier dynamic `RigidBody` capsule (radius 0.4,
  half-height 0.5), rotation-locked so it doesn't tip over. Each frame: reads camera yaw (pitch
  ignored) to build forward/right vectors, sets horizontal velocity from WASD input, does a
  downward raycast (excluding its own body) to detect "grounded" for jump, and syncs the R3F
  default camera's *position* to the body's translation + eye-height offset. Camera *rotation*
  stays owned by `PointerLockControls` — the two deliberately never touch the same transform
  property, to avoid fighting each other.
- Wired into `Scene.tsx` inside the existing `<Physics>` block, alongside `<World />`.

**Verified (not just compiled):** started the dev server, drove it with headless Chromium, and
read the Rapier body's actual `translation()`/`linvel()` each step (not just screenshots, which
turned out to be a poor signal here — more below):
- Player spawns at y=10, falls, and comes to rest at y≈4.9 — consistent with the capsule's
  bottom (half-height + radius = 0.9 below center) touching the grass top at y=4.
- Holding `W` moved the player ~6 units in 1 second, matching `WALK_SPEED = 6`.
- Pressing `Space` while grounded set vertical velocity to the jump speed, the player rose, then
  gravity brought it back down to the *same* resting height — no clipping through the ground,
  no stuck-in-air state.
- No console/runtime errors in any of the above.

**False alarm worth recording:** a before/after screenshot taken while holding `W` looked
*visually identical*, which looked like a movement bug at first. It wasn't — the camera sits
very close to a flat, texture-less grass plane (no visual texture/parallax cues yet), so 6 units
of travel produces almost no visible change in that framing. Reading the physics body's actual
position directly (via a temporary `window.__debugPlayer` handle, removed after use) was the
only reliable way to confirm movement. **Lesson for future verification passes on this
project:** screenshots are a weak signal for motion over a featureless ground plane — prefer
reading state directly, or verify against textured/featured terrain once placed objects exist.
- Also confirmed, while debugging: R3F's default camera does a one-time `camera.lookAt(0,0,0)`
  only at creation (`!state.camera` check in its source) — not on every resize — so it does
  *not* keep fighting `PointerLockControls`' mouse-look after the player starts looking around.
  Explains the initial diagonal-looking spawn orientation; not a bug.

**Next up:**
- Build-mode block placement/removal interaction (raycast against chunk meshes, edit
  `ChunkData`, re-mesh the affected chunk).
- Give build mode a separate no-gravity "fly" movement variant from roam's grounded walk (not
  done yet — `PlayerController` currently always applies gravity/ground collision in both modes).
- Mobile touch control scheme (project-details.md §9).
- Create the actual Supabase project and wire real auth + world save/load.

## 2026-10-29 — First scaffold: renders a chunked voxel world

**Status:** Project scaffolded and verified running in-browser. No save/load, no auth flows,
no build-mode editing yet — this milestone proves the render pipeline and app shell.

**Built:**
- Vite + React + TypeScript + Tailwind app shell, R3F canvas full-screen.
- `src/engine/voxel/`: chunk data model (`types.ts`, flat `Uint8Array` per chunk), a hidden-face-culling
  mesher (`chunkMesher.ts` — only emits quads for voxel faces touching air, merged into one
  draw call per chunk), deterministic flat terrain generator (`worldGen.ts`), and the R3F
  `Chunk`/`World` components. Demo world is a 4×4 grid of 16³ chunks (64×64 flat ground) —
  smaller than the ~256×256×128 target bound in project-details.md §8, kept small deliberately
  to measure per-chunk cost before scaling up.
- `Chunk` wraps each mesh in a Rapier `RigidBody` (`type="fixed"`, trimesh collider) so the
  ground is already solid for when player movement/collision is added.
- `src/state/useGameStore.ts`: Zustand store for `mode` (build/roam), `roamSubMode`
  (peaceful/normal/survival), and graphics settings (draw distance, shadows, texture quality).
- `src/lib/supabaseClient.ts` + `.env.example`: Supabase client wired up, warns on missing env
  vars. No Supabase project has been created/connected yet — this is just the client scaffold.
- `src/ui/`: `ModeBar` (build/roam + roam sub-mode buttons) and `SettingsPanel` (draw distance
  slider, texture quality, shadow toggle) as a minimal overlay on top of the canvas.

**Verified:** `tsc --noEmit` clean; dev server boots; drove the running app with Playwright
(headless Chromium) — scene renders the voxel terrain, mode switching and the settings panel
work, no console/runtime errors.

**Bug found and fixed during verification:** drei's `<PointerLockControls />` defaults to
binding its "click-to-lock" handler to `document` (not the canvas) when no `selector` prop is
given — so *any* click anywhere, including the Settings button itself, requested pointer lock
and ate the click meant for the UI. Fixed in `src/scenes/Scene.tsx` by passing
`selector="canvas"`, scoping the lock trigger to the 3D viewport only. Worth remembering: any
future drei/controls additions should be checked for the same document-wide-listener trap
before assuming UI overlays will work untested.

**Next up:**
- Wire actual player movement + first-person camera control in roam mode (currently
  PointerLockControls is attached but there's no character controller yet).
- Build-mode block placement/removal interaction (raycast against chunk meshes, edit
  `ChunkData`, re-mesh the affected chunk).
- Resolve the mobile touch control scheme (last open item, project-details.md §9) once desktop
  placement/movement above is in place.
- Create the actual Supabase project and wire real auth + world save/load.

## 2026-10-29 — Project kickoff

**Status:** Planning only. No code written yet.

**Decided:**
- Platform: web browser, Three.js
- World model: hybrid (voxel terrain + free-form object placement)
- Auth + persistence: Supabase (auth, Postgres, Storage)
- MVP scope: single-player build mode + all 3 roam modes (peaceful/normal/survival)
- Team/timeline: solo/small, steady iteration, no fixed deadline

**Follow-up decisions (same day):**
- Frontend: React + React Three Fiber, TypeScript, Vite
- Physics: Rapier (`@react-three/rapier`)
- State: Zustand · Styling: Tailwind CSS
- Art/textures: free CC0 packs (ambientCG/Poly Haven) + procedural generation, no custom art pipeline
- World bounds: finite bounded world per player (~256×256×128 voxels to start, tunable), not infinite streaming
- Hosting: Vercel

**Still open:** Mobile touch control scheme (deferred until desktop build mode is working —
see `project-details.md` section 9).

**Next up:** Scaffold the project — Vite + React + TS + R3F setup, Supabase project creation
(auth + Postgres schema + Storage bucket), and a minimal Three.js scene rendering a single
voxel chunk with frustum culling in place, as the first implementation milestone.
