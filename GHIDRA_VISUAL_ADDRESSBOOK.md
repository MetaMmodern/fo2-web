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

## App Bootstrap / Resource Loading

Source of truth notes:
- `ghidra_findings/APP_BOOTSTRAP_RESOURCE_LOADING_FINDINGS_2026-04-03.md:1`

### Core anchors

- `entry` @ `0x00602638` — CRT startup only; initializes the MSVC runtime and then calls `WinMain`.
- `WinMain` @ `0x00520ed0` — Primary game startup entry. Parses command-line switches (`setup`, `-setup`, `-binarydb`, `-bedit`), checks DirectX, loads the archive lists `filesystem` then `patch`, loads the binary DB, bootstraps the script host, creates save/profile helpers, and then hands off to `LaunchWindow`.
- `CheckDirectXVersion` @ `0x00520aa0` — Reads the DirectX registry version string and compares it against the expected startup minimum `4.09.00.0904`.
- `LaunchWindow` @ `0x00520cf0` — Creates the setup/main window, checks the parsed command-line helper buffer for `-join` / `-host`, optionally shows intro videos, then calls `App_InitializeCoreSystems` once the window/setup phase has succeeded.
- `App_InitializeCoreSystems` @ `0x005210e0` — Second-stage core bootstrap after the main window exists. Acquires `GameSettings`, allocates the `0x430` car-id lookup table, fills it from LiteDb, initializes controller input, registers network Lua bindings, starts networking, acquires the font registry, and loads `data/global/Fonts/fonts.bed`.
- `LoadBfsArchiveList` @ `0x00520e10` — Parses one plain-text archive list file whose path is passed in `ESI`. `WinMain` calls it twice with `filesystem` and then `patch`; the loader reads lines up to `'\n'` into a `0x104` buffer and passes each line directly to `BfsManager_AddArchivePath`.
- `BfsManager_AddArchivePath` @ `0x0054c2a0` — Ensures the process-global `BfsManager` exists and appends one BFS archive path read from an archive list file; when called with `NULL`, destroys and clears the global BFS manager.
- `InitBfsManagerAfterAlloc` @ `0x00559760` — `BfsManager` constructor-like initializer. Allocates the aligned streaming/read buffer and three reusable `MWFileObject` slots.
- `BfsManager_RegisterArchiveFile` @ `0x00559920` — Allocates and appends one opened BFS archive descriptor into the manager’s internal archive array.
- `OpenBFS` @ `0x00560b80` — Opens one `.bfs` archive, validates the `bfs1` header/id, validates the hash-table size, loads the directory/hash blob, and rebases internal offsets.
- `LoadBinaryDatabase` @ `0x005595f0` — Loads `data/Database/FlatOut2.db`, validates the binary DB header/version, allocates the LiteDb blob, and installs the runtime LiteDb root pointer.
- `DoesFileExistWrapper_AndDoesSomeMoreStateStuff` @ `0x0054c610` — Uses the BFS manager for file existence checks when one is mounted and the caller prefers archive lookup; otherwise falls back to normalized raw-file lookup via `__stat` and extra search paths.
- `FileLookup_BuildSearchPathCandidate` @ `0x0054c180` — Builds one loose-file fallback candidate by prepending one registered search-path prefix to the normalized relative filename buffer.
- `FileLookup_ShutdownArchiveAndSearchPaths` @ `0x0054c310` — Shutdown helper for startup-owned content lookup state; frees the global `BfsManager` and any registered loose-file search-path prefixes.
- `App_AcquireScriptHost` @ `0x00521510` — Allocates or refcounts the global `ScriptHost`; alloc size `0x0c`, installs `ScriptHost_allocatedvftable_0067fe4`.
- `ScriptHost_InitializeRootLuaState` @ `0x00524d70` — Root script-host/Lua bootstrap. Recreates the Lua state, installs helper globals/registries, injects the built-in queue/sandbox support code, and prepares the startup script environment. Reused later outside `WinMain` when the root script state is rebuilt.
- `CommandLineOptions_ParseBuffer` @ `0x00551090` — Parses the raw command-line string into a `0x2008` key/value option table with support for bare flags and quoted values.
- `ScriptHost_ExposeCommandLineTable` @ `0x00550f90` — Exports the parsed command-line option table into Lua as global/table `CommandLine`.
- `CommandLineOptions_FindIndex` @ `0x00551220` — Case-insensitive lookup helper over the parsed command-line option table; `LaunchWindow` uses it for `-join` / `-host`.
- `ScriptHost_RegisterNetworkBindings` @ `0x004e2130` — Registers network/voice/session Lua functions and classes into the root script host state.
- `App_AcquireGameSettings` @ `0x005215c0` — Allocates or refcounts the global `GameSettings`; alloc size `0x4120`.
- `GameSettings_GameSettings` @ `0x00458a20` — `GameSettings` constructor; calls `GameSettings_LoadResetTimingThresholds(this)` and `GameSettings_BuildLevelRuleLists(this)` as part of first-stage settings bring-up.
- `GameSettings_LoadResetTimingThresholds` @ `0x00458d00` — Builds a temporary Lua/script state and loads reset-timing thresholds into globals such as `g_fResetTimeAir`, `g_fResetTimeJam`, `g_fResetTimeOutOfTrack`, and `g_fResetTimeIllegal1`.
- `GameSettings_BuildLevelRuleLists` @ `0x00459dd0` — Walks `Settings.Levels` from Lua and builds per-ruleset level index lists inside `GameSettings`.
- `App_AcquireControllerHost` @ `0x005214c0` — Allocates or refcounts the controller/input host object before `ControllerHost_InitializeDevices` runs input-device bootstrap; alloc size `0x154`.
- `ControllerHost_InitializeDevices` @ `0x0054ff10` — Startup input-host bring-up: creates the keyboard device, creates the DirectInput manager, wraps up to two game controllers, and selects the default active controller.
- `GameSettings_LoadGlobalRules` @ `0x00451b70` — Loads the global-rules/settings file if present, otherwise applies GUI defaults, then maps LiteDb `Settings.GlobalRules` into the runtime settings block.
- `Lua_PushSettings` @ `0x004522b0` — Exposes the Lua `Settings` table, category subtables, and `LoadSettings`/`SaveSettings` helpers during startup.
- `Startup_LoadLanguageTable` @ `0x00452d80` — Loads `data/language/languages.dat`, rebases its offset table in memory, and registers the language table for Lua/UI startup.
- `SaveDevice_SaveDevice` @ `0x0051c520` — Constructor for the global `SaveDevice`; creates the `Savegame` directory and allocates a small internal helper block.
- `TrackSegmentProgressManager_Acquire` @ `0x00521570` — Allocates/refcounts the global `0x464` byte track-segment/race-progress manager at `g_pTrackSegmentProgressManager_006b21c0`; paired with constructor `FUN_004022f0` and shutdown helper `FUN_00402400`.
- `TrackSegmentProgressManager_FindNearestSegment` @ `0x004016f0` — Finds the nearest track segment for a point/query, falling back to recursive node search.
- `TrackSegmentProgressManager_FindNearestSegmentInNode` @ `0x00401780` — Recursive segment-tree search used to choose the best track segment candidate.
- `TrackSegmentProgressManager_AdvanceSegmentByDistance` @ `0x00405690` — Walks forward/backward across linked segments using a distance budget and returns the resulting segment.
- `TrackSegmentProgressManager_RebuildActivePlayerList` @ `0x00402490` — Rebuilds the active-player segment list each frame and updates per-segment occupancy/counts.
- `App_AcquireFontRegistry` @ `0x00521620` — Allocates or refcounts the font registry object; alloc size `0x144`, constructor `FUN_00451660`.
- `GameSettings_BuildCarLookupTable` @ `0x00456810` — Walks LiteDb `Data.Cars` / `Data.Upgrades` / `FlatOut2`, derives numeric car ids from `DataPath`, fills the `FlatOut2.Cars` lookup table, and then clears garage-related state.
- `g_pCarIdLookupTable_008e842c` @ `0x008e842c` — Process-global `0x430` byte car-id lookup table allocated by `App_InitializeCoreSystems`, filled by `GameSettings_BuildCarLookupTable`, and consumed by garage/car-loading code.
- `ScriptHost_LoadFontsBed` @ `0x004517c0` — Loads `data/global/Fonts/fonts.bed` via the script host and runs `AddAllFonts()` to register the declared fonts.
- `FreeALotOfMemory` @ `0x005211c0` — Main shutdown/teardown pass for the singletons acquired by `App_InitializeCoreSystems`.

### Key strings / config / content anchors

- `filesystem` @ `0x00677e2c` — First BFS archive list loaded by `WinMain`.
- `patch` @ `0x00677e24` — Second BFS archive list loaded by `WinMain`.
- `-binarydb` @ `0x00677df8`
- `-bedit` @ `0x00677df0`
- `setup` @ `0x00677e1c`
- `-setup` @ `0x00677e14`
- `4.09.00.0904` @ `0x00677e04` — DirectX version string passed to the startup version check.
- `data/Database/FlatOut2.db` @ `0x00671c68`
- `data/language/languages.dat` @ `0x0066ab68`
- `data/global/Fonts/fonts.bed` @ `0x0066beac`
- `data/menu/copyright.tga` @ `0x00677dc6`
- `data/menu/copyright_us.tga` @ `0x00677dde`

### Practical implications

- The executable uses a two-stage startup:
  - `WinMain` handles platform/runtime checks, archive-list loading, binary DB loading, and script-host creation.
  - `App_InitializeCoreSystems` acquires gameplay-facing global systems only after the window/setup phase succeeds.
- `LaunchWindow` is also the branch point for direct host/join command-line flows, so intro playback is not unconditional.
- Resource discovery is layered:
  - text archive lists (`filesystem`, `patch`)
  - process-global `BfsManager`
  - per-archive BFS descriptors
  - file access through the BFS/file abstraction
- `WinMain` also owns a normalized command-line table that is exported to Lua and reused later by `LaunchWindow`; host/join detection does not rescan the raw command line.
- If startup does not leave the BFS manager mounted, generic file lookup can fall back to raw filesystem access instead of archive-backed lookup.
- After LiteDb is loaded, startup also derives runtime lookup tables from DB content before proceeding, so bootstrap is doing real data shaping, not only object construction.
- Startup also seeds player reset timing thresholds and brings up the global track-segment/race-progress manager before normal race/menu runtime uses them.
- Startup-localized content is loaded very early: `languages.dat` is prepared before the window handoff, and `GameSettings` already classifies level entries by ruleset before menu/race runtime proceeds.
- `patch` is not just a generic script label; it is one of the two startup archive lists, and the same label is also passed into the script-host bootstrap path in `WinMain`.
- In the local repo inventory, `filesystembk` and `patchbk` are renamed backup copies created during unpacking; the binary still expects the original startup filenames `filesystem` and `patch`.
- Fonts are not hardcoded D3D resources. The game loads `data/global/Fonts/fonts.bed` into the root script environment and registers fonts from script data.
- The binary DB is a real compiled resource (`FlatOut2.db`) with a validated header/version and a dedicated LiteDb runtime blob, not a loose text database.

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
  - Confirmed 2026-04-14: steering bootstrap uses speed buckets `20/90/200/300` plus analog/digital min/max rates, centering, and steering-speed-rate tables before steer reaches the vehicle runtime.
- `FUN_00454c60` @ `0x00454c60` — Reads the larger car physics tree: differential, throttle/brake/speed curves, gearbox, suspension, tires, and engine.
- `FUN_0046c8e0` @ `0x0046c8e0` — Local-player per-frame control path: samples controller state, shapes steer/gas/brake/handbrake inputs, then calls the vehicle step.
- `Differential_SolveLeftRightWheelTorques` @ `0x004408d0` — Driven-axle left/right torque solver; key anchor for one-wheel spin and donut slip outcomes.
- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090` — Applies nonlinear driven torque scalar (`c*0.3 + c^3*0.7`) before differential split.
- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0` — Refreshes wheel-rate aggregate and gearbox recommendation/ratio terms each update; RPM↔wheel coupling anchor.
  - Confirmed 2026-05-01: writes `wheel + 0x31c = param_1 / (wheel + 0x30c)` across all wheels and updates aggregate candidate `vehicle + 0x3a4`; direct `+0x31c` was flat-zero in one validated runtime capture, so do not treat as guaranteed standalone wheel omega without path validation.
- `GearNode_AccumulateAngularVelocityAndTorque` @ `0x004416b0` — Accumulates child gear-node angular/torque terms into `node + 0x38/+0x3c` (scaled by `node + 0x20`); key anchor for drivetrain-side wheel-rate reconstruction probes.
- `0x0046f510` — Unnamed local-player steering/input shaping block recovered from disassembly; applies speed-bucket steering limits, analog centering, and final clamp before `FUN_0046fa50`.
- `FUN_0046fa50` @ `0x0046fa50` — Post-input drive helper: writes control channels into vehicle state and manages auto-shift / shift cooldown behavior.
- `AIPlayer_WriteVehicleControls` @ `0x00409520` — AI per-frame control writer; emits steer/throttle/brake/handbrake/gear requests into the same vehicle control channels used by the local player.
- `FUN_00429250` @ `0x00429250` — Vehicle input normalization step; clamps input channels and stores per-frame timing/velocity snapshots.
- `FUN_0042c650` @ `0x0042c650` — Main vehicle simulation entry traced here; clears step accumulators, resolves wheel contact state, then runs 100 fixed `0.01` substeps.
- `FUN_00429640` @ `0x00429640` — Chassis/drag/steering propagation stage within each vehicle substep.
- `FUN_00429be0` @ `0x00429be0` — Main wheel/tire force and yaw-torque accumulation stage within each substep.
  - Confirmed 2026-04-26 telemetry anchors: per-wheel runtime blocks start at `vehicle + 0x0a00` with stride `0x03a0`; contact flag is `wheel + 0x334`, contact pointer is `wheel + 0x348`, and the validated vertical-load/unload proxy is `wheel + 0x330`.
  - Confirmed 2026-05-01 runtime behavior: `wheel + 0x32c` behaves as a robust rotational phase signal; combined with `wheel + 0x320` (brake torque from `0x0042c540`) it cleanly exposes rear lock during handbrake.
- `FUN_00441ae0` @ `0x00441ae0` — Wheel steer-angle clamp stage after car-level steer input is computed.
  - Confirmed 2026-04-14: applies a second rack-side dynamic steer cap from live vehicle/runtime fields at `+0x300/+0x304/+0x370/+0x374`; final wheel steer is not determined by player input shaping alone.
- `FUN_00441f10` @ `0x00441f10` — Auto gear-selection helper based on projected forward speed and runtime threshold arrays at gearbox `+0x9c/+0xa0`; includes explicit reverse/neutral/launch cases.
  - Confirmed 2026-04-14 constants/units:
    - converts m/s-style projected speed to km/h with `FLOAT_0067dd6c = 3.6`
    - applies low-speed blend guard `FLOAT_0067dd70 = 1.15`
    - applies downshift hysteresis margin `FLOAT_0067dbe8 = 10.0`
  - Porting implication: native autobox selection is speed-threshold based with hysteresis and guard scaling, not pure RPM threshold logic.
- `FUN_00442160` @ `0x00442160` — Shift request/state-machine entry; validates requested gear in `[-1, numGears]`, writes requested gear to gearbox `+0x48`, and arms the timed shift state at `+0x4c/+0x50`.
- `FUN_004421d0` @ `0x004421d0` — Timed shift-state integrator; applies the requested gear once the engage window `+0xc0` is reached and returns to idle after the full engage+release window `+0xc0 + +0xbc`.
- `FUN_00441c40` @ `0x00441c40` — Gearbox handling loader; copies ratio/threshold data into runtime offsets `+0x5c..+0x98`, sets `numGears` at `+0x58`, and seeds clutch/auto-shift timing fields from loaded gearbox data.
- `FUN_0042b5f0` @ `0x0042b5f0` — Vehicle finalize-substep stage; calls `Gearbox_UpdateShiftStateAndOutputShaft` each finalize pass.
- `FUN_0046fc40` @ `0x0046fc40` — Local player control writer with confirmed vehicle-side gearbox/control offsets:
  - `vehicle+0x634` current/applied gear
  - `vehicle+0x63c` requested gear
  - `vehicle+0x638` shift state
  - `vehicle+0x64c` number of gears
  - `vehicle+0x5d8` engine-speed-like runtime scalar
  - `vehicle+0x648`, `vehicle+0x6e4` speed-related shift/reverse logic terms
- `FUN_00454b50` @ `0x00454b50` — Builds the runtime engine curve table from `PeakPower*`, `PeakTorque*`, `RedLineRpm`, `RpmLimit`, and `ZeroPowerRpm`.
- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090` — Driven-wheel torque distribution and differential dispatch stage.
  - Confirmed 2026-04-14 torque scalar:
    - nonlinear scale computed as `c*0.3 + c^3*0.7` (`FLOAT_0067dc14 = 0.3`, `FLOAT_0067dc60 = 0.7`)
    - result written to runtime fields `+0x1a8` and `+0x1aa` before differential left/right solve
  - Porting implication: replacing this with a linear throttle-only force mapping will under-match native launch and traction behavior.
- Porting note 2026-04-14: the live Rapier wrapper must not replace this with a torque-only surrogate; wheel-radius parity also matters because auto-shift/runtime RPM tracking depends on driven-wheel rate state.

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

### Track / Dynamic-Object collision anchors

- `DynamicObject_InitializeFromLua` @ `0x00590fd0` — Data-driven dynamic object bootstrap; reads `Mass`, `Restitution`, `CollisionSound`, `WakeupVelocity`, `ReactivationVelocity`, `DamageThreshold`, `AeroDragForce`, `BonusType`, `Category`, `Inertia`, `ExplosionForce`, `DestroyFx`, `EmitterFx`, and optional `RotateX/Y/Z`.
- `DynamicObject_InstantiateLinkedProxyByName` @ `0x00597320` — Instantiates linked runtime proxy/effect objects from the global object-template table and links them under the parent dynamic object.
- `DynamicObject_RegisterIntoEnvironmentActivationLists` @ `0x00565c40` — Registers dynamic objects into environment activation bookkeeping.
- `DynamicObject_RegisterIntoEnvironmentLiveSet` @ `0x00565d50` — Registers dynamic objects into the environment live-set / linked-list bookkeeping when they transition live.
- `StuntWorld_InitializeDynamicPropsAndRagdollMap` @ `0x004839b0` — Separate stunt-prop bootstrap and name-map path; confirms prop-side runtime state is not folded into static track collision.
- `"%sgeometry/track_bvh.gen"` @ `0x0067bcdc` — Stable string anchor for authored static-track BVH content.
- `"geometry/track_cdb2.gen"` @ `0x0067bca8` — Stable string anchor for authored collision-side companion data.
- `"%sgeometry/track_geom.w32"` @ `0x0067cef0` — Stable string anchor for authored track geometry content.

### Track / Dynamic-Object practical implications

- The shipped track content is split across authored geometry (`track_geom.w32`) and authored collision-side files (`track_bvh.gen`, `track_cdb2.gen`); this is not a single undifferentiated render mesh path.
- Dynamic roadside props are a separate runtime subsystem with activation-list and live-set bookkeeping, not just extra triangles appended to the static collision world.
- Porting implication: do not eagerly instantiate the full authored prop roster as globally live physics objects at load time on heavy tracks like City; that collapses a staged native lifecycle into an always-live runtime cost.

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
- `CameraTracker_ApplyViewTransform` @ `0x004d71d0` — Shared tracker-to-camera handoff; consumes explicit camera + target points and rebuilds the final world-up look-at basis for the live `BCORE_Camera2`.
- `CarCameraTracker_Update` @ `0x004d7910` — Normal driving tracker update; smooths heading/yaw and vertical response from `Data.Camera.CarCameraTracker`, then applies separate roll/shake work. Do not model this as direct full chassis quaternion inheritance.
- `CarCameraTracker_ResetPitchAndHeightState` @ `0x004d7890` — Clears the chase tracker’s internal pitch/height spring state.
- `CameraManager_RegisterFixedHeadConfig` @ `0x004cffb0` — Registers `Data.Camera.FixedHead`.
- `FixedHeadCameraTracker_Update` @ `0x004d7520` — Fixed-head / hood-like tracker update path.
- `CarCameraTracker_UpdateGroundCollisionOffset` @ `0x004d8080` — Driving-camera collision helper; queries ground clearance at the desired camera position and shortens the target-to-camera offset against the environment with a collision buffer.
- `CameraDamageShake_Update` @ `0x004d8320` — Separate damage-shake layer called after the driving tracker update.
- `CameraManager_RegisterStuntTrackerConfig` @ `0x004db660` — Registers `Data.Camera.StuntCameraTracker`.
- `CameraManager_RegisterGoalCameraConfig` @ `0x004d9100` — Registers `Data.Camera.GoalCameraBasketball`, `GoalCameraTargets`, and `GoalCameraLocations`.
- `CameraManager_RegisterGoalCameraDelayConfig` @ `0x0047e120` — Registers `Data.Camera.GoalCameraDelay`.

### Live runtime pointers

- `g_pCameraManager_008e8424` @ `0x008e8424` — Confirmed live gameplay camera-manager global. `UpdateCamera` advances tracker state through this root, and race render/audio code resolves active view cameras from its entry array at `manager+0x4`.
- `RenderRace` @ `0x00479200` — Pulls the live race camera from the manager entry list. For the first local view it reads `*(int *)(*(int *)g_pCameraManager_008e8424->field1_0x4 + 4) + 0x20`, then passes that camera-node block into race rendering and audio-listener setup.
- `FUN_004721c0` @ `0x004721c0` — Race audio/listener helper that reads the same active camera-node block as `RenderRace`; confirms camera forward at `cameraNode+0x60` and position at `cameraNode+0x70`.
- Active race camera family is recoverable from the manager entry's `+0x4` tracker-object vtable. Confirmed family signatures: car `PTR_LAB_006743d8`, fixed-head `PTR_GoalCameraClipOwnerE_Destructor_00674098`, stunt `PTR_GoalCameraClipFrameInterval_Destructor_006748cc`, goal `PTR_LAB_006744e4`, crash `JMPTABLE_CrashCameraTracker_00674340`.
- `GoalCameraTracker_GoalViewCamera_Update` @ `0x004d9840` confirms runtime camera object fields: `+0x10` active profile/script object, `+0x14` player, `+0x18` source camera node, `+0x1c` target camera node, `+0x20` owned output camera node, `+0x351` dirty/update flag, `+0x360` runtime seconds, `+0x370` active clip instance.
- `GoalCameraTracker_GoalViewCamera_SelectActiveClip` @ `0x004d9a60` selects active profiles from area-specific manager lists or from the player camera profile pointer list at `player+0x10..player+0x14`, then stores the chosen profile at `this+0x10`.
- `GoalCameraTracker_GoalViewCamera_InstantiateActiveClip` @ `0x004d9cf0` calls the active profile vtable `+0x10` constructor, stores the created clip at `this+0x370`, and applies it into `this+0x20` using source/target nodes from `this+0x18/+0x1c`.

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
- The normal chase path is built from a target point plus a target-to-camera offset. The collision helper shortens that offset against the environment instead of replacing the camera with a generic spring-follow orbit.
- Fixed-head / hood / cockpit views bypass the normal world-up chase handoff and write a transformed local basis directly, so they should not be ported as small-offset variants of the chase camera.

---

## Race / Session State Machine

Source of truth notes:
- `ghidra_findings/RACE_SESSION_STATE_MACHINE_FINDINGS_2026-04-03.md:1`

### Core anchors

- `SessionClass_CreateSession` @ `0x004f0020` — Lua-facing create-session wrapper; calls the real session vtable slot `2` and returns a boolean result.
- `SessionClass_DeleteSession` @ `0x004f1720` — Lua-facing delete-session wrapper; calls the real session vtable slot `3`.
- `SessionClass_JoinSession` @ `0x004f1760` — Lua-facing join-session wrapper; parses the script-side session identifier block and forwards it into the lower-level session join helper `FUN_004ee950`.
- `SessionClass_Update` @ `0x004f1800` — Lua-facing session update wrapper; calls the real session vtable slot `6` and returns a boolean.
- `SessionClass_StartRace` @ `0x004f18b0` — Lua-facing start-race wrapper; calls the real session vtable slot `7`.
- `SessionClass_GetRaceStarted` @ `0x004f18f0` — Reads the race-start bit directly from `SessionClass + 0x216c` (bit `0x8`).
- `SessionClass_GetProgress` @ `0x004f1c80` — Maps the underlying session progress enum to Lua globals `IDLE`, `CREATING`, `DELETING`, `JOINING`, `FAILED`, `STARTING`, `SUCCESS`, and `NET_ERROR`.
- `SessionClass_IsHost` @ `0x004f1da0` — Reads host bit `0x1` from `SessionClass + 0x216c`.
- `SessionClass_RefreshPoints` @ `0x004f1f50` — Lua-facing wrapper over session vtable slot `14`.
- `SessionClass_GetInfo` @ `0x004f20c0` — Returns a userdata wrapper around the session/session-list descriptor object from `FUN_0050dc70()`.
- `SessionClass_Disconnect` @ `0x004f2450` — Lua-facing disconnect wrapper.
- `SessionClass_HasSessionChanged` @ `0x004f24c0` — Reads and clears session-changed bit `0x80` from `SessionClass + 0x216c`.
- `SessionClass_HasClassCarChanged` @ `0x004f2520` — Reads and clears class/car-changed bit `0x1` from `SessionClass + 0x216d`.
- `SessionClass_NextRaceUpdated` @ `0x004f2580` — Reads next-race-updated bit `0x20` from `SessionClass + 0x216c`.
- `SessionClass_JoinSessionFromCommandLine` @ `0x004f4270` — Lua-facing command-line join wrapper; calls session vtable slot `4`.
- `ClearRaceForReal` @ `0x0045e3c0` — Clears the live `GameSettings` race block before the next race/session load.
- `LoadRaceInfo` @ `0x0045e620` — Loads the live `GameSettings` race descriptor from script-global `Levels[levelID]`, with override support for rules and derby type.
- `CupManager_Init` @ `0x00462a30` — Allocates/refcounts the process-global `CupManager` (`0x5b8` bytes).
- `CupManager_CupManager` @ `0x00456ff0` — Installs the cup manager vtable, clears the cup state, and exposes `CupManager` to Lua.
- `ClearCupForReal` @ `0x00457130` — Clears all runtime cup race entries and resets the cup points table.
- `CupManager_PrepareFromScriptForReal` @ `0x00457250` — Materializes script-global `Races[]` plus referenced `Levels[]` into the runtime cup race list.
- `SessionClass_RequestJoinSessionFromCommandLine` @ `0x004ee950` — Sets progress to `JOINING`, clears race-start state, builds the command-line join payloads, and queues the network join request.
- `SessionClass_BuildJoinAddressListFromCommandLine` @ `0x005024e0` — Collects `-public_addr`/`-private_addr` or local adapter addresses into the join-address payload.
- `SessionClass_BuildJoinPasswordPayloadFromCommandLine` @ `0x00502740` — Parses `-password` and `-join` into the serialized command-line join payload.
- `Network_GetPrimaryAdapterMacAddress` @ `0x00502940` — Returns the preferred adapter MAC-like identifier used by the join path.
- `Network_QueueSessionJoinRequest` @ `0x004e4950` — Stores and queues a session join request under the protected network worker queue.
- `SavePlayerProfile` @ `0x00465870` — Lua-facing save request; pushes `GameSettings.m_nSaveFlowState_0x434` into `SAVEFLOW_SAVEPLAYERPROFILE`.
- `SavePlayerDataForReal` @ `0x004637e0` — Writes the large player/profile block through `SaveDevice` and updates `GameSettings.m_nSaveStatus_0x44c`.

### Practical implications

- Session create/join/start/delete are real state-machine transitions, not one boolean "online/offline" switch.
- The session object exposes stable flag bits for host state, race started, next-race-updated, session changed, and class/car changed.
- `CupManager` owns the scripted race-series/runtime schedule, while `GameSettings` owns the currently loaded race descriptor.
- Command-line join is a real network/session branch that serializes endpoint/password/local-address identity and queues a join request.
- Profile persistence is mediated by the `GameSettings` save-flow state machine rather than written directly from UI/session Lua calls.

---

## Input / Keyboard / Controller Bootstrap

Source of truth notes:
- `ghidra_findings/INPUT_SYSTEM_FINDINGS_2026-04-03.md:1`

### Core anchors

- `FUN_0054ff10` @ `0x0054ff10` — Input/controller host bootstrap. Allocates the `Keyboard` controller first, then allocates the larger input-device manager at `0x5098` bytes, and conditionally creates up to two `GameController` instances from the discovered non-keyboard devices.
- `InputDeviceManager_Initialize` @ `0x0055b240` — Input-device bootstrap: calls the DirectInput loader, initializes five device slots, clears runtime device state, probes non-keyboard controllers, and precomputes a 0x168-entry sine table used by later input processing.
- `LoadDInputLibrary` @ `0x00561270` — Loads `dinput8.dll`, resolves `DirectInput8Create`, and creates the process-global DirectInput8 interface in `App_008da71c`.
- `DirectInput_ResetEnumeratedDevices` @ `0x005611a0` — Clears the global two-device DirectInput enumeration results, type flags, cached product-name strings, and manager-owned capability/state blocks used by the later controller-open path.
- `InputDeviceManager_EnumerateAttachedControllers` @ `0x005612c0` — Enumerates attached `DI8DEVCLASS_GAMECTRL` devices, stores up to two `IDirectInputDevice8` handles and cached capability data, and mirrors the discovered device-type flags into the manager at `+0x2448..+0x245d`.
- `DirectInput_EnumAttachedControllerCallback` @ `0x005613b0` — EnumDevices callback; captures product names, GUID fields, simple type flags, and creates one `IDirectInputDevice8` interface for each of the first two attached controllers.
- `InputDeviceManager_ConfigureAttachedControllers` @ `0x00561510` — Applies `SetDataFormat`, `SetProperty`, and `SetCooperativeLevel(hwnd, 5)` to each enumerated controller device before the deeper polling/open logic.
- `InputDeviceManager_CreatePeriodicEffectSlot` @ `0x00562160` — Creates one periodic DirectInput effect with a `0x10`-byte `DIPERIODIC` payload plus a `0x14`-byte `DIENVELOPE`; used for `GUID_Square`, `GUID_Sine`, `GUID_Triangle`, `GUID_SawtoothUp`, and `GUID_SawtoothDown`.
- `InputDeviceManager_UpdatePeriodicEffectSlot` @ `0x00562310` — Updates an existing periodic DirectInput effect with the same `DIPERIODIC` + `DIENVELOPE` payload shapes.
- `InputDeviceManager_OpenEnumeratedControllers` @ `0x0055b3e0` — Opens/binds up to two enumerated non-keyboard controllers into the manager slots at `+0x4674` and `+0x4678`.
- `InputDeviceManager_PollEnumeratedControllerState` @ `0x00561610` — Polls one attached DirectInput device, acquires it as needed, snapshots the previous `0x110`-byte state block, refreshes the current state with `GetDeviceState`, and toggles force-feedback actuators with `SendForceFeedbackCommand(0x10/0x20)` based on per-controller flags near `+0x2680/+0x2682`.
- `InputDeviceManager_PollControllers` @ `0x0055b490` — Per-frame low-level controller poll/update; refreshes the live controller state snapshots used by the higher-level `GameController` binding logic.
- `InputDeviceManager_ClearDeviceSlot` @ `0x00561950` — Zeros one 0x50-byte low-level device-slot block; called five times for the slot regions at `+0x48a8..+0x49e8`.
- `InputDeviceManager_IsEffectSlotPlaying` @ `0x00561a40` — Queries whether one controller force-feedback/effect slot is currently active/playing.
- `InputDeviceManager_StartEffectSlot` @ `0x00561980` — Starts one created controller effect slot and marks it active.
- `InputDeviceManager_StopEffectSlot` @ `0x00561a00` — Stops/releases one controller effect slot and clears the slot pointer/active flag.
- `InputDeviceManager_CreateEffectSlot` @ `0x00561b80` — Creates a condition effect (`GUID_Damper` / `GUID_Spring`) using one or more `0x18`-byte `DICONDITION` blocks.
- `InputDeviceManager_UpdateEffectSlot` @ `0x00561d50` — Updates an already-created condition effect using the same `DICONDITION` block layout.
- `InputDeviceManager_ReleaseDeviceSlotInterfaces` @ `0x00561b40` — Releases one `2 x 8` block of COM-style interfaces stored inside a low-level device-slot block.
- `InputDeviceManager_ShutdownDirectInput` @ `0x00561800` — Releases the two enumerated controller devices, releases the process-global `IDirectInput8`, and frees `dinput8.dll`.
- `InputDeviceManager_Shutdown` @ `0x0055b2b0` — High-level low-level-input teardown; releases all five low-level slot blocks and then tears down the DirectInput loader/device state.
- `InputDeviceManager_RequestEffectSlot0` @ `0x0055b890` — Higher-level request/update wrapper for effect slot 0.
- `InputDeviceManager_RequestEffectSlot1Directional` @ `0x0055bd20` — Higher-level request/update wrapper for effect slot 1 that uses `GUID_Damper`; reused by the deferred effect replay path.
- `InputDeviceManager_RequestEffectSlot1TimedStrength` @ `0x0055bf10` — Timed-accumulator request/update wrapper for effect slot 1.
- `InputDeviceManager_RequestEffectSlot1` @ `0x0055c130` — Direct-strength request/update wrapper for effect slot 1.
- `InputDeviceManager_RequestEffectSlot2` @ `0x0055c310` — Direct-strength request/update wrapper for effect slot 2.
- `InputDeviceManager_RequestEffectSlot2Signed` @ `0x0055c4f0` — Signed-strength request/update wrapper for effect slot 2.
- `InputDeviceManager_RequestEffectSlot3Typed` @ `0x0055c7e0` — Typed request/update wrapper for effect slot 3; maps effect type ids 0..4 to `GUID_Sine`, `GUID_Square`, `GUID_Triangle`, `GUID_SawtoothUp`, and `GUID_SawtoothDown`.
- `FUN_0055b4e0` @ `0x0055b4e0` — Force-feedback maintenance/replay dispatcher; stops conflicting slots, replays deferred requests from cached manager fields, and clears the per-controller deferred-effect flags at `+0x4a3c..+0x4a44`.
- `GameController_GameController` @ `0x0055d090` — GameController constructor; stores the owning manager/index, classifies the controller type from manager flags, and marks Microsoft SideWinder Force hardware specially at `+0x8e8`.
- `GameController_ApplyControlSettings` @ `0x0055d310` — Applies the CFG-backed controller settings to a GameController; confirms `+0x134 = sensitivity`, `+0x138 = deadzone`, and `+0x13c = saturation`.
- `GameController_BuildSensitivityCurve` @ `0x00561780` — Builds the 1023-entry controller response curve table used after sensitivity changes.
- `GameController_ApplyDeadzoneProperty` @ `0x005618e0` — Applies the controller deadzone property to the active DirectInput device; caller passes `ControllerDeadzone * 10`.
- `GameController_UpdateConnectedState` @ `0x0055d3b0` — High-level per-frame state refresh for connected controllers; drives later analog/force-feedback update methods.
- `GameController_ClearForceFeedbackState` @ `0x0055d460` — Clears the controller-local force-feedback bookkeeping block at `+0x8d4..+0x8e4`.
- `GameController_UpdateAnalogActionLatches` @ `0x0055d480` — Refreshes the paired analog latch arrays at `+0x8c0` and `+0x8d4` for bindings whose mode is `1`.
- `GameController_AutoMapDeviceObjects` @ `0x0055e190` — Auto-maps device objects to the 13 gameplay actions and confirms the combined-axis blocks used by `Steer` and `Accelerate/Brake`.
- `InputController_BeginBindingCapture` @ `0x0055ad10` — Stores the selected action index into `+0x784` to begin a binding-capture session.
- `Keyboard_CaptureBindingForSelectedAction` @ `0x0055ad20` — Keyboard-side binding capture; writes a mode-0 keyboard binding for the selected action and then clears the capture state.
- `InputController_SetSensitivity` @ `0x0055ade0` / `InputController_GetSensitivity` @ `0x0055adf0` — Accessors for the controller sensitivity field at `+0x134`.
- `InputController_SetDeadzone` @ `0x0055adc0` / `InputController_GetDeadzone` @ `0x0055add0` — Accessors for the controller deadzone field at `+0x138`.
- `InputController_SetSaturation` @ `0x0055ada0` / `InputController_GetSaturation` @ `0x0055adb0` — Accessors for the controller saturation field at `+0x13c`.
- `GameController_CancelBindingCapture` @ `0x0055e6f0` — Cancels the active binding-capture session by resetting the selected-action field at `+0x784` to `-1`.
- `GameController_CaptureBindingForSelectedAction` @ `0x0055e700` — Captures a new keyboard or DirectInput binding for the currently selected action.
- `Keyboard_Keyboard` @ `0x0055a710` — Keyboard controller constructor; installs the keyboard vtable and default controller metadata after the shared field init routine.
- `Keyboard_InstallHook` @ `0x0055a7d0` — Installs a thread-local `WH_KEYBOARD` hook, clears the keyboard state tables, captures the current keyboard layout, and marks the keyboard device as active.
- `Keyboard_HookProc` @ `0x0055aad0` — `WH_KEYBOARD` callback; updates key-down state, press counters, and forwards translated text input into the virtual keyboard queue when text input is enabled.
- `Keyboard_IsHookInstalled` @ `0x0055ae10` — Returns whether the keyboard controller is currently active via field `+0x130`.
- `GetKeyboardKeyState` @ `0x0055a9c0` — Action-to-key lookup helper: reads the mapped virtual-key code from `Keyboard+0x648` and returns the current high-bit pressed state from `g_keyboardKeyDownState`.
- `GetKeyboardKeyState2` @ `0x0055a9f0` — Action-to-key press-count lookup helper: returns the per-key counter from `g_keyboardKeyPressCount`.
- `GameController_GetActionPressCount` @ `0x0055d600` — Per-action trigger/press-count helper; keyboard mode reads `g_keyboardKeyPressCount`, latched analog mode reads `+0x8d4`, and DirectInput mode detects snapshot edges.
- `GameController_IsActionPressed` @ `0x0055d530` — Digital action state helper; combines keyboard VK state, a latched per-action state byte, or DirectInput state bytes depending on the binding mode at `+0x64c`.
- `GameController_ReadBindingValue` @ `0x0055ea50` — Raw binding-value helper; mode `0` reads keyboard state, mode `1` computes a signed digital axis from two stored shorts, and mode `2` reads a signed byte from the active DirectInput state buffer.
- `GameController_ReadAccelerateBrakeSecondaryScaledBinding` @ `0x0055d7e0` — Reads the secondary half of the `Accelerate/Brake` combined-axis block at `+0x6e8..+0x702`.
- `GameController_ReadAccelerateBrakePrimaryScaledBinding` @ `0x0055d880` — Reads the primary half of the `Accelerate/Brake` combined-axis block at `+0x6e8..+0x702`.
- `GameController_ReadSteerCombinedScaledBindings` @ `0x0055d920` — Combines one or two scaled steering bindings under mode flags at `+0x70c` and `+0x71c`; uses the controller saturation/response factor at `+0x13c`.
- `GameController_GetActionPressCountIncludingAlias` @ `0x0055d6e0` — Returns the OR-combined action press count for the requested action plus any linked alias action stored in the per-action alias tables at `+0x78c`.
- `GameController_IsActionPressedIncludingAlias` @ `0x0055d760` — Returns the OR-combined pressed state for the requested action plus any linked alias action stored in the per-action alias tables at `+0x78c`.
- `GameController_ReadCombinedAxisPreviewValue` @ `0x0055daf0` — UI/helper path that reads one of the combined-axis preview values for `Steer` / `Accelerate` / `Brake` and reports whether the chosen half is currently using scaled mode `1`.
- `GameController_SetForceFeedbackGain` @ `0x0055dc10` — Applies a clamped `0..100` force-feedback gain to the active DirectInput device via property id `7` (`DIPROP_FFGAIN`).
- `GameController_SetAutoCenterEnabled` @ `0x0055dc40` — Updates the active DirectInput device auto-center property and caches the enable flag in the manager bytes near `+0x2682`.
- `GameController_RequestSpringForceFeedback` @ `0x0055dc70` — High-level wrapper around `InputDeviceManager_RequestEffectSlot0`; gated by `+0x8bc`.
- `GameController_StopSpringForceFeedback` @ `0x0055dca0` — High-level stop/release wrapper for the spring effect path.
- `GameController_RequestPeriodicForceFeedbackByAngle` @ `0x0055dcd0` — Uses the manager sine table at `+0x4a50` to scale a periodic request before dispatch.
- `GameController_RequestDamperForceFeedback` @ `0x0055dd20` — High-level wrapper around `InputDeviceManager_RequestEffectSlot1Directional`.
- `GameController_DeferAndStopActiveForceFeedback` @ `0x0055dd50` — Stops active effects, sets deferred replay flags at `+0x4a3c..+0x4a44`, and marks the replay latch at `+0x2220`.
- `GameController_RequestTimedPulseForceFeedback` @ `0x0055dd70` — High-level wrapper around `InputDeviceManager_RequestEffectSlot1TimedStrength`.
- `GameController_RequestTypedForceFeedback` @ `0x0055dda0` — High-level typed force-feedback dispatcher over the slot 1/2/3 request helpers.
- `GameController_ReplayDeferredForceFeedback` @ `0x0055dfb0` — Re-enters the manager replay/maintenance dispatcher after a deferred stop.
- `GameController_StopTypedForceFeedback` @ `0x0055dfd0` — Stops the typed periodic effect path when the active slot is playing.
- `GameController_ReplayDeferredForceFeedbackSlot2` @ `0x0055e020` — Requests replay of deferred slot-2 effects through the manager replay path.
- `GameController_ReplayDeferredForceFeedbackAll` @ `0x0055e060` — Replays the slot 3, slot 1, and slot 2 deferred force-feedback requests in order.
- `GameController_StopTypedForceFeedbackSlot0` @ `0x0055e120` — Stops the slot-0 typed force-feedback path when active.
- `GameController_GetControllerTypeId` @ `0x0055e160` — Returns the cached controller-type byte from the manager product/type block at `+0x2220`.
- `GameController_IsMicrosoftSideWinderForce` @ `0x0055e180` — Returns the constructor-detected SideWinder Force flag at `+0x8e8`.
- `GameController_BeginBindingCapture` @ `0x0055e6a0` — Polls the current DirectInput state, snapshots the `0x110`-byte state buffer into `+0x7a8`, stores the selected action into `+0x784`, and clears the analog-capture latch at `+0x8b8`.
- `VirtualKeyboard_ProcessKeyQueueForReal` @ `0x0052be00` — Consumes the pending text-input ring buffer and applies Backspace/Enter/Escape/arrow-key behavior before dispatching characters into the active virtual keyboard widget.
- `VirtualKeyboard_DeletingDestructor` @ `0x0052b8a0` — Destructor wrapper that calls the real virtual-keyboard destructor and conditionally frees the object.
- `VirtualKeyboard_Destruct` @ `0x0052b8c0` — Tears down the virtual-keyboard state, resets global controller-related pointers, clears widget-owned string buffers, and hands off to the base UI destructor.
- `VirtualKeyboard_OnChildAttached` @ `0x0052b950` — Tracks a child widget of type `6` in the cached pointer at `+0x550`.
- `VirtualKeyboard_OnChildDetached` @ `0x0052b970` — Clears the cached child-widget pointer at `+0x550` when that child is removed.
- `VirtualKeyboard_CanProcessInput` @ `0x0052bda0` — Gate used before processing queued key input; may call `FUN_0052c080` when `+0x518 == 0`.
- `VirtualKeyboard_AlwaysAcceptsCommand` @ `0x0052bdc0` — Trivial virtual returning `1`.
- `VirtualKeyboard_HandleWidgetCommand` @ `0x0052bdd0` — Passes a widget command through the `0x53c380` / `0x52c890` / `0x53c460` chain.

### Key globals / strings

- `g_keyboardKeyDownState` @ `0x008d7e60` — 256-byte per-VK down/high-bit table maintained by `Keyboard_HookProc`.
- `g_keyboardKeyPressCount` @ `0x008d7d60` — 256-byte per-VK press-count table incremented on key-down transitions.
- `g_keyboardLayoutHandle` @ `0x008d7c44` — Cached result of `GetKeyboardLayout(0)` captured when the hook is installed.
- `KeyboardController::Unable to hook keyboard` @ `0x0067b8f4`
- `dinput8.dll` — loaded by `LoadDInputLibrary`
- `DirectInput8Create` — resolved by `LoadDInputLibrary`

### Practical implications

- Keyboard input is not polled from a window-message pump. The game installs a thread-local Windows keyboard hook and keeps its own 256-byte state tables.
- Text input for menus/UI is layered on top of the same hook path, not a separate IME-only path. `Keyboard_HookProc` translates keys with `ToUnicode` and `ToAscii` and pushes them into a controller-owned ring buffer consumed by `VirtualKeyboard_ProcessKeyQueueForReal`.
- The shared action-binding layer already abstracts over keyboard and DirectInput sources. Porting should preserve that binding-mode split instead of hardcoding keyboard-only action reads.
- The controller bootstrap path is split cleanly enough to continue: `FUN_0054ff10` creates high-level controller objects, while `InputDeviceManager_Initialize` owns DirectInput bring-up and low-level device discovery/state tables.
- The DirectInput bring-up is now confirmed as a staged path:
  - reset enumeration globals
  - enumerate/create up to two attached controller devices
  - configure each device with data format/property/cooperative-level
  - only then enter the deeper polling/open path
- The low-level input manager also owns a four-slot controller force-feedback/effect layer. Input is not only keyboard state plus button polling.
- A minimal source-side landing for this recovered bootstrap exists in:
  - `reference/FlatOut-2-decomp-main/source/decomp2/decomp2/InputSystem.h`
  - `reference/FlatOut-2-decomp-main/source/decomp2/decomp2/InputSystem.cpp`

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

---

## Renderer / Lighting / Image Composition

Source of truth notes:
- `ghidra_findings/RENDERER_LIGHTING_FINDINGS_2026-04-03.md:1`

### Core anchors

- `Render` @ `0x0045f3f0` — Main per-frame render dispatcher. Handles frame begin/end work, routes to `RenderMenu` or `RenderRace`, and runs screen present/overlay helpers around the active session renderer.
- `RenderRace` @ `0x00479200` — Main race visual render path. Computes per-view FOV-like scale values, configures screen state, renders local-player race views, and finishes through HUD/output helpers.
- `RaceScene_RenderViewsAndPostProcess` @ `0x004c9dc0` — Main race-scene visual pass driver for all active views. Updates per-view camera/frustum/FOV data, applies environment parameters, renders sky, executes ordered scene pass families, and finishes through the screen post-process/output path.
- `MenuScene_InitializeEnvironmentAndCamera` @ `0x004ab9f0` — Menu-scene visual bootstrap. Allocates the shared `BVisual_Environment`, camera, and large render helpers, stores the environment into `App_008da71c.pEnvironment_0x3c`, loads initial visual/menu content, seeds menu car poses, and loads shared menu car textures including `data/cars/shared/menu_car_shadow.tga`.
- `MenuInterface_UpdateMenuCarTransform` @ `0x004ac680` — Menu car per-frame transform update. Uses `gui+0x5b4` as the yaw angle, applies a Y-axis rotation matrix multiplied by the selected pose matrix at `gui+0x510`, and advances automatic rotation by `dtSeconds * 0.104719758` radians when `gui+0x590` is enabled.
- `MenuCar_OpenBgmFileForLoad` @ `0x004a44a0` — Opens compact menu display meshes from `data/menu/cars/menucar_%i.bgm`.
- `MenuCar_RequestLoadById` @ `0x004acb90` — Lua-facing menu car load request path; checks `data/menu/cars/menucar_%i.bgm` and drives the menu car state machine.
- `MenuCar_SetPoseIndex` @ `0x004acae0` — Copies one 0x70-byte menu car pose record into the active pose fields when the menu car is idle; otherwise queues the pose index.
- `LoadCarTexture` @ `0x004a45f0` — Menu car skin texture loader; opens `data/menu/cars/car_%i/skin%i.dds` for the selected skin.
- `Screen_Screen` @ `0x005a5530` — Constructor for the main screen/renderer wrapper; installs vtable `0x0067d560`, initializes renderer-owned lists/state, and clears the post-process group pointer at `this+0x488`.
- `CreatePostProcessShaders` @ `0x005ad780` — Lazy owner for the post-process shader group; allocates `0x210` bytes and calls `PostProcessShader_PostProcessShader`.
- `Environment_Environment` @ `0x00575840` — Constructor for the shared `BVisual_Environment`; initializes `0x1eb0` bytes of atmosphere, flare, bloom, filter, and sky-related state with default values consumed later by race rendering.
- `Screen_SetTextureSamplingProfile` @ `0x005aa7a0` — Applies one of several texture-sampling profiles to the D3D device. Used by race rendering, sky rendering, and fullscreen post-process passes to switch sampler/address/filter modes.
- `Screen_GetTextureSamplingProfile` @ `0x005aa730` — Returns one cached screen-managed sampler/filter profile value by id.
- `Screen_InitializeD3DRenderState` @ `0x005a6320` — Initializes/restores core D3D device state after create/reset and reapplies screen-managed sampler profiles 5/6/7.
- `Screen_CreateD3DDevice` @ `0x005a6a50` — Creates the main D3D device for the screen wrapper and immediately calls `Screen_InitializeD3DRenderState` on success.
- `CreateD3DWindow` @ `0x005a59d0` — Creates the render window and D3D device, initializes the default world/view/projection globals, and drives several hot `Screen` helpers. Strong call-shape inferences: slot `12` applies a per-view viewport rectangle, slot `15` clears scene buffers, slot `37` seeds fullscreen post/tone constants, and slot `40` stores the initial screen scalar (`1.1f`).
- `Screen_BeginScene` @ `0x005aac20` — Per-frame screen begin-scene helper; calls the D3D device begin-scene path, resets frame-local renderer globals, stores the caller-provided frame/time value, and marks projection/view state dirty.
- `Screen_CaptureViewportState` @ `0x005aad40` — Captures viewport-like screen state from the D3D device into globals used by later scene/fullscreen helpers.
- `Screen_UpdateProjectionMatrix` @ `0x005a7130` — Rebuilds and uploads the global projection matrix from active frustum/view parameters, then caches depth coefficients used elsewhere in the renderer.
- `Screen_CaptureProjectionMatrixOncePerFrame` @ `0x005ab480` — Once-per-frame projection-matrix capture helper used during race rendering; reads the current device projection into `g_ProjectionMatrix_008e5f40`.
- `Screen_CompileShader` @ `0x005ac250` — Screen-level shader compile/cache entry point. Loads shader source through BFS or loose-file fallback, calls `D3DXCreateEffect`, reuses cached `(family, filename)` shader pairs, and instantiates `Default`, `Dynamic`, `CustomColor`, `Skinned`, and `Water` shader subclasses.
- `Shader_Shader` @ `0x005acbd0` — Base shader constructor. Captures effect handles for `Tex0..Tex3`, cubemap, `dFac`, and `vDiff`, derives capability flags, and creates the matching input declaration/stride pair from the effect's declared input stream.
- `Screen_SetShadowVertexShaderConstants` @ `0x005aba00` — Uploads one four-float shadow constant vector to vertex shader constant register `22`.
- `Shader_ApplyShadowConstants` @ `0x005ace80` — Rebuilds and reapplies the same shadow constant vector for one shader/material path, updating both the device register and the effect-side constant.
- `WaterShader_WaterShader` @ `0x005b1740` — Water-material shader specialization. Checks `data/global/water/water.bed`; if it is missing, seeds the default global water tuning block.
- `Environment_ApplyVisualParametersToScreen` @ `0x005920b0` — Pushes atmosphere/environment visual settings into the screen renderer: sun/ambient/specular colours and intensities, overbright cap, global add/sub colour-filter terms, luminance filter intensities, and per-view bloom parameters.
- `Environment_RenderSky` @ `0x00592470` — Sky render path; updates linked flare/sky objects, applies sky-dome offset-related values, switches screen sampling profiles, and issues the sky draw through screen vtable slot `+44`.
- `Screen_ExecutePostProcessChain` @ `0x005aa390` — Full-frame post-process execution: optional colour-filter LUT stage, bloom extraction/downsample, subtractive combine, optional copy, radial-blur loop, final `post_mask` composite, and optional debug/show output.

### Practical implications

- The visual frame path is now coherent at a subsystem level:
  - `Render` -> `RenderRace`
  - `RaceScene_RenderViewsAndPostProcess`
  - race view/screen setup
  - environment parameter application
  - sky draw
  - fullscreen post-process chain
- Screen state management is centralized through the `Screen` wrapper and its vtable, not spread as raw D3D calls everywhere.
- The `Screen` vtable now has a partially confirmed slot map:
  - slot `7` = `Screen_DestroyWindow`
  - slot `9` = `Screen_GetAspectRatio`
  - slot `10` = `Screen_SetAspectRatio`
  - slot `12` = viewport-rectangle apply helper
  - slot `15` = scene-buffer clear helper
  - slot `16` = `Screen_BeginScene`
  - slot `17` = `Screen_EndScene`
  - slot `19` = `Screen_CaptureProjectionMatrixOncePerFrame`
  - slot `20` = `Screen_CaptureViewportState`
  - slot `25` = `Screen_GetTextureSizeFromQuality`
  - slot `26` = `Screen_SetTextureSamplingProfile`
  - slot `37` = post/tone constant setup helper
  - slot `40` = screen scalar setup helper
  - slot `44` = `Screen_UpdateProjectionMatrix`
  - slot `65` = texture-load helper for `radialblur.tga`
  - slot `72` = render-target/resource creation helper used by the post-process working surfaces
  - slot `75` = format-selection helper feeding the post-process resource creation path
  - slot `84` = `Screen_ExecutePostProcessChain`
- The sampler-policy layer under `Screen_SetTextureSamplingProfile` is now concrete D3D behavior rather than a loose “profile” guess:
  - state `5` = `D3DSAMP_MAGFILTER`
  - state `6` = `D3DSAMP_MINFILTER`
  - state `7` = `D3DSAMP_MIPFILTER`
  - state `10` = `D3DSAMP_MAXANISOTROPY`
  - filter value `1` = point
  - filter value `2` = linear
  - filter value `3` = anisotropic
- The environment object is the bridge between “lighting/atmosphere data” and actual renderer knobs:
  - sun direction and colour
  - ambient/specular terms
  - bloom thresholds/scales/colour
  - global add/sub remap inputs
- That environment object is now anchored to a real owner path:
  - constructed by `Environment_Environment`
  - allocated/stored by `MenuScene_InitializeEnvironmentAndCamera`
  - consumed later by `RaceScene_RenderViewsAndPostProcess`
- Post-process is only one layer of the subsystem. The broader renderer path now also includes projection ownership, sampler-profile switching, and sky rendering.
- The shader layer is no longer just postprocess:
  - the renderer owns a shader compile/cache path
  - the base shader constructor derives input-layout state from the effect signature
  - the water path can run from `water.bed` content or from hardcoded defaults
  - shadow rendering uses a dedicated constant upload path through register `22`
