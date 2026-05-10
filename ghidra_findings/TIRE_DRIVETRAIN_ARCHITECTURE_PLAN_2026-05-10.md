# Tire Drivetrain Architecture Plan (2026-05-10)

Scope: understand and plan a ground-up tire/drivetrain/brake/handbrake model for
the Rapier port, especially launch slip and reverse-to-forward counter-slip.

## Ghidra MCP Status

- Attempted fresh MCP decompilation on 2026-05-10.
- MCP endpoint `127.0.0.1:8080` refused the connection, so no new decompilation
  was available in this session.
- This note therefore relies on existing in-repo Ghidra-derived findings,
  shipped data, telemetry CSVs, and current port source inspection.

## Confirmed Original Anchors Already In Repo

- `Vehicle_ResetPoseAndRunPhysicsSubsteps` @ `0x0042c650`
  - Runs the main vehicle simulation with fixed `100 x 0.01` substeps.
- `Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0`
  - Main per-wheel contact/tire/steering force path.
- `Vehicle_ComputeBrakeAndHandbrakeWheelTorques` @ `0x0042c540`
  - Writes per-wheel brake torque to `wheel + 0x320`.
- `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`
  - Splits driven-axle torque across left/right wheels.
- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
  - Applies nonlinear drivetrain scalar `c * 0.3 + c^3 * 0.7` before
    differential torque split.
- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`
  - Updates wheel-rate aggregate and gearbox state from drivetrain/wheel terms.

## Confirmed Shipped Data For Bullet (`car_16`)

Source files:

- `src/data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car16.h`
- `src/data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar16.h`
- `src/data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar16.h`
- `src/data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar16.h`
- `src/data/cars/car_16/tires.ini`

Relevant values:

- Bullet mass: `1524..1675`
- Center of mass: `{0, 0.1, 0.3}`
- `FrontTraction = false`
- `RearTraction = true`
- `BrakeBalance = {0.5, 0.5}`
- `BrakeTorque = {8000, 8300}`
- `HandBrakeTorque = {8000, 8300}`
- Gearbox:
  - reverse `-4.1`
  - first `3.06`
  - end ratio `4.18`
  - clutch torque `600..800`
- Engine:
  - idle `1000`
  - peak torque `366..527` at `4000 rpm`
  - redline `5500..6600 rpm`
- Tire local dynamics from car-local `tires.ini`:
  - `XStiffness = {16280, 3.4, 0.0}`
  - `ZStiffness = {0.0, 12540, 0}`
  - `XFriction = {1.121, -0.0076}`
  - `ZFriction = {1.0, -0.0076}`
  - `PneumaticTrail = 0.04`
  - `PneumaticOffset = 0.5`

## Behavioral Requirement

The driven wheel angular state must be independent from chassis ground speed.

Expected behavior:

- Full throttle from standstill:
  - rear wheels receive engine torque immediately
  - rear angular velocity rises immediately
  - chassis speed rises only as tire contact develops longitudinal force
  - traction bite ramps naturally from slip curve/load, not from glued wheel speed
- Reverse-to-forward transition:
  - first gear can engage while chassis forward speed is still negative
  - rear wheels can spin forward while body still moves backward
  - tire contact produces opposing longitudinal force until chassis speed crosses
    zero and then accelerates forward
- Non-driven wheels:
  - do not receive engine torque
  - roll from contact/ground speed and brake torque only
- Handbrake:
  - applies rear brake torque/lock on Bullet because rear axle is driven and
    handbrake torque is authored as rear lock behavior
  - should not directly inject yaw, lateral chassis velocity, or front wheel lock
  - straight and steering cases should use the same tire/brake/contact equations

## Current Port Mismatch

Current source: `src/game/physicsRapier.js`

Observed structural issue:

- `computeDriveForceForWheel` converts engine/clutch/differential output directly
  into Rapier `setWheelEngineForce`.
- Wheel angular velocity is mostly reconstructed from Rapier wheel rotation after
  `vehicleController.updateVehicle`.
- Visual wheel omega is then post-processed separately from the physics force path.

This makes wheel spin a consequence of Rapier contact rather than the cause of
slip. That is backwards for launch burnout and reverse-to-forward bite.

The port needs wheel angular velocity as first-class simulation state:

1. Engine/clutch/differential/brake torques update wheel omega.
2. Wheel omega and chassis contact-patch velocity produce slip ratio.
3. Slip ratio and normal load produce longitudinal tire force.
4. Tire force is applied to the chassis/contact point.
5. Equal/opposite tire reaction torque feeds back into wheel omega.

## Recommended Architecture

### Per-Wheel State

Add explicit persistent wheel state for each wheel:

- `omegaRadS`
- `phaseRad`
- `driveTorqueNm`
- `brakeTorqueNm`
- `tireReactionTorqueNm`
- `normalLoadN`
- `slipRatio`
- `slipAngleRad`
- `longitudinalForceN`
- `lateralForceN`
- `isDriven`
- `isHandbraked`

### Drivetrain Step

Per fixed step:

1. Resolve gear and clutch state.
2. Compute engine torque from RPM and throttle.
3. Apply clutch torque cap from shipped `ClutchTorque`.
4. Apply gear ratio and end ratio.
5. Apply original nonlinear scalar `c * 0.3 + c^3 * 0.7`.
6. Split torque only to driven axle/wheels.
7. For Bullet, torque goes to rear wheels only.

### Wheel Angular Step

For each wheel:

```text
netTorque =
  driveTorque
  - brakeTorque * sign(omega or contact longitudinal velocity)
  - tireLongitudinalForce * wheelRadius
  - wheelBearingDrag

omega += (netTorque / wheelInertia) * dt
phase += omega * dt
```

Important: do not force `omega = chassisSpeed / radius` on driven wheels.

### Contact Slip Step

For each contacted wheel:

```text
contactLongSpeed = dot(contactPointVelocity, wheelForward)
wheelSurfaceSpeed = -omega * radius
slipSpeed = wheelSurfaceSpeed - contactLongSpeed
slipRatio = slipSpeed / max(abs(contactLongSpeed), abs(wheelSurfaceSpeed), lowSpeedDenom)
```

At low speed, use a denominator floor so launch slip remains finite and smooth.

### Tire Force Step

Use shipped tire data as the initial curve source:

- longitudinal stiffness/friction from `XStiffness` and `XFriction`
- lateral stiffness/friction from `ZStiffness` and `ZFriction`
- tire force capped by normal load and surface friction

Implementation target:

- force rises approximately linearly around zero slip
- force peaks near an authored/derived optimal slip
- force drops to a sliding plateau instead of clamping to zero
- combined slip limits longitudinal and lateral force together

### Brake And Handbrake

Foot brake:

- apply front/rear brake torque from `BrakeTorque` and `BrakeBalance`
- braking torque opposes wheel rotation/contact-relative rolling direction

Handbrake:

- apply authored `HandBrakeTorque` to rear wheels only for Bullet
- no special steering branch
- no chassis yaw injection
- no lateral velocity injection
- rear wheel lock emerges when brake torque exceeds tire/contact reaction

### Rapier Integration Strategy

Rapier raycast vehicle can still be used for:

- suspension raycasts
- contact flags/normals
- chassis body integration
- visual wheel placement

But drivetrain/tire force should not rely primarily on
`setWheelEngineForce`/`setWheelBrake` if those APIs keep gluing wheel speed to
contact. Preferred migration path:

1. Keep Rapier suspension/contact.
2. Set Rapier engine force/brake to neutral or minimal where necessary.
3. Apply tire forces manually at wheel contact points.
4. Update explicit wheel omega from torque balance.
5. Drive wheel visuals from explicit `phaseRad`.

## Validation Targets

Telemetry should validate:

- standstill full throttle:
  - rear wheel omega rises before chassis speed
  - front wheel omega stays near rolling/contact value
  - speed curve is smooth
- reverse-to-forward:
  - gear enters first while `orig_speed_forward` is still negative
  - rear wheel omega changes sign before chassis speed crosses zero
  - chassis decelerates backward smoothly, crosses zero, then accelerates
- straight handbrake:
  - rear brake torque rises to handbrake range
  - rear phase/omega collapses toward lock
  - front wheels continue rolling
- steering handbrake:
  - yaw comes from asymmetric tire forces/load transfer, not injected yaw torque
  - same equations as straight handbrake

## Next Implementation Slice

Do not tune handbrake first.

Start with isolated longitudinal behavior:

1. Add explicit rear-wheel omega/phase state.
2. Implement driven torque -> rear omega on flat ground.
3. Implement longitudinal slip ratio from omega vs contact speed.
4. Apply manual longitudinal tire force at rear contact points.
5. Validate standstill launch and reverse-to-forward before lateral drift tuning.

