# Driving / Collision Findings 2026-03-31

Purpose: preserve the gameplay-side Ghidra pass for driving, collision, tire dynamics, and steering so implementation work can continue without redoing the binary sweep.

Binary:
- `reference/FlatOut2.exe`

## Confirmed anchors

### Vehicle body collision config load

- `FUN_00431b50` @ `0x00431b50`

Confirmed behavior:
- Loads per-car `panels.ini`, `body.bgm`, and `crash.dat`.
- Reads `CollisionFullMin`, `CollisionFullMax`, `CollisionBottomMin`, `CollisionBottomMax`, `CollisionTopMin`, and `CollisionTopMax` from car config.
- Recenters those volumes against the car-local origin after placeholder / model offsets are resolved.
- Resolves named wheel and tire anchors including:
  - `placeholder_tire_fl`
  - `placeholder_tire_fr`
  - `placeholder_tire_rl`
  - `placeholder_tire_rr`
  - `wheelhub_fl`
  - `wheelhub_fr`
  - `wheelhub_rl`
  - `wheelhub_rr`

Implementation implication:
- The original game uses multiple chassis volumes, not a single body box.
- Wheel and body anchors are explicit runtime inputs and should drive wheel placement and contact logic.

### Collision sound system

- `FUN_00414ea0` @ `0x00414ea0`

Confirmed behavior:
- Loads `data/sound/collision_sounds.bed`.
- Registers `CollisionSoundTypes`.
- Also registers fixed collision-adjacent event groups including:
  - `Windshields`
  - `SuspensionBottomOut`
  - `Explosion`
  - `WaterSplash`
  - ragdoll eject / impact groups

Implementation implication:
- Chassis contact, suspension bottom-out, and impact events are separate systems in the native game and should not be collapsed into one generic hit response.

### Tire dynamics config

- `FUN_0043aa30` @ `0x0043aa30`
- String anchor: `Data.Physics.TireDynamics` @ `0x0066a940`

Confirmed keys consumed:
- `RollingResistance`
- `InducedDragCoeff`
- `PneumaticTrail`
- `PneumaticOffset`
- `ZStiffness`
- `XStiffness`
- `ZFriction`
- `XFriction`
- `FrictionBoost`
- `SlideUnderSteer`
- `SlideControl`
- `UnderSteer`
- `SlowDown`
- `AntiSpin`

Observed note:
- The function also hard-overwrites one pair of loaded stiffness outputs with `50.0` and `6.4` near the end of each wheel setup block, matching the extracted `CStiffness` values seen in car tire files.

Implementation implication:
- Native handling is built from a real tire config stack, not only from top-speed and steer multipliers.

### Steering profile

- `FUN_00469f50` @ `0x00469f50`
- String anchor: `Data.Physics.Car.Steering_PC` @ `0x0066d798`

Confirmed defaults registered:
- `Sensitivity = 0.5`
- `MinAnalogSpeed = 1.0`
- `MaxAnalogSpeed = 5.528`
- `MinAtDelta = 0.1`
- `MaxAtDelta = 1.0`
- `CenteringSpeed = 8.0`, later tightened to about `0.99`
- `DigitalThreshold = 0.75`
- `MinDigitalSpeed = 1.5`
- `MaxDigitalSpeed = 3.5`
- `SteeringLimitRate = 0.9`
- `SteeringLimitSpeed` buckets begin at:
  - `20`
  - `90`
  - `200`
  - `300`

Implementation implication:
- PC steering is explicitly speed-limited and rate-shaped in config rather than being a single linear reduction.

### Car physics config tree

- `FUN_00454c60` @ `0x00454c60`

Confirmed config groups read from the car physics tree:
- `Differential`
- `BrakeCurves`
- `SpeedCurves`
- `ThrottleCurves`
- `Gearbox`
- `Suspension`
- `Tires`
- `Engine`

Confirmed suspension / tire-side keys read:
- `FrontIndependent`
- `FrontMinLength`
- `FrontMaxLength`
- `FrontRestLength`
- `FrontDefaultCompression`
- `FrontBumpDamp`
- `FrontReboundDamp`
- `FrontBumperLength`
- `FrontBumperConst`
- `FrontBumperRestitution`
- `FrontRollbarStiffness`
- `RearIndependent`
- `RearMinLength`
- `RearMaxLength`
- `RearRestLength`
- `RearDefaultCompression`
- `RearBumpDamp`
- `RearReboundDamp`
- `RearBumperLength`
- `RearBumperConst`
- `RearBumperRestitution`
- `RearRollbarStiffness`
- `FrontRadius`
- `FrontWidth`
- `FrontMass`
- `FrontMomentOfInertia`
- `FrontSuspensionLift`
- `RearRadius`
- `RearWidth`
- `RearMass`
- `RearMomentOfInertia`
- `RearSuspensionLift`
- `OptimalSlipRatio`
- `OptimalSlipAngle`
- `OptimalSlipLoad`
- `OptimalLoadFactor`

Implementation implication:
- A full native-physics rewrite should reconstruct from this config path first, not from ad hoc tuning.

## Extracted data that already matches the runtime path

Car-side files already present in repo and aligned with the runtime findings:
- `src/data/cars/car_*/body.ini`
- `src/data/cars/car_*/tires.ini`
- `src/data/cars/car_*/panels.ini`

That means body collision boxes, tire local dynamics, and panel crash thresholds can be pulled directly into the web implementation without inventing substitute data.
