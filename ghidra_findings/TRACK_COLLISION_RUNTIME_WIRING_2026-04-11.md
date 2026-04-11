# Track Collision Runtime Wiring 2026-04-11

Purpose: document the short-term runtime integration for authored static track collision.

## Scope

- This change does not alter the current vehicle solver architecture.
- This change does not revive the worker experiment.
- This change only allows the runtime to prefer authored collision assets for track contact sampling when those assets exist.

## What Was Wired

- `tools/generate-runtime-catalog.js` now emits optional per-track fields:
  - `collisionModel`
  - `collisionMeta`
- `src/game/track.js` now:
  - optionally loads `geometry/collision.glb`
  - optionally loads `geometry/collision.meta.json`
  - keeps using the visible render `track_geom_out.glb` for rendering
  - uses the collision mesh for `floorSampler` when present
  - falls back to the existing render-mesh sampler when collision assets are absent

## Structural Constraint

Confirmed integration rule:

- the collision root must inherit the render track root origin offset
- it must not be independently re-centered from its own bounds

Reason:

- the render track and the collision track were authored in the same source-space
- the current runtime centers the render track at origin for scene use
- independently centering the collision subset would create a transform mismatch between visible world geometry and the contact source
- that kind of mismatch is exactly the class of structural integration error we are trying to avoid after the worker regression

Implementation choice:

- `alignTrackAtOrigin(trackRoot)` is still applied to the render track
- when a collision root is present, it copies the render track transform after alignment

## Current Limitation

- No `collision.glb` / `collision.meta.json` files are checked into `src/data/tracks` yet in the current worktree.
- Therefore this runtime path is presently dormant and safely falls back to the existing sampler.

## Why This Step Exists

- The short-term plan requires restoring authoritative static collision before attempting further gameplay parity work.
- This step keeps the baseline stable while making the runtime ready for authored collision assets generated from original track data.
