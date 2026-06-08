# Steering Runtime Port Note (Short-Term)

Date: 2026-04-15

Superseding correction 2026-06-08:
- `0x00441ae0` is now named `Drivetrain_ApplyThrottleControlClamp`; the previous `SteeringRack_ApplyRequestedSteerAngle` label was wrong because `Vehicle_AccumulateAerodynamicAndInputForces` passes `vehicle+0x1df4` throttle/drive input to it.
- Signed steer is confirmed at `vehicle+0x1e04`.
- Keep the steering config and tire-force anchors below, but do not port `0x00441ae0` as steering behavior.

Scope:
- Record steering-specific native runtime anchors already recovered in
  `reference/FlatOut-2-decomp-main/docs/DRIVING_RUNTIME_FINDINGS_2026-04-04.md`
- Map those anchors to current Rapier port gaps.

Confirmed native anchors (from reference findings):
- `0x00469f50` -> `SetPlayerControllerSteeringValues`
- `0x00429be0` -> `Vehicle_AccumulateWheelTireAndSteeringForces`
- `0x00441960` -> `SteeringRack_ResetRuntimeState`
- `0x00441990` -> `SteeringRack_GetCounterSteerAssistIndex`
- `0x00441ae0` -> superseded older label `SteeringRack_ApplyRequestedSteerAngle`; current name `Drivetrain_ApplyThrottleControlClamp`, not a steering anchor
- `0x00441b90` -> `SteeringRack_UpdateSelfAligningTorque`
- `0x00441c00` -> `SteeringRack_IntegrateVehicleSpeed`
- `0x00441db0` -> `SteeringRack_BuildAssistLookupTable`

Native data/config path (from reference findings):
- `Data.Physics.Car.Steering_PC`
- `SteeringLimitRate`, `SteeringLimitSpeed`, `CenteringSpeed`,
  `DigitalThreshold`, digital/analog steering speed parameters.

Current JS/Rapier status:
- Implemented:
  - speed-limited steering envelope (`computeSteeringLimit`)
  - analog/digital steering rate blend
  - centering + Ackermann-style inner/outer front wheel split
- Missing native parity:
  - steering-rack helper cluster behavior
  - explicit self-aligning torque model
  - native counter-steer assist index path
  - integration with tire-force side (`SlideControl*`, `AntiSpin*`) in
    `Vehicle_AccumulateWheelTireAndSteeringForces` path.

Immediate port sequencing:
1. Mirror `SetPlayerControllerSteeringValues` parameter mapping exactly from
   `Steering_PC`.
2. Port steering-rack helper cluster in recovered call order.
3. Only then retune steering feel against runtime UX.

