# Vehicle Control Telemetry Findings

Date: `2026-04-25`

Correction 2026-06-08:
- `vehicle + 0x1dfc` is now confirmed as nitro use/drain control from `Vehicle_AccumulateAerodynamicAndInputForces`.
- `vehicle + 0x1df8` is brake control; `Vehicle_SetBrakeControl` @ `0x0042d3a0` writes this field.
- `vehicle + 0x1e00` is handbrake/rear-brake additive control consumed by `Vehicle_ComputeBrakeAndHandbrakeWheelTorques`.
- `vehicle + 0x1e04` is signed steer.

## Scope

Add a low-risk next telemetry batch after camera validation by logging the
vehicle control block that the local-player control writer feeds before the
physics step.

## Confirmed From Ghidra

`Player_WriteVehicleControls` @ `0x0046fa50` writes local-player control values
into the current vehicle runtime object. Initial runtime CSV validation showed
the old symbolic/decomp names for this block were shifted, so the telemetry
schema uses observed semantics for confirmed channels and offset-based names for
the remaining candidates:

- `vehicle + 0x1df4`: applied throttle
- `vehicle + 0x1df8`: applied brake
- `vehicle + 0x1dfc`: nitro use/drain control
- `vehicle + 0x1e00`: applied handbrake
- `vehicle + 0x1e04`: applied signed steer

`Vehicle_UpdateControlClampsAndFrameDelta` @ `0x00429250` clamps those channels
and stores frame timing:

- `vehicle + 0x6ad8`: frame delta in milliseconds
- `vehicle + 0x6adc`: frame delta in seconds

## Implementation Impact

The telemetry mod now logs:

- `vehicle_applied_throttle`
- `vehicle_applied_brake`
- `vehicle_applied_handbrake`
- `vehicle_applied_nitro`
- `vehicle_applied_steer`
- `vehicle_frame_delta_ms`
- `vehicle_frame_delta_seconds`

The older generic `vehicle_control_*` labels were used only in the first test
build. Current telemetry should use the `vehicle_applied_*` and
`vehicle_control_candidate_*` names.

Runtime validation:

- Short stationary test on `2026-04-26` isolated handbrake input and showed
  `vehicle+0x1e00` rising from `0` to `1` while throttle, brake, and steer were
  idle.
- The same test confirmed `vehicle+0x1e04` mirrors signed applied steer exactly
  during stationary left/right steering.
- `vehicle+0x1dfc` remained `0` in that stationary test because nitro was not active; later decompilation confirms it as the nitro use/drain channel.

## Validation Plan

In a short in-race test:

- hold throttle and verify `vehicle_control_throttle` rises while speed rises
- press brake and verify `vehicle_control_brake` rises
- press handbrake and verify `vehicle_control_handbrake` rises independently
- steer left/right and verify `vehicle_control_steer` changes as the car turns
- verify frame delta remains stable and plausible

## Drivetrain Runtime Anchors (2026-04-28)

Confirmed from decompilation call paths:

- `Vehicle_FinalizeSubstepAndUpdateAttachments` @ `0x0042b660` calls `Gearbox_UpdateShiftState` @ `0x004421d0` once per vehicle finalize step.
- `Player_WriteVehicleControls` @ `0x0046fc40` reads and writes gearbox runtime state on the vehicle object:
  - `vehicle + 0x634`: applied/current gear
  - `vehicle + 0x63c`: requested gear
  - `vehicle + 0x638`: shift-state machine state
  - `vehicle + 0x64c`: number of forward gears
  - `vehicle + 0x648`: speed-related scale used in shift/reverse logic
  - `vehicle + 0x6e4`: speed threshold term used in shift/reverse logic
  - `vehicle + 0x5d8`: engine-speed-like runtime scalar used during control logic

Gearbox internal state machine anchors (object-relative, from gearbox methods):

- `Gearbox_RequestGear` @ `0x00442160`: requested gear at `+0x48`, state at `+0x4c`, timer at `+0x50`.
- `Gearbox_UpdateShiftState` @ `0x004421d0`: state transitions `1 -> 3 -> 0` driven by timers `+0xc0` and `+0xbc`.
- `Gearbox_ApplyGearRatio` @ `0x00442110`: applied/current gear at `+0x40`.

Status:

- `vehicle+0x1e24` previously used as RPM candidate is now confirmed speed-like in runtime CSV and should not be treated as engine RPM.
- New telemetry columns were added to log the confirmed vehicle-side gearbox fields directly for validation against race traces.
