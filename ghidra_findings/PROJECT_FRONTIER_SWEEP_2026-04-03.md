# Project Frontier Sweep 2026-04-03

Purpose: breadth-first inventory of the major FlatOut 2 executable subsystems before further deep decompilation. This is the "cards on the table" document: what is already known, what anchors exist, and what frontier remains for each subsystem.

Binary:
- `reference/FlatOut2.exe`

Working rule:
- This document is not a source-quality decompilation.
- It is a frontier map for deciding the next deep branches.
- "Known" means the subsystem has stable anchors or call roots already identified.
- "Frontier" means remaining nearby nodes that still need classification or deep semantic recovery.

## Current covered foundations

### Input / keyboard / controller bootstrap

Status:
- coverage: effectively closed
- cleanup: treated as done enough to move on

Primary source:
- `ghidra_findings/INPUT_SYSTEM_FINDINGS_2026-04-03.md`

Known:
- keyboard hook path
- virtual keyboard queue
- DirectInput bootstrap and controller enumeration
- action binding reads and rebinding/capture path
- deadzone/sensitivity/saturation settings application
- force-feedback slot system

Frontier:
- no major subsystem-level frontier remains
- only local polish would remain if reopened

### App bootstrap / resource loading

Status:
- strong but not closed

Primary source:
- `ghidra_findings/APP_BOOTSTRAP_RESOURCE_LOADING_FINDINGS_2026-04-03.md`

Known:
- `WinMain` / `LaunchWindow` / `App_InitializeCoreSystems`
- `filesystem` / `patch` archive-list loading
- BFS manager bring-up and loose-file fallback
- binary DB load
- root Lua/script-host bootstrap
- settings / language table / save device
- second-stage controller/network/font bring-up

Core frontier:
- `CreateSetupWindow`
- `FUN_00451d80`
- `FUN_00521360`
- `StartNetworkForReal`
- `FUN_00511fd0`
- `SetFPUCW`

### Renderer / lighting / image composition

Status:
- broad renderer path mapped
- cleanup now high, but not fully final

Primary source:
- `ghidra_findings/RENDERER_LIGHTING_FINDINGS_2026-04-03.md`

Known:
- `Render` / `RenderRace` / `RaceScene_RenderViewsAndPostProcess`
- screen wrapper and D3D create/reset path
- projection ownership
- sampler policy mapping
- environment apply path
- sky path
- fullscreen postprocess chain
- shader compile/cache path
- shadow constant upload
- water shader default fallback

Core frontier:
- exact `Screen` slot/function labels for `12`, `15`, `37`, `40`, `41`, `65`, `72`, `75`
- `FUN_00553ca0` pass-family breakdown
- `FUN_00554fa0` and adjacent scene-pass families
- weather-to-environment producer path

## Remaining subsystem breadth map

### Driving runtime / acceleration / braking / steering

Primary sources:
- `ghidra_findings/DRIVING_RUNTIME_CONTROL_FINDINGS_2026-03-31.md`
- `ghidra_findings/DRIVING_COLLISION_FINDINGS_2026-03-31.md`
- `GHIDRA_VISUAL_ADDRESSBOOK.md` section `Driving / Collision / Vehicle Physics`

Known anchors:
- `FUN_0046d5c0` common player tick
- `FUN_0046c8e0` local-player control path
- unnamed local input shaping block at `0x0046f510`
- `FUN_0046fa50` post-input vehicle control writeback
- `AIPlayer_WriteVehicleControls` @ `0x00409520`
- `FUN_00429250` input normalization before simulation
- `FUN_0042c650` fixed-step vehicle simulation entry
- `FUN_00429be0` wheel/tire force application
- `FUN_00429640` chassis force / drag stage
- `FUN_00441ae0` wheel-steer clamp stage
- `FUN_00441f10` automatic gear selection
- `FUN_00442160` shift request helper
- `FUN_00454b50` engine curve table builder
- `Car_ReadHandling` @ `0x00454c60`
- `FUN_0043aa30` tire dynamics config load
- `FUN_00431b50` body collision config load
- `FUN_00414ea0` collision sound bootstrap

Known facts:
- local and AI both write the same vehicle control channels
- steering is speed-bucketed and rate-shaped
- vehicle simulation runs 100 fixed `0.01` substeps
- acceleration/top speed come from engine/drivetrain/runtime force paths, not one scalar
- body collision uses multiple chassis volumes and explicit wheel anchors

Frontier:
- exact drivetrain inner loop consuming the engine curve
- exact force path from gear/differential/wheel state into drive thrust
- vehicle damage/deformation link beyond collision volume config
- obstacle/destruction coupling from car contacts into world objects
- AI path-planning side before `AIPlayer_WriteVehicleControls`

Deep-branch candidates:
- drivetrain inner loop below `FUN_0042c650`
- destruction/object-hit chain from collision contacts
- AI producer chain into vehicle controls

### Collision / destruction / obstacle interaction

Primary sources:
- overlaps the driving/collision findings

Known anchors:
- `FUN_00431b50` per-car body collision config load
- `FUN_00414ea0` collision sound/effect registration
- `FUN_00429be0` wheel/tire force application
- multiple collision volume keys in car config:
  - `CollisionFullMin/Max`
  - `CollisionBottomMin/Max`
  - `CollisionTopMin/Max`

Known facts:
- floor/body/ray/camera collision concepts are distinct
- collision audio/effect groups are separated
- body collision data is content-driven per car

Frontier:
- runtime object-hit/destruction call chain
- contact-to-damage propagation
- destructible obstacle update path
- ragdoll/driver ejection coupling to collisions beyond sound/event registration

Deep-branch candidates:
- xref from collision sound/event groups to runtime impact dispatch
- object damage state write paths off vehicle collision handlers

### Menu / UI framework

Known anchors:
- `EnterMenuForReal` @ `0x004ab970`
- `GUI_EnterMenu` @ `0x004ace60`
- `RenderMenu` @ `0x004a8ae0`
- `ProcessMenuCamera` @ `0x004aca00`
- `MenuInterface_MenuInterface` @ `0x00458840`
- `GUI_InitMenuButtons` / `GUI_InitMenuButtonsForReal`
- `GUI_ShowMenuButtons` / `GUI_HideMenuButtons`
- `GUI_SetMenuButtonResources`
- `GUI_GetMenuController`
- `MenuMap_*` family
- `wm_EnterMenu` / `wm_QuitMenu` / `wm_GetMenuResult`
- `DrawMenuSprite` / `DrawMenuText`
- `PlayMenuVideo` @ `0x00645d50`

Known facts:
- menu runtime has its own camera/environment path
- menu windows/selectors/backgrounds are managed by a real `MenuMap` object family
- menu button resources and animation visibility are separate helpers

Frontier:
- top-level menu state machine and result flow
- actual menu script/Lua/UI asset ownership
- button/widget event dispatch path
- menu-to-session transitions
- menu video/copyright/in-game menu branching

Deep-branch candidates:
- `GUI_EnterMenu` tree
- `RenderMenu` draw/update split
- `wm_*` wrapper family

### Race / session state machine

Known anchors:
- `RenderRace` @ `0x00479200`
- `LoadRaceInfo` @ `0x0045e620`
- `ClearRace` / `ClearRaceForReal`
- `SessionClass_CreateSession`
- `SessionClass_StartRace`
- `SessionClass_Update`
- `SessionClass_JoinSession`
- `SessionClass_Disconnect`
- `SessionClass_GetRaceStarted`
- `SessionClass_AddRace` / `DeleteRace` / `ClearAllRaces`
- `CupManager_*` family
- `GetPlayerRacePoints`
- `GetPlayerCupRacePosition`

Known facts:
- race setup, session state, and cup progression are distinct layers
- session objects own players/races/network mode state
- cup management and race scheduling are explicit objects, not just menu metadata

Frontier:
- precise offline race start/finish lifecycle
- session update loop ownership versus network ownership
- handoff between menu selection, race load, and race teardown
- exact relationship between `SessionClass`, `CupManager`, and `LoadRaceInfo`

Deep-branch candidates:
- `SessionClass_StartRace`
- `LoadRaceInfo`
- `ClearRaceForReal`

### Weather / atmosphere producers

Known anchors:
- `Environment_Environment` @ `0x00575840`
- `Environment_ApplyVisualParametersToScreen` @ `0x005920b0`
- `Environment_RenderSky` @ `0x00592470`
- `LevelLoadingRoutineProbably` @ `0x00575f50`
- flare descriptor loader `FUN_00595600`

Known facts:
- atmosphere parameters are data-driven
- flare file selection is data-driven via `FlareFile`
- filter textures are data-driven via `data/global/filters/%s.tga`
- `LevelLoadingRoutineProbably` binds:
  - `SunColor`
  - `AmbientColor`
  - `SpecularColor`
  - `SunPosition`
  - `FlarePosition`
  - `SkyDomeOffset`
  - bloom and luminance filter terms

Frontier:
- exact producer path from level/weather selection into `FUN_00575f50`
- mapping of remaining environment fields not yet named cleanly
- horizon texture / additional sky resources
- gameplay weather state if any exists above pure visual content

Deep-branch candidates:
- xrefs into `FUN_00575f50`
- level/track loader callers that populate the environment object

### Shader / material families beyond current renderer coverage

Known anchors:
- `Screen_CompileShader`
- `Shader_Shader`
- `Shader_~Shader`
- `DynamicShader_~DynamicShader`
- `CustomColorShader_~CustomColorShader`
- `SkinnedShader_~SkinnedShader`
- `WaterShader_WaterShader`
- `WaterShader_~WaterShader`
- `Screen_SetShadowVertexShaderConstants`
- `Shader_ApplyShadowConstants`
- `VertexShaderConstants_MatrixMul3x4`
- `VertexShaderConstants_ProjectionMul`

Known facts:
- shader family split currently confirmed:
  - `Default`
  - `Dynamic`
  - `CustomColor`
  - `Skinned`
  - `Water`
- shader base constructor derives effect handles and input layout state
- water shader has content-or-default fallback

Frontier:
- material-side behavior of each shader subclass
- mesh/material binding path into `Screen_CompileShader`
- shadow/material passes outside the postprocess-visible chain
- more resource and state ownership around material submission

Deep-branch candidates:
- callers of `Screen_CompileShader`
- `Shader_ApplyShadowConstants` caller tree

### Camera system

Primary source:
- `ghidra_findings/CAMERA_BEHAVIOR_FINDINGS_2026-03-31.md`

Known anchors:
- `UpdateCamera`
- `CreateCameraManager`
- `CameraManager_LoadCameraIniProfiles`
- `CameraManager_UpdateTrackers`
- `CameraManager_RegisterCarTrackerConfig`
- `CarCameraTracker_Update`
- `FixedHeadCameraTracker_Update`
- `CameraDamageShake_Update`
- `CameraManager_RegisterStuntTrackerConfig`
- `CameraManager_RegisterGoalCameraConfig`
- `CameraManager_RegisterGoalCameraDelayConfig`
- `ProcessMenuCamera`

Known facts:
- camera runtime is tracker-based, not monolithic
- authored INIs plus `Data.Camera.*` blocks drive behavior
- driving, fixed-head, stunt, goal, intro, start, and ragdoll cameras are distinct

Frontier:
- tracker vtable/class boundaries
- goal camera runtime transition logic
- intro/start/ragdoll runtime usage path
- exact menu camera state machine

Deep-branch candidates:
- `CameraManager_UpdateTrackers`
- `ProcessMenuCamera`
- goal camera trigger path

### Audio bootstrap / runtime

Known anchors:
- `OpenAudioInput` @ `0x00629838`
- `SetSound` @ `0x0053dc30`
- `LoadDirectSoundAndDrawLibrary`
- `CreateFMODSoftwareMixerThread`
- `CreateFMODStreamerThread`
- `CreateFMODNonBlockingThread`
- `CreateFMODDSoundRecordThread`
- `CreateFMODNetworkSocketThread`
- `VoiceManager_*` family
- `Network_GetVoiceManager`

Known facts:
- the EXE embeds a large FMOD-backed runtime
- voice/mail and network voice paths are explicit subsystems
- collision sounds are registered separately from core FMOD runtime bootstrap

Frontier:
- main audio-system constructor/init path
- music/effects/bank/content loading path
- runtime mixer/bus/volume ownership
- menu/race event sound dispatch
- voice integration boundary between audio and network

Deep-branch candidates:
- audio bootstrap from startup/session entry points
- `SetSound`
- `VoiceManager` acquisition/ownership path

### Save / profile / options flow

Known anchors:
- `SaveDevice_SaveDevice`
- `CheckSaveDevice`
- `DeleteSave`
- `SaveOptions`
- `SavePlayerData`
- `SavePlayerProfile`
- `SaveReplay`
- `SaveSystemData`
- `UpdateSaveFlow` / `UpdateSaveFlowForReal`
- `LoadPlayerProfile`
- `Lua_AddLoadAndSaveGlobals`
- `Settings_SaveSettings`
- full `PlayerProfile_*` family

Known facts:
- save device is a real object with its own flow state
- replay saving is explicit
- profile progression, unlocks, autosave, and money are all first-class runtime state
- save/profile is not only menu-side data; it is tied to race/session progression

Frontier:
- exact save-flow state machine
- serialized layout of profile/system data
- transition rules between race results and profile writes
- replay serialization format and ownership

Deep-branch candidates:
- `UpdateSaveFlowForReal`
- `LoadPlayerProfile`
- `SavePlayerDataForReal`

### Networking / GameSpy / online session flow

Known anchors:
- `StartNetworkForReal`
- `StopNetworkForReal`
- `ScriptHost_RegisterNetworkBindings`
- `Network_CreateLanSession`
- `Network_CreateGameSpySession`
- `Network_StartSearchLanSessions`
- `Network_StartSearchGameSpySessions`
- `Network_CreateUpdateThread`
- `SessionClass_JoinSessionFromCommandLine`
- `SessionListClass_*`
- `GameSpyInstance_NetworkError`
- `GameSpyInstance_*available*` family
- `Lua_PushNetwork`

Known facts:
- startup owns initial network bring-up
- session list and session class are distinct
- GameSpy and LAN paths are separate
- command-line join/host path exists
- voice manager is attached to network runtime

Frontier:
- full GameSpy instance object model
- network update thread and packet/session loop
- session list refresh lifecycle
- invite/presence/profile integration
- disconnect/error recovery path

Deep-branch candidates:
- `StartNetworkForReal`
- `SessionClass_Update`
- `SessionListClass_Refresh`

### Track / world object loading

Known anchors:
- `LevelLoadingRoutineProbably` @ `0x00575f50`
- `LoadRaceInfo` @ `0x0045e620`
- `TrackSegmentProgressManager_*`
- `SessionListClass_GetTrackNum`
- `GameSettings_BuildLevelRuleLists`

Known facts:
- level/ruleset selection already exists in `GameSettings`
- track-segment manager is allocated globally during bootstrap
- environment setup is strongly coupled to level loading

Frontier:
- actual track package/content load path
- world object spawn/registration path
- destructible obstacle ownership
- coupling between loaded track data and race scene object lists

Deep-branch candidates:
- callers around `LoadRaceInfo`
- xrefs into `TrackSegmentProgressManager_Acquire`
- `LevelLoadingRoutineProbably` caller tree

### AI driving / race behavior

Known anchors:
- `Player_CreateAIPlayer`
- `CreateAIPlayer_2`
- `AIPlayer_WriteVehicleControls`
- `FUN_00408bb0` AI profile loader
- `UpdateAICarHUD`
- `Garage_GetCarAIClass`

Known facts:
- AI profile data is content/config driven
- AI emits the same vehicle control channels as the player
- AI path already has aggression, overtake, catch-up, nitro, and slide-control parameters

Frontier:
- AI perception/path planner before control emission
- target selection / derby logic
- racing-line / alternate-route logic
- off-track recovery and reset decision-making

Deep-branch candidates:
- callers into `AIPlayer_WriteVehicleControls`
- `FUN_00408bb0` consumers

### Replay / ghost

Known anchors:
- `ReplayRelated` @ `0x00460fa0`
- `LoadReplay` @ `0x004620a0`
- `SaveReplay` @ `0x00462180`

Known facts:
- replay is explicit and separate from normal save/profile writes
- save/load entry points already exist

Frontier:
- replay object model and buffer ownership
- hook point in race/session update path
- ghost playback if present versus full replay playback

Deep-branch candidates:
- `ReplayRelated`
- callers of `LoadReplay` / `SaveReplay`

## Practical next-step order after this sweep

If we keep the subsystem-first workflow, the most controlled next deep branches are:

1. driving runtime / collision
2. menu / UI framework
3. race / session state machine
4. networking / GameSpy
5. save / profile / options
6. weather / atmosphere producers
7. track / world object loading
8. audio bootstrap / runtime
9. AI driving / race behavior
10. replay / ghost

Reason:
- driving/collision is one of the user's top priorities and already has strong anchors
- menu/race/network/save form a connected gameplay shell around the already-mapped bootstrap/input/renderer layers
- weather/track/audio/AI/replay are easier to deepen once those shells are better bounded
