import * as THREE from "three";

import { loadDrivingConfig } from "./drivingConfig";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, -1);
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_C = new THREE.Vector3();
const TMP_D = new THREE.Vector3();
const TMP_E = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();

const MIN_SUBSTEPS = 1;
const MAX_SUBSTEPS = 4;
const TARGET_SUBSTEP_DT = 1 / 120;
const MAX_FRAME_DELTA = 0.1;
const CONTACT_RAY_HEIGHT = 2.8;
const CONTACT_RAY_DISTANCE = 4.6;
const RESET_FALL_Y = -30;
const DEFAULT_GRAVITY = 18;
const BODY_COLLISION_BUFFER = 0.06;
const BODY_COLLISION_MAX_PUSHES = 2;

const DEFAULT_STEERING = {
  Sensitivity: 0.5,
  MinAnalogSpeed: 0.1,
  MaxAnalogSpeed: 2,
  MinAtDelta: 1,
  MaxAtDelta: 2,
  CenteringSpeed: 0.9,
  SteeringLimitRate: [1, 0.8, 0.5, 0.25],
  SteeringSpeedRate: [20, 40, 100, 250],
  SteeringLimitSpeed: [20, 40, 100, 250],
  DigitalThreshold: 0.2,
  MinDigitalSpeed: 1,
  MaxDigitalSpeed: 2.5,
};

const DEFAULT_CAMERA_STATE = {
  heading: 0,
  forwardSpeed: 0,
  lateralSpeed: 0,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  yawRate: 0,
  roll: 0,
  pitch: 0,
  surfaceGrip: 1,
  grounded: false,
  cameraShake: 0,
};

export async function createDrivingSimulation({
  carId,
  carRoot,
  assetUrls,
  input,
  trackFloorSampler = null,
  bodyCollisionSampler = null,
  debugOptions = null,
}) {
  const config = normalizeDrivingConfig(
    await loadDrivingConfig({ assetUrls }),
    carRoot,
  );
  const wheelLayout = buildWheelLayout(carRoot, config);
  const state = createInitialState(carRoot, config, wheelLayout);
  const spawnState = {
    position: carRoot.position.clone(),
    quaternion: carRoot.quaternion.clone(),
  };

  resetVehicleToSpawn(
    carRoot,
    config,
    wheelLayout,
    state,
    trackFloorSampler,
    spawnState,
  );

  return {
    update(deltaSeconds) {
      const dt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DELTA);

      if (dt <= 0) {
        return;
      }

      const previousGrounded = state.grounded;
      const previousVerticalVelocity = state.velocity.y;
      const runtimeDebug = resolveDrivingDebugOptions(debugOptions);

      if (!runtimeDebug.enabled) {
        updateCameraState(state, carRoot, runtimeDebug);
        return;
      }

      updatePlayerControls(state, input, config, dt);
      if (runtimeDebug.gearbox) {
        updateGearboxState(state, config, dt);
      }
      const sampledContacts = runtimeDebug.sampleContacts
        ? sampleWheelContacts(
            carRoot,
            wheelLayout,
            trackFloorSampler,
          )
        : [];
      const launchSpeed = horizontalSpeed(state.velocity);

      const targetSubsteps = Number.isFinite(runtimeDebug.substeps)
        ? runtimeDebug.substeps
        : Math.ceil(dt / TARGET_SUBSTEP_DT);
      const substepCount = THREE.MathUtils.clamp(
        launchSpeed < 3 ? Math.max(targetSubsteps, 3) : targetSubsteps,
        MIN_SUBSTEPS,
        MAX_SUBSTEPS,
      );
      const substepDt = dt / substepCount;

      for (let index = 0; index < substepCount; index += 1) {
        runVehicleSubstep(
          carRoot,
          config,
          wheelLayout,
          state,
          sampledContacts,
          bodyCollisionSampler ?? trackFloorSampler,
          runtimeDebug,
          substepDt,
        );
      }

      if (runtimeDebug.wheelVisuals) {
        updateWheelVisuals(carRoot, wheelLayout, state);
      }
      updateCameraState(state, carRoot, runtimeDebug);

      if (
        (input?.resetPressed && !state.previousResetPressed) ||
        carRoot.position.y < RESET_FALL_Y
      ) {
        resetVehicleToSpawn(
          carRoot,
          config,
          wheelLayout,
          state,
          trackFloorSampler,
          spawnState,
        );
      } else if (state.grounded && !previousGrounded && previousVerticalVelocity < -2.5) {
        state.cameraShake = Math.min(
          state.cameraShake + Math.abs(previousVerticalVelocity) * 0.04,
          1.25,
        );
      }

      state.cameraShake = Math.max(state.cameraShake - dt * 1.5, 0);
      state.previousResetPressed = Boolean(input?.resetPressed);
    },
    speedKph() {
      return horizontalSpeed(state.velocity) * 3.6;
    },
    getCameraState() {
      return state.cameraState;
    },
    getLightState() {
      return deriveVehicleLightState(state);
    },
    getConfig() {
      return {
        carId,
        massKg: config.massKg,
        maxForwardGear: config.maxForwardGear,
      };
    },
  };
}

function normalizeDrivingConfig(rawConfig, carRoot) {
  const steering = {
    ...DEFAULT_STEERING,
    ...rawConfig.steering,
  };
  const bodyCollision = rawConfig.bodyCollision ?? {};
  const tires = rawConfig.tires ?? {};
  const suspension = rawConfig.suspension ?? {};
  const body = rawConfig.body ?? {};
  const engine = rawConfig.engine ?? {};
  const car = rawConfig.car ?? {};
  const localTireDynamics = rawConfig.localTireDynamics ?? {};
  const massBase = pickScalar(car.Mass, 980);
  const massFudge = pickScalar(car.MassFudgeFactor, 1);
  const frontRadius = pickScalar(tires.FrontRadius, estimateWheelRadius(carRoot) ?? 0.33);
  const rearRadius = pickScalar(tires.RearRadius, frontRadius);
  const frontWidth = pickScalar(tires.FrontWidth, 0.22);
  const rearWidth = pickScalar(tires.RearWidth, frontWidth);
  const frontRestLength =
    pickScalar(suspension.FrontRestLength, 0.24) -
    pickScalar(suspension.FrontDefaultCompression, 0.08);
  const rearRestLength =
    pickScalar(suspension.RearRestLength, 0.26) -
    pickScalar(suspension.RearDefaultCompression, 0.1);
  const gearRatios = buildGearRatios(rawConfig.gearbox ?? {});
  const defaultDifferential = rawConfig.differentials?.defaultFront ?? {};
  const frontDifferential = resolveDifferential(
    body.FrontDifferential,
    rawConfig.differentials,
    defaultDifferential,
  );
  const rearDifferential = resolveDifferential(
    body.RearDifferential,
    rawConfig.differentials,
    rawConfig.differentials?.defaultRear ?? defaultDifferential,
  );

  return {
    steering,
    bodyCollision,
    bodyCollisionProbes: buildBodyCollisionProbes(bodyCollision),
    localTireDynamics,
    surfaceDynamics: rawConfig.surfaceDynamics ?? {},
    massKg: massBase * massFudge,
    centerOfMass: toVector3(car.CenterOfMass, [0, 0.1, 0.05]),
    centerOfDownforce: toVector3(car.CenterOfDownforce, [0, 0.45, 0]),
    brakeBalance: pickScalar(body.BrakeBalance, 0.6),
    brakeTorque: pickScalar(body.BrakeTorque, 5200),
    handBrakeTorque: pickScalar(body.HandBrakeTorque, 5200),
    tireTurnAngleIn: THREE.MathUtils.degToRad(
      pickScalar(body.TireTurnAngleIn, 36),
    ),
    tireTurnAngleOut: THREE.MathUtils.degToRad(
      pickScalar(body.TireTurnAngleOut, 38),
    ),
    aeroDrag: toVector2(body.AeroDrag, [0.28, 0.28]),
    aeroDragLoc: toVector3(body.AeroDragLoc, [0, 0, -0.2]),
    downforceConst: pickScalar(body.DownforceConst, 2),
    slideControlBalance: toVector2(body.SlideControlBalance, [0.8, 1]),
    slideControlFrontReduction: toVector2(body.SlideControlFrontReduction, [0.35, 0.1]),
    slideControlRearReduction: toVector2(body.SlideControlRearReduction, [0.05, 0.05]),
    antiSpinReduction: toVector2(body.AntiSpinReduction, [0, 0]),
    frontTraction: Boolean(body.FrontTraction ?? true),
    rearTraction: Boolean(body.RearTraction ?? false),
    frontWheel: {
      radius: frontRadius,
      width: frontWidth,
      mass: pickScalar(tires.FrontMass, 25),
      inertia: pickScalar(tires.FrontMomentOfInertia, 2),
      lift: pickScalar(tires.FrontSuspensionLift, 0),
      restLength: Math.max(frontRestLength, 0.05),
      maxLength: pickScalar(suspension.FrontMaxLength, 0.65),
      bumpDamp: pickScalar(suspension.FrontBumpDamp, 0.4),
      reboundDamp: pickScalar(suspension.FrontReboundDamp, 0.8),
      rollbar: pickScalar(suspension.FrontRollbarStiffness, 0.12),
      defaultCompression: pickScalar(suspension.FrontDefaultCompression, 0.08),
    },
    rearWheel: {
      radius: rearRadius,
      width: rearWidth,
      mass: pickScalar(tires.RearMass, 25),
      inertia: pickScalar(tires.RearMomentOfInertia, 2),
      lift: pickScalar(tires.RearSuspensionLift, 0),
      restLength: Math.max(rearRestLength, 0.05),
      maxLength: pickScalar(suspension.RearMaxLength, 0.65),
      bumpDamp: pickScalar(suspension.RearBumpDamp, 0.35),
      reboundDamp: pickScalar(suspension.RearReboundDamp, 0.75),
      rollbar: pickScalar(suspension.RearRollbarStiffness, 0.12),
      defaultCompression: pickScalar(suspension.RearDefaultCompression, 0.1),
    },
    tireConfig: {
      optimalSlipRatio: pickScalar(tires.OptimalSlipRatio, 0.15),
      optimalSlipAngle: THREE.MathUtils.degToRad(
        pickScalar(tires.OptimalSlipAngle, 12),
      ),
      optimalSlipLoad: pickScalar(tires.OptimalSlipLoad, 1),
      optimalLoadFactor: pickScalar(tires.OptimalLoadFactor, 1),
      rollingResistance: pickScalar(localTireDynamics.RollingResistance, 0.5),
      inducedDragCoeff: pickScalar(localTireDynamics.InducedDragCoeff, 1),
      pneumaticTrail: pickScalar(localTireDynamics.PneumaticTrail, 0.04),
      pneumaticOffset: pickScalar(localTireDynamics.PneumaticOffset, 0.5),
      xFriction: toVector2(localTireDynamics.XFriction, [1.1, 0]),
      zFriction: toVector2(localTireDynamics.ZFriction, [1, 0]),
      xStiffness: toVector3(localTireDynamics.XStiffness, [1, 1, 1]),
      zStiffness: toVector3(localTireDynamics.ZStiffness, [1, 1, 1]),
      cStiffness: toVector2(localTireDynamics.CStiffness, [50, 6.4]),
    },
    engine: {
      idleRpm: pickScalar(engine.IdleRpm, 1000),
      peakTorqueRpm: pickScalar(engine.PeakTorqueRpm, 4500),
      peakTorque: pickScalar(engine.PeakTorque, 210),
      peakPowerRpm: pickScalar(engine.PeakPowerRpm, 6000),
      peakPower: pickScalar(engine.PeakPower, 120),
      redLineRpm: pickScalar(engine.RedLineRpm, 6500),
      zeroPowerRpm: pickScalar(engine.ZeroPowerRpm, 600),
      nitroStorage: pickScalar(engine.NitroStorage, 5),
      nitroAcceleration: pickScalar(engine.NitroAcceleration, 0.7),
      turboAcceleration: pickScalar(engine.TurboAcceleration, 0.17),
      inertia: pickScalar(engine.InertiaEngine, 0.15),
      friction: pickScalar(engine.EngineFriction, 0.015),
    },
    gearbox: {
      ratios: gearRatios,
      reverseRatio: buildReverseRatio(rawConfig.gearbox ?? {}),
      endRatio: pickScalar(rawConfig.gearbox?.EndRatio, 3.7),
      clutchEngageTime: pickScalar(rawConfig.gearbox?.ClutchEngageTime, 0.1),
      clutchReleaseTime: pickScalar(rawConfig.gearbox?.ClutchReleaseTime, 0.1),
      clutchTorque: pickScalar(rawConfig.gearbox?.ClutchTorque, 280),
    },
    maxForwardGear: Math.max(gearRatios.length, 1),
    differentials: {
      front: frontDifferential,
      rear: rearDifferential,
    },
    gravity: DEFAULT_GRAVITY,
  };
}

function buildGearRatios(gearbox) {
  const ratios = [];

  for (let gearIndex = 1; gearIndex <= 6; gearIndex += 1) {
    const gearValue = gearbox[`Gear${gearIndex}`];
    const ratio = Array.isArray(gearValue) ? gearValue[0] : 0;

    if (Number.isFinite(ratio) && Math.abs(ratio) > 1e-3) {
      ratios.push(ratio);
    }
  }

  return ratios;
}

function buildBodyCollisionProbes(bodyCollision) {
  const probes = [];

  addBodyCollisionProbeSet(
    probes,
    bodyCollision.collisionFullMin,
    bodyCollision.collisionFullMax,
    0.24,
  );
  addBodyCollisionProbeSet(
    probes,
    bodyCollision.collisionBottomMin,
    bodyCollision.collisionBottomMax,
    0.2,
  );
  addBodyCollisionProbeSet(
    probes,
    bodyCollision.collisionTopMin,
    bodyCollision.collisionTopMax,
    0.18,
  );

  return probes;
}

function addBodyCollisionProbeSet(probes, minArray, maxArray, radiusScale) {
  if (!Array.isArray(minArray) || !Array.isArray(maxArray)) {
    return;
  }

  const min = new THREE.Vector3().fromArray(minArray);
  const max = new THREE.Vector3().fromArray(maxArray);
  const extentX = Math.max((max.x - min.x) * 0.5, 0.05);
  const extentY = Math.max((max.y - min.y) * 0.5, 0.05);
  const extentZ = Math.max((max.z - min.z) * 0.5, 0.05);
  const radius = Math.max(Math.min(extentX, extentY, extentZ) * radiusScale * 2, 0.08);
  const centerY = (min.y + max.y) * 0.5;
  const lowerY = THREE.MathUtils.lerp(min.y, max.y, 0.25);
  const upperY = THREE.MathUtils.lerp(min.y, max.y, 0.75);

  probes.push(
    { local: new THREE.Vector3(min.x, centerY, 0), radius },
    { local: new THREE.Vector3(max.x, centerY, 0), radius },
    { local: new THREE.Vector3(0, centerY, min.z), radius },
    { local: new THREE.Vector3(0, centerY, max.z), radius },
    { local: new THREE.Vector3(0, lowerY, min.z), radius },
    { local: new THREE.Vector3(0, lowerY, max.z), radius },
    { local: new THREE.Vector3(min.x * 0.75, upperY, 0), radius },
    { local: new THREE.Vector3(max.x * 0.75, upperY, 0), radius },
  );
}

function buildReverseRatio(gearbox) {
  const reverse = gearbox.GearR;
  return Array.isArray(reverse) ? reverse[0] : -4.1;
}

function resolveDifferential(nodePath, differentials, fallback) {
  if (typeof nodePath !== "string") {
    return fallback;
  }

  if (nodePath.endsWith("/Front")) {
    return differentials?.front ?? fallback;
  }

  if (nodePath.endsWith("/Rear")) {
    return differentials?.rear ?? fallback;
  }

  if (nodePath.endsWith("/DefaultFront")) {
    return differentials?.defaultFront ?? fallback;
  }

  if (nodePath.endsWith("/DefaultRear")) {
    return differentials?.defaultRear ?? fallback;
  }

  return fallback;
}

function buildWheelLayout(carRoot, config) {
  const wheelNames = [
    { name: "placeholder_tire_fl", front: true, side: -1 },
    { name: "placeholder_tire_fr", front: true, side: 1 },
    { name: "placeholder_tire_rl", front: false, side: -1 },
    { name: "placeholder_tire_rr", front: false, side: 1 },
  ];

  return wheelNames.map((wheel) => {
    const anchor = carRoot.getObjectByName(wheel.name);
    const tire = carRoot.getObjectByName(`${wheel.name}_tire`);
    const wheelConfig = wheel.front ? config.frontWheel : config.rearWheel;

    return {
      ...wheel,
      localPosition:
        anchor?.position?.clone?.() ??
        new THREE.Vector3(
          wheel.side * 0.85,
          wheelConfig.radius + wheelConfig.restLength,
          wheel.front ? -1.3 : 1.3,
        ),
      tire,
      tireBasePosition: tire?.position?.clone?.() ?? new THREE.Vector3(),
      tireBaseQuaternion: tire?.quaternion?.clone?.() ?? new THREE.Quaternion(),
      wheelConfig,
    };
  });
}

function createInitialState(carRoot, config, wheelLayout) {
  const yaw = extractYaw(carRoot.quaternion);
  const orientationOffset = computeOrientationOffset(carRoot.quaternion, yaw);
  const wheelbase = computeWheelbase(wheelLayout);
  const trackWidth = computeTrackWidth(wheelLayout);
  const forwardDir = getPlanarForwardFromQuaternion(
    carRoot.quaternion,
    new THREE.Vector3(),
  );
  const rightDir = getRightVector(forwardDir, new THREE.Vector3());

  return {
    velocity: new THREE.Vector3(),
    yaw,
    orientationOffset,
    forwardDir,
    rightDir,
    yawRate: 0,
    steerRaw: 0,
    steerState: 0,
    steerVelocity: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    handbrakeAxis: 0,
    reverseLatched: false,
    gear: 1,
    shiftTimer: 0,
    shiftFromGear: 1,
    shiftTargetGear: 1,
    clutch: 1,
    engineRpm: config.engine.idleRpm,
    grounded: false,
    surfaceGrip: 1,
    previousResetPressed: false,
    cameraShake: 0,
    wheelbase,
    trackWidth,
    wheelStates: wheelLayout.map((wheel) => ({
      name: wheel.name,
      front: wheel.front,
      side: wheel.side,
      grounded: false,
      contactPoint: new THREE.Vector3(),
      contactNormal: WORLD_UP.clone(),
      surfaceType: "default",
      compression: 0,
      suspensionOffset: 0,
      spinAngle: 0,
      angularVelocity: 0,
      steerAngle: 0,
      load: 0,
    })),
    cameraState: { ...DEFAULT_CAMERA_STATE },
  };
}

function updatePlayerControls(state, input, config, dt) {
  const horizontalKph = horizontalSpeed(state.velocity) * 3.6;
  const forwardSpeed = projectForwardSpeed(state, config);
  const rawThrottle = THREE.MathUtils.clamp(input?.throttle ?? 0, 0, 1);
  const rawBrake = THREE.MathUtils.clamp(input?.brake ?? 0, 0, 1);
  const rawHandbrake = THREE.MathUtils.clamp(input?.handbrake ?? 0, 0, 1);
  const rawSteer = THREE.MathUtils.clamp(input?.steer ?? 0, -1, 1);
  const wantsReverse =
    rawBrake > 0.1 && rawThrottle < 0.1 && forwardSpeed < 1.75;

  if (rawThrottle > 0.1) {
    state.reverseLatched = false;
  } else if (wantsReverse) {
    state.reverseLatched = true;
  }

  const throttleTarget = state.reverseLatched ? -rawBrake : rawThrottle;
  const brakeTarget = state.reverseLatched ? 0 : rawBrake;
  state.throttleAxis = moveToward(state.throttleAxis, throttleTarget, dt * 3.6);
  state.brakeAxis = moveToward(state.brakeAxis, brakeTarget, dt * 6.5);
  state.handbrakeAxis = moveToward(
    state.handbrakeAxis,
    rawHandbrake,
    dt * 10,
  );

  const previousSteer = state.steerState;
  const steerLimit = computeSteeringLimit(config.steering, horizontalKph);
  const steerTarget = rawSteer * steerLimit * (rawHandbrake > 0.1 ? 1.1 : 1);
  const digitalInput = Math.abs(rawSteer) >= config.steering.DigitalThreshold;

  if (Math.abs(rawSteer) < 1e-3) {
    const centeringRate = Math.max(config.steering.CenteringSpeed * 6, 1);
    state.steerState = dampToward(state.steerState, 0, centeringRate, dt);
  } else {
    const minSpeed = digitalInput
      ? config.steering.MinDigitalSpeed
      : config.steering.MinAnalogSpeed;
    const maxSpeed = digitalInput
      ? config.steering.MaxDigitalSpeed
      : config.steering.MaxAnalogSpeed;
    const rate =
      THREE.MathUtils.lerp(minSpeed, maxSpeed, Math.abs(rawSteer)) *
      (1 + Math.abs(steerTarget - state.steerState) * 0.35);
    state.steerState = moveToward(state.steerState, steerTarget, rate * dt);
  }

  state.steerState = THREE.MathUtils.clamp(state.steerState, -1, 1);
  state.steerRaw = rawSteer;
  state.steerVelocity = (state.steerState - previousSteer) / Math.max(dt, 1e-5);
}

function updateGearboxState(state, config, dt) {
  const forwardSpeed = projectForwardSpeed(state, config);
  const driveWheelOmega = averageDrivenWheelOmega(state, config);
  const gearRatio = getCurrentGearRatio(state, config);
  const targetRpmFromWheel =
    Math.abs(driveWheelOmega * gearRatio * config.gearbox.endRatio) *
    (60 / (Math.PI * 2));
  const idleRpm = config.engine.idleRpm;
  const freeRevTarget = idleRpm + Math.abs(state.throttleAxis) * (config.engine.redLineRpm - idleRpm);

  state.engineRpm = dampToward(
    state.engineRpm,
    Math.max(targetRpmFromWheel, freeRevTarget * 0.35, idleRpm),
    8,
    dt,
  );

  if (state.reverseLatched) {
    state.gear = -1;
    state.shiftTimer = 0;
    state.clutch = 1;
    return;
  }

  const ratios = config.gearbox.ratios;

  if (ratios.length === 0) {
    state.gear = 1;
    return;
  }

  if (state.shiftTimer > 0) {
    state.shiftTimer = Math.max(state.shiftTimer - dt, 0);
    state.clutch = THREE.MathUtils.clamp(
      1 - state.shiftTimer / Math.max(config.gearbox.clutchEngageTime, 0.05),
      0.2,
      1,
    );

    if (state.shiftTimer === 0) {
      state.gear = state.shiftTargetGear;
      state.clutch = 1;
    }

    return;
  }

  state.gear = THREE.MathUtils.clamp(
    state.gear <= 0 ? 1 : state.gear,
    1,
    ratios.length,
  );
  state.clutch = 1;

  const upshiftRpm = config.engine.redLineRpm * 0.92;
  const downshiftRpm = Math.max(config.engine.peakTorqueRpm * 0.6, idleRpm * 1.6);
  const lowSpeed = Math.abs(forwardSpeed) < 3;

  if (state.engineRpm > upshiftRpm && state.gear < ratios.length) {
    startShift(state, state.gear + 1, config);
    return;
  }

  if (
    state.engineRpm < downshiftRpm &&
    state.gear > 1 &&
    !lowSpeed &&
    state.throttleAxis >= 0
  ) {
    startShift(state, state.gear - 1, config);
  }
}

function startShift(state, nextGear, config) {
  if (nextGear === state.gear) {
    return;
  }

  state.shiftFromGear = state.gear;
  state.shiftTargetGear = nextGear;
  state.shiftTimer =
    Math.max(config.gearbox.clutchEngageTime, 0.05) +
    Math.max(config.gearbox.clutchReleaseTime, 0.05);
  state.clutch = 0.2;
}

function runVehicleSubstep(
  carRoot,
  config,
  wheelLayout,
  state,
  sampledContacts,
  bodyCollisionSampler,
  runtimeDebug,
  dt,
) {
  if (runtimeDebug.freezePosition) {
    return;
  }

  updatePlanarBasisFromQuaternion(state, carRoot.quaternion);
  const forward = TMP_FORWARD.copy(state.forwardDir);
  const right = TMP_RIGHT.copy(state.rightDir);
  const groundedContacts = sampledContacts.filter((contact) => contact.hit);
  const groundedCount = groundedContacts.length;
  const previousGrounded = state.grounded;
  let totalForce = new THREE.Vector3();
  let totalYawTorque = 0;

  updateSteeringRack(wheelLayout, state, config, dt);

  if (runtimeDebug.sampleContacts) {
    updateWheelContactState(state, groundedContacts, config);
  } else {
    state.grounded = false;
    state.surfaceGrip = 0.92;
  }

  if (runtimeDebug.alignToGround && groundedCount > 0) {
    const desiredGroundY = computeGroundedBodyY(groundedContacts, state, wheelLayout);
    alignVehicleToGround(carRoot, state, desiredGroundY, dt);
    if (runtimeDebug.tireForces) {
      groundedContacts.forEach((contact) => {
        const wheelState = findWheelState(state, contact.wheel.name);
        const wheelForce = accumulateWheelForces(
          contact,
          wheelState,
          state,
          config,
          forward,
          right,
          groundedCount,
          dt,
        );

        totalForce.add(wheelForce.force);
        totalYawTorque += wheelForce.yawTorque;
      });
    }

    if (state.velocity.y < 0) {
      state.velocity.y = 0;
    }
    state.grounded = true;
  } else {
    state.grounded = false;
  }

  if (runtimeDebug.aeroForces || runtimeDebug.gravity) {
    totalForce.add(
      computeAeroAndRollingForces(
        state,
        config,
        forward,
        right,
        runtimeDebug,
      ),
    );
  }

  const acceleration = totalForce.multiplyScalar(1 / Math.max(config.massKg, 1));
  state.velocity.addScaledVector(acceleration, dt);
  state.yawRate += (totalYawTorque / Math.max(config.massKg * 1.2, 1)) * dt;
  state.yawRate *= state.grounded ? 0.985 : 0.995;
  state.yawRate = THREE.MathUtils.clamp(state.yawRate, -1.4, 1.4);
  state.yaw += state.yawRate * dt;

  stabilizeIdleState(state, dt);
  const previousPosition = carRoot.position.clone();
  const previousQuaternion = carRoot.quaternion.clone();
  carRoot.position.addScaledVector(state.velocity, dt);
  applyVehicleOrientation(carRoot, state);
  resolveVehicleBodyCollisions(
    carRoot,
    state,
    config,
    bodyCollisionSampler,
    previousPosition,
    previousQuaternion,
  );
  updatePlanarBasisFromQuaternion(state, carRoot.quaternion);

  if (!previousGrounded && state.grounded) {
    state.cameraShake = Math.min(state.cameraShake + 0.15, 1);
  }
}

function updateSteeringRack(wheelLayout, state, config, dt) {
  const steerAmount = Math.abs(state.steerState);
  const desiredBaseAngle =
    steerAmount < 1e-4
      ? 0
      : steerAmount * ((config.tireTurnAngleIn + config.tireTurnAngleOut) * 0.5);
  const turnSign = Math.sign(state.steerState) || 0;
  const turnRadius =
    Math.abs(Math.tan(desiredBaseAngle)) > 1e-4
      ? state.wheelbase / Math.abs(Math.tan(desiredBaseAngle))
      : Infinity;

  for (const wheel of wheelLayout) {
    const wheelState = findWheelState(state, wheel.name);

    if (!wheel.front) {
      wheelState.steerAngle = dampToward(wheelState.steerAngle, 0, 20, dt);
      continue;
    }

    let targetAngle = desiredBaseAngle;

    if (Number.isFinite(turnRadius)) {
      const innerAngle = Math.min(
        Math.atan(
          state.wheelbase / Math.max(turnRadius - state.trackWidth * 0.5, 0.1),
        ),
        config.tireTurnAngleIn * steerAmount,
      );
      const clampedOuterAngle = Math.min(
        Math.atan(state.wheelbase / (turnRadius + state.trackWidth * 0.5)),
        config.tireTurnAngleOut * steerAmount,
      );
      const steeringLeft = turnSign < 0;
      const isInnerWheel = steeringLeft ? wheel.side < 0 : wheel.side > 0;
      targetAngle = isInnerWheel ? innerAngle : clampedOuterAngle;
    }

    wheelState.steerAngle = dampToward(
      wheelState.steerAngle,
      targetAngle * turnSign,
      16,
      dt,
    );
  }
}

function sampleWheelContacts(carRoot, wheelLayout, trackFloorSampler) {
  if (!trackFloorSampler) {
    return [];
  }

  return wheelLayout.map((wheel) => {
    TMP_A.copy(wheel.localPosition).applyQuaternion(carRoot.quaternion);
    TMP_B.copy(carRoot.position).add(TMP_A);
    const hit = trackFloorSampler.sample(TMP_B, {
      rayHeight: CONTACT_RAY_HEIGHT,
      rayDistance: CONTACT_RAY_DISTANCE,
      minUpDot: -0.2,
    });

    return {
      wheel,
      anchorWorld: TMP_B.clone(),
      hit,
    };
  });
}

function updateWheelContactState(state, groundedContacts, config) {
  for (const wheelState of state.wheelStates) {
    wheelState.grounded = false;
    wheelState.compression = 0;
    wheelState.suspensionOffset = 0;
    wheelState.load = 0;
  }

  if (groundedContacts.length === 0) {
    state.surfaceGrip = 0.92;
    return;
  }

  let surfaceGripSum = 0;

  for (const contact of groundedContacts) {
    const wheelState = findWheelState(state, contact.wheel.name);
    const configWheel = contact.wheel.wheelConfig;
    const suspensionAxis = contact.hit.normal ?? WORLD_UP;
    const distance = TMP_C
      .copy(contact.anchorWorld)
      .sub(contact.hit.point)
      .dot(suspensionAxis);
    const rideHeight = configWheel.radius + configWheel.restLength + configWheel.lift;
    const compression = THREE.MathUtils.clamp(
      rideHeight - distance,
      0,
      configWheel.maxLength,
    );

    wheelState.grounded = true;
    wheelState.compression = compression;
    wheelState.suspensionOffset = -compression;
    wheelState.contactPoint.copy(contact.hit.point);
    wheelState.contactNormal.copy(contact.hit.normal);
    wheelState.surfaceType = contact.hit.surfaceType ?? "default";
    wheelState.load = computeWheelLoad(compression, configWheel, state, config);
    surfaceGripSum += computeSurfaceGrip(config, wheelState.surfaceType);
  }

  state.surfaceGrip = surfaceGripSum / groundedContacts.length;
}

function computeGroundedBodyY(groundedContacts, state, wheelLayout) {
  let totalY = 0;
  for (const contact of groundedContacts) {
    const wheelState = findWheelState(state, contact.wheel.name);
    const wheel = wheelLayout.find((entry) => entry.name === contact.wheel.name);
    const rideHeight =
      wheel.wheelConfig.radius +
      wheel.wheelConfig.restLength -
      wheelState.compression * 0.45 +
      wheel.wheelConfig.lift;
    totalY += contact.hit.point.y + rideHeight - wheel.localPosition.y;
  }

  return totalY / Math.max(groundedContacts.length, 1);
}

function alignVehicleToGround(carRoot, state, desiredGroundY, dt) {
  const follow = 1 - Math.exp(-18 * dt);
  carRoot.position.y = THREE.MathUtils.lerp(carRoot.position.y, desiredGroundY, follow);
}

function resolveVehicleBodyCollisions(
  carRoot,
  state,
  config,
  trackFloorSampler,
  previousPosition,
  previousQuaternion,
) {
  if (!trackFloorSampler?.raycast || config.bodyCollisionProbes.length === 0) {
    return;
  }

  for (let pushIndex = 0; pushIndex < BODY_COLLISION_MAX_PUSHES; pushIndex += 1) {
    let adjusted = false;

    for (const probe of config.bodyCollisionProbes) {
      const previousProbe = TMP_A
        .copy(probe.local)
        .applyQuaternion(previousQuaternion)
        .add(previousPosition);
      const currentProbe = TMP_B
        .copy(probe.local)
        .applyQuaternion(carRoot.quaternion)
        .add(carRoot.position);
      const travel = TMP_C.copy(currentProbe).sub(previousProbe);
      const travelDistance = travel.length();

      if (travelDistance < 1e-5) {
        continue;
      }

      const hit = trackFloorSampler.raycast(previousProbe, travel, {
        rayDistance: travelDistance + probe.radius + BODY_COLLISION_BUFFER,
        minUpDot: -1,
        maxUpDot: 1,
      });

      if (!hit || Math.abs(hit.normal.y) > 0.55) {
        continue;
      }

      const penetration =
        probe.radius + BODY_COLLISION_BUFFER - Math.max(hit.distance, 0);

      if (penetration <= 0) {
        continue;
      }

      carRoot.position.addScaledVector(hit.normal, penetration);
      const velocityIntoSurface = state.velocity.dot(hit.normal);

      if (velocityIntoSurface < 0) {
        state.velocity.addScaledVector(hit.normal, -velocityIntoSurface);
      }

      state.yawRate *= 0.85;
      adjusted = true;
    }

    if (!adjusted) {
      break;
    }
  }
}

function accumulateWheelForces(
  contact,
  wheelState,
  state,
  config,
  forward,
  right,
  groundedCount,
  dt,
) {
  const wheelForward = TMP_A.copy(forward).applyAxisAngle(
    contact.hit.normal,
    wheelState.steerAngle,
  );
  const wheelRight = TMP_B.crossVectors(wheelForward, contact.hit.normal).normalize();
  const lateralOffset = contact.wheel.localPosition.x - config.centerOfMass.x;
  const longitudinalOffset =
    -(contact.wheel.localPosition.z - config.centerOfMass.z);
  const wheelVelocity = TMP_D
    .copy(state.velocity)
    .addScaledVector(forward, state.yawRate * lateralOffset)
    .addScaledVector(right, -state.yawRate * longitudinalOffset);
  const longitudinalSpeed = wheelVelocity.dot(wheelForward);
  const lateralSpeed = wheelVelocity.dot(wheelRight);
  const surfaceGrip = computeSurfaceGrip(config, wheelState.surfaceType);
  const driveTorque = computeDriveTorqueForWheel(contact.wheel, state, config, groundedCount);
  const brakeTorque = computeBrakeTorqueForWheel(contact.wheel, state, config);
  const wheelRadius = contact.wheel.wheelConfig.radius;
  const rearHandbrakeLock = !contact.wheel.front
    ? THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1)
    : 0;
  const maxWheelBrakeTorque = contact.wheel.front
    ? config.brakeTorque * config.brakeBalance + config.handBrakeTorque * 0.12
    : config.brakeTorque * (1 - config.brakeBalance) + config.handBrakeTorque;
  const wheelBrakeLockStrength = THREE.MathUtils.clamp(
    brakeTorque / Math.max(maxWheelBrakeTorque, 1),
    0,
    1,
  );
  const brakeLockSpeed = Math.max(
    Math.abs(longitudinalSpeed),
    Math.abs(wheelState.angularVelocity * wheelRadius),
    horizontalSpeed(state.velocity),
  );
  const lockedByBrake =
    wheelBrakeLockStrength > 0.08 &&
    brakeLockSpeed < 1.2 &&
    Math.abs(state.throttleAxis) < 0.15 &&
    (contact.wheel.front ? state.brakeAxis > 0.05 : true) &&
    brakeTorque >= Math.abs(driveTorque);

  if (lockedByBrake) {
    wheelState.angularVelocity = 0;
    const skidSpeedBlend = inverseLerp(0.04, 0.9, brakeLockSpeed);
    const rearHandbrakeLongScale =
      !contact.wheel.front && rearHandbrakeLock > 0.05
        ? THREE.MathUtils.lerp(1, 0.28, rearHandbrakeLock)
        : 1;
    const skidLongGrip =
      surfaceGrip *
      Math.max(config.tireConfig.zFriction[0], 0.8) *
      THREE.MathUtils.lerp(0.35, 1.05, wheelBrakeLockStrength) *
      rearHandbrakeLongScale *
      skidSpeedBlend;
    const skidLatGripBase =
      surfaceGrip *
      Math.max(config.tireConfig.xFriction[0], 0.6) *
      skidSpeedBlend;
    const skidLatGrip =
      !contact.wheel.front && rearHandbrakeLock > 0.05
        ? skidLatGripBase * THREE.MathUtils.lerp(1, 0.12, rearHandbrakeLock)
        : skidLatGripBase;
    const force = new THREE.Vector3();

    if (Math.abs(longitudinalSpeed) > 0.02) {
      force.addScaledVector(
        wheelForward,
        -Math.sign(longitudinalSpeed) * wheelState.load * skidLongGrip,
      );
    }

    if (Math.abs(lateralSpeed) > 0.02) {
      force.addScaledVector(
        wheelRight,
        -Math.sign(lateralSpeed) *
          wheelState.load *
          skidLatGrip *
          THREE.MathUtils.clamp(Math.abs(lateralSpeed) / 3, 0.12, 1),
      );
    }

    const yawTorque =
      computeWheelYawTorque(
        force.dot(wheelForward),
        force.dot(wheelRight),
        contact.wheel.localPosition,
        config.centerOfMass,
      );

    return { force, yawTorque };
  }

  const targetWheelOmega =
    Math.abs(wheelRadius) > 1e-4 ? longitudinalSpeed / wheelRadius : 0;
  const brakeDirection =
    Math.abs(wheelState.angularVelocity) > 0.08
      ? Math.sign(wheelState.angularVelocity)
      : Math.abs(longitudinalSpeed) > 0.08 && Math.abs(wheelRadius) > 1e-4
        ? Math.sign(longitudinalSpeed / wheelRadius)
        : 0;
  const drivetrainAngularAcceleration =
    (driveTorque - brakeTorque * brakeDirection) /
    Math.max(contact.wheel.wheelConfig.inertia, 0.5);

  wheelState.angularVelocity = dampToward(
    wheelState.angularVelocity + drivetrainAngularAcceleration * dt,
    targetWheelOmega,
    wheelState.grounded ? 24 : 4,
    dt,
  );
  if (rearHandbrakeLock > 0.05) {
    wheelState.angularVelocity = dampToward(
      wheelState.angularVelocity,
      0,
      THREE.MathUtils.lerp(24, 90, rearHandbrakeLock),
      dt,
    );
    if (Math.abs(wheelState.angularVelocity) < 0.08) {
      wheelState.angularVelocity = 0;
    }
  }
  if (
    Math.abs(longitudinalSpeed) < 0.12 &&
    Math.abs(state.throttleAxis) < 0.05 &&
    Math.abs(state.brakeAxis) < 0.05 &&
    Math.abs(state.handbrakeAxis) < 0.05
  ) {
    wheelState.angularVelocity = dampToward(wheelState.angularVelocity, 0, 30, dt);
    if (Math.abs(wheelState.angularVelocity) < 0.05) {
      wheelState.angularVelocity = 0;
    }
  }

  wheelState.spinAngle += wheelState.angularVelocity * dt;

  const idleInputs =
    Math.abs(state.throttleAxis) < 0.05 &&
    Math.abs(state.brakeAxis) < 0.05 &&
    Math.abs(state.handbrakeAxis) < 0.05;
  const nearStopped =
    Math.abs(longitudinalSpeed) < 0.2 &&
    Math.abs(lateralSpeed) < 0.15 &&
    horizontalSpeed(state.velocity) < 0.25;

  if (idleInputs && nearStopped) {
    return { force: new THREE.Vector3(), yawTorque: 0 };
  }

  const longitudinalSlip =
    (wheelState.angularVelocity * wheelRadius - longitudinalSpeed) /
    Math.max(Math.abs(longitudinalSpeed), 4);
  const lateralSlip =
    Math.atan2(lateralSpeed, Math.max(Math.abs(longitudinalSpeed), 1.5));
  const movementSpeed = Math.max(
    Math.abs(longitudinalSpeed),
    horizontalSpeed(state.velocity),
  );
  const launchForceBlend = THREE.MathUtils.clamp(
    inverseLerp(0.2, 2.5, movementSpeed),
    0,
    1,
  );
  const steeringForceBlend = THREE.MathUtils.clamp(
    inverseLerp(0.05, 1.5, movementSpeed),
    0,
    1,
  );
  const longitudinalGrip = computeLongitudinalGrip(
    config,
    wheelState,
    longitudinalSlip,
    surfaceGrip,
  );
  const lateralGrip = computeLateralGrip(
    config,
    contact.wheel,
    wheelState,
    lateralSlip,
    surfaceGrip,
    state.handbrakeAxis,
  );
  const tractionForce =
    longitudinalGrip *
    wheelState.load *
    THREE.MathUtils.lerp(0.35, 1, launchForceBlend);
  const rearStabilityScale =
    !contact.wheel.front && state.handbrakeAxis < 0.05 ? 1.25 : 1;
  const lateralForce =
    lateralGrip *
    wheelState.load *
    THREE.MathUtils.lerp(0.55, 1, steeringForceBlend) *
    rearStabilityScale;
  const force = new THREE.Vector3()
    .addScaledVector(wheelForward, tractionForce)
    .addScaledVector(wheelRight, lateralForce);

  const rollingDirection =
    Math.abs(longitudinalSpeed) > 0.15
      ? Math.sign(longitudinalSpeed)
      : Math.abs(wheelState.angularVelocity * wheelRadius) > 0.15
        ? Math.sign(wheelState.angularVelocity * wheelRadius)
        : 0;

  if (rollingDirection !== 0) {
    force.addScaledVector(
      wheelForward,
      -rollingDirection *
        config.tireConfig.rollingResistance *
        wheelState.load *
        0.015,
    );
  }

  const yawTorqueBase = computeWheelYawTorque(
    force.dot(wheelForward),
    force.dot(wheelRight),
    contact.wheel.localPosition,
    config.centerOfMass,
  );
  const yawTorque =
    yawTorqueBase *
    THREE.MathUtils.lerp(0.08, 0.55, steeringForceBlend);

  return { force, yawTorque };
}

function computeDriveTorqueForWheel(wheel, state, config, groundedCount) {
  const driven =
    (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

  if (!driven || groundedCount === 0) {
    return 0;
  }

  const throttleMagnitude =
    state.gear < 0
      ? Math.abs(Math.min(state.throttleAxis, 0))
      : Math.max(state.throttleAxis, 0);
  const handbrakeDriveScale =
    !wheel.front
      ? THREE.MathUtils.lerp(1, 0, THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1))
      : 1;
  const engineTorque =
    sampleEngineTorque(config.engine, state.engineRpm) * throttleMagnitude;
  const gearRatio = getCurrentGearRatio(state, config);
  const differential = wheel.front
    ? config.differentials.front
    : config.differentials.rear;
  const torqueScale = sampleCurve(
    differential.throttleCurve,
    throttleMagnitude,
  );
  const maxTorque = pickScalar(differential.MaxTorque, 5500);
  const wheelCount = countDrivenWheels(config);
  const axleTorque =
    engineTorque *
    gearRatio *
    config.gearbox.endRatio *
    Math.max(state.clutch, 0.2) *
    (state.gear < 0 ? -1 : 1) *
    handbrakeDriveScale *
    (0.35 + torqueScale * 0.65);

  return THREE.MathUtils.clamp(
    axleTorque / Math.max(wheelCount, 1),
    -maxTorque,
    maxTorque,
  );
}

function computeBrakeTorqueForWheel(wheel, state, config) {
  const frontBrakeFactor = wheel.front ? config.brakeBalance : 1 - config.brakeBalance;
  const pedalBrake = config.brakeTorque * state.brakeAxis * frontBrakeFactor;
  const handbrake =
    !wheel.front
      ? config.handBrakeTorque * state.handbrakeAxis
      : config.handBrakeTorque * state.handbrakeAxis * 0.02;

  return pedalBrake + handbrake;
}

function computeLongitudinalGrip(config, wheelState, slip, surfaceGrip) {
  const tire = config.tireConfig;
  const slipRatio = tire.optimalSlipRatio;
  const normalizedSlip = THREE.MathUtils.clamp(
    slip / Math.max(slipRatio, 0.02),
    -2,
    2,
  );
  const baseFriction =
    tire.zFriction[0] +
    tire.zFriction[1] * Math.min(Math.abs(wheelState.angularVelocity) * 0.3, 150);
  const gripScale = surfaceGrip * Math.max(baseFriction, 0.45);

  return normalizedSlip * gripScale;
}

function computeLateralGrip(
  config,
  wheel,
  wheelState,
  slipAngle,
  surfaceGrip,
  handbrakeAxis = 0,
) {
  const tire = config.tireConfig;
  const baseAngle = Math.max(tire.optimalSlipAngle, THREE.MathUtils.degToRad(4));
  const normalizedAngle = THREE.MathUtils.clamp(slipAngle / baseAngle, -2.2, 2.2);
  let gripScale =
    surfaceGrip *
    Math.max(tire.xFriction[0] + tire.xFriction[1] * 0.25, 0.5) *
    (wheel.front ? config.slideControlBalance[0] : config.slideControlBalance[1]);

  if (!wheel.front && handbrakeAxis > 0.05) {
    gripScale *= THREE.MathUtils.lerp(1, 0.18, handbrakeAxis);
  }

  return -normalizedAngle * gripScale;
}

function computeAeroAndRollingForces(state, config, forward, right, runtimeDebug) {
  const force = new THREE.Vector3();
  const forwardSpeed = state.velocity.dot(forward);
  const lateralSpeed = state.velocity.dot(right);
  const verticalSpeed = state.velocity.y;
  const horizontal = horizontalSpeed(state.velocity);

  if (runtimeDebug.aeroForces) {
    force.addScaledVector(
      forward,
      -Math.sign(forwardSpeed) * forwardSpeed * forwardSpeed * config.aeroDrag[0] * 0.8,
    );
    force.addScaledVector(
      right,
      -Math.sign(lateralSpeed) * lateralSpeed * lateralSpeed * config.aeroDrag[1] * 1.4,
    );
    force.y +=
      -Math.sign(verticalSpeed) * verticalSpeed * verticalSpeed * config.aeroDrag[0] * 0.25;

    const downforce = horizontal * horizontal * config.downforceConst * 0.012;
    force.y -= downforce;
  }

  if (runtimeDebug.gravity && !state.grounded) {
    force.y -= config.gravity * config.massKg;
  }

  return force;
}

function updateWheelVisuals(carRoot, wheelLayout, state) {
  for (const wheel of wheelLayout) {
    const tire = wheel.tire;

    if (!tire) {
      continue;
    }

    const wheelState = findWheelState(state, wheel.name);
    tire.position.copy(wheel.tireBasePosition);
    tire.position.y += wheelState.suspensionOffset;

    TMP_QUAT.setFromAxisAngle(WORLD_UP, wheelState.steerAngle);
    TMP_QUAT_B.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -wheelState.spinAngle);
    tire.quaternion.copy(wheel.tireBaseQuaternion);
    tire.quaternion.multiply(TMP_QUAT);
    tire.quaternion.multiply(TMP_QUAT_B);
  }
}

function updateCameraState(state, carRoot, runtimeDebug = null) {
  const forward = TMP_FORWARD.copy(WORLD_FORWARD).applyQuaternion(carRoot.quaternion);
  const right = TMP_RIGHT.crossVectors(forward, WORLD_UP).normalize();
  const up = TMP_UP.copy(WORLD_UP).applyQuaternion(carRoot.quaternion).normalize();
  const forwardSpeed = state.velocity.dot(forward);
  const lateralSpeed = state.velocity.dot(right);
  const horizontalSpeedValue = horizontalSpeed(state.velocity);

  // Chase-camera heading in scene.js should follow the rendered car transform.
  // Supplying a separate physics heading here proved unstable and could rotate
  // the authored chase offset away from the visible car.
  state.cameraState.heading = null;
  state.cameraState.forwardSpeed = forwardSpeed;
  state.cameraState.lateralSpeed = lateralSpeed;
  state.cameraState.horizontalSpeed = horizontalSpeedValue;
  state.cameraState.verticalVelocity = state.velocity.y;
  state.cameraState.yawRate = state.yawRate;
  state.cameraState.roll = Math.atan2(up.x, up.y);
  state.cameraState.pitch = Math.atan2(forward.y, Math.max(forward.length(), 1e-5));
  state.cameraState.surfaceGrip = state.surfaceGrip;
  state.cameraState.grounded = state.grounded;
  state.cameraState.cameraShake =
    runtimeDebug?.cameraShake === false ? 0 : state.cameraShake;
}

function resetVehicleToSpawn(
  carRoot,
  config,
  wheelLayout,
  state,
  trackFloorSampler,
  spawnState,
) {
  carRoot.position.copy(spawnState.position);
  carRoot.quaternion.copy(spawnState.quaternion);
  state.velocity.set(0, 0, 0);
  state.yaw = extractYaw(spawnState.quaternion);
  state.orientationOffset.copy(
    computeOrientationOffset(spawnState.quaternion, state.yaw),
  );
  updatePlanarBasisFromQuaternion(state, spawnState.quaternion);
  state.yawRate = 0;
  state.steerState = 0;
  state.steerVelocity = 0;
  state.throttleAxis = 0;
  state.brakeAxis = 0;
  state.handbrakeAxis = 0;
  state.reverseLatched = false;
  state.gear = 1;
  state.shiftTimer = 0;
  state.shiftTargetGear = 1;
  state.shiftFromGear = 1;
  state.clutch = 1;
  state.engineRpm = config.engine.idleRpm;
  state.grounded = false;
  state.surfaceGrip = 1;
  state.cameraShake = 0;

  for (const wheelState of state.wheelStates) {
    wheelState.grounded = false;
    wheelState.compression = 0;
    wheelState.suspensionOffset = 0;
    wheelState.spinAngle = 0;
    wheelState.angularVelocity = 0;
    wheelState.steerAngle = 0;
    wheelState.load = 0;
  }

  if (trackFloorSampler) {
    const contacts = sampleWheelContacts(carRoot, wheelLayout, trackFloorSampler)
      .filter((entry) => entry.hit);

    if (contacts.length > 0) {
      carRoot.position.y = computeGroundedBodyY(contacts, state, wheelLayout);
    }
  }

  applyVehicleOrientation(carRoot, state);
  updateWheelVisuals(carRoot, wheelLayout, state);
  updateCameraState(state, carRoot);
}

function stabilizeIdleState(state, dt) {
  const horizontal = horizontalSpeed(state.velocity);
  const idleInput =
    Math.abs(state.throttleAxis) < 0.05 &&
    Math.abs(state.brakeAxis) < 0.05 &&
    Math.abs(state.handbrakeAxis) < 0.05 &&
    Math.abs(state.steerState) < 0.05;

  if (state.grounded && idleInput && horizontal < 0.35) {
    state.velocity.x = dampToward(state.velocity.x, 0, 18, dt);
    state.velocity.z = dampToward(state.velocity.z, 0, 18, dt);
    state.yawRate = dampToward(state.yawRate, 0, 14, dt);
    if (Math.abs(state.velocity.x) < 0.02) {
      state.velocity.x = 0;
    }
    if (Math.abs(state.velocity.z) < 0.02) {
      state.velocity.z = 0;
    }
    if (Math.abs(state.yawRate) < 0.01) {
      state.yawRate = 0;
    }
  }
}

function resolveDrivingDebugOptions(debugOptions) {
  return {
    enabled: debugOptions?.enabled ?? true,
    substeps: debugOptions?.substeps ?? null,
    sampleContacts: debugOptions?.sampleContacts ?? true,
    alignToGround: debugOptions?.alignToGround ?? true,
    tireForces: debugOptions?.tireForces ?? true,
    aeroForces: debugOptions?.aeroForces ?? true,
    gravity: debugOptions?.gravity ?? true,
    gearbox: debugOptions?.gearbox ?? true,
    wheelVisuals: debugOptions?.wheelVisuals ?? true,
    cameraShake: debugOptions?.cameraShake ?? true,
    freezePosition: debugOptions?.freezePosition ?? false,
  };
}

function deriveVehicleLightState(state) {
  const brakeStrength = Math.max(
    THREE.MathUtils.clamp(state.brakeAxis, 0, 1),
    THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1) * 0.7,
  );
  const reverseStrength =
    state.gear < 0 || state.throttleAxis < -0.05 || state.reverseLatched ? 1 : 0;

  return {
    brakeStrength,
    reverseStrength,
  };
}

function projectForwardSpeed(state, config) {
  const forward = state.forwardDir ?? getForwardVector(state.yaw, TMP_FORWARD);
  return state.velocity.dot(forward);
}

function averageDrivenWheelOmega(state, config) {
  let sum = 0;
  let count = 0;

  for (const wheelState of state.wheelStates) {
    if (
      (wheelState.front && config.frontTraction) ||
      (!wheelState.front && config.rearTraction)
    ) {
      sum += wheelState.angularVelocity;
      count += 1;
    }
  }

  return count > 0 ? sum / count : 0;
}

function countDrivenWheels(config) {
  let count = 0;
  if (config.frontTraction) {
    count += 2;
  }
  if (config.rearTraction) {
    count += 2;
  }
  return count;
}

function getCurrentGearRatio(state, config) {
  if (state.gear < 0) {
    return Math.abs(config.gearbox.reverseRatio);
  }

  return config.gearbox.ratios[state.gear - 1] ?? config.gearbox.ratios[0] ?? 1;
}

function sampleEngineTorque(engine, rpm) {
  const idle = engine.idleRpm;
  const torquePeakRpm = engine.peakTorqueRpm;
  const powerPeakRpm = engine.peakPowerRpm;
  const redline = engine.redLineRpm;
  const peakTorque = engine.peakTorque;
  const torqueAtPowerPeak = peakTorque * 0.86;

  if (rpm <= torquePeakRpm) {
    return THREE.MathUtils.lerp(
      peakTorque * 0.58,
      peakTorque,
      inverseLerp(idle, torquePeakRpm, rpm),
    );
  }

  if (rpm <= powerPeakRpm) {
    return THREE.MathUtils.lerp(
      peakTorque,
      torqueAtPowerPeak,
      inverseLerp(torquePeakRpm, powerPeakRpm, rpm),
    );
  }

  return THREE.MathUtils.lerp(
    torqueAtPowerPeak,
    peakTorque * 0.38,
    inverseLerp(powerPeakRpm, redline, rpm),
  );
}

function sampleCurve(curve, normalized) {
  if (!Array.isArray(curve) || curve.length === 0) {
    return normalized;
  }

  const scaled = THREE.MathUtils.clamp(normalized, 0, 1) * (curve.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(lowIndex + 1, curve.length - 1);
  const alpha = scaled - lowIndex;
  return THREE.MathUtils.lerp(curve[lowIndex], curve[highIndex], alpha);
}

function computeSurfaceGrip(config, surfaceType) {
  const surface = resolveSurfaceDynamics(config, surfaceType);
  const xGrip = pickScalar(surface.XFriction, 1.25);
  const zGrip = pickScalar(surface.ZFriction, 1.25);
  const boost = pickScalar(surface.FrictionBoost, 0.05);

  return Math.max(((xGrip + zGrip) * 0.5) + boost, 0.35);
}

function resolveSurfaceDynamics(config, surfaceType) {
  switch (surfaceType) {
    case "tarmac":
      return config.surfaceDynamics.tarmac ?? {};
    case "gravel":
      return config.surfaceDynamics.gravel ?? {};
    case "sand":
      return config.surfaceDynamics.sand ?? {};
    case "hazard":
      return config.surfaceDynamics.hazard ?? {};
    case "grass":
    case "dirt":
      return config.surfaceDynamics.forest ?? config.surfaceDynamics.tarmac ?? {};
    default:
      return config.surfaceDynamics.tarmac ?? {};
  }
}

function computeWheelLoad(compression, wheelConfig, state, config) {
  const staticLoad = (config.massKg * config.gravity) / 4;
  const compressionRatio = compression / Math.max(wheelConfig.maxLength, 0.1);
  return staticLoad * (0.7 + compressionRatio * 0.9);
}

function computeWheelYawTorque(
  longitudinalForce,
  lateralForce,
  wheelLocalPosition,
  centerOfMass,
) {
  const lateralOffset = wheelLocalPosition.x - centerOfMass.x;
  const longitudinalOffset = -(wheelLocalPosition.z - centerOfMass.z);
  return lateralOffset * longitudinalForce - longitudinalOffset * lateralForce;
}

function computeWheelbase(wheelLayout) {
  const front = wheelLayout
    .filter((wheel) => wheel.front)
    .reduce((sum, wheel) => sum + wheel.localPosition.z, 0) / 2;
  const rear = wheelLayout
    .filter((wheel) => !wheel.front)
    .reduce((sum, wheel) => sum + wheel.localPosition.z, 0) / 2;
  return Math.abs(rear - front);
}

function computeTrackWidth(wheelLayout) {
  const left = wheelLayout
    .filter((wheel) => wheel.side < 0)
    .reduce((sum, wheel) => sum + wheel.localPosition.x, 0) / 2;
  const right = wheelLayout
    .filter((wheel) => wheel.side > 0)
    .reduce((sum, wheel) => sum + wheel.localPosition.x, 0) / 2;
  return Math.abs(right - left);
}

function getForwardVector(yaw, target) {
  return target.set(Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
}

function getRightVector(forward, target) {
  return target.crossVectors(forward, WORLD_UP).normalize();
}

function getPlanarForwardFromQuaternion(quaternion, target) {
  target.copy(WORLD_FORWARD).applyQuaternion(quaternion);
  target.y = 0;

  if (target.lengthSq() < 1e-8) {
    return target.copy(WORLD_FORWARD);
  }

  return target.normalize();
}

function updatePlanarBasisFromQuaternion(state, quaternion) {
  if (!state.forwardDir) {
    state.forwardDir = new THREE.Vector3();
  }
  if (!state.rightDir) {
    state.rightDir = new THREE.Vector3();
  }

  getPlanarForwardFromQuaternion(quaternion, state.forwardDir);
  getRightVector(state.forwardDir, state.rightDir);
}

function computeOrientationOffset(quaternion, yaw) {
  TMP_QUAT.setFromAxisAngle(WORLD_UP, yaw);
  return TMP_QUAT.clone().invert().multiply(quaternion.clone());
}

function applyVehicleOrientation(carRoot, state) {
  TMP_QUAT.setFromAxisAngle(WORLD_UP, state.yaw);
  carRoot.quaternion.copy(TMP_QUAT).multiply(state.orientationOffset);
}

function extractYaw(quaternion) {
  TMP_A.copy(WORLD_FORWARD).applyQuaternion(quaternion);
  return Math.atan2(TMP_A.x, -TMP_A.z);
}

function estimateWheelRadius(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.min(size.y * 0.18, 0.38);
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

function dampToward(current, target, speed, dt) {
  const alpha = 1 - Math.exp(-Math.max(speed, 0.001) * dt);
  return THREE.MathUtils.lerp(current, target, alpha);
}

function horizontalSpeed(vector) {
  return Math.hypot(vector.x, vector.z);
}

function computeSteeringLimit(steering, speedKph) {
  const speeds = steering.SteeringLimitSpeed ?? DEFAULT_STEERING.SteeringLimitSpeed;
  const rates = steering.SteeringLimitRate ?? DEFAULT_STEERING.SteeringLimitRate;

  if (speedKph <= speeds[0]) {
    return 1;
  }

  for (let index = 1; index < speeds.length; index += 1) {
    if (speedKph <= speeds[index]) {
      return THREE.MathUtils.lerp(
        rates[index - 1] ?? 1,
        rates[index] ?? rates[index - 1] ?? 1,
        inverseLerp(speeds[index - 1], speeds[index], speedKph),
      );
    }
  }

  return rates[rates.length - 1] ?? 0.25;
}

function inverseLerp(min, max, value) {
  if (Math.abs(max - min) < 1e-5) {
    return 0;
  }
  return THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
}

function pickScalar(value, fallback = 0) {
  if (Array.isArray(value)) {
    const first = value.find((entry) => Number.isFinite(entry));
    return Number.isFinite(first) ? first : fallback;
  }
  return Number.isFinite(value) ? value : fallback;
}

function toVector2(value, fallback = [0, 0]) {
  if (Array.isArray(value) && value.length >= 2) {
    return [value[0], value[1]];
  }
  return fallback;
}

function toVector3(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value) && value.length >= 3) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function findWheelState(state, wheelName) {
  return state.wheelStates.find((wheel) => wheel.name === wheelName);
}
