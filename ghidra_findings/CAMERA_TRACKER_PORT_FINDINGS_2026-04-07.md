# Camera Tracker Port Findings

Date: `2026-04-07`

Scope:

- direct Ghidra pass over the original driving-camera tracker path used for the
  web renderer port
- focus on the per-car chase / fixed-head camera modes from
  `src/data/cars/*/camera.ini`

## Confirmed anchors

- `CameraTracker_ApplyViewTransform` @ `0x004d71d0`
- `FixedHeadCameraTracker_Update` @ `0x004d7520`
- `CarCameraTracker_ResetPitchAndHeightState` @ `0x004d7890`
- `CarCameraTracker_Update` @ `0x004d7910`
- `CarCameraTracker_UpdateGroundCollisionOffset` @ `0x004d8080`
- `CameraDamageShake_Update` @ `0x004d8320`
- `CameraManager_RegisterCarTrackerConfig` @ `0x004d70f0`
- `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0`

## Confirmed behavior

- `CarCameraTracker_Update` is built around a target point plus a target-to-camera
  offset, not a direct copy of the car chassis transform.
- The normal chase path smooths flat heading with a `1 - pow(dt, stiffness)` style
  alpha and keeps the smoothed heading in tracker state at `this+0x18`.
- The player-car branch overrides the second chase stiffness input with `0.6`
  before the heading blend.
- The chase tracker keeps a separate vertical spring at `this+0x24/0x28`.
  That spring is driven from clamped vertical-velocity input and then reused as:
  - a vertical shift on the chase target anchor
  - a pitch rotation on the target-to-camera offset through the recovered
    `rotate factor`
- `CameraTracker_ApplyViewTransform` rebuilds the final forward/right/up basis from
  explicit camera and target points with a world-up look-at rule. The normal chase
  camera is not a full car-roll/car-pitch inherit.
- `CarCameraTracker_UpdateGroundCollisionOffset` works on the target-to-camera
  offset. It:
  - queries ground clearance at the desired camera position
  - smooths a lift term
  - raycasts from the target toward the desired camera
  - shortens the camera distance with a `1.0` unit collision buffer and a
    `0.05` minimum distance clamp
- `CameraDamageShake_Update` is a separate springed layer. It adds vertical camera
  displacement and rotates the final basis around camera up. It is not authored as
  noise inside `CarCameraTracker_Update`.
- `FixedHeadCameraTracker_Update` bypasses the normal world-up chase handoff and
  writes a transformed local camera basis directly. That path keeps its own spring
  state and uses full local-car orientation, which matches hood / cockpit style
  views.

## Confirmed default runtime tuning from the recovered registration code

From `CameraManager_RegisterCarTrackerConfig` @ `0x004d70f0`:

- car tracker defaults:
  - `vertical velocity scalar = 0.25`
  - `vertical velocity min = -1.0`
  - `vertical velocity max = 1.0`
  - `spring coef = 0.1`
  - `spring damp = 0.2`
  - `rotate factor = 0.1`
- damage shake defaults:
  - `min input = 20.0`
  - `max input = 40.0`
  - `scale input = 0.1`
  - `spring coef = 0.4`
  - `spring damp = 0.05`
  - `roll factor = 0.1`
  - `vertical factor = 1.0`

From `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0`:

- fixed-head defaults:
  - `Location Scale X = 0.024`
  - `Location Scale Y = 0.027`
  - `Location Scale Z = 0.024`
  - `Direction Scale X = 0.1`
  - `Direction Scale Z = 0.05`
  - `Direction Offset X = 0.0`
  - `Direction Offset Z = 0.0`

Port note:

- the web-side implementation now follows the recovered tracker structure from
  the decompiled code but uses the shipped extracted `Data.Camera.*` values for
  runtime tuning where those values are available in-repo, instead of the
  binary fallback defaults used before LiteDb overrides load.

## Porting implications

- The web chase camera should be structured around:
  - authored `TargetFrames.Offset` as the chase anchor
  - authored `PositionFrames.Offset - TargetFrames.Offset` as the camera offset
  - smoothed flat heading
  - separate vertical spring
  - target-to-camera collision shortening
  - separate damage-shake spring
- The web hood / cockpit modes should not reuse the chase look-at path. They need
  their own transformed local basis path.
