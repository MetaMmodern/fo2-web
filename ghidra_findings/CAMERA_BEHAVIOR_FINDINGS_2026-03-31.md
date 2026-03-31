# Camera Behavior Findings

Date: 2026-03-31

Project baseline:

- Active Ghidra project: `reference/ghidra_projects/fo2_zack_result.rep`
- Binary: `reference/FlatOut2.exe`
- Confirmed EXE hash: `MD5 40078c35de1366488d7c3dc761008cd4`

## Scope

Goal: recover how the original FlatOut 2 camera is structured and what behavior the runtime expects, so the port can follow the native design instead of treating the camera as a single ad hoc chase rig.

## High-level conclusion

Confirmed:

- The original game uses a **camera manager with multiple tracker types**, not one monolithic follow-camera function.
- The runtime camera behavior is **data-driven** from both:
  - profile INIs such as `data/camera.ini`, `data/trackintro_camera.ini`, `data/start_camera.ini`, and `data/drivers/ragdoll/camera.ini`
  - LiteDb config blocks under `Data.Camera.*`
- There are distinct camera behaviors for:
  - normal car camera tracking
  - fixed-head / tighter local camera behavior
  - damage/crash shake
  - stunt camera behavior
  - goal/event cameras with target/location presets
  - track intro / start camera sequences

Inference:

- The port should preserve the layered camera design: base view definitions from content files plus runtime tracker modifiers from `Data.Camera.*`.
- A single “follow the car with lerp” camera will miss multiple native behaviors.

## Confirmed runtime call path

### Per-frame camera update

- `UpdateCamera` @ `0x004725c0`
  - Called from the main player host update flow.
  - Runs after vehicle/environment work for the current tick.
  - Ends by calling `CameraManager_UpdateTrackers` at `0x004d6e70`.

- `CameraManager_UpdateTrackers` @ `0x004d6e70`
  - Iterates camera-manager entries.
  - Calls update methods on multiple installed tracker objects.
  - This confirms that camera behavior is composed from several tracker/controller objects, not from a single camera state machine.

## Confirmed bootstrap and content loading

### Camera manager bootstrap

- `CreateCameraManager` @ `0x004d65b0`
  - Constructs the camera manager.
  - Loads ragdoll camera profile data.
  - Installs crash, stunt, and goal camera tracker objects.
  - Registers a camera-related callback in the event manager.

### INI profile loading

- `CameraManager_LoadCameraIniProfiles` @ `0x004d6c90`
  - Loads:
    - `data/camera.ini`
    - `data/trackintro_camera.ini`
    - `data/start_camera.ini`
  - `CreateCameraManager` separately loads:
    - `data/drivers/ragdoll/camera.ini`

Confirmed implication:

- Normal driving camera, track-intro cameras, race-start cameras, and ragdoll camera behavior are split across separate authored content files.

## Confirmed `Data.Camera.*` config blocks

### Car tracker + damage shake

- `CameraManager_RegisterCarTrackerConfig` @ `0x004d70f0`
  - Registers `Data.Camera.CarCameraTracker`
  - Registers `Data.Camera.CameraDamageShake`

Confirmed parameter names from string table / extracted bindings:

- Car tracker:
  - `spring coef`
  - `spring damp`
  - `roll factor`
  - `vertical factor`
  - `vertical velocity scalar`
  - `vertical velocity min`
  - `vertical velocity max`
  - `rotate factor`
- Damage shake:
  - `min input`
  - `max input`
  - `scale input`

Confirmed implication:

- The chase camera reacts to vehicle state with spring/damping behavior, roll and vertical response, and a velocity-gated vertical component.
- Damage shake is a separate tuning layer, not hardcoded directly into the chase view.
- `CarCameraTracker_Update` @ `0x004d7910` confirms the normal driving camera is not a direct full-body transform inherit:
  - it smooths heading/yaw state at tracker offsets `this+0x18` and related spring state
  - it applies vertical response from the `Data.Camera.CarCameraTracker` block through tracker state at `this+0x24/0x28`
  - it runs a separate roll-style camera matrix step plus a separate `CameraDamageShake_Update` call
  - confirmed negative result: the normal driving tracker does not use stunt-only `min tilt height`, `max tilt height`, or `max tilt angle` parameters

Confirmed implication:

- Forward/back camera pitch under acceleration or braking should not be modeled by simply inheriting the car body's full quaternion in the normal chase camera.

### Fixed-head camera

- `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0`
  - Registers `Data.Camera.FixedHead`

Confirmed parameter names:

- `Location Scale X`
- `Location Scale Y`
- `Location Scale Z`
- `Direction Scale X`
- `Direction Scale Z`
- `Direction Offset X`
- `Direction Offset Z`

Inference:

- Fixed-head mode scales and offsets the camera relative to local car/head movement and facing, producing a tighter interior-like or hood-like behavior than the looser chase tracker.

### Stunt camera

- `CameraManager_RegisterStuntTrackerConfig` @ `0x004db660`
  - Registers `Data.Camera.StuntCameraTracker`

Confirmed parameter names:

- `camera distance`
- `min tilt height`
- `max tilt height`
- `max tilt angle`

Confirmed implication:

- Stunt camera behavior is explicitly distance/tilt driven and distinct from the normal chase camera.

### Goal cameras

- `CameraManager_RegisterGoalCameraConfig` @ `0x004d9100`
  - Registers:
    - `Data.Camera.GoalCameraBasketball`
    - `Data.Camera.GoalCameraTargets`
    - `Data.Camera.GoalCameraLocations`
- `CameraManager_RegisterGoalCameraDelayConfig` @ `0x0047e120`
  - Registers `Data.Camera.GoalCameraDelay`

Confirmed implication:

- Event/stunt goal cameras use authored preset target/location sets plus per-event delay values before switching.
- This is not a generic chase camera with a one-off FOV change.

## Confirmed authored camera content

### Per-car camera definitions

Example: `src/data/cars/car_1/camera.ini`

Confirmed:

- Cars define multiple camera slots.
- Example camera slots include:
  - rear chase-style views with `TrackerType=2`, explicit position/target offsets, and `TrackerData` containing:
    - `Stiffness`
    - `MinGround`
    - `ClampGround`
  - tighter local views with `TrackerType=1`, `PositionType=3/4`, and shorter offsets / lower near clip

Inference:

- Native view cycling is per-car authored content, not one universal offset shared by all vehicles.

### Split-screen camera definitions

Example: `src/data/cars/car_1/splitcamera.ini`

Confirmed:

- Split-screen uses a reduced camera set rather than the full single-player list.

### Track intro / cinematic camera definitions

Example: `src/data/tracks/arena/arena1/a/data/camera.ini`

Confirmed:

- Track camera files define cinematic cameras using:
  - `AnimationType`
  - absolute `Position`
  - per-camera `TargetFrames`
  - `FOV`
  - `AnimationFrames` with `CarPosition`
  - polygonal `Area` lists

Confirmed implication:

- Track intro and event cameras are area-based/authored cinematic cameras, not derived from the active chase camera.

## What this means for the port

Confirmed / strongly supported:

- The port should support **multiple authored camera modes** per car.
- Chase camera should include:
  - spring/damping smoothing
  - vertical response tied to velocity thresholds
  - roll/rotation response
  - ground clamp behavior
  - separate damage-shake tuning
- The port should reserve separate logic for:
  - fixed-head / hood-like modes
  - stunt cameras
  - goal cameras
  - intro/start/ragdoll cameras

What would be incorrect:

- Implementing only one universal chase camera with fixed offset and basic look-at
- Treating stunt or goal cameras as just FOV tweaks on the chase camera
- Ignoring authored `camera.ini` content in favor of hardcoded offsets

## Stable anchors

- `UpdateCamera` @ `0x004725c0`
- `CreateCameraManager` @ `0x004d65b0`
- `CameraManager_LoadCameraIniProfiles` @ `0x004d6c90`
- `CameraManager_UpdateTrackers` @ `0x004d6e70`
- `CameraManager_RegisterCarTrackerConfig` @ `0x004d70f0`
- `CarCameraTracker_Update` @ `0x004d7910`
- `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0`
- `FixedHeadCameraTracker_Update` @ `0x004d7520`
- `CameraDamageShake_Update` @ `0x004d8320`
- `CameraManager_RegisterStuntTrackerConfig` @ `0x004db660`
- `CameraManager_RegisterGoalCameraConfig` @ `0x004d9100`
- `CameraManager_RegisterGoalCameraDelayConfig` @ `0x0047e120`
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
