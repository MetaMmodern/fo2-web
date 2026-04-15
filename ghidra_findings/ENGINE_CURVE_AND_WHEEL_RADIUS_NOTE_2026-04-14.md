Purpose: record the drivetrain parity issue found while calibrating Rapier autobox behavior against original-game car observations.

## Confirmed From Ghidra

- `FUN_00454b50` @ `0x00454b50`
  - Builds the runtime engine curve table from both:
    - `PeakTorque`
    - `PeakTorqueRpm`
    - `PeakPower`
    - `PeakPowerRpm`
    - plus redline / zero-power shaping inputs.
  - Porting implication:
    - a torque-only surrogate curve is structurally wrong for drivetrain parity.

- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`
  - Refreshes per-wheel rate scalars, updates a driven-wheel ratio aggregate, then asks the gearbox helper for the recommended gear.
  - Porting implication:
    - live shift behavior depends on runtime wheel/rate state, not only on a nominal vehicle speed scalar.
    - a web-port wrapper that derives engine RPM only from chassis forward speed will under-model launch slip / driven-wheel rate behavior.

- `GameSettings_LoadGlobalRules` @ `0x00451ce0`
  - Loads `GlobalCarMassFudgeFactor` and `PlayerVsAIMassFudgeFactor` into runtime settings.
  - Current finding:
    - only the settings-load xrefs were confirmed in this pass.
    - no direct consumer was yet confirmed in the traced driving runtime.
  - Porting implication:
    - do not assume the live physics mass should be multiplied by every visible mass-fudge scalar unless a runtime consumer is confirmed.

## Current Web-Port Diagnosis

- The Node autobox harness already used tire radius from the shipped DB files.
- The live Rapier runtime was still deriving wheel radius from rendered wheel meshes.
- That mismatch can produce a structurally wrong engine-RPM projection:
  - road speed can look roughly correct
  - but projected drivetrain RPM is too low or too high
  - so upshift/downshift timing becomes wrong even if the threshold tables themselves are close.

## Immediate Fix Applied

- Rapier wheel layout now uses `Data/Parts/Tires/*` radius values as the source of truth instead of mesh-estimated tire radius.
- The surrogate engine torque curve now uses `PeakPower` and `PeakPowerRpm` to derive the torque-at-power-peak segment instead of a fixed guessed multiplier.

## Status

- This is still not full native drivetrain parity.
- It does, however, remove two structurally wrong inputs from the current Rapier wrapper:
  - mesh-derived wheel radius
  - torque-only high-RPM engine shaping

## Model Sweep Cross-Check (2026-04-14)

Using all Amateur race cars (`car_1`, `3`, `4`, `5`, `7`, `10`, `16`, `19`, `24`, `26`, `33`):

- extracted gearbox + engine + tire data produce plausible native-style per-gear redline speed ladders
- no data-path anomaly was found that singles out `car_1` as a broken source asset
- placeholder wheel markers in car model logs are present across all cars and vary by model as expected

Conclusion:

- the remaining `car_1` under-acceleration in the web port is most likely a runtime drivetrain/force-transfer parity gap, not missing or wrong source car files.
