# Steering Layer Diagnosis 2026-04-14

Purpose: record the current source-truth diagnosis for the remaining "stiff / rigid / speed-killing" steering behavior in the Rapier port.

## Superseding correction 2026-06-08

Later Ghidra work corrected the role of `0x00441ae0`: it is now named `Drivetrain_ApplyThrottleControlClamp` and is called with `vehicle+0x1df4` throttle/drive input, not signed steering. Signed steer is `vehicle+0x1e04`. The section below about a second native rack steering clamp should therefore be treated as superseded until a real steering-rack clamp call is separately recovered.

## Scope

Reviewed:

- `SetPlayerControllerSteeringValues` @ `0x00469f50`
- superseded older label `SteeringRack_ApplyRequestedSteerAngle` @ `0x00441ae0`; current name `Drivetrain_ApplyThrottleControlClamp`, not steering
- existing notes in:
  - `reference/FlatOut-2-decomp-main/docs/DRIVING_RUNTIME_FINDINGS_2026-04-04.md`
  - `reference/FlatOut-2-decomp-main/research/ghidra_migration_bundle/docs/ghidra_findings/DRIVING_RUNTIME_CONTROL_FINDINGS_2026-03-31.md`

## Confirmed From Ghidra

### 1. Native player steering is a dedicated shaped-input system

`SetPlayerControllerSteeringValues` loads `Data.Physics.Car.Steering_PC` and seeds a runtime steering profile with:

- `Sensitivity`
- `MinAnalogSpeed`
- `MaxAnalogSpeed`
- `MinAtDelta`
- `MaxAtDelta`
- `CenteringSpeed`
- `DigitalThreshold`
- `MinDigitalSpeed`
- `MaxDigitalSpeed`
- `SteeringLimitRate`
- `SteeringLimitSpeed`
- `SteeringSpeedRate`

Recovered default speed buckets from the bootstrap:

- `20`
- `90`
- `200`
- `300`

Confirmed implication:

- native keyboard/controller steering is not just "raw input -> smoothed steer scalar"
- it uses a source-defined speed-bucket authority model before the vehicle runtime sees the request

### 2. Native rack steering has a second runtime clamp layer

Superseded 2026-06-08: the following subsection was based on the old `SteeringRack_ApplyRequestedSteerAngle` label for `0x00441ae0`. That address is now classified as `Drivetrain_ApplyThrottleControlClamp`, not a steering-rack function.

Confirmed behavior:

- writes the requested rack steer to runtime field `+0x270`
- if rack/runtime state thresholding is active, it first applies a linear transform using `+0x274/+0x278`
- then computes a second cap from downstream vehicle fields at:
  - `vehicle + 0x300`
  - `vehicle + 0x304`
  - `vehicle + 0x370`
  - `vehicle + 0x374`
- multiplies that cap by a runtime scale/bias pair and clamps the final rack steer against it

Confirmed implication:

- the final wheel steer authority is not determined by player input shaping alone
- it also depends on live wheel/runtime state inside the steering rack layer

## Porting Impact

Current Rapier steering path in `src/game/physicsRapier.js`:

- approximates player-side steer shaping with a custom smoothed scalar
- computes wheel angles from Ackermann geometry
- does not reproduce the native rack-side dynamic clamp that depends on live wheel/runtime fields

Concrete diagnosis:

- the current "stiff keyboard steering causes major speed loss" behavior is plausibly a structural mismatch, not just a bad numeric constant
- continuing to tune only `MinDigitalSpeed`, `MaxDigitalSpeed`, `CenteringSpeed`, or front wheel angle values will not recreate native feel by itself

Short-term recommendation:

1. Wait for user reference recordings from original GarageTest runs.
2. Do not keep retuning steering constants ad hoc.
3. Next steering parity pass should start by porting the native player-side speed bucket model exactly.
4. After that, recover the semantic meaning of the rack-side limiter inputs at `+0x300/+0x304/+0x370/+0x374` before trying to match high-speed steering feel.
