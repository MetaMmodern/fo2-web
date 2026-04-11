# Track Collision Extraction Implementation 2026-04-11

Purpose: record the implementation decision that completed the static-collision portion of short-term step 2.

## Decision

Static authored track collision is extracted from:

- `track_geom.w32`
- `track_bvh.gen`

Supporting metadata retained from:

- `track_cdb2.gen` header
- `track_geom_log.txt`

## Why This Path Was Chosen

Confirmed from sampled tracks:

- BVH primitive `id1` acts as a surface id into `track_geom.w32`
- BVH-referenced non-vegetation surfaces are indexed surfaces with supported `polyMode` values:
  - `4` triangle-list style
  - `5` triangle-strip style
- skipped BVH-referenced surfaces are vegetation/local-model surfaces only

That means the static collision mesh can be built directly from original authored W32 surface streams filtered by original BVH references.

## Implemented Tool

Implemented in:

- [generate-track-collision-assets.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/tools/generate-track-collision-assets.js)

Current behavior:

- parses `track_geom.w32` using `tools/flatout-w32-tool.js`
- parses `track_bvh.gen`
- keeps `track_cdb2.gen` header info in metadata
- extracts indexed non-vegetation surfaces referenced by BVH primitive `id1`
- expands:
  - `polyMode 4` as triangle list
  - `polyMode 5` as triangle strip
- emits:
  - `collision.glb`
  - `collision.meta.json`

## Sampled Validation

Static in-memory extraction succeeded on:

- `arena1/a`
- `city1/a`
- `city1/b`
- `forest1/a`
- `forest1/c`
- `garagetest1/a`

Observed pattern:

- zero unsupported BVH-referenced non-vegetation surfaces
- zero out-of-range BVH-referenced surface ids
- only a small skipped set of vegetation surfaces per track

## Important Limits

This does **not** mean `track_cdb2.gen` is fully solved.

Still unresolved:

- exact `track_cdb2.gen` triangle command semantics
- vegetation/local-model collision details that may depend on additional transforms or later format work
- whether `track_cdb2.gen` encodes any extra collision-only details beyond the extracted W32+BVH path

## Planning Consequence

For the short-term physics reset:

- static authored track collision is no longer blocked
- the next blocker moves to runtime integration and the low-level solver path
- `track_cdb2.gen` decoding remains valuable, but as parity/follow-up work rather than the immediate blocker
