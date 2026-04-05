# Three.js Lighting Migration Plan 2026-04-06

Purpose: map the confirmed FlatOut 2 renderer/lighting pipeline onto the current Three.js port and define a safe implementation order.

Date: `2026-04-06`

## Executive summary

The decompilation work is materially useful. The renderer-side visual pipeline is already bounded well enough to reproduce the original structure in Three.js at a systems level.

What is confirmed:
- there is a shared environment object (`BVisual_Environment`) that owns the active visual weather/lighting state
- race rendering pushes environment parameters into the renderer every view via `Environment_ApplyVisualParametersToScreen` (`0x005920b0`)
- sky rendering is a distinct environment-owned pass via `Environment_RenderSky` (`0x00592470`)
- the final image is not just forward scene lighting; it relies on a post chain driven by environment bloom/filter parameters via `Screen_ExecutePostProcessChain` (`0x005aa390`)
- shader/material behavior is organized by shader families and effect files from `shaderlib_pro.ini`

What is not yet fully recovered:
- exact low-level D3D state meaning behind every renderer mode/profile
- complete material-side behavior for every shader family beyond the already bounded class/effect mapping
- exact Three.js equivalent for FO2 shadow-constant behavior at the per-shader level

This means the right path is not to guess a generic PBR setup. The right path is to rebuild the original pipeline shape in Three.js:
1. environment state object
2. shader-family material mapping
3. sky pass
4. scene pass
5. FO2-style post chain

## Confirmed binary/runtime anchors

Environment ownership and producer path:
- `Environment_Environment` @ `0x00575840`
- `Environment_LoadWeatherProfileBindingsAndAssets` @ `0x00575f50`
- `Environment_ApplyVisualParametersToScreen` @ `0x005920b0`
- `Environment_RenderSky` @ `0x00592470`
- `RaceScene_RenderViewsAndPostProcess` @ `0x004c9dc0`

Post stack:
- `PostProcessShader_PostProcessShader` @ `0x005a8350`
- `Screen_ExecutePostProcessChain` @ `0x005aa390`
- `FUN_005a9c10` = luminance-to-alpha plus color-remap stage
- `FUN_005a8700` = highpass extraction
- `FUN_005a8970` = blur/downsample loop stage
- `FUN_005a9430` = subtractive combine using `post_combine2`
- `FUN_005a95b0` = copy stage gated by `BloomDisable`
- `FUN_005a8c60` = radial blur loop
- `FUN_005a96e0` = final `post_mask` visible composite

Shader/material system:
- `Screen_CompileShader` @ `0x005ac250`
- `Shader_Shader` @ `0x005acbd0`
- `Shader_ApplyShadowConstants` @ `0x005ace80`
- `Screen_SetShadowVertexShaderConstants` @ `0x005aba00`
- `shaderlib_pro.ini` maps shader ids to effect files and shader classes

## Confirmed environment data model

Recovered weather/environment fields from `FUN_00575f50` and related notes:
- `SunColor`
- `AmbientColor`
- `SpecularColor`
- `SunPosition`
- `FlarePosition`
- `SkyDomeOffset`
- `SunIntensity`
- `AmbientIntensity`
- `SpecularIntensity`
- `MaxOverBrighting`
- `ColorBloom`
- `BloomColor`
- `BloomTolerance`
- `BloomScale`
- `BloomIntensity`
- `GlobalColorAdd`
- `GlobalColorSub`
- `GlobalAddIntensity`
- `GlobalSubIntensity`
- `LuminanceFilterAdd`
- `LuminanceFilterSub`
- `LuminanceFilterAddIntensity`
- `LuminanceFilterSubIntensity`

Confirmed implication:
- FO2 lighting is not “just some lights”
- the environment object is the bridge between weather profile data and both scene lighting and post-process tuning

## Confirmed renderer shape to reproduce in Three.js

### 1. Environment state layer

FO2 analogue:
- `BVisual_Environment`

Three.js analogue:
- one JS environment controller/state object per active track/weather profile

Required responsibilities:
- own raw weather/profile values
- derive normalized sun direction from `SunPosition`
- expose scene-light values
- expose sky-pass values
- expose post-process values
- expose flare values

Important rule:
- do not scatter these values across `scene.js`, `track.js`, `materials.js`, and `postprocessing.js`
- centralize them into one runtime environment object first

### 2. Scene lighting layer

FO2 analogue:
- `Environment_ApplyVisualParametersToScreen`

Three.js analogue:
- a controlled light rig plus per-material uniforms

Recommended mapping:
- `SunColor * SunIntensity` -> `DirectionalLight` color/intensity
- `AmbientColor * AmbientIntensity` -> `AmbientLight` or `HemisphereLight` upper term
- `SpecularColor * SpecularIntensity` -> material-level specular/reflection term, not a separate Three.js light
- `SunPosition` -> normalized directional-light direction

Important nuance:
- FO2 is not PBR-authored content. A naive `MeshStandardMaterial` pass everywhere will not match.
- For many track/car materials, custom shader materials or `onBeforeCompile` patches are the closer analogue.

### 3. Sky layer

FO2 analogue:
- `Environment_RenderSky`
- environment-owned sky helper
- flare-position handoff
- horizon and sky-dome controls

Three.js analogue:
- separate sky scene or large sky-root rendered before the main scene

Recommended mapping:
- sky dome / gradient / horizon band stay in an environment-owned subsystem
- render sky before track/car
- keep sun flare as its own overlay stage
- do not mix sky rendering logic into generic scene setup

### 4. Material/shader family layer

FO2 analogue:
- `shaderlib_pro.ini` + `Screen_CompileShader` + shader subclasses

Three.js analogue:
- a shader-family registry that chooses material builders by FO2 shader id

This is the key migration step that is still incomplete in the current port.

Confirmed shader-family examples from `shaderlib_pro.ini`:
- `1` static prelit -> `pro_static2x.sha`
- `2` terrain/lightmapped -> `pro_lightmapped.sha`
- `3` terrain specular -> `pro_lightmapped_spec.sha`
- `4` dynamic diffuse -> `pro_default_dynamic.sha`
- `5` dynamic specular -> `pro_dynamic_specular.sha`
- `6` car body -> `pro_car_body.sha`
- `7` car window -> `pro_car_window.sha`
- `10` car tire -> `pro_car_tire.sha`
- `11` car lights -> `pro_car_lights.sha`
- `14` shadow project -> `pro_rendertarget_shadow.sha`
- `15` car lights unlit -> `pro_car_lights_unlit.sha`
- `21` tree branch -> `pro_tree_branch.sha`
- `24` sunflare -> `pro_sunflare.sha`
- `36..39` sunmap families -> dynamic/lightmap/static opaque/transparent variants

Migration implication:
- the current broad “one fallback material for most things” approach is structurally wrong for visual parity
- the migration must become shader-id driven

### 5. Post-process layer

FO2 analogue:
- `Screen_ExecutePostProcessChain`

Three.js analogue:
- `EffectComposer`-style chain or explicit ping-pong render targets

Required FO2 order:
1. optional color-remap LUT stage
2. highpass extraction
3. bloom downsample/blur loop
4. subtractive combine
5. optional copy
6. radial blur loop
7. final `post_mask` composite

Confirmed FO2-specific details worth preserving:
- luminance weights are `(0.296875, 0.59375, 0.1171875)`
- color remap comes from a generated 256-entry LUT, not directly from filter textures
- `BloomScale` is normalized against `(1 - BloomTolerance)` in the renderer setup path
- `post_combine2` is not the final on-screen result
- `radialblur.tga` contributes mask alpha in the final stage, not the final RGB itself

## Recommended implementation plan

### Phase 1: restore the environment object first

Goal:
- rebuild the runtime shape before restoring visuals

Tasks:
- create a `Fo2EnvironmentState` object from track weather/profile data
- move all environment-derived values into it
- expose:
  - `sceneLighting`
  - `sky`
  - `post`
  - `flares`
  - `debug/rawBindings`

Definition of done:
- no lighting/post parameter should be read ad hoc from track assets in unrelated modules

### Phase 2: restore FO2 scene-light inputs without bloom

Goal:
- get the raw lit scene back before compositing

Tasks:
- reintroduce sun + ambient rig from environment values
- split specular handling out from pure light color
- stop using generic unlit fallback for most runtime materials
- build a shader-id material registry for at least:
  - static prelit
  - terrain/lightmapped
  - terrain specular
  - dynamic diffuse
  - dynamic specular
  - car body
  - car window
  - car tire
  - car lights

Definition of done:
- track and car readability should come from scene/material response, not from post hacks

### Phase 3: restore sky as its own subsystem

Goal:
- match FO2’s environment-owned sky path

Tasks:
- reintroduce sky dome / horizon band / cloud layers as environment-owned drawables
- keep sun flare in a separate overlay pass
- ensure sky sampling/state differences do not leak into track/car materials

Definition of done:
- sky, flare, and horizon can be toggled independently of the main scene pass

### Phase 4: restore FO2 post chain exactly enough

Goal:
- reproduce FO2 image composition rather than generic “nice bloom”

Tasks:
- rebuild the 256-entry LUT generation path from:
  - global add/sub colors
  - global add/sub intensities
  - luminance filter textures
  - luminance filter intensities
- reintroduce highpass, blur, subtractive combine, optional copy, radial loop, final mask
- keep render-target ping-pong explicit instead of hiding it in a black-box bloom package

Definition of done:
- pipeline order matches FO2’s known order
- configurable values map back to real environment keys

### Phase 5: shadow/material refinement

Goal:
- close the gap between “pipeline shape is right” and “materials read like FO2”

Tasks:
- map FO2 shadow constants and projective shadow usage to a practical Three.js equivalent
- refine per-family shader behavior with `ShaderMaterial` or `onBeforeCompile`
- expand vegetation/dynamic prop coverage once the core scene families are stable

Definition of done:
- remaining mismatch is on polish/tuning, not missing architecture

## Concrete Three.js analogies

FO2 concept -> Three.js implementation target

- `BVisual_Environment`
  -> one JS environment model/controller

- `Environment_ApplyVisualParametersToScreen`
  -> one function that updates lights, material uniforms, LUT inputs, bloom params

- `Environment_RenderSky`
  -> dedicated sky render step or separate sky scene

- shader family + effect file
  -> material builder registry keyed by FO2 shader id

- `Tex0..Tex3`, `vDiff`, `dFac`
  -> shader uniforms in `ShaderMaterial` / patched built-in materials

- `Screen_ExecutePostProcessChain`
  -> explicit render-target ping-pong composer

- generated LUT uploaded to D3D surface
  -> `DataTexture` regenerated when filter params change

- shadow constant register `22`
  -> shared shadow uniform block or per-material shadow-direction/projection uniform set

## Current risks / missing pieces

These are real gaps, but they do not invalidate the decompilation work:

1. Exact per-material shader math is not fully recovered for every shader id.
This affects visual parity, but not the confirmed overall architecture.

2. D3D render-state mode numbers behind some fullscreen passes are still partly semantic rather than fully named.
This affects low-level fidelity, but the pass order and high-level resource flow are already confirmed.

3. Shadow behavior is structurally identified, but not yet translated into a concrete Three.js shadow model.
This is a translation problem, not a missing-engine problem.

4. Some current repo assumptions treated lightmaps and generic standard materials as a universal solution.
The binary evidence says the correct abstraction is shader-family behavior driven by environment state plus post.

## Immediate next step

Before writing more rendering code:
- restore a minimal but real `Fo2EnvironmentState`
- re-enable only scene lighting and sky from that object
- keep post disabled at first
- then add the FO2 LUT stage back before bloom

That order minimizes false positives. It lets us tell whether a visual mismatch comes from:
- wrong scene/material response
- wrong sky/environment values
- wrong post composition

