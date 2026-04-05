# App Bootstrap / Resource Loading Findings 2026-04-03

Purpose: capture the confirmed FlatOut 2 startup path from `entry`/`WinMain` into the real game bootstrap, including archive-list loading, BFS manager bring-up, binary DB loading, script-host creation, font loading, and the second-stage singleton initialization.

Binary:
- `reference/FlatOut2.exe`

## Status

- Global decompilation coverage after this pass: estimated `28%`
- App bootstrap/resource-loading coverage after this pass: estimated `94%`
- App bootstrap/resource-loading cleanup after this pass: estimated `74%`

Previous baseline before this pass:

- Global: `21%`
- App bootstrap/resource-loading coverage: `49%`
- App bootstrap/resource-loading cleanup: `31%`

Method:
- The global percentage reflects how much of the executable has been organized into confirmed subsystem structure rather than how many total functions are named.
- The subsystem percentage is scoped only to process startup, resource/archive loading, and the first-stage global manager bring-up.

## Confirmed startup split

The executable now has a confirmed two-stage startup:

1. `entry` performs CRT/runtime setup and then calls `WinMain`
2. `WinMain` performs platform checks, resource/archive setup, script/bootstrap setup, and window launch
3. `LaunchWindow` creates the setup/main window and then calls `App_InitializeCoreSystems`
4. `App_InitializeCoreSystems` acquires gameplay-facing managers and finishes second-stage runtime bootstrap

## Confirmed process entry

- `entry` @ `0x00602638`
  - Standard MSVC CRT startup
  - Initializes heap, multithreading, I/O, argv/envp, and C runtime
  - Calls `WinMain`
  - Not game-specific beyond handing off to `WinMain`

## Confirmed `WinMain` responsibilities

- `WinMain` @ `0x00520ed0`
  - Stores `hInstance`
  - Seeds `rand()` from `timeGetTime()`
  - Parses command-line setup mode:
    - `setup` @ `0x00677e1c`
    - `-setup` @ `0x00677e14`
  - Calls `CoInitializeEx(NULL, 0)`
  - Checks DirectX version using:
    - `4.09.00.0904` @ `0x00677e04`
  - If DirectX is insufficient, shows a dialog and can abort startup
  - Calls `LoadBfsArchiveList` twice with:
    - `filesystem` @ `0x00677e2c`
    - `patch` @ `0x00677e24`
  - Parses command-line switches:
    - `-binarydb` @ `0x00677df8`
    - `-bedit` @ `0x00677df0`
  - Calls `LoadBinaryDatabase`
  - Acquires/initializes the root script host via `App_AcquireScriptHost` and `ScriptHost_InitializeRootLuaState`
  - Calls the GUI/settings setup path
  - Allocates:
    - `SaveDevice` at `0x20044` bytes
    - a parsed command-line option table at `0x2008` bytes
  - Calls `LaunchWindow`
  - On exit, tears down the script host helper buffer and uninitializes COM

- `CheckDirectXVersion` @ `0x00520aa0`
  - Reads:
    - `HKLM\SOFTWARE\Microsoft\DirectX\Version`
  - Performs a direct string compare against the startup minimum
  - `WinMain` uses it to enforce:
    - `4.09.00.0904`

- `CommandLineOptions_ParseBuffer` @ `0x00551090`
  - Parses the raw command line into a `0x2008` byte helper table
  - Stores up to `0x400` option names and optional values
  - Supports:
    - bare flags
    - `key = value`
    - quoted values

- `ScriptHost_ExposeCommandLineTable` @ `0x00550f90`
  - Exports the parsed helper table to Lua as global/table:
    - `CommandLine`
  - Normalizes option names to lowercase
  - Bare flags become boolean `true`
  - Key/value pairs become strings

- `CommandLineOptions_FindIndex` @ `0x00551220`
  - Case-insensitive lookup helper over the parsed command-line option table
  - `LaunchWindow` uses it to detect:
    - `-join`
    - `-host`

## Confirmed archive-list loading path

- `LoadBfsArchiveList` @ `0x00520e10`
  - Takes the archive-list path in `ESI`
  - In `WinMain`, those paths are:
    - `filesystem`
    - `patch`
  - Opens the list file as a text stream
  - Reads one line at a time up to delimiter:
    - `0x0a`
  - Uses a `0x104` byte stack buffer for each parsed line
  - Hands each parsed line buffer directly to `BfsManager_AddArchivePath`
  - If the list file is missing or cannot be opened, returns without mounting the BFS manager
  - Confirmed implication:
    - startup content discovery is not hardcoded to one archive file
    - startup archives are provided by two external plain-text lists
    - there is no custom line filtering in `LoadBfsArchiveList` itself
  - Repo-local verification:
    - the supplied file-tree inventory shows renamed backups
      - `filesystembk`
      - `patchbk`
    - and mounted archive files at the game root
      - `fo2c.bfs`
      - `en_fo2c.bfs`
      - `patch1.bfs`
      - `splitscreen.bfs`
    - so the `bk` suffix is a local unpacking artifact, not an original startup filename expected by the binary

- `BfsManager_AddArchivePath` @ `0x0054c2a0`
  - Ensures the process-global `BfsManager` exists
  - If needed, allocates it at `0x84` bytes and runs `InitBfsManagerAfterAlloc`
  - Appends the provided path through `BfsManager_RegisterArchiveFile`
  - When called with `NULL`, destroys and clears the process-global `BfsManager`

## Confirmed BFS manager bring-up

- `InitBfsManagerAfterAlloc` @ `0x00559760`
  - Constructor-like initializer for the process-global BFS manager
  - Confirms Windows platform details via `GetVersionExA`
  - Sets the main read buffer parameters:
    - `0x8000`
    - `0x0f`
    - `0x7fff`
  - Allocates a `0x1003f` byte raw buffer and aligns it to a `0x40` boundary
  - Allocates three reusable file-object/open-handle helpers at `0x4094` bytes each
  - Confirmed implication:
    - the BFS manager is a buffered streaming/archive layer, not just a dumb directory table

- `BfsManager_RegisterArchiveFile` @ `0x00559920`
  - Allocates one `0x224` byte per-archive descriptor
  - Calls `OpenBFS`
  - Appends the descriptor into the BFS manager’s archive array

- `OpenBFS` @ `0x00560b80`
  - Opens one BFS archive file with `CreateFileA`
  - Queries file size
  - Reads and validates the archive header
  - Confirms archive id:
    - `bfs1` encoded as `0x31736662`
  - Loads the directory/hash blob into memory
  - Validates hash size:
    - `0x3e5`
  - Rebases internal offsets when archive sections are packed relative to another block

Confirmed error strings:

- `Failed to open BFS archive: %s` @ `0x0067bbcc`
- `Could not query file size for BFS archive: %s` @ `0x0067bb9c`
- `BFS archive <%s> has invalid id` @ `0x0067bb7c`
- `BFS archive <%s> has invalid hash size (%d)` @ `0x0067bb50`
- `BfsManager: exceeded the limit of open files.` @ `0x0067b6c8`

## Confirmed binary DB loading path

- `LoadBinaryDatabase` @ `0x005595f0`
  - Loads:
    - `data/Database/FlatOut2.db` @ `0x00671c68`
  - Uses the BFS/file abstraction, not direct plain-file logic
  - Validates header:
    - `0x1A424450`
  - Validates version:
    - `0x200`
  - Allocates the runtime LiteDb blob
  - Installs:
    - `g_pLiteDb_008da700`
    - `App_008da71c.field3_0xc`
  - Calls the LiteDb init path and a follow-up setup function

Confirmed implication:
- the main game database is a compiled binary runtime asset that becomes a process-global LiteDb object very early in startup

## Confirmed raw-file fallback behavior

- `DoesFileExistWrapper_AndDoesSomeMoreStateStuff` @ `0x0054c610`
  - If:
    - `param_1 >= 0`
    - and `App_008da71c.pBfsManager != NULL`
    - then file existence is queried through `BfsManager_DoesFileExist(...)`
  - Otherwise the code falls back to normalized raw-file lookup through:
    - `NormalizeFilePath(...)`
    - `__stat(...)`
    - plus extra search paths when `INT_008da6e0 > 0`

- `FileLookup_BuildSearchPathCandidate` @ `0x0054c180`
  - Builds one loose-file fallback candidate by prepending one registered search-path prefix to the normalized relative filename buffer
  - Called only from `DoesFileExistWrapper_AndDoesSomeMoreStateStuff`

- `FileLookup_ShutdownArchiveAndSearchPaths` @ `0x0054c310`
  - Frees the global `BfsManager`
  - Frees any registered loose-file search-path prefixes
  - Used by the broader shutdown path

Confirmed implication:
- Your `filesystem` observation is directionally correct: when startup does not leave a live BFS manager mounted, later generic file lookup can fall back to raw filesystem access instead of archive access.
- The archive-list loader itself does not inject special filtering or fallback logic beyond “read line, pass to `BfsManager_AddArchivePath`”, so the final behavior of `filesystem` depends on its literal contents plus the `NULL` destroy semantics in `BfsManager_AddArchivePath`.

## Confirmed script host bootstrap path

- `App_AcquireScriptHost` @ `0x00521510`
  - Allocates or refcounts the global `ScriptHost`
  - Alloc size:
    - `0x0c`
  - Installs:
    - `ScriptHost_allocatedvftable_0067fe4`

- `ScriptHost_InitializeRootLuaState` @ `0x00524d70`
  - Root Lua/script-host bootstrap
  - Recreates the root Lua state when needed
  - Installs global helpers/registries such as:
    - `SCRIPTHOST`
    - `ClassBind`
    - `__luavars`
    - `ClassBindCpp`
  - Pushes the `ScriptHost` object into Lua
  - Registers several C helpers:
    - `DEBUGLOG`
    - `getref`
    - `getid`
    - `exists`
  - Injects a large built-in startup script that defines:
    - `Queue`
    - `Sandbox`
    - and related helper logic
  - `WinMain` passes the mode label:
    - `patch` @ `0x00677e24`
  - Also reused later by session teardown/startup code, so this helper is broader than `WinMain`-only bootstrap

Confirmed implication:
- the script host is not only for later menus/mods; it is a first-class startup dependency

## Confirmed second-stage core bootstrap

- `LaunchWindow` @ `0x00520cf0`
  - Creates the setup/main window via `CreateSetupWindow`
  - If startup is valid and not in setup-only mode, calls `App_InitializeCoreSystems`
  - Checks the parsed command-line helper buffer for:
    - `-join`
    - `-host`
  - Uses the normalized parsed command-line helper instead of rescanning the raw command line
  - Shows intro videos unless command arguments imply host/join behavior
  - Later renders the copyright screen:
    - `data/menu/copyright.tga` @ `0x00677dc6`
    - `data/menu/copyright_us.tga` @ `0x00677dde`

- `App_InitializeCoreSystems` @ `0x005210e0`
  - Calls:
    - `App_AcquireGameSettings` @ `0x005215c0`
    - `GameSettings_LoadResetTimingThresholds(g_pGameSettings_008e8410)` immediately afterward
    - alloc/refcount for a `0x430` byte car-id lookup table at `g_pCarIdLookupTable_008e842c`
    - `GameSettings_BuildCarLookupTable()`
    - `App_AcquireControllerHost` @ `0x005214c0`
    - `ControllerHost_InitializeDevices((int *)g_pControllerRelated)` for input/controller bootstrap
    - `TrackSegmentProgressManager_Acquire()` for the global race-progress / track-segment manager
    - `ScriptHost_RegisterNetworkBindings` @ `0x004e2130`
    - network startup via `StartNetworkForReal`
    - optional GameSpy instance creation
    - `App_AcquireFontRegistry` @ `0x00521620`
    - `ScriptHost_LoadFontsBed` @ `0x004517c0`
    - `SetFPUCW()`
  - Loads:
    - `data/global/Fonts/fonts.bed` @ `0x0066beac`

Confirmed implication:
- the window existing is a boundary: only after that do gameplay-facing managers, networking, controller runtime, and fonts come online

## Confirmed singleton acquisition details

- `App_AcquireGameSettings` @ `0x005215c0`
  - Allocates or refcounts the global `GameSettings`
  - Alloc size:
    - `0x4120`

- `GameSettings_GameSettings` @ `0x00458a20`
  - Constructor for the process-global `GameSettings`
  - Calls:
    - `GameSettings_LoadResetTimingThresholds(this)`
    - `GameSettings_BuildLevelRuleLists(this)`
  - Confirmed implication:
    - reset-threshold startup data belongs to the settings initialization path

- `GameSettings_BuildLevelRuleLists` @ `0x00459dd0`
  - Walks Lua table:
    - `Settings.Levels`
  - Reads each level entry's:
    - `Rules`
  - Builds `GameSettings` rule-index lists used to group levels/tracks by ruleset

- `GameSettings_LoadResetTimingThresholds` @ `0x00458d00`
  - Builds a temporary Lua state scratch object
  - Loads a startup script/config source through the Lua file/bootstrap layer
  - Reads reset-related timing thresholds into globals consumed by player reset-state logic:
    - `g_fResetTimeAir_00696ddc`
    - `g_fResetTimeJam_00696de0`
    - `g_fResetTimeOutOfTrack_00696de4`
    - `g_fResetTimeIllegal1_00696de8`

- `App_AcquireControllerHost` @ `0x005214c0`
  - Allocates or refcounts the controller/input host object
  - Alloc size:
    - `0x154`

- `ControllerHost_InitializeDevices` @ `0x0054ff10`
  - Startup input bring-up used by `App_InitializeCoreSystems`
  - Creates the keyboard device first
  - Creates the DirectInput manager second
  - Wraps up to two enumerated game controllers
  - Chooses the default active controller slot

- `GameSettings_LoadGlobalRules` @ `0x00451b70`
  - Loads one startup settings/global-rules file through the BFS/file abstraction if present
  - Falls back to `GUI_DefaultSettingsForReal()` when the file is absent
  - Maps LiteDb table:
    - `Settings.GlobalRules`
    - into the runtime settings block

- `Lua_PushSettings` @ `0x004522b0`
  - Exposes the startup `Settings` API into Lua
  - Creates category subtables:
    - `Version`
    - `Game`
    - `Control`
    - `Visual`
    - `Audio`
    - `Network`
    - `Dev`
  - Registers:
    - `LoadSettings`
    - `SaveSettings`
    - `GetValueMin`
    - `GetValueMax`

- `Startup_LoadLanguageTable` @ `0x00452d80`
  - Loads:
    - `data/language/languages.dat`
  - Rebases its in-file offsets in place after loading
  - Registers the language table for Lua/UI startup

- `SaveDevice_SaveDevice` @ `0x0051c520`
  - Constructor for the process-global `SaveDevice`
  - Creates:
    - `Savegame`
  - Allocates a small `0x20` byte internal helper block

- `TrackSegmentProgressManager_Acquire` @ `0x00521570`
  - Allocates or refcounts a process-global `0x464` byte track-segment / race-progress manager at:
    - `g_pTrackSegmentProgressManager_006b21c0`
  - Uses constructor:
    - `FUN_004022f0`
  - Shutdown pairs it with:
    - `FUN_00402400`
  - Confirmed implication:
    - this is the startup-owned global manager for track-segment lookup, lap-progress distance, and active-player segment bookkeeping

- `TrackSegmentProgressManager_FindNearestSegment` @ `0x004016f0`
  - Resolves the nearest track segment for a point/query
  - Falls back to recursive node search when the current segment guess is insufficient

- `TrackSegmentProgressManager_FindNearestSegmentInNode` @ `0x00401780`
  - Recursive node search over the segment tree / node hierarchy
  - Uses the manager's lap-length-like scalar at `+0x438` and candidate distance checks to choose the best segment

- `TrackSegmentProgressManager_AdvanceSegmentByDistance` @ `0x00405690`
  - Walks forward/backward across linked segments using distance budget
  - Returns the segment containing the requested advanced position

- `TrackSegmentProgressManager_RebuildActivePlayerList` @ `0x00402490`
  - Rebuilds the manager's active-player list each frame
  - Skips disabled players
  - Increments the per-segment occupancy/count field for each player's current segment

- `App_AcquireFontRegistry` @ `0x00521620`
  - Allocates or refcounts the process-global font registry object
  - Alloc size:
    - `0x144`
  - Uses constructor:
    - `FUN_00451660`

- `GameSettings_BuildCarLookupTable` @ `0x00456810`
  - Runs immediately after the first-stage settings/singleton allocation in `App_InitializeCoreSystems`
  - Uses:
    - `g_pLiteDb_008da700`
    - fallback `g_pLiteDbBackup_008da6fc`
  - Walks:
    - `Data.Cars`
    - `Data.Upgrades`
    - `FlatOut2`
  - Reads each `Car` record `DataPath`
  - Extracts the numeric car id from the tail of the path
  - Fills the `FlatOut2.Cars` lookup table
  - Clears garage-related state and refreshes dependent settings data afterward

- `g_pCarIdLookupTable_008e842c` @ `0x008e842c`
  - Process-global `0x430` byte heap block allocated in `App_InitializeCoreSystems`
  - Filled by `GameSettings_BuildCarLookupTable`
  - Indexed later by garage/car-loading code to map runtime car slots to DB car ids
  - Freed raw in `FreeALotOfMemory`

Confirmed implication:
- The second-stage bootstrap is not just singleton allocation. It also derives runtime lookup tables from the loaded binary DB before gameplay/menu state continues.

## Confirmed font loading path

- `App_AcquireFontRegistry` @ `0x00521620`
  - Allocates/refcounts the font registry object

## Breadth-first frontier sweep

This section is the explicit subsystem frontier inventory for app bootstrap/resource loading. The goal is to classify the remaining nearby nodes before driving another deep branch.

### Core unresolved frontier

These are still inside the startup/resource-loading boundary and should be handled before calling this subsystem clean:

- `CreateSetupWindow` (called by `LaunchWindow`)
  - classification: core bootstrap/UI boundary
  - reason: real startup success/failure gate before `App_InitializeCoreSystems`

- `FUN_00451d80` (called after `GUI_DefaultSettingsForReal()` in `LaunchWindow`)
  - classification: core bootstrap/settings sync
  - reason: post-window settings handoff, likely bridges GUI defaults into the runtime settings object

- `FUN_00521360` (tail call after optional intro playback in `LaunchWindow`)
  - classification: core bootstrap handoff
  - reason: final startup transition after intro/join-host branching

- `StartNetworkForReal`
  - classification: core second-stage bootstrap
  - reason: owned directly by `App_InitializeCoreSystems`, brings up the startup-created network object

- `FUN_00511fd0`
  - classification: core second-stage bootstrap
  - reason: GameSpy instance constructor/factory used during startup-owned singleton acquisition

- `SetFPUCW`
  - classification: core process-bootstrap tail
  - reason: final execution-environment setup step inside `App_InitializeCoreSystems`

### Shared but adjacent frontier

These are adjacent to bootstrap but are larger shared systems rather than startup-specific roots:

- `ControllerHost_InitializeDevices`
  - classification: shared input subsystem entry
  - status: already covered by the input subsystem pass

- `TrackSegmentProgressManager_Acquire`
  - classification: shared gameplay/runtime manager entry
  - status: identified sufficiently for startup; deeper behavior belongs to race/gameplay passes

- `ScriptHost_RegisterNetworkBindings`
  - classification: shared script/network bridge
  - status: startup-owned callsite is clear; detailed Lua binding content belongs to script/network passes

- `ScriptHost_LoadFontsBed`
  - classification: shared content loader
  - status: startup ownership is clear; detailed font registry behavior can be deferred

### Explicitly deferred from this subsystem

These should not block forward progress on app bootstrap/resource loading:

- deeper GameSpy runtime behavior after construction
- detailed networking/session behavior after `StartNetworkForReal`
- full runtime behavior of the font registry after `fonts.bed` load
- deeper race-progress manager methods beyond acquisition and ownership

### Practical sweep result

- The unresolved bootstrap frontier is now small and explicit.
- The next deep branch for this subsystem should start with:
  1. `CreateSetupWindow`
  2. `FUN_00451d80`
  3. `FUN_00521360`
  4. `StartNetworkForReal`

- `ScriptHost_LoadFontsBed` @ `0x004517c0`
  - Adds font-related C/Lua bindings
  - Executes script code that defines:
    - `AddAllFonts()`
  - Iterates the `Fonts` table and calls `AddFont(k, v.Texture, v.Data, v.TopPadding or 0)`
  - Applies `SetGlobalFontScale(GlobalFontScale or 1.00)`

Confirmed implication:
- font registration is script/data-driven through `fonts.bed`, not baked directly into native startup code

## Confirmed network binding step

- `ScriptHost_RegisterNetworkBindings` @ `0x004e2130`
  - Registers network-related Lua functions:
    - `StartNetwork`
    - `StopNetwork`
  - Registers voice/session/network-related classes/libs
  - Pushes the live network object into Lua if multiplayer is already active

## Confirmed shutdown symmetry

- `FreeALotOfMemory` @ `0x005211c0`
  - Stops networking
  - Releases:
    - GameSpy instance
    - controller/input host
    - the global track-segment / race-progress manager from `TrackSegmentProgressManager_Acquire`
    - font registry
    - save device
    - game settings
    - the `0x430` car-id lookup table at `g_pCarIdLookupTable_008e842c`
  - Calls several cleanup helpers after reference counts reach zero

Confirmed implication:
- the startup singletons recovered in this pass are real lifetime-managed globals, not one-off locals

## Inference vs confirmation

Confirmed:
- `WinMain` loads two startup archive lists named `filesystem` and `patch`
- the archive-list parser feeds a process-global `BfsManager`
- BFS archives have a validated `bfs1` header and a fixed hash-size expectation
- `FlatOut2.db` is loaded very early through the archive layer into a LiteDb runtime object
- the script host is bootstrapped before `LaunchWindow`
- the second-stage app bootstrap occurs only after window/setup success
- `fonts.bed` is loaded through the script host and used to register fonts dynamically
- `WinMain` builds a parsed command-line option table, exposes it to Lua, and `LaunchWindow` reuses that helper for `-join` / `-host`
- `languages.dat` is loaded and rebased before the main window handoff
- `GameSettings_BuildLevelRuleLists` and `GameSettings_BuildCarLookupTable` both perform real startup data shaping, not just allocation
- `GameSettings_LoadResetTimingThresholds` seeds the global reset-state timing values consumed by player reset logic
- `TrackSegmentProgressManager_Acquire` owns the global track/race-progress manager used by player progress, reset, camera, and nearest-segment queries
- the raw loose-file fallback path is explicit:
  - `FileLookup_BuildSearchPathCandidate` constructs prefix+relative-path probes
  - `FileLookup_ShutdownArchiveAndSearchPaths` tears that state down
- `ScriptHost_InitializeRootLuaState` is reused outside `WinMain`, so it is a general root-state rebuild helper rather than a one-shot startup shim
- `ControllerHost_InitializeDevices` performs the keyboard-first, DirectInput-second input bring-up used by second-stage startup

Inferred:
- the `patch` label likely has dual meaning:
  - startup archive-list name
  - script-host startup mode/context string
  This dual use is directly visible in `WinMain`, but the higher-level design intent still needs more call-chain recovery.
- the exact producer that registers loose-file search-path prefixes still needs one last trace, even though the fallback consumer and shutdown side are now mapped

## Source migration state

- Added [AppBootstrap.h](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/AppBootstrap.h) and [AppBootstrap.cpp](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/AppBootstrap.cpp) as the first dedicated bootstrap/resource-loading mirror in `source/decomp2`
- Landed recovered source-side scaffolding for:
  - setup-mode command-line detection
  - `-binarydb` / `-bedit` startup switch parsing
  - normalized parsed command-line option storage and lookup
  - confirmed BFS header and LiteDb header/version validation constants
  - BFS-mounted vs raw-file fallback modeling
  - script-host root-state bootstrap modeling
  - second-stage controller/input bootstrap ownership
  - startup language/global-rules ownership
  - second-stage car-id lookup table ownership
  - reset-threshold bootstrap ownership
  - global track-segment / race-progress manager ownership
  - recovered BFS manager defaults:
    - `0x8000`
    - `0x0f`
    - `0x7fff`
    - aligned `0x10000`-byte streaming window
    - three reusable file-object helpers
  - recovered startup archive-list order:
    - `filesystem`
    - `patch`

## Recommended next dig

Stay in app bootstrap/resource loading for one more focused pass:

1. Extract the exact string keys loaded by `GameSettings_LoadResetTimingThresholds`.
2. Trace what `filesystem` and `patch` point to at runtime:
   - are they plain local files in the game root
   - which `.bfs` archives are listed
   - what load order/override semantics are enforced
3. Follow `LoadFile__` / BFS-backed file abstraction into the common content-loading layer.
4. Connect the script-host startup path to:
   - `data/scripts/main.bed`
   - menu bootstrap
   - class/level loading

## ROMU note

- No ROMU copy-over is required yet for this slice.
- ROMU becomes useful here if you have:
  - property DB / LiteDb equivalents
  - script-host bootstrap code
  - archive/file abstraction code
  - font/script resource registration helpers
