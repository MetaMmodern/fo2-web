# Ghidra Visual Addressbook (FlatOut2.exe)

Purpose: a stable “map” of the *visual* runtime anchors we’ve already recovered from `reference/FlatOut2.exe`, so we don’t redo redundant passes.

Project baseline:
- Active Ghidra project for ongoing RE/porting work: `reference/ghidra_projects/fo2_zack_result.rep`
- Legacy project retained only for historical comparison: `reference/ghidra_projects/flatout2.rep`
- No address remap is currently needed: both projects target the same executable hash (`MD5 40078c35de1366488d7c3dc761008cd4`), so the addresses in this document remain valid.
- Function names may differ between projects; when in doubt, trust the address first and the label second.

Source of truth notes:
- `VISUAL_GHIDRA_RUNTIME_FINDINGS_2026-03-29.md:1`
- `ghidra_findings/PROJECT_COMPARISON_FLATOUT2_VS_ZACK_2026-03-31.md:1`

Binary:
- `reference/FlatOut2.exe` (PE32 / x86, ImageBase `0x00400000`)

---

## Driving / Collision / Vehicle Physics

Source of truth notes:
- `ghidra_findings/DRIVING_COLLISION_FINDINGS_2026-03-31.md:1`
- `ghidra_findings/DRIVING_RUNTIME_CONTROL_FINDINGS_2026-03-31.md:1`

### Core anchors

- `FUN_00431b50` @ `0x00431b50` — Car runtime setup: loads `panels.ini`, `body.bgm`, `crash.dat`; resolves wheel/tire anchors; reads `CollisionFull*`, `CollisionBottom*`, and `CollisionTop*`.
- `FUN_00414ea0` @ `0x00414ea0` — Collision sound bootstrap: loads `data/sound/collision_sounds.bed`; registers `CollisionSoundTypes` and fixed event groups including `SuspensionBottomOut`.
- `FUN_0043aa30` @ `0x0043aa30` — Tire dynamics config consumer for `Data.Physics.TireDynamics`.
- `FUN_00469f50` @ `0x00469f50` — Registers `Data.Physics.Car.Steering_PC` defaults and speed-limited steering behavior.
- `FUN_00454c60` @ `0x00454c60` — Reads the larger car physics tree: differential, throttle/brake/speed curves, gearbox, suspension, tires, and engine.
- `FUN_0046c8e0` @ `0x0046c8e0` — Local-player per-frame control path: samples controller state, shapes steer/gas/brake/handbrake inputs, then calls the vehicle step.
- `0x0046f510` — Unnamed local-player steering/input shaping block recovered from disassembly; applies speed-bucket steering limits, analog centering, and final clamp before `FUN_0046fa50`.
- `FUN_0046fa50` @ `0x0046fa50` — Post-input drive helper: writes control channels into vehicle state and manages auto-shift / shift cooldown behavior.
- `AIPlayer_WriteVehicleControls` @ `0x00409520` — AI per-frame control writer; emits steer/throttle/brake/handbrake/gear requests into the same vehicle control channels used by the local player.
- `FUN_00429250` @ `0x00429250` — Vehicle input normalization step; clamps input channels and stores per-frame timing/velocity snapshots.
- `FUN_0042c650` @ `0x0042c650` — Main vehicle simulation entry traced here; clears step accumulators, resolves wheel contact state, then runs 100 fixed `0.01` substeps.
- `FUN_00429640` @ `0x00429640` — Chassis/drag/steering propagation stage within each vehicle substep.
- `FUN_00429be0` @ `0x00429be0` — Main wheel/tire force and yaw-torque accumulation stage within each substep.
- `FUN_00441ae0` @ `0x00441ae0` — Wheel steer-angle clamp stage after car-level steer input is computed.
- `FUN_00441f10` @ `0x00441f10` — Auto gear-selection helper based on projected forward speed and gearbox thresholds.
- `FUN_00442160` @ `0x00442160` — Shift request/state-machine entry.
- `FUN_00454b50` @ `0x00454b50` — Builds the runtime engine curve table from `PeakPower*`, `PeakTorque*`, `RedLineRpm`, `RpmLimit`, and `ZeroPowerRpm`.

### Key strings / config keys

- `CollisionFullMin` @ `0x0066a44c`
- `CollisionFullMax` @ `0x0066a438`
- `CollisionBottomMin` @ `0x0066a424`
- `CollisionBottomMax` @ `0x0066a410`
- `CollisionTopMin` @ `0x0066a400`
- `CollisionTopMax` @ `0x0066a3f0`
- `BodyCollision` @ `0x0067bf3c`
- `RayCollision` @ `0x0067bf1c`
- `CameraCollision` @ `0x0067bf2c`
- `CollisionSoundTypes` @ `0x00669540`
- `SuspensionBottomOut` @ `0x00669510`
- `Data.Physics.TireDynamics` @ `0x0066a940`
- `Data.Physics.Car.Steering_PC` @ `0x0066d798`
- `FrontSuspensionLift` @ `0x0066b5a0`
- `RearSuspensionLift` @ `0x0066b554`
- `FrontDifferential` @ `0x0066bb08`
- `RearDifferential` @ `0x0066baf4`

### Practical implications

- The original vehicle runtime is explicitly data-driven for:
  - body collision volumes
  - tire dynamics
  - steering response
  - suspension geometry
  - differential / throttle / brake / speed curves
- The original runtime does local and AI control generation first, then hands normalized inputs into a fixed-step vehicle simulation loop. It is not one ad hoc frame-sized arcade update.
- The traced vehicle simulation entry runs `100` fixed `0.01` substeps via `FUN_0042c650`; missing that structure will materially change steering, acceleration, and stability.
- `SpeedLimit` is currently only confirmed in `Car_ReadHandling` and `SetCarStats`, not in the traced runtime simulation path, so do not assume it is an in-race hard speed cap.
- The native game distinguishes floor/body/ray/camera collision concepts; those should not be collapsed into one generic mesh-contact rule in the long term.

---

## Camera System

Source of truth notes:
- `ghidra_findings/CAMERA_BEHAVIOR_FINDINGS_2026-03-31.md:1`

### Core anchors

- `UpdateCamera` @ `0x004725c0` — Per-frame camera update entry from the player host; dispatches into the camera manager after main vehicle/environment updates.
- `CreateCameraManager` @ `0x004d65b0` — Camera bootstrap; loads ragdoll camera profile, installs crash/stunt/goal trackers, and registers camera update callbacks.
- `CameraManager_LoadCameraIniProfiles` @ `0x004d6c90` — Loads `data/camera.ini`, `data/trackintro_camera.ini`, and `data/start_camera.ini`.
- `CameraManager_UpdateTrackers` @ `0x004d6e70` — Iterates installed camera tracker objects and advances them each frame.
- `CameraManager_RegisterCarTrackerConfig` @ `0x004d70f0` — Registers `Data.Camera.CarCameraTracker` and `Data.Camera.CameraDamageShake`.
- `CarCameraTracker_Update` @ `0x004d7910` — Normal driving tracker update; smooths heading/yaw and vertical response from `Data.Camera.CarCameraTracker`, then applies separate roll/shake work. Do not model this as direct full chassis quaternion inheritance.
- `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0` — Registers `Data.Camera.FixedHead`.
- `FixedHeadCameraTracker_Update` @ `0x004d7520` — Fixed-head / hood-like tracker update path.
- `CameraDamageShake_Update` @ `0x004d8320` — Separate damage-shake layer called after the driving tracker update.
- `CameraManager_RegisterStuntTrackerConfig` @ `0x004db660` — Registers `Data.Camera.StuntCameraTracker`.
- `CameraManager_RegisterGoalCameraConfig` @ `0x004d9100` — Registers `Data.Camera.GoalCameraBasketball`, `GoalCameraTargets`, and `GoalCameraLocations`.
- `CameraManager_RegisterGoalCameraDelayConfig` @ `0x0047e120` — Registers `Data.Camera.GoalCameraDelay`.

### Key strings / config keys

- `Data.Camera.CarCameraTracker` @ `0x00674410`
- `Data.Camera.CameraDamageShake` @ `0x006743f0`
- `Data.Camera.FixedHead` @ `0x00674248`
- `Data.Camera.StuntCameraTracker` @ `0x006748e4`
- `Data.Camera.GoalCameraLocations` @ `0x006744fc`
- `Data.Camera.GoalCameraTargets` @ `0x0067451c`
- `Data.Camera.GoalCameraBasketball` @ `0x0067453c`
- `Data.Camera.GoalCameraDelay` @ `0x0066f3cc`
- `data/camera.ini` @ `0x0067438c`
- `data/trackintro_camera.ini` @ `0x00674370`
- `data/start_camera.ini` @ `0x00674358`
- `data/drivers/ragdoll/camera.ini` @ `0x006743b8`

### Practical implications

- The native camera system is layered: authored camera profiles from INI files plus runtime tracker tuning from `Data.Camera.*`.
- Per-car driving cameras are authored content, not one universal hardcoded offset.
- Stunt, goal, intro, start, and ragdoll cameras are separate behaviors and should not be collapsed into a single chase rig.
- Normal driving camera behavior should not pitch with raw body acceleration by inheriting the car body's full quaternion; stunt tilt belongs to the stunt tracker, not the normal car tracker.

---

## Post-process / Bloom / Radial Blur

### Core functions

- `FUN_005a8350` @ `0x005a8350` — PostProcess init: allocates RT pool (7× `256x256`) + loads post shaders + loads `radialblur.tga`.
- `FUN_005a7740` @ `0x005a7740` — One-time defaults + registers `Data.Effect.PostProcess` with a parameter table at `0x006689d8`.
- `FUN_005aa390` @ `0x005aa390` — Per-frame post execution (overall pass orchestration).
- `FUN_005a9c10` @ `0x005a9c10` — `post_luminance_to_alpha` + `post_colorremap_by_alpha`, sets hardcoded luminance weights.
- `FUN_005a8700` @ `0x005a8700` — Highpass extraction; chooses `post_highpass_luminance` vs `post_highpass4`; clamps intensity and applies `/4` convention.
- `FUN_005a9430` @ `0x005a9430` — Uses `post_combine2` with `C4 = -0.5` (subtractive combine stage).
- `FUN_005a95b0` @ `0x005a95b0` — `post_copy` stage used after `post_combine2`; gated by `BloomDisable`.
- `FUN_005a8c60` @ `0x005a8c60` — Separate radial-blur style stage driven by `RadialBlur*` globals.
- `FUN_005a96e0` @ `0x005a96e0` — Final `post_mask` stage; last visible full-screen pass before optional debug output.
- `FUN_005a9870` @ `0x005a9870` — Optional debug/show copy used when `BloomShow` is enabled.

### Shader paths loaded by init

Loaded in `FUN_005a8350`:
- `data/shader/post_copy.sha`
- `data/shader/post_highpass4.sha`
- `data/shader/post_highpass_luminance.sha`
- `data/shader/post_box4.sha`
- `data/shader/post_combine2.sha`
- `data/shader/post_mask.sha`
- `data/shader/post_luminance_to_alpha.sha`
- `data/shader/post_colorremap_by_alpha.sha`

### Key binary float constants (VAs)

- `0x0067dc24` = `4.0` — highpass intensity clamp max
- `0x0067dba0` = `0.25` — intensity `/4` pre-scale before shader `mul_x4`
- `0x0067dbec` = `deg2rad` (`0.0174532923847`) — used by flare system and elsewhere

Hardcoded luminance weights used by the post chain (set as shader constant `C5` in `FUN_005a9c10`):
- `(0.296875, 0.59375, 0.1171875, 0.0)` i.e. `(76/256, 152/256, 30/256, 0)`

### Per-frame pass order in `FUN_005aa390`

Confirmed from the local executable dump plus prior Ghidra decomp:

1. Optional color-filter remap: `FUN_005a9c10` when `ColorFilter != 0`
2. Highpass extraction: `FUN_005a8700`
3. Downsample/build chain:
   - `FUN_005a8970` repeated
   - optional `FUN_005a8ab0` path when `BloomDownsampled != 0`
4. Intermediate subtractive shaping: `FUN_005a9430` (`post_combine2`)
5. Copy stage: `FUN_005a95b0` (`post_copy`) when `BloomDisable == 0`
6. Separate radial-blur loop: `FUN_005a8c60` repeated `RadialBlurPasses` times
7. Final visible full-screen pass: `FUN_005a96e0` (`post_mask`)
8. Optional debug/show copy: `FUN_005a9870` when `BloomShow != 0`

Practical implication:

- `post_combine2` is not the final on-screen bloom composite.
- The normal path’s last visible pass is `post_mask`.
- The radial-blur-configured stage sits between bloom shaping and `post_mask`, so it must not be merged blindly into environment bloom.

### `Data.Effect.PostProcess` parameter table

Table VA: `0x006689d8` (this is the `PTR_s_BloomDisable_006689d8` passed to the config registration call in `FUN_005a7740`).

Layout: repeating triplets of:
- `name_ptr` (C-string VA)
- `type_code` (u32)
- `dest_addr` (u32 absolute VA)

Recovered entries (in order):

- `BloomDisable` — type `0x405` — dest `0x008e83a0`
- `BloomShow` — type `0x405` — dest `0x008e83a4`
- `BloomFromLuminance` — type `0x405` — dest `0x008e83a8`
- `BloomMonochromeCombine` — type `0x405` — dest `0x008e83ac`
- `BloomPasses` — type `0x406` — dest `0x008e83b0`
- `RadialBlurShow` — type `0x405` — dest `0x008e83b4`
- `RadialBlurPasses` — type `0x406` — dest `0x008e83b8`
- `RadialBlurZoomStart` — type `0x407` — dest `0x008e83bc`
- `RadialBlurZoomMultiplier` — type `0x407` — dest `0x008e83c0`
- `RadialBlurZoomCenter` — type `0x809` — dest `0x008e83c4` (likely 2 floats: center xy)
- `RadialBlurStrength` — type `0x407` — dest `0x008e83cc`
- `ColorFilter` — type `0x405` — dest `0x008e83d0`
- `BloomDownsampled` — type `0x405` — dest `0x008e83d4`

Type code meanings are still *partially inferred* from usage:
- ROMU cross-check: `reference/ROMU/ROMU/bscript2/include/PropertyDbBind.h` defines:
  - `PROPTYPE_BOOL = 5`
  - `PROPTYPE_INT = 6`
  - `PROPTYPE_FLOAT = 7`
  - `PROPTYPE_COLOR = 8`
  - `PROPTYPE_VECTOR2 = 9`
  - `PROPTYPE_VECTOR3 = 10`
  - `PROPTYPE_VECTOR4 = 11`
- That lines up with the low byte in our Ghidra type tags:
  - `0x405` -> bool
  - `0x406` -> int
  - `0x407` -> float
  - `0x809` -> vector2
  - `0x0c0a` -> vector3
  - `0x100b` -> vector4-like payload, which matches the float4/color fields we see in atmosphere bindings
- High bits are still not fully decoded, but the base property types are now supported by ROMU rather than guesswork.

---

## Lens flare / sun flare

### Flare descriptor loader

- `FUN_00595600` @ `0x00595600` — Parses flare descriptor with keys:
  - `GlowMap`, `FlareMap`, `GlowSize`, and `Flares[]` with
  - `UVTopLeft`, `UVBottomRight`, `Size`, `Sharpness`, `Location`, `AngleScale`, `AngleRotation`
  - Converts `GlowSize` using `deg2rad` constant at `0x0067dbec`.

### Flare selection (data-driven file path)

Callsite: inside `FUN_00575f50` (large “atmosphere/environment setup” function).

- Reads `FlareFile` (`0x0067c19c`) into a local string buffer (see region near `0x0057629a`).
- Builds the path by prefixing with `data/global/flares/` (`0x0067be10`).
- Allocates `0x5a0` bytes and calls `FUN_00595600` to build the flare stack (see region near `0x00577a25` / `0x00577aaf`).

Atlas anchors present:
- `data/global/flares/Track_Flares.tga` @ `0x0067bd98`
- `data/global/flares/` @ `0x0067be10`

Other flare-related config keys present in `.rdata`:
- `FlarePosition` @ `0x0067c0ec`
- `SunFlare` @ `0x0066b07c`

---

## Color filters (`default_add`/`default_sub` path)

Format string anchors:
- `data/global/filters/%s.tga` @ `0x0067bea0`
- `data/global/filters/radialblur.tga` @ `0x0067d6c8`

Confirmed behavior (from disassembly within `FUN_00575f50`):
- Two separate filter names are formatted using `data/global/filters/%s.tga` (see `0x0057767c` and `0x00577695`).
- This supports the earlier inference: **filter selection is data-driven**, and the EXE does not need to embed the literal `default_add` / `default_sub` strings.

Open: identify the exact config keys that populate those two `%s` names (they’re stored in fields on the “atmosphere/env” struct inside `FUN_00575f50`).

---

## Atmosphere/env visual parameters (bound in `FUN_00575f50`)

These are configured via a binding list assembled on the stack inside the large environment setup function `FUN_00575f50` @ `0x00575f50`.

Recovered key -> struct-field mappings (all `Confirmed` via disassembly around `0x00576697..0x005768f5`):

- `SunColor` (type `0x100b`) -> `ebx+0x19d0` (float4)
- `AmbientColor` (type `0x100b`) -> `ebx+0x19b0` (float4)
- `SpecularColor` (type `0x100b`) -> `ebx+0x19f0` (float4)
- `SkidmarkColor` (type `0x100b`) -> `ebx+0x1a00` (float4)
- `ParticleColor` (type `0x100b`) -> `ebx+0x1a10` (float4)
- `SunPosition` (type `0x0c0a`) -> `ebx+0x1a80` (vec3)
- `FlarePosition` (type `0x0c0a`) -> `ebx+0x1810` (vec3)
- `SkyDomeOffset` (type `0x407`) -> `ebx+0x1a8c` (float)
- `SunIntensity` (type `0x407`) -> `ebx+0x1af4` (float)
- `AmbientIntensity` (type `0x407`) -> `ebx+0x1af8` (float)
- `SpecularIntensity` (type `0x407`) -> `ebx+0x1af0` (float)
- `MaxOverBrighting` (type `0x407`) -> `ebx+0x1afc` (float)
- `ColorBloom` (type `0x405`) -> `ebx+0x1aac` (bool)
- `BloomColor` (type `0x100b`) -> `ebx+0x1a90` (float4)
- `BloomTolerance` (type `0x407`) -> `ebx+0x1aa0` (float)
- `BloomScale` (type `0x407`) -> `ebx+0x1aa4` (float)
- `BloomIntensity` (type `0x407`) -> `ebx+0x1aa8` (float)

Filter name fields used to build `data/global/filters/%s.tga` (see disassembly around `0x0057766e..0x0057769b`):

- `LuminanceFilterAdd` -> `ebx+0x1ad8` (C-string pointer used as `%s`)
- `LuminanceFilterSub` -> `ebx+0x1adc` (C-string pointer used as `%s`)

---

## Renderer apply call (where the above knobs are consumed)

Function: `FUN_005920b0` @ `0x005920b0`

Key usage:

- Calls renderer vtable `+0x140` (resolved: `0x005aa0b0`) with:
  - `GlobalColorAdd` (float4) at `param_1+0x1ab0`
  - `GlobalColorSub` (float4) at `param_1+0x1ac0`
  - `GlobalAddIntensity` (float) at `param_1+0x1ad0`
  - `GlobalSubIntensity` (float) at `param_1+0x1ad4`
  - `LuminanceFilterAddIntensity` (float) at `param_1+0x1ae0`
  - `LuminanceFilterSubIntensity` (float) at `param_1+0x1ae4`
- Bloom is driven per-view via renderer vtable `+0x138` (resolved: `0x005aa240`), taking:
  - `ColorBloom` (bool) at `param_1+0x1aac`
  - `BloomTolerance` (float) at `param_1+0x1aa0`
  - `BloomScale` (float) at `param_1+0x1aa4`
  - `BloomColor` (float4) at `param_1+0x1a90`
  - `BloomIntensity` (float) at `param_1+0x1aa8`

Resolved renderer wrapper vtable (assigned in `FUN_005a5530` @ `0x005a5530`):
- vtable base: `0x0067d560`
- `+0x138` -> `0x005aa240` — bloom params (normalizes `BloomScale` by `(1 - BloomTolerance)` when tolerance <= 1.0, and premultiplies bloom color by intensity)
- `+0x140` -> `0x005aa0b0` — global add/sub + luminance-filter intensities; triggers LUT regeneration when live
- LUT generator: `FUN_005a99b0` @ `0x005a99b0` — computes the 256-entry remap and uploads via `D3DXLoadSurfaceFromMemory` when it changes

### LUT generator details (`FUN_005a99b0`)

Confirmed from disassembly:

- Builds a 256-entry RGBA table in a local buffer
- Per entry, combines:
  - `GlobalColorAdd * GlobalAddIntensity`
  - `GlobalColorSub * GlobalSubIntensity`
  - luminance-filter add/sub curves scaled by `LuminanceFilterAddIntensity` / `LuminanceFilterSubIntensity`
- Clamps channels to `0..255`
- Compares against the cached table at `0x008e7fa0`
- Uploads only if changed, via `D3DXLoadSurfaceFromMemory(...)`, into the LUT surface later sampled by `post_colorremap_by_alpha`

Practical implication:

- The remap LUT is a real runtime-generated artifact, not just a conceptual blend of two TGA ramps.
- The port should preserve the separation between filter textures, global add/sub float4s, and the four scalar intensities.

---

## ROMU cross-checks

What ROMU currently gives us:

- `reference/ROMU/ROMU/bscript2/include/PropertyDbBind.h` confirms the engine-side property type enum used by DB/config bindings.
- This directly supports the Ghidra parameter table read for `Data.Effect.PostProcess` and the atmosphere bindings in `FUN_00575f50`.

What ROMU currently does **not** give us:

- The checked-in renderer layer is skeletal in this clone:
  - `reference/ROMU/ROMU/bcore/include/BatchRender.h` is empty.
  - `reference/ROMU/ROMU/bcore/src/win32/BatchRender_Win32.cpp` is empty.
  - `reference/ROMU/ROMU/bcore/include/win32/BatchRender_Win32.h` only exposes stub flush methods.
- So ROMU is useful right now for property/binding semantics and engine structure, but not as a drop-in source for the FO2 postprocess implementation.

Practical implication:

- We should trust ROMU for type-system and engine-organization clues.
- We should still treat `reference/FlatOut2.exe` + shader dumps as the primary source for the exact visual frame pipeline.

---

## Final-stage findings

- `BloomDisable` gates the `post_copy` stage at `FUN_005a95b0`; it does not skip the entire tail of `FUN_005aa390`.
- `RadialBlurStrength` is loaded from `0x008e83cc`, multiplied by another global (`0x008da468`), and that product is passed into the final `post_mask` stage.
- `post_mask` is called with the loaded `radialblur.tga` resource from `0x008da464` immediately before the final screen output.
- `RadialBlurShow` (`0x008e83b4`) affects state inside `FUN_005a96e0`; it belongs to the radial-blur/debug family, not the core environment-bloom parameter set.
- `post_mask` shader semantics are explicit from `src/data/shader/post_mask.sha`:
  - `r0.rgb = Tex0.rgb`
  - `r0.a = Tex1.a * c3.a`
- Combined with the `FUN_005aa390` callsite, this means:
  - `Tex0` for the final `post_mask` pass is the last destination render target produced by the prior `FUN_005a8c60` loop
  - `Tex1` is sourced from the loaded `radialblur.tga` resource path held at `0x008da464`
  - the scalar passed into `FUN_005a96e0` becomes `c3.a`, i.e. the alpha strength term for the radialblur mask
- The `FUN_005aa390` ping-pong is now explicit from the register flow:
  - before the radial loop, `ebx = 0` and `edi = 1`
  - each `FUN_005a8c60` call uses `eax = ebx` as the source RT index and `ecx = edi` as the destination RT index
  - after each pass, the code swaps `ebx` and `edi`
  - the final `post_mask` call uses `eax = ebx`, so it always samples the last radial-loop destination
  - with the default `RadialBlurPasses = 2`, the final `post_mask` `Tex0` resolves to RT `0`; with `1` pass it resolves to RT `1`; with `0` passes it stays on RT `0`
- `FUN_005a8c60` itself renders with the `post_box4` shader handle (`this+0x110`), but with radial-zoom parameters from `RadialBlurZoomStart`, `RadialBlurZoomMultiplier`, and `RadialBlurZoomCenter`.
- So the final visible RGB is not the standalone `post_combine2` result and not `radialblur.tga`; it is the last radial-processed intermediate coming out of `FUN_005a8c60`, while `radialblur.tga` only supplies the final alpha mask in `post_mask`.
- `RadialBlurShow` does not skip `post_mask`; xrefs show:
  - write/default init in `FUN_005a7740`
  - read in `FUN_005a96e0` at `0x005a97af`
  - inside `FUN_005a96e0` it flips an internal state field (`this+0x44`) from `1` to `0`, so it is a mode/state toggle, not the main bloom/radial branch gate.
- `this+0x44` is now narrow enough to classify as a pass-mode selector used by the fullscreen-post renderer setup:
  - mode `0`: standard fullscreen pass state
    - used by `FUN_005a8970` (`post_box4`)
    - used by `FUN_005a9430` (`post_combine2`)
    - used by `FUN_005a9870` debug/show copy when called with `0`
    - forced by `BloomShow` inside `FUN_005a95b0`
    - forced by `RadialBlurShow` inside `FUN_005a96e0`
  - mode `1`: final masked-composite state
    - default in `FUN_005a96e0` (`post_mask`)
  - mode `2`: copy/downsample family state
    - used by `FUN_005a8ab0`
    - default in `FUN_005a95b0` (`post_copy`) when not overridden by `BloomShow`
- So the remaining unknown is not which value each pass uses. It is only the exact renderer-state meaning behind those mode numbers at the D3D level.

---

## Explosion bloom (separate effect family)

Parameter group:
- `Data.Effect.ExplosionBloom` (string at `0x00673f28`)

Registration:
- `FUN_004c9440` @ `0x004c9440` registers the group with parameter table `0x00664240`.

Update logic:
- `FUN_004c9490` @ `0x004c9490` updates explosion bloom state; uses:
  - `BloomColor` @ `0x008dc990` (float4)
  - `BloomTolerance` @ `0x008dc9a0` (float)
  - `BloomScale` @ `0x008dc9a4` (float)
  - `DecayPower` @ `0x008dc9a8` (float)

## Other visual config keys seen in the EXE (not fully mapped yet)

These keys are present in `.rdata` and appear in the large environment setup function (`FUN_00575f50`), but we haven’t fully mapped their destination fields yet:

- `ColorBloom` @ `0x0067c084`
- `BloomColor` @ `0x00673f80`
- `BloomTolerance` @ `0x00673f70`
- `BloomScale` @ `0x00673f64`
- `BloomIntensity` @ `0x0067c074`
- `LuminanceFilterAdd` @ `0x0067c060`
- `LuminanceFilterSub` @ `0x0067c04c`
- `LuminanceFilterAddIntensity` @ `0x0067c010`
- `LuminanceFilterSubIntensity` @ `0x0067bff4`
- `GlobalColorAdd` @ `0x0067c03c`
- `GlobalColorSub` @ `0x0067c02c`
- `GlobalAddIntensity` @ `0x0067bfe0`
- `GlobalSubIntensity` @ `0x0067bfcc`
- `HorizonTexture` @ `0x0067c1a8`

---

## Next extraction targets (visual only)

- Decode the remaining “atmosphere/env” binding in `FUN_00575f50` to map:
  - `BloomIntensity / BloomTolerance / BloomScale / BloomColor`
  - `GlobalColor* / LuminanceFilter*`
  - the two filter `%s` names (the ones that should become `default_add`/`default_sub` for Arena day).
- Resolve the exact renderer-state meaning behind `this+0x44` mode values (`0`, `1`, `2`) at the D3D/state-template level, if we ever need byte-for-byte state fidelity rather than pass-family fidelity.
- Map the exact content role of RT `0` vs RT `1` immediately after `post_combine2` and optional `post_copy`, so the WebGL port can mirror the original ping-pong without inference.
