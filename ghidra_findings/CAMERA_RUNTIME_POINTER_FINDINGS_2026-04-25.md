# Camera Runtime Pointer Findings

Date: `2026-04-25`

## Scope

Recover the live gameplay camera pointer path needed by the Reloaded-II
telemetry mod so camera position/forward/FOV can be logged from the original
game without guessing tracker-private structs.

## Confirmed

- `g_pCameraManager_008e8424` @ `0x008e8424` is the live gameplay
  camera-manager global.
- `UpdateCamera` @ `0x004725c0` advances gameplay camera tracker state through:
  - `CameraManager_UpdateTrackers(g_pCameraManager_008e8424, ...)`
- `CreateCameraManager` @ `0x004d65b0` constructs that manager, installs crash,
  stunt, and goal trackers, and returns the live manager root used afterward.

## Confirmed race-view camera path

### Manager root

From `UpdateCamera` and cross-references to `0x008e8424`:

- the live race camera system is rooted at:
  - `g_pCameraManager_008e8424`

### Per-view manager entries

From `RenderRace` @ `0x00479200` and
`RaceScene_RenderViewsAndPostProcess` @ `0x004c9dc0`:

- `g_pCameraManager_008e8424->field1_0x4` is the start of the manager's
  per-view entry array
- each entry is a pointer-sized slot in that array
- each pointed entry stores its live race camera object at:
  - `entry + 0x4`
- each entry also stores two tracker/controller slots updated per frame at:
  - `entry + 0x8`
  - `entry + 0xC`

### Live camera-node block used by race render/audio

Confirmed from `RenderRace` and `FUN_004721c0`:

- race systems use:
  - `cameraObject + 0x20`
- this `cameraObject + 0x20` block is the live camera-node / frustum block
  consumed by:
  - `RaceScene_RenderViewsAndPostProcess`
  - `FUN_004721c0` audio listener setup

For the first local race view in single-player:

- active camera object:
  - `*(int *)(*(int *)g_pCameraManager_008e8424->field1_0x4 + 4)`
- active camera node:
  - `*(int *)(*(int *)g_pCameraManager_008e8424->field1_0x4 + 4) + 0x20`
- tracker/controller slot A:
  - `*(int *)(*(int *)g_pCameraManager_008e8424->field1_0x4 + 8)`
- tracker/controller slot B:
  - `*(int *)(*(int *)g_pCameraManager_008e8424->field1_0x4 + 0xC)`

## Confirmed camera-node field offsets

These offsets are confirmed by direct reads in `FUN_004721c0`,
`RaceScene_RenderViewsAndPostProcess`, and the shared tracker write path
`CameraTracker_ApplyViewTransform`.

Relative to `cameraNode = cameraObject + 0x20`:

- `cameraNode + 0x40`
  - view matrix base used by audio/listener code
- `cameraNode + 0x60`
  - forward vector
- `cameraNode + 0x70`
  - position vector
- `cameraNode + 0x114`
  - runtime FOV value used by `RaceScene_RenderViewsAndPostProcess`
- `cameraNode + 0x118`
  - runtime aspect/scale value derived during render setup
- `cameraNode + 0x11c`
  - derived frustum angle value written during render setup

## Confirmed tracker-family signatures

The active manager entry's `+0x4` slot behaves as the active tracker object for
that race view. Distinct tracker families can therefore be identified by the
runtime object's vtable pointer.

Confirmed tracker-family signatures:

- car / chase tracker:
  - vtable `PTR_LAB_006743d8`
  - anchored by `CarCameraTracker_CopyProfileBlock` @ `0x004d78a0`
- fixed-head / hood-like tracker:
  - vtable `PTR_GoalCameraClipOwnerE_Destructor_00674098`
  - anchored by `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0`
- stunt tracker:
  - vtable `PTR_GoalCameraClipFrameInterval_Destructor_006748cc`
  - anchored by `CameraManager_RegisterStuntTrackerConfig` @ `0x004db660`
- goal camera tracker:
  - vtable `PTR_LAB_006744e4`
  - anchored by `CameraManager_RegisterGoalCameraConfig` @ `0x004d9100`
- crash tracker:
  - vtable `JMPTABLE_CrashCameraTracker_00674340`
  - anchored by `CreateCameraManager` @ `0x004d65b0`

This is enough to expose a stable first-pass telemetry field such as:

- `camera_family`
  - `car`
  - `fixed_head`
  - `stunt`
  - `goal`
  - `crash`
  - `unknown`

## Tracker-slot and authored-profile bridge

Additional confirmed runtime anchor from `CameraManager_UpdateTrackers`:

- `entry + 0x8` and `entry + 0xC` are the tracker/controller slots that receive
  the per-frame update calls
- `entry + 0x4` is the output camera object used afterward by render/audio

Additional confirmed tracker-internal bridge from:

- `CarCameraTracker_Update` @ `0x004d7910`
- `FixedHeadCameraTracker_Update` @ `0x004d7520`

Confirmed:

- these tracker runtime objects use:
  - `tracker + 0x4`
as the authored camera/profile-like object pointer that supplies profile methods
and profile-state access during updates

Implementation implication:

- camera-slot selection is more likely to be exposed by tracker-slot vtables and
  `tracker + 0x4` profile fields than by the output camera object vtable at
  `entry + 0x4`

Follow-up correction from `GoalCameraTracker_GoalViewCamera_Update` and
`GoalCameraTracker_GoalViewCamera_InstantiateActiveClip`:

- for the goal-view runtime object observed in live telemetry, `entry + 0x4`
  is itself a `GoalViewCamera`-style runtime object, not a direct authored
  profile object
- the earlier `tracker + 0x4` candidate path produced invalid profile/FOV data
  for that live object and should not be used as a generic profile bridge
- the currently confirmed goal-view runtime fields are:
  - `cameraObject + 0x10`: active camera profile/script object pointer
  - `cameraObject + 0x14`: player pointer
  - `cameraObject + 0x18`: source camera node pointer
  - `cameraObject + 0x1c`: target camera node pointer
  - `cameraObject + 0x20`: owned `BCORE_Camera2` output node
  - `cameraObject + 0x351`: dirty/update flag
  - `cameraObject + 0x360`: runtime seconds / elapsed active-camera time
  - `cameraObject + 0x370`: instantiated active clip pointer
- `GoalCameraTracker_GoalViewCamera_SelectActiveClip` can select normal/stunt
  camera profiles from the player camera list at:
  - `player + 0x10`: profile pointer list start
  - `player + 0x14`: profile pointer list end

Implementation implication:

- log `cameraObject + 0x10`, `+0x370`, source/target nodes, runtime seconds,
  and the player camera list as candidate columns
- treat profile internals beyond vtable identity as unresolved until a specific
  active profile vtable is observed in runtime CSV and mapped separately

Runtime CSV validation update:

- `entry+0x4` / vtable `0x006742EC` reliably exposes active profile selection:
  - `camera_output_active_profile_ptr` matches one of the player profile list
    entries
  - `player_camera_active_profile_index` cycled cleanly through `0..4` during
    camera-mode switching
  - observed active profile vtable: `0x00673FF8`
- fields `entry+0x4 + 0x360` and `entry+0x4 + 0x370` did not validate as useful
  runtime timer/clip fields in telemetry; they are now treated as output-object
  candidates only
- the companion manager slot B object / vtable `0x0067459C` is now logged with
  separate `camera_goal_view_*` columns, because Ghidra indicates the goal-view
  active clip/timer fields belong to that runtime object shape
- CSV cleanup follow-up:
  - promoted `player_camera_active_profile_index` to stable
    `camera_mode_index`
  - removed the invalid `camera_output_active_clip_*`,
    `camera_output_runtime_seconds`, and `camera_output_dirty_flag` columns from
    the primary CSV schema
  - kept `camera_goal_view_active_clip_*` and
    `camera_goal_view_runtime_seconds`, which validated against runtime data

## Confirmed common tracker context fields

From `GoalCameraTracker_SetSourceCameraNode` @ `0x004d3650` and
`GoalCameraTracker_SetTargetCameraNode` @ `0x004d3680`:

- tracker common field `[5]`
  - owner/context pointer used to refresh `g_pCameraManager_008e8424[1]`
- tracker common field `[6]`
  - source camera node pointer
- tracker common field `[7]`
  - target camera node pointer

These fields are stable enough to treat as common tracker-header fields for
camera telemetry work.

## What is and is not a shared runtime camera field

Confirmed shared outputs:

- camera position
- camera forward
- runtime FOV

Not a single shared output field:

- explicit camera target point

Reason:

- `CameraTracker_ApplyViewTransform` consumes an explicit camera position and
  target point, then writes the final live camera basis/position into the
  camera-node block.
- The camera-node block keeps the resulting forward vector and position, but the
  exact input target point is tracker-specific and not preserved in one common
  post-transform field.

Tracker-specific examples:

- `CarCameraTracker_Update`
  - builds a target point in locals around `local_104`
  - then passes that target into `CameraTracker_ApplyViewTransform`
- `GoalCameraTracker_Update`
  - uses `this+0x3c .. this+0x44` as the explicit target point
  - uses `this+0x30 .. this+0x38` as the explicit camera position
- `StuntCameraTracker_Update`
  - uses `g_pCameraManager_008e8424[1].field2_0x8 + 0x30` as the target point

Implementation implication:

- for generic camera telemetry, log:
  - position
  - forward
  - FOV
  - camera family
- for a true explicit target point, either:
  - derive an approximate target from `position + forward * d`, or
  - add tracker-family-specific telemetry paths

## Authored camera profile fields

Confirmed from script-facing getters:

- current camera profile FOV field:
  - `LuaCamera + 0x2114`
  - exposed by `GetCameraFov` @ `0x004b1140`
- current camera profile position offset:
  - `LuaCamera + 0x1ffc`
  - exposed by `GetCameraPositionOffset` @ `0x004b09a0`
- current camera profile coordinate mode:
  - `LuaCamera + 0x2174`
  - exposed by `GetCameraCoordinateMode` @ `0x004b1730`

Still not fully recovered:

- a clean runtime path from the active race tracker to the current `LuaCamera`
  authored profile object for direct telemetry reads of:
  - `position offset`
  - `coordinate mode`
  - authored target offset

## Important distinction

Confirmed:

- `cameraNode + 0x60` is a reliable forward vector
- `cameraNode + 0x70` is a reliable position
- `cameraNode + 0x114` is the native runtime FOV value consumed by race render

Not yet confirmed:

- a clean semantic "camera mode" enum/address for the currently selected chase /
  fixed-head / stunt / goal mode
- a direct target-point field for the active race camera

So for telemetry, the safe first pass is:

- camera position
- camera forward
- runtime FOV value

and not yet:

- camera mode
- authored target point

## Implementation impact

This finding changes the telemetry implementation strategy:

- do **not** guess camera state from tracker-private structs
- do **not** walk from the vehicle into assumed camera objects
- read the live race camera from:
  - `g_pCameraManager_008e8424`
  - first active race-view entry
  - `cameraObject + 0x20`

That path is the one shared by:

- race rendering
- audio listener setup
- tracker-to-camera handoff
