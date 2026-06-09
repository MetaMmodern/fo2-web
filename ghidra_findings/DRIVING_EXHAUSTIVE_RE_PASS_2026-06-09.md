# Driving Exhaustive RE Pass 2026-06-09

Purpose: consolidate the Ghidra-confirmed original driving-feel pipeline so implementation work can port known systems instead of tuning by feel.

## Confirmed Native Load Order

`VehiclePhysics_LoadHandlingAndDrivetrain` @ `0x00439a10` loads the vehicle physics runtime in this order:

1. `FUN_0043a1c0`
2. `Differential_LoadHandlingCurves` @ `0x004417a0`
3. `Gearbox_LoadHandlingCurves`
4. `WheelPair_LoadTireAndSuspensionHandling` @ `0x004404b0`
5. `FUN_00439a90`
6. `Wheel_LoadTireDynamics` @ `0x0043aa30`
7. `FUN_0043ae00`
8. `FUN_0043a2b0`
9. `SteeringRack_BuildAssistLookupTable` @ `0x00441db0`

Porting implication: exact feel depends on the initialized runtime tables and structs. The tire, suspension, steering, gearbox, and differential paths should not be tuned independently.

## Tire Dynamics Table

`Wheel_LoadTireDynamics` @ `0x0043aa30` reads `Data.Physics.TireDynamics` @ string `0x0066a940` and writes a material/profile table at `vehicle + 0x1e5c`, stride `0x58`.

Confirmed config keys:

- `RollingResistance` @ `0x0066a92c`
- `InducedDragCoeff` @ `0x0066a918`
- `PneumaticTrail` @ `0x0066a908`
- `PneumaticOffset` @ `0x0066a8f8`
- `ZStiffness` @ `0x0066a8ec`
- `XStiffness` @ `0x0066a8e0`
- `ZFriction` @ `0x0066a8c8`
- `XFriction` @ `0x0066a8bc`
- `FrictionBoost` @ `0x0066a8ac`
- `SlideUnderSteer` @ `0x0066a89c`
- `SlideControl` @ `0x0066a88c`
- `UnderSteer` @ `0x0066a880`
- `SlowDown` @ `0x0066a874`
- `AntiSpin` @ `0x0066a868`

Confirmed profile offsets consumed by `Vehicle_AccumulateWheelTireAndSteeringForces`:

- `profile + 0x44`
- `profile + 0x48`
- aggregate contact/profile terms `profile + 0x4c/+0x50/+0x54`
- `profile + 0x30` is `SlideControl`; this is the `ABS(wheel+0x378)` value consumed in the tire-force stage.

Porting implication: asphalt should be represented as a selected tire-dynamics profile from this table. A one-scalar surface grip model cannot match native slip, handbrake, understeer, and donut behavior.

## Contact And Material Producer

`Vehicle_SampleWheelGroundContacts` @ `0x0042bcc0` is the vehicle wheel-contact producer.

Confirmed path:

- Builds a four-wheel travel AABB.
- Calls `CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0`.
- Calls `CollisionSpatial_RaycastTriangleSoup` @ `0x005639e0` per wheel.
- Maps material id through environment material mapping at `env + 0x6b4`.
- Writes the selected tire/material profile pointer as `vehicle + 0x1e5c + materialProfileIndex * 0x58`.

Confirmed output offsets:

- per-wheel block base: `vehicle + 0x0a00 + i*0x3a0`
- contact flag: `wheel + 0x334`
- contact profile/material pointer: `wheel + 0x348`
- contact vector copy: `wheel + 0x34c/+0x350/+0x354`
- material/contact slot id: `vehicle + 0x28ac + i*4`
- contact point array: around `vehicle + 0x28bc`, stride `0x0c`
- contact normal array: around `vehicle + 0x28ec`, stride `0x0c`
- suspension predictor/state: `wheel + 0x74`
- suspension compression/displacement: `vehicle + 0x18a4 + i*0x40`
- suspension velocity: `vehicle + 0x18a8 + i*0x40`
- overshoot/bump term: `vehicle + 0x18b4 + i*0x40`

Porting implication: the vehicle solver should receive native-style wheel contact records. Rapier raycasts can be temporary, but the data written must match these fields if the native tire/suspension functions are ported.

### Replication-Side Probe Path

`Vehicle_ProjectWheelContactProbes` @ `0x0042c270` also writes wheel contact flags/material/profile data, but it is called from replication apply/decode paths:

- `Vehicle_ApplyReplicationStateSample` @ `0x004389b5`
- `Vehicle_DecodePackedReplicationState` @ `0x0043832d`

This path is not the steady-state driving physics producer. It is the network/state reconstruction bridge.

## Suspension Load And Chassis Force

`Vehicle_ResolveWheelSuspensionLoads` @ `0x0042b8c0` is called from `Vehicle_AccumulateAerodynamicAndInputForces` before tire-force accumulation.

The exact runtime block constructor is `FUN_00439a90` @ `0x00439a90`, which runs immediately after `WheelPair_LoadTireAndSuspensionHandling` and before `Wheel_LoadTireDynamics`.

Confirmed construction details from `FUN_00439a90`:

- copies vehicle-wide suspension anchor vectors into `vehicle + 0x1880/0x1884/0x1888`
- builds four per-wheel runtime blocks at `vehicle + 0x1888 + i*0x40`
- the user-facing block range `vehicle + 0x188c..0x18b0 + i*0x40` is populated from the wheel geometry group at `vehicle + 0x1d24 + i*0x44`
- `vehicle + 0x18b4 + i*0x40` is reset in `Vehicle_ResetPoseAndRunPhysicsSubsteps` before the settle loop

Confirmed behavior:

- Reads contact flag at `wheel + 0x334`.
- Reads compression/velocity from `vehicle + 0x18a4/+0x18a8 + i*0x40`.
- Uses spring/progressive/damper terms in `vehicle + 0x188c..0x18b0 + i*0x40`.
- Uses timestep/global scales at `vehicle + 0x1e08/+0x1e0c`.
- Applies axle load transfer through `vehicle + 0x1d4c` and `vehicle + 0x1d90`.
- Blends paired axle loads through `vehicle + 0x1de8`.
- Writes final wheel load to `wheel + 0x344`.
- Accumulates chassis force at `vehicle + 0x2a0/+0x2a4/+0x2a8`.
- Accumulates chassis torque at `vehicle + 0x2b0/+0x2b4/+0x2b8`.

Porting implication: suspension is not only a visual body-height correction or a tire-grip scalar. It physically pushes the body and creates pitch/roll torque before tire forces.

## Tire Force Stage

`Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0` consumes suspension/contact state and writes chassis force/torque.

Confirmed behavior:

- Reads contact flag `wheel + 0x334`.
- Reads contact profile pointer `wheel + 0x348`.
- Reads resolved suspension load `wheel + 0x344`.
- Reads `ABS(wheel + 0x378)` as a tire-force multiplier/blend input.
- Front/two-wheel and rear/two-wheel loops are separate.
- Computes contact-point velocity from linear and angular body velocity.
- Accumulates force into `vehicle + 0x2a0/+0x2a4/+0x2a8`.
- Accumulates torque into `vehicle + 0x2b0/+0x2b4/+0x2b8`.
- Applies a high angular-speed yaw/steering assist branch when angular speed exceeds `FLOAT_0067de74`.
- Calls `SteeringRack_GetCounterSteerAssistIndex` @ `0x00441990` near `0x0042b396`.

Key tail inputs:

- `vehicle + 0x1dd4`
- `vehicle + 0x1dd8`
- `vehicle + 0x1de0`
- `vehicle + 0x1de4`
- `vehicle + 0x1dec`
- `vehicle + 0x1df4`
- `vehicle + 0x1df8`
- `vehicle + 0x1dfc`
- `vehicle + 0x1e00`
- `vehicle + 0x1e04`
- `vehicle + 0x1e0c`
- `vehicle + 0x2bc`

Porting implication: current web combined-slip approximations are known temporary scaffolding. Exact drift, handbrake, and donut behavior requires porting this force stage against native-style contact profiles and wheel runtime fields.

## Steering Assist

`SteeringRack_BuildAssistLookupTable` @ `0x00441db0` builds the rack assist lookup after tire dynamics are loaded.

Confirmed consumers:

- `SteeringRack_UpdateSelfAligningTorque` @ `0x00441b90`
- `Vehicle_AccumulateWheelTireAndSteeringForces` tail call at `0x0042b396`

Confirmed `SteeringRack_GetCounterSteerAssistIndex` @ `0x00441990` gates lookup use by:

- lower speed/input threshold `rack + 0x68`
- upper threshold `rack + 0x2a4`
- secondary absolute-input limit `rack + 0x2a8`

`Drivetrain_ApplyThrottleControlClamp` @ `0x00441ae0` is the rack/request clamp path despite the misleading older name. It writes `rack + 0x270` and applies a dynamic cap from vehicle fields `+0x300/+0x304/+0x370/+0x374`.

Porting implication: steering feel comes from player input shaping, rack clamp/assist, self-aligning torque, and the tire-force tail. `Steering_PC` speed limits alone are not sufficient.

## Drivetrain And Differential

`Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090` is the driven torque stage.

Confirmed behavior:

- Uses nonlinear throttle scalar `c * 0.3 + c^3 * 0.7`.
- Dispatches into `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`.
- Handles FWD/RWD/AWD branches.

`Differential_SolveLeftRightWheelTorques` @ `0x004408d0`:

- Consumes child gear/wheel nodes at diff `+0x8/+0xc`.
- Reads child `+0x14`, `+0x2c`, `+0x38`, `+0x3c`.
- Reads wheel `+0x398`.
  - Raw disassembly confirms the child gear node is converted back to the wheel object base with `childNode - 0xf0` at `0x00440900` and `0x0044090e`.
  - The left wheel value is loaded as float at `0x00440918`; the right wheel value is loaded from the corresponding wheel base at `0x0044091e`.
- Uses diff mode `+0x48` and state `+0x44`.
- Writes diff outputs `+0x50/+0x54/+0x58`.

Confirmed producer for the drivetrain-read `wheel + 0x398`:

- `FUN_0043c060` @ `0x0043c060` is the live wheel visual/suspension callback held in vtable slot `0x0066a97c`.
- The wheel constructor at raw code `0x0043b970` installs vtable `0x0066a95c` and initializes `wheel + 0x398 = 0` at `0x0043b9fa`.
- `FUN_0043bf40` @ `0x0043bf40` is a reset/state callback that also zeroes `wheel + 0x398` at `0x0043bf67`.
- `FUN_0043c060` computes normalized wheel compression as `wheel + 0x34c` divided by `wheel + 0x354`.
  - If object state `wheel + 0x10` is not `1`, it zeros `wheel + 0x398` and returns.
  - If normalized compression is `<= FLOAT_0067dd38`, it zeros `wheel + 0x398`.
  - If normalized compression is above that threshold, it accumulates timestep: `wheel + 0x398 += dt` at `0x0043c444..0x0043c44a`.
  - It then uses the normalized compression multiplied by `wheel + 0x35c` to build the visual wheel rotation matrix with `fcos`, and updates the child visual/dynamic object transform.
- `DamageVisualConsumer_TriggerDetachedProxyImmediately` @ `0x0043c5a0` also reads `object + 0x398`, but xrefs show it is called from `Vehicle_ProcessCollisionDamageStep`; that is a detached damage visual/proxy activation guard, not the drivetrain producer.

Porting implication: for differential parity, `wheel + 0x398` is not wheel angular velocity. It is a per-wheel contact/compression spin-time accumulator owned by the wheel callback path and only increases while the wheel is in active state with compression above the native threshold.

`Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`:

- Updates per-wheel rate terms using wheel radius fields.
- Refreshes aggregate driven wheel rate and gearbox recommendation.
- Calls `Gearbox_GetRecommendedGear` and refreshes ratio/control axes when gear changes.

Porting implication: equal torque split cannot match standing donuts or one-wheel spin. The differential solver and wheel-rate feedback are required.

## Rigid Body And Airborne Behavior

`PhysicsBody_IntegrateForcesAndPose` @ `0x00564410` calls `PhysicsBody_IntegratePoseFromVelocities` @ `0x00564640`.

Confirmed behavior:

- Converts accumulated force/torque through inverse inertia/world matrix.
- Integrates linear velocity.
- Integrates angular velocity.
- Clamps angular velocity components.
- Integrates position and quaternion orientation.
- Normalizes quaternion.
- Rebuilds body matrix.
- Applies linear and angular damping.

Porting implication: no native airborne upright/default reset was found in this path. Airborne attitude should preserve angular velocity and respond to accumulated torque, impact forces, and damping.

## Resolved Core Producers

- `wheel + 0x378` is the `SlideControl` float in the tire profile data.
- `wheel + 0x398` is produced by the live wheel callback `FUN_0043c060` @ `0x0043c060`, initialized in the wheel constructor at raw code `0x0043b970`, and consumed by `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`.

No remaining core driving producer is currently blocked on an unknown address from this pass.

## Full Driving Port Target

For one-car driving parity, port this set as one coherent runtime:

1. Native-style control channels and local input shaper.
2. `Vehicle_SampleWheelGroundContacts` data contract, even if backed by a temporary JS/Rapier query.
3. `Vehicle_ResolveWheelSuspensionLoads`.
4. `Vehicle_AccumulateAerodynamicAndInputForces`.
5. `Vehicle_ComputeBrakeAndHandbrakeWheelTorques`.
6. `Vehicle_AccumulateWheelTireAndSteeringForces`.
7. `Drivetrain_DistributeTorqueToDrivenWheels`.
8. `Differential_SolveLeftRightWheelTorques`.
9. `Drivetrain_UpdateWheelRatesAndAutoShift` / gearbox rate path.
10. Steering rack assist/clamp functions.
11. Native rigid-body force/torque integration.
12. `Vehicle_FinalizeSubstepAndUpdateAttachments`.

For full wall/cone/dynamic-object parity, the later target is the world collision engine:

- `PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`
- `PhysicsWorld_GenerateContactManifolds` @ `0x005692b0`
- `PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`
- `PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`
- dynamic-object live-set activation and vehicle damage/contact queues

Conclusion: the remaining driving-feel work is no longer blocked on unknown subsystems. It is blocked on implementing the confirmed native data flow faithfully and translating decompiler-bad types into clean runtime structs.

## Web Port Implementation Step 2026-06-09

Files updated:

- `src/game/physics.js`
- `src/game/hud.js`

Implemented a staged original-JS drivetrain pass from the confirmed native anchors:

- Added a per-wheel `spinContactTimer` field corresponding to the drivetrain-read `wheel + 0x398` lifecycle.
  - Current JS producer resets the field when the wheel is ungrounded or normalized compression is below a threshold.
  - Current JS producer increments by fixed-step `dt` while the wheel is grounded/compressed.
  - Native anchor: `Wheel_UpdateVisualSuspensionAndSpinTimer` @ `0x0043c060`, reset callback `0x0043bf40`, constructor init at raw code `0x0043b970`.
- Added persistent front/rear differential runtime state.
- Moved drive torque computation into an axle pre-pass instead of equal per-wheel computation inside each tire solve.
- Kept the confirmed nonlinear throttle scalar `c * 0.3 + c^3 * 0.7` before differential splitting.
- Added a stateful left/right differential bias based on left/right wheel rate difference, differential `Inertia`, `Speed` curve, `Brake` curve, and the new `spinContactTimer` scale.
- Added temporary HUD telemetry:
  - `Rear 398`
  - `Diff bias R`
  - `Diff L rate`
  - `Diff R rate`
  - `Drive` now reports summed original-JS wheel drive torque instead of staying empty.

Limit:

- This is not a byte-level port of `Differential_SolveLeftRightWheelTorques`; the native function has x87-heavy branches and mode-specific state updates that still need a stricter translation if this staged implementation does not match tests.
- The current JS `spinContactTimer` threshold/scale is structurally based on the confirmed native lifecycle but not yet tied to recovered numeric values for `FLOAT_0067dd38`, `FLOAT_0067dc2c`, `FLOAT_0067e128`, and `FLOAT_0067dc00`.
- `Drivetrain_UpdateWheelRatesAndAutoShift` is represented through existing wheel angular velocity/RPM coupling, not yet as the native per-wheel rate fields at vehicle offsets `+0xb1c`, `+0xebc`, `+0x125c`, and `+0x15fc`.

Immediate tests:

1. RWD car, standstill, full left/right steer, full throttle: check whether rear slip rises, `Rear 398` climbs after contact settles, and `Diff bias R` becomes non-zero during the burnout circle.
2. Straight launch: check whether left/right rear diff rates stay close and the car no longer gets an artificial side pull.
3. Handbrake entry at moderate speed: check whether `Diff bias R` and rear slip change without causing soap-like uncontrolled slide.

## Web Port Correction 2026-06-09: Brake, Airborne, Donut Repros

Live testing showed:

- `Rear 398` correctly climbs while the car remains grounded/compressed. This is expected for the raw native-style accumulator; the differential input scale reaches full weight after the warmup window, but the raw timer keeps accumulating.
- Donut behavior was still weak in live testing even after `Rear 398` became active.
- Holding brake/reverse while drifting or slowing could fail to scrub speed.
- Airborne attitude tended to return toward a default orientation instead of preserving angular attitude.

Implementation corrections:

- `src/game/physics.js`
  - Reverse entry now requires a fresh low-speed brake press and low total horizontal speed. Holding brake from speed remains braking and cannot silently become reverse throttle mid-stop.
  - Added a contact-plane scrub force in the tire/contact stage. It opposes loaded-wheel planar velocity under brake, handbrake, reverse counter-drive, or low-input coast, so sideways drift can bleed speed through wheel contact rather than sliding indefinitely.
  - Airborne orientation now preserves the current body up vector when contacts drop to zero instead of resetting the attitude basis to world-up.
  - Added rear driven high-slip longitudinal release under low-speed, high-steer throttle so standing donut attempts do not convert all wheelspin into a widening powered circle.
- `tools/original-js-driving-repro.mjs`
  - Added focused original-JS headless coverage for:
    - standing full-lock throttle donut onset
    - straight acceleration then brake stop
    - sideways handbrake scrub
    - ramp/airborne attitude preservation

Verification:

- `node --check src/game/physics.js`
- `node --check tools/original-js-driving-repro.mjs`
- `node tools/original-js-driving-repro.mjs car_1`
- `node tools/original-js-driving-repro.mjs car_10`
- `node tools/original-js-driving-repro.mjs car_16`

All three repro runs pass after the correction. Limit: the repro uses simplified flat/ramp samplers, so live track testing remains authoritative for exact feel and collision/contact parity.
