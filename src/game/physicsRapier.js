import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import { loadDrivingConfig } from "./drivingConfig";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const COLLISION_GROUP_STATIC = 0x0001;
const COLLISION_GROUP_PROP = 0x0002;
const COLLISION_GROUP_HELPER = 0x0004;
const COLLISION_GROUP_VEHICLE = 0x0008;
const FIXED_DT = 1 / 60;
const DEFAULT_GRAVITY = 18;
// Keep simulation real-time under low render FPS; 4 steps caused hard time-dilation.
const MAX_STEPS_PER_FRAME = 8;
const MAX_FRAME_DELTA = 0.1;
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_VEC = new THREE.Vector3();
const TMP_VEC_B = new THREE.Vector3();
const TMP_VEC_C = new THREE.Vector3();
const TMP_VEC_D = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();
const TMP_QUAT_C = new THREE.Quaternion();
const TMP_MAT = new THREE.Matrix4();
const TMP_MAT_B = new THREE.Matrix4();
const ENABLE_STATIC_WORLD_COLLISION = true;
const ENABLE_DIRECT_DRIVE_DEBUG = false;
const DB_PROFILE_INDEX = 0;

export async function createDrivingSimulation({
  carId,
  carRoot,
  assetUrls,
  input,
  collisionRoot = null,
  dynamicObjects = [],
  trackFloorSampler = null,
  debugOptions = null,
}) {
  await RAPIER.init();

  const rawConfig = await loadDrivingConfig({ assetUrls });
  const config = buildRapierVehicleConfig(rawConfig, carRoot);
  const world = new RAPIER.World({ x: 0, y: -config.gravity, z: 0 });
  world.timestep = FIXED_DT;
  world.numSolverIterations = 8;
  world.numInternalPgsIterations = 2;
  world.maxCcdSubsteps = 1;

  const staticWorldDebug = buildStaticWorldFromRoot(world, collisionRoot, dynamicObjects);
  const dynamicObjectState = createDynamicSceneObjects(world, dynamicObjects);

  const spawnTranslation = carRoot.position
    .clone()
    .add(config.bodyOffset)
    .add(new THREE.Vector3(0, computeSpawnLift(config), 0));
  const spawnRotation = carRoot.quaternion.clone();
  const chassis = createChassisBody(world, config, spawnTranslation, spawnRotation);
  const chassisColliders = Array.from(
    { length: chassis.numColliders() },
    (_, index) => chassis.collider(index),
  );
  const vehicleController = createVehicleController(world, chassis, config);
  const cameraState = createCameraState();
  const debugState = createDebugState();
  debugState.isolation = debugOptions;
  debugState.staticWorld = staticWorldDebug;
  debugState.staticWorld.dynamicBodyCount = dynamicObjectState.length;
  debugState.staticWorld.dynamicCategorySummary = summarizeDynamicCategories(
    dynamicObjectState,
  );
  let accumulator = 0;
  let previousResetPressed = false;

  syncCarRootFromBody(carRoot, chassis, config);
  updateWheelVisuals(config, chassis, vehicleController, debugState, FIXED_DT);
  updateCameraState(cameraState, chassis, carRoot);

  return {
    update(deltaSeconds) {
      const dt = Math.min(Math.max(deltaSeconds, 0), MAX_FRAME_DELTA);

      if (dt <= 0) {
        return;
      }

      if (input?.resetPressed && !previousResetPressed) {
        resetChassis(chassis, spawnTranslation, spawnRotation);
      }
      previousResetPressed = Boolean(input?.resetPressed);

      accumulator += dt;
      let stepCount = 0;

      while (accumulator >= FIXED_DT && stepCount < MAX_STEPS_PER_FRAME) {
        stepVehicle(
          world,
          chassis,
          vehicleController,
          config,
          input,
          debugState,
          trackFloorSampler,
        );
        activateImpactedDynamicObjects(
          world,
          dynamicObjectState,
          chassis,
          chassisColliders,
        );
        world.step();
        accumulator -= FIXED_DT;
        stepCount += 1;
      }
      debugState.simSteps = stepCount;
      debugState.simBacklogMs = accumulator * 1000;

      if (stepCount > 0) {
        syncCarRootFromBody(carRoot, chassis, config);
      }

      syncDynamicSceneObjects(dynamicObjectState);
      updateCameraState(cameraState, chassis, carRoot);
      updateDebugState(debugState, chassis, config);
      updateWheelVisuals(config, chassis, vehicleController, debugState, dt);
    },
    speedKph() {
      return horizontalSpeed(rapierVectorToThree(chassis.linvel(), TMP_VEC)) * 3.6;
    },
    getCameraState() {
      return cameraState;
    },
    getLightState() {
      // TODO: Vehicle light parity still needs end-to-end verification against FO2 light channels.
      // The Rapier wrapper previously returned boolean keys that the material path ignored.
      const brakeStrength = Math.max(
        THREE.MathUtils.clamp(debugState.brakeAxis ?? 0, 0, 1),
        THREE.MathUtils.clamp(debugState.handbrakeAxis ?? 0, 0, 1) * 0.7,
      );
      const reverseStrength =
        debugState.throttleAxis < -0.05 || debugState.reverseLatched ? 1 : 0;

      return {
        brakeStrength,
        reverseStrength,
      };
    },
    getDebugState() {
      return debugState;
    },
    dispose() {
      world.removeVehicleController(vehicleController);
      world.free();
    },
  };
}

function buildRapierVehicleConfig(rawConfig, carRoot) {
  const bodyCollision = rawConfig.bodyCollision ?? {};
  const car = rawConfig.car ?? {};
  const body = rawConfig.body ?? {};
  const engine = rawConfig.engine ?? {};
  const gearbox = rawConfig.gearbox ?? {};
  const suspension = rawConfig.suspension ?? {};
  const tires = rawConfig.tires ?? {};
  const steering = rawConfig.steering ?? {};
  const localTireDynamics = rawConfig.localTireDynamics ?? {};
  const bounds = resolveBodyBounds(bodyCollision, carRoot);
  const wheelMetrics = resolveWheelLayout(carRoot);
  const frontTireRadius = Math.max(readProfileScalar(tires.FrontRadius, 0.34), 0.1);
  const rearTireRadius = Math.max(
    readProfileScalar(tires.RearRadius, frontTireRadius),
    0.1,
  );
  const wheelLayout = buildWheelVisualLayout(carRoot, suspension, {
    frontTireRadius,
    rearTireRadius,
  });
  const gearRatios = buildGearRatios(gearbox);
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
  const centerOfMass = readVec3(car.CenterOfMass, [0, 0.1, 0.05]);
  const centerOfDownforce = readVec3(car.CenterOfDownforce, [0, 0.45, 0]);
  const aeroDragLoc = readVec3(body.AeroDragLoc, [0, 0, -0.2]);
  const tireFrontXFriction = readVec2(tires.XFriction, [1, 0]);
  const tireFrontZFriction = readVec2(tires.ZFriction, [1, 0]);
  const tireFrontRadius = Math.max(readProfileScalar(tires.FrontRadius, 0.34), 0.1);
  const tireRearRadius = Math.max(readProfileScalar(tires.RearRadius, tireFrontRadius), 0.1);
  // Local tire INI uses gameplay-scale values (e.g. RollingResistance=0.5, InducedDragCoeff=1.0),
  // while runtime tire dynamics consume physical-scale coefficients (~0.005 / ~0.15).
  // Map local values as multipliers around their native baselines instead of reading them literally.
  const localRollingResistance = readProfileScalar(
    rawConfig.localTireDynamics?.RollingResistance ?? tires.RollingResistance,
    0.5,
  );
  const localInducedDrag = readProfileScalar(
    rawConfig.localTireDynamics?.InducedDragCoeff ?? tires.InducedDrag,
    1,
  );
  const tireRollingResistance =
    0.005 * clamp(localRollingResistance / 0.5, 0.2, 3.5);
  const tireInducedDragCoeff =
    0.15 * clamp(localInducedDrag / 1, 0.2, 3.5);
  const surfaceDynamics = rawConfig.surfaceDynamics ?? {};
  const massKg = Math.max(readProfileScalar(car.Mass, 980), 600);
  const brakeTorque = Math.max(readProfileScalar(body.BrakeTorque, 5200), 1200);
  const handBrakeTorque = Math.max(readProfileScalar(body.HandBrakeTorque, 5200), 1200);
  const brakeRadius = Math.max((tireFrontRadius + tireRearRadius) * 0.5, 0.1);
  const brakeTorqueToOneGScale = (massKg * DEFAULT_GRAVITY * brakeRadius) / (4 * brakeTorque);
  const handBrakeTorqueToOneGScale =
    (massKg * DEFAULT_GRAVITY * brakeRadius) / (4 * handBrakeTorque);
  const steeringLimitRates = readVec4(steering.SteeringLimitRate, [1, 0.8, 0.5, 0.25]);
  const steeringLimitSpeeds = readVec4(steering.SteeringLimitSpeed, [20, 40, 100, 250]);
  const steeringSpeedRates = readVec4(steering.SteeringSpeedRate, [2, 2, 2, 2]);
  const numGears = Math.max(Math.round(readProfileScalar(gearbox.NumGears, 0)), 0);
  const gearRatiosLimited = numGears > 0 ? gearRatios.slice(0, numGears) : gearRatios;
  const frontLongGrip = clamp(tireFrontZFriction[0], 0.35, 3);
  const frontLatGrip = clamp(tireFrontXFriction[0], 0.35, 3);
  const rearLongGrip = clamp(readProfileScalar(tires.ZFriction, frontLongGrip), 0.35, 3);
  const rearLatGrip = clamp(readProfileScalar(tires.XFriction, frontLatGrip), 0.35, 3);
  const baseWheelFrictionSlipFront = clamp(frontLongGrip * 6.5, 2.4, 18);
  const baseWheelFrictionSlipRear = clamp(rearLongGrip * 6.5, 2.4, 18);
  const baseWheelSideStiffnessFront = clamp(frontLatGrip * 0.85, 0.35, 2.4);
  const baseWheelSideStiffnessRear = clamp(rearLatGrip * 0.85, 0.35, 2.4);

  return {
    gravity: DEFAULT_GRAVITY,
    // Native runtime consumer path for MassFudgeFactor is not fully confirmed yet.
    // Using it directly here inverted class pacing (e.g. car_1 slower, heavy pickups faster).
    // Keep direct mass until full native mass/fudge mapping is recovered.
    massKg,
    // Keep MassFudgeFactor out of rigid-body mass, but preserve it as a
    // per-car drivetrain scalar. This restores class pacing direction
    // (light FWD cars up, heavy pickups down) without destabilizing chassis mass.
    driveForceScale: clamp(readProfileScalar(car.MassFudgeFactor, 1), 0.6, 1.6),
    bodyHalfExtents: bounds.halfExtents,
    bodyOffset: bounds.offset,
    wheelbase: wheelMetrics.wheelbase,
    trackWidth: wheelMetrics.trackWidth,
    frontTraction: Boolean(body.FrontTraction),
    rearTraction: body.RearTraction !== false,
    peakTorque: Math.max(readProfileScalar(engine.PeakTorque, 210), 120),
    brakeTorque,
    handBrakeTorque,
    brakeTorqueScale: clamp(brakeTorqueToOneGScale, 0.02, 0.55),
    handBrakeTorqueScale: clamp(handBrakeTorqueToOneGScale, 0.02, 0.55),
    brakeBalance: clamp(readProfileScalar(body.BrakeBalance, 0.6), 0.1, 0.9),
    tireTurnAngleInDeg: Math.max(readProfileScalar(body.TireTurnAngleIn, 36), 20),
    tireTurnAngleOutDeg: Math.max(
      readProfileScalar(body.TireTurnAngleOut, readProfileScalar(body.TireTurnAngleIn, 36)),
      20,
    ),
    downforceConst: Math.max(readProfileScalar(body.DownforceConst, 2), 0.5),
    centerOfDownforce: new THREE.Vector3(
      centerOfDownforce[0],
      centerOfDownforce[1],
      -centerOfDownforce[2],
    ),
    aeroDrag: readVec2(body.AeroDrag, [0.3, 0.3]),
    aeroDragLoc: new THREE.Vector3(aeroDragLoc[0], aeroDragLoc[1], -aeroDragLoc[2]),
    centerOfMass: new THREE.Vector3(centerOfMass[0], centerOfMass[1], -centerOfMass[2]),
    steering: {
      Sensitivity: readProfileScalar(steering.Sensitivity, 0.5),
      MinAnalogSpeed: readProfileScalar(steering.MinAnalogSpeed, 0.1),
      MaxAnalogSpeed: readProfileScalar(steering.MaxAnalogSpeed, 2),
      MinAtDelta: readProfileScalar(steering.MinAtDelta, 1),
      MaxAtDelta: readProfileScalar(steering.MaxAtDelta, 2),
      CenteringSpeed: readProfileScalar(steering.CenteringSpeed, 0.9),
      DigitalThreshold: readProfileScalar(steering.DigitalThreshold, 0.2),
      MinDigitalSpeed: readProfileScalar(steering.MinDigitalSpeed, 1),
      MaxDigitalSpeed: readProfileScalar(steering.MaxDigitalSpeed, 2.5),
      SteeringLimitRate: steeringLimitRates,
      SteeringLimitSpeed: steeringLimitSpeeds,
      SteeringSpeedRate: steeringSpeedRates,
    },
    frontSuspension: {
      defaultCompression: Math.max(
        readProfileScalar(suspension.FrontDefaultCompression, 0.08),
        0,
      ),
      restLength: Math.max(
        readProfileScalar(suspension.FrontRestLength, 0.24) -
          readProfileScalar(suspension.FrontDefaultCompression, 0.08),
        0.08,
      ),
      maxTravel: Math.max(readProfileScalar(suspension.FrontMaxLength, 0.65), 0.12),
      stiffness: Math.max(readProfileScalar(suspension.FrontZStiffness, 18), 6),
      compression: Math.max(readProfileScalar(suspension.FrontBumpDamp, 2.4), 0.5),
      relaxation: Math.max(readProfileScalar(suspension.FrontReboundDamp, 3.2), 0.5),
    },
    rearSuspension: {
      defaultCompression: Math.max(
        readProfileScalar(suspension.RearDefaultCompression, 0.1),
        0,
      ),
      restLength: Math.max(
        readProfileScalar(suspension.RearRestLength, 0.26) -
          readProfileScalar(suspension.RearDefaultCompression, 0.1),
        0.08,
      ),
      maxTravel: Math.max(readProfileScalar(suspension.RearMaxLength, 0.65), 0.12),
      stiffness: Math.max(readProfileScalar(suspension.RearZStiffness, 20), 6),
      compression: Math.max(readProfileScalar(suspension.RearBumpDamp, 2.2), 0.5),
      relaxation: Math.max(readProfileScalar(suspension.RearReboundDamp, 3), 0.5),
    },
    wheelLayout,
    frontTireRadius,
    rearTireRadius,
    visualRideHeight: computeVisualRideHeight(bounds, wheelLayout),
    tireConfig: {
      rollingResistance: tireRollingResistance,
      inducedDragCoeff: tireInducedDragCoeff,
      frontXFriction: frontLatGrip,
      frontZFriction: frontLongGrip,
      rearXFriction: rearLatGrip,
      rearZFriction: rearLongGrip,
      baseWheelFrictionSlipFront,
      baseWheelFrictionSlipRear,
      baseWheelSideStiffnessFront,
      baseWheelSideStiffnessRear,
      frontMass: Math.max(readProfileScalar(tires.FrontMass, 25), 1),
      rearMass: Math.max(readProfileScalar(tires.RearMass, 25), 1),
      optimalSlipRatio: clamp(readProfileScalar(tires.OptimalSlipRatio, 0.15), 0.02, 0.5),
      optimalSlipAngleDeg: clamp(readProfileScalar(tires.OptimalSlipAngle, 12), 1, 35),
      pneumaticTrail: Math.max(
        readProfileScalar(
          rawConfig.localTireDynamics?.PneumaticTrail ?? tires.PneumaticTrail,
          0.08,
        ),
        0,
      ),
      pneumaticOffset: clamp(
        readProfileScalar(
          rawConfig.localTireDynamics?.PneumaticOffset ?? tires.PneumaticOffset,
          0.5,
        ),
        0,
        2,
      ),
    },
    surfaceDynamics,
    engine: {
      idleRpm: readProfileScalar(engine.IdleRpm, 1000),
      peakTorqueRpm: readProfileScalar(engine.PeakTorqueRpm, 4500),
      peakTorque: readProfileScalar(engine.PeakTorque, 210),
      peakPowerRpm: readProfileScalar(engine.PeakPowerRpm, 6000),
      peakPower: readProfileScalar(engine.PeakPower, 120),
      redLineRpm: readProfileScalar(engine.RedLineRpm, 6500),
      zeroPowerRpm: readProfileScalar(engine.ZeroPowerRpm, 600),
      inertia: readProfileScalar(engine.InertiaEngine, 0.15),
      friction: readProfileScalar(engine.EngineFriction, 0.015),
      rpmLimit: readProfileScalar(engine.RpmLimit, readProfileScalar(engine.RedLineRpm, 6500)),
      launchShiftRpm: Math.max(
        readProfileScalar(engine.PeakTorqueRpm, 4500),
        readProfileScalar(engine.IdleRpm, 1000) + 1200,
      ),
      launchTargetRpm: Math.min(
        readProfileScalar(engine.RedLineRpm, 6500) * 0.94,
        Math.max(
          readProfileScalar(engine.PeakTorqueRpm, 4500) + 300,
          readProfileScalar(engine.IdleRpm, 1000) + 1600,
        ),
      ),
    },
    gearbox: {
      ratios: gearRatiosLimited,
      reverseRatio: buildReverseRatio(gearbox),
      endRatio: readProfileScalar(gearbox.EndRatio, 3.7),
      clutchEngageTime: readProfileScalar(gearbox.ClutchEngageTime, 0.1),
      clutchReleaseTime: readProfileScalar(gearbox.ClutchReleaseTime, 0.1),
      clutchTorque: readProfileScalar(gearbox.ClutchTorque, 280),
      numGears: numGears || gearRatiosLimited.length,
    },
    shiftBands: buildShiftBands({
      gearRatios: gearRatiosLimited,
      reverseRatio: buildReverseRatio(gearbox),
      endRatio: readProfileScalar(gearbox.EndRatio, 3.7),
      engine: {
        idleRpm: readProfileScalar(engine.IdleRpm, 1000),
        peakTorqueRpm: readProfileScalar(engine.PeakTorqueRpm, 4500),
        peakPowerRpm: readProfileScalar(engine.PeakPowerRpm, 6000),
        redLineRpm: readProfileScalar(engine.RedLineRpm, 6500),
      },
      drivenWheelRadius: averageDrivenWheelRadiusFromLayout(
        wheelLayout,
        Boolean(body.FrontTraction),
        body.RearTraction !== false,
      ),
    }),
    differentials: {
      front: frontDifferential,
      rear: rearDifferential,
    },
    drivenWheelCount: countDrivenWheels(Boolean(body.FrontTraction), body.RearTraction !== false),
  };
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

function resolveWheelLayout(carRoot) {
  const fl = carRoot.getObjectByName("placeholder_tire_fl");
  const fr = carRoot.getObjectByName("placeholder_tire_fr");
  const rl = carRoot.getObjectByName("placeholder_tire_rl");
  const rr = carRoot.getObjectByName("placeholder_tire_rr");
  const frontCenter = averageVector(fl?.position, fr?.position, new THREE.Vector3(0, 0, -1.3));
  const rearCenter = averageVector(rl?.position, rr?.position, new THREE.Vector3(0, 0, 1.3));
  const leftCenter = averageVector(fl?.position, rl?.position, new THREE.Vector3(-0.85, 0, 0));
  const rightCenter = averageVector(fr?.position, rr?.position, new THREE.Vector3(0.85, 0, 0));

  return {
    wheelbase: Math.max(frontCenter.distanceTo(rearCenter), 1.8),
    trackWidth: Math.max(leftCenter.distanceTo(rightCenter), 1.2),
  };
}

function averageVector(a, b, fallback) {
  if (a && b) {
    return a.clone().add(b).multiplyScalar(0.5);
  }

  return fallback.clone();
}

function buildWheelVisualLayout(carRoot, suspension, tireConfig = {}) {
  const wheelNames = [
    { name: "placeholder_tire_fl", front: true, side: -1 },
    { name: "placeholder_tire_fr", front: true, side: 1 },
    { name: "placeholder_tire_rl", front: false, side: -1 },
    { name: "placeholder_tire_rr", front: false, side: 1 },
  ];

  return wheelNames.map((wheel) => {
    const anchor = carRoot.getObjectByName(wheel.name);
    const tire = carRoot.getObjectByName(`${wheel.name}_tire`);
    const tireRadius = wheel.front
      ? Math.max(tireConfig.frontTireRadius ?? estimateTireRadius(tire), 0.1)
      : Math.max(tireConfig.rearTireRadius ?? estimateTireRadius(tire), 0.1);

    return {
      ...wheel,
      localPosition:
        anchor?.position?.clone?.() ??
        new THREE.Vector3(
          wheel.side * 0.85,
          tireRadius + 0.2,
          wheel.front ? -1.3 : 1.3,
        ),
      tire,
      tireBasePosition: tire?.position?.clone?.() ?? new THREE.Vector3(),
      tireBaseQuaternion: tire?.quaternion?.clone?.() ?? new THREE.Quaternion(),
      tireRadius,
      suspensionRestLength: Math.max(
        wheel.front
          ? Number.parseFloat(suspension?.FrontRestLength ?? tireRadius + 0.18) -
              Number.parseFloat(suspension?.FrontDefaultCompression ?? 0.08)
          : Number.parseFloat(suspension?.RearRestLength ?? tireRadius + 0.2) -
              Number.parseFloat(suspension?.RearDefaultCompression ?? 0.1),
        0.08,
      ),
      defaultCompression: Math.max(
        wheel.front
          ? Number.parseFloat(suspension?.FrontDefaultCompression ?? 0.08)
          : Number.parseFloat(suspension?.RearDefaultCompression ?? 0.1),
        0,
      ),
      currentRotation: 0,
      angularVelocity: 0,
      spinAngle: 0,
      steerAngle: 0,
    };
  });
}

function estimateTireRadius(tire) {
  if (!tire) {
    return 0.34;
  }

  const box = new THREE.Box3().setFromObject(tire);
  const size = box.getSize(new THREE.Vector3());
  return Math.max(size.y, size.z) * 0.5 || 0.34;
}

function computeVisualRideHeight(bounds, wheelLayout) {
  const lowestWheelPoint = wheelLayout.reduce(
    (minValue, wheel) => Math.min(minValue, wheel.localPosition.y - wheel.tireRadius),
    Number.POSITIVE_INFINITY,
  );

  if (!Number.isFinite(lowestWheelPoint)) {
    return 0;
  }

  const chassisBottomLocal = bounds.offset.y - bounds.halfExtents.y;
  return Math.max(chassisBottomLocal - lowestWheelPoint - 0.015, 0);
}

function buildStaticWorldFromRoot(world, root, dynamicObjects = []) {
  if (!root || !ENABLE_STATIC_WORLD_COLLISION) {
    return {
      enabled: false,
      colliderCount: 0,
      meshCount: 0,
      triangleCount: 0,
      boundsMin: null,
      boundsMax: null,
    };
  }

  root.updateWorldMatrix(true, true);
  const excludedNames = new Set(dynamicObjects.map((entry) => entry.collisionName ?? entry.name));
  const merged = extractMergedWorldTrimesh(root, excludedNames);

  if (!merged) {
    return {
      enabled: true,
      colliderCount: 0,
      meshCount: 0,
      triangleCount: 0,
      boundsMin: null,
      boundsMax: null,
    };
  }

  const colliderDesc = RAPIER.ColliderDesc.trimesh(
    merged.vertices,
    merged.indices,
  )
    .setFriction(1.1)
    .setRestitution(0)
    .setCollisionGroups(
      interactionGroups(
        COLLISION_GROUP_STATIC,
        COLLISION_GROUP_VEHICLE | COLLISION_GROUP_PROP,
      ),
    );
  world.createCollider(colliderDesc);

  return {
    enabled: true,
    colliderCount: 1,
    meshCount: merged.meshCount,
    triangleCount: merged.indices.length / 3,
    dynamicObjectCount: dynamicObjects.length,
    dynamicBodyCount: 0,
    boundsMin: merged.bounds.min.toArray(),
    boundsMax: merged.bounds.max.toArray(),
  };
}

function extractMergedWorldTrimesh(root, excludedNames = new Set()) {
  const positions = [];
  const indices = [];
  const source = new THREE.Vector3();
  const bounds = new THREE.Box3();
  let vertexBase = 0;
  let meshCount = 0;

  root.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (isNodeExcludedFromStaticWorld(node, excludedNames, root)) {
      return;
    }

    const positionAttr = node.geometry.getAttribute("position");

    if (!positionAttr || positionAttr.count < 3) {
      return;
    }

    meshCount += 1;

    for (let index = 0; index < positionAttr.count; index += 1) {
      source.fromBufferAttribute(positionAttr, index).applyMatrix4(node.matrixWorld);
      positions.push(source.x, source.y, source.z);
      bounds.expandByPoint(source);
    }

    if (node.geometry.index) {
      const src = node.geometry.index.array;

      for (let index = 0; index < src.length; index += 1) {
        indices.push(vertexBase + src[index]);
      }
    } else {
      for (let index = 0; index < positionAttr.count; index += 1) {
        indices.push(vertexBase + index);
      }
    }

    vertexBase += positionAttr.count;
  });

  if (positions.length === 0 || indices.length === 0) {
    return null;
  }

  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
    meshCount,
    bounds,
  };
}

function isNodeExcludedFromStaticWorld(node, excludedNames, root) {
  for (let current = node; current && current !== root; current = current.parent) {
    if (excludedNames.has(current.name)) {
      return true;
    }
  }

  return false;
}

function createDynamicSceneObjects(world, dynamicObjects) {
  if (!Array.isArray(dynamicObjects) || dynamicObjects.length === 0) {
    return [];
  }

  const entries = [];

  for (const object of dynamicObjects) {
    const renderNode = object.renderNode;
    const collisionNode = object.collisionNode ?? object.renderNode;
    const model = object.model ?? null;

    if (!renderNode || !collisionNode) {
      continue;
    }

    collisionNode.updateWorldMatrix(true, true);
    renderNode.updateWorldMatrix(true, true);
    const bodyTranslation = renderNode.getWorldPosition(new THREE.Vector3());
    const bodyRotation = renderNode.getWorldQuaternion(new THREE.Quaternion());
    const bodyScale = renderNode.getWorldScale(new THREE.Vector3());
    const absScale = new THREE.Vector3(
      Math.abs(bodyScale.x),
      Math.abs(bodyScale.y),
      Math.abs(bodyScale.z),
    );
    const localCenter = model?.center
      ? new THREE.Vector3().fromArray(model.center).multiply(absScale)
      : new THREE.Vector3();
    const halfExtents = model?.radius
      ? new THREE.Vector3().fromArray(model.radius).multiply(absScale)
      : new THREE.Box3()
          .setFromObject(collisionNode)
          .getSize(new THREE.Vector3())
          .multiplyScalar(0.5);

    if (halfExtents.lengthSq() < 1e-6) {
      continue;
    }

    const category = getDynamicCategoryConfig(object.dynamicName);
    const bodyDesc = (category.bodyType === "fixed"
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(bodyTranslation.x, bodyTranslation.y, bodyTranslation.z)
      .setRotation(bodyRotation)
      .setCanSleep(true)
      .setCcdEnabled(true);

    if (category.bodyType === "dynamic") {
      bodyDesc
        .setLinearDamping(category.linearDamping)
        .setAngularDamping(category.angularDamping)
        .setAdditionalMass(category.mass);
    }

    const body = world.createRigidBody(bodyDesc);
    const colliderDesc = createDynamicObjectCollider(object, halfExtents, localCenter);

    colliderDesc
      .setRestitution(category.restitution)
      .setFriction(category.friction)
      .setCollisionGroups(
        interactionGroups(
          COLLISION_GROUP_PROP,
          COLLISION_GROUP_STATIC |
            COLLISION_GROUP_PROP |
            COLLISION_GROUP_HELPER |
            COLLISION_GROUP_VEHICLE,
        ),
      )
      .setDensity(1);
    world.createCollider(colliderDesc, body);

    entries.push({
      ...object,
      body,
      collider: body.collider(0),
      category,
      dormant: category.releaseOnImpact,
      renderParent: renderNode.parent ?? null,
      renderScale: renderNode.scale.clone(),
    });
  }

  if (entries.length > 0) {
    console.info("Dynamic object bodies spawned.", {
      total: entries.length,
      categories: Object.fromEntries(countDynamicCategories(entries)),
    });
  }

  return entries;
}

function countDynamicCategories(entries) {
  const counts = new Map();

  for (const entry of entries) {
    const key = entry.dynamicName ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function summarizeDynamicCategories(entries, limit = 5) {
  return [...countDynamicCategories(entries).entries()]
    .slice(0, limit)
    .map(([name, count]) => `${name}:${count}`)
    .join(",");
}

function createDynamicObjectCollider(object, halfExtents, localCenter) {
  if (object.dynamicName === "rubber_tire") {
    const radius = Math.max(halfExtents.x, halfExtents.z, 0.08);
    const halfHeight = Math.max(halfExtents.y, 0.04);
    return RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(localCenter.x, localCenter.y, localCenter.z);
  }

  return RAPIER.ColliderDesc.cuboid(
    Math.max(halfExtents.x, 0.04),
    Math.max(halfExtents.y, 0.04),
    Math.max(halfExtents.z, 0.04),
  ).setTranslation(localCenter.x, localCenter.y, localCenter.z);
}

function getDynamicCategoryConfig(dynamicName) {
  switch (dynamicName) {
    case "rubber_tire":
      return {
        bodyType: "dynamic",
        releaseOnImpact: false,
        releaseMinSpeed: 0,
        impulseScale: 0.18,
        mass: 12,
        linearDamping: 0.1,
        angularDamping: 0.12,
        friction: 1.05,
        restitution: 0.12,
      };
    case "rubber_cone":
      return {
        bodyType: "dynamic",
        releaseOnImpact: false,
        releaseMinSpeed: 0,
        impulseScale: 0.18,
        mass: 5,
        linearDamping: 0.32,
        angularDamping: 0.4,
        friction: 0.72,
        restitution: 0.08,
      };
    case "wood_light":
    case "metal_light":
      // TODO: FO2 billboard/frame parity needs the recovered hinge/joint obstacle path.
      // Keep banner/frame pieces standing until impacted instead of letting
      // them collapse under gravity from frame 1.
      return {
        bodyType: "fixed",
        releaseOnImpact: true,
        releaseMinSpeed: 1.25,
        impulseScale: 0.2,
        mass: 18,
        linearDamping: 0.32,
        angularDamping: 0.38,
        friction: 0.85,
        restitution: 0.04,
      };
    case "metal_barrel":
    case "cardboard_box":
    case "hay_box":
      return {
        bodyType: "dynamic",
        releaseOnImpact: false,
        releaseMinSpeed: 0,
        impulseScale: 0.18,
        mass: 8,
        linearDamping: 0.28,
        angularDamping: 0.32,
        friction: 0.76,
        restitution: 0.08,
      };
    case "window":
      return {
        bodyType: "fixed",
        releaseOnImpact: true,
        releaseMinSpeed: 0.2,
        impulseScale: 0.42,
        mass: 3,
        linearDamping: 0.12,
        angularDamping: 0.16,
        friction: 0.18,
        restitution: 0.02,
      };
    case "plastic_light":
    case "fence_wood":
    case "fence_metal":
    case "explosive_gaspump":
    case "metal_lightpole":
    case "metal_structure_tilt":
    case "metal_gate_180":
      return {
        bodyType: "fixed",
        releaseOnImpact: true,
        releaseMinSpeed: 0.9,
        impulseScale: 0.2,
        mass: 18,
        linearDamping: 0.32,
        angularDamping: 0.38,
        friction: 0.82,
        restitution: 0.05,
      };
    case "metal_obstacle":
    case "concrete_block_superheavy":
      return {
        bodyType: "dynamic",
        releaseOnImpact: false,
        releaseMinSpeed: 0,
        impulseScale: 0.16,
        mass: 35,
        linearDamping: 0.4,
        angularDamping: 0.48,
        friction: 0.9,
        restitution: 0.04,
      };
    default:
      return {
        bodyType: "dynamic",
        releaseOnImpact: false,
        releaseMinSpeed: 0,
        impulseScale: 0.18,
        mass: 6,
        linearDamping: 0.4,
        angularDamping: 0.55,
        friction: 0.75,
        restitution: 0.08,
      };
  }
}

function activateImpactedDynamicObjects(
  world,
  dynamicObjectState,
  chassis,
  chassisColliders,
) {
  if (!Array.isArray(dynamicObjectState) || dynamicObjectState.length === 0) {
    return;
  }

  const chassisTranslation = chassis.translation();
  const chassisVelocity = rapierVectorToThree(chassis.linvel(), TMP_VEC_D);
  const chassisSpeed = horizontalSpeed(chassisVelocity);

  for (const entry of dynamicObjectState) {
    if (!entry.dormant || !entry.body || !entry.collider) {
      continue;
    }

    if (chassisSpeed < (entry.category.releaseMinSpeed ?? 0.5)) {
      continue;
    }

    const translation = entry.body.translation();
    const dx = translation.x - chassisTranslation.x;
    const dy = translation.y - chassisTranslation.y;
    const dz = translation.z - chassisTranslation.z;

    if (dx * dx + dy * dy + dz * dz > 64) {
      continue;
    }

    let touchingChassis = false;

    for (const chassisCollider of chassisColliders) {
      if (!chassisCollider || chassisCollider.handle === entry.collider.handle) {
        continue;
      }

      world.contactPair(entry.collider, chassisCollider, () => {
        touchingChassis = true;
      });

      if (touchingChassis) {
        break;
      }
    }

    if (!touchingChassis) {
      continue;
    }

    entry.dormant = false;
    entry.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    entry.body.setLinearDamping(entry.category.linearDamping);
    entry.body.setAngularDamping(entry.category.angularDamping);
    entry.body.setAdditionalMass(entry.category.mass, true);
    entry.body.recomputeMassPropertiesFromColliders();

    const impulse = chassisVelocity
      .clone()
      .multiplyScalar(
        Math.max(
          entry.category.mass * (entry.category.impulseScale ?? 0.18),
          1.2,
        ),
      );
    entry.body.applyImpulseAtPoint(
      vectorFromThree(impulse),
      { x: translation.x, y: translation.y + 0.25, z: translation.z },
      true,
    );
  }
}

function syncDynamicSceneObjects(dynamicObjectState) {
  for (const entry of dynamicObjectState) {
    const { body, renderNode, renderParent, renderScale } = entry;

    if (!body || !renderNode) {
      continue;
    }

    const translation = body.translation();
    const rotation = body.rotation();
    TMP_VEC_D.set(translation.x, translation.y, translation.z);
    TMP_QUAT_C.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();

    if (renderParent) {
      renderParent.updateWorldMatrix(true, false);
      TMP_MAT.compose(TMP_VEC_D, TMP_QUAT_C, renderScale);
      TMP_MAT_B.copy(renderParent.matrixWorld).invert().multiply(TMP_MAT);
      TMP_MAT_B.decompose(renderNode.position, renderNode.quaternion, renderNode.scale);
      renderNode.scale.copy(renderScale);
    } else {
      renderNode.position.copy(TMP_VEC_D);
      renderNode.quaternion.copy(TMP_QUAT_C);
      renderNode.scale.copy(renderScale);
    }
  }
}

function createChassisBody(world, config, translation, rotation) {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(translation.x, translation.y, translation.z)
    .setRotation(rotation)
    .setAdditionalMass(config.massKg)
    // Keep chassis damping low. Rapier linear damping is a direct velocity decay term,
    // so large values act like a permanent handbrake and fight the wheel controller.
    .setLinearDamping(0.02)
    .setAngularDamping(0.9)
    .setCanSleep(false)
    .setCcdEnabled(true)
    .setAdditionalSolverIterations(4);
  const body = world.createRigidBody(bodyDesc);
  body.setEnabledRotations(true, true, true, true);

  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    config.bodyHalfExtents.x,
    config.bodyHalfExtents.y,
    config.bodyHalfExtents.z,
  )
    .setFriction(0.01)
    .setRestitution(0)
    .setContactSkin(0.02)
    .setCollisionGroups(
      interactionGroups(
        COLLISION_GROUP_VEHICLE,
        COLLISION_GROUP_STATIC | COLLISION_GROUP_PROP,
      ),
    )
    .setDensity(0);
  world.createCollider(colliderDesc, body);
  const inertia = computeApproximateChassisInertia(config.massKg, config.bodyHalfExtents);
  body.setAdditionalMassProperties(
    config.massKg,
    {
      x: config.centerOfMass.x,
      y: -Math.abs(config.centerOfMass.y),
      z: config.centerOfMass.z,
    },
    inertia,
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );

  // Raycast wheels do not physically collide with loose props, so add a shallow
  // low-mounted interaction collider to catch cones/tires that sit below the
  // main chassis box but should still be pushed away by the car.
  const lowInteractionHalfHeight = Math.min(
    Math.max(config.bodyHalfExtents.y * 0.16, 0.05),
    0.12,
  );
  const lowInteractionDesc = RAPIER.ColliderDesc.cuboid(
    Math.max(config.trackWidth * 0.42, config.bodyHalfExtents.x * 0.92),
    lowInteractionHalfHeight,
    Math.max(config.wheelbase * 0.42, config.bodyHalfExtents.z * 0.82),
  )
    .setTranslation(
      0,
      -config.bodyHalfExtents.y + lowInteractionHalfHeight + 0.025,
      0,
    )
    .setFriction(0.12)
    .setRestitution(0.04)
    .setCollisionGroups(
      interactionGroups(COLLISION_GROUP_HELPER, COLLISION_GROUP_PROP),
    )
    .setDensity(0);
  world.createCollider(lowInteractionDesc, body);

  const frontInteractionHalfHeight = Math.min(
    Math.max(config.bodyHalfExtents.y * 0.25, 0.12),
    0.22,
  );
  const frontInteractionDesc = RAPIER.ColliderDesc.cuboid(
    Math.max(config.trackWidth * 0.34, config.bodyHalfExtents.x * 0.74),
    frontInteractionHalfHeight,
    Math.max(config.bodyHalfExtents.z * 0.08, 0.08),
  )
    .setTranslation(
      0,
      -config.bodyHalfExtents.y + frontInteractionHalfHeight + 0.14,
      -config.bodyHalfExtents.z - 0.06,
    )
    .setFriction(0.16)
    .setRestitution(0.04)
    .setCollisionGroups(
      interactionGroups(COLLISION_GROUP_HELPER, COLLISION_GROUP_PROP),
    )
    .setDensity(0);
  world.createCollider(frontInteractionDesc, body);

  return body;
}

function createVehicleController(world, chassis, config) {
  const controller = world.createVehicleController(chassis);
  // Configure vehicle axes using whichever Rapier JS binding shape is present.
  // Some builds expose methods, others expose writable properties.
  if (typeof controller.setIndexUpAxis === "function") {
    controller.setIndexUpAxis(1);
  } else {
    tryAssignControllerProperty(controller, "setIndexUpAxis", 1) ||
      tryAssignControllerProperty(controller, "indexUpAxis", 1);
  }
  if (typeof controller.setIndexForwardAxis === "function") {
    controller.setIndexForwardAxis(2);
  } else {
    tryAssignControllerProperty(controller, "setIndexForwardAxis", 2) ||
      tryAssignControllerProperty(controller, "indexForwardAxis", 2);
  }

  config.wheelLayout.forEach((wheel, wheelIndex) => {
    const suspension = wheel.front ? config.frontSuspension : config.rearSuspension;
    const chassisConnection = wheel.localPosition
      .clone()
      .sub(config.bodyOffset)
      .add(new THREE.Vector3(0, config.visualRideHeight, 0));
    controller.addWheel(
      vectorFromThree(chassisConnection),
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      suspension.restLength,
      wheel.tireRadius,
    );
    controller.setWheelMaxSuspensionTravel(wheelIndex, suspension.maxTravel);
    controller.setWheelSuspensionStiffness(wheelIndex, suspension.stiffness);
    controller.setWheelSuspensionCompression(wheelIndex, suspension.compression);
    controller.setWheelSuspensionRelaxation(wheelIndex, suspension.relaxation);
    controller.setWheelMaxSuspensionForce(
      wheelIndex,
      wheel.front ? config.massKg * 22 : config.massKg * 24,
    );
    // Rapier raycast vehicle follows Bullet-style wheel tuning ranges.
    // Values around ~10 are the practical baseline for longitudinal grip;
    // our previous ~2.x setting caused persistent wheel slip and weak launch.
    controller.setWheelFrictionSlip(
      wheelIndex,
      wheel.front
        ? config.tireConfig.baseWheelFrictionSlipFront
        : config.tireConfig.baseWheelFrictionSlipRear,
    );
    controller.setWheelSideFrictionStiffness(
      wheelIndex,
      wheel.front
        ? config.tireConfig.baseWheelSideStiffnessFront
        : config.tireConfig.baseWheelSideStiffnessRear,
    );
  });

  return controller;
}

function tryAssignControllerProperty(controller, key, value) {
  try {
    controller[key] = value;
    return true;
  } catch {
    return false;
  }
}

function stepVehicle(
  world,
  chassis,
  vehicleController,
  config,
  input,
  debugState,
  trackFloorSampler = null,
) {
  const isolation = resolveRapierDebugOptions(debugState.isolation);
  const rawThrottle = clamp(input?.throttle ?? 0, 0, 1);
  const rawBrake = clamp(input?.brake ?? 0, 0, 1);
  const rawHandbrake = clamp(input?.handbrake ?? 0, 0, 1);
  const rawSteer = clamp(input?.steer ?? 0, -1, 1);
  const speedForwardNow = rapierVectorToThree(chassis.linvel(), TMP_VEC).dot(
    TMP_FORWARD.copy(LOCAL_FORWARD).applyQuaternion(
      TMP_QUAT.set(
        chassis.rotation().x,
        chassis.rotation().y,
        chassis.rotation().z,
        chassis.rotation().w,
      ),
    ),
  );

  const wantsReverse =
    rawBrake > 0.1 && rawThrottle < 0.1 && Math.abs(speedForwardNow) < 1.75;

  if (rawThrottle > 0.1) {
    debugState.reverseLatched = false;
  } else if (wantsReverse) {
    debugState.reverseLatched = true;
  }

  debugState.throttleAxis = moveToward(
    debugState.throttleAxis ?? 0,
    debugState.reverseLatched ? -rawBrake : rawThrottle,
    FIXED_DT * 3.6,
  );
  debugState.brakeAxis = moveToward(
    debugState.brakeAxis ?? 0,
    debugState.reverseLatched ? 0 : rawBrake,
    FIXED_DT * 6.5,
  );
  debugState.handbrakeAxis = moveToward(
    debugState.handbrakeAxis ?? 0,
    rawHandbrake,
    FIXED_DT * 10,
  );
  updateSteeringState(
    debugState,
    config,
    isolation.steering ? rawSteer : 0,
    isolation.handbrake ? rawHandbrake : 0,
    speedHorizontalNow(speedForwardNow, chassis),
    FIXED_DT,
  );

  const throttle = isolation.driveForce ? debugState.throttleAxis : 0;
  const brake = isolation.braking ? debugState.brakeAxis : 0;
  const handbrake = isolation.handbrake ? debugState.handbrakeAxis : 0;
  const steer = isolation.steering ? debugState.steerState : 0;
  const translation = chassis.translation();
  const rotation = chassis.rotation();
  TMP_QUAT.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  TMP_FORWARD.copy(LOCAL_FORWARD).applyQuaternion(TMP_QUAT).normalize();
  TMP_RIGHT.copy(LOCAL_RIGHT).applyQuaternion(TMP_QUAT).normalize();
  TMP_UP.copy(WORLD_UP).applyQuaternion(TMP_QUAT).normalize();

  const linvel = rapierVectorToThree(chassis.linvel(), TMP_VEC);
  const angvel = rapierVectorToThree(chassis.angvel(), TMP_VEC_B);
  const speedForward = linvel.dot(TMP_FORWARD);
  const speedRight = linvel.dot(TMP_RIGHT);
  const speedHorizontal = horizontalSpeed(linvel);
  const speedKph = speedHorizontal * 3.6;
  const surfaceType = sampleSurfaceType(trackFloorSampler, translation);
  const surfaceDynamics = resolveSurfaceDynamics(config.surfaceDynamics, surfaceType);
  const surfaceGrip = computeSurfaceGrip(surfaceDynamics);
  const surfaceRollingResistanceScale = Math.max(
    readProfileScalar(surfaceDynamics.RollingResistance, 0.005) / 0.005,
    0.35,
  );
  const surfaceInducedDragScale = Math.max(
    readProfileScalar(surfaceDynamics.InducedDragCoeff, 0.15) / 0.15,
    0.35,
  );
  const groundHit = sampleGround(world, chassis, config.bodyHalfExtents.y + 0.9);
  const surfaceNormal = groundHit
    ? rapierVectorToThree(groundHit.normal, TMP_VEC_C).normalize()
    : WORLD_UP;
  const grounded = Boolean(groundHit && groundHit.timeOfImpact <= config.bodyHalfExtents.y + 0.5);
  if (isolation.gearbox) {
    updateGearboxState(
      debugState,
      config,
      speedForward,
      rawThrottle,
      FIXED_DT,
    );
  } else {
    const idleRpm = config.engine.idleRpm;
    const speedRpm = projectEngineRpmFromDriveState(speedForward, 1, config);
    const freeRevRpm =
      idleRpm + Math.max(throttle, 0) * (config.engine.peakTorqueRpm - idleRpm);
    debugState.engineRpm = dampToward(
      debugState.engineRpm ?? idleRpm,
      Math.max(idleRpm, speedRpm, freeRevRpm),
      8,
      FIXED_DT,
    );
    debugState.gear = debugState.reverseLatched ? -1 : 1;
    debugState.shiftTimer = 0;
    debugState.shiftFromGear = debugState.gear;
    debugState.shiftTargetGear = debugState.gear;
    debugState.clutch = 1;
  }

  if (ENABLE_DIRECT_DRIVE_DEBUG) {
    const targetForwardSpeed = throttle * 14 - brake * 8;
    const targetYawRate = steer * 0.9 * Math.max(Math.abs(targetForwardSpeed), 2) * 0.25;
    const nextVelocity = TMP_FORWARD
      .clone()
      .setY(0)
      .normalize()
      .multiplyScalar(targetForwardSpeed);
    chassis.setLinvel(
      {
        x: nextVelocity.x,
        y: linvel.y,
        z: nextVelocity.z,
      },
      true,
    );
    chassis.setAngvel(
      {
        x: 0,
        y: targetYawRate,
        z: 0,
      },
      true,
    );
    debugState.mode = "direct";
    debugState.grounded = grounded;
    debugState.groundToi = groundHit?.timeOfImpact ?? null;
    debugState.throttle = throttle;
    debugState.brake = brake;
    debugState.handbrake = handbrake;
    debugState.steer = steer;
    debugState.engineForce = targetForwardSpeed;
    debugState.brakeForce = brake;
    debugState.speedForward = linvel.dot(TMP_FORWARD);
    debugState.speedRight = linvel.dot(TMP_RIGHT);
    debugState.speedHorizontal = horizontalSpeed(linvel);
    return;
  }

  chassis.resetForces(true);
  chassis.resetTorques(true);
  const engineForceTotal = computeEngineDriveForceTotal(
    debugState,
    config,
    throttle,
  );
  const frontBrake = isolation.braking
    ? brake *
      config.brakeTorque *
      config.brakeBalance *
      config.brakeTorqueScale *
      surfaceGrip
    : 0;
  const rearBrake =
    (isolation.braking
      ? brake *
        config.brakeTorque *
        (1 - config.brakeBalance) *
        config.brakeTorqueScale *
        surfaceGrip
      : 0) +
    (isolation.handbrake
      ? handbrake *
        config.handBrakeTorque *
        config.handBrakeTorqueScale *
        surfaceGrip
      : 0);
  const frontSteerAngles = computeFrontWheelSteerAngles(
    steer,
    config,
    debugState.steerSpeedKph ?? speedKph,
  );
  debugState.steerLeftDeg = THREE.MathUtils.radToDeg(frontSteerAngles.left);
  debugState.steerRightDeg = THREE.MathUtils.radToDeg(frontSteerAngles.right);
  const steerAbs = Math.abs(steer);
  const throttleAbs = Math.abs(throttle);
  const speedSlipScale = clamp(inverseLerp(28, 160, speedKph), 0, 1);
  const slipAngleRad = Math.atan2(Math.abs(speedRight), Math.max(Math.abs(speedForward), 0.5));
  const optimalSlipAngleRad = THREE.MathUtils.degToRad(
    Math.max(config.tireConfig.optimalSlipAngleDeg ?? 12, 1),
  );
  const slipAngleRatio = clamp(
    slipAngleRad / Math.max(optimalSlipAngleRad, THREE.MathUtils.degToRad(1)),
    0,
    4,
  );
  const surfaceSlideControl = clamp(readProfileScalar(surfaceDynamics.SlideControl, 0.6), 0, 1.5);
  const surfaceUnderSteer = Math.max(readProfileScalar(surfaceDynamics.UnderSteer, 0), 0);
  const surfaceSlideUnderSteer = Math.max(
    readProfileScalar(surfaceDynamics.SlideUnderSteer, 0),
    0,
  );
  const surfaceAntiSpin = clamp(readProfileScalar(surfaceDynamics.AntiSpin, 0), 0, 1);
  const slideControlLossScale = THREE.MathUtils.lerp(
    1.32,
    0.5,
    clamp(surfaceSlideControl / 1.2, 0, 1),
  );
  // Approximate native tire saturation: sustained steer at speed should push the front
  // toward understeer/slip, while low-speed throttle+steer can break rear traction.
  const steerDemand = steerAbs * speedSlipScale;
  const slipDemand = Math.max(slipAngleRatio - 1, 0);
  const priorSlipEnergy = clamp(
    (debugState.slipLatAvg ?? 0) * 1.35 + (debugState.slipLongAvg ?? 0) * 0.55,
    0,
    2.5,
  );
  const highSpeedSlip = Math.pow(clamp(inverseLerp(60, 180, speedKph), 0, 1), 1.15);
  const baseSlideLoss =
    (steerDemand * 1.12 + slipDemand * 0.96 + priorSlipEnergy * 0.52) *
    (0.55 + 0.45 * steerAbs) *
    slideControlLossScale;
  let frontSlideLoss =
    baseSlideLoss *
    (1.15 + highSpeedSlip * 0.85 + surfaceUnderSteer * 0.3 + surfaceSlideUnderSteer * 0.4);
  let rearSlideLoss =
    baseSlideLoss * (0.9 - highSpeedSlip * 0.25 - surfaceAntiSpin * 0.22);
  const lowSpeedDonutDemand =
    clamp(1 - inverseLerp(12, 55, speedKph), 0, 1) * steerAbs * throttleAbs;
  const donutRearLoss =
    Math.max(lowSpeedDonutDemand - 0.24, 0) * 1.08 * (1 - surfaceAntiSpin * 0.45);
  frontSlideLoss += donutRearLoss * 0.25;
  rearSlideLoss += donutRearLoss;
  const frontSideSlideScale = clamp(1 - frontSlideLoss, 0.1, 1);
  const rearSideSlideScale = clamp(1 - rearSlideLoss, 0.06, 1);
  const frontLongSlideScale = clamp(1 - frontSlideLoss * 0.26, 0.35, 1);
  const rearLongSlideScale = clamp(1 - rearSlideLoss * 0.32, 0.35, 1);
  let totalWheelEngineForce = 0;

  config.wheelLayout.forEach((wheel, wheelIndex) => {
    const driven =
      (wheel.front && config.frontTraction) ||
      (!wheel.front && config.rearTraction);
    let steerAngle = 0;
    if (wheel.front) {
      steerAngle = wheel.side < 0 ? frontSteerAngles.left : frontSteerAngles.right;
    }
    vehicleController.setWheelSteering(wheelIndex, steerAngle);
    const handbrakeSpeedBlend = clamp(speedKph / 90, 0, 1);
    const rearSideGripScale = wheel.front
      ? 1
      : THREE.MathUtils.lerp(1, 0.28, handbrake * handbrakeSpeedBlend);
    const rearLongGripScale = wheel.front
      ? 1
      : THREE.MathUtils.lerp(1, 0.45, handbrake * handbrakeSpeedBlend);
    const sideSlideScale = wheel.front ? frontSideSlideScale : rearSideSlideScale;
    const longSlideScale = wheel.front ? frontLongSlideScale : rearLongSlideScale;
    vehicleController.setWheelSideFrictionStiffness(
      wheelIndex,
      (wheel.front
        ? config.tireConfig.baseWheelSideStiffnessFront
        : config.tireConfig.baseWheelSideStiffnessRear) *
        sideSlideScale *
        rearSideGripScale *
        surfaceGrip,
    );
    vehicleController.setWheelFrictionSlip(
      wheelIndex,
      (wheel.front
        ? config.tireConfig.baseWheelFrictionSlipFront
        : config.tireConfig.baseWheelFrictionSlipRear) *
        longSlideScale *
        rearLongGripScale *
        surfaceGrip,
    );
    const wheelEngineForce = driven
      ? computeDriveForceForWheel(wheel, debugState, config, throttle, isolation)
      : 0;
    vehicleController.setWheelEngineForce(
      wheelIndex,
      wheelEngineForce,
    );
    totalWheelEngineForce += wheelEngineForce;
    vehicleController.setWheelBrake(
      wheelIndex,
      wheel.front ? frontBrake : rearBrake,
    );
  });

  vehicleController.updateVehicle(
    FIXED_DT,
    undefined,
    undefined,
    (collider) => collider.parent()?.handle !== chassis.handle,
  );

  if (isolation.aeroDrag || isolation.lateralDrag) {
    // Keep drag force centered on COM in raycast mode. Applying lateral/longitudinal
    // drag at an offset point injects artificial yaw torque and causes spin/hop loops.
    const dragForce = TMP_VEC_B
      .set(0, 0, 0)
      .addScaledVector(
        TMP_FORWARD,
        isolation.aeroDrag
          ? -Math.sign(speedForward) *
              speedForward *
              speedForward *
              config.aeroDrag[0] *
              surfaceInducedDragScale *
              0.8
          : 0,
      )
      .addScaledVector(
        TMP_RIGHT,
        isolation.lateralDrag
          ? -Math.sign(speedRight) *
              speedRight *
              speedRight *
              config.aeroDrag[1] *
              surfaceInducedDragScale *
              1.4
          : 0,
      );
    chassis.addForce(vectorFromThree(dragForce), true);
  }
  if (isolation.aeroDrag) {
    const rollingResistanceForce =
      config.massKg *
      config.gravity *
      config.tireConfig.rollingResistance *
      surfaceRollingResistanceScale *
      (1 + config.tireConfig.inducedDragCoeff * clamp(speedKph / 240, 0, 1));
    if (rollingResistanceForce > 0.01 && speedHorizontal > 0.1) {
      const rollingDrag = TMP_FORWARD
        .clone()
        .multiplyScalar(-Math.sign(speedForward) * rollingResistanceForce);
      chassis.addForce(vectorFromThree(rollingDrag), true);
    }
  }
  if (isolation.downforce) {
    const downforce = {
      x: 0,
      y: -speedHorizontal * speedHorizontal * config.downforceConst * 0.012,
      z: 0,
    };
    chassis.addForce(downforce, true);
  }

  if (isolation.uprightAssist) {
    // Grounded: do not inject any upright torque. Applying corrective torque while
    // tires are loaded can produce speed-direction banking artifacts on flat ground.
    // Airborne: pull the chassis back toward world-up and damp roll/pitch spin.
    if (!grounded) {
      const uprightError = TMP_VEC_D.copy(TMP_UP).cross(WORLD_UP);
      const angularDamping = new THREE.Vector3(
        -angvel.x * config.massKg * 0.3,
        0,
        -angvel.z * config.massKg * 0.3,
      );
      const uprightTorque = uprightError
        .multiplyScalar(config.massKg * 2.0)
        .add(angularDamping);
      chassis.addTorque(vectorFromThree(uprightTorque), true);
    }
  }
  if (!isolation.gravity) {
    chassis.addForce({ x: 0, y: config.massKg * config.gravity, z: 0 }, true);
  }

  const wheelContacts = config.wheelLayout.reduce(
    (count, _, wheelIndex) =>
      count + (vehicleController.wheelIsInContact(wheelIndex) ? 1 : 0),
    0,
  );
  const forwardImpulse = config.wheelLayout.reduce(
    (sum, _, wheelIndex) => sum + Math.abs(vehicleController.wheelForwardImpulse(wheelIndex) ?? 0),
    0,
  );
  const suspensionForce = config.wheelLayout.reduce(
    (sum, _, wheelIndex) => sum + Math.abs(vehicleController.wheelSuspensionForce(wheelIndex) ?? 0),
    0,
  );
  updateDrivenWheelState(config, vehicleController, FIXED_DT);
  const longitudinalSlip = computeAverageLongitudinalSlip(config, speedForward);
  const lateralSlip = computeLateralSlip(speedRight, speedHorizontal);

  debugState.grounded = grounded;
  debugState.groundToi = groundHit?.timeOfImpact ?? null;
  debugState.throttle = rawThrottle;
  debugState.brake = rawBrake;
  debugState.handbrake = rawHandbrake;
  debugState.steer = rawSteer;
  debugState.engineForce = totalWheelEngineForce || engineForceTotal;
  debugState.brakeForce = frontBrake + rearBrake;
  debugState.speedForward = speedForward;
  debugState.speedRight = speedRight;
  debugState.speedHorizontal = speedHorizontal;
  debugState.yawRateDeg = THREE.MathUtils.radToDeg(angvel.y);
  debugState.wheelContacts = wheelContacts;
  debugState.forwardImpulse = forwardImpulse;
  debugState.suspensionForce = suspensionForce;
  debugState.slipLongAvg = longitudinalSlip;
  debugState.slipLatAvg = lateralSlip;
  debugState.slipAngleDeg = THREE.MathUtils.radToDeg(slipAngleRad);
  debugState.frontGripScale = frontSideSlideScale;
  debugState.rearGripScale = rearSideSlideScale;
  debugState.mode = `rapier-raycast${isolation.gearbox ? "" : "-nogear"}`;
  debugState.surfaceType = surfaceType;
  debugState.surfaceGrip = surfaceGrip;
  debugState.rollingResistanceDrag =
    config.massKg *
    config.gravity *
    config.tireConfig.rollingResistance *
    surfaceRollingResistanceScale;
  debugState.aeroDragForce =
    (isolation.aeroDrag
      ? Math.abs(speedForward * speedForward * config.aeroDrag[0]) +
        Math.abs(speedRight * speedRight * config.aeroDrag[1])
      : 0) * surfaceInducedDragScale;
}

function sampleGround(world, chassis, rayLength) {
  const translation = chassis.translation();
  const ray = new RAPIER.Ray(
    { x: translation.x, y: translation.y + 0.2, z: translation.z },
    { x: 0, y: -1, z: 0 },
  );

  return world.castRayAndGetNormal(
    ray,
    rayLength + 2,
    true,
    undefined,
    undefined,
    undefined,
    chassis,
  );
}

function syncCarRootFromBody(carRoot, chassis, config) {
  const translation = chassis.translation();
  const rotation = chassis.rotation();
  carRoot.position.set(
    translation.x - config.bodyOffset.x,
    translation.y - config.bodyOffset.y + config.visualRideHeight,
    translation.z - config.bodyOffset.z,
  );
  carRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
}

function updateWheelVisuals(config, chassis, vehicleController, debugState, dt) {
  const speed = horizontalSpeed(rapierVectorToThree(chassis.linvel(), TMP_VEC));

  for (const [wheelIndex, wheel] of config.wheelLayout.entries()) {
    if (!wheel.tire) {
      continue;
    }

    const suspensionLength =
      vehicleController.wheelSuspensionLength(wheelIndex) ?? wheel.suspensionRestLength;
    const compression = wheel.suspensionRestLength - suspensionLength;
    wheel.steerAngle = vehicleController.wheelSteering(wheelIndex) ?? 0;
    const inContact = vehicleController.wheelIsInContact(wheelIndex);
    const wheelRotation = vehicleController.wheelRotation(wheelIndex);
    const driven =
      (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

    if (inContact && Number.isFinite(wheelRotation)) {
      const delta = unwrapAngleDelta(wheelRotation - (wheel.currentRotation ?? wheelRotation));
      wheel.angularVelocity = delta / Math.max(dt, 1e-5);
      wheel.currentRotation = wheelRotation;
      wheel.spinAngle = wheelRotation;
    } else {
      const wheelRadius = Math.max(wheel.tireRadius ?? 0.34, 0.1);
      const rollingOmega = speed / wheelRadius;
      const throttleAbs = Math.abs(debugState.throttleAxis ?? 0);
      const gearRatio = Math.abs(getCurrentGearRatio(debugState, config) * config.gearbox.endRatio);
      const clutchScale = Math.max(Math.abs(debugState.clutch ?? 1), 0.25);
      const engineOmega =
        (Math.max(debugState.engineRpm ?? config.engine.idleRpm, config.engine.idleRpm) *
          Math.PI *
          2) /
        60;
      const driveOmega =
        driven && gearRatio > 1e-3
          ? (engineOmega / gearRatio) * clutchScale * (0.35 + throttleAbs * 0.65)
          : 0;
      const fallbackSign =
        Math.abs(wheel.angularVelocity ?? 0) > 0.25
          ? Math.sign(wheel.angularVelocity)
          : (debugState.gear ?? 0) < 0
            ? 1
            : -1;
      const targetOmega = fallbackSign * Math.max(rollingOmega, driveOmega);
      const responseRate = inContact ? 16 : throttleAbs > 0.05 ? 9 : 4.5;
      wheel.angularVelocity = dampToward(
        wheel.angularVelocity ?? 0,
        targetOmega,
        responseRate,
        dt,
      );
      wheel.spinAngle = (wheel.spinAngle ?? 0) + wheel.angularVelocity * dt;
    }

    wheel.tire.position.copy(wheel.tireBasePosition);
    wheel.tire.position.y += wheel.defaultCompression - compression;
    TMP_QUAT.setFromAxisAngle(WORLD_UP, wheel.steerAngle);
    TMP_QUAT_B.setFromAxisAngle(new THREE.Vector3(1, 0, 0), wheel.spinAngle);
    wheel.tire.quaternion.copy(wheel.tireBaseQuaternion);
    wheel.tire.quaternion.multiply(TMP_QUAT);
    wheel.tire.quaternion.multiply(TMP_QUAT_B);
  }
}

function updateSteeringState(debugState, config, rawSteer, rawHandbrake, horizontalKph, dt) {
  const speedFilterRate = Math.abs(rawSteer) > 1e-3 ? 8.5 : 5.5;
  debugState.steerSpeedKph = dampToward(
    debugState.steerSpeedKph ?? horizontalKph,
    horizontalKph,
    speedFilterRate,
    dt,
  );
  const steerKph = debugState.steerSpeedKph;
  const steerLimit = computeSteeringLimit(config.steering, steerKph);
  const digitalInput = Math.abs(rawSteer) >= config.steering.DigitalThreshold;
  const steerSign = Math.sign(rawSteer);
  if (digitalInput && steerSign !== 0) {
    if ((debugState.steerHoldSign ?? 0) === steerSign) {
      debugState.steerHoldTime = (debugState.steerHoldTime ?? 0) + dt;
    } else {
      debugState.steerHoldSign = steerSign;
      debugState.steerHoldTime = 0;
    }
  } else {
    debugState.steerHoldSign = 0;
    debugState.steerHoldTime = 0;
  }
  const holdFactor = clamp(
    inverseLerp(0.14, 0.7, debugState.steerHoldTime ?? 0),
    0,
    1,
  );
  const holdSpeedFactor = clamp(inverseLerp(75, 180, steerKph), 0, 1);
  const highSpeedHoldScale = digitalInput
    ? THREE.MathUtils.lerp(1, 0.6, holdFactor * holdSpeedFactor)
    : 1;
  const highSpeedAuthorityScale = THREE.MathUtils.lerp(
    1,
    0.45,
    Math.pow(clamp(inverseLerp(70, 190, steerKph), 0, 1), 1.2),
  );
  const highSpeedDigitalScale =
    digitalInput
      ? THREE.MathUtils.lerp(
          1,
          0.72,
          Math.pow(clamp(inverseLerp(85, 185, steerKph), 0, 1), 1.1),
        )
      : 1;
  const slipAuthorityScale = THREE.MathUtils.lerp(
    1,
    0.8,
    clamp((debugState.slipLatAvg ?? 0) * 1.15, 0, 1),
  );
  const desiredSteerTarget =
    rawSteer *
    steerLimit *
    (rawHandbrake > 0.1 ? 1.02 : 1) *
    highSpeedAuthorityScale *
    highSpeedDigitalScale *
    highSpeedHoldScale *
    slipAuthorityScale;
  const speedRate = computeSteeringSpeedRate(config.steering, steerKph);
  // Native steering has a rack-side stage (self-aligning torque + speed integration)
  // after control write. Our Rapier path does not have that subsystem yet, so we proxy
  // the missing behavior here: slower steer-in and faster recentring as speed rises.
  const highSpeedEntryScale = THREE.MathUtils.lerp(
    1,
    0.2,
    Math.pow(clamp(inverseLerp(35, 145, horizontalKph), 0, 1), 1.15),
  );
  const highSpeedCenterScale = THREE.MathUtils.lerp(
    1,
    2.0,
    Math.pow(clamp(inverseLerp(40, 155, horizontalKph), 0, 1), 1.05),
  );
  const targetFilterRate = THREE.MathUtils.lerp(
    16,
    4.5,
    Math.pow(clamp(inverseLerp(30, 150, steerKph), 0, 1), 1.1),
  );
  debugState.steerTargetFiltered = dampToward(
    debugState.steerTargetFiltered ?? desiredSteerTarget,
    desiredSteerTarget,
    targetFilterRate,
    dt,
  );
  const steerTarget = debugState.steerTargetFiltered;

  if (Math.abs(rawSteer) < 1e-3) {
    const centeringRate = Math.max(
      config.steering.CenteringSpeed * speedRate * highSpeedCenterScale,
      0.4,
    );
    debugState.steerState = dampToward(debugState.steerState ?? 0, 0, centeringRate, dt);
  } else {
    const minSpeed = digitalInput
      ? config.steering.MinDigitalSpeed
      : config.steering.MinAnalogSpeed;
    const maxSpeed = digitalInput
      ? config.steering.MaxDigitalSpeed
      : config.steering.MaxAnalogSpeed;
    const deltaMagnitude = clamp(
      Math.abs(steerTarget - (debugState.steerState ?? 0)),
      0,
      1,
    );
    const deltaScale = THREE.MathUtils.lerp(
      config.steering.MinAtDelta,
      config.steering.MaxAtDelta,
      deltaMagnitude,
    );
    const rate =
      THREE.MathUtils.lerp(minSpeed, maxSpeed, Math.abs(rawSteer)) *
      deltaScale *
      speedRate *
      highSpeedEntryScale;
    const minParkingRate = horizontalKph < 10 ? 2.2 : 0;
    const nearLimitScale = THREE.MathUtils.lerp(1, 0.72, Math.abs(debugState.steerState ?? 0));
    debugState.steerState = moveToward(
      debugState.steerState ?? 0,
      steerTarget,
      Math.max(rate * nearLimitScale, minParkingRate) * dt,
    );
  }

  debugState.steerState = clamp(debugState.steerState ?? 0, -1, 1);
  debugState.steerRaw = rawSteer;
  debugState.steerLimit = steerLimit;
  debugState.steerTarget = steerTarget;
}

function computeFrontWheelSteerAngles(steerState, config, speedKph = 0) {
  const steerAmount = Math.abs(steerState);
  if (steerAmount < 1e-4) {
    return { left: 0, right: 0 };
  }

  // Rack-level high-speed steering lock reduction:
  // keep low/medium behavior intact, but cap wheel lock at highway speed.
  const highSpeedWheelAngleScale = THREE.MathUtils.lerp(
    1,
    0.34,
    Math.pow(clamp(inverseLerp(70, 180, speedKph), 0, 1), 1.18),
  );
  const tireTurnIn =
    THREE.MathUtils.degToRad(config.tireTurnAngleInDeg) * highSpeedWheelAngleScale;
  const tireTurnOut =
    THREE.MathUtils.degToRad(config.tireTurnAngleOutDeg) * highSpeedWheelAngleScale;
  const desiredBaseAngle = steerAmount * ((tireTurnIn + tireTurnOut) * 0.5);
  const turnSign = Math.sign(steerState) || 0;
  const tanBase = Math.abs(Math.tan(desiredBaseAngle));
  const turnRadius =
    tanBase > 1e-4 ? config.wheelbase / tanBase : Number.POSITIVE_INFINITY;

  let left = desiredBaseAngle * turnSign;
  let right = desiredBaseAngle * turnSign;

  if (Number.isFinite(turnRadius)) {
    const innerAngle = Math.min(
      Math.atan(config.wheelbase / Math.max(turnRadius - config.trackWidth * 0.5, 0.1)),
      tireTurnIn * steerAmount,
    );
    const outerAngle = Math.min(
      Math.atan(config.wheelbase / (turnRadius + config.trackWidth * 0.5)),
      tireTurnOut * steerAmount,
    );
    const steeringLeft = turnSign < 0;
    left = (steeringLeft ? innerAngle : outerAngle) * turnSign;
    right = (steeringLeft ? outerAngle : innerAngle) * turnSign;
  }

  return { left, right };
}

function resetChassis(chassis, translation, rotation) {
  chassis.setTranslation(vectorFromThree(translation), true);
  chassis.setRotation(rotation, true);
  chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
  chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  chassis.resetForces(true);
  chassis.resetTorques(true);
}

function computeSpawnLift(config) {
  return Math.max(
    config.bodyHalfExtents.y + 0.12,
    0.55,
  );
}

function updateCameraState(cameraState, chassis, carRoot) {
  const velocity = rapierVectorToThree(chassis.linvel(), TMP_VEC);
  const angularVelocity = rapierVectorToThree(chassis.angvel(), TMP_VEC_B);
  const forward = TMP_FORWARD.copy(LOCAL_FORWARD).applyQuaternion(carRoot.quaternion).normalize();
  const right = TMP_RIGHT.copy(LOCAL_RIGHT).applyQuaternion(carRoot.quaternion).normalize();
  const up = TMP_UP.copy(WORLD_UP).applyQuaternion(carRoot.quaternion).normalize();

  cameraState.heading = null;
  cameraState.forwardSpeed = velocity.dot(forward);
  cameraState.lateralSpeed = velocity.dot(right);
  cameraState.horizontalSpeed = horizontalSpeed(velocity);
  cameraState.verticalVelocity = velocity.y;
  cameraState.yawRate = angularVelocity.y;
  cameraState.roll = Math.atan2(up.x, up.y);
  cameraState.pitch = Math.atan2(forward.y, Math.max(forward.length(), 1e-5));
  cameraState.surfaceGrip = 1;
  cameraState.grounded = true;
  cameraState.cameraShake = 0;
}

function createCameraState() {
  return {
    heading: null,
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
}

function createDebugState() {
  return {
    mode: "rapier-raycast",
    steerState: 0,
    steerRaw: 0,
    steerHoldSign: 0,
    steerHoldTime: 0,
    steerLimit: 1,
    steerTarget: 0,
    steerLeftDeg: 0,
    steerRightDeg: 0,
    throttleAxis: 0,
    brakeAxis: 0,
    handbrakeAxis: 0,
    reverseLatched: false,
    gear: 0,
    shiftFromGear: 0,
    shiftTargetGear: 0,
    shiftTimer: 0,
    upshiftCooldown: 0,
    downshiftCooldown: 0,
    clutch: 1,
    engineRpm: 1000,
    grounded: false,
    groundToi: null,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    steer: 0,
    engineForce: 0,
    brakeForce: 0,
    speedForward: 0,
    speedRight: 0,
    speedHorizontal: 0,
    yawRateDeg: 0,
    wheelContacts: 0,
    forwardImpulse: 0,
    suspensionForce: 0,
    slipLongAvg: 0,
    slipLatAvg: 0,
    slipAngleDeg: 0,
    frontGripScale: 1,
    rearGripScale: 1,
    surfaceType: "tarmac",
    surfaceGrip: 1,
    aeroDragForce: 0,
    rollingResistanceDrag: 0,
    simSteps: 0,
    simBacklogMs: 0,
    isolation: null,
    chassisPosition: new THREE.Vector3(),
    chassisVelocity: new THREE.Vector3(),
  };
}

function resolveRapierDebugOptions(debugOptions) {
  const source =
    debugOptions && typeof debugOptions === "object" ? debugOptions : {};

  return {
    driveForce: source.driveForce !== false,
    gearbox: source.gearbox !== false,
    steering: source.steering !== false,
    braking: source.braking !== false,
    handbrake: source.handbrake !== false,
    differentialCurve: source.differentialCurve !== false,
    aeroDrag: source.aeroDrag !== false,
    lateralDrag: source.lateralDrag !== false,
    downforce: source.downforce !== false,
    uprightAssist: source.uprightAssist !== false,
    gravity: source.gravity !== false,
  };
}

function updateDebugState(debugState, chassis) {
  const translation = chassis.translation();
  const velocity = chassis.linvel();
  debugState.chassisPosition.set(translation.x, translation.y, translation.z);
  debugState.chassisVelocity.set(velocity.x, velocity.y, velocity.z);
}

function rapierVectorToThree(value, target) {
  return target.set(value.x, value.y, value.z);
}

function vectorFromThree(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function horizontalSpeed(vector) {
  return Math.hypot(vector.x, vector.z);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function interactionGroups(group, mask) {
  return ((group & 0xffff) << 16) | (mask & 0xffff);
}

function dampToward(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(rate, 0) * Math.max(dt, 0));
  return THREE.MathUtils.lerp(current, target, alpha);
}

function computeSteeringLimit(steeringConfig, horizontalKph) {
  const speedBreaks = steeringConfig.SteeringLimitSpeed ?? [20, 40, 100, 250];
  const limitRates = steeringConfig.SteeringLimitRate ?? [1, 0.8, 0.5, 0.25];
  return clamp(interpolateRateBySpeed(horizontalKph, speedBreaks, limitRates), 0.1, 1);
}

function computeSteeringSpeedRate(steeringConfig, horizontalKph) {
  const speedBreaks = steeringConfig.SteeringLimitSpeed ?? [20, 40, 100, 250];
  const speedRates = steeringConfig.SteeringSpeedRate ?? [2, 2, 2, 2];
  return clamp(interpolateRateBySpeed(horizontalKph, speedBreaks, speedRates), 0.1, 8);
}

function interpolateRateBySpeed(speed, breakpoints, rates) {
  if (!Array.isArray(breakpoints) || !Array.isArray(rates) || rates.length === 0) {
    return 1;
  }
  if (speed <= breakpoints[0]) {
    return rates[0];
  }
  for (let index = 1; index < Math.min(breakpoints.length, rates.length); index += 1) {
    if (speed <= breakpoints[index]) {
      const t = inverseLerp(breakpoints[index - 1], breakpoints[index], speed);
      return THREE.MathUtils.lerp(rates[index - 1], rates[index], t);
    }
  }
  return rates[Math.min(rates.length, breakpoints.length) - 1];
}

function inverseLerp(a, b, value) {
  if (Math.abs(b - a) < 1e-6) {
    return 0;
  }

  return clamp((value - a) / (b - a), 0, 1);
}

function pickScalar(value, fallback) {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? value[0] : fallback;
  }

  return Number.isFinite(value) ? value : fallback;
}

function pickVec2(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    return [pickScalar(value[0], fallback[0]), pickScalar(value[1], fallback[1])];
  }

  return fallback;
}

function pickVec4(value, fallback) {
  if (Array.isArray(value) && value.length >= 4) {
    return [
      pickScalar(value[0], fallback[0]),
      pickScalar(value[1], fallback[1]),
      pickScalar(value[2], fallback[2]),
      pickScalar(value[3], fallback[3]),
    ];
  }

  return fallback;
}

function readProfileScalar(value, fallback, profileIndex = DB_PROFILE_INDEX) {
  if (Array.isArray(value)) {
    const selected = value[profileIndex];
    if (Number.isFinite(selected)) {
      return selected;
    }
    const first = value[0];
    return Number.isFinite(first) ? first : fallback;
  }

  return Number.isFinite(value) ? value : fallback;
}

function readVec2(value, fallback, profileIndex = DB_PROFILE_INDEX) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [
    readProfileScalar(value[0], fallback[0], profileIndex),
    readProfileScalar(value[1], fallback[1], profileIndex),
  ];
}

function readVec3(value, fallback, profileIndex = DB_PROFILE_INDEX) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [
    readProfileScalar(value[0], fallback[0], profileIndex),
    readProfileScalar(value[1], fallback[1], profileIndex),
    readProfileScalar(value[2], fallback[2], profileIndex),
  ];
}

function readVec4(value, fallback, profileIndex = DB_PROFILE_INDEX) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [
    readProfileScalar(value[0], fallback[0], profileIndex),
    readProfileScalar(value[1], fallback[1], profileIndex),
    readProfileScalar(value[2], fallback[2], profileIndex),
    readProfileScalar(value[3], fallback[3], profileIndex),
  ];
}

function sampleSurfaceType(trackFloorSampler, translation) {
  if (!trackFloorSampler?.sample) {
    return "tarmac";
  }
  const hit = trackFloorSampler.sample(
    TMP_VEC_D.set(translation.x, translation.y, translation.z),
    {
      rayHeight: 8,
      rayDistance: 24,
      minUpDot: -0.4,
    },
  );
  return hit?.surfaceType ?? "tarmac";
}

function resolveSurfaceDynamics(surfaceDynamics, surfaceType) {
  switch (surfaceType) {
    case "tarmac":
      return surfaceDynamics?.tarmac ?? {};
    case "gravel":
      return surfaceDynamics?.gravel ?? {};
    case "sand":
      return surfaceDynamics?.sand ?? {};
    case "hazard":
      return surfaceDynamics?.hazard ?? {};
    case "grass":
    case "dirt":
    case "forest":
      return surfaceDynamics?.forest ?? surfaceDynamics?.tarmac ?? {};
    case "snow":
      return surfaceDynamics?.snow ?? surfaceDynamics?.tarmac ?? {};
    case "ice":
      return surfaceDynamics?.ice ?? surfaceDynamics?.tarmac ?? {};
    default:
      return surfaceDynamics?.tarmac ?? {};
  }
}

function computeSurfaceGrip(surfaceDynamics) {
  const xGrip = readProfileScalar(surfaceDynamics?.XFriction, 1.15);
  const zGrip = readProfileScalar(surfaceDynamics?.ZFriction, 1.15);
  const boost = readProfileScalar(surfaceDynamics?.FrictionBoost, 0);
  return clamp(((xGrip + zGrip) * 0.5) + boost, 0.3, 2.2);
}

function computeApproximateChassisInertia(mass, halfExtents) {
  const w = halfExtents.x * 2;
  const h = halfExtents.y * 2;
  const d = halfExtents.z * 2;
  const ix = (mass / 12) * (h * h + d * d);
  const iy = (mass / 12) * (w * w + d * d);
  const iz = (mass / 12) * (w * w + h * h);
  return {
    x: Math.max(ix, mass * 0.4),
    y: Math.max(iy, mass * 0.4),
    z: Math.max(iz, mass * 0.4),
  };
}

function speedHorizontalNow(speedForwardNow, chassis) {
  const vel = chassis.linvel();
  return Math.hypot(vel.x, vel.z) * 3.6;
}

function buildGearRatios(gearbox) {
  const ratios = [];
  const maxGears = Math.max(
    Math.round(readProfileScalar(gearbox?.NumGears, 6)),
    0,
  );

  for (let gearIndex = 1; gearIndex <= Math.min(maxGears || 6, 6); gearIndex += 1) {
    const gearValue = gearbox[`Gear${gearIndex}`];
    const ratio = readProfileScalar(gearValue, 0);

    if (Number.isFinite(ratio) && Math.abs(ratio) > 1e-3) {
      ratios.push(ratio);
    }
  }

  return ratios;
}

function buildReverseRatio(gearbox) {
  return readProfileScalar(gearbox.GearR, -4.1);
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

function updateGearboxState(debugState, config, speedForward, rawThrottle, dt) {
  debugState.upshiftCooldown = Math.max((debugState.upshiftCooldown ?? 0) - dt, 0);
  debugState.downshiftCooldown = Math.max((debugState.downshiftCooldown ?? 0) - dt, 0);
  const idleRpm = config.engine.idleRpm;
  const rpmCeil = Math.max(config.engine.redLineRpm * 1.03, idleRpm + 800);
  const speedKph = Math.abs(speedForward) * 3.6;
  const throttleMagnitude = Math.max(
    Math.abs(debugState.throttleAxis ?? 0),
    Math.abs(rawThrottle ?? 0),
  );
  const ratios = config.gearbox.ratios;

  if (ratios.length === 0) {
    debugState.gear = 1;
    debugState.clutch = 1;
    debugState.engineRpm = idleRpm;
    return;
  }

  if (debugState.reverseLatched) {
    debugState.gear = -1;
    debugState.shiftTimer = 0;
    debugState.clutch = 1;
    const reverseTargetRpm = projectEngineRpmFromDriveState(
      speedForward,
      -1,
      config,
    );
    debugState.engineRpm = dampToward(
      debugState.engineRpm ?? idleRpm,
      Math.max(idleRpm, reverseTargetRpm),
      7,
      dt,
    );
    debugState.engineRpm = clamp(debugState.engineRpm, idleRpm, rpmCeil);
    return;
  }

  if ((debugState.gear ?? 0) <= 0) {
    debugState.gear = 0;
  }

  if (
    speedKph <= 1.2 &&
    throttleMagnitude < 0.1 &&
    (debugState.gear ?? 0) > 0 &&
    (debugState.shiftTimer ?? 0) <= 0
  ) {
    debugState.gear = 0;
    debugState.shiftFromGear = 0;
    debugState.shiftTargetGear = 0;
    debugState.clutch = 1;
  }

  if ((debugState.shiftTimer ?? 0) > 0) {
    debugState.shiftTimer = Math.max(debugState.shiftTimer - dt, 0);
    debugState.clutch = clamp(
      1 -
        debugState.shiftTimer /
          Math.max(config.gearbox.clutchEngageTime, 0.05),
      0.2,
      1,
    );
    if (debugState.shiftTimer === 0) {
      debugState.gear = debugState.shiftTargetGear;
      debugState.clutch = 1;
    }
  } else if ((debugState.gear ?? 0) === 0) {
    debugState.clutch = 0.25;
    if (
      throttleMagnitude > 0.08 &&
      speedKph <= 6 &&
      (debugState.engineRpm ?? idleRpm) >= config.engine.launchShiftRpm
    ) {
      startShift(debugState, 1, config, "up");
    }
  } else {
    debugState.gear = clamp(debugState.gear, 1, ratios.length);
    debugState.clutch = 1;
  }

  const currentGear = debugState.gear ?? 0;
  const coupledRpm =
    currentGear !== 0
      ? projectEngineRpmFromDriveState(speedForward, currentGear, config)
      : idleRpm +
        throttleMagnitude * (config.engine.launchTargetRpm - idleRpm);
  const launchFreeRevRpm =
    idleRpm + throttleMagnitude * (config.engine.launchTargetRpm - idleRpm);
  const launchSlipBlend = clamp(
    inverseLerp(14, 0.6, speedKph),
    0,
    1,
  );
  const launchRpmTarget =
    currentGear === 1 && throttleMagnitude > 0.08
      ? THREE.MathUtils.lerp(coupledRpm, Math.max(coupledRpm, launchFreeRevRpm), launchSlipBlend)
      : coupledRpm;

  debugState.engineRpm = dampToward(
    debugState.engineRpm ?? idleRpm,
    Math.max(idleRpm, launchRpmTarget),
    8,
    dt,
  );
  debugState.engineRpm = clamp(debugState.engineRpm, idleRpm, rpmCeil);

  if ((debugState.shiftTimer ?? 0) > 0 || currentGear <= 0) {
    return;
  }

  const engineRpmNow = debugState.engineRpm ?? idleRpm;
  const redlineTarget = config.engine.redLineRpm * 0.97;
  const downshiftThreshold = Math.max(idleRpm * 1.45, config.engine.peakTorqueRpm * 0.57);

  if (
    currentGear < ratios.length &&
    (debugState.upshiftCooldown ?? 0) <= 0 &&
    throttleMagnitude > 0.16 &&
    engineRpmNow >= redlineTarget
  ) {
    startShift(debugState, currentGear + 1, config, "up");
    return;
  }

  if (
    currentGear > 1 &&
    (debugState.downshiftCooldown ?? 0) <= 0 &&
    (engineRpmNow < downshiftThreshold ||
      speedKph < (config.shiftBands[currentGear - 1]?.downshiftKph ?? 0))
  ) {
    startShift(debugState, currentGear - 1, config, "down");
  }
}

function startShift(debugState, nextGear, config, direction = "up") {
  if (nextGear === debugState.gear) {
    return;
  }

  debugState.shiftFromGear = debugState.gear;
  debugState.shiftTargetGear = nextGear;
  debugState.shiftTimer =
    Math.max(config.gearbox.clutchEngageTime, 0.05) +
    Math.max(config.gearbox.clutchReleaseTime, 0.05);
  debugState.clutch = 0.2;
  const cooldown = Math.max(debugState.shiftTimer + 0.08, 0.1);
  if (direction === "down") {
    debugState.downshiftCooldown = cooldown;
  } else {
    debugState.upshiftCooldown = cooldown;
  }
}

function computeEngineDriveForceTotal(debugState, config, throttle) {
  const throttleMagnitude =
    debugState.gear < 0
      ? Math.abs(Math.min(throttle, 0))
      : Math.max(throttle, 0);

  if (throttleMagnitude <= 1e-4) {
    return 0;
  }

  const engineTorque =
    sampleEngineTorque(config.engine, debugState.engineRpm) * throttleMagnitude;
  const gearRatio = getCurrentGearRatio(debugState, config);
  const wheelRadius = averageDrivenWheelRadius(config);
  const clutchTorqueCap = Math.max(config.gearbox.clutchTorque ?? 280, 120);
  const transmissionTorque = Math.min(engineTorque, clutchTorqueCap);
  const axleTorque =
    transmissionTorque *
    gearRatio *
    config.gearbox.endRatio *
    Math.max(debugState.clutch ?? 1, 0.2) *
    (debugState.gear < 0 ? -1 : 1);
  const drivenWheelCount = Math.max(config.drivenWheelCount ?? 2, 1);
  const speedKph = Math.abs(debugState.speedHorizontal ?? 0) * 3.6;
  // FO2 drivetrain values do not map 1:1 to Rapier's wheelEngineForce unit.
  // Apply a calibrated low-speed conversion boost and taper it out with speed.
  const rapierForceScale = THREE.MathUtils.lerp(
    2.1,
    1.0,
    clamp(speedKph / 120, 0, 1),
  );

  return -(
    ((axleTorque / drivenWheelCount) / Math.max(wheelRadius, 0.1)) *
    Math.max(config.driveForceScale ?? 1, 0.1) *
    rapierForceScale
  );
}

function computeDriveForceForWheel(wheel, debugState, config, throttle, isolation) {
  const driven =
    (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

  if (!driven) {
    return 0;
  }

  const throttleMagnitude =
    debugState.gear < 0
      ? Math.abs(Math.min(throttle, 0))
      : Math.max(throttle, 0);

  if (throttleMagnitude <= 1e-4) {
    return 0;
  }

  const handbrakeDriveScale =
    !wheel.front
      ? THREE.MathUtils.lerp(
          1,
          0,
          THREE.MathUtils.clamp(debugState.handbrakeAxis ?? 0, 0, 1),
        )
      : 1;
  const speedKph = Math.abs(debugState.speedHorizontal ?? 0) * 3.6;
  const reverseKinematicLimitKph = rpmToKph(
    config.engine.redLineRpm * 0.98,
    Math.abs(config.gearbox.reverseRatio),
    config.gearbox.endRatio,
    Math.max(wheel.tireRadius ?? 0.34, 0.1),
  );
  const reverseThrottleScale =
    debugState.gear < 0
      ? clamp(
          1 - Math.pow(clamp(speedKph / Math.max(reverseKinematicLimitKph, 1), 0, 1), 3.2),
          0,
          1,
        )
      : 1;
  const engineTorque =
    sampleEngineTorque(config.engine, debugState.engineRpm) *
    throttleMagnitude *
    reverseThrottleScale;
  const clutchTorqueCap = Math.max(config.gearbox.clutchTorque ?? 280, 120);
  const transmissionTorque = Math.min(engineTorque, clutchTorqueCap);
  const gearRatio = getCurrentGearRatio(debugState, config);
  const differential = wheel.front
    ? config.differentials.front
    : config.differentials.rear;
  const throttleCurveScale = isolation.differentialCurve
    ? sampleCurve(differential?.throttleCurve, throttleMagnitude)
    : 1;
  const speedNorm = clamp((Math.abs(debugState.speedHorizontal ?? 0) * 3.6) / 260, 0, 1);
  const speedCurveScale = isolation.differentialCurve
    ? sampleCurve(differential?.speedCurve, speedNorm)
    : 0;
  const effectiveThrottleScale = clamp(0.4 + throttleCurveScale * 0.6, 0.15, 1.05);
  const differentialSpeedFactor = clamp(1 - speedCurveScale * 0.35, 0.6, 1.1);
  const clutchScale = clamp(Math.abs(debugState.clutch ?? 1), 0, 1);
  const controlScale = clamp(
    Math.min(
      Math.max(effectiveThrottleScale, 0),
      Math.max(clutchScale, 0),
    ),
    0,
    1,
  );
  // Native drivetrain stage (0x00441090) applies a nonlinear scalar:
  // s = c*0.3 + c^3*0.7 before differential torque split.
  const nonlinearTorqueScale =
    controlScale * 0.3 + controlScale * controlScale * controlScale * 0.7;
  // Differential MaxTorque in FO2 data is in drivetrain domain. Apply it before
  // gear multiplication (same domain as engine/clutch torque), not as wheel-force cap.
  const differentialTorqueCap = Math.max(pickScalar(differential?.MaxTorque, 5500), 120);
  const limitedTransmissionTorque = Math.min(
    transmissionTorque,
    differentialTorqueCap,
  );
  const drivenWheelCount = Math.max(config.drivenWheelCount ?? 2, 1);
  const wheelTorque =
    (limitedTransmissionTorque *
      gearRatio *
      config.gearbox.endRatio *
      differentialSpeedFactor *
      nonlinearTorqueScale *
      (debugState.gear < 0 ? -1 : 1) *
      handbrakeDriveScale) /
    drivenWheelCount;
  const wheelRadius = Math.max(wheel.tireRadius ?? 0.34, 0.1);
  // FO2 drivetrain values do not map 1:1 to Rapier's wheelEngineForce unit.
  // Apply a calibrated low-speed conversion boost and taper it out with speed.
  const rapierForceScale = THREE.MathUtils.lerp(
    2.1,
    1.0,
    clamp(speedKph / 120, 0, 1),
  );
  return -(
    (wheelTorque / wheelRadius) *
    Math.max(config.driveForceScale ?? 1, 0.1) *
    rapierForceScale
  );
}

function getRecommendedGearNativeLike(debugState, config, speedForward) {
  const maxGear = config.gearbox.ratios.length;
  if (maxGear <= 0) {
    return 1;
  }

  const projectedForward = speedForward;
  const nonNegativeForward = Math.max(projectedForward, 0);
  const drivenLinearSpeed = averageDrivenWheelLinearSpeed(config);
  let selectedSpeed = nonNegativeForward;

  if (
    nonNegativeForward < drivenLinearSpeed &&
    drivenLinearSpeed < nonNegativeForward * 1.15
  ) {
    selectedSpeed = drivenLinearSpeed;
  }

  const speedKph = selectedSpeed * 3.6;
  let gear = debugState.gear ?? 1;

  if (gear === -1) {
    gear = 1;
  } else if (gear === 1) {
    if (
      Math.abs(projectedForward) < 1.5 &&
      (debugState.engineRpm ?? config.engine.idleRpm) < config.engine.idleRpm * 1.12
    ) {
      return 0;
    }
  } else if (gear === 0) {
    if ((debugState.engineRpm ?? config.engine.idleRpm) <= config.engine.idleRpm * 1.12) {
      return 0;
    }
    return 1;
  }

  gear = clamp(gear, 1, maxGear);

  if (gear > 1) {
    while (gear > 1) {
      const currentBand = config.shiftBands[gear - 1] ?? null;
      const nextBand = config.shiftBands[gear] ?? null;
      const currentDown = currentBand?.downshiftKph ?? 0;
      const nextDown = nextBand?.downshiftKph ?? Number.POSITIVE_INFINITY;

      if (
        (gear !== maxGear && nextDown < speedKph) ||
        currentDown - 10 < speedKph
      ) {
        break;
      }

      gear -= 1;
    }
  }

  if (gear < maxGear) {
    while (gear < maxGear) {
      const currentBand = config.shiftBands[gear - 1] ?? null;
      const upshiftKph = currentBand?.upshiftKph ?? Number.POSITIVE_INFINITY;

      if (speedKph < upshiftKph) {
        return gear;
      }

      gear += 1;
    }
  }

  return gear;
}

function getCurrentGearRatio(debugState, config) {
  if ((debugState.gear ?? 1) === 0) {
    return 0;
  }

  if ((debugState.gear ?? 1) < 0) {
    return Math.abs(config.gearbox.reverseRatio);
  }

  return config.gearbox.ratios[(debugState.gear ?? 1) - 1] ?? config.gearbox.ratios[0] ?? 1;
}

function projectEngineRpmForGear(driveWheelOmega, gear, config) {
  const ratio =
    gear < 0
      ? Math.abs(config.gearbox.reverseRatio)
      : config.gearbox.ratios[gear - 1] ?? config.gearbox.ratios[0] ?? 1;
  return Math.abs(driveWheelOmega * ratio * config.gearbox.endRatio) * (60 / (Math.PI * 2));
}

function projectEngineRpmForSpeed(speedForward, gear, config) {
  const wheelRadius = averageDrivenWheelRadius(config);
  const wheelOmega = Math.abs(speedForward) / Math.max(wheelRadius, 0.1);
  return projectEngineRpmForGear(wheelOmega, gear, config);
}

function projectEngineRpmFromDriveState(speedForward, gear, config) {
  const speedProjectedRpm = projectEngineRpmForSpeed(speedForward, gear, config);
  const wheelOmega = Math.abs(averageDrivenWheelOmega(config));

  if (!Number.isFinite(wheelOmega) || wheelOmega <= 1e-3) {
    return speedProjectedRpm;
  }

  const wheelProjectedRpm = projectEngineRpmForGear(wheelOmega, gear, config);
  return Math.max(speedProjectedRpm, wheelProjectedRpm);
}

function updateDrivenWheelState(config, vehicleController, dt) {
  for (const [wheelIndex, wheel] of config.wheelLayout.entries()) {
    const rotation = vehicleController.wheelRotation(wheelIndex);

    if (!Number.isFinite(rotation)) {
      continue;
    }

    const delta = unwrapAngleDelta(rotation - wheel.currentRotation);
    wheel.angularVelocity = delta / Math.max(dt, 1e-5);
    wheel.currentRotation = rotation;
  }
}

function averageDrivenWheelOmega(config) {
  let totalOmega = 0;
  let count = 0;

  for (const wheel of config.wheelLayout) {
    const driven =
      (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

    if (!driven) {
      continue;
    }

    totalOmega += wheel.angularVelocity ?? 0;
    count += 1;
  }

  return count > 0 ? totalOmega / count : 0;
}

function averageDrivenWheelLinearSpeed(config) {
  let totalSpeed = 0;
  let count = 0;

  for (const wheel of config.wheelLayout) {
    const driven =
      (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

    if (!driven) {
      continue;
    }

    totalSpeed +=
      Math.abs(wheel.angularVelocity ?? 0) * Math.max(wheel.tireRadius ?? 0.34, 0.1);
    count += 1;
  }

  return count > 0 ? totalSpeed / count : 0;
}

function computeAverageLongitudinalSlip(config, speedForward) {
  let totalSlip = 0;
  let count = 0;
  const referenceSpeed = Math.max(Math.abs(speedForward), 0.5);

  for (const wheel of config.wheelLayout) {
    const driven =
      (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

    if (!driven) {
      continue;
    }

    const wheelLinearSpeed =
      Math.abs(wheel.angularVelocity ?? 0) * Math.max(wheel.tireRadius ?? 0.34, 0.1);
    totalSlip += Math.abs(wheelLinearSpeed - Math.abs(speedForward)) / referenceSpeed;
    count += 1;
  }

  return count > 0 ? totalSlip / count : 0;
}

function computeLateralSlip(speedRight, speedHorizontal) {
  if (!Number.isFinite(speedRight) || !Number.isFinite(speedHorizontal)) {
    return 0;
  }
  return Math.abs(speedRight) / Math.max(speedHorizontal, 0.5);
}

function averageDrivenWheelRadius(config) {
  let totalRadius = 0;
  let count = 0;

  for (const wheel of config.wheelLayout) {
    const driven =
      (wheel.front && config.frontTraction) || (!wheel.front && config.rearTraction);

    if (!driven) {
      continue;
    }

    totalRadius += Math.max(wheel.tireRadius ?? 0.34, 0.1);
    count += 1;
  }

  return count > 0 ? totalRadius / count : 0.34;
}

function countDrivenWheels(frontTraction, rearTraction) {
  let count = 0;

  if (frontTraction) {
    count += 2;
  }

  if (rearTraction) {
    count += 2;
  }

  return Math.max(count, 2);
}

function averageDrivenWheelRadiusFromLayout(wheelLayout, frontTraction, rearTraction) {
  let totalRadius = 0;
  let count = 0;

  for (const wheel of wheelLayout) {
    const driven =
      (wheel.front && frontTraction) || (!wheel.front && rearTraction);

    if (!driven) {
      continue;
    }

    totalRadius += Math.max(wheel.tireRadius ?? 0.34, 0.1);
    count += 1;
  }

  return count > 0 ? totalRadius / count : 0.34;
}

function buildShiftBands({ gearRatios, endRatio, engine, drivenWheelRadius }) {
  return gearRatios.map((ratio, index) => {
    const upshiftKph = rpmToKph(
      engine.redLineRpm * 0.985,
      ratio,
      endRatio,
      drivenWheelRadius,
    );
    const downshiftKph = rpmToKph(
      Math.max(engine.idleRpm * 1.8, engine.peakTorqueRpm * 0.55),
      ratio,
      endRatio,
      drivenWheelRadius,
    );

    return {
      upshiftKph,
      downshiftKph: index === 0 ? 0 : downshiftKph,
    };
  });
}

function rpmToKph(rpm, gearRatio, endRatio, wheelRadius) {
  const wheelOmega = (rpm * Math.PI * 2) / 60;
  const vehicleSpeedMs =
    (wheelOmega * Math.max(wheelRadius, 0.1)) /
    Math.max(Math.abs(gearRatio * endRatio), 0.1);
  return vehicleSpeedMs * 3.6;
}

function sampleEngineTorque(engine, rpm) {
  const idle = engine.idleRpm;
  const torquePeakRpm = engine.peakTorqueRpm;
  const powerPeakRpm = engine.peakPowerRpm;
  const redline = engine.redLineRpm;
  const peakTorque = engine.peakTorque;
  const powerPeakAngularVelocity =
    (Math.max(powerPeakRpm, idle) * Math.PI * 2) / 60;
  const torqueAtPowerPeak = Math.max(
    (Math.max(engine.peakPower, 1) * 1000) /
      Math.max(powerPeakAngularVelocity, 1e-3),
    peakTorque * 0.72,
  );

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

  const scaled = clamp(normalized, 0, 1) * (curve.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(lowIndex + 1, curve.length - 1);
  const alpha = scaled - lowIndex;
  return THREE.MathUtils.lerp(curve[lowIndex], curve[highIndex], alpha);
}

function unwrapAngleDelta(delta) {
  if (delta > Math.PI) {
    return delta - Math.PI * 2;
  }

  if (delta < -Math.PI) {
    return delta + Math.PI * 2;
  }

  return delta;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}
