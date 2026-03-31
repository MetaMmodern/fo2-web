# Driving Runtime Control Findings 2026-03-31

Purpose: capture the frame-by-frame runtime control path for local player input, AI control output, vehicle substep simulation, steering limiting, shifting, and the top-speed/acceleration-relevant force path.

Binary:
- `reference/FlatOut2.exe`

## Confirmed runtime call path

### Local player path

- `FUN_0046d5c0` @ `0x0046d5c0`
  - Common player tick.
  - Runs `Player_UpdatePositionAndVelocity`.
  - Handles reset / stunt / checkpoint state.
  - Dispatches through the player vtable for per-frame control generation.

- `FUN_0046c8e0` @ `0x0046c8e0`
  - Local-player control path.
  - Reads raw controller state.
  - Builds per-frame player control values:
    - steer request at `player+0x674`
    - gas at `player+0x688`
    - brake at `player+0x68c`
    - extra analog axes / handbrake-like channels at `player+0x690` and `player+0x694`
    - shift requests via `player+0x664`, `FUN_00441f10`, and `FUN_00442160`
  - Calls `FUN_00429250(vehicle, dt_ms)` every frame.

- unnamed function at `0x0046f510`
  - Recovered from direct binary disassembly because Ghidra did not define a function there.
  - This is the main local input shaping block for steer / gas / brake / handbrake before `FUN_0046fa50`.
  - Confirmed behavior:
    - digital gas / brake / handbrake inputs are integrated over frame time, not toggled as immediate full-state writes
    - steer input uses the registered `Data.Physics.Car.Steering_PC` globals
    - speed-sensitive steering buckets are applied from:
      - `20`
      - `90`
      - `200`
      - `300`
    - the bucket weights use `SteeringSpeedRate` values from `FLOAT_008dba30..3c`
    - analog steering also uses:
      - `Sensitivity`
      - `MinAnalogSpeed`
      - `MaxAnalogSpeed`
      - `MinAtDelta`
      - `MaxAtDelta`
      - `CenteringSpeed`
    - final steer is clamped to `[-1.0, 1.0]`
    - gas / brake / side channels are clamped to `[0.0, 1.0]`
  - Confirmed from disassembly:
    - it computes car speed from vehicle velocity magnitude multiplied by `FLOAT_0067dd6c`
    - it derives a speed-dependent steering authority scalar from the four `SteeringLimitSpeed` thresholds
    - it blends the current steer toward a target rather than snapping directly to input
    - it stores `(newSteer - oldSteer) / dt` to `player+0x6b8`
  - Inference:
    - this is the source-faithful fix target for overly aggressive player steering in the web port.

- `FUN_0046fa50` @ `0x0046fa50`
  - Post-input drive helper.
  - Writes the final control channels into vehicle fields:
    - `vehicle+0x1df4`
    - `vehicle+0x1df8`
    - `vehicle+0x1dfc`
    - `vehicle+0x1e00`
    - `vehicle+0x1e04`
  - Also manages auto-shift / shift timing using:
    - `FUN_00441f10`
    - `FUN_00442160`
  - Confirmed behavior:
    - throttle written to `vehicle+0x1e04` is allowed in `[-1.0, 1.0]`
    - reverse / braking behavior is therefore not a separate fake top-speed limiter
    - shift changes are time-gated with cooldown fields at `player+0x6a0` and `player+0x6a4`

### AI path

- `AIPlayer_WriteVehicleControls` @ `0x00409520`
  - AI per-frame control writer.
  - Uses AI/path state already prepared on the AI player object.
  - Writes per-frame vehicle controls directly:
    - steer -> `vehicle+0x1df4`
    - handbrake-like channel -> `vehicle+0x1df8`
    - brake -> `vehicle+0x1dfc`
    - throttle / reverse -> `vehicle+0x1e04`
    - clutch-like channel -> `vehicle+0x1e00`
  - Also calls `FUN_00442160` for gear changes.
  - Confirmed behavior:
    - AI writes the same vehicle control channels as the local-player path
    - AI shifting uses the same gearbox helper path as player auto-shift
    - AI does not appear to bypass the vehicle physics step with a fake speed setter

### Vehicle simulation path

- `FUN_00429250` @ `0x00429250`
  - Lightweight per-frame vehicle-input normalization stage.
  - Clamps incoming control channels before simulation:
    - `0x1df4`, `0x1df8`, `0x1e00` -> `[0, 1]`
    - `0x1e04` -> `[-1, 1]`
  - Stores `dt_ms`, `dt_seconds`, and prior velocity snapshots for the deeper simulation.

- `FUN_0042c650` @ `0x0042c650`
  - Main vehicle simulation entry traced here.
  - Confirmed behavior:
    - clears per-step accumulators
    - resets wheel/contact state
    - resolves wheel contact geometry from the environment
    - then runs **100 fixed substeps**
    - each substep calls, in order:
      - `FUN_00429640`
      - `FUN_00429be0`
      - `FUN_00441090`
      - engine / physics solve `FUN_00564410(0.01, ...)`
      - `FUN_0042b660`
  - Confirmed fact:
    - the native car update is not one coarse frame-sized arcade integration
    - it is a repeated fixed-step solve
  - Implementation implication:
    - any web port running one large step per frame will overshoot acceleration, steering response, and stability.

## Steering-specific runtime behavior

- `FUN_00441ae0` @ `0x00441ae0`
  - Wheel-steer clamp stage after the main car steer value is written.
  - Confirmed behavior:
    - uses requested car steer input
    - applies an additional dynamic cap based on downstream wheel/vehicle state fields
    - clamps final wheel steer to a computed `fVar2`, not only to raw player input

- `FUN_00429be0` @ `0x00429be0`
  - Main wheel/tire force application stage traced in this pass.
  - Confirmed behavior:
    - uses `vehicle+0x1df4` as steer input
    - uses `vehicle+0x1df8` and `vehicle+0x1dfc` in brake / drag style branches
    - accumulates force into `vehicle+0x2a0/0x2a4/0x2a8`
    - accumulates torque into `vehicle+0x2b0/0x2b4/0x2b8`
    - uses wheel contact state, wheel offsets, chassis velocity, and steering angle every substep
  - Confirmed implication:
    - steering aggressiveness is produced by the full steering-input path plus substep tire-force solve, not by a single front-wheel yaw shortcut.

## Gearbox and speed-driven shifting

- `FUN_00441f10` @ `0x00441f10`
  - Automatic gear selection helper.
  - Confirmed behavior:
    - projects car velocity onto a forward vector
    - converts that speed using `FLOAT_0067dd6c`
    - compares against per-gear thresholds stored in the gearbox state object
    - returns the target gear index

- `FUN_00442160` @ `0x00442160`
  - Shift request helper.
  - Confirmed behavior:
    - accepts requested gear only in valid range `[-1, numGears]`
    - starts a shift-state machine rather than changing the gear instantly

## Acceleration and top-speed relevant findings

### Confirmed

- `SpeedLimit` is **not** currently confirmed as a runtime speed cap.
  - Confirmed xrefs:
    - `Car_ReadHandling` @ `0x00454c60`
    - `SetCarStats` @ `0x00467860`
  - No confirmed use was found in the traced simulation functions above.
  - Inference:
    - `SpeedLimit` is likely a garage / stat / UI-facing value, not the actual hard in-race limiter.

- Engine and drivetrain runtime data are built from:
  - engine params prepared in `CopyCarMaybeButAlsoDifferent` @ `0x004562d0`
  - gearbox/differential params prepared in `CopyCarMaybeButSlightlyDifferent` @ `0x004560d0`
  - tire/suspension params prepared in `FUN_004564c0` @ `0x004564c0`

- `FUN_00454b50` @ `0x00454b50`
  - Builds a runtime engine curve table from:
    - `PeakPowerRpm`
    - `PeakPower`
    - `PeakTorqueRpm`
    - `PeakTorque`
    - `RedLineRpm`
    - `RpmLimit`
    - `ZeroPowerRpm`
  - Confirmed implication:
    - acceleration/top speed are generated from an engine curve path, not a single force constant.

- `FUN_00429640` @ `0x00429640`
  - Applies chassis-level forces each substep.
  - Confirmed behavior includes:
    - rotational drag based on rotational velocity magnitude
    - anisotropic drag tied to car axes and coefficients near `field_0x1cf0..1cfc`
    - steer propagation via `FUN_00441ae0(..., vehicle+0x348, vehicle+0x1df4)`

### Still unresolved in this pass

- The exact final consumer of the engine curve table generated by `FUN_00454b50` is not yet named cleanly in Ghidra.
- The exact formula that turns the runtime engine curve, selected gear, differential ratio, and wheel state into final drive thrust still needs one more focused pass.
- That means we now have the exact local steering path and the exact vehicle substep loop, but the last drivetrain inner loop is only partially mapped.

## AI-driving config inputs now tied to runtime output

- `FUN_00408bb0` @ `0x00408bb0`
  - Loads AI profile parameters into the AI player object.
  - Confirmed keys include:
    - `Aggression`
    - `BumpAggression`
    - `BlockAggression`
    - `OvertakeAggression`
    - `Avoidance`
    - `DamageReaction`
    - `DamageRecovery`
    - `ThrottleLimit`
    - `HandicapRacing`
    - `HandicapOffTrack`
    - `HandicapAirborne`
    - `CatchUpRacing`
    - `CatchUpOffTrack`
    - `CatchUpAirborne`
    - `NitroUsage`
    - `NitroScan`
    - `LookAheadMin`
    - `LookAheadMax`
    - `LookAheadModifier`
    - `UseAltRoute`
    - `UnderSteerRange`
    - `OverSteerRange`
    - `SpinOutRange`
    - `NeutralSlide`
    - `NeutralBrakeTime`
    - `MinBrakeTime`
    - `MaxBrakeTime`
    - `SlideFrictionScale`
    - `BrakeFrictionScale`
    - `FrictionAdjust`
    - `CoefP`
    - `CoefI`
    - `CoefD`
    - `DerbyFavourCenter`
    - `DerbyTargetPlayer`
    - `DerbyExitCruiseSpeed`
    - `DefaultTurbo`

- Runtime tie-in:
  - `AIPlayer_WriteVehicleControls` is now confirmed as the output side of that profile data.

## Practical implications

- Over-aggressive web steering is very likely caused by missing the native speed-bucket steering logic plus the follow-on wheel-angle clamp.
- Over-aggressive web acceleration/top speed is very likely caused by missing the native fixed-step vehicle loop and at least part of the engine/differential/drag solve.
- `SpeedLimit` should not be used as a guessed in-race cap unless a later drivetrain pass proves otherwise.
