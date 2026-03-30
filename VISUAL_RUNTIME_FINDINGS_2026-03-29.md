# Visual Runtime Findings - 2026-03-29

Scope: runtime-oriented environment findings for the FlatOut 2 visual stack, focused on flare, postprocess, bloom, color remap, and shader/material behavior relevant to Arena day.

Method:
- attempted to use the connected Ghidra MCP against `reference/FlatOut2.exe`
- MCP handshake timed out repeatedly in this session, so control-flow recovery and exact serialized defaults could not be confirmed from decompiler output
- recovered what could still be confirmed from the target executable's embedded strings plus the extracted shader files already in the repo

## Confidence Guide

- `Confirmed`: directly supported by `FlatOut2.exe` string anchors and/or dumped shader code in repo
- `Inferred`: strong pipeline inference from the executable names plus shader semantics
- `Unconfirmed`: likely real, but not recovered as runtime truth without working Ghidra control-flow access

## Confirmed runtime anchors from `FlatOut2.exe`

String anchors present in the executable:

- `Data.Effect.PostProcess`
- `data/shader/post_luminance_to_alpha.sha`
- `data/shader/post_colorremap_by_alpha.sha`
- `data/shader/post_highpass_luminance.sha`
- `data/shader/post_highpass4.sha`
- `data/shader/post_box4.sha`
- `data/shader/post_combine2.sha`
- `data/shader/post_mask.sha`
- `data/shader/post_copy.sha`
- `BloomPasses`
- `BloomIntensity`
- `BloomScale`
- `BloomTolerance`
- `BloomColor`
- `BloomDownsampled`
- `BloomFromLuminance`
- `BloomMonochromeCombine`
- `BloomShow`
- `BloomDisable`
- `ColorBloom`
- `ColorFilter`
- `LuminanceFilterAdd`
- `LuminanceFilterSub`
- `LuminanceFilterAddIntensity`
- `LuminanceFilterSubIntensity`
- `GlobalColorAdd`
- `GlobalColorSub`
- `GlobalAddIntensity`
- `GlobalSubIntensity`
- `RadialBlurStrength`
- `RadialBlurZoomCenter`
- `RadialBlurZoomMultiplier`
- `RadialBlurZoomStart`
- `RadialBlurPasses`
- `RadialBlurShow`
- `SunFlare`
- `FlareFile`
- `FlarePosition`
- `data/global/flares/Track_Flares.tga`
- `data/global/filters/%s.tga`

What this means:

- postprocess is definitely a named runtime system, not just loose shader leftovers
- bloom is definitely parameterized at runtime, with toggles and multiple branches
- color remap is definitely parameterized separately from bloom
- radial blur is part of the same effect family
- flare selection appears data-driven through `FlareFile` and `FlarePosition`, not obviously hardcoded to `SunEvening.ini`
- filter texture selection appears data-driven through a `%s` lookup, not obviously hardcoded to `default_add` or `default_sub`

## Confirmed shader semantics

### 1. `post_luminance_to_alpha`

Confirmed from [src/data/shader/post_luminance_to_alpha.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_luminance_to_alpha.sha):

- computes luminance by `dp3` with constant register `c5`
- preserves original RGB
- writes luminance into alpha

Practical meaning:

- later passes can use the scene alpha channel as a luminance buffer without needing to recompute RGB luminance

### 2. `post_colorremap_by_alpha`

Confirmed from [src/data/shader/post_colorremap_by_alpha.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_colorremap_by_alpha.sha):

- `Tex0` is the source screen
- `Tex1` is a 256x1 LUT
- LUT lookup uses source alpha, not RGB
- output is original source color plus signed LUT offset
- source alpha is preserved

Practical meaning:

- color remap is luminance-indexed, not a full 3D color cube
- the intended pipeline is "compute luminance first, then apply one-dimensional remap ramps keyed by luminance"

### 3. `post_highpass_luminance`

Confirmed from [src/data/shader/post_highpass_luminance.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_highpass_luminance.sha):

- source alpha is assumed to already contain luminance
- `c3` is the threshold
- `c4` is the scale after cutoff
- shader copies alpha to RGB, subtracts threshold, then scales

Practical meaning:

- there is an optimized bloom path that thresholds the precomputed luminance buffer directly

### 4. `post_highpass4`

Confirmed from [src/data/shader/post_highpass4.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_highpass4.sha):

- samples four source textures
- averages them
- subtracts threshold `c3`
- scales by `c4` with `mul_x4`

Practical meaning:

- there is also a 4-input highpass path, likely used after downsample/tap setup rather than directly from the full scene

### 5. `post_box4`

Confirmed from [src/data/shader/post_box4.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_box4.sha):

- samples four inputs
- outputs their average

Practical meaning:

- blur is not one monolithic Gaussian pass; the engine has an explicit 4-input box combine stage that can be repeated by pass count

### 6. `post_combine2`

Confirmed from [src/data/shader/post_combine2.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_combine2.sha):

- combines two textures
- `c3` multiplies `Tex0`
- `c4` multiplies `Tex1`
- final output is additive

Practical meaning:

- final bloom composite is explicitly weighted, not just raw additive screen blend

### 7. `post_copy` and `post_mask`

Confirmed from:
- [src/data/shader/post_copy.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_copy.sha)
- [src/data/shader/post_mask.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/post_mask.sha)

Useful implications:

- `post_copy` gives the runtime a generic weighted copy stage
- `post_mask` can preserve RGB from one source while borrowing alpha from another source scaled by `c3.a`
- that is a plausible utility path for bloom/luminance/radial-blur masking or staging

## Probable post-process order

Status: `Inferred`

Most likely runtime graph from the executable and shader set:

1. render scene
2. run `post_luminance_to_alpha`
3. run one or more luminance-indexed remap passes using `post_colorremap_by_alpha`
4. choose bloom extraction path:
   - `post_highpass_luminance` if `BloomFromLuminance` is enabled
   - `post_highpass4` otherwise
5. run `post_box4` repeatedly according to `BloomPasses`
6. combine base image and bloom with `post_combine2`
7. optionally run radial blur path if enabled

Why this is the strongest current read:

- the executable contains both `BloomFromLuminance` and `post_highpass_luminance`
- it also contains `post_highpass4`, `post_box4`, `post_combine2`, and `BloomPasses`
- the shader semantics line up cleanly with a threshold -> blur -> weighted combine chain

## Runtime parameter groups that are definitely real

Status: `Confirmed`

### Bloom group

- `BloomScale`
- `BloomTolerance`
- `BloomColor`
- `BloomPasses`
- `BloomIntensity`
- `BloomDownsampled`
- `BloomFromLuminance`
- `BloomMonochromeCombine`
- `BloomShow`
- `BloomDisable`

Actionable reading:

- the port should not treat bloom as a single scalar
- original runtime behavior includes threshold, scale, tint, pass count, branch selection, and debug/disable flags

### Color remap group

- `ColorFilter`
- `ColorBloom`
- `LuminanceFilterAdd`
- `LuminanceFilterSub`
- `LuminanceFilterAddIntensity`
- `LuminanceFilterSubIntensity`
- `GlobalColorAdd`
- `GlobalColorSub`
- `GlobalAddIntensity`
- `GlobalSubIntensity`

Actionable reading:

- the port's current single add/sub pair is almost certainly a collapsed version of a richer runtime setup
- there appear to be at least two distinct remap families:
  - luminance-keyed filter ramps
  - global color add/sub ramps

### Radial blur group

- `RadialBlurStrength`
- `RadialBlurZoomCenter`
- `RadialBlurZoomMultiplier`
- `RadialBlurZoomStart`
- `RadialBlurPasses`
- `RadialBlurShow`

Actionable reading:

- even if not needed for Arena day baseline, the post stack was designed as a broader effect graph, not a single full-screen remap

## Flare system findings

### What is confirmed

- the executable has a `SunFlare` toggle
- the atmosphere/effect database includes `FlareFile` and `FlarePosition`
- the executable embeds `data/global/flares/Track_Flares.tga`
- the repo has the original flare shader at [src/data/shader/pro_sunflare.sha](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shader/pro_sunflare.sha)
- Arena day flare authoring data is present in [src/data/global/flares/day.ini](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/global/flares/day.ini)

### What matters for the alpha

- `day.ini` defines a 16-element flare stack plus glow, not a single flare sprite
- `GlowSize = 30.0`
- flare element sizes range from `3.5` to `40.0`
- flare locations span from `-2.3` to `1.7`
- each element has independent `Sharpness`, `AngleScale`, and `AngleRotation`

Actionable reading:

- the current port's two-sprite flare implementation is not just missing polish; it is missing the authored composition model

### What is not confirmed yet

- no executable string hit for `SunEvening.ini`
- no executable string hit for `default_add` or `default_sub`
- no runtime-confirmed evidence yet that those names are hardcoded in the binary

Best current interpretation:

- flare preset and filter selection are likely data-driven from weather/profile state rather than hardcoded by literal asset filename

## Arena-day-relevant source values already available in data

These are not newly recovered from the executable, but they remain useful anchor values for matching the original look:

- [src/data/tracks/arena/arena1/a/data/atmosphere.ini](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/tracks/arena/arena1/a/data/atmosphere.ini)
  - `Sun_Intensity = 1.5`
  - `Sun_Direction = {0, 0.707107, 0.707107}`
  - `SkyDome_Radius = 30000`
  - `CloudLayer_Altitude = 500`
  - `CloudLayer_Size = 4000`
  - `CloudLayer_Tiling = 2`
  - `CloudLayer_Curvature = 400`
  - `CloudLayer_Volume = 50`
  - `Horizon_Radius = 25000`
  - `Horizon_Base = -2000`
  - `Horizon_Height = 6000`

## Immediate implementation priorities implied by runtime evidence

1. Rebuild postprocessing as a staged graph, not a single remap pass.
2. Add explicit luminance-to-alpha, bloom extract, repeated box blur, and weighted combine passes.
3. Preserve room for `BloomFromLuminance`, `BloomPasses`, `BloomIntensity`, `BloomTolerance`, and `BloomColor` as separate knobs.
4. Replace the current two-sprite sun with parsed flare-stack composition from `day.ini`.
5. Keep filter/flair asset selection data-driven; do not hardcode `SunEvening.ini` or filter filenames unless Ghidra later proves that the runtime does.

## Blocked items that still need working Ghidra MCP

These remain `Unconfirmed` until the decompiler path works:

- exact runtime default values for `BloomScale`, `BloomTolerance`, `BloomIntensity`, `BloomPasses`, and `BloomColor`
- exact pass ordering in control flow
- exact meaning of `ColorBloom`, `BloomMonochromeCombine`, and `BloomDownsampled`
- exact mapping between `ColorFilter`, `LuminanceFilterAdd/Sub`, and `GlobalColorAdd/Sub`
- exact object path for Arena day weather profile to flare/filter asset selection
- exact runtime setup for shader constant registers `c3`, `c4`, and `c5`

## Bottom line

The executable confirms that the original runtime had a real postprocess system with:

- luminance staging
- branchable bloom extraction
- repeated blur passes
- weighted recombine
- multiple color-remap inputs
- separate radial blur support

For the alpha, the highest-value work is now clear even without decompiler control flow:

- implement the staged post chain
- implement the authored flare stack
- keep the system parameterized so recovered Ghidra defaults can drop in later
