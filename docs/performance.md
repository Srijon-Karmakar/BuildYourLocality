# Mobile gameplay optimization

Target: midrange phones with at least 8 GB RAM. Aim for 60 FPS where sustainable and assess
30 FPS as the minimum acceptable device result. RAM alone does not determine GPU performance.
No physical phone FPS result has been measured in this workspace.

## Changes

- Continuous resolution feedback replaces a monitor that stopped after four adjustments.
  It reduces DPR after two slow sampling windows and restores it after five fast windows.
  It ignores long interruptions and resets sampling when tab visibility changes.
  Existing DPR limits and the manual adaptive-resolution switch remain in effect.
- Indexed static geometry retains shared vertices, reducing memory and vertex processing
  without changing rendered triangles, normals, UVs, materials, or shadow settings.
  Multi-material groups and mirrored transforms retain their original appearance.
- Static scenery fingerprints are scanned incrementally with a 2 ms budget between pieces.
  Chunk baking has a 4 ms budget between chunks after the initial load. A single piece
  scan or dense chunk bake can exceed the budget; this is not worker-based meshing.
  Moving a piece invalidates both its old and new chunks. Selection and construction
  transitions also invalidate the scenery promptly.
- Dynamic instance buffers upload only the live prefix for vehicles, pedestrians,
  companion dogs, trains, aircraft and ships. Empty pools skip updates.
- Pedestrian A* uses an indexed priority queue instead of repeated linear frontier searches.
  Search limits, route costs, tie ordering and resulting routes remain the same.
- Terrain updates React state only when its view chunk or radius changes.
- Unbatchable colored instanced scenery retains its instance transforms and colors.

Simulation frequency, population settings, collisions, weather, lighting, shadows, and
gameplay features have not been reduced by these changes. Existing mobile defaults still apply.
Resolution changes affect the 3D canvas; interface text keeps its normal resolution.

## Repeatable checks

```sh
npm run build
npm run lint
node scripts/check-performance.mjs
```

The regression runner checks repeated load/recovery cycles, transient stalls, upload ranges,
identical rendered geometry attributes, multi-material faces, instance data, and exact routes
against the original A* algorithm on 160 deterministic weighted and blocked maps.
It bundles the real TypeScript modules with the already installed Rolldown dependency.

The mixed sphere/box fixture uses 19,144 bytes instead of 70,272 bytes (73% less).
This is a geometry fixture result, not a whole-world memory measurement.
Local CPU pathfinding timings are printed for comparison; they are not mobile FPS results.

Build and lint complete successfully. The repository still reports existing lint warnings
and a build warning about large library chunks.

A headless Chrome smoke check at a 412 × 915 mobile viewport with touch emulation exercised
a seeded city, build/roam switching, cross-chunk moves, undo/redo, removal, night/storm,
shadows enabled, and forest/water terrain edits without JavaScript exceptions or WebGL
context loss. The browser used software WebGL, so its frame rate is not a phone benchmark.
Mobile bloom remains governed by its existing implementation, which skips the postprocess
chain on touch devices even when the setting is enabled.

## Physical device acceptance

Use a production build on the weakest supported phone, with battery saving disabled.
Enable the FPS readout in Settings. Use the same saved city and settings for comparisons.
Measure a cold load, ten minutes of building and driving, busy traffic, night lights,
storm/snow, terrain edits, construction, moving/deleting pieces, and undo/redo.
Check both portrait and landscape and return to the game after backgrounding the browser.
Record frame times and long stalls as well as average FPS; include the phone model,
browser, resolution, active DPR, settings, and city size with every result.

The adaptive controller targets roughly 60 FPS and lowers rendering resolution under load.
It is not a frame-rate limiter and cannot guarantee a 30 FPS floor on every GPU or city.

Reference: [React Three Fiber performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance).
