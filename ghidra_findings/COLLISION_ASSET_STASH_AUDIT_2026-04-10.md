# Collision Asset Stash Audit 2026-04-10

Purpose: record what `stash-collisions` actually contains so step 2 of the short-term reset plan can proceed without reviving the failed worker/runtime experiment.

This note is short-term and implementation-focused.

## Confirmed Stash Content

Confirmed from `stash@{0}` (`stash-collisions`):

- tracked runtime/catalog edits:
  - `src/game/track.js`
  - `src/game/physics.js`
  - `src/game/generated/runtimeAssetCatalog.js`
  - `src/index.js`
  - `tools/generate-runtime-catalog.js`
- untracked collision/debug files in the stash's third parent:
  - `tools/generate-track-collision-assets.js`
  - `src/collisionDebug.js`
  - `collision-debug.html`
  - `src/game/trackCollisionAsset.js`
  - `src/game/workerCollisionWorld.js`
  - `src/game/physicsWorker.js`
  - `src/game/physicsWorkerClient.js`
  - generated `geometry/collision.glb`
  - generated `geometry/collision.meta.json`

## Confirmed Behavior Of The Recovered Generator

`tools/generate-track-collision-assets.js` reads:

- `track_bvh.gen`
- `track_cdb2.gen`
- `track_geom_log.txt`

Confirmed outputs:

- `collision.meta.json`
- `collision.glb`

Confirmed content of those outputs:

- BVH primitive bounding boxes from `track_bvh.gen`
- BVH node bounding boxes from `track_bvh.gen`
- `track_cdb2.gen` header fields only
- static batch metadata from `track_geom_log.txt`
- model markers from `track_geom_log.txt`
- dynamic object names/flags from `Compact Meshes`

## Important Constraint

This recovered generator does **not** reconstruct authoritative collision triangles from the original generated collision data.

It currently builds a debug GLB from:

- BVH primitive AABBs
- BVH node AABBs
- dynamic marker/model bounds

That makes it useful for:

- validating `.gen` parsing
- visualizing collision-side structure
- recovering dynamic object metadata
- checking offsets, counts, and naming

That does **not** make it sufficient as the final vehicle/world collision source.

## Implementation Consequence

Short-term step 2 remains valid, but it must be split:

1. recover the stash parser/debug path in isolation
2. use it to validate the original generated collision inputs
3. build the real authored collision extraction path from the original generated files
4. only then wire that path into the new low-level collision solver

## Reuse Guidance

Safe to reuse now:

- `tools/generate-track-collision-assets.js`
- `src/collisionDebug.js`
- `collision-debug.html`

Do not merge as-is into live runtime:

- worker-related files from the stash
- `track.js` runtime changes from the stash
- heuristic dynamic-object runtime path from the stash

## Relation To Short-Term Reset Plan

This audit narrows step 2 in [SHORT_TERM_PHYSICS_RESET_PLAN_2026-04-10.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/SHORT_TERM_PHYSICS_RESET_PLAN_2026-04-10.md):

- the stash gives a real parser/debug foothold
- it does not yet give the final authoritative collision import

Follow-up format work is tracked in [TRACK_CDB2_INITIAL_FORMAT_FINDINGS_2026-04-10.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/TRACK_CDB2_INITIAL_FORMAT_FINDINGS_2026-04-10.md).
