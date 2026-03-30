# Visual Findings - 2026-03-29

This note is a snapshot of likely visual mismatches between the current runtime and the asset/shader data already present in the repo. It is intentionally scoped to findings and hypotheses, not fixes.

## High-confidence findings

### 1. The current sun effect is dramatically simpler than the original data suggests

The repo already contains the original flare descriptor data in `src/data/global/flares/day.ini` and `src/data/global/flares/sunevening.ini`, plus the original `pro_sunflare.sha` shader. Those define a glow plus a multi-element flare stack with per-element UV rectangles, sizes, sharpness, line locations, and angular behavior.

The current runtime in `src/game/environment.js` only creates two sprites: one glow sprite and one flare sprite. It does not parse the `.ini` flare stack, does not slice the flare atlas into many flare elements, and does not use the flare metadata at all.

Implication: the missing "sunburst" feel is probably not a texture problem. It looks much more like a missing lens-flare composition problem.

Relevant files:
- `src/game/environment.js`
- `src/data/global/flares/day.ini`
- `src/data/global/flares/sunevening.ini`
- `src/data/shader/pro_sunflare.sha`

### 2. The post pipeline is currently collapsed into a single color-remap pass

The repo contains a fuller post stack in the dumped shader files:
- `post_luminance_to_alpha.sha`
- `post_colorremap_by_alpha.sha`
- `post_highpass4.sha`
- `post_box4.sha`
- `post_combine2.sha`
- `post_copy.sha`

That indicates the original game did more than a single full-screen LUT remap. There is explicit infrastructure for extracting luminance into alpha, thresholding bright regions, blurring/boxing those regions, and recombining them.

The current runtime in `src/game/postprocessing.js` implements only a color-remap style pass. It writes luminance into alpha, but it never uses the bloom/highpass/box/combine stages that are present in the dumped shaders.

Implication: even with correct textures, the image will tend to read as flatter and less radiant than the original. This is a strong candidate for why the port feels visually plain.

Relevant files:
- `src/game/postprocessing.js`
- `src/data/shader/post_luminance_to_alpha.sha`
- `src/data/shader/post_colorremap_by_alpha.sha`
- `src/data/shader/post_highpass4.sha`
- `src/data/shader/post_box4.sha`
- `src/data/shader/post_combine2.sha`

### 3. The runtime is currently wired to the desert color filters, not the default pair mentioned in repo notes

`README.md` says the first-pass arena color work should use `default_add` and `default_sub`.

But `src/game/assets.js` currently imports `desert_add.tga` and `desert_sub.tga` for the active environment filter URLs.

Implication: some of the global color character may be wrong before any deeper lighting work. This is a straightforward asset-selection mismatch.

Relevant files:
- `README.md`
- `src/game/assets.js`

### 4. Clouds are parsed as atmosphere parameters but not actually rendered

The track atmosphere file and clear atmosphere preset contain real sky/cloud parameters. `src/game/environment.js` parses cloud and skydome values, and `src/game/assets.js` points at cloud textures.

But the environment runtime currently only builds:
- one sky plane
- one horizon cylinder/layer
- one directional light
- two flare sprites

There is no actual cloud-layer geometry, no UV scrolling cloud pass, and no use of the `pro_clouds.sha` data already in the repo.

Implication: the sky will tend to feel dead and backplate-like even when the base textures are correct.

Relevant files:
- `src/game/environment.js`
- `src/data/tracks/arena/arena1/a/data/atmosphere.ini`
- `src/data/global/atmosphere/clear.ini`
- `src/data/shader/pro_clouds.sha`

### 5. A lot of track shading is being approximated with generic Three.js materials instead of the extracted shader families

The repo already includes `shaderlib_pro.ini`, which maps original shader families like lightmapped, dynamic, tree branch, windows, sunflare, water, car body, and so on.

Current track material handling in `src/game/track.js` only branches on a narrow subset of cases:
- static prelit
- window shader
- alpha/tree-like
- terrain
- fallback generic `MeshStandardMaterial`

From `track_geom_log.txt`, Arena uses at least:
- terrain specular
- dynamic diffuse
- reflecting window shader
- tree branch
- tree leaf
- static prelit

`dynamic diffuse` in particular currently falls through to the generic fallback material instead of a specific extracted-equivalent material path.

Implication: large parts of the scene are probably materially "close enough to see" but not close enough to read like FlatOut.

Relevant files:
- `src/game/track.js`
- `src/data/shader/shaderlib_pro.ini`
- `src/data/tracks/arena/arena1/a/geometry/track_geom_log.txt`

### 6. The current static-prelit track pass is using aggressive brightness hacks instead of a closer reconstruction

The current static-prelit handling multiplies brightness by hardcoded values like `6.0` and `7.5` depending on material name heuristics.

That may have been necessary to compensate for missing lighting information, but it is also a sign that the current pipeline is not representing the original shading model closely. It can produce a readable frame while still leaving the whole image feeling wrong or uneven.

Implication: if the scene reads either washed, oddly flat, or selectively over-popped, this is one of the main suspects.

Relevant files:
- `src/game/track.js`
- `src/data/shader/pro_static2x.sha`
- `src/data/shader/pro_default_static.sha`

## Medium-confidence findings

### 7. The horizon/sky environment is using hand-tuned small-scale overrides instead of the source radii

The track atmosphere contains very large source-space values for skydome/horizon dimensions, while `src/game/environment.js` uses a hardcoded scaled-down environment and then additional tuned defaults.

This may be necessary because of the current coordinate conventions, but it also means the environment composition is not yet source-driven. If the sky/background relationship feels wrong, this is a likely contributor.

Relevant files:
- `src/game/environment.js`
- `src/data/tracks/arena/arena1/a/data/atmosphere.ini`

### 8. There is likely still a color-space mismatch around the lightmap/color-map path

This is an inference, not a confirmed bug.

`pro_lightmapped.sha` is a simple multiply between the diffuse/detail texture and the lightmap texture. In the current runtime, the track lightmap is loaded as `SRGBColorSpace`, terrain uses the lightmap as a visible color map, and postprocessing then does explicit linear-to-screen and screen-to-linear transforms again.

This may be correct for your tuned result, or it may be introducing a subtle mismatch in contrast and highlight rolloff. It is worth treating as an open investigation rather than a settled issue.

Relevant files:
- `src/game/track.js`
- `src/game/postprocessing.js`
- `src/data/shader/pro_lightmapped.sha`
- `src/data/shader/pro_lightmapped_spec.sha`

## What seems most worth pursuing next

1. Rebuild the sun flare from the existing `.ini` flare stack instead of a single flare sprite.
2. Add the missing bloom/highpass/box/combine stages from the existing dumped post shaders.
3. Align the active filter textures with the intended arena pair before deeper tuning.
4. Add an actual cloud layer pass, since the repo already has the source parameters and textures.
5. Replace the broad generic track material fallback with more shader-family-specific handling, starting with dynamic diffuse and the known track shader IDs already present in `track_geom_log.txt`.

## What the new decomp reference adds to this picture

The decomp reference in `reference/FlatOut-2-decomp-main` reinforces that the original engine had:
- explicit shader parameter conventions (`Tex0`..`Tex3`, `mCub`, `dFac`, `vDiff`, `inputStreamFormat`)
- defined vertex layout families (`Pos`, `PosTex1`, `PosTex2`, `PosNormTex2`, `PosprojTex4`, etc.)
- embedded `fonts.bed`, `windowfunctions.bed`, and `sandbox.bed` in some builds
- separate current texture and geometry folder state in the engine

That does not directly solve the plain image, but it supports the conclusion that the original renderer had a more explicit material/shader pipeline than the current simplified approximation.
