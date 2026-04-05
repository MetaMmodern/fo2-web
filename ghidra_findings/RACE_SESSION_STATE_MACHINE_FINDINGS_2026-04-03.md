# Race / Session State Machine Findings 2026-04-03

Purpose: capture the current deep pass over the race/session state-machine layer, including session progress states, cup preparation from script, and the lifecycle of the live `GameSettings` race block.

Binary:
- `reference/FlatOut2.exe`

## Status

- Global decompilation coverage after this pass: estimated `36%`
- Race / session state-machine coverage after this pass: estimated `68%`
- Race / session state-machine cleanup after this pass: estimated `42%`

This is still an early deep pass. The session object itself is only partially materialized because many `SessionClass_*` exports are thin Lua/vtable wrappers, but the race-info lifecycle and cup-script materialization are now concrete.

## Confirmed session Lua wrapper layer

These exports are Lua-facing wrappers over a real `SessionClass` object:

- `SessionClass_CreateSession` @ `0x004f0020`
  - calls session vtable slot `2`
  - returns a Lua boolean success/failure result

- `SessionClass_DeleteSession` @ `0x004f1720`
  - calls session vtable slot `3`

- `SessionClass_JoinSession` @ `0x004f1760`
  - parses a session-id-like script parameter block
  - forwards into `FUN_004ee950(...)`

- `SessionClass_Update` @ `0x004f1800`
  - calls session vtable slot `6`
  - returns a Lua boolean

- `SessionClass_StartRace` @ `0x004f18b0`
  - calls session vtable slot `7`

- `SessionClass_GetRaceStarted` @ `0x004f18f0`
  - does not call into the vtable
  - reads session flag bit `0x8` from `SessionClass + 0x216c`

- `SessionClass_IsHost` @ `0x004f1da0`
  - reads session flag bit `0x1` from `SessionClass + 0x216c`

- `SessionClass_NextRaceUpdated` @ `0x004f2580`
  - reads session flag bit `0x20` from `SessionClass + 0x216c`

- `SessionClass_HasSessionChanged` @ `0x004f24c0`
  - reads session flag bit `0x80` from `SessionClass + 0x216c`
  - clears that bit after reporting it

- `SessionClass_HasClassCarChanged` @ `0x004f2520`
  - reads bit `0x1` from the next session flag byte at `SessionClass + 0x216d`
  - clears that bit after reporting it

- `SessionClass_GetProgress` @ `0x004f1c80`
  - calls session vtable slot `5`
  - maps the returned progress enum into Lua globals:
    - `IDLE`
    - `CREATING`
    - `DELETING`
    - `JOINING`
    - `FAILED`
    - `STARTING`
    - `SUCCESS`
    - `NET_ERROR`

- `SessionClass_GetInfo` @ `0x004f20c0`
  - allocates one userdata wrapper around the object returned by `FUN_0050dc70()`
  - this looks like a separate session-info/session-desc object, not the raw `SessionClass`

- `SessionClass_JoinSessionFromCommandLine` @ `0x004f4270`
  - calls session vtable slot `4`

## Confirmed practical session state model

From `SessionClass_GetProgress`, the session layer already exposes a real progress state machine:

1. `IDLE`
2. `CREATING`
3. `DELETING`
4. `JOINING`
5. `FAILED`
6. `STARTING`
7. `SUCCESS`
8. `NET_ERROR`

Confirmed implication:
- the race/session layer is not just a boolean "connected or not" state
- create/join/start/delete are first-class transitions
- network failure is tracked distinctly from generic failure

Confirmed session flag bits:
- `SessionClass + 0x216c`
  - bit `0x1` = host
  - bit `0x8` = race started
  - bit `0x20` = next race updated
  - bit `0x80` = session changed
- `SessionClass + 0x216d`
  - bit `0x1` = class/car selection changed

## Confirmed live race-info lifecycle (`GameSettings`)

### Reset path

- `ClearRaceForReal` @ `0x0045e3c0`
  - clears a large race block inside `GameSettings`
  - resets:
    - `nGameMode_0x464..`
    - `float_0x4a4 = 1.0`
    - `float_0x4a8 = 1.0`
    - `nGameRules_0x4ac = Default`
    - `nStuntID_0x4b0 = None`
    - `nDerbyType_0x4b4 = None`
    - `pPositions_0x4b8 = NULL`
    - `bNitroRegen_0x4bc = 0`
  - then zeros the larger follow-on race/result/player-name buffers

Confirmed implication:
- `GameSettings` owns the live race descriptor block
- race start/teardown is centered on rewriting this block, not on creating a separate short-lived `RaceInfo` object

### Load path

- `LoadRaceInfo` @ `0x0045e620`
  - reads the selected entry from script-global `Levels`
  - loads:
    - `Rules`
    - `StuntType`
    - `StartPosition`
    - `DerbyType`
    - `Laps`
    - `Weather`
    - `NitroRegen`
  - applies override behavior:
    - `GameRulesOverride`
    - `DerbyTypeOverride`
  - falls back to:
    - `Laps = 1`
    - `Weather = 1`
    - `DerbyType = Wrecking` when derby type is omitted

Confirmed `GameSettings` race fields:
- `m_nLevelID_0x480`
- `m_nWeather_0x484`
- `m_nNumLaps_0x488`
- `m_nGameRules_0x4ac`
- `m_nStuntType_0x4b0`
- `m_nDerbyType_0x4b4`
- `m_pPositions_0x4b8`
- `m_bNitroRegen_0x4bc`

Confirmed implication:
- level/session selection is script-driven
- weather is part of the race descriptor, not a detached visual-only choice
- the live race block is loaded from script after being cleared, not patched in-place from arbitrary menu state

## Confirmed command-line join bridge

- `SessionClass_RequestJoinSessionFromCommandLine` @ `0x004ee950`
  - sets the session progress/state to `JOINING`
  - clears the race-start flag bit
  - builds command-line join payloads
  - submits the request through `Network_QueueSessionJoinRequest`

- `SessionClass_BuildJoinAddressListFromCommandLine` @ `0x005024e0`
  - collects `-public_addr` and `-private_addr` when present
  - otherwise falls back to the local non-loopback adapter addresses
  - emits up to four address/port pairs for the join request

- `SessionClass_BuildJoinPasswordPayloadFromCommandLine` @ `0x00502740`
  - reads `-password`
  - parses the `-join` endpoint address
  - serializes the join-address and password block consumed by the request path

- `Network_GetPrimaryAdapterMacAddress` @ `0x00502940`
  - reads adapter info with `GetAdaptersInfo`
  - prefers the adapter whose type id is `6`
  - returns the adapter MAC-like 64-bit identifier used by the join request path

- `Network_QueueSessionJoinRequest` @ `0x004e4950`
  - stores the prepared join request on the network/session object
  - queues it under the protected network worker critical section

Confirmed implication:
- command-line join is not just a menu convenience wrapper
- it is a real session-start branch that serializes endpoint/password/local-address identity and queues a network join request

## Confirmed cup materialization path

### Cup construction and lifetime

- `CupManager_Init` @ `0x00462a30`
  - allocates the process-global `CupManager` at `0x5b8` bytes

- `CupManager_CupManager` @ `0x00456ff0`
  - installs the cup manager vtable
  - initializes the per-race name strings
  - calls `ClearCupForReal`
  - exposes `CupManager` to Lua via `Lua_PushCupManager(..., "CupManager")`

- `ClearCupForReal` @ `0x00457130`
  - clears the cup name
  - clears all per-race entries
  - resets the eight cup-point entries to ids `0..7` with zero points
  - resets:
    - `cupRaceLength_0x5a8`
    - `m_nNumDrivers_0x5ac`
    - `activeCupIndex_0x588`
    - AI handicap / AI upgrade fields

### Cup script preparation

- `CupManager_PrepareFromScript` @ `0x00456910`
  - Lua-facing wrapper over `CupManager_PrepareFromScriptForReal`

- `CupManager_PrepareFromScriptForReal` @ `0x00457250`
  - reads script-global `Races`
  - resolves referenced `Levels`
  - fills each cup race entry with:
    - `Level`
    - `Laps`
    - `StartPosition`
    - `AIHandicapLevel`
    - `AIUpgradeLevel`
    - `Rules`
    - `EventType`
    - localized level `Name`
    - `NextIndex`
  - sets:
    - `cupRaceLength_0x5a8`
    - `activeCupIndex_0x588 = 1`
    - cup name
    - cup AI handicap/upgrade defaults

Confirmed implication:
- cup progression is not hardcoded
- the script layer materializes a concrete runtime race list with explicit next-race links
- race-series progression and the per-race live descriptor are separate layers:
  - `CupManager` owns the series
  - `GameSettings` owns the currently loaded race

## Confirmed cup query helpers

- `CupManager_GetCurrentRaceIndex` @ `0x00456ab0`
  - returns `activeCupIndex_0x588`

- `CupManager_IsRaceLocked` @ `0x00456c10`
  - returns `m_bLocked_0x68` for a requested race entry

- `CupManager_IsRaceCompleted` @ `0x00456ca0`
  - returns `m_bCompleted_0x6c` for a requested race entry

- `CupManager_GetRacePosition` @ `0x00456e50`
  - returns one per-race/per-driver position cell from the cup race array

Confirmed implication:
- cup progress is already stored in a concrete runtime table, not recalculated ad hoc from profile data for every query

## Confirmed save/profile handoff from session-side scripts

- `SavePlayerProfile` @ `0x00465870`
  - Lua-facing save request
  - if no save/load profile flow is already active, sets:
    - `GameSettings.m_nSaveFlowState_0x434 = 2` (`SAVEFLOW_SAVEPLAYERPROFILE`)
    - `GameSettings.uint_0x20` to the requested slot/id
    - supporting countdown/aux fields at `+0x438/+0x43c/+0x24`

- `SavePlayerDataForReal` @ `0x004637e0`
  - writes the large player/profile block from `GameSettings + 0x207c` through `SaveDevice`
  - on success, stores the returned save handle in `GameSettings + 0x450`
  - sets `GameSettings.m_nSaveStatus_0x44c` to success/failure-style values (`4` on success path, `6` on error path)

Script-visible save-flow states already exported by `Lua_AddLoadAndSaveGlobals`:
- `SAVEFLOW_NONE = 0`
- `SAVEFLOW_GETSAVEINFO = 1`
- `SAVEFLOW_SAVEPLAYERPROFILE = 2`
- `SAVEFLOW_LOADPLAYERPROFILE = 3`
- `SAVEFLOW_LOADOPTIONS = 4`
- `SAVEFLOW_SAVEOPTIONS = 5`
- `SAVEFLOW_CHECKSAVEDEVICE = 6`

Confirmed implication:
- the race/session shell hands profile persistence to a real save-flow state machine through `GameSettings`
- profile saving is not an immediate direct write from the menu/session Lua side

## Cross-check with current `decomp2`

Useful existing source-side overlap already existed in:
- `source/decomp2/decomp2/Engine/SCRAP.cpp`
  - `LoadRaceInfo`
  - several cup query wrappers
  - `JoinSessionFromCommandLine`

This pass adds stronger structure around those fragments rather than replacing them blindly.

## Source migration state

Added:
- [SessionFlow.h](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/SessionFlow.h)
- [SessionFlow.cpp](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/SessionFlow.cpp)

Current source mirror covers:
- session progress enum exposed by `SessionClass_GetProgress`
- race-start bitflag exposed by `SessionClass_GetRaceStarted`
- session flag bits for host/next-race-updated/session-changed/class-car-changed
- `GameSettings` race-info clear/load lifecycle
- `CupManager` allocate/clear/prepare lifecycle
- command-line join request/reset behavior
- save-flow request state for `SavePlayerProfile`

## Frontier

Core unresolved frontier remains:
- the actual non-Lua `SessionClass` vtable-backed methods behind:
  - create
  - delete
  - update
  - start race
- the exact bridge from `SessionClass_StartRace` into:
  - `ClearRaceForReal`
  - `LoadRaceInfo`
  - track/world loading
  - race scene/session activation
- the relation between `SessionClass_GetInfo` / `FUN_0050dc70()` and the session/session-list descriptors
- the end-of-race teardown path back into save/profile/session state

## Best next branch

The shortest path to close this subsystem further is:

1. recover the real `SessionClass` implementation behind vtable slots `2..7`
2. connect `SessionClass_StartRace` to the `GameSettings` race-info lifecycle
3. follow the race-load handoff into track/world loading
