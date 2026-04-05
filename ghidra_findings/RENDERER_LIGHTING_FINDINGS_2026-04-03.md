# Renderer / Lighting / Image Composition Findings 2026-04-03

Purpose: capture the confirmed FlatOut 2 renderer-side runtime path for frame setup, atmosphere binding, sky rendering, bloom/radial-blur composition, and the high-level race render flow.

Binary:
- `reference/FlatOut2.exe`

## Status

- Global decompilation coverage after this pass: estimated `34%`
- Renderer / lighting / image-composition coverage after this pass: estimated `93%`
- Renderer / lighting / image-composition cleanup after this pass: estimated `90%`

Method:
- Coverage here means the runtime call chain and major visual responsibilities are mapped.
- Cleanup here is lower because large renderer internals are still structurally thin in source and many low-level D3D wrappers remain unnamed.

## Confirmed subsystem boundary

This subsystem currently includes:
- screen/renderer wrapper creation
- projection-matrix ownership
- texture-sampling state profiles
- shared environment-object construction/ownership
- environment/atmosphere parameter application
- sky rendering
- post-process shader creation and execution
- bloom, color-filter LUT generation, radial blur, and final masked composition
- per-frame race render handoff into the visual stack

It does not yet fully include:
- all low-level D3D state-template wrappers
- water/material shader families outside the current frame path
- every weather/environment content loader feeding the visual environment object

## Confirmed top-level runtime path

- `Render` @ `0x0045f3f0`
  - Main per-frame frontend/runtime render dispatcher
  - Updates controller/input-driven render-time state
  - Branches to:
    - `RenderMenu` for menu session
    - `RenderRace` for race session
  - Runs per-frame screen begin/end work around the session-specific renderer

- `RenderRace` @ `0x00479200`
  - Main race visual render path
  - Computes per-view FOV-like scale values per local player
  - Calls race-side scene rendering
  - Uses screen vtable setup helpers before/after scene work
  - Ends through HUD/overlay/output helpers

- `RaceScene_RenderViewsAndPostProcess` @ `0x004c9dc0`
  - Main race-scene visual pass driver for all active views
  - Updates per-view camera/frustum/FOV data
  - Calls `Environment_ApplyVisualParametersToScreen`
  - Calls `Environment_RenderSky`
  - Runs multiple ordered per-view scene pass families
  - Finishes through the screen post-process/output path

## Confirmed screen / renderer wrapper

- `Screen_Screen` @ `0x005a5530`
  - Constructor for the main screen/renderer wrapper
  - Installs vtable `0x0067d560`
  - Initializes renderer-side lists/buffers/state fields
  - Clears the post-process group pointer at `this+0x488`

- `CreatePostProcessShaders` @ `0x005ad780`
  - Lazy allocator/owner for the post-process shader group
  - Allocates `0x210` bytes and calls `PostProcessShader_PostProcessShader`

- `Environment_Environment` @ `0x00575840`
  - Constructor for the shared `BVisual_Environment`
  - Allocates/initializes `0x1eb0` bytes of atmosphere, flare, bloom, and filter state
  - Seeds default bloom/color-remap values consumed later by race rendering

- `MenuScene_InitializeEnvironmentAndCamera` @ `0x004ab9f0`
  - Visual bootstrap for the menu scene
  - Allocates the shared `BVisual_Environment`
  - Stores it into:
    - `App_008da71c.pEnvironment_0x3c`
  - Allocates the menu camera and large render helpers
  - Loads initial menu/track visual content and shared car/menu textures

- `PostProcessShader_PostProcessShader` @ `0x005a8350`
  - Post-process initialization
  - Allocates seven small post-process render targets through the screen resource helpers
  - Loads all post shaders
  - Loads `data/global/filters/radialblur.tga`

- `Screen_CompileShader` @ `0x005ac250`
  - Screen-level shader compile/cache entry point
  - Loads source through BFS when mounted, otherwise through loose-file fallback
  - Calls `D3DXCreateEffect`
  - Reuses cached `(family, filename)` shader pairs
  - Instantiates shader subclasses:
    - `Default`
    - `Dynamic`
    - `CustomColor`
    - `Skinned`
    - `Water`

- `Shader_Shader` @ `0x005acbd0`
  - Base shader constructor
  - Captures effect handles for:
    - `Tex0`
    - `Tex1`
    - `Tex2`
    - `Tex3`
    - cubemap
    - `dFac`
    - `vDiff`
  - Derives capability flags from those handles
  - Creates the matching input declaration/stride pair from the effect's declared input stream

- `WaterShader_WaterShader` @ `0x005b1740`
  - Water-material shader specialization
  - Checks `data/global/water/water.bed`
  - If the file is missing, seeds a default global water tuning block instead of aborting

- `Screen_SetShadowVertexShaderConstants` @ `0x005aba00`
  - Uploads a four-float shadow constant vector into vertex shader constant register `22`

- `Shader_ApplyShadowConstants` @ `0x005ace80`
  - Rebuilds shadow constants for one shader/material path
  - Reuploads the same shadow constant vector to vertex shader constant register `22`
  - Pushes the matching effect-side constant update through the shader effect

## Confirmed frame setup helpers

- `Screen_BeginScene` @ `0x005aac20`
  - Per-frame screen begin-scene helper
  - Calls the D3D device begin-scene path
  - Resets several frame-local renderer globals
  - Stores the caller-provided frame/time value into screen state

- `Screen_SetTextureSamplingProfile` @ `0x005aa7a0`
  - Applies screen-managed D3D sampler filter policy through `IDirect3DDevice9::SetSamplerState`
  - Used by race rendering, sky rendering, and the fullscreen post-process chain
  - Confirmed meanings:
    - profile `5` controls `MINFILTER` + `MAGFILTER`
    - profile `6` controls `MIPFILTER`
    - profile `7` controls `MAXANISOTROPY`
  - Filter values match D3D enums:
    - `1` = point
    - `2` = linear
    - `3` = anisotropic
  - Cases `2` and `3` remain the visibly hot ones in the recovered race/sky/post path

- `Screen_CaptureViewportState` @ `0x005aad40`
  - Captures viewport-like screen state from the D3D device into globals
  - Used by later screen/fullscreen helpers as cached output dimensions/state

- `Screen_GetTextureSamplingProfile` @ `0x005aa730`
  - Returns one of the cached screen-managed sampler profile values by profile id

- `Screen_InitializeD3DRenderState` @ `0x005a6320`
  - Restores core D3D device render state after device creation/reset
  - Reapplies cached sampler profiles `5`, `6`, and `7` through `Screen_SetTextureSamplingProfile`
  - Seeds default texture-stage, sampler-address, fog, alpha, and colour-write state

- `Screen_CreateD3DDevice` @ `0x005a6a50`
  - Creates the main D3D device for the screen wrapper
  - Immediately calls `Screen_InitializeD3DRenderState` on success

- `Screen_UpdateProjectionMatrix` @ `0x005a7130`
  - Rebuilds the global projection matrix from the active frustum/view parameters
  - Supports both perspective and alternate matrix layout branches
  - Uploads the matrix to the D3D device and caches depth-related coefficients

- `Screen_CaptureProjectionMatrixOncePerFrame` @ `0x005ab480`
  - Once-per-frame helper used during race rendering
  - Copies the device projection matrix into `g_ProjectionMatrix_008e5f40`
  - Guards the readback with a frame counter/state flag

- `CreateD3DWindow` @ `0x005a59d0`
  - Creates the render window and D3D device
  - Initializes the default world/view/projection globals
  - Strong call-shape inferences for hot `Screen` slots:
    - slot `12` applies one per-view viewport rectangle
    - slot `15` clears scene buffers with target/depth-style flag values
    - slot `37` seeds fullscreen post/tone constants
    - slot `40` stores an initial screen scalar of `1.1f`

## Confirmed environment / lighting application

- `Environment_ApplyVisualParametersToScreen` @ `0x005920b0`
  - Pushes atmosphere/environment data into the screen renderer
  - Normalizes the sun-direction vector from `SunPosition`
  - Builds two direction matrices into the environment object
  - Applies:
    - sun/ambient/specular colour and intensity
    - max overbright value
    - global add/sub colour-filter terms
    - luminance filter intensities
    - per-view bloom parameters

The renderer consumes these environment fields directly:
- `ColorBloom`
- `BloomTolerance`
- `BloomScale`
- `BloomColor`
- `BloomIntensity`
- `GlobalColorAdd`
- `GlobalColorSub`
- `GlobalAddIntensity`
- `GlobalSubIntensity`
- `LuminanceFilterAddIntensity`
- `LuminanceFilterSubIntensity`

## Confirmed sky path

- `Environment_RenderSky` @ `0x00592470`
  - Copies flare-position style data into a linked object when present
  - Pushes sky-dome offset and related environment values into the sky renderer
  - Calls the screen sampler-profile helper twice:
    - `(2, 0)`
    - `(3, 8)`
  - If the environment owns the sky-side auxiliary object, calls the extra sky helper before final draw
  - Finishes through screen vtable slot `+44`

Practical implication:
- sky rendering is not a detached effect; it explicitly participates in the same screen-state profile system as race scene rendering and post-process fullscreen work

## Confirmed post-process chain

- `Screen_ExecutePostProcessChain` @ `0x005aa390`
  - Runs only when the screen has an active render target / scene source at `this+0x478`
  - Calls the full post chain in this order:
    1. initialize bloom state
    2. optional colour-filter LUT stage
    3. highpass extraction
    4. bloom downsample / blur loop
    5. subtractive combine
    6. optional copy
    7. radial-blur loop
    8. final `post_mask` visible composite
    9. optional debug/show copy

Already confirmed subordinate functions:
- `FUN_005a8700` — highpass extraction
- `FUN_005a8970` — bloom pass loop stage
- `FUN_005a8ab0` — extra downsampled bloom path
- `FUN_005a9430` — subtractive combine
- `FUN_005a95b0` — copy stage
- `FUN_005a8c60` — radial-blur loop stage
- `FUN_005a96e0` — final masked composite
- `FUN_005a9870` — optional debug/show output

## Confirmed shader/resource set

Post shaders loaded by the post-process initializer:
- `data/shader/post_copy.sha`
- `data/shader/post_highpass4.sha`
- `data/shader/post_highpass_luminance.sha`
- `data/shader/post_box4.sha`
- `data/shader/post_combine2.sha`
- `data/shader/post_mask.sha`
- `data/shader/post_luminance_to_alpha.sha`
- `data/shader/post_colorremap_by_alpha.sha`

Filter/atlas resources confirmed:
- `data/global/filters/radialblur.tga`
- `data/global/filters/%s.tga`
- `data/global/flares/Track_Flares.tga`
- `data/global/flares/`
- `data/global/water/water.bed`

## Confirmed config/property side

Post-process property group:
- `Data.Effect.PostProcess`

Explosion-bloom property group:
- `Data.Effect.ExplosionBloom`

Atmosphere/env fields consumed through the current visual path include:
- `SunColor`
- `AmbientColor`
- `SpecularColor`
- `SkidmarkColor`
- `ParticleColor`
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
- `LuminanceFilterAdd`
- `LuminanceFilterSub`

## Source migration state

- Added [RenderPipeline.h](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/RenderPipeline.h) and [RenderPipeline.cpp](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/RenderPipeline.cpp) as the first dedicated renderer/image-composition source mirror for this subsystem
- The source mirror currently models:
  - screen/renderer ownership
  - projection update ownership
  - shared environment ownership
  - texture-sampling profiles
  - shader-family/cache ownership
  - post-process render-target allocation
  - shadow-constant upload ownership
  - environment visual-parameter binding
  - post-process chain stage order

## Confirmed `Screen` vtable slot map

Known slots in `JMPTABLE_Screen_0067d560`:
- slot `7` -> `Screen_DestroyWindow`
- slot `9` -> `Screen_GetAspectRatio`
- slot `10` -> `Screen_SetAspectRatio`
- slot `12` -> viewport-rectangle apply helper (strong call-pattern inference)
- slot `15` -> scene-buffer clear helper (strong call-pattern inference)
- slot `16` -> `Screen_BeginScene`
- slot `17` -> `Screen_EndScene`
- slot `19` -> `Screen_CaptureProjectionMatrixOncePerFrame`
- slot `20` -> `Screen_CaptureViewportState`
- slot `25` -> `Screen_GetTextureSizeFromQuality`
- slot `26` -> `Screen_SetTextureSamplingProfile`
- slot `37` -> post/tone constant setup helper (strong call-pattern inference)
- slot `40` -> screen scalar setup helper (strong call-pattern inference)
- slot `44` -> `Screen_UpdateProjectionMatrix`
- slot `84` -> `Screen_ExecutePostProcessChain`

Additional post-process resource-helper slots observed through `PostProcessShader_PostProcessShader`:
- slot `65` -> texture load helper used for `data/global/filters/radialblur.tga`
- slot `72` -> render-target/resource creation helper used for the seven post-process working surfaces
- slot `75` -> format-selection helper feeding the post-process resource creation path

## D3D sampler-policy mapping

Confirmed from `Screen_SetTextureSamplingProfile`:
- sampler-state type `5` -> `D3DSAMP_MAGFILTER`
- sampler-state type `6` -> `D3DSAMP_MINFILTER`
- sampler-state type `7` -> `D3DSAMP_MIPFILTER`
- sampler-state type `10` -> `D3DSAMP_MAXANISOTROPY`

Confirmed policy meanings:
- profile `5`:
  - value `0`/default path -> point min/mag, anisotropy forced to `1`
  - value `1` -> linear min/mag, anisotropy forced to `1`
  - value `2` -> anisotropic minfilter, linear magfilter, anisotropy preserved from profile `7`
- profile `6`:
  - value `0` -> no mip filtering
  - value `1` -> point mip filtering
  - value `2` -> linear mip filtering
- profile `7`:
  - cached anisotropy level, clamped by the screen capability field at `this+0xe0`

## Open items

- replace the strong call-pattern inferences for slots `12`, `15`, `37`, `40`, `65`, `72`, and `75` with exact function-address labels
- recover more material-side shader subclasses beyond the currently confirmed `Default` / `Dynamic` / `CustomColor` / `Skinned` / `Water` family split
- connect weather selection to the environment/atmosphere visual object with an end-to-end path

## Breadth-first frontier sweep

This section is the explicit renderer frontier inventory before the next deep branch. The goal is to classify the remaining nearby nodes so the renderer work stays controlled instead of wandering through arbitrary scene helpers.

### Core unresolved frontier

These nodes still belong directly to the renderer / image-composition boundary:

- `Screen` vtable slots `12`, `15`, `37`, `40`, `41`
  - classification: core screen/frame-output frontier
  - current understanding:
    - `12` = viewport-rectangle apply helper
    - `15` = scene-buffer clear helper
    - `37` = post/tone constant setup helper
    - `40` = screen scalar setup helper
    - `41` = post-frame fullscreen finalize/output helper used by `RenderRace`

- `Screen` resource-helper slots `65`, `72`, `75`
  - classification: core renderer resource frontier
  - current understanding:
    - `65` = texture-load helper
    - `72` = render-target/resource creation helper
    - `75` = format-selection helper

- `FUN_00553ca0` pass family
  - classification: core race-scene draw-pass frontier
  - current understanding: one shared per-view pass dispatcher with mode ids `0,1,2,3,4,5,8,9`

- `FUN_00554fa0`
  - classification: core race-scene draw-pass frontier
  - current understanding: two large per-view scene pass families fed from environment-owned pointers

- `FUN_005548a0`, `FUN_00555b60`, `FUN_00555dc0`, `FUN_00554670`, `FUN_00554380`, `FUN_00554010`, `FUN_0058eff0`
  - classification: core race-scene pass frontier
  - reason: these are all still inside `RaceScene_RenderViewsAndPostProcess` and therefore part of the real visual frame pipeline

### Shared but adjacent frontier

These are important, but they sit at subsystem seams rather than inside the core image-composition spine:

- `MenuScene_InitializeEnvironmentAndCamera`
  - classification: shared menu/renderer seam
  - status: sufficient for ownership; deeper menu content loading can be deferred

- `Environment_Environment`
  - classification: shared environment/weather seam
  - status: sufficient for allocation/ownership; exact field naming belongs partly to weather/environment passes

- `Shader_Shader` subclass tree beyond the currently confirmed family split
  - classification: shared material/shader seam
  - status: enough for the renderer boundary; deeper subclass behavior can be followed later per material family

### Explicitly deferred from this subsystem

- exact weather selection and content loading before values enter `BVisual_Environment`
- non-visual gameplay-side producers that only feed camera/view parameters
- shared utility wrappers underneath generic D3D resource creation once their renderer role is known

### Practical sweep result

- The renderer frontier is now explicit and branchable.
- The next deep renderer branches should be:
  1. exact `Screen` slot/function-address recovery
  2. `FUN_00553ca0` mode-family breakdown
  3. weather-to-environment producer path
