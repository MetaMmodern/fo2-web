# Vegetation Findings - 2026-03-29

This note captures what the new native parser work tells us about `plant_geom.w32` and `plant_vdb.gen`, and what that means for the current WebGL port. It is scoped to environment/rendering priorities, not full format documentation.

## High-confidence findings

### 1. `plant_vdb.gen` is not a foliage-only file

Across all inspected tracks, each `plant_vdb` record points at a `track_geom.w32` surface ID. That part is clear now.

For Arena, Forest, and GarageTest, those surfaces are entirely tree or bush materials:
- shader `19` (`tree trunk`)
- shader `20` (`tree branch`)

But City is different. A large part of its `plant_vdb` surface range resolves to non-tree materials:
- shader `3` (`dynamic diffuse`)
- shader `4` (`dynamic specular`)
- shader `35` (`reflecting window shader (dynamic)`)

The common material names in City include:
- `dyn_truckterminal_posts`
- `dyn_adverts`
- `dyn_generic_metal_1`
- `newspaperstand`
- `ticket_booth`
- `highway_signs`

Implication: we should not model the plant files as "vegetation renderer input" only. They are closer to a placement/instancing domain that happens to include vegetation heavily.

### 2. The current renderer assumptions are too narrow for plant-side content

Current track material handling in [track.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/game/track.js#L261) only gives special treatment to:
- shader `34` (`reflecting window shader (static)`)
- shaders `20` and `21` as leaf-like alpha
- shader `2` terrain
- shader `0` static prelit

Everything else falls through to a broad generic material path in [track.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/game/track.js#L324).

That is already a mismatch for normal track geometry. It becomes a more direct problem once we start rendering plant-side data, because City plant surfaces include shader families that are currently not reconstructed closely.

Implication: adding plant parsing alone will not make vegetation/placed props look right. The shader-family mapping still needs to expand.

### 3. `plant_vdb.gen` surface IDs overlap heavily with tree-mesh references, but not universally

Using the new correlation script in [analyze-track-vegetation.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/tools/analyze-track-vegetation.js), the overlap between `plant_vdb` surface IDs and `track_geom` tree-mesh surface references looks like this:

- Arena: `46 / 46` overlap
- Forest A: `901 / 901` overlap
- Forest C: `1004 / 1004` overlap
- GarageTest: `829 / 829` overlap
- City A: `333 / 537` overlap
- City B: `313 / 608` overlap

Implication: for some tracks, plant files are effectively a view onto the existing tree/bush surface set. For City, they also include a substantial non-tree subset. So the correct runtime model is probably:
- one shared surface/material universe from `track_geom.w32`
- separate placement/indexing data from `plant_vdb.gen` / `plant_geom.w32`

### 4. `surface.isVegetation` is not the switch we want

For every inspected `plant_vdb` surface, the referenced `track_geom` surface currently parses with `isVegetation = 0`.

Implication: if we need to identify plant-side content, we should use:
- the plant file references themselves
- material/shader families
- tree-mesh linkage

We should not rely on the parsed `isVegetation` field as the source-of-truth marker.

### 5. Tree rendering is split between explicit tree meshes and plant-side surface references

`track_geom.w32` already carries explicit `treeMeshes` with:
- transform matrix
- scale
- trunk / branch / leaf surface IDs
- color ID
- LOD ID
- material ID

This means the original scene setup is more structured than "draw a bunch of alpha cards."

Implication: the environment pass will likely need two related but distinct things:
- better material/shader behavior for tree/bush surfaces
- a proper interpretation of the plant/tree placement data, not just direct mesh import

### 6. `plantcolors_w2.w32` and `vertexcolors_w2.w32` still matter

The lighting sidecars do not look like standard container files. Their first bytes read like packed color values rather than a normal file header, which is consistent with raw precomputed color data.

Implication: they are still plausible sources for part of the missing "FlatOut brightness/pop" in vegetation and track shading. They should stay on the near-term investigation list, especially if current prelit hacks continue to feel wrong.

## What this changes in practical terms

### The immediate goal stays the same

The current tactical goal is still environment fidelity for the alpha port:
- better sky / flare / post
- better vegetation
- better track material behavior

The new parser work supports that goal directly. It is not a detour.

### What to do next

1. Expand shader-family handling before assuming plant rendering is blocked on format work alone.

The main gap is still renderer behavior, not asset access. In particular, plant-side City content will look wrong until we treat more than the current narrow shader subset in [track.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/game/track.js#L261).

2. Decode the semantics of `plant_geom.w32` enough to understand placement/grouping.

We now know it is usable and cross-track comparable. The remaining question is what its mapping/entry tables encode: likely grouping, lookup, or cell/instance indexing.

3. Parse the lighting sidecars.

If the scene still reads flat after flare/post improvements, these files are the next likely source of missing per-vertex or per-instance color information.

## Tooling added for this pass

- Native importable parser in [flatout-w32-tool.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/tools/flatout-w32-tool.js#L839)
- Cross-track vegetation correlation script in [analyze-track-vegetation.js](/Users/metamodern/Documents/Github/Personal/flatout_oss/tools/analyze-track-vegetation.js)
- Package script: `pnpm run analyze:vegetation`
