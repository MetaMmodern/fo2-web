# Original Collision Engine Port Assessment 2026-06-09

Purpose: record the Ghidra-confirmed collision pieces relevant to replacing Rapier and improving the custom original-style vehicle solver.

## Confirmed Vehicle Contact Path

`Vehicle_SampleWheelGroundContacts` @ `0x0042bcc0` is the primary missing vehicle-contact bridge.

Confirmed behavior:

- builds one broad query box around the four wheel travel ranges
- queries the authored environment collision structure through `CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0`
- tests per-wheel rays/sweeps through `CollisionSpatial_RaycastTriangleSoup` @ `0x005639e0`
- writes per-wheel contact state used by the next suspension/tire stages:
  - contact flag
  - contact normal and position
  - material/contact slot id
  - compression/displacement terms
  - contact pointer terms consumed by `Vehicle_AccumulateWheelTireAndSteeringForces`

Detailed offset map from the 2026-06-09 Ghidra pass:

- per-wheel runtime block base: `vehicle + 0x0a00 + i*0x03a0`
- per-suspension runtime block stride: `vehicle + 0x188c + i*0x40`
- contact flag: `wheel + 0x334`
- contact profile/material pointer: `wheel + 0x348`
- contact vector copy: `wheel + 0x34c/+0x350/+0x354`
- material/contact slot id: `vehicle + 0x28ac + i*4`
- contact point array: starts around `vehicle + 0x28bc`, stride `0x0c`
- contact normal array: starts around `vehicle + 0x28ec`, stride `0x0c`
- suspension predictor position/state: `wheel + 0x74`
- suspension compression/displacement term: `vehicle + 0x18a4 + i*0x40`
- suspension velocity term: `vehicle + 0x18a8 + i*0x40`
- suspension overshoot/bump term: `vehicle + 0x18b4 + i*0x40`

Porting implication: this should be the next vehicle-side porting target before tuning drift/handbrake further. A generic mesh raycast can put the car on the road, but native tire feel depends on the exact contact data pipeline and material terms this function writes.

## Confirmed Suspension Force Path

`Vehicle_ResolveWheelSuspensionLoads` @ `0x0042b8c0` is the native suspension-load stage called from `Vehicle_AccumulateAerodynamicAndInputForces` before tire forces.

Confirmed behavior:

- runs once per fixed vehicle tick after wheel contacts from the previous/finalize stage are available
- reads per-wheel contact state from wheel runtime blocks
- computes a per-wheel spring/damper load from:
  - current displacement/compression terms
  - previous wheel displacement/state
  - timestep fields `vehicle + 0x1e08` and `vehicle + 0x1e0c`
  - bump/rebound-like damping terms from the suspension config/runtime block
  - front/rear paired wheel load transfer terms
- clamps negative load to zero
- adds the resulting suspension force into chassis force accumulator `vehicle + 0x2a0/+0x2a4/+0x2a8`
- adds torque from the wheel contact point/lever arm into `vehicle + 0x2b0/+0x2b4/+0x2b8`
- stores the resolved per-wheel load back into the wheel runtime block
- blends paired wheel terms through `vehicle + 0x1de8` when both wheels on an axle are grounded

Detailed offset map from the 2026-06-09 Ghidra pass:

- function entry: `Vehicle_ResolveWheelSuspensionLoads` @ `0x0042b8c0`
- wheel iterator starts at `vehicle + 0x0d18` (`wheel + 0x318`), stride `0x03a0`
- contact flag read: `wheel + 0x334`
- final resolved suspension load write: `wheel + 0x344`
- suspension block iterator starts at `vehicle + 0x18ac`, stride `0x40`
- compression/displacement input: `vehicle + 0x18a4 + i*0x40`
- suspension velocity input: `vehicle + 0x18a8 + i*0x40`
- spring/progressive/damper terms live in the same `vehicle + 0x188c..0x18b0 + i*0x40` block
- force direction is vehicle up axis `vehicle + 0x1c0/+0x1c4/+0x1c8`
- force accumulator: `vehicle + 0x2a0/+0x2a4/+0x2a8`
- torque accumulator: `vehicle + 0x2b0/+0x2b4/+0x2b8`
- front axle load blend: contact flags at `vehicle + 0x0d34/0x10d4`, loads at `vehicle + 0x0d44/0x10e4`
- rear axle load blend: contact flags at `vehicle + 0x1474/0x1814`, loads at `vehicle + 0x1484/0x1824`
- axle blend factor: `vehicle + 0x1de8`

Porting implication: the current web custom solver's `computeWheelLoad` scalar is not equivalent to this native function if it only influences tire grip/force magnitudes. Native suspension physically pushes the chassis and creates pitch/roll torque before the tire-force stage.

## Static Collision Query Anchors

`CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0`

Confirmed behavior:

- builds transformed query bounds from caller extents and world matrix
- traverses a collision tree owned by the environment structure
- filters candidate leaves/triangles by flags and material masks
- writes triangle/contact candidates into a caller-provided buffer

`CollisionSpatial_RaycastTriangleSoup` @ `0x005639e0`

Confirmed behavior:

- consumes candidate triangle data from the query buffer
- performs ray/sweep tests against triangle faces and edges
- writes hit position, normal, and material id
- has a fallback path for near-zero ray direction through `FUN_00563ff0`

Porting implication: these functions are small enough in scope to port before the whole physics world. They are also the likely replacement for the current expensive fallback floor/contact sampler in `Original JS` mode.

## World Collision Engine Anchors

`PhysicsWorld_StepActiveBodiesAndContacts` @ `0x0056c850`

Confirmed behavior:

- normal `UpdateCamera` calls this after per-vehicle force accumulation
- clears per-step world counters
- runs active-body callbacks
- builds and solves contact islands
- integrates active bodies
- updates sleep/activation bookkeeping

`PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`

Confirmed behavior:

- walks active body overlap links
- filters flags, masks, sleeping/active states, and already-known pairs
- queues potential contact pairs
- activates dynamic objects into the environment live set through `DynamicObject_RegisterIntoEnvironmentLiveSet`

`PhysicsWorld_GenerateContactManifolds` @ `0x005692b0`

Confirmed behavior:

- consumes queued potential body pairs
- generates contact manifolds and impact/contact records
- handles body-body and active-body-vs-static-triangle contacts
- emits damage visual contacts through `DamageVisualContacts_*`
- calls collision callbacks at body/world callback slots

`PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`

Confirmed behavior:

- prepares per-body solver data for one island
- resolves queued contacts through helper calls in the `0x00572c10` to `0x00572fb0` range
- integrates island bodies through the body integration helper path

`PhysicsBody_IntegratePoseFromVelocities` @ `0x00564640`

Confirmed behavior:

- called from `PhysicsBody_IntegrateForcesAndPose` @ `0x00564410`
- also called by `PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`
- integrates linear velocity and quaternion orientation from accumulated forces/torques and angular velocity
- normalizes the quaternion and rebuilds the body matrix
- applies linear and angular damping after integration
- does not contain an airborne upright/default orientation reset

Porting implication: if the web car returns to a default attitude in the air, that is a port-side artifact. Native airborne behavior should preserve angular velocity and impact torque through the rigid-body integrator until contact forces or damping change it.

`PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`

Confirmed behavior:

- recomputes body integer AABBs from transforms and collision shape bounds
- reinserts changed ranges into the broadphase axes

Porting implication: full collision parity is recoverable, but it is a real engine port. It includes broadphase state, pair filtering, manifold/contact generation, island solving, body integration, sleep/activation flags, dynamic-object live-set transitions, and collision callbacks. It is not a thin collision-response shim.

## Vehicle Damage And Object Impact Coupling

`Vehicle_ProcessCollisionDamageStep` @ `0x004293c0`

Confirmed behavior:

- flushes queued vehicle collision records
- updates wheel visuals, crash jitter, detached part transforms, material states, and damage models
- calls `Vehicle_ApplyCollisionDamageAndDeformation` when damage processing is enabled

`Vehicle_ApplyCollisionDamageAndDeformation` @ `0x00426670`

Confirmed behavior:

- consumes queued collision records from the vehicle damage/contact queue
- scales damage by game mode and damage tables
- updates body bounds and damage level
- breaks panels and posts wreck/ragdoll events
- clears consumed contact records

Porting implication: matching breakable props and car-body impacts eventually needs native-style contact records, not only positional pushback. Rapier can remain a temporary prop-collision helper, but exact object/collision feel will require porting the native record generation and damage consumers.

## Recommended Next Porting Order

1. Port `Vehicle_SampleWheelGroundContacts` plus `CollisionSpatial_QueryTransformedAabbTriangles` and `CollisionSpatial_RaycastTriangleSoup` against the existing extracted static collision assets.
2. Port `Vehicle_ResolveWheelSuspensionLoads` so spring/damper load becomes a chassis force/torque stage instead of only a load scalar for tire grip.
3. Feed the native-style wheel contact records into the current `Original JS` vehicle solver and replace the remaining approximate contact/material terms.
4. Port the remaining vehicle force functions before retuning drift/handbrake:
   - `Vehicle_ResolveWheelSuspensionLoads`
   - `Vehicle_AccumulateWheelTireAndSteeringForces`
   - `Drivetrain_DistributeTorqueToDrivenWheels`
   - `Gearbox_UpdateShiftStateAndOutputShaft`
5. Only after vehicle-contact parity is working, decide whether to port the full world collision engine:
   - broadphase and pair filters
   - manifold generation
   - island solver and body integration
   - dynamic-object live-set activation
   - damage/contact queues

Conclusion: removing Rapier completely is plausible, but the immediate blocker for vehicle feel is not the full world solver. The next high-value port is the original wheel-ground contact path plus native suspension-load resolution, because those directly drive road tilt, surface/material behavior, suspension load, drift onset, pitch/roll, and wheel force inputs.

## Web Implementation Pass 2026-06-09

Implemented a first native-inspired pass in `src/game/physics.js` for `Original JS` mode:

- wheel contact sampling now uses a suspension-axis sweep through `trackFloorSampler.raycast` before falling back to the older vertical floor sample
- contact state now evaluates compression before declaring a wheel grounded, so far-away floor hits no longer imply active suspension contact
- wheel state now tracks previous compression, compression velocity, and resolved suspension force
- spring rate is derived from shipped default compression and static wheel load
- suspension load now applies chassis force along the contact normal and pitch/roll visual torque from each wheel lever arm
- gravity is applied while grounded so suspension is responsible for holding the body up
- spawn/reset placement uses default compression so the car starts sitting on its springs
- tire force response now uses a saturated slip curve and load sensitivity so the new spring loads do not create unbounded tire force spikes
- handbrake rear lateral grip reduction is slightly stronger and front grip is biased up during handbrake to make rear breakaway cleaner

Limit: this is not yet a byte-level port of `Vehicle_ResolveWheelSuspensionLoads` or `Vehicle_SampleWheelGroundContacts`. It is a staged implementation that moves the web solver closer to the confirmed native data flow while remaining compatible with the existing extracted sampler.

## Roll Accumulator Correction 2026-06-09

Follow-up Ghidra check:

- `Vehicle_ResolveWheelSuspensionLoads` accumulates suspension force and lever-arm torque into the vehicle physics accumulators.
- `Vehicle_UpdateAngularAccelerationFeedback` consumes actual angular velocity deltas and feedback terms after integration.
- No separate native "visual roll accumulator" equivalent was found in this path. Body attitude comes from the integrated rigid-body state and camera/feedback consumers read from that state.

Implementation correction in `src/game/physics.js`:

- removed the simplified pitch/roll torque accumulator introduced in the first suspension pass
- corrected anti-roll force direction so the more-compressed wheel receives opposing support instead of worsening axle imbalance
- replaced accumulating visual pitch/roll with a bounded compression-derived attitude target with a small dead zone

Reason: the accumulating visual roll could ratchet from small asymmetric contact or load errors and stay stuck until all contacts were lost, which matches the observed right-side tipping bug.

## Suspension Load And Airborne Integration Implementation 2026-06-09

Follow-up implementation in `src/game/physics.js`:

- `accumulateSuspensionForces` now returns both chassis force and a local pitch/roll torque proxy from each wheel lever arm.
- `applySuspensionAngularImpulse` turns that torque into `pitchRate`/`rollRate`.
- `integrateVehicleAngularState` integrates those angular rates every fixed substep.
- Grounded damping remains stronger, but airborne damping is weak and no longer retargets pitch/roll toward zero.
- `blendResolvedAxleLoads` blends left/right axle loads before tire force accumulation, matching the native observation that `Vehicle_ResolveWheelSuspensionLoads` writes final per-wheel load to `wheel + 0x344`.
- Body-wall and dynamic-object contact responses now add angular impulses, so impacts can change pitch/roll/yaw instead of only pushing the chassis linearly.

Porting implication: the web solver is now structurally closer to the native body path found at `PhysicsBody_IntegratePoseFromVelocities` @ `0x00564640`, but still uses approximate JS constants for inertia, damping, and the suspension runtime block. Exact parity still requires porting the `FUN_00439a90` suspension block constructor, the `vehicle + 0x18b4` reset slot, and the native triangle contact query.

## Unified Body Orientation Correction 2026-06-09

Implementation correction in `src/game/physics.js`:

- removed the web-only split between grounded orientation alignment and airborne quaternion integration
- removed the compression-derived visual pitch/roll limiter from the active solve path
- changed suspension load resolution to accumulate a world-space force and torque at each wheel lever arm
- changed wall/body contact angular feedback to write the same body angular velocity vector
- wheel visuals now place tires from the wheel contact point plus contact normal/radius when grounded, instead of using the previous signed body-local suspension offset

Reason: the confirmed native body path at `PhysicsBody_IntegratePoseFromVelocities` @ `0x00564640` integrates one rigid-body quaternion from angular velocity and does not contain a separate airborne attitude mode or a grounded visual attitude painter. The previous web split could make the car appear glued to wheel/body transforms and could hide real spring response behind rendered pitch/roll correction.

## Tire Force Reaction Slice 2026-06-09

Follow-up Ghidra check of `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`:

- confirmed contact flag/pointer consumption at `wheel+0x334` and `wheel+0x348`
- confirmed aggregate contact profile reads from the contact pointer at `+0x4c`, `+0x50`, and `+0x54`
- confirmed per-wheel force scaling reads from contact pointer offsets `+0x44` and `+0x48`
- confirmed force scaling uses `ABS(wheel+0x378)`, matching the existing telemetry name `wheel_i_tire_force_multiplier_candidate`
- confirmed the function accumulates force/torque into `vehicle+0x2a0..+0x2b8` after the suspension-load stage

Implementation in `src/game/physics.js`:

- driven wheel angular velocity is no longer hard-synced to road speed each fixed step
- slip ratio now uses both contact longitudinal speed and wheel surface speed in the denominator
- longitudinal tire force feeds back into the wheel as opposing reaction torque
- lateral and longitudinal tire force now share a combined-slip scale
- debug wheel entries expose drive torque, brake torque, and tire reaction torque

Limit: this is a structural parity slice, not the full native tire-force formula. The JS path still approximates the native contact material profile terms and does not yet port the exact `wheel+0x378` producer or the tail steering/differential assist terms in `0x00429be0`.

## Donut And Steering Follow-Up 2026-06-09

Follow-up Ghidra check of `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`:

- The native tire-force path does not present as a single combined-slip ellipse. It accumulates separate contact-space forces:
  - one force along the vehicle/front contact basis using contact `+0x44`, contact `+0x48`, wheel/runtime multiplier `ABS(wheel+0x378)`, speed/load scale `vehicle+0x1c98`, and the steering/traction scalar from `vehicle+0x1ce4`
  - one force along the per-wheel contact/rolling basis using `(1 - contact+0x44)`, contact `+0x48`, the same `ABS(wheel+0x378)` blend, and speed/load scale
- The tail of the same function applies additional yaw/steering assist:
  - a high angular-speed assist branch uses `vehicle+0x1dd4`, `vehicle+0x1dd8`, aggregate contact `+0x4c`, and current steer `vehicle+0x1e04`
  - a counter-steer assist branch calls `SteeringRack_GetCounterSteerAssistIndex` @ `0x00441990` from `0x0042b396`
- `Steering_PC.h` shipped values are:
  - `SteeringLimitRate = { 1, 0.8, 0.5, 0.25 }`
  - `SteeringSpeedRate = { 2, 2, 2, 2 }`
  - `SteeringLimitSpeed = { 20, 40, 100, 250 }`

Implementation correction in `src/game/physics.js`:

- updated the original-JS fallback steering table to match shipped `Data/Physics/Car/Steering_PC.h`
- removed extra web-only high-speed steering authority suppressors that compounded on top of the native steering limit curve
- kept only a small digital-hold rate scale and a weaker near-limit steer-in slowdown
- replaced the rear non-handbrake stability boost with driven-wheel lateral release as longitudinal slip rises
- lowered the combined-slip minimum from `0.32` to `0.24`
- corrected HUD `Steer target` to report the actual steering controller target

Limit: the web solver still does not port the exact `wheel+0x378` producer or the two native yaw/assist branches. The new driven-wheel lateral release is a structural approximation to let powered wheels break away for standing donuts until those native producers are recovered.

## Donut Follow-Up 2026-06-09

Follow-up Ghidra check after web testing still failed to produce standing donuts:

- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
  - confirms the nonlinear throttle scalar `c * 0.3 + c^3 * 0.7`
  - distributes torque through `Differential_SolveLeftRightWheelTorques`, not an equal per-driven-wheel split
  - updates drivetrain output terms used by wheel/rate propagation
- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`
  - updates per-wheel rate terms from wheel radius fields before gear recommendation
  - refreshes aggregate driven wheel rate, part of the missing engine RPM to wheel speed coupling path
- `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`
  - consumes wheel state terms including `wheel + 0x398`, produced by `Wheel_UpdateVisualSuspensionAndSpinTimer` @ `0x0043c060`
  - converts child gear nodes back to wheel bases with `childNode - 0xf0`, then reads `wheel + 0x398` at `0x00440918` and `0x0044091e`
  - writes differential outputs at `+0x50/+0x54/+0x58`
  - contains stateful side-selection logic at diff `+0x44`, which is likely relevant to one-wheel spin and burnout/donut onset
- `Vehicle_ComputeBrakeAndHandbrakeWheelTorques` @ `0x0042c540`
  - writes per-wheel brake torques at wheel `+0x320` equivalents
  - includes low-speed steering/brake assist before the tire force stage

Implementation correction in `src/game/physics.js`:

- exposed `Slip long`, `Slip lat`, `Rear slip`, rear wheel speed, rear ground speed, and traction layout in the HUD
- replaced the monotonic tire slip response with a peak-and-fall response so excessive wheelspin reduces force instead of producing ever-more forward bite
- removed the web-only yaw torque suppression that scaled tire lever-arm yaw down to `8..55%`; current range is `35..100%`

Limit: this is still not the full native drivetrain/differential port. Exact donut parity requires porting the differential state machine and the `wheel + 0x398` compression/contact spin-time callback path rather than tuning web-side slip proxies; `+0x378` is already confirmed as `SlideControl`.

## Exhaustive Driving RE Cross-Link 2026-06-09

Focused note: `ghidra_findings/DRIVING_EXHAUSTIVE_RE_PASS_2026-06-09.md`.

The vehicle-contact and collision conclusion remains unchanged, but the tire/material side is now more concrete:

- `Wheel_LoadTireDynamics` @ `0x0043aa30` builds the `vehicle+0x1e5c` tire/material profile table from `Data.Physics.TireDynamics`.
- `Vehicle_SampleWheelGroundContacts` @ `0x0042bcc0` maps raycast material ids through environment material data and writes `wheel+0x348` to a `0x58`-stride profile in that table.
- `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0` consumes profile offsets `+0x44/+0x48/+0x4c/+0x50/+0x54`.

Porting implication: a Rapier-backed temporary query can still be used if needed, but it should produce native-style material/profile contact records. A generic `normal + distance + grip` contact is structurally insufficient for final driving parity.

## Collision Port Scope Update 2026-06-09

The available in-repo ROMU/reference source can speed up collision work where it already names recovered subsystem boundaries and data contracts, but it does not currently replace the need to decompile the native world solver if the target is full wall/cone/dynamic-object parity.

Confirmed useful source/repo assets:

- Existing extracted static collision assets under `src/data/tracks/**/geometry/collision.glb` and `collision.meta.json`.
- Prior extraction findings in `TRACK_CDB2_INITIAL_FORMAT_FINDINGS_2026-04-10.md`.
- Recovered high-level driving/collision anchors in `reference/FlatOut-2-decomp-main/source/decomp2/decomp2/DrivingSystem.*`.

Still required for a full original collision port:

- Strict `Vehicle_SampleWheelGroundContacts` parity against the extracted static collision structures, including material id to tire profile mapping.
- The physics broadphase/pair build:
  - `PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`
  - `PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`
- Contact manifold generation:
  - `PhysicsWorld_GenerateContactManifolds` @ `0x005692b0`
- Island/contact solve and body integration:
  - `PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`
  - `PhysicsBody_IntegrateForcesAndPose` @ `0x00564410`
  - `PhysicsBody_IntegratePoseFromVelocities` @ `0x00564640`
- Dynamic-object activation, sleeping, breakable/damage queues, and vehicle damage bridge:
  - `Vehicle_ProcessCollisionDamageStep` @ `0x004293c0`
  - `Vehicle_ApplyCollisionDamageAndDeformation` @ `0x00426670`

Practical conclusion:

- For driving feel, a full collision-engine port is not the immediate blocker. The highest-value collision step is native-style wheel ground contact records: point, normal, compression, material/profile pointer, and load inputs.
- For exact cones/walls/movable props, there is still substantial decompilation and implementation work. The ROMU/reference source helps as an index, but the current repo does not appear to contain a ready C++ port of the contact manifold/island solver that can be directly translated.

## Collision Versus Destruction Split 2026-06-09

Focused note: `ghidra_findings/COLLISION_AND_DESTRUCTION_SPLIT_2026-06-09.md`.

Additional Ghidra pass confirmed the collision/destruction boundary:

- `PhysicsWorld_GenerateContactManifolds` @ `0x005692b0` is the contact generation stage.
- `PhysicsWorld_AppendContactConstraint` @ `0x0056a850` appends generated contacts into the world contact graph.
- `CollisionSpatial_GenerateBodyTriangleContacts` @ `0x00570040` produces active body-vs-static triangle contacts from authored BVH/CDB data.
- `Vehicle_FlushQueuedCollisionRecords` @ `0x00426550`, `Vehicle_ProcessCollisionDamageStep` @ `0x004293c0`, and `Vehicle_ApplyCollisionDamageAndDeformation` @ `0x00426670` are damage/deformation consumers of queued collision records.
- `DynamicObject_InitializeFromLua` @ `0x00590fd0` reads both collision/runtime fields and destruction/effect fields.
- `DynamicObject_DispatchDestroyAndEmitterFx` @ `0x00591cb0` is destruction/effects dispatch, not baseline collision resolution.

Implementation strategy update:

- Do not implement cones/walls by mixing damage/destruction behavior into the first collision pass.
- First port data-driven collision body volumes, static triangle contacts, dynamic-object mass/restitution/category/inertia, activation/live-set behavior, and contact response.
- Add vehicle deformation, panel breakage, destroy FX, emitter FX, and explosion force only after baseline collision response is stable.

## No-Assumptions Collision Port Gate 2026-06-09

Focused note: `ghidra_findings/COLLISION_PORT_DATA_GAPS_2026-06-09.md`.

Current answer after the follow-up pass: the repo/Ghidra state is now sufficient to design an assumption-free native static collision path for wheel queries, active body-vs-static triangle contacts, vehicle body volumes, generated contacts, contact nodes, and per-contact solving. It is still not sufficient for a full original dynamic prop/cone/barrier implementation because dynamic-object body setup, broadphase live-set activation, material table loading, and callback/threshold structs need more field-level recovery.

Confirmed additional anchors:

- `CollisionSpatial_ClipTriangleAgainstBodyBoxContact` @ `0x00571080` emits the `0x38` body-vs-static contact record.
- `CollisionMath_ComputeTriangleBoxPenetrationDepth` @ `0x00570910` computes the exact triangle-vs-box depth used by that contact generator.
- `CollisionCdb2_ExpandLeafCommands` @ `0x0056d3d0` expands native `track_cdb2.gen` leaf command headers into `0x10` triangle candidates.
- `CollisionCdb2_DecodeTriangles_Mode0..5` @ `0x0056ce10`, `0x0056cfa0`, `0x0056d120`, `0x0056d1c0`, `0x0056d250`, and `0x0056d330` are the recovered CDB2 payload decoder modes.
- `PhysicsWorld_InitializeContactPoolsAndDefaults` @ `0x00565a10` initializes the `0x400` contact-node pool at `world+0xf720`, stride `0x44`, and installs contact vtable `0x0067bc0c`.
- `ContactConstraint_GetSolverRowCount` @ `0x0056f2b0`, `ContactConstraint_FillSolverRowsAndBounds` @ `0x0056f2d0`, and `ContactConstraint_ResetNodeLinks` @ `0x00565220` are the contact vtable methods.
- `PhysicsSolver_SolveContactConstraint` @ `0x00572fb0` is now confirmed as the per-contact projected bounded solver.
- Solver matrix/Jacobian helpers now have conservative labels at `0x00572420`, `0x005725b0`, `0x00572850`, `0x00574a50`, `0x00572da0`, `0x00572e60`, `0x005720a0`, and `0x00572250`.
- `Vehicle_LoadCollisionPanelsAndCrashConfig` @ `0x00431b50` consumes `CollisionFull*`, `CollisionBottom*`, and `CollisionTop*`; the current web full-box-only body bounds are not native-complete.

Still required before full dynamic prop implementation:

- dynamic object body/shape construction from template/config data
- broadphase pair filtering and active/live-set transitions
- final labels for contact node flags `0x10/0x20`
- final callback/threshold struct at contact node `+0x34` and helper `FUN_00564a60`
- full material table loader mapping for the consumed `0x14` material records

Implementation implication: native static collision should now be ported from raw `track_bvh.gen` / `track_cdb2.gen`, not from render-mesh material heuristics or the current W32/BVH surface subset metadata. Cones and other movable props should wait for the dynamic-object body and activation passes.
