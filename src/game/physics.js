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
const TMP_F = new THREE.Vector3();
const TMP_G = new THREE.Vector3();
const TMP_H = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();
const TMP_QUAT_C = new THREE.Quaternion();
const TMP_MAT = new THREE.Matrix4();
const TMP_MAT_B = new THREE.Matrix4();
const TMP_SCALE = new THREE.Vector3();

const FIXED_DT = 0.01;
const MAX_STEPS_PER_FRAME = 8;
const MAX_FRAME_DELTA = 0.1;
const CONTACT_RAY_HEIGHT = 2.8;
const CONTACT_RAY_DISTANCE = 4.6;
const BODY_COLLISION_SKIN = 0.08;
const BODY_WALL_PROBE_HEIGHT = 0.45;
const RESET_FALL_Y = -30;
const DEFAULT_GRAVITY = 18;

const DEFAULT_STEERING = {
  Sensitivity: 0.5,
  MinAnalogSpeed: 1,
  MaxAnalogSpeed: 5.528,
  MinAtDelta: 0.1,
  MaxAtDelta: 1,
  CenteringSpeed: 0.99,
  SteeringLimitRate: [0.9, 0.75, 0.4, 0.4],
  SteeringSpeedRate: [1, 1, 1, 1],
  SteeringLimitSpeed: [20, 90, 200, 300],
  DigitalThreshold: 0.2,
  MinDigitalSpeed: 1.5,
  MaxDigitalSpeed: 3.5,
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
  dynamicObjects = [],
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
  const debugState = createDebugState(state, config, carRoot);
  const dynamicObjectState = debugOptions?.customDynamicObjects
    ? createCustomDynamicObjectState(dynamicObjects)
    : [];
  debugState.staticWorld = {
    enabled: Boolean(trackFloorSampler),
    dynamicBodyCount: dynamicObjectState.length,
  };
  let accumulator = 0;

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
      const frameStart = nowMs();
      const dt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DELTA);

      if (dt <= 0) {
        return;
      }

      const runtimeDebug = resolveDrivingDebugOptions(debugOptions);

      if (!runtimeDebug.enabled) {
        updateCameraState(state, carRoot, runtimeDebug);
        updateDebugState(debugState, state, config, carRoot, 0, accumulator, {
          frameMs: nowMs() - frameStart,
          stepVehicleMs: 0,
        });
        return;
      }

      accumulator += dt;
      let stepCount = 0;
      let stepVehicleMs = 0;
      const previousGrounded = state.grounded;
      const previousVerticalVelocity = state.velocity.y;

      while (accumulator >= FIXED_DT && stepCount < MAX_STEPS_PER_FRAME) {
        const stepStart = nowMs();
        updatePlayerControls(state, input, config, FIXED_DT);
        if (runtimeDebug.gearbox) {
          updateGearboxState(state, config, FIXED_DT);
        }
        const substepContacts = runtimeDebug.sampleContacts
          ? sampleWheelContacts(
              carRoot,
              wheelLayout,
              trackFloorSampler,
            )
          : [];
        runVehicleSubstep(
          carRoot,
          config,
          wheelLayout,
          state,
          substepContacts,
          runtimeDebug,
          trackFloorSampler,
          dynamicObjectState,
          FIXED_DT,
        );
        accumulator -= FIXED_DT;
        stepCount += 1;
        stepVehicleMs += nowMs() - stepStart;
      }
      syncStateSlipAggregates(state);

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
      updateDebugState(debugState, state, config, carRoot, stepCount, accumulator, {
        frameMs: nowMs() - frameStart,
        stepVehicleMs,
      });
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
    getDebugState() {
      return debugState;
    },
    getConfig() {
      return {
        carId,
        massKg: config.massKg,
        maxForwardGear: config.maxForwardGear,
      };
    },
    dispose() {},
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
  const bodyBounds = resolveBodyBounds(bodyCollision, carRoot);
  const reverseRatio = buildReverseRatio(rawConfig.gearbox ?? {});
  const gearboxEndRatio = pickScalar(rawConfig.gearbox?.EndRatio, 3.7);
  const redLineRpm = pickScalar(engine.RedLineRpm, 6500);
  const drivenReverseWheelRadius = body.RearTraction === false ? frontRadius : rearRadius;
  const reverseSpeedLimitKph = rpmToKph(
    redLineRpm,
    Math.abs(reverseRatio),
    gearboxEndRatio,
    drivenReverseWheelRadius,
  );

  return {
    steering,
    bodyCollision,
    localTireDynamics,
    surfaceDynamics: rawConfig.surfaceDynamics ?? {},
    massKg: massBase * massFudge,
    bodyHalfExtents: bodyBounds.halfExtents,
    bodyOffset: bodyBounds.offset,
    bodyCollisionRadius: Math.max(
      bodyBounds.halfExtents.x,
      bodyBounds.halfExtents.z,
      0.8,
    ),
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
      reverseRatio,
      endRatio: gearboxEndRatio,
      reverseSpeedLimitKph,
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

function buildReverseRatio(gearbox) {
  const reverse = gearbox.GearR;
  return Array.isArray(reverse) ? reverse[0] : -4.1;
}

function rpmToKph(rpm, gearRatio, endRatio, wheelRadius) {
  const wheelOmega = (Math.max(rpm, 0) * Math.PI * 2) / 60;
  const speedMs =
    (wheelOmega * Math.max(wheelRadius, 0.1)) /
    Math.max(Math.abs(gearRatio * endRatio), 0.1);
  return speedMs * 3.6;
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
    groundNormal: WORLD_UP.clone(),
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

  const forwardCounterSlipDemand =
    rawThrottle > 0.28 && forwardSpeed < -0.65 && rawHandbrake < 0.15;
  const backwardCounterSlipDemand =
    rawBrake > 0.35 && forwardSpeed > 0.65 && rawHandbrake < 0.15;
  const preLatchReverseSpinTarget = backwardCounterSlipDemand
    ? -rawBrake *
      THREE.MathUtils.clamp(inverseLerp(20, 0.65, forwardSpeed), 0, 1) *
      THREE.MathUtils.clamp(inverseLerp(0.35, 1, rawBrake), 0, 1)
    : 0;
  const throttleTarget = state.reverseLatched
    ? -rawBrake
    : backwardCounterSlipDemand
      ? Math.min(rawThrottle, preLatchReverseSpinTarget)
      : rawThrottle;
  const brakeTarget = state.reverseLatched ? 0 : rawBrake;
  const throttleRate =
    state.reverseLatched
      ? 7.5
      : forwardCounterSlipDemand
        ? 30
      : backwardCounterSlipDemand
        ? 24
      : state.throttleAxis < 0 && rawThrottle > 0.2
        ? 18
      : rawThrottle < 0.08
        ? 12
      : rawThrottle > 0.65
        ? 9
      : 3.6;
  state.throttleAxis = moveToward(state.throttleAxis, throttleTarget, dt * throttleRate);
  state.brakeAxis = moveToward(state.brakeAxis, brakeTarget, dt * 6.5);
  state.handbrakeAxis = moveToward(
    state.handbrakeAxis,
    rawHandbrake,
    dt * 10,
  );

  const driftRecoveryDemand =
    rawHandbrake > 0.08 ||
    (Math.abs(state.steerState) > 0.22 && horizontalKph > 26) ||
    (Math.abs(state.velocity.dot(state.rightDir)) > 1.15 && horizontalKph > 18);
  if (driftRecoveryDemand) {
    state.driftRecoveryTimer = 0.55;
  } else {
    state.driftRecoveryTimer = Math.max((state.driftRecoveryTimer ?? 0) - dt, 0);
  }

  updateSteeringControlState(state, config, rawSteer, rawHandbrake, horizontalKph, dt);
}

function resolveBodyBounds(bodyCollision, carRoot) {
  const minArray = bodyCollision.collisionFullMin;
  const maxArray = bodyCollision.collisionFullMax;

  if (Array.isArray(minArray) && Array.isArray(maxArray)) {
    const min = new THREE.Vector3().fromArray(minArray);
    const max = new THREE.Vector3().fromArray(maxArray);
    return {
      halfExtents: max.clone().sub(min).multiplyScalar(0.5).max(new THREE.Vector3(0.3, 0.2, 0.6)),
      offset: min.clone().add(max).multiplyScalar(0.5),
    };
  }

  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3()).sub(carRoot.position);
  return {
    halfExtents: size.multiplyScalar(0.5).max(new THREE.Vector3(0.3, 0.2, 0.6)),
    offset: center,
  };
}

function updateSteeringControlState(state, config, rawSteer, rawHandbrake, horizontalKph, dt) {
  const previousSteer = state.steerState;
  const speedFilterRate = Math.abs(rawSteer) > 1e-3 ? 8.5 : 5.5;
  state.steerSpeedKph = dampToward(
    state.steerSpeedKph ?? horizontalKph,
    horizontalKph,
    speedFilterRate,
    dt,
  );
  const steerKph = state.steerSpeedKph;
  const steerMagnitude = Math.abs(rawSteer);
  const steerInputFilterRate = THREE.MathUtils.lerp(
    22,
    8.5,
    Math.pow(THREE.MathUtils.clamp(inverseLerp(35, 155, steerKph), 0, 1), 1.05),
  );
  state.steerRawFiltered = dampToward(
    state.steerRawFiltered ?? rawSteer,
    rawSteer,
    steerInputFilterRate,
    dt,
  );
  const steerFiltered = THREE.MathUtils.clamp(state.steerRawFiltered ?? rawSteer, -1, 1);
  const steerLimit = computeSteeringLimit(config.steering, steerKph);
  const digitalThreshold = Math.max(config.steering.DigitalThreshold ?? 0.2, 0.01);
  const digitalExitThreshold = Math.max(digitalThreshold - 0.08, digitalThreshold * 0.58);
  const digitalInput = state.steerDigitalMode
    ? steerMagnitude >= digitalExitThreshold
    : steerMagnitude >= digitalThreshold;
  state.steerDigitalMode = digitalInput;
  const steerSign = Math.sign(steerFiltered);
  if (digitalInput && steerSign !== 0) {
    if ((state.steerHoldSign ?? 0) === steerSign) {
      state.steerHoldTime = (state.steerHoldTime ?? 0) + dt;
    } else {
      state.steerHoldSign = steerSign;
      state.steerHoldTime = 0;
    }
  } else {
    state.steerHoldSign = 0;
    state.steerHoldTime = 0;
  }
  const holdFactor = THREE.MathUtils.clamp(
    inverseLerp(0.14, 0.7, state.steerHoldTime ?? 0),
    0,
    1,
  );
  const holdSpeedFactor = THREE.MathUtils.clamp(inverseLerp(75, 180, steerKph), 0, 1);
  const highSpeedHoldScale = digitalInput
    ? THREE.MathUtils.lerp(1, 0.6, holdFactor * holdSpeedFactor)
    : 1;
  const highSpeedAuthorityScale = THREE.MathUtils.lerp(
    1,
    0.45,
    Math.pow(THREE.MathUtils.clamp(inverseLerp(70, 190, steerKph), 0, 1), 1.2),
  );
  const highSpeedDigitalScale = digitalInput
    ? THREE.MathUtils.lerp(
        1,
        0.72,
        Math.pow(THREE.MathUtils.clamp(inverseLerp(85, 185, steerKph), 0, 1), 1.1),
      )
    : 1;
  const slipAuthorityScale = THREE.MathUtils.lerp(
    1,
    0.86,
    THREE.MathUtils.clamp((state.slipLatAvg ?? 0) * 1.15, 0, 1),
  );
  const steerTarget =
    steerFiltered *
    steerLimit *
    (rawHandbrake > 0.1 ? 0.98 : 1) *
    highSpeedAuthorityScale *
    highSpeedDigitalScale *
    highSpeedHoldScale *
    slipAuthorityScale;
  const speedRate = computeSteeringSpeedRate(config.steering, steerKph);
  const highSpeedEntryScale = THREE.MathUtils.lerp(
    1,
    0.36,
    Math.pow(THREE.MathUtils.clamp(inverseLerp(35, 145, horizontalKph), 0, 1), 1.15),
  );
  const highSpeedCenterScale = THREE.MathUtils.lerp(
    1,
    2,
    Math.pow(THREE.MathUtils.clamp(inverseLerp(40, 155, horizontalKph), 0, 1), 1.05),
  );

  if (Math.abs(rawSteer) < 1e-3) {
    const driftRecoveryNorm = THREE.MathUtils.clamp((state.driftRecoveryTimer ?? 0) / 0.55, 0, 1);
    const driftRecoveryCenterScale = THREE.MathUtils.lerp(1, 0.62, driftRecoveryNorm);
    const centeringRate = Math.max(
      config.steering.CenteringSpeed *
        speedRate *
        highSpeedCenterScale *
        driftRecoveryCenterScale,
      0.4,
    );
    state.steerState = dampToward(state.steerState, 0, centeringRate, dt);
  } else {
    const minSpeed = digitalInput
      ? config.steering.MinDigitalSpeed
      : config.steering.MinAnalogSpeed;
    const maxSpeed = digitalInput
      ? config.steering.MaxDigitalSpeed
      : config.steering.MaxAnalogSpeed;
    const deltaMagnitude = THREE.MathUtils.clamp(
      Math.abs(steerTarget - state.steerState),
      0,
      1,
    );
    const deltaScale = THREE.MathUtils.lerp(
      config.steering.MinAtDelta,
      config.steering.MaxAtDelta,
      deltaMagnitude,
    );
    const rate =
      THREE.MathUtils.lerp(minSpeed, maxSpeed, steerMagnitude) *
      deltaScale *
      speedRate *
      highSpeedEntryScale;
    const minParkingRate = horizontalKph < 10 ? 2.2 : 0;
    const nearLimitScale = THREE.MathUtils.lerp(1, 0.72, Math.abs(state.steerState));
    state.steerState = moveToward(
      state.steerState,
      steerTarget,
      Math.max(rate * nearLimitScale, minParkingRate) * dt,
    );
  }

  state.steerState = THREE.MathUtils.clamp(state.steerState, -1, 1);
  state.steerRaw = rawSteer;
  state.steerLimit = steerLimit;
  state.steerTarget = steerTarget;
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
  runtimeDebug,
  trackFloorSampler,
  dynamicObjectState,
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
  carRoot.position.addScaledVector(state.velocity, dt);
  if (runtimeDebug.bodyContacts) {
    resolveTrackBodyContacts(carRoot, config, state, trackFloorSampler);
  }
  interactWithDynamicObjects(carRoot, config, state, dynamicObjectState, trackFloorSampler, dt);
  applyVehicleOrientation(carRoot, state);
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
  const normalSum = new THREE.Vector3();

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
    normalSum.add(wheelState.contactNormal);
  }

  state.surfaceGrip = surfaceGripSum / groundedContacts.length;
  state.groundNormal = normalSum.lengthSq() > 1e-8
    ? normalSum.normalize().clone()
    : WORLD_UP.clone();
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

  wheelState.longitudinalSpeed = longitudinalSpeed;
  wheelState.lateralSpeed = lateralSpeed;
  wheelState.slipRatio = longitudinalSlip;
  wheelState.slipAngle = lateralSlip;
  wheelState.forwardForce = force.dot(wheelForward);
  wheelState.lateralForce = force.dot(wheelRight);

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
  const nonlinearThrottleScale = torqueScale * 0.3 + torqueScale * torqueScale * torqueScale * 0.7;
  const reverseDriveLimitScale =
    state.gear < 0
      ? computeReverseDriveLimitScale(state, config)
      : 1;
  const maxTorque = pickScalar(differential.MaxTorque, 5500);
  const wheelCount = countDrivenWheels(config);
  const axleTorque =
    engineTorque *
    gearRatio *
    config.gearbox.endRatio *
    Math.max(state.clutch, 0.2) *
    (state.gear < 0 ? -1 : 1) *
    handbrakeDriveScale *
    nonlinearThrottleScale *
    reverseDriveLimitScale;

  return THREE.MathUtils.clamp(
    axleTorque / Math.max(wheelCount, 1),
    -maxTorque,
    maxTorque,
  );
}

function computeReverseDriveLimitScale(state, config) {
  const limitKph = config.gearbox.reverseSpeedLimitKph;
  if (!Number.isFinite(limitKph) || limitKph <= 1) {
    return 1;
  }

  const reverseSpeedKph = Math.max(-projectForwardSpeed(state, config) * 3.6, 0);
  const taperStartKph = limitKph * 0.82;

  if (reverseSpeedKph <= taperStartKph) {
    return 1;
  }

  if (reverseSpeedKph >= limitKph) {
    return 0;
  }

  const t = inverseLerp(taperStartKph, limitKph, reverseSpeedKph);
  const smooth = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(1, 0, smooth);
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
    tire.quaternion.copy(TMP_QUAT);
    tire.quaternion.multiply(wheel.tireBaseQuaternion);
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
  state.groundNormal.copy(WORLD_UP);
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

function resolveTrackBodyContacts(carRoot, config, state, trackFloorSampler) {
  if (!trackFloorSampler?.raycast) {
    return;
  }

  const center = TMP_C
    .copy(carRoot.position)
    .addScaledVector(state.groundNormal ?? WORLD_UP, BODY_WALL_PROBE_HEIGHT);
  const forward = TMP_FORWARD.copy(state.forwardDir);
  const right = TMP_RIGHT.copy(state.rightDir);
  const radius = config.bodyCollisionRadius + BODY_COLLISION_SKIN;
  const directions = [
    forward,
    TMP_A.copy(forward).negate(),
    right,
    TMP_B.copy(right).negate(),
    TMP_D.copy(forward).add(right).normalize(),
    TMP_E.copy(forward).sub(right).normalize(),
    TMP_F.copy(forward).negate().add(right).normalize(),
    TMP_G.copy(forward).negate().sub(right).normalize(),
  ];

  for (const direction of directions) {
    const hit = trackFloorSampler.raycast(center, direction, {
      rayDistance: radius,
      minUpDot: -0.7,
      maxUpDot: 0.78,
    });

    if (!hit) {
      continue;
    }

    const penetration = radius - hit.distance;
    if (penetration <= 0) {
      continue;
    }

    const normal = TMP_H.copy(hit.normal ?? direction).normalize();
    if (normal.y > 0.82) {
      continue;
    }
    normal.y = Math.min(normal.y, 0.25);
    if (normal.lengthSq() < 1e-8) {
      normal.copy(direction).negate();
    }
    normal.normalize();

    carRoot.position.addScaledVector(normal, penetration);
    const velocityIntoWall = state.velocity.dot(normal);
    if (velocityIntoWall < 0) {
      state.velocity.addScaledVector(normal, -velocityIntoWall * 1.08);
      state.velocity.multiplyScalar(0.985);
      state.yawRate *= 0.82;
    }
  }
}

function createCustomDynamicObjectState(dynamicObjects) {
  if (!Array.isArray(dynamicObjects) || dynamicObjects.length === 0) {
    return [];
  }

  const entries = [];
  for (const object of dynamicObjects) {
    const renderNode = object.renderNode;
    if (!renderNode) {
      continue;
    }

    renderNode.updateWorldMatrix(true, true);
    const worldPosition = renderNode.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = renderNode.getWorldQuaternion(new THREE.Quaternion());
    const worldScale = renderNode.getWorldScale(new THREE.Vector3());
    const absScale = new THREE.Vector3(
      Math.abs(worldScale.x),
      Math.abs(worldScale.y),
      Math.abs(worldScale.z),
    );
    const halfExtents = object.model?.radius
      ? new THREE.Vector3().fromArray(object.model.radius).multiply(absScale)
      : new THREE.Box3()
          .setFromObject(object.collisionNode ?? renderNode)
          .getSize(new THREE.Vector3())
          .multiplyScalar(0.5);

    if (halfExtents.lengthSq() < 1e-6) {
      continue;
    }

    entries.push({
      ...object,
      renderNode,
      renderParent: renderNode.parent ?? null,
      renderScale: renderNode.scale.clone(),
      position: worldPosition,
      quaternion: worldQuaternion,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      halfExtents,
      radius: Math.max(halfExtents.x, halfExtents.z, 0.2),
      mass: getCustomDynamicMass(object.dynamicName),
      dormant: shouldCustomDynamicStartDormant(object.dynamicName),
    });
  }

  return entries;
}

function interactWithDynamicObjects(
  carRoot,
  config,
  state,
  dynamicObjectState,
  trackFloorSampler,
  dt,
) {
  if (!Array.isArray(dynamicObjectState) || dynamicObjectState.length === 0) {
    return;
  }

  const carRadius = config.bodyCollisionRadius;
  const carPosition = TMP_A.copy(carRoot.position);
  const carSpeed = horizontalSpeed(state.velocity);

  for (const entry of dynamicObjectState) {
    const delta = TMP_B.copy(entry.position).sub(carPosition);
    delta.y = 0;
    const distance = delta.length();
    const contactDistance = carRadius + entry.radius;

    if (distance < contactDistance && carSpeed > 0.25) {
      const normal = distance > 1e-4
        ? delta.multiplyScalar(1 / distance)
        : TMP_C.copy(state.forwardDir);
      const impact = Math.max(state.velocity.dot(normal), carSpeed * 0.35, 0);
      const push = Math.max(contactDistance - distance, 0) + impact * dt * 0.9;
      entry.dormant = false;
      entry.velocity.addScaledVector(normal, impact * (config.massKg / Math.max(entry.mass, 1)) * 0.025);
      entry.velocity.addScaledVector(state.velocity, 0.08);
      entry.angularVelocity.y += normal.cross(state.forwardDir).y * impact * 0.5;
      entry.position.addScaledVector(normal, push);
      carRoot.position.addScaledVector(normal, -push * 0.12);
      state.velocity.addScaledVector(normal, -impact * 0.12);
    }

    if (!entry.dormant) {
      entry.velocity.y -= DEFAULT_GRAVITY * dt;
      entry.position.addScaledVector(entry.velocity, dt);
      entry.velocity.multiplyScalar(Math.exp(-dt * 0.9));
      entry.angularVelocity.multiplyScalar(Math.exp(-dt * 1.4));
      settleDynamicObjectOnTrack(entry, trackFloorSampler);
      syncCustomDynamicRenderNode(entry);
    }
  }
}

function settleDynamicObjectOnTrack(entry, trackFloorSampler) {
  if (!trackFloorSampler?.sample) {
    return;
  }

  const hit = trackFloorSampler.sample(entry.position, {
    rayHeight: 3,
    rayDistance: 8,
    minUpDot: -0.1,
  });

  if (!hit) {
    return;
  }

  const minY = hit.point.y + Math.min(entry.halfExtents.y, 0.45);
  if (entry.position.y < minY) {
    entry.position.y = minY;
    if (entry.velocity.y < 0) {
      entry.velocity.y *= -0.18;
    }
    entry.velocity.x *= 0.94;
    entry.velocity.z *= 0.94;
  }
}

function syncCustomDynamicRenderNode(entry) {
  const renderNode = entry.renderNode;
  if (!renderNode) {
    return;
  }

  if (entry.angularVelocity.lengthSq() > 1e-8) {
    TMP_QUAT_C.setFromEuler(
      new THREE.Euler(
        entry.angularVelocity.x * FIXED_DT,
        entry.angularVelocity.y * FIXED_DT,
        entry.angularVelocity.z * FIXED_DT,
      ),
    );
    entry.quaternion.multiply(TMP_QUAT_C).normalize();
  }

  if (entry.renderParent) {
    entry.renderParent.updateWorldMatrix(true, false);
    TMP_SCALE.copy(entry.renderScale);
    TMP_MAT.compose(entry.position, entry.quaternion, TMP_SCALE);
    TMP_MAT_B.copy(entry.renderParent.matrixWorld).invert().multiply(TMP_MAT);
    TMP_MAT_B.decompose(renderNode.position, renderNode.quaternion, renderNode.scale);
    renderNode.scale.copy(entry.renderScale);
  } else {
    renderNode.position.copy(entry.position);
    renderNode.quaternion.copy(entry.quaternion);
    renderNode.scale.copy(entry.renderScale);
  }
}

function getCustomDynamicMass(dynamicName) {
  switch (dynamicName) {
    case "rubber_cone":
      return 5;
    case "rubber_tire":
    case "metal_obstacle":
      return 12;
    case "concrete_block_superheavy":
      return 35;
    case "window":
      return 1.2;
    default:
      return 8;
  }
}

function shouldCustomDynamicStartDormant(dynamicName) {
  return !["rubber_cone", "rubber_tire", "metal_barrel", "cardboard_box", "hay_box"].includes(
    dynamicName,
  );
}

function syncStateSlipAggregates(state) {
  let longSum = 0;
  let longCount = 0;
  let latSum = 0;
  let latCount = 0;

  for (const wheelState of state.wheelStates) {
    if (!wheelState.grounded) {
      continue;
    }
    if (Number.isFinite(wheelState.slipRatio)) {
      longSum += Math.abs(wheelState.slipRatio);
      longCount += 1;
    }
    if (Number.isFinite(wheelState.slipAngle)) {
      latSum += Math.abs(wheelState.slipAngle);
      latCount += 1;
    }
  }

  state.slipLongAvg = longCount > 0 ? longSum / longCount : 0;
  state.slipLatAvg = latCount > 0 ? latSum / latCount : 0;
}

function resolveDrivingDebugOptions(debugOptions) {
  return {
    enabled: debugOptions?.enabled ?? true,
    sampleContacts: debugOptions?.sampleContacts ?? true,
    alignToGround: debugOptions?.alignToGround ?? true,
    tireForces:
      debugOptions?.tireForces ??
      (
        debugOptions?.driveForce !== false ||
        debugOptions?.steering !== false ||
        debugOptions?.braking !== false ||
        debugOptions?.handbrake !== false
      ),
    aeroForces:
      debugOptions?.aeroForces ??
      (
        debugOptions?.aeroDrag !== false ||
        debugOptions?.lateralDrag !== false ||
        debugOptions?.downforce !== false
      ),
    gravity: debugOptions?.gravity ?? true,
    gearbox: debugOptions?.gearbox ?? true,
    wheelVisuals: debugOptions?.wheelVisuals ?? true,
    cameraShake: debugOptions?.cameraShake ?? true,
    bodyContacts: debugOptions?.bodyContacts ?? false,
    freezePosition: debugOptions?.freezePosition ?? false,
  };
}

function createDebugState(state, config, carRoot) {
  return {
    mode: "original-js",
    grounded: false,
    groundToi: null,
    gear: state.gear,
    reverseSpeedLimitKph: config.gearbox.reverseSpeedLimitKph,
    engineRpm: state.engineRpm,
    clutch: state.clutch,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    steer: 0,
    steerRaw: 0,
    steerState: 0,
    steerLimit: 1,
    steerTarget: 0,
    steerLeftDeg: 0,
    steerRightDeg: 0,
    yawRateDeg: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    handbrakeAxis: 0,
    rawThrottleInput: 0,
    rawBrakeInput: 0,
    rawHandbrakeInput: 0,
    rawSteerInput: 0,
    speedForward: 0,
    speedRight: 0,
    speedHorizontal: 0,
    surfaceGrip: 1,
    slipLongAvg: 0,
    slipLatAvg: 0,
    frontGripScale: 1,
    rearGripScale: 1,
    wheelContacts: 0,
    forwardImpulse: 0,
    suspensionForce: 0,
    simSteps: 0,
    simBacklogMs: 0,
    chassisPosition: carRoot.position.clone(),
    chassisVelocity: state.velocity.clone(),
    chassisAngularVelocity: new THREE.Vector3(0, state.yawRate, 0),
    wheels: state.wheelStates.map(() => ({
      grounded: false,
      suspensionForce: 0,
      forwardImpulse: 0,
      angularVelocity: 0,
      wheelLongitudinalSpeed: 0,
      groundRelativeLongitudinalVelocity: 0,
      slipRatio: 0,
      slipAngle: 0,
    })),
    perf: {
      frameMs: 0,
      stepVehicleMs: 0,
      worldStepMs: 0,
      dynamicPropsMs: 0,
      dynamicSyncMs: 0,
      clearanceMs: 0,
      wheelVisualsMs: 0,
    },
  };
}

function updateDebugState(
  debugState,
  state,
  config,
  carRoot,
  stepCount,
  accumulator,
  perf,
) {
  const forward = TMP_FORWARD.copy(state.forwardDir);
  const right = TMP_RIGHT.copy(state.rightDir);
  const speedForward = state.velocity.dot(forward);
  const speedRight = state.velocity.dot(right);
  const steerLimit = computeSteeringLimit(
    config.steering,
    horizontalSpeed(state.velocity) * 3.6,
  );
  const frontWheels = state.wheelStates.filter((wheel) => wheel.front);
  const wheelContacts = state.wheelStates.filter((wheel) => wheel.grounded).length;
  const suspensionForce = state.wheelStates.reduce(
    (sum, wheel) => sum + (wheel.load ?? 0),
    0,
  );

  debugState.mode = "original-js";
  debugState.grounded = state.grounded;
  debugState.gear = state.gear;
  debugState.reverseSpeedLimitKph = config.gearbox.reverseSpeedLimitKph;
  debugState.engineRpm = state.engineRpm;
  debugState.clutch = state.clutch;
  debugState.throttle = state.throttleAxis;
  debugState.brake = state.brakeAxis;
  debugState.handbrake = state.handbrakeAxis;
  debugState.steer = state.steerState;
  debugState.steerRaw = state.steerRaw;
  debugState.steerState = state.steerState;
  debugState.steerLimit = steerLimit;
  debugState.steerTarget = state.steerRaw * steerLimit;
  debugState.steerLeftDeg = THREE.MathUtils.radToDeg(frontWheels[0]?.steerAngle ?? 0);
  debugState.steerRightDeg = THREE.MathUtils.radToDeg(frontWheels[1]?.steerAngle ?? 0);
  debugState.yawRateDeg = THREE.MathUtils.radToDeg(state.yawRate);
  debugState.throttleAxis = state.throttleAxis;
  debugState.brakeAxis = state.brakeAxis;
  debugState.handbrakeAxis = state.handbrakeAxis;
  debugState.rawThrottleInput = state.reverseLatched ? 0 : Math.max(state.throttleAxis, 0);
  debugState.rawBrakeInput = state.brakeAxis;
  debugState.rawHandbrakeInput = state.handbrakeAxis;
  debugState.rawSteerInput = state.steerRaw;
  debugState.speedForward = speedForward;
  debugState.speedRight = speedRight;
  debugState.speedHorizontal = horizontalSpeed(state.velocity);
  debugState.surfaceGrip = state.surfaceGrip;
  debugState.slipLongAvg = state.slipLongAvg ?? 0;
  debugState.slipLatAvg = state.slipLatAvg ?? 0;
  debugState.frontGripScale = state.surfaceGrip;
  debugState.rearGripScale =
    state.surfaceGrip * THREE.MathUtils.lerp(1, 0.18, state.handbrakeAxis);
  debugState.wheelContacts = wheelContacts;
  debugState.forwardImpulse = Math.abs(speedForward) * config.massKg;
  debugState.suspensionForce = suspensionForce;
  debugState.simSteps = stepCount;
  debugState.simBacklogMs = accumulator * 1000;
  debugState.chassisPosition.copy(carRoot.position);
  debugState.chassisVelocity.copy(state.velocity);
  debugState.chassisAngularVelocity.set(0, state.yawRate, 0);
  debugState.perf = {
    frameMs: perf.frameMs ?? 0,
    stepVehicleMs: perf.stepVehicleMs ?? 0,
    worldStepMs: 0,
    dynamicPropsMs: 0,
    dynamicSyncMs: 0,
    clearanceMs: 0,
    wheelVisualsMs: 0,
  };

  for (let index = 0; index < state.wheelStates.length; index += 1) {
    const wheelState = state.wheelStates[index];
    const wheelDebug = debugState.wheels[index];
    if (!wheelDebug) {
      continue;
    }
    wheelDebug.grounded = wheelState.grounded;
    wheelDebug.suspensionForce = wheelState.load ?? 0;
    wheelDebug.forwardImpulse =
      Math.abs(wheelState.angularVelocity ?? 0) * wheelState.load * 0.01;
    wheelDebug.angularVelocity = wheelState.angularVelocity ?? 0;
    wheelDebug.wheelLongitudinalSpeed =
      (wheelState.angularVelocity ?? 0) *
      (index < 2 ? config.frontWheel.radius : config.rearWheel.radius);
    wheelDebug.groundRelativeLongitudinalVelocity =
      wheelState.longitudinalSpeed ?? speedForward;
    wheelDebug.slipRatio = wheelState.slipRatio ?? 0;
    wheelDebug.slipAngle = wheelState.slipAngle ?? 0;
  }
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

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
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
  const up = TMP_UP.copy(state.groundNormal ?? WORLD_UP);
  if (up.lengthSq() < 1e-8) {
    up.copy(WORLD_UP);
  }
  up.normalize();

  const yawForward = TMP_FORWARD.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  yawForward.projectOnPlane(up);
  if (yawForward.lengthSq() < 1e-8) {
    yawForward.set(0, 0, -1).projectOnPlane(up);
  }
  yawForward.normalize();
  const right = TMP_RIGHT.crossVectors(yawForward, up).normalize();
  const back = TMP_A.copy(yawForward).negate();

  TMP_MAT.makeBasis(right, up, back);
  TMP_QUAT.setFromRotationMatrix(TMP_MAT);
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

function computeSteeringSpeedRate(steering, speedKph) {
  const speeds = steering.SteeringLimitSpeed ?? DEFAULT_STEERING.SteeringLimitSpeed;
  const rates = steering.SteeringSpeedRate ?? DEFAULT_STEERING.SteeringSpeedRate;

  if (!Array.isArray(speeds) || !Array.isArray(rates) || rates.length === 0) {
    return 1;
  }

  if (speedKph <= speeds[0]) {
    return rates[0] ?? 1;
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

  return rates[rates.length - 1] ?? 1;
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
