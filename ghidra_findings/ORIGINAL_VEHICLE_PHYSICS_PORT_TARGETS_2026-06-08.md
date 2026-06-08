# Original Vehicle Physics Port Targets 2026-06-08

Purpose: record the Ghidra-confirmed normal driving loop and the smallest useful function set for resurrecting an original-style custom vehicle solver.

## Normal Runtime Cadence

- `PlayerHost_AdvanceRaceSimulationTicks` @ `0x00472d30` is the host tick driver.
- It receives a tick count-like `param_2`, stores the old timer from `PlayerHost.nTimer_0x2087c`, then advances that timer by `param_2`.
- Before steady-state simulation it writes fixed-step context fields:
  - `host + 0x207cc = 10`
  - `host + 0x207c4 = 0.010000001`
  - `host + 0x207c8 = 99.99999`
- It calls `UpdateCamera(host, oldTimer, param_2, activeFlag)`.
- `UpdateCamera` @ `0x004725c0` loops `param_3` ticks. It chunks event/environment work with `local_68 = min(remainingTicks, 10)`, but the vehicle force path is still run once per tick.
- Interpretation: normal driving is fixed `0.01` simulation ticks, i.e. 100 Hz. The reset-only `100 * 0.01` settle loop at `0x0042c650` should not be used as the per-frame runtime model.

## One-Car Local Player Tick Skeleton

Confirmed call order for a local-player normal tick:

1. Outside the `UpdateCamera` tick loop:
   - player vtable slot 4 at `0x0066d408` -> `Player_UpdateLocalDrivingControls` @ `0x0046c8e0`
   - samples controller state, shapes local inputs, and calls `Vehicle_UpdateControlClampsAndFrameDelta` @ `0x00429250`
2. Inside each `0.01` tick in `UpdateCamera`:
   - player vtable slot 5 at `0x0066d40c` -> `Player_PerTickPreVehicleForceUpdate` @ `0x0046d5c0`
     - confirmed one layer down: `Player_UpdatePositionAndVelocity` @ `0x0046b8c0`, `FUN_0046c070` track-progress state, `FUN_0046c850` reset/flag timer, then slot 1 live driving input shaper at `0x0046f510`
   - local-player vtable slots 6-8 resolve to `DoNothing5` @ `0x004f4350`
   - `Vehicle_AccumulateAerodynamicAndInputForces` @ `0x00429640`
   - `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`
   - `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
   - `PhysicsWorld_StepActiveBodiesAndContacts` @ `0x0056c850` with fixed `0.01`
   - player vtable slot 9 at `0x0066d41c` -> `Player_PerTickFinalizeVehicleUpdate` @ `0x0046dc20`
   - `Player_PerTickFinalizeVehicleUpdate` is a thin wrapper around `Vehicle_FinalizeSubstepAndUpdateAttachments` @ `0x0042b660`

## Vehicle Control Channels

Confirmed from `Player_WriteVehicleControls`, `AIPlayer_WriteVehicleControls`, `Vehicle_UpdateControlClampsAndFrameDelta`, and the consuming force routines:

- `vehicle + 0x1df4` = throttle/drive control, clamped `[0,1]`
- `vehicle + 0x1df8` = brake control, clamped `[0,1]`; `Vehicle_SetBrakeControl` @ `0x0042d3a0` writes this channel despite its older misleading Ghidra name
- `vehicle + 0x1dfc` = nitro use/drain control, clamped `[0,1]`
- `vehicle + 0x1e00` = handbrake/rear brake additive control, clamped `[0,1]`
- `vehicle + 0x1e04` = signed steer control, clamped `[-1,1]`

Important correction: `Drivetrain_ApplyThrottleControlClamp` @ `0x00441ae0` is called with `vehicle+0x1df4`. The previous `SteeringRack_ApplyRequestedSteerAngle` label was wrong; steering is not `+0x1df4`.

## Slot 1 Live Input Shaper

`0x0046f510` is the `Player` vtable slot 1 target at vtable entry `0x0066d3fc`.

Confirmed from raw bytes because Ghidra MCP does not define it as a function:

- Function body spans `0x0046f510..0x0046fa3e`.
- It ends at `0x0046fa34` by pushing the tick delta and `Player*`, then calling `Player_WriteVehicleControls` @ `0x0046fa50`.
- It consumes live player input/state fields cleared by `Player_ResetLiveDrivingInputs` @ `0x0046f480`, including `player+0x64c..+0x670`, `+0x684`, `+0x688`, `+0x68c`, `+0x690`, and `+0x694`.
- It integrates throttle/brake/nitro/handbrake-like player channels over the passed tick delta using steering/control globals loaded by `SetPlayerControllerSteeringValues`.
- It handles signed steering at `player+0x684`, including digital direction flags, centering, analog/digital speed settings, speed bucket limits, and clamp to `[-1,1]`.
- It writes steer delta at `player+0x6b8` before handing off to `Player_WriteVehicleControls`.

Porting implication: this slot is required for local-player feel. It is the missing preprocessing layer between raw controller state and vehicle control channels; stubbing it would bypass native steering/throttle/brake ramping before the vehicle solver.

## Force Stage Responsibilities

`Vehicle_AccumulateAerodynamicAndInputForces` @ `0x00429640`:

- snapshots angular velocity to `vehicle + 0x1e28/+0x1e2c/+0x1e30`
- writes timestep fields `vehicle + 0x1e08/+0x1e0c`
- applies nitro drain when active
- applies aero/downforce and rotational drag to force accumulators
- calls `Vehicle_ResolveWheelSuspensionLoads`
- calls `Vehicle_ComputeBrakeAndHandbrakeWheelTorques`
- calls `Drivetrain_ApplyThrottleControlClamp` @ `0x00441ae0` with `vehicle+0x1df4`
- calls wheel/object update callbacks before tire forces

`Vehicle_ResolveWheelSuspensionLoads`:

- computes spring/damper load per wheel from wheel runtime blocks and `vehicle+0x1e08/+0x1e0c`
- adds suspension force to chassis force accumulator `vehicle+0x2a0/+0x2a4/+0x2a8`
- adds corresponding torque to `vehicle+0x2b0/+0x2b4/+0x2b8`
- blends paired wheel load terms through `vehicle+0x1de8`

`Vehicle_ComputeBrakeAndHandbrakeWheelTorques`:

- reads brake channel `vehicle+0x1df8`
- writes front brake torque to wheel runtime `vehicle+0xd20` and `vehicle+0x10c0`
- adds handbrake/rear-brake channel `vehicle+0x1e00` into rear wheel torque at `vehicle+0x1460` and `vehicle+0x1800`

`Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`:

- consumes per-wheel runtime blocks at `vehicle + 0x0a00 + index * 0x3a0`
- reads contact flags/pointers and contact normal/material terms
- computes contact-point velocity from chassis linear/angular velocity
- accumulates chassis force at `vehicle + 0x2a0/+0x2a4/+0x2a8`
- accumulates chassis torque at `vehicle + 0x2b0/+0x2b4/+0x2b8`
- applies steering/differential/RPM related assist terms near the tail
- this remains the highest-value function to port accurately for drift, yaw, and inertia feel

`Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`:

- applies nonlinear drive scalar `c * 0.3 + c^3 * 0.7`
- dispatches into `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`
- propagates drivetrain output terms through gear-node/wheel-linked structures

`Vehicle_FinalizeSubstepAndUpdateAttachments` @ `0x0042b660`:

- copies current vehicle matrix into attachment/collision state
- calls `Vehicle_SampleWheelGroundContacts`
- calls wheel callbacks with the current substep duration
- calls `Gearbox_UpdateShiftState`
- computes angular acceleration feedback
- calls `Vehicle_UpdateAngularAccelerationFeedback` @ `0x00422e30`
- performs vehicle-side post-step/event/body update hooks

`Vehicle_SampleWheelGroundContacts`:

- builds a broad query box around the four wheel travel ranges
- queries the environment/collision structure through `FUN_005630d0`
- tests per-wheel rays/sweeps through `FUN_005639e0`
- writes wheel contact flags, contact normals/positions/material pointer terms, compression/displacement, and contact material slots used by the next tick's suspension and tire-force stages

`Gearbox_UpdateShiftState`:

- advances clutch/gear-node vtable callbacks
- applies the requested gear state through child gearbox components
- updates gearbox output shaft/rate terms used by `Drivetrain_DistributeTorqueToDrivenWheels`

## Porting Priority

First resurrection target:

1. Restore a custom vehicle-authority implementation behind the existing `createDrivingSimulation` contract. Done in current tree via `src/game/drivingSimulation.js` and restored `src/game/physics.js`.
2. Run it with a fixed `0.01` accumulator and a bounded per-render-frame catch-up count. Done for the restored temporary path with `MAX_STEPS_PER_FRAME = 8`.
3. Port the local-player skeleton above for one car.
4. Use Rapier only as optional static collision/query support while vehicle force/integration remains custom.

Minimum Ghidra-derived functions needed before tuning:

- `Player_UpdateLocalDrivingControls` @ `0x0046c8e0`
- `Player` vtable slot 1 live input shaper at `0x0046f510` (manual raw-byte recovery; no Ghidra function object)
- `Player_WriteVehicleControls` @ `0x0046fa50` / `0x0046fc40`
- `Vehicle_UpdateControlClampsAndFrameDelta` @ `0x00429250`
- `Vehicle_AccumulateAerodynamicAndInputForces` @ `0x00429640`
- `Vehicle_ResolveWheelSuspensionLoads` @ `0x0042b8c0`
- `Vehicle_ComputeBrakeAndHandbrakeWheelTorques` @ `0x0042c540`
- `Drivetrain_ApplyThrottleControlClamp` @ `0x00441ae0`
- `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`
- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
- `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`
- `Vehicle_FinalizeSubstepAndUpdateAttachments` @ `0x0042b660`
- `Vehicle_SampleWheelGroundContacts` @ `0x0042bcc0`
- `Gearbox_UpdateShiftState` @ `0x004421d0`
- `Vehicle_UpdateAngularAccelerationFeedback` @ `0x00422e30`

Likely deferrable for a first one-car feel prototype:

- AI progress/rubberband fields in `PlayerHost_AdvanceRaceSimulationTicks`
- remote/network replication branches in `Vehicle_AccumulateAerodynamicAndInputForces`
- stunt-only event branches
- dynamic prop wake/contact island details in `PhysicsWorld_StepActiveBodiesAndContacts`, as long as static ground/wheel contacts are supplied coherently

## Open Items

- The exact producer of `PlayerHost_AdvanceRaceSimulationTicks.param_2` still needs a clean caller trace. Confirmed call-site xrefs include `0x004de64a` and `0x0048e0b0`, but Ghidra did not resolve those directly to decompilable containing functions in this session.
- `0x0046f510` is classified from raw bytes, not decompiled C. If implementation needs exact bit-level parity, define the function in Ghidra or use an external x86 disassembler for a full instruction-level transcript before porting.
- `Vehicle_AccumulateWheelTireAndSteeringForces` needs a second pass focused on naming wheel-block offsets and scalar constants before implementation.
- `PhysicsWorld_StepActiveBodiesAndContacts` is broad engine infrastructure. For a web port, it may be better to implement a smaller vehicle-specific integrator/query path than to port the whole world island solver.
