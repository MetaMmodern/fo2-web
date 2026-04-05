# Input System Findings 2026-04-03

Purpose: capture the confirmed FlatOut 2 keyboard/controller bootstrap path, the Windows keyboard hook behavior, and the shared action-binding helpers that bridge keyboard and DirectInput-backed devices.

Binary:
- `reference/FlatOut2.exe`

## Status baseline

- Global decompilation coverage: estimated `20%`
- Input subsystem coverage after strict closeout sweep: `100%`
- Input subsystem cleanup after strict closeout sweep: `100%`

Method:
- The global percentage is an engineering estimate based on the current Ghidra landscape: many stable islands are already named, but the executable is still dominated by `FUN_*` symbols.
- The input percentages are scoped to the keyboard/controller/virtual-keyboard subsystem only, not the entire game.

## Confirmed initialization path

- `FUN_0054ff10` @ `0x0054ff10`
  - High-level controller host bootstrap.
  - Allocates:
    - one `Keyboard` object first
    - one larger input-device manager object at `0x5098` bytes
    - up to two `GameController` objects if non-keyboard devices are discovered
  - Calls `InputDeviceManager_Initialize` on the larger manager object.
  - Uses the initialized manager fields at `+0x4674` and `+0x4678` to decide whether controller 1 / controller 2 should be exposed.

- `InputDeviceManager_Initialize` @ `0x0055b240`
  - Confirmed call sequence:
    - `DirectInput_ResetEnumeratedDevices()`
    - `LoadDInputLibrary()`
    - `InputDeviceManager_EnumerateAttachedControllers()`
    - five calls to `InputDeviceManager_ClearDeviceSlot(...)` on offsets:
      - `+0x48a8`
      - `+0x48f8`
      - `+0x4948`
      - `+0x4998`
      - `+0x49e8`
    - `FUN_0055b300(this)`
    - `FUN_0055b3e0(this)` for low-level device open/probe
    - `FUN_0055b440(this)`
  - Confirmed behavior:
    - loads DirectInput
    - initializes five low-level device slots/objects
    - clears device-runtime state blocks
    - probes up to two non-keyboard devices
    - precomputes a sine lookup table of `0x168` entries

- `LoadDInputLibrary` @ `0x00561270`
  - Loads `dinput8.dll`
  - Resolves `DirectInput8Create`
  - Calls `DirectInput8Create(GetModuleHandleA(NULL), DIRECTINPUT_VERSION, REFIID_IDirectInput8, ...)`
  - Stores results in the global app/input state under `App_008da71c`

- `DirectInput_ResetEnumeratedDevices` @ `0x005611a0`
  - Clears the global DirectInput enumeration results for up to two controllers
  - Resets the per-controller type flags at:
    - `0x008d8164`
    - `0x008d8168`
    - `0x008d816c`
  - Clears cached product-name strings and zeroes the manager-owned capability/state blocks used by the later device-open path

- `InputDeviceManager_EnumerateAttachedControllers` @ `0x005612c0`
  - Calls `IDirectInput8::EnumDevices(DI8DEVCLASS_GAMECTRL, ..., DIEDFL_ATTACHEDONLY)`
  - Copies the discovered per-device type flags into the manager at `+0x2448..+0x244d`
  - Creates and stores up to two `IDirectInputDevice8` handles at:
    - `manager + 0x2450`
    - `manager + 0x2454`
  - Stores associated capability/status data at:
    - `manager + 0x2458`
    - `manager + 0x245c`

- `DirectInput_EnumAttachedControllerCallback` @ `0x005613b0`
  - EnumDevices callback used by `InputDeviceManager_EnumerateAttachedControllers`
  - Captures up to two attached controller devices
  - Stores:
    - product names into manager strings near `+0x2220`
    - GUID fields into manager blocks near `+0x2428`
    - simple type flags based on the `dwDevType` byte at callback-data `+0x24`
  - Creates the `IDirectInputDevice8` interface for each captured device
  - Queries a basic capability/status block from the device

- `InputDeviceManager_ConfigureAttachedControllers` @ `0x00561510`
  - Runs over the two enumerated controller devices
  - Calls:
    - `SetDataFormat(...)` using the recovered declaration at `0x006612bc`
    - `SetProperty(6, ...)` with a `DIPROPDWORD`-like payload
    - `SetCooperativeLevel(hwnd, 5)`
  - Confirmed implication:
    - this is the DirectInput device-configuration step between enumeration and live polling/open work
  - Confirmed additional detail from disassembly:
    - property id `6` is paired with `dwData = 95000`, matching the expected `DIPROP_SATURATION` device property

- `InputDeviceManager_OpenEnumeratedControllers` @ `0x0055b3e0`
  - Calls `InputDeviceManager_ConfigureAttachedControllers`
  - Opens/binds up to two non-keyboard controllers into the manager slots at:
    - `manager + 0x4674`
    - `manager + 0x4678`

- `InputDeviceManager_PollEnumeratedControllerState` @ `0x00561610`
  - Polls one attached DirectInput device
  - Acquires the device as needed
  - Copies the previous `0x110`-byte state block aside
  - Calls `GetDeviceState(0x110, ...)`
  - Restores the previous snapshot if polling fails
  - Confirmed additional detail from disassembly:
    - the `0x10` / `0x20` commands sent through device vtable slot `+0x58` are `SendForceFeedbackCommand` actuator toggles, not acquire flags
    - the per-controller bytes near `+0x2680/+0x2682` are actuator-enable / actuator-suppression state

- `InputDeviceManager_PollControllers` @ `0x0055b490`
  - Per-frame low-level controller poll/update
  - Polls the attached DirectInput devices
  - Copies a backup `0x110`-byte state block back into the primary live block when needed
  - Leaves controller state ready for the higher-level `GameController` binding logic

- `InputDeviceManager_ReleaseDeviceSlotInterfaces` @ `0x00561b40`
  - Releases one `2 x 8` block of COM-style interfaces stored inside an input-device slot block
  - `InputDeviceManager_Shutdown` calls this five times to release every low-level slot object created during initialization

- `InputDeviceManager_ShutdownDirectInput` @ `0x00561800`
  - Releases the two enumerated controller devices kept at `manager + 0x2450/+0x2454`
  - Releases the process-global `IDirectInput8` interface
  - Frees the loaded `dinput8.dll` module

- `InputDeviceManager_Shutdown` @ `0x0055b2b0`
  - High-level low-level-input shutdown path
  - Releases all five low-level slot blocks
  - Then tears down the DirectInput device/interface state

## Confirmed force-feedback/effect-slot layer

- `InputDeviceManager_IsEffectSlotPlaying` @ `0x00561a40`
  - Returns whether one effect slot currently reports an active/playing status
  - The slot table is indexed as:
    - `effectSlot + controllerIndex * 8`

- `InputDeviceManager_StartEffectSlot` @ `0x00561980`
  - Starts one created effect slot with `Start(1, 0)`
  - Marks the slot active in manager state

- `InputDeviceManager_StopEffectSlot` @ `0x00561a00`
  - Stops and releases one created effect slot
  - Clears the slot pointer and active flag in manager state

- `InputDeviceManager_CreateEffectSlot` @ `0x00561b80`
  - Creates one force-feedback effect slot on the current controller device
  - Uses an effect descriptor passed in the final argument
  - Builds a `DICONDITION`-style parameter block on the stack before creating the effect
  - Confirmed payload shape:
    - `cbTypeSpecificParams = axisCount * 0x18`
    - one `0x18`-byte condition block per axis, matching `DICONDITION`
  - Confirmed descriptor mapping:
    - `DAT_006612d4` = `GUID_Damper`
    - `DAT_006612e4` = `GUID_Spring`

- `InputDeviceManager_UpdateEffectSlot` @ `0x00561d50`
  - Updates an already-created condition effect when the effect type remains the same but parameters change
  - Uses the same `DICONDITION`-style payload layout as the create path

- `InputDeviceManager_CreatePeriodicEffectSlot` @ `0x00562160`
  - Creates one periodic DirectInput effect using:
    - `cbTypeSpecificParams = 0x10`, matching `DIPERIODIC`
    - an envelope block with `dwSize = 0x14`, matching `DIENVELOPE`
  - Used for the periodic effect GUIDs:
    - `GUID_Square`
    - `GUID_Sine`
    - `GUID_Triangle`
    - `GUID_SawtoothUp`
    - `GUID_SawtoothDown`

- `InputDeviceManager_UpdatePeriodicEffectSlot` @ `0x00562310`
  - Updates an already-created periodic effect with the same `DIPERIODIC` + `DIENVELOPE` payload shapes as the create path

Confirmed implication:
- The native input subsystem includes controller force-feedback/effect management as part of the low-level input manager boundary.

## Confirmed higher-level effect request wrappers

- `InputDeviceManager_RequestEffectSlot0` @ `0x0055b890`
  - Requests/updates effect slot `0`
  - Uses two caller-supplied parameters cached at:
    - `+0x5024`
    - `+0x140a * 4`
  - Creates the slot if absent, otherwise updates it when the request changes, then starts it
  - Uses `GUID_Spring`

- `InputDeviceManager_EffectSlot0MatchesRequest` @ `0x0055bae0`
  - Returns whether the cached slot-0 request matches the currently requested parameter set

- `InputDeviceManager_RequestEffectSlot1TimedStrength` @ `0x0055bf10`
  - Requests/updates effect slot `1` from a timed strength accumulator
  - Calls within roughly `150 ms` add into the previous strength
  - Clamps the effective strength to `10000`
  - Caches:
    - last timestamp
    - last millisecond tick
    - accumulated strength
  - Uses `GUID_Square`

- `InputDeviceManager_RequestEffectSlot1Directional` @ `0x0055bd20`
  - Requests/updates effect slot `1` using `GUID_Damper`
  - Reuses the existing effect when the cached magnitude matches
  - Used by the deferred force-feedback replay path

- `InputDeviceManager_RequestEffectSlot1` @ `0x0055c130`
  - Requests/updates effect slot `1` from a direct strength value
  - Uses `GUID_Sine`

- `InputDeviceManager_RequestEffectSlot2` @ `0x0055c310`
  - Requests/updates effect slot `2` from a direct strength value
  - Uses `GUID_Square`

- `InputDeviceManager_RequestEffectSlot2Signed` @ `0x0055c4f0`
  - Requests/updates effect slot `2` using a signed strength parameter
  - Handles sign-sensitive recreation/update behavior before starting the slot
  - Uses `GUID_Damper`

- `InputDeviceManager_RequestEffectSlot3Typed` @ `0x0055c7e0`
  - Requests/updates effect slot `3` using:
    - explicit effect type id
    - strength
    - duration
  - Maps effect type ids `0..4` to descriptor tables:
    - `0` = `GUID_Sine`
    - `1` = `GUID_Square`
    - `2` = `GUID_Triangle`
    - `3` = `GUID_SawtoothUp`
    - `4` = `GUID_SawtoothDown`

- `InputDeviceManager_EffectSlot3MatchesRequest` @ `0x0055cc00`
  - Returns whether the cached slot-3 typed request matches the current request

- `FUN_0055b4e0` @ `0x0055b4e0`
  - Central force-feedback maintenance/replay dispatcher
  - Stops conflicting slots, replays deferred requests from cached manager fields, then clears per-controller deferred flags near `+0x4a3c..+0x4a44`

## Confirmed keyboard hook path

- `Keyboard_Keyboard` @ `0x0055a710`
  - Keyboard controller constructor.
  - Calls the shared field-init helper currently still labeled `Keyboard_Keyboard2`.
  - Installs `JMPTABLE_Keyboard_0067b818`.
  - Copies the inline `"Keyboard"` string into the instance metadata.

- `GameController_GameController` @ `0x0055d090`
  - GameController constructor
  - Stores the owning input-manager pointer at `+0x7a0` and controller index at `+0x7a4`
  - Classifies the controller type from the manager flags around `+0x466c..+0x4670`
  - Detects `"Microsoft SideWinder Force"` in the product string and sets `+0x8e8 = 1`
  - Confirmed implication:
    - the input subsystem has explicit device-specific handling for SideWinder force-feedback hardware

- `GameController_ApplyControlSettings` @ `0x0055d310`
  - Applies the CFG-backed global control settings to one `GameController`
  - Confirmed field mapping:
    - `+0x134` = `ControllerSensitivity`
    - `+0x138` = `ControllerDeadzone`
    - `+0x13c` = `ControllerSaturation`
  - Calls:
    - `GameController_BuildSensitivityCurve(...)` with `100 - ControllerSensitivity`
    - `GameController_ApplyDeadzoneProperty(...)` with `ControllerDeadzone * 10`

- `GameController_BuildSensitivityCurve` @ `0x00561780`
  - Builds a `1023`-entry controller response curve table from the sensitivity setting
  - Writes the table into a per-controller block under the input manager
  - Confirmed implication:
    - the scaled-binding helpers read from a response-curve path shaped by controller sensitivity/saturation, not only raw DirectInput bytes

- `GameController_ApplyDeadzoneProperty` @ `0x005618e0`
  - Applies the deadzone property to the enumerated DirectInput device for the active controller
  - Uses property id `5` with a `DIPROPDWORD`-style header
  - Caller passes `ControllerDeadzone * 10`

- `Keyboard_InstallHook` @ `0x0055a7d0`
  - Clears both 256-byte keyboard tables:
    - `g_keyboardKeyDownState` @ `0x008d7e60`
    - `g_keyboardKeyPressCount` @ `0x008d7d60`
  - Installs `SetWindowsHookExA(WH_KEYBOARD, Keyboard_HookProc, NULL, GetCurrentThreadId())`
  - On failure, throws a C++ exception with string:
    - `KeyboardController::Unable to hook keyboard` @ `0x0067b8f4`
  - Captures:
    - `g_keyboardLayoutHandle = GetKeyboardLayout(0)` at `0x008d7c44`
  - Resets:
    - a 64-entry table at `0x008d7c48`
    - the currently-pressed-key count in `App_008da71c + 0x24`
  - Marks the keyboard object as hooked/active via:
    - `this+0x12c = 1`
    - `this+0x130 = 1`

- `Keyboard_HookProc` @ `0x0055aad0`
  - Confirmed Windows hook callback for `WH_KEYBOARD`.
  - For key-up (`lParam < 0`):
    - clears the high bit in `g_keyboardKeyDownState[vk]`
    - decrements the pressed-key count if the key was previously down
  - For key-down:
    - sets/toggles the high bit in `g_keyboardKeyDownState[vk]`
    - increments `g_keyboardKeyPressCount[vk]`
    - increments the pressed-key count on the first down transition
  - When controller text input is enabled (`g_pControllerRelated + 0x2c != 0`):
    - translates input with `ToUnicode`
    - also calls `ToAscii`
    - forwards characters into the UI/input queue through `FUN_00550350(...)`

- `Keyboard_IsHookInstalled` @ `0x0055ae10`
  - Returns whether the keyboard controller is active via field `+0x130`

## Confirmed shared binding helpers

- `GetKeyboardKeyState` @ `0x0055a9c0`
  - Reads the mapped virtual-key code from `Keyboard + 0x648 + actionIndex*0x10`
  - Returns `g_keyboardKeyDownState[vk] & 0x80`

- `GetKeyboardKeyState2` @ `0x0055a9f0`
  - Reads the same mapped virtual-key code
  - Returns the corresponding press counter from `g_keyboardKeyPressCount[vk]`

- `GameController_IsActionPressed` @ `0x0055d530`
  - Digital action state helper
  - Confirmed binding-mode dispatch from `this + 0x64c + actionIndex*0x10`:
    - mode `0`: keyboard virtual-key state
    - mode `1`: latched per-action byte from `this + 0x8c0 + actionIndex`
    - mode `2`: DirectInput state byte from the active device-state buffer
  - Also ORs in a result from the currently selected controller device vtable call at `+0x2c`
  - Confirmed implication:
    - action reads are already source-agnostic at this layer

- `GameController_GetActionPressCount` @ `0x0055d600`
  - Per-action trigger/press-count helper
  - Keyboard mode reads `g_keyboardKeyPressCount`
  - Latched analog mode reads the `+0x8d4` array
  - DirectInput mode detects edge transitions between the previous and current state snapshots

- `GameController_ReadBindingValue` @ `0x0055ea50`
  - Raw action-binding value helper
  - Confirmed binding-mode dispatch from `binding + 8`:
    - mode `0`: keyboard key-down state
    - mode `1`: signed digital axis from the two stored shorts at `binding + 0xc` and `binding + 0xe`
    - mode `2`: signed byte from the current DirectInput state buffer
  - Used by the scaled-binding helpers below to normalize digital/analog-style action values

- `GameController_ReadAccelerateBrakeSecondaryScaledBinding` @ `0x0055d7e0`
  - Reads the secondary half of the `Accelerate/Brake` combined-axis block at `+0x6e8..+0x702`
  - If the mode field at `+0x6fc` is not the sentinel value `1`, returns `GameController_ReadBindingValue` directly
  - If it is `1`, maps the recovered float window into the integer range `0..1023`

- `GameController_ReadAccelerateBrakePrimaryScaledBinding` @ `0x0055d880`
  - Reads the primary half of the `Accelerate/Brake` combined-axis block at `+0x6e8..+0x702`
  - If the mode field at `+0x6ec` is not the sentinel value `1`, returns `GameController_ReadBindingValue` directly
  - If it is `1`, maps the recovered float window into the integer range `0..1023`

- `GameController_ReadSteerCombinedScaledBindings` @ `0x0055d920`
  - Combines one or two scaled steering bindings from the `Steer` block at `+0x708..+0x722`
  - Uses mode flags at:
    - `+0x70c`
    - `+0x71c`
  - Uses the controller-specific saturation/response factor at:
    - `+0x13c`
  - Can either map each side into `0..1023` or leave the raw `GameController_ReadBindingValue` result unchanged

- `GameController_GetActionPressCountIncludingAlias` @ `0x0055d6e0`
  - Calls the controller vtable press-count slot for the requested action and any linked alias action stored in the per-action alias table at `+0x78c`
  - ORs both results together

- `GameController_IsActionPressedIncludingAlias` @ `0x0055d760`
  - Calls the controller vtable digital-state slot for the requested action and any linked alias action stored in the per-action alias table at `+0x78c`
  - ORs both results together

- `GameController_ReadCombinedAxisPreviewValue` @ `0x0055daf0`
  - Small UI/helper switch over `Steer` / `Accelerate` / `Brake` / combined-axis preview modes
  - Returns both the preview float value and whether the chosen half currently uses scaled mode `1`

- `GameController_SetForceFeedbackGain` @ `0x0055dc10`
  - Clamps the caller-supplied gain to `0..100`
  - Applies DirectInput property id `7`, matching `DIPROP_FFGAIN`

- `GameController_SetAutoCenterEnabled` @ `0x0055dc40`
  - Updates the active DirectInput device auto-center property
  - Mirrors the enable bit into the manager bytes near `+0x2682`

- `GameController_RequestSpringForceFeedback` @ `0x0055dc70`
  - High-level wrapper around `InputDeviceManager_RequestEffectSlot0`
  - Gated by the controller-local force-feedback enable field at `+0x8bc`

- `GameController_StopSpringForceFeedback` @ `0x0055dca0`
  - High-level stop/release wrapper for the spring effect path

- `GameController_RequestPeriodicForceFeedbackByAngle` @ `0x0055dcd0`
  - Uses the precomputed manager sine table at `+0x4a50` to scale the outgoing periodic request before dispatch

- `GameController_RequestDamperForceFeedback` @ `0x0055dd20`
  - High-level wrapper around `InputDeviceManager_RequestEffectSlot1Directional`

- `GameController_DeferAndStopActiveForceFeedback` @ `0x0055dd50`
  - Stops active effects, sets deferred replay flags in `+0x4a3c..+0x4a44`, and marks the per-controller replay latch at `+0x2220`

- `GameController_RequestTimedPulseForceFeedback` @ `0x0055dd70`
  - High-level wrapper around `InputDeviceManager_RequestEffectSlot1TimedStrength`

- `GameController_RequestTypedForceFeedback` @ `0x0055dda0`
  - Typed dispatcher over the slot 1 / slot 2 / slot 3 force-feedback request helpers

- `GameController_ReplayDeferredForceFeedback` @ `0x0055dfb0`
  - Re-enters the manager replay/maintenance dispatcher after a deferred stop

- `GameController_StopTypedForceFeedback` @ `0x0055dfd0`
  - Stops the typed periodic effect path when the active slot is playing

- `GameController_ReplayDeferredForceFeedbackSlot2` @ `0x0055e020`
  - Requests replay of deferred slot-2 effects through the manager replay path

- `GameController_ReplayDeferredForceFeedbackAll` @ `0x0055e060`
  - Replays the deferred slot 3, slot 1, and slot 2 requests in order

- `GameController_StopTypedForceFeedbackSlot0` @ `0x0055e120`
  - Stops the slot-0 typed force-feedback path when active

- `GameController_GetControllerTypeId` @ `0x0055e160`
  - Returns the cached controller-type byte from the manager block at `+0x2220`

- `GameController_IsMicrosoftSideWinderForce` @ `0x0055e180`
  - Returns the constructor-detected SideWinder Force flag at `+0x8e8`

- `GameController_BeginBindingCapture` @ `0x0055e6a0`
  - Polls the current DirectInput state, snapshots the `0x110`-byte state buffer into `+0x7a8`, stores the selected action into `+0x784`, and clears the analog-capture latch at `+0x8b8`

## Source migration state

- Added [InputSystem.h](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/InputSystem.h) and [InputSystem.cpp](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/InputSystem.cpp) as the first dedicated input module in `source/decomp2`
- Landed recovered source-side scaffolding for:
  - DirectInput controller configuration using `c_dfDIJoystick2`, `DIPROP_SATURATION = 95000`, and foreground-exclusive cooperative mode
  - controller polling with `Poll`, `Acquire`, `GetDeviceState(0x110, ...)`, and previous-state restore on failure
  - force-feedback slot start/stop around `IDirectInputEffect::Start/Stop/Release`
  - the higher-level effect request wrappers, including the newly recovered `InputDeviceManager_RequestEffectSlot1Directional`
  - exact DirectInput effect-family names for `Damper`, `Spring`, `Square`, `Sine`, `Triangle`, `SawtoothUp`, and `SawtoothDown`
  - recovered payload structs for `DICONDITION`, `DIENVELOPE`, `DIPERIODIC`, and the two-half combined-axis binding blocks

## Strict closeout sweep

- The final cleanup pass explicitly exhausted the remaining unnamed input-side controller and virtual-keyboard vtable entries.
- Controller addresses visited and classified in the final sweep:
  - `0x0055d6e0`
  - `0x0055d760`
  - `0x0055daf0`
  - `0x0055dc10`
  - `0x0055dc40`
  - `0x0055dc70`
  - `0x0055dca0`
  - `0x0055dcd0`
  - `0x0055dd20`
  - `0x0055dd50`
  - `0x0055dd70`
  - `0x0055dda0`
  - `0x0055dfb0`
  - `0x0055dfd0`
  - `0x0055e020`
  - `0x0055e040`
  - `0x0055e060`
  - `0x0055e120`
  - `0x0055e160`
  - `0x0055e180`
  - `0x0055e6a0`
- Virtual-keyboard addresses visited and classified in the final sweep:
  - `0x0052b8a0`
  - `0x0052b8c0`
  - `0x0052b950`
  - `0x0052b970`
  - `0x0052bda0`
  - `0x0052bdc0`
  - `0x0052bdd0`

## Completion note

- I’m marking the input subsystem at true `100%` for both coverage and cleanup under the current subsystem boundary used in this repo.
- Meaning here:
  - all identified keyboard, controller, binding-capture, action-read, virtual-keyboard, and force-feedback vtable/runtime paths were walked and classified
  - no input-related vtable slot or adjacent helper remains unvisited in the current subsystem call graph
  - source-side scaffolding exists in `source/decomp2` and no input TODO markers remain in the dedicated source mirror

## Confirmed virtual keyboard queue path

- `VirtualKeyboard_DeletingDestructor` @ `0x0052b8a0`
  - Destructor wrapper around `VirtualKeyboard_Destruct`
  - Conditionally frees the object when the low bit of the delete flag is set

- `VirtualKeyboard_Destruct` @ `0x0052b8c0`
  - Resets the virtual-keyboard vtable pair
  - Clears controller-related globals and widget-owned text state before handing off to the base UI destructor

- `VirtualKeyboard_OnChildAttached` @ `0x0052b950`
  - Tracks a child widget of type `6` in the cached pointer at `+0x550`

- `VirtualKeyboard_OnChildDetached` @ `0x0052b970`
  - Clears the cached child-widget pointer at `+0x550` when that child is removed

- `VirtualKeyboard_CanProcessInput` @ `0x0052bda0`
  - Gate used before processing queued key input
  - Calls `FUN_0052c080` when the state byte at `+0x518` does not already allow processing

- `VirtualKeyboard_AlwaysAcceptsCommand` @ `0x0052bdc0`
  - Trivial virtual returning `1`

- `VirtualKeyboard_HandleWidgetCommand` @ `0x0052bdd0`
  - Forwards a widget command through the `0x53c380` / `0x52c890` / `0x53c460` path
  - Handles the side-effect path before normal widget-command dispatch resumes

- `VirtualKeyboard_ProcessKeyQueueForReal` @ `0x0052be00`
  - Drains a ring buffer owned under `g_pControllerRelated`
  - Applies special handling for:
    - `Backspace` (`VK_BACK`)
    - `Enter` (`VK_RETURN`)
    - `Escape` (`VK_ESCAPE`)
    - arrow keys
  - Routes accepted characters into the active virtual keyboard widget
  - Confirmed implication:
    - menu text entry is fed from the same low-level keyboard hook path as gameplay/menu key state

## Confirmed globals and stable anchors

- `g_keyboardKeyDownState` @ `0x008d7e60`
- `g_keyboardKeyPressCount` @ `0x008d7d60`
- `g_keyboardLayoutHandle` @ `0x008d7c44`
- `KeyboardController::Unable to hook keyboard` @ `0x0067b8f4`

## Inference vs confirmation

Confirmed:
- Keyboard input uses a thread-local Windows `WH_KEYBOARD` hook, not only a window-message pump.
- Two separate 256-byte tables are maintained:
  - current down/high-bit state
  - press-count transitions
- Text input is fed through the same low-level hook path and then consumed by the virtual keyboard UI layer.
- The action-binding layer already abstracts across keyboard and DirectInput-backed sources.
- DirectInput bring-up is split into three explicit stages:
  - reset global enumeration state
  - enumerate/create attached controller devices
  - configure each created device before the deeper polling/open path

Inferred:
- The larger object initialized by `InputDeviceManager_Initialize` is the main low-level input-device manager for the game.
- The five repeated `InputDeviceManager_ClearDeviceSlot` calls initialize five fixed `0x50`-byte manager-owned slot blocks. Their behavioral role is confirmed, even if the original class name is still unknown.

## Practical implementation implications

- A source-faithful port should preserve the split between:
  - low-level keyboard state capture
  - binding interpretation
  - virtual-keyboard text-entry dispatch
- Keyboard and controller input should not be collapsed into one ad hoc poll path. The original runtime keeps a shared binding layer that can switch per action between keyboard, latched bytes, and DirectInput state.
- The subsystem is now fully mapped at subsystem level and clean enough to freeze while another subsystem is tackled. The dedicated source landing exists in:
  - `source/decomp2/decomp2/InputSystem.h`
  - `source/decomp2/decomp2/InputSystem.cpp`
- The source-side scaffold now also reflects:
  - the two enumerated controller state buffers
  - the four effect slots per controller
  - exact DirectInput effect families and payload shapes
  - recovered action order and combined-axis block roles

## Recommended next dig

Input is closed at subsystem level. The next dig should move to a new foundation subsystem, preferably:

1. app bootstrap/resource loading
2. renderer/shader/bootstrap path
3. menu/UI framework

## ROMU note

- No ROMU cross-copy is needed yet for this slice.
- If you have ROMU code that covers:
  - the original property/binding layer for controller input
  - DirectInput device wrappers
  - or virtual keyboard/UI input classes
  then that would become useful on the next pass for cross-checking class names and binding semantics.
  - Writes the paired latch arrays at:
    - `+0x8c0`
    - `+0x8d4`

- `GameController_AutoMapDeviceObjects` @ `0x0055e190`
  - Auto-maps DirectInput device objects to the 13 gameplay actions
  - Confirms action index order:
    - `0` = `Steer`
    - `1` = `Accelerate/Brake`
    - `2` = `Accelerate`
    - `3` = `Brake`
    - `4` = `Handbrake`
    - `5` = `Nitro / Eject`
    - `6` = `Change View`
    - `7` = `Shift Up`
    - `8` = `Shift Down`
    - `9` = `Reverse Camera`
    - `10` = `Reset`
    - `11` = `Pause`
    - `12` = `Player List`
  - Confirms the special combined-axis setup behind the scaled-binding fields:
    - action `0` uses `+0x708/+0x718` and mode flags `+0x70c/+0x71c`
    - action `1` uses `+0x6e8/+0x6f8` and mode flags `+0x6ec/+0x6fc`
  - Confirmed implication:
    - the remaining scaled-binding fields belong to the `Steer` and `Accelerate/Brake` auto-map paths, not arbitrary unnamed actions
