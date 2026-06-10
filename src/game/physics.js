import * as THREE from "three";

import { loadDrivingConfig } from "./drivingConfig";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_FORWARD = new THREE.Vector3(0, 0, -1);
const WORLD_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_TIRE_SPIN_AXIS = new THREE.Vector3(1, 0, 0);
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
const CONTACT_SKIN = 0.035;
const TMP_WHEEL_RAY_OPTIONS = {
  rayDistance: 0,
  minUpDot: 0.2,
};
const TMP_WHEEL_SAMPLE_OPTIONS = {
  rayHeight: CONTACT_RAY_HEIGHT,
  rayDistance: CONTACT_RAY_DISTANCE,
  minUpDot: 0.2,
};
const BODY_COLLISION_SKIN = 0.08;
const RESET_FALL_Y = -30;
const DEFAULT_GRAVITY = 18;
const PITCH_INERTIA_SCALE = 0.82;
const BODY_ANGULAR_DAMPING = 0.92;
const WHEEL_SPIN_COMPRESSION_THRESHOLD = 0.01;
const WHEEL_SPIN_TIMER_WARMUP_SECONDS = 0.35;
const WHEEL_SPIN_TIMER_SCALE = 1 / WHEEL_SPIN_TIMER_WARMUP_SECONDS;

const DEFAULT_STEERING = {
  Sensitivity: 0.5,
  MinAnalogSpeed: 0.1,
  MaxAnalogSpeed: 2,
  MinAtDelta: 1,
  MaxAtDelta: 2,
  CenteringSpeed: 0.9,
  SteeringLimitRate: [1, 0.8, 0.5, 0.25],
  SteeringSpeedRate: [2, 2, 2, 2],
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
  trackContactSampler = null,
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
    contactSamplerAvailable: Boolean(trackContactSampler),
    dynamicBodyCount: dynamicObjectState.length,
  };
  let accumulator = 0;

  resetVehicleToSpawn(
    carRoot,
    config,
    wheelLayout,
    state,
    trackContactSampler,
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
      const wheelContactSampler = trackFloorSampler;

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
              wheelContactSampler,
              wheelContactSampler === trackFloorSampler ? null : trackFloorSampler,
            )
          : [];
        runVehicleSubstep(
          carRoot,
          config,
          wheelLayout,
          state,
          substepContacts,
          runtimeDebug,
          trackContactSampler,
          trackFloorSampler,
          dynamicObjectState,
          FIXED_DT,
        );
        accumulator -= FIXED_DT;
        stepCount += 1;
        stepVehicleMs += nowMs() - stepStart;
      }
      if (stepCount >= MAX_STEPS_PER_FRAME && accumulator >= FIXED_DT) {
        accumulator = Math.min(accumulator, FIXED_DT * 2);
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
          trackContactSampler,
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
  const frontSuspensionBlock = buildSuspensionRuntimeBlock(
    suspension,
    "Front",
    massBase * massFudge,
    DEFAULT_GRAVITY,
  );
  const rearSuspensionBlock = buildSuspensionRuntimeBlock(
    suspension,
    "Rear",
    massBase * massFudge,
    DEFAULT_GRAVITY,
  );

  return {
    steering,
    bodyCollision,
    localTireDynamics,
    surfaceDynamics: rawConfig.surfaceDynamics ?? {},
    contactProfiles: buildContactProfiles(rawConfig.surfaceDynamics ?? {}),
    massKg: massBase * massFudge,
    bodyHalfExtents: bodyBounds.halfExtents,
    bodyOffset: bodyBounds.offset,
    bodyCollisionVolumes: bodyBounds.volumes,
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
      springRate: frontSuspensionBlock.springRate,
      suspensionBlock: frontSuspensionBlock,
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
      springRate: rearSuspensionBlock.springRate,
      suspensionBlock: rearSuspensionBlock,
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
    suspensionLoadBlend: 0.18,
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

function deriveSuspensionSpringRate(massKg, gravity, defaultCompression) {
  const staticWheelLoad = (massKg * gravity) / 4;
  return staticWheelLoad / Math.max(defaultCompression, 0.035);
}

function buildSuspensionRuntimeBlock(suspension, prefix, massKg, gravity) {
  const defaultCompression = pickScalar(
    suspension?.[`${prefix}DefaultCompression`],
    prefix === "Front" ? 0.08 : 0.1,
  );
  const springRate = deriveSuspensionSpringRate(
    massKg,
    gravity,
    defaultCompression,
  );
  const maxLength = pickScalar(suspension?.[`${prefix}MaxLength`], 0.65);
  const bumperLength = pickScalar(suspension?.[`${prefix}BumperLength`], 0.03);
  const bumperConst = pickScalar(suspension?.[`${prefix}BumperConst`], 0);

  return {
    minLength: pickScalar(suspension?.[`${prefix}MinLength`], 0),
    maxLength,
    restLength: pickScalar(
      suspension?.[`${prefix}RestLength`],
      prefix === "Front" ? 0.24 : 0.26,
    ),
    defaultCompression,
    springRate,
    bumpDamp: pickScalar(suspension?.[`${prefix}BumpDamp`], 0.4),
    reboundDamp: pickScalar(suspension?.[`${prefix}ReboundDamp`], 0.7),
    bumperLength,
    bumperConst,
    bumperRestitution: pickScalar(
      suspension?.[`${prefix}BumperRestitution`],
      0,
    ),
    rollbar: pickScalar(suspension?.[`${prefix}RollbarStiffness`], 0.12),
    forceCap: ((massKg * gravity) / 4) * 3.25,
    overshootStart: Math.max(maxLength - bumperLength, maxLength * 0.92),
  };
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
    const wheelEntry = {
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
      brakeVisualParts: collectBrakeVisualParts(tire),
      wheelConfig,
    };
    wheelEntry.contactRecord = {
      wheel: wheelEntry,
      anchorWorld: new THREE.Vector3(),
      suspensionUp: new THREE.Vector3(),
      hit: null,
    };
    return wheelEntry;
  });
}

function collectBrakeVisualParts(tire) {
  if (!tire?.traverse) {
    return [];
  }

  const parts = [];
  tire.traverse((node) => {
    if (node === tire || !node.name) {
      return;
    }

    const name = node.name.toLowerCase();
    if (
      !name.includes("caliper") &&
      !name.includes("brake") &&
      !name.includes("disc") &&
      !name.includes("disk") &&
      !name.includes("rotor")
    ) {
      return;
    }

    node.userData.baseQuaternion = node.quaternion.clone();
    parts.push(node);
  });
  return parts;
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
    pitch: 0,
    roll: 0,
    pitchRate: 0,
    rollRate: 0,
    steerRaw: 0,
    steerState: 0,
    steerVelocity: 0,
    angularVelocity: new THREE.Vector3(),
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
      surfaceType: "tarmac",
      surfaceGrip: 1,
      surfaceXFriction: 1,
      surfaceZFriction: 1,
      materialSlot: 0,
      contactProfile: null,
      contactProfileIndex: 0,
      contactVector: new THREE.Vector3(),
      tireForceMultiplier: 0.6,
      compression: 0,
      previousCompression: 0,
      compressionVelocity: 0,
      nativeDisplacement: 0,
      nativeVelocity: 0,
      nativeOvershoot: 0,
      suspensionOffset: 0,
      suspensionForce: 0,
      spinContactTimer: 0,
      spinAngle: 0,
      angularVelocity: 0,
      driveTorque: 0,
      brakeTorque: 0,
      tireReactionTorque: 0,
      wheelRate: 0,
      steerAngle: 0,
      load: 0,
    })),
    differentialState: {
      front: createDifferentialRuntimeState(),
      rear: createDifferentialRuntimeState(),
    },
    cameraState: { ...DEFAULT_CAMERA_STATE },
  };
}

function createDifferentialRuntimeState() {
  return {
    sideState: 0,
    averageRate: 0,
    leftRate: 0,
    rightRate: 0,
  };
}

function updatePlayerControls(state, input, config, dt) {
  const horizontalKph = horizontalSpeed(state.velocity) * 3.6;
  const forwardSpeed = projectForwardSpeed(state, config);
  const rawThrottle = THREE.MathUtils.clamp(input?.throttle ?? 0, 0, 1);
  const rawBrake = THREE.MathUtils.clamp(input?.brake ?? 0, 0, 1);
  const rawHandbrake = THREE.MathUtils.clamp(input?.handbrake ?? 0, 0, 1);
  const rawSteer = THREE.MathUtils.clamp(input?.steer ?? 0, -1, 1);
  const brakePressed = rawBrake > 0.1;
  const brakeJustPressed = brakePressed && !state.previousBrakePressed;
  const horizontalSpeedMs = horizontalKph / 3.6;
  const wantsReverse =
    brakeJustPressed &&
    rawThrottle < 0.1 &&
    forwardSpeed < 1.1 &&
    horizontalSpeedMs < 1.6;

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
  state.previousBrakePressed = brakePressed;
}

function resolveBodyBounds(bodyCollision, carRoot) {
  const fullVolume = resolveCollisionVolume(
    bodyCollision.collisionFullMin,
    bodyCollision.collisionFullMax,
    new THREE.Vector3(0.3, 0.2, 0.6),
  );

  if (fullVolume) {
    const bottomVolume = resolveCollisionVolume(
      bodyCollision.collisionBottomMin,
      bodyCollision.collisionBottomMax,
      new THREE.Vector3(0.3, 0.12, 0.6),
    );
    const topVolume = resolveCollisionVolume(
      bodyCollision.collisionTopMin,
      bodyCollision.collisionTopMax,
      new THREE.Vector3(0.3, 0.12, 0.6),
    );
    return {
      halfExtents: fullVolume.halfExtents,
      offset: fullVolume.offset,
      volumes: {
        full: fullVolume,
        bottom: bottomVolume ?? fullVolume,
        top: topVolume ?? fullVolume,
      },
    };
  }

  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3()).sub(carRoot.position);
  const halfExtents = size.multiplyScalar(0.5).max(new THREE.Vector3(0.3, 0.2, 0.6));
  return {
    halfExtents,
    offset: center,
    volumes: {
      full: {
        halfExtents: halfExtents.clone(),
        offset: center.clone(),
      },
      bottom: null,
      top: null,
    },
  };
}

function resolveCollisionVolume(minArray, maxArray, minHalfExtents) {
  if (!Array.isArray(minArray) || !Array.isArray(maxArray)) {
    return null;
  }

  const min = new THREE.Vector3().fromArray(minArray);
  const max = new THREE.Vector3().fromArray(maxArray);
  return {
    halfExtents: max.clone().sub(min).multiplyScalar(0.5).max(minHalfExtents),
    offset: min.clone().add(max).multiplyScalar(0.5),
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
  const slipAuthorityScale = THREE.MathUtils.lerp(
    1,
    0.94,
    THREE.MathUtils.clamp((state.slipLatAvg ?? 0) * 1.15, 0, 1),
  );
  const steerTarget =
    steerFiltered *
    steerLimit *
    (rawHandbrake > 0.1 ? 0.98 : 1) *
    slipAuthorityScale;
  const speedRate = computeSteeringSpeedRate(config.steering, steerKph);
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
    const holdSpeedFactor = THREE.MathUtils.clamp(inverseLerp(75, 180, steerKph), 0, 1);
    const digitalHoldRateScale = digitalInput
      ? THREE.MathUtils.lerp(1, 0.82, holdFactor * holdSpeedFactor)
      : 1;
    const rate =
      THREE.MathUtils.lerp(minSpeed, maxSpeed, steerMagnitude) *
      deltaScale *
      speedRate *
      digitalHoldRateScale;
    const minParkingRate = horizontalKph < 10 ? 2.2 : 0;
    const nearLimitScale = THREE.MathUtils.lerp(1, 0.88, Math.abs(state.steerState));
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
  trackContactSampler,
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
  const previousGrounded = state.grounded;
  let totalForce = new THREE.Vector3();
  let totalTorque = new THREE.Vector3();

  updateSteeringRack(wheelLayout, state, config, dt);

  let groundedContacts = [];
  if (runtimeDebug.sampleContacts) {
    groundedContacts = updateWheelContactState(state, sampledContacts, config, dt);
  } else {
    state.grounded = false;
    state.surfaceGrip = 0.92;
  }
  const groundedCount = groundedContacts.length;

  if (runtimeDebug.alignToGround && groundedCount > 0) {
    const suspensionSolve = accumulateSuspensionForces(
      groundedContacts,
      state,
      config,
      forward,
      right,
    );
    totalForce.add(suspensionSolve.force);
    totalTorque.add(suspensionSolve.torque);
    blendResolvedAxleLoads(state, config);
    updateWheelSpinContactTimers(state, config, dt);
    distributeDriveTorqueToWheels(state, config, dt);

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
        totalTorque.addScaledVector(
          wheelState.contactNormal ?? state.groundNormal ?? WORLD_UP,
          wheelForce.yawTorque,
        );
      });
    }

    updateDrivetrainWheelRatesAndRpm(state, config, dt);
    state.grounded = true;
  } else {
    updateWheelSpinContactTimers(state, config, dt);
    distributeDriveTorqueToWheels(state, config, dt);
    updateDrivetrainWheelRatesAndRpm(state, config, dt);
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
  integrateVehicleAngularState(carRoot, state, config, totalTorque, dt);

  stabilizeIdleState(state, dt);
  carRoot.position.addScaledVector(state.velocity, dt);
  correctSuspensionPenetration(carRoot, state, groundedContacts, config, dt);
  if (runtimeDebug.bodyContacts) {
    resolveTrackBodyContacts(carRoot, config, state, trackContactSampler);
  }
  interactWithDynamicObjects(carRoot, config, state, dynamicObjectState, trackFloorSampler, dt);
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

function sampleWheelContacts(
  carRoot,
  wheelLayout,
  trackContactSampler,
  trackFloorSampler = null,
) {
  const primarySampler = trackContactSampler ?? trackFloorSampler;
  if (!primarySampler) {
    return [];
  }

  const suspensionUp = TMP_UP.copy(WORLD_UP).applyQuaternion(carRoot.quaternion).normalize();
  const suspensionDown = TMP_D.copy(suspensionUp).negate();

  const contacts = [];

  for (const wheel of wheelLayout) {
    TMP_A.copy(wheel.localPosition).applyQuaternion(carRoot.quaternion);
    TMP_B.copy(carRoot.position).add(TMP_A);
    const wheelConfig = wheel.wheelConfig;
    const rideHeight =
      wheelConfig.radius +
      wheelConfig.restLength +
      wheelConfig.lift;
    const sweepLead = Math.max(wheelConfig.maxLength, wheelConfig.restLength) + CONTACT_SKIN;
    const sweepDistance = rideHeight + sweepLead + wheelConfig.radius + CONTACT_SKIN;
    const rayOrigin = TMP_C
      .copy(TMP_B)
      .addScaledVector(suspensionUp, sweepLead);
    let hit = null;

    if (primarySampler.raycast) {
      TMP_WHEEL_RAY_OPTIONS.rayDistance = sweepDistance;
      hit = primarySampler.raycast(rayOrigin, suspensionDown, TMP_WHEEL_RAY_OPTIONS);
    } else if (primarySampler.sample) {
      hit = primarySampler.sample(TMP_B, TMP_WHEEL_SAMPLE_OPTIONS);
    }

    if (!hit && trackFloorSampler && trackFloorSampler !== primarySampler) {
      if (trackFloorSampler.raycast) {
        TMP_WHEEL_RAY_OPTIONS.rayDistance = sweepDistance;
        hit = trackFloorSampler.raycast(rayOrigin, suspensionDown, TMP_WHEEL_RAY_OPTIONS);
      } else if (trackFloorSampler.sample) {
        hit = trackFloorSampler.sample(TMP_B, TMP_WHEEL_SAMPLE_OPTIONS);
      }
    }

    const record = wheel.contactRecord;
    record.anchorWorld.copy(TMP_B);
    record.suspensionUp.copy(suspensionUp);
    record.hit = hit;
    contacts.push(record);
  }

  return contacts;
}

function updateWheelContactState(state, sampledContacts, config, dt) {
  for (const wheelState of state.wheelStates) {
    wheelState.grounded = false;
    wheelState.previousCompression = wheelState.compression;
    wheelState.compressionVelocity = 0;
    wheelState.compression = 0;
    wheelState.nativeDisplacement = 0;
    wheelState.nativeVelocity = 0;
    wheelState.nativeOvershoot = 0;
    wheelState.suspensionOffset = 0;
    wheelState.load = 0;
    wheelState.suspensionForce = 0;
    wheelState.materialSlot = 0;
    wheelState.contactProfile = null;
    wheelState.contactProfileIndex = 0;
    wheelState.contactVector.set(0, 0, 0);
    wheelState.tireForceMultiplier = 0.6;
  }

  const groundedContacts = [];
  let surfaceGripSum = 0;
  const normalSum = new THREE.Vector3();

  for (const contact of sampledContacts) {
    if (!contact.hit) {
      continue;
    }

    const wheelState = findWheelState(state, contact.wheel.name);
    const configWheel = contact.wheel.wheelConfig;
    const suspensionAxis = contact.suspensionUp ?? WORLD_UP;
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

    if (compression <= CONTACT_SKIN) {
      continue;
    }

    const wasGrounded = wheelState.grounded;
    wheelState.grounded = true;
    wheelState.compression = compression;
    const rawCompressionVelocity =
      (compression - wheelState.previousCompression) / Math.max(dt, 1e-4);
    wheelState.compressionVelocity = wasGrounded
      ? THREE.MathUtils.clamp(rawCompressionVelocity, -6, 6)
      : THREE.MathUtils.clamp(rawCompressionVelocity, -1.5, 1.5);
    wheelState.nativeDisplacement = compression;
    wheelState.nativeVelocity = wheelState.compressionVelocity;
    wheelState.nativeOvershoot = Math.max(
      compression -
        (configWheel.suspensionBlock?.overshootStart ?? configWheel.maxLength * 0.92),
      0,
    );
    wheelState.suspensionOffset = -compression;
    wheelState.contactPoint.copy(contact.hit.point);
    const contactNormal = TMP_D
      .copy(contact.hit.normal ?? suspensionAxis)
      .normalize();
    if (contactNormal.dot(suspensionAxis) < 0.35) {
      contactNormal.copy(suspensionAxis);
    }

    wheelState.contactNormal.copy(contactNormal);
    wheelState.surfaceType = normalizeSurfaceType(contact.hit.surfaceType);
    wheelState.materialSlot = Number.isFinite(contact.hit.materialSlot)
      ? contact.hit.materialSlot
      : resolveContactProfileIndex(wheelState.surfaceType);
    wheelState.contactProfileIndex = wheelState.materialSlot;
    const surfaceProfile = computeSurfaceProfile(config, wheelState.surfaceType);
    wheelState.contactProfile = surfaceProfile;
    wheelState.surfaceGrip = surfaceProfile.grip;
    wheelState.surfaceXFriction = surfaceProfile.xFriction;
    wheelState.surfaceZFriction = surfaceProfile.zFriction;
    wheelState.tireForceMultiplier = Math.abs(surfaceProfile.slideControl ?? 0.6);
    wheelState.load = computeWheelLoad(
      compression,
      configWheel,
      state,
      config,
      wheelState.compressionVelocity,
      wheelState.nativeOvershoot,
    );
    wheelState.suspensionForce = wheelState.load;
    wheelState.contactVector.copy(contact.hit.point).sub(contact.anchorWorld);
    surfaceGripSum += surfaceProfile.grip;
    normalSum.add(contactNormal);
    groundedContacts.push(contact);
  }

  if (groundedContacts.length === 0) {
    state.surfaceGrip = 0.92;
    return groundedContacts;
  }

  state.surfaceGrip = surfaceGripSum / groundedContacts.length;
  state.groundNormal = normalSum.lengthSq() > 1e-8
    ? normalSum.normalize().clone()
    : WORLD_UP.clone();
  return groundedContacts;
}

function computeGroundedBodyY(groundedContacts, state, wheelLayout) {
  let totalY = 0;
  for (const contact of groundedContacts) {
    const wheelState = findWheelState(state, contact.wheel.name);
    const wheel = wheelLayout.find((entry) => entry.name === contact.wheel.name);
    const defaultCompression =
      wheelState.compression > 0
        ? wheelState.compression
        : wheel.wheelConfig.defaultCompression;
    const rideHeight =
      wheel.wheelConfig.radius +
      wheel.wheelConfig.restLength -
      defaultCompression +
      wheel.wheelConfig.lift;
    totalY += contact.hit.point.y + rideHeight - wheel.localPosition.y;
  }

  return totalY / Math.max(groundedContacts.length, 1);
}

function accumulateSuspensionForces(groundedContacts, state, config, forward, right) {
  const force = new THREE.Vector3();
  const torque = new THREE.Vector3();
  const frontLeft = findWheelState(state, "placeholder_tire_fl");
  const frontRight = findWheelState(state, "placeholder_tire_fr");
  const rearLeft = findWheelState(state, "placeholder_tire_rl");
  const rearRight = findWheelState(state, "placeholder_tire_rr");

  for (const contact of groundedContacts) {
    const wheelState = findWheelState(state, contact.wheel.name);
    const configWheel = contact.wheel.wheelConfig;
    let antiRollForce = 0;

    if (contact.wheel.front && frontLeft.grounded && frontRight.grounded) {
      const axleDelta =
        (frontLeft.compression - frontRight.compression) *
        configWheel.springRate *
        (configWheel.suspensionBlock?.rollbar ?? configWheel.rollbar);
      antiRollForce = contact.wheel.side < 0 ? axleDelta : -axleDelta;
    } else if (!contact.wheel.front && rearLeft.grounded && rearRight.grounded) {
      const axleDelta =
        (rearLeft.compression - rearRight.compression) *
        configWheel.springRate *
        (configWheel.suspensionBlock?.rollbar ?? configWheel.rollbar);
      antiRollForce = contact.wheel.side < 0 ? axleDelta : -axleDelta;
    }

    const suspensionForce = Math.max(wheelState.load + antiRollForce, 0);
    const forceDirection = TMP_C
      .copy(wheelState.contactNormal ?? contact.suspensionUp ?? WORLD_UP)
      .normalize();
    const wheelForce = TMP_D.copy(forceDirection).multiplyScalar(suspensionForce);

    force.add(wheelForce);
    const localX = contact.wheel.localPosition.x - config.centerOfMass.x;
    const localY = contact.wheel.localPosition.y - config.centerOfMass.y;
    const localZ = contact.wheel.localPosition.z - config.centerOfMass.z;
    const bodyUp = TMP_E.copy(WORLD_UP).applyQuaternion(
      TMP_QUAT.copy(state.orientationOffset).premultiply(
        TMP_QUAT_B.setFromAxisAngle(WORLD_UP, state.yaw),
      ),
    );
    if (bodyUp.lengthSq() < 1e-8) {
      bodyUp.copy(WORLD_UP);
    } else {
      bodyUp.normalize();
    }
    const leverArm = TMP_F
      .copy(right)
      .multiplyScalar(localX)
      .addScaledVector(bodyUp, localY)
      .addScaledVector(forward, -localZ);

    torque.add(TMP_G.crossVectors(leverArm, wheelForce));
    wheelState.suspensionForce = suspensionForce;
    wheelState.load = suspensionForce;
  }

  return { force, torque };
}

function blendResolvedAxleLoads(state, config) {
  const blend = THREE.MathUtils.clamp(config.suspensionLoadBlend ?? 0.18, 0, 0.95);
  if (blend <= 0) {
    return;
  }

  blendAxleLoads(
    findWheelState(state, "placeholder_tire_fl"),
    findWheelState(state, "placeholder_tire_fr"),
    blend,
  );
  blendAxleLoads(
    findWheelState(state, "placeholder_tire_rl"),
    findWheelState(state, "placeholder_tire_rr"),
    blend,
  );
}

function blendAxleLoads(leftWheel, rightWheel, blend) {
  if (!leftWheel?.grounded || !rightWheel?.grounded) {
    return;
  }

  const averageLoad = (leftWheel.load + rightWheel.load) * 0.5;
  leftWheel.load = THREE.MathUtils.lerp(leftWheel.load, averageLoad, blend);
  rightWheel.load = THREE.MathUtils.lerp(rightWheel.load, averageLoad, blend);
  leftWheel.suspensionForce = leftWheel.load;
  rightWheel.suspensionForce = rightWheel.load;
}

function integrateVehicleAngularState(carRoot, state, config, torque, dt) {
  const forward = TMP_FORWARD.copy(WORLD_FORWARD).applyQuaternion(carRoot.quaternion);
  const right = TMP_RIGHT.copy(WORLD_RIGHT).applyQuaternion(carRoot.quaternion);
  const up = TMP_UP.copy(WORLD_UP).applyQuaternion(carRoot.quaternion);
  const pitchInertia = Math.max(
    config.massKg * Math.max(state.wheelbase, 1) * PITCH_INERTIA_SCALE,
    1,
  );
  const yawInertia = Math.max(
    config.massKg * Math.max(state.wheelbase * state.trackWidth, 1) * 0.42,
    1,
  );
  const rollInertia = Math.max(
    config.massKg * Math.max(state.trackWidth, 1) * 0.36,
    1,
  );
  const angularAcceleration = TMP_A.set(0, 0, 0);

  if (torque && torque.lengthSq() > 1e-10) {
    angularAcceleration
      .addScaledVector(right, torque.dot(right) / pitchInertia)
      .addScaledVector(up, torque.dot(up) / yawInertia)
      .addScaledVector(forward, torque.dot(forward) / rollInertia);
    state.angularVelocity.addScaledVector(angularAcceleration, dt);
  }

  state.angularVelocity.multiplyScalar(Math.exp(-BODY_ANGULAR_DAMPING * dt));
  if (state.angularVelocity.lengthSq() > 36) {
    state.angularVelocity.setLength(6);
  }

  const angularSpeed = state.angularVelocity.length();
  if (angularSpeed > 1e-6) {
    TMP_QUAT.setFromAxisAngle(
      TMP_B.copy(state.angularVelocity).multiplyScalar(1 / angularSpeed),
      angularSpeed * dt,
    );
    carRoot.quaternion.premultiply(TMP_QUAT).normalize();
  }

  forward.copy(WORLD_FORWARD).applyQuaternion(carRoot.quaternion).normalize();
  right.copy(WORLD_RIGHT).applyQuaternion(carRoot.quaternion).normalize();
  up.copy(WORLD_UP).applyQuaternion(carRoot.quaternion).normalize();
  state.yaw = extractYaw(carRoot.quaternion);
  state.orientationOffset.copy(computeOrientationOffset(carRoot.quaternion, state.yaw));
  state.yawRate = state.angularVelocity.dot(WORLD_UP);
  state.pitchRate = state.angularVelocity.dot(right);
  state.rollRate = -state.angularVelocity.dot(forward);
  state.pitch = Math.atan2(forward.y, Math.max(horizontalSpeed(forward), 1e-5));
  state.roll = Math.atan2(up.x, Math.max(up.y, 1e-5));
}

function correctSuspensionPenetration(carRoot, state, groundedContacts, config, dt) {
  if (groundedContacts.length === 0) {
    return;
  }

  let maxPenetration = 0;
  for (const contact of groundedContacts) {
    const wheelState = findWheelState(state, contact.wheel.name);
    const wheelConfig = contact.wheel.wheelConfig;
    maxPenetration = Math.max(
      maxPenetration,
      wheelState.compression -
        (wheelConfig.suspensionBlock?.overshootStart ?? wheelConfig.maxLength * 0.92),
    );
  }

  if (maxPenetration <= 0) {
    return;
  }

  const correction = Math.min(maxPenetration, 0.08) * (1 - Math.exp(-24 * dt));
  carRoot.position.addScaledVector(state.groundNormal ?? WORLD_UP, correction);
  if (state.velocity.y < 0) {
    state.velocity.y *= 0.35;
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
  const contactNormal = TMP_C
    .copy(wheelState.contactNormal ?? contact.hit.normal ?? WORLD_UP)
    .normalize();
  const wheelForward = TMP_A
    .copy(forward)
    .projectOnPlane(contactNormal)
    .normalize()
    .applyAxisAngle(contactNormal, wheelState.steerAngle);
  const wheelRight = TMP_B.crossVectors(wheelForward, contactNormal).normalize();
  const lateralOffset = contact.wheel.localPosition.x - config.centerOfMass.x;
  const longitudinalOffset =
    -(contact.wheel.localPosition.z - config.centerOfMass.z);
  const wheelVelocity = TMP_D
    .copy(state.velocity)
    .addScaledVector(forward, state.yawRate * lateralOffset)
    .addScaledVector(right, -state.yawRate * longitudinalOffset);
  const longitudinalSpeed = wheelVelocity.dot(wheelForward);
  const lateralSpeed = wheelVelocity.dot(wheelRight);
  const surfaceProfile = computeSurfaceProfile(config, wheelState.surfaceType);
  wheelState.contactProfile = surfaceProfile;
  wheelState.contactProfileIndex = resolveContactProfileIndex(surfaceProfile.type);
  wheelState.surfaceGrip = surfaceProfile.grip;
  wheelState.surfaceXFriction = surfaceProfile.xFriction;
  wheelState.surfaceZFriction = surfaceProfile.zFriction;
  wheelState.tireForceMultiplier = Math.abs(surfaceProfile.slideControl ?? 0.6);
  const driveTorque = computeDriveTorqueForWheel(contact.wheel, state, config, groundedCount);
  const brakeTorque = computeBrakeTorqueForWheel(contact.wheel, state, config);
  const wheelRadius = contact.wheel.wheelConfig.radius;
  const wheelInertia = Math.max(contact.wheel.wheelConfig.inertia, 0.5);
  const isDrivenWheel =
    (contact.wheel.front && config.frontTraction) ||
    (!contact.wheel.front && config.rearTraction);
  wheelState.driveTorque = driveTorque;
  wheelState.brakeTorque = brakeTorque;
  wheelState.tireReactionTorque = 0;
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
      surfaceProfile.grip *
      Math.max(config.tireConfig.zFriction[0], 0.8) *
      THREE.MathUtils.lerp(0.35, 1.05, wheelBrakeLockStrength) *
      rearHandbrakeLongScale *
      skidSpeedBlend;
    const skidLatGripBase =
      surfaceProfile.grip *
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
    (driveTorque - brakeTorque * brakeDirection) / wheelInertia;

  wheelState.angularVelocity += drivetrainAngularAcceleration * dt;
  const rollingSyncRate = isDrivenWheel ? 2.2 : 18;
  wheelState.angularVelocity = dampToward(
    wheelState.angularVelocity,
    targetWheelOmega,
    rollingSyncRate,
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

  const wheelSurfaceSpeed = wheelState.angularVelocity * wheelRadius;
  const longitudinalSlip =
    (wheelSurfaceSpeed - longitudinalSpeed) /
    Math.max(Math.abs(longitudinalSpeed), Math.abs(wheelSurfaceSpeed), 4);
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
    surfaceProfile,
  );
  const lateralGrip = computeLateralGrip(
    config,
    contact.wheel,
    wheelState,
    lateralSlip,
    surfaceProfile,
    state.handbrakeAxis,
  );
  const rearDrivenSpinRelease = computeDrivenWheelLateralRelease(
    contact.wheel,
    config,
    longitudinalSlip,
    state.throttleAxis,
    state.handbrakeAxis,
  );
  const drivenLongitudinalRelease = computeDrivenWheelLongitudinalRelease(
    contact.wheel,
    config,
    longitudinalSlip,
    state.throttleAxis,
    state.steerState,
    horizontalSpeed(state.velocity),
  );
  const combinedSlipScale = computeCombinedSlipScale(
    config,
    longitudinalSlip,
    lateralSlip,
    contact.wheel.front,
    state.handbrakeAxis,
  );
  const profileForceScale = computeContactProfileForceScale(surfaceProfile, wheelState);
  const tractionForce =
    longitudinalGrip *
    wheelState.load *
    THREE.MathUtils.lerp(0.35, 1, launchForceBlend) *
    drivenLongitudinalRelease *
    combinedSlipScale *
    profileForceScale.longitudinal;
  const lateralForce =
    lateralGrip *
    wheelState.load *
    THREE.MathUtils.lerp(0.55, 1, steeringForceBlend) *
    rearDrivenSpinRelease *
    combinedSlipScale *
    profileForceScale.lateral;

  const tireReactionTorque = tractionForce * wheelRadius;
  wheelState.tireReactionTorque = tireReactionTorque;
  wheelState.angularVelocity -= (tireReactionTorque / wheelInertia) * dt;
  wheelState.angularVelocity = THREE.MathUtils.clamp(
    wheelState.angularVelocity,
    -420,
    420,
  );
  wheelState.spinAngle += wheelState.angularVelocity * dt;
  wheelState.wheelRate = wheelState.angularVelocity;

  const force = new THREE.Vector3()
    .addScaledVector(wheelForward, tractionForce)
    .addScaledVector(wheelRight, lateralForce);
  applyContactPlaneScrubForce(
    force,
    wheelVelocity,
    contactNormal,
    wheelState,
    state,
    config,
    surfaceProfile,
    contact.wheel.front,
  );

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
    THREE.MathUtils.lerp(0.35, 1, steeringForceBlend);

  wheelState.longitudinalSpeed = longitudinalSpeed;
  wheelState.lateralSpeed = lateralSpeed;
  wheelState.slipRatio = longitudinalSlip;
  wheelState.slipAngle = lateralSlip;
  wheelState.forwardForce = force.dot(wheelForward);
  wheelState.lateralForce = force.dot(wheelRight);

  return { force, yawTorque };
}

function applyContactPlaneScrubForce(
  force,
  wheelVelocity,
  contactNormal,
  wheelState,
  state,
  config,
  surfaceProfile,
  frontWheel,
) {
  const planarVelocity = TMP_E.copy(wheelVelocity).projectOnPlane(contactNormal);
  const speed = planarVelocity.length();

  if (speed < 0.05) {
    return;
  }

  const brakeDemand = THREE.MathUtils.clamp(state.brakeAxis, 0, 1);
  const handbrakeDemand = frontWheel
    ? THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1) * 0.08
    : THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1);
  const reverseCounterDemand =
    state.throttleAxis < -0.05 && wheelVelocity.dot(state.forwardDir) > 0
      ? THREE.MathUtils.clamp(-state.throttleAxis, 0, 1)
      : 0;
  const coastDemand =
    Math.abs(state.throttleAxis) < 0.05 &&
    brakeDemand < 0.05 &&
    handbrakeDemand < 0.05
      ? THREE.MathUtils.clamp(inverseLerp(0.25, 4, speed), 0, 0.35)
      : 0;
  const demand = Math.max(brakeDemand, handbrakeDemand, reverseCounterDemand, coastDemand);

  if (demand <= 0.01) {
    return;
  }

  const kineticGrip =
    Math.max(surfaceProfile.grip, 0.35) *
    Math.max((surfaceProfile.xFriction + surfaceProfile.zFriction) * 0.5, 0.35);
  const rearHandbrakeScale =
    !frontWheel && handbrakeDemand > 0.05
      ? THREE.MathUtils.lerp(0.55, 0.82, 1 - handbrakeDemand)
      : 1;
  const maxScrubForce =
    wheelState.load *
    kineticGrip *
    THREE.MathUtils.lerp(0.08, 0.72, demand) *
    rearHandbrakeScale;
  const speedScale = THREE.MathUtils.clamp(speed / 3, 0.12, 1);

  force.addScaledVector(
    planarVelocity.normalize(),
    -maxScrubForce * speedScale,
  );
}

function updateWheelSpinContactTimers(state, config, dt) {
  for (const wheelState of state.wheelStates) {
    const wheelConfig = wheelState.front ? config.frontWheel : config.rearWheel;
    const normalizedCompression =
      wheelState.grounded
        ? wheelState.compression / Math.max(wheelConfig.maxLength, 1e-4)
        : 0;

    if (!wheelState.grounded || normalizedCompression <= WHEEL_SPIN_COMPRESSION_THRESHOLD) {
      wheelState.spinContactTimer = 0;
    } else {
      wheelState.spinContactTimer += dt;
    }
  }
}

function distributeDriveTorqueToWheels(state, config, dt) {
  resetWheelDriveTorques(state);
  precomputeWheelBrakeTorques(state, config);
  distributeAxleDriveTorque(state, config, true, dt);
  distributeAxleDriveTorque(state, config, false, dt);
}

function resetWheelDriveTorques(state) {
  for (const wheelState of state.wheelStates) {
    wheelState.driveTorque = 0;
  }
}

function precomputeWheelBrakeTorques(state, config) {
  for (const wheelState of state.wheelStates) {
    const frontBrakeFactor = wheelState.front ? config.brakeBalance : 1 - config.brakeBalance;
    const pedalBrake = config.brakeTorque * state.brakeAxis * frontBrakeFactor;
    const handbrake =
      !wheelState.front
        ? config.handBrakeTorque * state.handbrakeAxis
        : config.handBrakeTorque * state.handbrakeAxis * 0.02;

    wheelState.brakeTorque = pedalBrake + handbrake;
  }
}

function distributeAxleDriveTorque(state, config, frontAxle, dt) {
  const driven = frontAxle ? config.frontTraction : config.rearTraction;

  if (!driven) {
    return;
  }

  const leftWheel = state.wheelStates.find(
    (wheelState) => wheelState.front === frontAxle && wheelState.side < 0,
  );
  const rightWheel = state.wheelStates.find(
    (wheelState) => wheelState.front === frontAxle && wheelState.side > 0,
  );

  if (!leftWheel || !rightWheel) {
    return;
  }

  const differential = frontAxle
    ? config.differentials.front
    : config.differentials.rear;
  const axleTorque = computeAxleDriveTorque(frontAxle, state, config, differential);
  const split = solveDifferentialTorqueSplit(
    state.differentialState[frontAxle ? "front" : "rear"],
    differential,
    leftWheel,
    rightWheel,
    axleTorque,
    dt,
  );

  leftWheel.driveTorque = split.leftTorque;
  rightWheel.driveTorque = split.rightTorque;
}

function computeAxleDriveTorque(frontAxle, state, config, differential) {
  const throttleMagnitude =
    state.gear < 0
      ? Math.abs(Math.min(state.throttleAxis, 0))
      : Math.max(state.throttleAxis, 0);
  const handbrakeDriveScale =
    !frontAxle
      ? THREE.MathUtils.lerp(1, 0, THREE.MathUtils.clamp(state.handbrakeAxis, 0, 1))
      : 1;
  const engineTorque =
    sampleEngineTorque(config.engine, state.engineRpm) * throttleMagnitude;
  const gearRatio = getCurrentGearRatio(state, config);
  const torqueScale = sampleCurve(
    differential.throttleCurve,
    throttleMagnitude,
  );
  const nonlinearThrottleScale =
    torqueScale * 0.3 + torqueScale * torqueScale * torqueScale * 0.7;
  const reverseDriveLimitScale =
    state.gear < 0
      ? computeReverseDriveLimitScale(state, config)
      : 1;
  const drivenAxleCount = Number(config.frontTraction) + Number(config.rearTraction);

  return (
    engineTorque *
    gearRatio *
    config.gearbox.endRatio *
    Math.max(state.clutch, 0.2) *
    (state.gear < 0 ? -1 : 1) *
    handbrakeDriveScale *
    nonlinearThrottleScale *
    reverseDriveLimitScale /
    Math.max(drivenAxleCount, 1)
  );
}

function solveDifferentialTorqueSplit(
  runtimeState,
  differential,
  leftWheel,
  rightWheel,
  axleTorque,
  dt,
) {
  const maxTorque = pickScalar(differential.MaxTorque, 5500);
  const inertia = Math.max(pickScalar(differential.Inertia, 0.06), 0.001);
  const leftTimerScale = computeWheelSpinTimerDifferentialScale(leftWheel);
  const rightTimerScale = computeWheelSpinTimerDifferentialScale(rightWheel);
  const leftWheelRate = leftWheel.angularVelocity * leftTimerScale;
  const rightWheelRate = rightWheel.angularVelocity * rightTimerScale;
  const speedCurveInput = THREE.MathUtils.clamp(
    Math.abs(leftWheelRate - rightWheelRate) * 0.012,
    0,
    1,
  );
  const speedCurve = sampleCurve(differential.speedCurve, speedCurveInput);
  const brakeCurve = sampleCurve(
    differential.brakeCurve,
    THREE.MathUtils.clamp(
      (Math.abs(leftWheel.brakeTorque ?? 0) + Math.abs(rightWheel.brakeTorque ?? 0)) /
        Math.max(maxTorque * 2, 1),
      0,
      1,
    ),
  );
  const lockStrength = THREE.MathUtils.clamp(
    (0.22 + speedCurve * 0.55 + brakeCurve * 0.23) *
      THREE.MathUtils.clamp(Math.abs(axleTorque) / Math.max(maxTorque, 1), 0, 1),
    0,
    1,
  );
  const sideDelta = leftWheelRate - rightWheelRate;
  const targetBias = THREE.MathUtils.clamp(
    -sideDelta * inertia * lockStrength,
    -0.38,
    0.38,
  );

  if (Math.abs(targetBias) < 0.015 || Math.abs(axleTorque) < 1) {
    runtimeState.sideState = 0;
  } else {
    runtimeState.sideState = targetBias > 0 ? 1 : 2;
  }

  const bias = THREE.MathUtils.clamp(
    dampToward(runtimeState.bias ?? 0, targetBias, 18, dt),
    -0.42,
    0.42,
  );
  runtimeState.bias = bias;
  runtimeState.averageRate = (leftWheelRate + rightWheelRate) * 0.5;
  runtimeState.leftRate = leftWheelRate;
  runtimeState.rightRate = rightWheelRate;

  const leftShare = THREE.MathUtils.clamp(0.5 + bias, 0.08, 0.92);
  const rightShare = 1 - leftShare;

  return {
    leftTorque: THREE.MathUtils.clamp(axleTorque * leftShare, -maxTorque, maxTorque),
    rightTorque: THREE.MathUtils.clamp(axleTorque * rightShare, -maxTorque, maxTorque),
  };
}

function updateDrivetrainWheelRatesAndRpm(state, config, dt) {
  let drivenRateSum = 0;
  let drivenCount = 0;

  for (const wheelState of state.wheelStates) {
    wheelState.wheelRate = wheelState.angularVelocity ?? 0;
    if (
      (wheelState.front && config.frontTraction) ||
      (!wheelState.front && config.rearTraction)
    ) {
      drivenRateSum += wheelState.wheelRate;
      drivenCount += 1;
    }
  }

  const averageDrivenRate = drivenCount > 0 ? drivenRateSum / drivenCount : 0;
  state.drivetrainAverageWheelRate = averageDrivenRate;

  if ((state.shiftTimer ?? 0) > 0 || state.gear === 0) {
    return;
  }

  const gearRatio = getCurrentGearRatio(state, config);
  const wheelProjectedRpm =
    Math.abs(averageDrivenRate * gearRatio * config.gearbox.endRatio) *
    (60 / (Math.PI * 2));
  const idleRpm = config.engine.idleRpm;
  const freeRevRpm =
    idleRpm + Math.abs(state.throttleAxis) * (config.engine.redLineRpm - idleRpm);
  const clutchCoupling = THREE.MathUtils.clamp(state.clutch ?? 1, 0, 1);
  const targetRpm = THREE.MathUtils.lerp(
    Math.max(idleRpm, freeRevRpm * 0.35),
    Math.max(idleRpm, wheelProjectedRpm),
    clutchCoupling,
  );

  state.engineRpm = THREE.MathUtils.clamp(
    dampToward(state.engineRpm, targetRpm, 14, dt),
    idleRpm,
    config.engine.redLineRpm * 1.08,
  );
}

function computeWheelSpinTimerDifferentialScale(wheelState) {
  if (!wheelState.grounded) {
    return 1;
  }

  if (wheelState.spinContactTimer >= WHEEL_SPIN_TIMER_WARMUP_SECONDS) {
    return 1;
  }

  return THREE.MathUtils.clamp(
    wheelState.spinContactTimer * WHEEL_SPIN_TIMER_SCALE + 0.25,
    0.25,
    1,
  );
}

function computeDriveTorqueForWheel(wheel, state, config, groundedCount) {
  const driven =
    (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

  if (!driven || groundedCount === 0) {
    return 0;
  }
  return findWheelState(state, wheel.name)?.driveTorque ?? 0;
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

function computeLongitudinalGrip(config, wheelState, slip, surfaceProfile) {
  const tire = config.tireConfig;
  const slipRatio = tire.optimalSlipRatio;
  const normalizedSlip = THREE.MathUtils.clamp(
    slip / Math.max(slipRatio, 0.02),
    -8,
    8,
  );
  const slipResponse = peakSlipResponse(normalizedSlip, 0.28);
  const baseFriction =
    tire.zFriction[0] +
    tire.zFriction[1] * Math.min(Math.abs(wheelState.angularVelocity) * 0.3, 150);
  const zStiffness = surfaceProfile.zStiffness[0] ?? 1;
  const gripScale =
    surfaceProfile.zFriction *
    Math.max(zStiffness, 0.2) *
    Math.max(baseFriction, 0.45) *
    computeLoadSensitivity(config, wheelState);

  return slipResponse * gripScale;
}

function computeLateralGrip(
  config,
  wheel,
  wheelState,
  slipAngle,
  surfaceProfile,
  handbrakeAxis = 0,
) {
  const tire = config.tireConfig;
  const baseAngle = Math.max(tire.optimalSlipAngle, THREE.MathUtils.degToRad(4));
  const normalizedAngle = THREE.MathUtils.clamp(slipAngle / baseAngle, -2.2, 2.2);
  const slipResponse = peakSlipResponse(normalizedAngle, 0.16);
  const xStiffness = surfaceProfile.xStiffness[0] ?? 1;
  let gripScale =
    surfaceProfile.xFriction *
    Math.max(xStiffness, 0.2) *
    Math.max(tire.xFriction[0] + tire.xFriction[1] * 0.25, 0.5) *
    (wheel.front ? config.slideControlBalance[0] : config.slideControlBalance[1]) *
    computeLoadSensitivity(config, wheelState);

  if (!wheel.front && handbrakeAxis > 0.05) {
    gripScale *= THREE.MathUtils.lerp(1, 0.11, handbrakeAxis);
  } else if (wheel.front && handbrakeAxis > 0.05) {
    gripScale *= THREE.MathUtils.lerp(1, 1.18, handbrakeAxis);
  }

  return -slipResponse * gripScale;
}

function computeCombinedSlipScale(
  config,
  longitudinalSlip,
  lateralSlip,
  isFrontWheel,
  handbrakeAxis,
) {
  const longLimit = Math.max(config.tireConfig.optimalSlipRatio * 6.5, 0.75);
  const lateralLimit = Math.max(config.tireConfig.optimalSlipAngle * 7, 0.9);
  const handbrakeRearRelease = !isFrontWheel
    ? THREE.MathUtils.lerp(1, 1.35, THREE.MathUtils.clamp(handbrakeAxis, 0, 1))
    : 1;
  const combined = Math.hypot(
    longitudinalSlip / longLimit,
    lateralSlip / (lateralLimit * handbrakeRearRelease),
  );

  if (combined <= 1) {
    return 1;
  }

  return THREE.MathUtils.clamp(1 / combined, 0.24, 1);
}

function computeContactProfileForceScale(surfaceProfile, wheelState) {
  const offsets = surfaceProfile.nativeOffsets ?? {};
  const slideControl = Math.abs(
    wheelState.tireForceMultiplier ??
      surfaceProfile.slideControl ??
      offsets.profile48 ??
      0.6,
  );
  const slowDown = THREE.MathUtils.clamp(
    surfaceProfile.slowDown ?? offsets.profile50 ?? 0,
    0,
    1,
  );
  const underSteer = THREE.MathUtils.clamp(
    surfaceProfile.underSteer ?? offsets.profile4c ?? 0,
    0,
    1,
  );
  const forceBlend = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(0.72, 1.08, slideControl),
    0.45,
    1.15,
  );

  return {
    longitudinal: forceBlend * THREE.MathUtils.lerp(1, 0.72, slowDown),
    lateral: forceBlend * THREE.MathUtils.lerp(1, 0.82, underSteer),
  };
}

function computeDrivenWheelLateralRelease(
  wheel,
  config,
  longitudinalSlip,
  throttleAxis,
  handbrakeAxis,
) {
  const driven =
    (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

  if (!driven) {
    return 1;
  }

  const driveDemand = wheel.front
    ? Math.abs(throttleAxis)
    : Math.max(Math.abs(throttleAxis), handbrakeAxis * 0.75);
  const spin = THREE.MathUtils.clamp(
    inverseLerp(
      config.tireConfig.optimalSlipRatio * 1.35,
      config.tireConfig.optimalSlipRatio * 7.5,
      Math.abs(longitudinalSlip),
    ),
    0,
    1,
  );
  const release = THREE.MathUtils.lerp(1, wheel.front ? 0.72 : 0.34, spin * driveDemand);

  return THREE.MathUtils.clamp(release, 0.28, 1);
}

function computeDrivenWheelLongitudinalRelease(
  wheel,
  config,
  longitudinalSlip,
  throttleAxis,
  steerState,
  speedMs,
) {
  const driven =
    (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

  if (!driven || wheel.front || throttleAxis <= 0.2) {
    return 1;
  }

  const spin = THREE.MathUtils.clamp(
    inverseLerp(
      config.tireConfig.optimalSlipRatio * 1.4,
      config.tireConfig.optimalSlipRatio * 8,
      Math.abs(longitudinalSlip),
    ),
    0,
    1,
  );
  const steerDemand = THREE.MathUtils.clamp(inverseLerp(0.25, 0.85, Math.abs(steerState)), 0, 1);
  const lowSpeedDemand = THREE.MathUtils.clamp(1 - inverseLerp(10, 28, speedMs), 0, 1);
  const donutDemand = spin * steerDemand * lowSpeedDemand * THREE.MathUtils.clamp(throttleAxis, 0, 1);

  return THREE.MathUtils.lerp(1, 0.36, donutDemand);
}

function peakSlipResponse(normalizedSlip, falloff = 0.22) {
  const absSlip = Math.abs(normalizedSlip);
  const peak = 1;
  const response =
    absSlip <= peak
      ? absSlip
      : THREE.MathUtils.clamp(
          peak / (1 + (absSlip - peak) * Math.max(falloff, 0.01)),
          0.18,
          1,
        );
  return Math.sign(normalizedSlip) * response;
}

function computeLoadSensitivity(config, wheelState) {
  const staticLoad = (config.massKg * config.gravity) / 4;
  const loadRatio = THREE.MathUtils.clamp(
    (wheelState.load ?? staticLoad) / Math.max(staticLoad, 1),
    0.2,
    2.5,
  );
  const optimalLoadFactor = Math.max(config.tireConfig.optimalLoadFactor, 0.1);
  return THREE.MathUtils.clamp(
    Math.pow(loadRatio, 0.72) / Math.pow(optimalLoadFactor, 0.12),
    0.35,
    1.55,
  );
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

  if (runtimeDebug.gravity) {
    force.y -= config.gravity * config.massKg;
  }

  return force;
}

function updateWheelVisuals(carRoot, wheelLayout, state) {
  carRoot.updateWorldMatrix(true, false);

  for (const wheel of wheelLayout) {
    const tire = wheel.tire;

    if (!tire) {
      continue;
    }

    const wheelState = findWheelState(state, wheel.name);
    tire.position.copy(wheel.tireBasePosition);
    const minTravelY =
      wheel.tireBasePosition.y +
      wheel.wheelConfig.defaultCompression -
      wheel.wheelConfig.maxLength;
    const maxTravelY =
      wheel.tireBasePosition.y +
      wheel.wheelConfig.defaultCompression;

    if (wheelState.grounded && wheelState.contactPoint && wheelState.contactNormal) {
      TMP_A
        .copy(wheelState.contactPoint)
        .addScaledVector(
          wheelState.contactNormal,
          Math.max(wheel.wheelConfig.radius, 0.05),
        );
      TMP_B.copy(carRoot.worldToLocal(TMP_A));
      tire.position.y = THREE.MathUtils.clamp(TMP_B.y, minTravelY, maxTravelY);
    } else {
      const compression = THREE.MathUtils.clamp(
        wheelState.compression ?? 0,
        0,
        wheel.wheelConfig.maxLength,
      );
      tire.position.y += wheel.wheelConfig.defaultCompression - compression;
    }

    TMP_QUAT.setFromAxisAngle(WORLD_UP, wheelState.steerAngle);
    TMP_QUAT_B.setFromAxisAngle(LOCAL_TIRE_SPIN_AXIS, -wheelState.spinAngle);
    tire.quaternion.copy(TMP_QUAT);
    tire.quaternion.multiply(wheel.tireBaseQuaternion);
    tire.quaternion.multiply(TMP_QUAT_B);

    if (wheel.brakeVisualParts?.length > 0) {
      TMP_QUAT_C.copy(TMP_QUAT_B).invert();
      for (const part of wheel.brakeVisualParts) {
        part.quaternion.copy(part.userData.baseQuaternion ?? TMP_QUAT.identity());
        part.quaternion.premultiply(TMP_QUAT_C);
      }
    }
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
  trackContactSampler,
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
  state.pitch = 0;
  state.roll = 0;
  state.pitchRate = 0;
  state.rollRate = 0;
  state.angularVelocity.set(0, 0, 0);
  state.steerState = 0;
  state.steerVelocity = 0;
  state.throttleAxis = 0;
  state.brakeAxis = 0;
  state.handbrakeAxis = 0;
  state.reverseLatched = false;
  state.previousBrakePressed = false;
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
    wheelState.previousCompression = 0;
    wheelState.compressionVelocity = 0;
    wheelState.nativeDisplacement = 0;
    wheelState.nativeVelocity = 0;
    wheelState.nativeOvershoot = 0;
    wheelState.suspensionOffset = 0;
    wheelState.suspensionForce = 0;
    wheelState.spinContactTimer = 0;
    wheelState.surfaceType = "tarmac";
    wheelState.surfaceGrip = 1;
    wheelState.surfaceXFriction = 1;
    wheelState.surfaceZFriction = 1;
    wheelState.materialSlot = 0;
    wheelState.contactProfile = null;
    wheelState.contactProfileIndex = 0;
    wheelState.contactVector.set(0, 0, 0);
    wheelState.tireForceMultiplier = 0.6;
    wheelState.spinAngle = 0;
    wheelState.angularVelocity = 0;
    wheelState.driveTorque = 0;
    wheelState.brakeTorque = 0;
    wheelState.tireReactionTorque = 0;
    wheelState.steerAngle = 0;
    wheelState.wheelRate = 0;
    wheelState.load = 0;
  }
  state.differentialState.front = createDifferentialRuntimeState();
  state.differentialState.rear = createDifferentialRuntimeState();

  if (trackFloorSampler ?? trackContactSampler) {
    const contacts = sampleWheelContacts(
      carRoot,
      wheelLayout,
      trackFloorSampler ?? trackContactSampler,
      null,
    )
      .filter((entry) => entry.hit);

    if (contacts.length > 0) {
      carRoot.position.y = computeGroundedBodyY(contacts, state, wheelLayout);
    }
  }

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
    const yawVelocity = state.angularVelocity.dot(WORLD_UP);
    state.angularVelocity.addScaledVector(
      WORLD_UP,
      dampToward(yawVelocity, 0, 14, dt) - yawVelocity,
    );
    if (Math.abs(state.velocity.x) < 0.02) {
      state.velocity.x = 0;
    }
    if (Math.abs(state.velocity.z) < 0.02) {
      state.velocity.z = 0;
    }
    if (Math.abs(state.angularVelocity.dot(WORLD_UP)) < 0.01) {
      state.angularVelocity.addScaledVector(
        WORLD_UP,
        -state.angularVelocity.dot(WORLD_UP),
      );
    }
  }
}

function resolveTrackBodyContacts(carRoot, config, state, trackFloorSampler) {
  if (!trackFloorSampler?.raycast && !trackFloorSampler?.queryObbContacts) {
    return;
  }

  const forward = TMP_FORWARD.copy(state.forwardDir);
  const right = TMP_RIGHT.copy(state.rightDir);
  const up = TMP_UP.copy(WORLD_UP).applyQuaternion(carRoot.quaternion).normalize();
  const directions = [
    forward,
    TMP_A.copy(forward).negate(),
    right,
    TMP_B.copy(right).negate(),
  ];
  TMP_D.copy(state.velocity);
  TMP_D.y = 0;
  if (TMP_D.lengthSq() > 0.25) {
    TMP_D.normalize();
    directions.push(TMP_D);
  }
  const volumes = [
    config.bodyCollisionVolumes?.bottom,
    config.bodyCollisionVolumes?.top,
    config.bodyCollisionVolumes?.full,
  ].filter(Boolean);
  const uniqueVolumes = [];

  for (const volume of volumes) {
    if (!uniqueVolumes.includes(volume)) {
      uniqueVolumes.push(volume);
    }
  }

  for (const volume of uniqueVolumes) {
    const center = TMP_C
      .copy(volume.offset)
      .applyQuaternion(carRoot.quaternion)
      .add(carRoot.position);

    if (trackFloorSampler.queryObbContacts) {
      const contacts = trackFloorSampler.queryObbContacts(
        center,
        { x: right, y: up, z: forward },
        volume.halfExtents,
        {
          skin: BODY_COLLISION_SKIN,
          minUpDot: -0.7,
          maxUpDot: 1,
          maxContacts: 4,
          maxCandidates: 2048,
          preferIndexed: true,
        },
      );

      for (const hit of contacts) {
        applyTrackBodyContact(carRoot, state, center, hit);
      }
      if (contacts.length > 0) {
        continue;
      }
    }

    if (!trackFloorSampler.raycast) {
      continue;
    }

    for (const direction of directions) {
      const supportDistance =
        Math.abs(direction.dot(right)) * volume.halfExtents.x +
        Math.abs(direction.dot(forward)) * volume.halfExtents.z +
        BODY_COLLISION_SKIN;
      const hit = trackFloorSampler.raycast(center, direction, {
        rayDistance: supportDistance,
        minUpDot: -0.7,
        maxUpDot: 1,
        preferIndexed: true,
      });

      if (!hit) {
        continue;
      }

      const penetration = supportDistance - hit.distance;
      if (penetration <= 0) {
        continue;
      }

      applyTrackBodyContact(carRoot, state, center, {
        ...hit,
        penetration,
        normal: hit.normal ?? direction,
      });
    }
  }
}

function applyTrackBodyContact(carRoot, state, center, hit) {
  const penetration = hit?.penetration ?? 0;
  if (!Number.isFinite(penetration) || penetration <= 0) {
    return;
  }

  const normal = TMP_H.copy(hit.normal ?? WORLD_UP).normalize();
  if (normal.lengthSq() < 1e-8) {
    return;
  }
  normal.normalize();

  carRoot.position.addScaledVector(normal, Math.min(penetration, 0.35));
  const velocityIntoWall = state.velocity.dot(normal);
  if (velocityIntoWall < 0) {
    const impact = -velocityIntoWall;
    const heightOffset = Math.abs(center.y - carRoot.position.y);
    applyContactAngularImpulse(state, normal, impact, heightOffset);
    if (hit.point) {
      applyBodyContactAngularImpulse(state, carRoot, normal, hit.point, impact);
    }
    state.velocity.addScaledVector(normal, -velocityIntoWall * 1.08);
    state.velocity.multiplyScalar(0.985);
    state.angularVelocity.addScaledVector(
      WORLD_UP,
      -state.angularVelocity.dot(WORLD_UP) * 0.18,
    );
  }
}

function applyBodyContactAngularImpulse(state, carRoot, normal, contactPoint, impact) {
  if (!Number.isFinite(impact) || impact <= 0 || !contactPoint) {
    return;
  }

  TMP_E.copy(contactPoint).sub(carRoot.position);
  TMP_F.crossVectors(TMP_E, normal);
  if (TMP_F.lengthSq() < 1e-8) {
    return;
  }

  state.angularVelocity.addScaledVector(
    TMP_F.normalize(),
    THREE.MathUtils.clamp(impact * 0.018, -0.45, 0.45),
  );
}

function applyContactAngularImpulse(state, normal, impact, heightOffset = 0) {
  if (!Number.isFinite(impact) || impact <= 0) {
    return;
  }

  const side = normal.dot(state.rightDir);
  const front = normal.dot(state.forwardDir);
  const heightScale = THREE.MathUtils.clamp(heightOffset / 0.9, 0.15, 1.4);
  state.angularVelocity.addScaledVector(
    state.forwardDir,
    -THREE.MathUtils.clamp(side * impact * 0.045 * heightScale, -0.75, 0.75),
  );
  state.angularVelocity.addScaledVector(
    state.rightDir,
    THREE.MathUtils.clamp(-front * impact * 0.035 * heightScale, -0.6, 0.6),
  );
  state.angularVelocity.addScaledVector(
    WORLD_UP,
    THREE.MathUtils.clamp(-side * impact * 0.018, -0.35, 0.35),
  );
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
      applyContactAngularImpulse(state, normal, impact, 0.35);
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
    bodyContacts: debugOptions?.bodyContacts ?? true,
    surfaceSampler: debugOptions?.surfaceSampler ?? false,
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
    pitchDeg: 0,
    rollDeg: 0,
    pitchRateDeg: 0,
    rollRateDeg: 0,
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
    surfaceType: "tarmac",
    surfaceGrip: 1,
    surfaceXFriction: 1,
    surfaceZFriction: 1,
    traction: "RWD",
    slipLongAvg: 0,
    slipLatAvg: 0,
    rearSlipLongAvg: 0,
    rearWheelSpeed: 0,
    rearGroundSpeed: 0,
    rearWheel398: 0,
    diffBiasRear: 0,
    diffRateLeftRear: 0,
    diffRateRightRear: 0,
    frontGripScale: 1,
    rearGripScale: 1,
    wheelContacts: 0,
    forwardImpulse: 0,
    suspensionForce: 0,
    simSteps: 0,
    simBacklogMs: 0,
    chassisPosition: carRoot.position.clone(),
    chassisVelocity: state.velocity.clone(),
    chassisAngularVelocity: new THREE.Vector3(
      state.pitchRate,
      state.yawRate,
      state.rollRate,
    ),
    wheels: state.wheelStates.map(() => ({
      grounded: false,
      surfaceType: "tarmac",
      surfaceGrip: 1,
      surfaceXFriction: 1,
      surfaceZFriction: 1,
      suspensionForce: 0,
      forwardImpulse: 0,
      angularVelocity: 0,
      driveTorque: 0,
      brakeTorque: 0,
      tireReactionTorque: 0,
      spinContactTimer: 0,
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
  const driveTorque = state.wheelStates.reduce(
    (sum, wheel) => sum + Math.abs(wheel.driveTorque ?? 0),
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
  debugState.steerTarget = state.steerTarget ?? state.steerRaw * steerLimit;
  debugState.steerLeftDeg = THREE.MathUtils.radToDeg(frontWheels[0]?.steerAngle ?? 0);
  debugState.steerRightDeg = THREE.MathUtils.radToDeg(frontWheels[1]?.steerAngle ?? 0);
  debugState.yawRateDeg = THREE.MathUtils.radToDeg(state.yawRate);
  debugState.pitchDeg = THREE.MathUtils.radToDeg(state.pitch ?? 0);
  debugState.rollDeg = THREE.MathUtils.radToDeg(state.roll ?? 0);
  debugState.pitchRateDeg = THREE.MathUtils.radToDeg(state.pitchRate ?? 0);
  debugState.rollRateDeg = THREE.MathUtils.radToDeg(state.rollRate ?? 0);
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
  const groundedWheels = state.wheelStates.filter((wheel) => wheel.grounded);
  const activeSurfaceTypes = new Set(
    groundedWheels.map((wheel) => wheel.surfaceType ?? "tarmac"),
  );
  const surfaceDivider = Math.max(groundedWheels.length, 1);
  debugState.surfaceType =
    activeSurfaceTypes.size > 0 ? Array.from(activeSurfaceTypes).join(",") : "air";
  debugState.surfaceXFriction =
    groundedWheels.reduce((sum, wheel) => sum + (wheel.surfaceXFriction ?? 1), 0) /
    surfaceDivider;
  debugState.surfaceZFriction =
    groundedWheels.reduce((sum, wheel) => sum + (wheel.surfaceZFriction ?? 1), 0) /
    surfaceDivider;
  debugState.traction =
    config.frontTraction && config.rearTraction
      ? "AWD"
      : config.frontTraction
        ? "FWD"
        : config.rearTraction
          ? "RWD"
          : "--";
  debugState.slipLongAvg = state.slipLongAvg ?? 0;
  debugState.slipLatAvg = state.slipLatAvg ?? 0;
  const rearWheels = state.wheelStates.filter((wheel) => !wheel.front && wheel.grounded);
  const rearDivider = Math.max(rearWheels.length, 1);
  debugState.rearSlipLongAvg =
    rearWheels.reduce((sum, wheel) => sum + Math.abs(wheel.slipRatio ?? 0), 0) /
    rearDivider;
  debugState.rearWheelSpeed =
    rearWheels.reduce(
      (sum, wheel) => sum + Math.abs((wheel.angularVelocity ?? 0) * config.rearWheel.radius),
      0,
    ) / rearDivider;
  debugState.rearGroundSpeed =
    rearWheels.reduce((sum, wheel) => sum + Math.abs(wheel.longitudinalSpeed ?? 0), 0) /
    rearDivider;
  debugState.rearWheel398 =
    rearWheels.reduce((sum, wheel) => sum + (wheel.spinContactTimer ?? 0), 0) /
    rearDivider;
  debugState.diffBiasRear = state.differentialState.rear.bias ?? 0;
  debugState.diffRateLeftRear = state.differentialState.rear.leftRate ?? 0;
  debugState.diffRateRightRear = state.differentialState.rear.rightRate ?? 0;
  debugState.frontGripScale = state.surfaceGrip;
  debugState.rearGripScale =
    state.surfaceGrip * THREE.MathUtils.lerp(1, 0.18, state.handbrakeAxis);
  debugState.wheelContacts = wheelContacts;
  debugState.engineForce = driveTorque;
  debugState.forwardImpulse = Math.abs(speedForward) * config.massKg;
  debugState.suspensionForce = suspensionForce;
  debugState.simSteps = stepCount;
  debugState.simBacklogMs = accumulator * 1000;
  debugState.chassisPosition.copy(carRoot.position);
  debugState.chassisVelocity.copy(state.velocity);
  debugState.chassisAngularVelocity.set(
    state.pitchRate,
    state.yawRate,
    state.rollRate,
  );
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
    wheelDebug.surfaceType = wheelState.surfaceType ?? "tarmac";
    wheelDebug.surfaceGrip = wheelState.surfaceGrip ?? 1;
    wheelDebug.surfaceXFriction = wheelState.surfaceXFriction ?? 1;
    wheelDebug.surfaceZFriction = wheelState.surfaceZFriction ?? 1;
    wheelDebug.suspensionForce = wheelState.load ?? 0;
    wheelDebug.forwardImpulse =
      Math.abs(wheelState.angularVelocity ?? 0) * wheelState.load * 0.01;
    wheelDebug.angularVelocity = wheelState.angularVelocity ?? 0;
    wheelDebug.driveTorque = wheelState.driveTorque ?? 0;
    wheelDebug.brakeTorque = wheelState.brakeTorque ?? 0;
    wheelDebug.tireReactionTorque = wheelState.tireReactionTorque ?? 0;
    wheelDebug.spinContactTimer = wheelState.spinContactTimer ?? 0;
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
  return computeSurfaceProfile(config, surfaceType).grip;
}

function computeSurfaceProfile(config, surfaceType) {
  const normalizedType = normalizeSurfaceType(surfaceType);
  const nativeProfile =
    config.contactProfiles?.[normalizedType] ??
    config.contactProfiles?.tarmac ??
    null;
  const surface = resolveSurfaceDynamics(config, surfaceType);
  const xGrip = pickScalar(surface.XFriction, 1.25);
  const zGrip = pickScalar(surface.ZFriction, 1.25);
  const boost = pickScalar(surface.FrictionBoost, 0.05);
  const xStiffness = toVector3(surface.XStiffness, [1, 1, 1]).toArray();
  const zStiffness = toVector3(surface.ZStiffness, [1, 1, 1]).toArray();

  return {
    type: normalizedType,
    grip: Math.max(((xGrip + zGrip) * 0.5) + boost, 0.35),
    xFriction: Math.max(xGrip + boost, 0.35),
    zFriction: Math.max(zGrip + boost, 0.35),
    xStiffness,
    zStiffness,
    rollingResistance: pickScalar(surface.RollingResistance, 0.005),
    slideControl: pickScalar(surface.SlideControl, 0),
    slideUnderSteer: pickScalar(surface.SlideUnderSteer, 0),
    underSteer: pickScalar(surface.UnderSteer, 0),
    slowDown: pickScalar(surface.SlowDown, 0),
    antiSpin: pickScalar(surface.AntiSpin, 0),
    native: nativeProfile,
    nativeOffsets: nativeProfile?.nativeOffsets ?? null,
  };
}

function buildContactProfiles(surfaceDynamics) {
  const profiles = {};
  const surfaceTypes = [
    "tarmac",
    "gravel",
    "sand",
    "hazard",
    "forest",
    "object",
    "stuntTarmac",
    "snow",
    "ice",
  ];

  for (const surfaceType of surfaceTypes) {
    const source = surfaceDynamics?.[surfaceType] ?? surfaceDynamics?.tarmac ?? {};
    const normalizedType = normalizeSurfaceType(surfaceType);
    profiles[normalizedType] = buildContactProfile(normalizedType, source);
  }

  profiles.grass = profiles.forest ?? profiles.tarmac;
  profiles.dirt = profiles.forest ?? profiles.tarmac;
  profiles.default = profiles.tarmac;
  return profiles;
}

function buildContactProfile(type, source) {
  const slideUnderSteer = pickScalar(source.SlideUnderSteer, 0);
  const slideControl = pickScalar(source.SlideControl, 0.6);
  const underSteer = pickScalar(source.UnderSteer, 0);
  const slowDown = pickScalar(source.SlowDown, 0);
  const antiSpin = pickScalar(source.AntiSpin, 0);

  return {
    type,
    rollingResistance: pickScalar(source.RollingResistance, 0.005),
    inducedDragCoeff: pickScalar(source.InducedDragCoeff, 0.15),
    pneumaticTrail: pickScalar(source.PneumaticTrail, 0.08),
    pneumaticOffset: pickScalar(source.PneumaticOffset, 0.5),
    zStiffness: toVector3(source.ZStiffness, [1, 0.95, 1]).toArray(),
    xStiffness: toVector3(source.XStiffness, [0.85, 1, 1]).toArray(),
    zFriction: toVector2(source.ZFriction, [1.5, 1]),
    xFriction: toVector2(source.XFriction, [1.5, 1]),
    frictionBoost: pickScalar(source.FrictionBoost, 0.1),
    slideUnderSteer,
    slideControl,
    underSteer,
    slowDown,
    antiSpin,
    nativeOffsets: {
      profile44: slideUnderSteer,
      profile48: slideControl,
      profile4c: underSteer,
      profile50: slowDown,
      profile54: antiSpin,
    },
  };
}

function resolveContactProfileIndex(surfaceType) {
  switch (normalizeSurfaceType(surfaceType)) {
    case "tarmac":
      return 0;
    case "gravel":
      return 1;
    case "sand":
      return 2;
    case "hazard":
      return 3;
    case "grass":
    case "dirt":
      return 4;
    default:
      return 0;
  }
}

function resolveSurfaceDynamics(config, surfaceType) {
  switch (normalizeSurfaceType(surfaceType)) {
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

function normalizeSurfaceType(surfaceType) {
  if (typeof surfaceType !== "string" || surfaceType.length === 0) {
    return "tarmac";
  }

  const normalized = surfaceType.toLowerCase();
  if (normalized === "default" || normalized === "asphalt" || normalized === "road") {
    return "tarmac";
  }
  return normalized;
}

function computeWheelLoad(
  compression,
  wheelConfig,
  state,
  config,
  compressionVelocity = 0,
  overshoot = 0,
) {
  const staticLoad = (config.massKg * config.gravity) / 4;
  const block = wheelConfig.suspensionBlock ?? wheelConfig;
  const springRate = Math.max(block.springRate ?? wheelConfig.springRate, 1);
  const springForce = compression * springRate;
  const quarterMass = Math.max(config.massKg / 4, 1);
  const criticalDamping = 2 * Math.sqrt(springRate * quarterMass);
  const dampingScale =
    compressionVelocity >= 0
      ? Math.max(block.bumpDamp ?? wheelConfig.bumpDamp, 0.05)
      : Math.max(block.reboundDamp ?? wheelConfig.reboundDamp, 0.05);
  const dampingForce = compressionVelocity * criticalDamping * dampingScale;
  const bumpCompression = Math.max(
    compression - Math.max(block.overshootStart ?? wheelConfig.maxLength * 0.92, 0),
    overshoot,
    0,
  );
  const bumpForce =
    bumpCompression *
    (springRate * 1.35 + Math.max(block.bumperConst ?? 0, 0));

  return THREE.MathUtils.clamp(
    springForce + dampingForce + bumpForce,
    0,
    block.forceCap ?? staticLoad * 3.25,
  );
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
