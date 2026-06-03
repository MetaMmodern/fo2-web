# Visual Runtime Findings (Ghidra) - 2026-03-29

This note supersedes `VISUAL_RUNTIME_FINDINGS_2026-03-29.md` for anything that depends on actual control flow. It records what we can now confirm from real decompiler output for `reference/FlatOut2.exe`.

Target binary: `reference/FlatOut2.exe` (PE32 / x86)

## Confidence Guide

- `Confirmed (decompiled)`: directly supported by decompiler output (function bodies, constants, call sites).
- `Confirmed (binary constant)`: values read directly from `reference/FlatOut2.exe` at specific VAs.
- `Inferred`: strong interpretation of the decompiled behavior, but the semantic name of a variable/flag is not fully mapped yet.

---

## 1) Post-process runtime (`Data.Effect.PostProcess`)

### 1.1 Resource init: shader set + render-target pool

`Confirmed (decompiled)`

Init function: `FUN_005a8350` @ `0x005a8350`

This function:

- Allocates **7** intermediate render targets at `256x256` (`0x100 x 0x100`).
- Loads these post shaders (all via `FUN_005ac250(..., "Default", <path>, 1)`):
  - `data/shader/post_copy.sha`
  - `data/shader/post_highpass4.sha`
  - `data/shader/post_highpass_luminance.sha`
  - `data/shader/post_box4.sha`
  - `data/shader/post_combine2.sha`
  - `data/shader/post_mask.sha`
  - `data/shader/post_luminance_to_alpha.sha`
  - `data/shader/post_colorremap_by_alpha.sha`
- Loads `data/global/filters/radialblur.tga` (and also has `data/global/filters/%s.tga` format string present in `.rdata`).

Implication: the original engine is not “single-pass LUT only”; the executable actively constructs a multi-stage post stack using the dumped shader set already in the repo.

### 1.2 One-time defaults for the post system

`Confirmed (decompiled)` (values) + `Confirmed (decompiled + table)` (semantic mapping)

Default init function: `FUN_005a7740` @ `0x005a7740`

This function initializes a small set of globals once (guarded by `DAT_008e8606`) and registers the `Data.Effect.PostProcess` parameter group with the engine config system.

Observed default values written (raw, as seen in decompile):

- `DAT_008e83b0 = 2`
- `DAT_008e83b8 = 2`
- `DAT_008e83a0 = 0`
- `DAT_008e83a4 = 0`
- `DAT_008e83a8 = 0`
- `_DAT_008e83ac = 0`
- `DAT_008e83b4 = 0`
- `DAT_008e83bc = 0x3f7851ec` = `0.97`
- `_DAT_008e83c0 = 0x3f7851ec` = `0.97`
- `DAT_008e83c4 = 0x3f000000` = `0.5`
- `DAT_008e83c8 = 0x3f000000` = `0.5`
- `_DAT_008e83cc = 0x3f800000` = `1.0`
- `DAT_008e83d4 = 0`

Mapped meanings (from the `Data.Effect.PostProcess` binding table at `0x006689d8`):

- `DAT_008e83a0` = `BloomDisable` (bool)
- `DAT_008e83a4` = `BloomShow` (bool)
- `DAT_008e83a8` = `BloomFromLuminance` (bool)
- `_DAT_008e83ac` = `BloomMonochromeCombine` (bool)
- `DAT_008e83b0` = `BloomPasses` (int, default `2`)
- `DAT_008e83b4` = `RadialBlurShow` (bool)
- `DAT_008e83b8` = `RadialBlurPasses` (int, default `2`)
- `DAT_008e83bc` = `RadialBlurZoomStart` (float, default `0.97`)
- `_DAT_008e83c0` = `RadialBlurZoomMultiplier` (float, default `0.97`)
- `DAT_008e83c4..DAT_008e83c8` = `RadialBlurZoomCenter` (vec2, default `(0.5, 0.5)`)
- `_DAT_008e83cc` = `RadialBlurStrength` (float, default `1.0`)
- `DAT_008e83d0` = `ColorFilter` (bool)
- `DAT_008e83d4` = `BloomDownsampled` (bool)

This resolves the earlier uncertainty around the `DAT_008e83**` globals: they are a compact “postprocess knobs” block, and we now have the exact string names attached to each address.

### 1.2.1 `Data.Effect.PostProcess` binding table (exact entries)

`Confirmed (binary parse)`

Binding table VA: `0x006689d8`

Triplets:
- `(name_ptr, type_code, dest_addr)`

Entries in order:
- `BloomDisable` — `0x405` — `0x008e83a0`
- `BloomShow` — `0x405` — `0x008e83a4`
- `BloomFromLuminance` — `0x405` — `0x008e83a8`
- `BloomMonochromeCombine` — `0x405` — `0x008e83ac`
- `BloomPasses` — `0x406` — `0x008e83b0`
- `RadialBlurShow` — `0x405` — `0x008e83b4`
- `RadialBlurPasses` — `0x406` — `0x008e83b8`
- `RadialBlurZoomStart` — `0x407` — `0x008e83bc`
- `RadialBlurZoomMultiplier` — `0x407` — `0x008e83c0`
- `RadialBlurZoomCenter` — `0x809` — `0x008e83c4`
- `RadialBlurStrength` — `0x407` — `0x008e83cc`
- `ColorFilter` — `0x405` — `0x008e83d0`
- `BloomDownsampled` — `0x405` — `0x008e83d4`

### 1.3 Per-frame post function: high-level ordering

`Confirmed (decompiled)`

Main per-frame function: `FUN_005aa390` @ `0x005aa390`

At a high level, it performs:

1. Ensure defaults are initialized (`FUN_005a7740()`).
2. Optional “color filter” / remap stage (guarded; see `FUN_005a9c10` below).
3. Highpass extraction stage (`FUN_005a8700`), choosing between `post_highpass_luminance` and `post_highpass4`.
4. A downsample pyramid / mip-ish build (multiple calls to `FUN_005a8970`, and in one branch also `FUN_005a8ab0`).
5. A combine/subtract stage using `post_combine2` (`FUN_005a9430`).
6. Repeated `post_box4` passes (loop calling `FUN_005a8c60`).
7. A final stage using `post_mask` (`FUN_005a96e0`), with an optional debug output (`FUN_005a9870`) when a flag is enabled.

This is the executable-backed pass ordering we should match (even if we initially stub out some branches).

### 1.4 Luminance-to-alpha + remap stage (hardcoded luminance weights)

`Confirmed (decompiled)` + `Confirmed (binary constant)`

Function: `FUN_005a9c10` @ `0x005a9c10`

This function runs:

- `post_luminance_to_alpha` (shader handle at `this+0x11c`), and sets **C5** to fixed luminance weights:
  - `C5 = (0.296875, 0.59375, 0.1171875, 0.0)`
- `post_colorremap_by_alpha` (shader handle at `this+0x120`) using a `256x1` LUT-like texture stored at `this+0x204`.

These weights are *not* the “typical textbook” 0.299/0.587/0.114 — they’re quantized:

- 0.296875 = 76/256
- 0.59375 = 152/256
- 0.1171875 = 30/256

This matters: if we want a close bloom + remap response, we should match these exact weights.

### 1.5 Highpass extraction path selection + intensity scaling rule

`Confirmed (decompiled)` + `Confirmed (binary constant)`

Function: `FUN_005a8700` @ `0x005a8700`

This function selects the bloom extraction shader:

- If `param_5 == 0`:
  - Uses `post_highpass_luminance` (shader handle at `this+0x10c`)
  - Leaves `Tex1..Tex3` unset (only `Tex0`)
- Else:
  - Uses `post_highpass4` (shader handle at `this+0x108`)
  - Sets `Tex1..Tex3 = Tex0` (same texture bound multiple times; the 4-tap sampling happens via vertex-provided texcoords)
- A global override exists: if `param_5 != 0` and `DAT_008e83a8 != 0`, it forces `param_5 = 0` (i.e., forces the luminance-based extraction path).

Intensity handling (this is a concrete runtime “truth” we can implement immediately):

- The user-supplied intensity `param_4` is clamped to **max 4.0**.
  - `0x0067dc24` = `4.0` (`Confirmed (binary constant)`)
- It computes `intensity_div4 = param_4 * 0.25`:
  - `0x0067dba0` = `0.25` (`Confirmed (binary constant)`)
- It sets:
  - `C3` from a caller-provided float4 (threshold replicated, or per-channel threshold)
  - `C4 = (intensity_div4, intensity_div4, intensity_div4, intensity_div4)`
  - `C5 = luminance weights` (same constants as above)

This matches the shader comments in our dumped `.sha`:
- `post_highpass*.sha`: `C4 = after-cut scaling (/4, as using 4x multiply)` + `mul_x4`.

### 1.6 Combine2 stage uses `c4 = -0.5` (subtractive combine)

`Confirmed (decompiled)`

Function: `FUN_005a9430` @ `0x005a9430`

This pass uses `post_combine2` (shader handle at `this+0x114`) and sets:

- `C4 = (-0.5, -0.5, -0.5, -0.5)`
- `C3` is provided by the caller (float4)

So the pixel math is:

`out = Tex0 * C3 + Tex1 * (-0.5)`

This is a strong hint that at least one stage in the chain is explicitly **subtractive**, not purely additive bloom.

### 1.7 Repeated box4 blur stage

`Confirmed (decompiled)` (existence + loop structure), `Inferred` (exact semantic knob names)

The repeated “blur/box” stage uses `post_box4` (shader handle at `this+0x110`) and is called in a loop from `FUN_005aa390`.

The loop uses these globals (raw addresses shown in decompile):

- iteration count: `DAT_008e83b8` (default `2`)
- a float `fVar7` starting from `DAT_008e83bc` (default `0.97`), multiplied each iteration by `_DAT_008e83c0` (default `0.97`)

This is plausibly:

- `BloomPasses = DAT_008e83b8`
- `BloomTolerance = DAT_008e83bc`
- `BloomScale = _DAT_008e83c0`

…but that last mapping is still `Inferred` until we fully reconstruct the parameter binding table.

---

## 2) Flare system: confirmed runtime config schema + units

### 2.1 Flare descriptor parser: keys + element fields

`Confirmed (decompiled)` + `Confirmed (binary constant)`

Parser/loader: `FUN_00595600` @ `0x00595600`

This function reads a flare descriptor (INI-like object from the engine’s config system) and constructs a flare stack.

**Top-level keys used:**

- `GlowMap` (texture / map reference)
- `FlareMap` (texture / map reference)
- `GlowSize`
- `Flares` (array)

**Per-element keys inside `Flares[i]`:**

- `UVTopLeft` (vec2)
- `UVBottomRight` (vec2)
- `Size` (scalar)
- `Sharpness` (scalar)
- `Location` (scalar)
- `AngleScale` (scalar)
- `AngleRotation` (scalar)

**Unit conversion (critical):**

- `GlowSize` is multiplied by **deg-to-rad** constant:
  - `0x0067dbec` = `0.01745329238474369` (`Confirmed (binary constant)`)
  - So `GlowSize` (and likely other flare “angle-ish” sizes) are authored in **degrees**.

This is highly actionable for the WebGL port:

- Keep flare sizes and angular falloffs in degree-space at the data layer, then convert to radians internally the same way.

### 2.2 Flare asset path anchors present in the EXE

`Confirmed (decompiled)`

The EXE contains:

- `data/global/flares/` (directory anchor)
- `data/global/flares/Track_Flares.tga` (the default atlas path)

### 2.3 Flare selection is data-driven by `FlareFile`

`Confirmed (disassembly + decompile)`

Inside the large environment setup function `FUN_00575f50`:

- The key `FlareFile` is read from config into a local string buffer (see disassembly region around `0x0057629a`).
- The final flare descriptor path is built by prefixing with `data/global/flares/` (see disassembly region around `0x00577a25`).
- The flare stack object is allocated and constructed via a call to `FUN_00595600` (see disassembly region around `0x00577aaf`).

This matches the earlier repo-level hypothesis: the runtime is designed to pick flare descriptors via data (`FlareFile`), not by hardcoding `SunEvening.ini` into the executable.

---

## 3) Filter texture paths are formatted via `data/global/filters/%s.tga`

`Confirmed (disassembly)`

Inside `FUN_00575f50`, the engine builds two filter texture paths using the format string:

- `data/global/filters/%s.tga` @ `0x0067bea0`

There are two separate format calls in the `FUN_00575f50` body (around `0x0057767c` and `0x00577695`), consistent with independent “add” and “sub” filter selection.

Open: recover the exact keys/fields that supply the `%s` names for Arena day so we can confirm whether it’s `default_add/default_sub` (or something track/atmosphere-specific) at runtime.

### 3.1 The `%s` fields are `LuminanceFilterAdd` / `LuminanceFilterSub`

`Confirmed (decompile + disassembly)`

In the environment setup function `FUN_00575f50`, the add/sub filter names are stored in two struct fields and used directly as `%s`:

- `LuminanceFilterAdd` stored at `ebx+0x1ad8` (passed to `sprintf`-like call with `data/global/filters/%s.tga`)
- `LuminanceFilterSub` stored at `ebx+0x1adc` (passed to the same formatter)

These are the exact fields that ultimately determine whether Arena day resolves to `default_add/default_sub` or some other pair.

---

## 4) Atmosphere/env parameters that drive bloom + global color filtering

`Confirmed (decompile + disassembly)`

The large environment setup function `FUN_00575f50` builds a binding list on the stack and binds multiple visual knobs into a single environment/atmosphere struct (base pointer in `ebx`).

Recovered key -> field mapping:

- `SunColor` -> `ebx+0x19d0` (float4)
- `AmbientColor` -> `ebx+0x19b0` (float4)
- `SpecularColor` -> `ebx+0x19f0` (float4)
- `SkidmarkColor` -> `ebx+0x1a00` (float4)
- `ParticleColor` -> `ebx+0x1a10` (float4)
- `SunPosition` -> `ebx+0x1a80` (vec3)
- `FlarePosition` -> `ebx+0x1810` (vec3)
- `SkyDomeOffset` -> `ebx+0x1a8c` (float)
- `SunIntensity` -> `ebx+0x1af4` (float)
- `AmbientIntensity` -> `ebx+0x1af8` (float)
- `SpecularIntensity` -> `ebx+0x1af0` (float)
- `MaxOverBrighting` -> `ebx+0x1afc` (float)

Bloom knobs:

- `ColorBloom` -> `ebx+0x1aac` (bool)
- `BloomColor` -> `ebx+0x1a90` (float4)
- `BloomTolerance` -> `ebx+0x1aa0` (float)
- `BloomScale` -> `ebx+0x1aa4` (float)
- `BloomIntensity` -> `ebx+0x1aa8` (float)

Color filter / global add-sub knobs (consumed as a group by the renderer):

- `GlobalColorAdd` -> `ebx+0x1ab0` (float4)
- `GlobalColorSub` -> `ebx+0x1ac0` (float4)
- `GlobalAddIntensity` -> `ebx+0x1ad0` (float)
- `GlobalSubIntensity` -> `ebx+0x1ad4` (float)
- `LuminanceFilterAddIntensity` -> `ebx+0x1ae0` (float)
- `LuminanceFilterSubIntensity` -> `ebx+0x1ae4` (float)

### 4.1 Where these knobs are actually applied

`Confirmed (decompiled)`

The renderer apply function `FUN_005920b0` consumes those exact struct fields:

- Calls a renderer vtable method at `+0x140` (resolved to `0x005aa0b0`) with:
  - `GlobalColorAdd` (ptr) + `GlobalColorSub` (ptr)
  - `GlobalAddIntensity`, `GlobalSubIntensity`, `LuminanceFilterAddIntensity`, `LuminanceFilterSubIntensity`
  - This ultimately regenerates and uploads the **256-entry color remap LUT** used by `post_colorremap_by_alpha` (see below).
- Applies bloom per view via renderer vtable method at `+0x138` (resolved to `0x005aa240`), using:
  - `ColorBloom`, `BloomTolerance`, `BloomScale`, `BloomColor`, `BloomIntensity` (see below).

This establishes the runtime truth that Arena day’s “default_add/default_sub” behavior is not just a post shader artifact: it’s a data-driven set of environment fields feeding a dedicated renderer call, separate from the bloom highpass/box/combine chain.

### 4.2 Resolved renderer vtable targets for these behaviors

`Confirmed (disassembly + constant table)`

The D3D9 renderer wrapper object used by the game has its vtable at:
- `0x0067d560` (assigned during construction in `FUN_005a5530` @ `0x005a5530` via `*this = 0x0067d560`)

For the two calls above:

- vtable `+0x138` -> `0x005aa240` — bloom parameter setup
- vtable `+0x140` -> `0x005aa0b0` — global add/sub + luminance-filter-based LUT update

#### vtable `+0x140` (`0x005aa0b0`): builds the LUT used by `post_colorremap_by_alpha`

`Confirmed (disassembly + decompile)`

Behavior:
- Copies `GlobalColorAdd` and `GlobalColorSub` float4s into globals at:
  - `0x008e7f80` (add) and `0x008e7f90` (sub)
- Copies the four scalar intensities into globals:
  - `0x008da460` = `GlobalAddIntensity` (from `ebx+0x1ad0`)
  - `0x008da45c` = `GlobalSubIntensity` (from `ebx+0x1ad4`)
  - `0x008da458` = `LuminanceFilterAddIntensity` (from `ebx+0x1ae0`)
  - `0x008da454` = `LuminanceFilterSubIntensity` (from `ebx+0x1ae4`)
- If the renderer is “live” (device/surface pointers non-null), it calls:
  - `FUN_005a99b0` @ `0x005a99b0`

`FUN_005a99b0` computes a 256-entry RGBA table and uploads it (only if changed) via `D3DXLoadSurfaceFromMemory(...)` into the LUT surface used later by `post_colorremap_by_alpha`.

This means the `default_add/default_sub` pair (via `LuminanceFilterAdd/Sub` textures) and the `GlobalColorAdd/Sub` float4s are **not cosmetic** — they directly define the remap curve that the post chain uses.

#### vtable `+0x138` (`0x005aa240`): bloom params and tolerance normalization rule

`Confirmed (disassembly + binary constant)`

This method stores bloom parameters into the renderer object and precomputes:

- A “normalized scale” value using:
  - `if (BloomTolerance <= 1.0) normalized = BloomScale / (1.0 - BloomTolerance) else normalized = BloomScale`
  - `1.0` is the float constant at `0x0067db74` (`Confirmed (binary constant)`).
- A premultiplied bloom color:
  - `BloomColor * BloomIntensity` (component-wise)

Practical implication for the port:
- `BloomTolerance` is treated as a **[0..1]** control that changes how `BloomScale` is applied (not a free-floating “threshold” with no additional math).

---

## 5) Separate effect family: `Data.Effect.ExplosionBloom`

`Confirmed (decompiled)`

The executable contains a distinct parameter group and update path for explosion bloom:

- Group name: `Data.Effect.ExplosionBloom`
- Registration: `FUN_004c9440` registers the group using the parameter table at `0x00664240`.
- Update: `FUN_004c9490` updates bloom-like parameters and decays them over time based on distance/time heuristics.

Practical implication:
- Even if we don’t implement crash/explosion visuals for the alpha, we should avoid conflating “environment bloom” (`Data.Effect.PostProcess` + atmosphere keys) with “explosion bloom” (separate group with its own `BloomColor/BloomTolerance/BloomScale/DecayPower`).

The loader also allocates `0x24` bytes per flare element, matching the 9-dword copy loop in the decompile (consistent with: UVs + size + sharpness + location + angle parameters).

---

## 3) Immediate “small, high-confidence” implementation hooks (for later)

Not making code changes in this note, but these are the clean, low-risk facts to wire in when we do:

- Post highpass intensity: clamp to `<= 4.0`, convert to `c4 = intensity * 0.25`, relying on `mul_x4` in shader.
- Luminance weights for `post_luminance_to_alpha`: use exactly `(0.296875, 0.59375, 0.1171875)`.
- Flare `GlowSize` is specified in **degrees** and converted via `deg2rad`.

---

## 4) Open items / next decomp targets

- Map `DAT_008e83*` globals to their exact string parameter names (`BloomPasses`, `BloomTolerance`, `BloomScale`, `BloomDisable`, `BloomShow`, etc.). The registration call in `FUN_005a7740` references `PTR_s_BloomDisable_006689d8`, which looks like the start of a parameter binding table.
- Identify where `data/global/filters/%s.tga` is used to pick `default_add/default_sub` (EXE contains the format string but not the specific filter names as embedded strings).
- The “final composite to backbuffer” in `FUN_005aa390` is `post_mask` via `FUN_005a96e0`, not `post_combine2`.
- The buffer fed into `post_mask` `Tex0` is the last destination render target produced by the preceding `FUN_005a8c60` ping-pong loop.
- `radialblur.tga` participates only as the `Tex1.a` mask term in `post_mask`; it is not the final bloom RGB source.

---

## 2026-06-03 Menu Car Preview Hook

`Confirmed (Ghidra + binary constants)`

The menu car display path uses compact `data/menu/cars/menucar_%i.bgm` meshes plus `data/menu/cars/car_%i/skin%i.dds` skin textures. `MenuInterface_UpdateMenuCarTransform` @ `0x004ac680` stores yaw at `gui+0x5b4` and advances automatic rotation by `dtSeconds * 0.104719758` radians, i.e. exactly 6 degrees/sec.

Implementation implication for the web MVP:
- The menu preview should rotate the model about its local/pose origin, not orbit an offset parent.
- The preview should use the existing vehicle shader alpha-as-gloss path; do not solve UI layering by forcing body materials transparent.
- Focused details are in `ghidra_findings/MENU_CAR_RENDERING_FINDINGS_2026-06-03.md`.
