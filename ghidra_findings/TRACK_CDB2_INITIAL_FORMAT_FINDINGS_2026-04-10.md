# Track CDB2 Initial Format Findings 2026-04-10

Purpose: record the first static format pass over `track_cdb2.gen` so collision-asset recovery can proceed from confirmed facts instead of guesses.

This is a short-term reverse-engineering note for the data path. It is not a final format spec.

## Scope

Files inspected:

- `src/data/tracks/arena/arena1/a/geometry/track_cdb2.gen`
- `src/data/tracks/city/city1/a/geometry/track_cdb2.gen`
- `src/data/tracks/city/city1/b/geometry/track_cdb2.gen`
- `src/data/tracks/forest/forest1/a/geometry/track_cdb2.gen`
- `src/data/tracks/forest/forest1/c/geometry/track_cdb2.gen`
- `src/data/tracks/garagetest/garagetest1/a/geometry/track_cdb2.gen`
- `src/data/tracks/arena/arena1/a/geometry/track_geom.w32`
- `tools/flatout-w32-tool.js`

## Confirmed Header Structure

Confirmed from the recovered generator and direct binary inspection:

- `0x00`: 32-bit file identifier
- `0x04`: 32-bit date or secondary identifier
- `0x08..0x1b`: 6 x 32-bit raw bounding-box values
- `0x20..0x2b`: 3 x 32-bit float coordinate multipliers
- `0x2c..0x37`: 3 x 32-bit float inverse multipliers
- `0x38`: 32-bit `triOffset`
- `0x3c`: 32-bit `vertOffset`

Arena sample:

- file size: `411878`
- `triOffset`: `181768`
- `vertOffset`: `300712`
- coordinate multipliers:
  - `0.011361794546246529`
  - `0.0012711103772744536`
  - `0.011355427093803883`

## Confirmed Cross-File Pattern

Across multiple tracks:

- every inspected `track_cdb2.gen` has the same fixed header fields through `vertOffset`
- every inspected file points to a later triangle-side section and a later vertex-side section
- the file sizes and offset ranges vary per track, which is expected for authored collision data

Observed samples:

- `arena1/a`
  - `triOffset = 181768`
  - `vertOffset = 300712`
- `city1/a`
  - `triOffset = 339640`
  - `vertOffset = 539382`
- `forest1/a`
  - `triOffset = 248824`
  - `vertOffset = 380654`

## Confirmed Relation To Render Data

`track_geom.w32` for `arena1/a` contains:

- `2122` render surfaces
- `216154` render polys
- `575` static batches
- `42` models
- `42` collidable-model groups
- `202` compact meshes

That is much larger than the apparent collision-side triangle region in `track_cdb2.gen`.

Confirmed consequence:

- `track_cdb2.gen` is not just a duplicate of render geometry
- it is a separate collision-side dataset

## Confirmed And Inferred Vertex Facts

Confirmed:

- the header stores raw bounds plus per-axis scale multipliers
- that is strong evidence that collision coordinates are quantized rather than stored as floats
- reading early words from the vertex region as signed 16-bit triplets produces plausible world-scale coordinates when multiplied by the header multipliers

Arena sample decoded from the start of the vertex region:

- raw `320, 1345, -28388` -> decoded approximately `3.64, 1.71, -322.36`
- raw `18042, -24051, 31855` -> decoded approximately `204.99, -30.57, 361.73`

Important limit:

- section byte counts do not line up cleanly enough across all inspected tracks to declare a full `3 x int16 per vertex` format with confidence yet
- there may be per-section headers, tails, or mixed records inside the vertex-side region
- some tracks end with `0`, `2`, or `4` extra bytes beyond the likely packed-vertex records

So:

- quantized coordinates are strongly indicated
- exact vertex-section record layout is not confirmed yet

## Offline Tooling Added

To keep this work out of runtime code, the repo now includes:

- `tools/track-cdb2-tool.js`

Current scope of that tool:

- confirmed header decode
- conservative likely-vertex decode using packed signed 16-bit triplets
- section-size reporting
- unresolved tail-byte preservation
- triangle-section diagnostics for index-like run discovery

Non-goal of the tool right now:

- it does not claim to decode the triangle section yet
- it does not claim the remaining tail bytes are understood

## Unresolved Triangle Layout

Confirmed:

- `triOffset` marks a real later section
- it is distinct from the vertex-side section
- simple scans do not show one flat contiguous uint16 index buffer across the whole triangle-side region
- multiple inspected tracks show many short index-like runs separated by non-index-like data
- some tracks begin the triangle-side section with small headers such as `3, 0, 0, 0`, but that pattern is not uniform across all inspected tracks
- in `arena1/a`, recurring non-index words include:
  - `0x8000`
  - `0x8400`
  - `0x6000`
  - `0xa000`
  - `0xc000`
  - `0xe000`
- that strongly suggests 16-bit control words with opcode or flag bits in the high nibble / high byte, not a plain triangle-list index buffer

Not yet confirmed:

- whether triangle records are fixed-width
- whether they store pure vertex indices, compressed edge data, adjacency, surface ids, or packed BVH references
- how they map onto `track_geom.w32` static batches or surface ids

## Confirmed Supporting Runtime Data

`tools/flatout-w32-tool.js` already parses `track_geom.w32` and recovers:

- static batches with `bvhId1` / `bvhId2`
- `collisionOffsetMatrix`
- models
- objects
- collidable-model groups
- compact meshes

Arena sample `collisionOffsetMatrix`:

- pure rotation around Y
- no translation component

This means `track_geom.w32` already gives one side of the mapping needed for a final collision import, but it does not decode `track_cdb2.gen` by itself.

## Surface-Encoding Cross-Check

Confirmed from `track_geom.w32` surface data in `arena1/a`:

- `polyMode = 4` surfaces satisfy:
  - `numIndicesUsed = polyCount * 3`
  - that is consistent with triangle-list style indexing
- `polyMode = 5` surfaces satisfy:
  - `numIndicesUsed = polyCount + 2`
  - that is consistent with triangle-strip style indexing

This matters because the short index-like runs seen in `track_cdb2.gen` overlap many `numIndicesUsed` values from indexed `track_geom.w32` surfaces, including:

- `17`
- `24`
- `30`
- `34`
- `54`
- `102`

So the current best-supported interpretation is:

- `track_cdb2.gen` triangle-side data is probably a command stream that emits indexed surface chunks
- at least some of those chunks likely correspond to triangle lists and strips rather than one flat global index buffer
- the recurring 16-bit control words are likely selecting chunk type and parameters for the following index run

Important limit:

- this is still a structural correlation, not a fully decoded command spec
- we still do not know which specific control word means list, strip, surface switch, or primitive switch

## Static Collision Extraction Outcome

Confirmed from offline extraction against sampled tracks:

- `track_bvh.gen` primitive `id1` values can be used as surface ids into `track_geom.w32`
- for sampled tracks, every BVH-referenced non-vegetation surface is already an indexed `polyMode 4` or `polyMode 5` surface in `track_geom.w32`
- the only BVH-referenced non-indexed surfaces in sampled tracks are vegetation/local-model surfaces

Sampled tracks:

- `arena1/a`
- `city1/a`
- `city1/b`
- `forest1/a`
- `forest1/c`
- `garagetest1/a`

Observed extraction pattern across those samples:

- no unsupported non-vegetation BVH-referenced surfaces
- no out-of-range BVH-referenced surface ids
- only a small number of skipped vegetation surfaces per track

Implementation consequence:

- static authored track collision can now be extracted from original `track_geom.w32` surface streams filtered by original `track_bvh.gen` surface references
- that path is implemented in `tools/generate-track-collision-assets.js`
- this completes the practical static-collision part of short-term step 2

Important remaining limit:

- `track_cdb2.gen` command semantics are still not fully decoded
- that unresolved part no longer blocks static non-vegetation collision extraction
- it may still matter later for vegetation/local collision details, lower-level engine parity, or further validation of collision-side packing

## Immediate Safe Conclusion

Step 2 of the short-term reset plan is now completed for static non-vegetation track collision:

- we have a source-of-truth static collision extraction path from original `track_geom.w32` + `track_bvh.gen`
- `track_cdb2.gen` still contains real collision-side sections and quantized coordinate data
- the unresolved `track_cdb2.gen` command format is no longer the blocker for static authored collision assets

## Next Technical Step

Next safe format-recovery target:

1. generate the static collision assets with `tools/generate-track-collision-assets.js`
2. wire those authored collision assets into the new runtime collision sampler / low-level solver path
3. keep `track_cdb2.gen` format work as a follow-up validation and parity task, not as the current blocker
