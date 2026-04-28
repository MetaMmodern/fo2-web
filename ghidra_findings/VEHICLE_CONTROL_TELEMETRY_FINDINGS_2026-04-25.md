# Vehicle Control Telemetry Findings

Date: `2026-04-25`

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
- `vehicle + 0x1dfc`: candidate channel, not validated yet
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
- `vehicle_control_candidate_1dfc`
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
- `vehicle+0x1dfc` remained `0` and is still unresolved.

## Validation Plan

In a short in-race test:

- hold throttle and verify `vehicle_control_throttle` rises while speed rises
- press brake and verify `vehicle_control_brake` rises
- press handbrake and verify `vehicle_control_handbrake` rises independently
- steer left/right and verify `vehicle_control_steer` changes as the car turns
- verify frame delta remains stable and plausible
