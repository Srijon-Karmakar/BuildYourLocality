# Apnagali — Project Details

> Living doc. Update this whenever a decision changes — don't let it drift from reality.

## 1. Concept

A browser-based 3D world-building game. Players build their own voxel-terrain worlds with
free-form object placement, then roam/survive in their own world or visit other players' worlds.
Core design pillar: **render only what the player can see**, so it runs on low-spec PCs and phones
without sacrificing realistic, configurable graphics.

## 1b. Direction change: city builder (supersedes the voxel concept above)

The game is now a **tiny-city builder**, not a Minecraft-style voxel sandbox:
- Flat, endless ground on a grid (1 cell = 6 units). No block digging.
- Pick-and-place **presets**: auto-connecting roads, buildings (house, shop, apartments, office, tower), and nature/props (trees, streetlights, benches, parks, plazas).
- Preset **materials**: 6 facades (brick, concrete, glass, wood, plaster, sandstone) and 4 roofs, chosen before placing or applied with the Paint tool. Textures are procedural.
- **Two views, switchable (Tab)**: Build (orbiting top-down camera, click to place) and Walk (first-person walk/fly through your city, with collisions).
- Saves store the list of placed pieces (existing `worlds.objects` column).
- The old voxel engine (src/engine/voxel, useWorldStore) is no longer used by the game; sections 3-4 and 8 below describe the previous design.

## 2. Core Pillars

- **Performance-first**: playable on low-spec PCs and mobile browsers. Viewport-only rendering
  (frustum + occlusion culling, chunked streaming) is a hard requirement, not an optimization pass
  added later.
- **Realistic, configurable graphics**: PBR materials/textures, with a graphics-quality settings
  menu (texture resolution, shadow quality, draw distance, etc.) so the same game scales from a
  budget phone to a gaming PC.
- **Minimal, clean, highly interactive UI/UX**: few menus, obvious affordances, fast to learn.

## 3. Tech Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Runtime | Web browser (desktop + mobile) | No install, instantly updatable, works on low-spec devices, fits the "render only viewport" goal naturally via WebGL |
| 3D engine | **Three.js** | Lightweight core, full manual control for chunk culling/LOD, large ecosystem of voxel-game references |
| World model | **Hybrid**: voxel grid for terrain, free-form snap-to-grid placement for objects/structures on top | Voxel terrain = easy to optimize (chunking, greedy meshing, frustum/occlusion culling); free-form objects = realism for buildings/decor |
| Auth | **Supabase Auth** | Managed, fast to integrate, supports email/social login |
| World persistence | **Supabase Postgres** (world/chunk metadata) + **Supabase Storage** (binary chunk/object blobs) | Single backend to manage; Postgres RLS lets us gate "visit other players' worlds" cleanly |
| Frontend framework | **React + React Three Fiber (R3F)**, TypeScript, Vite | R3F keeps Three.js's manual control over the render loop/culling while letting the clean/minimal UI (menus, inventory, settings) be built in normal React instead of hand-rolled DOM overlays. Vite = fast dev/build, easy to deploy anywhere. |
| Language | **TypeScript** | Decided. |
| Physics | **Rapier** (via `@react-three/rapier`) | WASM-based, fast enough for low-spec targets, actively maintained, integrates directly with R3F. Chosen over a hand-rolled AABB system since survival mode needs real collision/hit detection against varied free-form objects, not just voxel grids. |
| State management | Zustand | Lightweight, works well alongside R3F; avoid Redux-level ceremony for a small team. |
| Styling | Tailwind CSS | Fast to build the minimal/clean UI pillar without a design system overhead. |
| Textures/art | Free & procedural | CC0/free PBR texture packs (e.g. ambientCG, Poly Haven) to start; procedural generation (noise-based terrain variation, procedural material tinting) layered on top where it reduces asset-management burden. No paid/custom art pipeline for now. |
| Hosting | **Vercel** | Zero-config for Vite/React, generous free tier, fast global edge delivery (matters for load-time on mobile/low-spec), trivial Supabase env var integration. Revisit only if static asset/bandwidth costs become a problem (e.g. large texture/world payloads), in which case Cloudflare Pages is the fallback. |

## 4. Game Modes

### Build mode
- Place/remove voxel terrain blocks.
- Place free-form objects (structures, furniture, decor) with grid-snapping on top of terrain.
- Save/load world to Supabase.

### Roam mode
Visit your own world or another player's world (permissions permitting). Three sub-modes:
- **Peaceful** — nothing attacks or harms the player; pure exploration.
- **Normal** — only inherently dangerous objects/hazards can harm the player (no active hostile AI).
- **Survival** — anything can attack/harm the player (hostile AI, hazards, resource/health management).

## 5. Multiplayer / Users

- **Single player**: fully supported from MVP.
- **Co-op**: players join a build session via a shared code and build together. *(Phase 2)*
- **Multiplayer (roam/survival together)**: later phase, after single-player core is solid.

## 6. MVP Scope (current milestone target)

Single-player, full core loop, no multiplayer/co-op yet:
1. Build mode: voxel terrain editing + free-form object placement, with save/load to Supabase.
2. Roam mode: walk around a built world.
3. All three roam sub-modes implemented: peaceful, normal, survival (incl. basic hostile AI and
   player health/damage for survival).
4. Supabase auth (sign up / log in) gating world ownership and "visit other player's world".
5. Viewport-only rendering pipeline (frustum culling at minimum; chunk streaming/occlusion culling
   as stretch goals within MVP if time allows).
6. Graphics settings menu (at least: draw distance, texture quality, shadow toggle).

Explicitly **out of scope** for MVP: multiplayer roam, co-op build, mobile native app wrapper,
monetization, procedural world generation beyond a flat/simple starting terrain.

## 7. Timeline / Team

Solo/small team, no hard deadline — iterating steadily in milestones (see progress.md), not against
a fixed date. Re-evaluate this if a deadline is introduced later.

## 8. World Bounds (decided — changed)

**Infinite horizontally, capped vertically** (128 voxels, chunk layers cy = 0..7). This replaces
the earlier "finite 256x256x128 world" decision: a bounded world looked wrong in play (a floating
slab with visible edges). Chunks are generated on demand around the player and rendered out to the
draw distance; only chunks within 2 chunks of the player get physics colliders.

- Only **edited** chunks are stored/saved (copy-on-write); untouched ground is regenerated from the
  deterministic generator and shares one array and one mesh geometry.
- Save size therefore scales with how much the player has built, not with distance explored.
- Terrain is still flat; noise-based terrain remains a non-goal until decided.

## 9. Open Questions

These need answers before the relevant implementation phase starts — do not guess on these:

- **Mobile input scheme**: touch controls design for build mode (block/object selection,
  placement, rotation) and movement (virtual joystick vs swipe-look) — deferred until desktop
  build mode works, since the interaction patterns will be easier to design against a working
  reference.

## 10. Non-goals (for now)

- Native mobile app builds (iOS/Android) — browser-first, revisit after MVP.
- Monetization/store.
- Procedural terrain generation (worlds start simple/manual-build only, for now).
