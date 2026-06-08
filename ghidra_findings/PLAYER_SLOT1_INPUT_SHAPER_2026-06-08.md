# Player Slot 1 Input Shaper 2026-06-08

Purpose: document the manually recovered `Player` vtable slot 1 function at `0x0046f510`.

## Why this needed manual recovery

- `Player` vtable entry `0x0066d3fc` points to `0x0046f510`.
- `Player_PerTickPreVehicleForceUpdate` @ `0x0046d5c0` calls this slot once per fixed simulation tick.
- Ghidra MCP does not currently define `0x0046f510` as a function, so `decompile_function_by_address` fails.
- Raw EXE bytes confirm executable x86 code at `0x0046f510`.

## Confirmed Raw-Code Boundaries

- Start: `0x0046f510`
- End/return: `0x0046fa3e`
- Tail handoff: `0x0046fa34` calls `Player_WriteVehicleControls` @ `0x0046fa50`
- Adjacent known functions:
  - `Player_ResetLiveDrivingInputs` @ `0x0046f480`
  - `Player_WriteVehicleControls` @ `0x0046fa50`

## Confirmed Responsibilities

`0x0046f510` is the live local-player driving input shaper.

Confirmed from raw instruction flow:

- reads and updates player live input fields around:
  - `player+0x64c..+0x670`
  - `player+0x684` signed steer
  - `player+0x688` throttle/gas-side channel
  - `player+0x68c` brake-side channel
  - `player+0x690`
  - `player+0x694`
  - `player+0x698`
  - `player+0x6b0`
  - `player+0x6b8` steer delta output
- integrates multiple player-side control channels over the passed tick delta.
- uses steering/control globals initialized by `SetPlayerControllerSteeringValues` @ `0x00469f50`, including:
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
- applies speed-bucket steering logic using the `SteeringLimitSpeed` / `SteeringSpeedRate` arrays.
- clamps `player+0x684` signed steer to `[-1,1]`.
- clamps other player-side channels before vehicle control handoff.
- calls `Player_WriteVehicleControls(player, tickDelta)` at `0x0046fa34`.

## Default Steering Globals

`SetPlayerControllerSteeringValues` seeds defaults before reading `Data.Physics.Car.Steering_PC`:

- `Sensitivity` -> `FLOAT_008db9e0`, default `0.5`
- `MaxAnalogSpeed` -> `FLOAT_008db9e4`, default `5.528`
- `MinAnalogSpeed` -> `FLOAT_008db9e8`, default `1.0`
- `MinAtDelta` -> `FLOAT_008db9ec`, default `0.1`
- `MaxAtDelta` -> `FLOAT_008db9f0`, default `1.0`
- `CenteringSpeed` -> `FLOAT_008db9f4`, seeded `8.0`, then forced to `0.99` after config load
- `MinDigitalSpeed` -> `FLOAT_008db9fc`, forced to `1.5` after config load
- `MaxDigitalSpeed` -> `FLOAT_008dba00`, forced to `3.5` after config load
- `SteeringLimitRate` -> `FLOAT_008dba10..1c`, defaults `0.9, 0.75, 0.4, 0.4`
- `SteeringLimitSpeed` -> `FLOAT_008dba20..2c`, defaults `20, 90, 200, 300`
- `SteeringSpeedRate` -> `FLOAT_008dba30..3c`, defaults `1, 1, 1, 1`

## Porting Implication

This slot must be ported for local-player driving feel. It is not chassis physics, but it is the final player-side shaping layer before the vehicle control block is written. A custom vehicle solver that skips it would receive wrong steer/throttle/brake/nitro/handbrake inputs even if the downstream vehicle physics were accurate.

## Remaining Gap

This finding is based on raw bytes and branch/call recovery, not a full Ghidra decompile. For exact parity, define `0x0046f510` as a function in Ghidra or run a proper x86 disassembler and transcribe the instruction-level logic before implementation.
