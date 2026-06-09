# Vehicle Sim Loop And Rapier History 2026-06-08

Purpose: clarify the original fixed-step vehicle loop and record where the web port switched from the custom JS vehicle solver to Rapier.

## Confirmed From Ghidra

- `Vehicle_ResetPoseAndRunPhysicsSubsteps` @ `0x0042c650` contains an unconditional `100` iteration loop.
  - The loop calls `Vehicle_AccumulateAerodynamicAndInputForces` @ `0x00429640`.
  - Then `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`.
  - Then `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`.
  - Then integrates with fixed `0.01`.
- Xrefs to `0x0042c650` are reset/spawn/catch-up paths:
  - `AIPlayer_ResetToTrackSegmentSpawn` @ `0x00409e03`, `0x00409e5c`
  - `Player_ResetVehicleToTrackSpawn` @ `0x0046ef53`, `0x0046f056`
  - `PlayerHost_ResetVehiclesForRaceStart` @ `0x00471cd5`, `0x00471f22`
  - `FUN_004e3290` @ `0x004e32e4`
- Therefore the `100 * 0.01` loop is confirmed as a spawn/reset settle routine, not the normal per-render-frame driving update.

## Normal Driving Loop

- `UpdateCamera` @ `0x004725c0` is the steady-state player-host vehicle update loop.
- It loops `param_3` ticks.
- Each tick runs the player control VFT stages, then:
  - `Vehicle_AccumulateAerodynamicAndInputForces` @ `0x00429640`
  - `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`
  - `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
  - native integration with fixed `0.01`
- Interpretation: normal driving is a 100 Hz fixed-step simulation, but only the number of due ticks is run per host update. It is not `100` vehicle substeps every rendered frame.

## Confirmed In Current Web Port

- Current `src/index.js` imports `createDrivingSimulation` from `src/game/physicsRapier.js`.
- Current `src/game/physicsRapier.js` uses:
  - `FIXED_DT = 1 / 60`
  - `MAX_STEPS_PER_FRAME = 8`
  - `world.step()` each fixed step
- No current in-tree switch was found that selects between Rapier and the older custom solver.
- Current tree no longer has `src/game/physics.js`, `src/game/physicsWorker.js`, or `src/game/physicsWorkerClient.js`.

## Git History

- `166264b` (`port driving mechanics(still wip)`) added a custom JS vehicle solver at `src/game/physics.js`.
  - It used `TARGET_SUBSTEP_DT = 1 / 120`, `MIN_SUBSTEPS = 1`, `MAX_SUBSTEPS = 4`.
  - It implemented its own state, wheel contact sampling, tire force approximations, gearbox, yaw torque, and scene-graph pose integration.
- `577e16e` (`wip: move physics to rapier`) added `src/game/physicsRapier.js`.
  - It also left `src/game/physics.js` in the tree.
  - `src/game/physicsWorkerClient.js` at this revision is a thin wrapper that imports `createDrivingSimulation` from `./physicsRapier` and returns the Rapier implementation.
  - This is the commit where the live path effectively moved to Rapier.
- `f69d8cf` (`wip: optimize performance`) deleted:
  - `src/game/physics.js`
  - `src/game/physicsWorker.js`
  - `src/game/physicsWorkerClient.js`
  - It changed `src/index.js` to import `createDrivingSimulation` directly from `./game/physicsRapier`.

## Porting Implication

- Resurrecting the old custom solver should start from `166264b:src/game/physics.js` or `577e16e^:src/game/physics.js`.
- That solver is not a confirmed 1:1 native port, but it is the last non-Rapier vehicle-authority path.
- A better next architecture is a dual implementation boundary:
  - keep Rapier for static/dynamic world collision experiments,
  - restore a custom vehicle-authority implementation behind the same `createDrivingSimulation` contract,
  - drive it at fixed `0.01` ticks to match the original steady-state cadence,
  - keep the `100 * 0.01` settle loop only for reset/spawn behavior if needed.

## Current Port Step 2026-06-08

- Restored `577e16e^:src/game/physics.js` into the current tree as the temporary non-Rapier vehicle-authority path.
- Added `src/game/drivingSimulation.js` as the implementation boundary:
  - `"Rapier"` keeps using `src/game/physicsRapier.js`
  - `"Original JS"` uses restored `src/game/physics.js`
- Added a temporary lil-gui Runtime control named `Physics mode`.
- Updated the restored custom solver timing from variable `1/120`-target substeps to a fixed `0.01` accumulator capped at `8` catch-up ticks per render frame.
- Updated restored fallback `Steering_PC` defaults to the Ghidra-confirmed values from `SetPlayerControllerSteeringValues` @ `0x00469f50`.

Limit: this is a testable resurrection path, not yet a 1:1 native physics port. The next implementation pass should replace the restored solver's approximated `updatePlayerControls`, wheel force, drivetrain, and finalize stages with the function set listed in `ORIGINAL_VEHICLE_PHYSICS_PORT_TARGETS_2026-06-08.md`.

## Custom Solver Replacement Pass 2026-06-08

- Replaced the restored solver's simple input ramp with the richer native-inspired control shaper previously developed in the Rapier path:
  - throttle/reverse/counter-slip ramping is now staged before control-channel use
  - steering now filters speed and raw input, tracks digital-input hysteresis, applies hold-time/high-speed authority reduction, and uses `SteeringSpeedRate`
  - custom state now tracks `steerLimit`, `steerTarget`, `steerSpeedKph`, `steerDigitalMode`, and drift-recovery timing
- Fixed front wheel visual steering quaternion order:
  - steering yaw is now applied before the tire's authored base quaternion, then tire spin is applied
  - this targets the observed front-wheel tilt while steering in `Original JS` mode
- Added custom-solver wheel slip and force bookkeeping:
  - per-wheel `slipRatio`, `slipAngle`, longitudinal/lateral speeds, and force components are written during `accumulateWheelForces`
  - state-level `slipLongAvg` and `slipLatAvg` are updated after fixed ticks
  - `getDebugState()` now reports slip/grip fields expected by telemetry/HUD
- Replaced the restored drivetrain throttle blend with the Ghidra-confirmed nonlinear drive scalar used by `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`: `c * 0.3 + c^3 * 0.7`.
- Added a temporary reverse-drive torque taper in `Original JS`:
  - the limit is derived from shipped reverse gear ratio, final drive, driven wheel radius, and engine redline
  - reverse torque fades out near that computed speed instead of hard-clamping vehicle velocity

Remaining limit: wheel force, drivetrain, gearbox finalization, and contact sampling are still the resurrected JS solver's approximations. They are now better staged and better instrumented, but still need direct replacement from the Ghidra-confirmed vehicle functions for true parity.

## Custom Collision/Surface Pass 2026-06-08

- Switched the app default driving mode to `"Original JS"` while leaving `"Rapier"` selectable in the HUD for comparison.
- Added custom body-track contact probes behind `debugOptions.bodyContacts`:
  - eight horizontal body probes use the collision sampler's `raycast`
  - wall hits push the car out and remove velocity into the wall
- Added ground-normal orientation:
  - wheel contact normals are averaged into `state.groundNormal`
  - vehicle orientation now projects yaw onto that normal so the car tilts with sloped road
- Added a loose custom dynamic-object layer for `Original JS` mode behind `debugOptions.customDynamicObjects`:
  - dynamic track metadata is converted into lightweight render-node bodies
  - cones/tires/barrels/boxes can be pushed by the custom car without making Rapier the driving authority

Limit: prop interaction is intentionally loose and does not yet use the Rapier dynamic-body path. It is meant as a temporary bridge until the custom vehicle authority can drive a Rapier helper body or the original object collision path is ported.

Performance correction: routing `Original JS` wheel/body rays through `contactSampler` and enabling body probes in the default loop caused severe frame time spikes on full tracks. The default `Original JS` path now uses the render-scene floor sampler again, while `bodyContacts` and `customDynamicObjects` remain opt-in experiments.

## Ghidra Collision Follow-Up 2026-06-09

- Confirmed the native wheel-ground contact path is its own porting target, not just a generic physics-engine raycast:
  - `Vehicle_SampleWheelGroundContacts` @ `0x0042bcc0`
  - `CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0`
  - `CollisionSpatial_RaycastTriangleSoup` @ `0x005639e0`
- Confirmed the full original collision engine is larger than the current vehicle solver pass:
  - `PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`
  - `PhysicsWorld_GenerateContactManifolds` @ `0x005692b0`
  - `PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`
  - `PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`
- Implementation implication: the next practical step is to port original static wheel-contact sampling into `Original JS` mode first. Removing Rapier completely may be possible later, but full object/collision parity requires the broadphase, contact manifold, island solver, live-set activation, and vehicle damage/contact queue paths documented in `ORIGINAL_COLLISION_ENGINE_PORT_ASSESSMENT_2026-06-09.md`.

## Original JS Contact/Suspension Pass 2026-06-09

- Updated `Original JS` wheel contacts to prefer suspension-axis `raycast` sweeps instead of only vertical floor samples.
- Wheels now become grounded only after compression is positive, which better matches the native contact/compression dependency.
- Replaced the old static-ish wheel load scalar with a spring/damper load derived from shipped default compression, bump/rebound damping, and per-wheel compression velocity.
- Suspension force now contributes to chassis acceleration and pitch/roll attitude instead of only scaling tire forces and wheel visuals.
- Gravity now remains active while grounded, making springs responsible for supporting the chassis.
- Tire force response now uses saturated slip/load sensitivity and a stronger rear handbrake grip reduction to make drift behavior less binary after dynamic suspension loads are introduced.

Limit: this is still a staged web implementation using the existing extracted track sampler. Exact parity still needs deeper porting of `Vehicle_SampleWheelGroundContacts` and `Vehicle_ResolveWheelSuspensionLoads` offsets/constants.

### Roll Correction 2026-06-09

- Fixed a regression where the car could tip onto the right side and stay there:
  - the first suspension pass added a simplified pitch/roll torque accumulator that does not exist as a separate native visual stage
  - Ghidra confirms native suspension torque is part of the physics accumulator path, while post-step angular feedback reads integrated angular deltas
  - the web solver temporarily derived bounded visual pitch/roll from current compression deltas instead of accumulating it
  - anti-roll force sign was corrected so axle imbalance is resisted rather than amplified

### Suspension Load And Airborne Integration Pass 2026-06-09

- Replaced the compression-only attitude target with angular-rate integration:
  - suspension force now returns a local pitch/roll torque proxy from wheel lever arms
  - `pitchRate` and `rollRate` integrate each fixed substep and are damped separately for grounded vs airborne state
  - airborne damping is intentionally weak, so the car preserves angular inertia instead of returning to a default attitude
- Added a native-style resolved load blend:
  - per-wheel spring/damper load is still computed in the JS solver
  - left/right axle loads are blended before tire force accumulation, matching the `wheel+0x344` post-resolution role found in `Vehicle_ResolveWheelSuspensionLoads`
- Added angular impulses for body wall/object impacts so contacts can perturb pitch/roll/yaw, not only linear velocity.
- Regression guard after runtime test:
  - sanitized wheel contact normals before using them for ground orientation and suspension force
  - gated raw suspension roll torque at low speed so spawn/first-contact imbalance cannot roll the car onto its side
  - added HUD fields for pitch, roll, pitch rate, and roll rate
- Straight-line rollover correction:
  - runtime HUD showed `Roll=26.5` and `Roll Rate=75.3 deg/s` during full-throttle straight-line driving with zero steering
  - disabled suspension-generated roll torque entirely; the proxy lever-arm torque is not faithful enough to use as roll authority
  - grounded roll rate and extra roll angle are now clamped more tightly, while airborne roll inertia remains less constrained
  - roll should now come from ground-normal alignment, bounded compression alignment, and explicit impacts until the native body angular solver is ported more directly
- Contact/suspension parity follow-up:
  - `Original JS` now accepts `trackContactSampler` and uses the extracted collision/contact sampler for wheel contact rays when available, falling back to the scene sampler on misses
  - per-wheel state now tracks native-style suspension displacement, velocity, and overshoot terms alongside compression
  - first-contact compression velocity is clamped separately from sustained contact velocity to avoid damping spikes when a wheel reacquires the ground
  - spring/damper final load clamp was lowered to reduce two-wheel high-speed instability while native `Vehicle_ResolveWheelSuspensionLoads` is still approximated
- Performance correction:
  - using the extracted collision/contact sampler for every wheel ray every fixed substep caused `stepVehicle` spikes around hundreds of milliseconds on normal tracks
  - default `Original JS` wheel sampling is back on the faster scene sampler
  - the heavier extracted contact sampler is now opt-in through the existing `Surface sampler` physics isolation toggle

Limit: this is still not a byte-level port of `Vehicle_ResolveWheelSuspensionLoads`. The remaining exact-parity work is to replace the JS spring/damper constants and contact sampler with the recovered `vehicle+0x188c..0x18b4` runtime block semantics and native static triangle query.
