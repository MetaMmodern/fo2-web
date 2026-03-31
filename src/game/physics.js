import * as THREE from "three";

const DEFAULT_BODY_CONFIG = {
  collisionFullMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionFullMax: new THREE.Vector3(0.878, 1.084, 1.835),
  collisionBottomMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionBottomMax: new THREE.Vector3(0.878, 0.705, 1.835),
  collisionTopMin: new THREE.Vector3(-0.656, 0.705, -1.189),
  collisionTopMax: new THREE.Vector3(0.656, 1.084, 0.482),
};

const DEFAULT_TIRE_CONFIG = {
  rollingResistance: 0.5,
  inducedDragCoeff: 1.0,
  pneumaticTrail: 0.04,
  pneumaticOffset: 0.5,
  zFrictionBase: 1.0,
  zFrictionSlope: -0.0076,
  xFrictionBase: 1.121,
  xFrictionSlope: -0.0076,
};

const STEERING_PROFILE = {
  sensitivity: 0.5,
  centeringSpeed: 0.99,
  steeringLimitRate: 0.9,
  speedBreakpointsKph: [20, 90, 200, 300],
  speedLimitFactors: [1.0, 0.9, 0.72, 0.58, 0.5],
  digitalSpeedRange: [1.5, 3.5],
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_HORIZONTAL = new THREE.Vector3();
const TMP_ORIGIN = new THREE.Vector3();
const TMP_TARGET = new THREE.Vector3();
const TMP_LOCAL = new THREE.Vector3();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();
const TMP_CENTROID = new THREE.Vector3();
const TMP_NORMAL = new THREE.Vector3();
const TMP_PUSH = new THREE.Vector3();
const TMP_CONTACT_OFFSET = new THREE.Vector3();
const TMP_DIRECTION = new THREE.Vector3();
const TMP_SPIN = new THREE.Quaternion();
const TMP_STEER = new THREE.Quaternion();
const TMP_QUATERNION = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler(0, 0, 0, "YXZ");
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const WHEEL_NAMES = [
  "placeholder_tire_fl",
  "placeholder_tire_fr",
  "placeholder_tire_rr",
  "placeholder_tire_rl",
];

const MAX_FORWARD_SPEED = 42;
const MAX_REVERSE_SPEED = 16;
const ENGINE_ACCELERATION = 24;
const REVERSE_ACCELERATION = 16;
const SERVICE_BRAKE = 34;
const GRAVITY = 18;
const MAX_SUSPENSION_TRAVEL = 0.26;
const CONTACT_RAY_HEIGHT = 3.5;
const CONTACT_RAY_DISTANCE = 12;
const WALL_COLLISION_SKIN = 0.08;
const FIXED_SUBSTEP_DT = 0.01;
const MAX_SUBSTEPS = 100;

export async function createDrivingSimulation({
  carRoot,
  assetUrls,
  input,
  trackFloorSampler = null,
}) {
  const [bodyConfig, tireConfig] = await Promise.all([
    loadBodyConfig(assetUrls.bodyConfig).catch(() => DEFAULT_BODY_CONFIG),
    loadTireConfig(assetUrls.tireConfig).catch(() => DEFAULT_TIRE_CONFIG),
  ]);
  const wheelLayout = buildWheelLayout(carRoot, bodyConfig);
  const vehicleLength = Math.max(
    computeVehicleLength(wheelLayout, bodyConfig),
    3.2,
  );
  const spawnLift = Math.max(
    bodyConfig.collisionBottomMax.y + averageWheelRadius(wheelLayout) + 0.15,
    0.9,
  );

  const state = {
    velocity: new THREE.Vector3(),
    yaw: extractYaw(carRoot.quaternion),
    steerState: 0,
    steerVisual: 0,
    verticalVelocity: 0,
    surfaceGrip: 1,
    grounded: false,
    previousResetPressed: false,
    wheelStates: createWheelVisualState(wheelLayout),
    previousPosition: carRoot.position.clone(),
    previousYaw: extractYaw(carRoot.quaternion),
    cameraShake: 0,
    cameraState: {
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
    },
  };

  applyGroundContact(
    carRoot,
    trackFloorSampler,
    wheelLayout,
    state,
    spawnLift,
    true,
  );

  const spawnPosition = carRoot.position.clone();
  const spawnQuaternion = carRoot.quaternion.clone();

  return {
    update(deltaSeconds) {
      const dt = Math.min(deltaSeconds, 0.1);
      const previousGrounded = state.grounded;
      const previousVerticalVelocity = state.verticalVelocity;
      const previousY = carRoot.position.y;
      const throttle = THREE.MathUtils.clamp(input?.throttle ?? 0, 0, 1);
      const brake = THREE.MathUtils.clamp(input?.brake ?? 0, 0, 1);
      const steerInput = THREE.MathUtils.clamp(input?.steer ?? 0, -1, 1);
      const handbrake = THREE.MathUtils.clamp(input?.handbrake ?? 0, 0, 1);

      if (dt <= 0) {
        return;
      }

      const substepCount = MAX_SUBSTEPS;
      // FlatOut 2 runs 100 fixed substeps per frame (FUN_0042c650) with a tiny constant dt.
      // Break the current frame delta into MAX_SUBSTEPS micro-steps so the total simulated time still equals dt.
      const stepDt = Math.max(dt / substepCount, 1e-6);

      for (let step = 0; step < substepCount; step += 1) {
        simulateFixedSubstep(
          state,
          steerInput,
          throttle,
          brake,
          handbrake,
          tireConfig,
          vehicleLength,
          stepDt,
        );
      }

      state.steerVisual = moveToward(
        state.steerVisual,
        state.steerState,
        6 * dt,
      );

      const cameraForward = getYawForward(state.yaw, TMP_FORWARD);
      const updatedRight = getYawRight(cameraForward, TMP_RIGHT);
      TMP_HORIZONTAL.copy(cameraForward)
        .multiplyScalar(state.velocity.dot(cameraForward))
        .addScaledVector(updatedRight, state.velocity.dot(updatedRight));
      state.velocity.x = TMP_HORIZONTAL.x;
      state.velocity.z = TMP_HORIZONTAL.z;

      carRoot.position.addScaledVector(TMP_HORIZONTAL, dt);
      resolveBodyCollisions(carRoot, trackFloorSampler, bodyConfig, state, dt);
      state.verticalVelocity -= GRAVITY * dt;
      carRoot.position.y += state.verticalVelocity * dt;

      const grounded = applyGroundContact(
        carRoot,
        trackFloorSampler,
        wheelLayout,
        state,
        spawnLift,
      );

      if (!grounded) {
        carRoot.quaternion.setFromEuler(
          new THREE.Euler(0, state.yaw, 0, "YXZ"),
        );
      }

      state.grounded = grounded;

      updateWheelVisuals(carRoot, wheelLayout, state, dt);

      if (grounded && !previousGrounded && previousVerticalVelocity < -2.5) {
        state.cameraShake = Math.min(
          state.cameraShake + Math.abs(previousVerticalVelocity) * 0.08,
          1.4,
        );
      }

      const verticalDisplacement =
        (carRoot.position.y - previousY) / Math.max(dt, 1e-4);
      if (grounded && Math.abs(verticalDisplacement) > 5) {
        state.cameraShake = Math.min(
          state.cameraShake + Math.abs(verticalDisplacement) * 0.015,
          1.4,
        );
      }

      state.cameraShake = Math.max(state.cameraShake - dt * 1.6, 0);
      const forwardSpeed = state.velocity.dot(cameraForward);
      const lateralSpeed = state.velocity.dot(updatedRight);
      updateCameraState(state, carRoot, dt, forwardSpeed, lateralSpeed);

      const resetPressed = Boolean(input?.resetPressed);
      if (
        (resetPressed && !state.previousResetPressed) ||
        carRoot.position.y < -20
      ) {
        resetVehicle(
          carRoot,
          spawnPosition,
          spawnQuaternion,
          wheelLayout,
          state,
          trackFloorSampler,
          spawnLift,
        );
      }

      state.previousResetPressed = resetPressed;
    },
    speedKph() {
      return horizontalSpeed(state.velocity) * 3.6;
    },
    getCameraState() {
      return state.cameraState;
    },
  };
}

function buildWheelLayout(carRoot, bodyConfig) {
  const layout = [];

  for (const name of WHEEL_NAMES) {
    const anchor = carRoot.getObjectByName(name);
    const tire = carRoot.getObjectByName(`${name}_tire`);
    const fallbackX = name.includes("_l")
      ? bodyConfig.collisionBottomMin.x
      : bodyConfig.collisionBottomMax.x;
    const fallbackZ = name.includes("_f")
      ? bodyConfig.collisionBottomMin.z * 0.82
      : bodyConfig.collisionBottomMax.z * 0.82;
    const localPosition =
      anchor?.position?.clone?.() ??
      new THREE.Vector3(
        fallbackX,
        bodyConfig.collisionBottomMin.y + 0.22,
        fallbackZ,
      );
    const wheelRadius = estimateWheelRadius(tire) ?? 0.34;

    layout.push({
      name,
      localPosition,
      radius: wheelRadius,
      suspensionLift: 0.03,
      tire,
    });
  }

  return layout;
}

function computeVehicleLength(wheelLayout, bodyConfig) {
  const frontZ = Math.min(
    ...wheelLayout
      .filter((wheel) => wheel.name.includes("_f"))
      .map((wheel) => wheel.localPosition.z),
  );
  const rearZ = Math.max(
    ...wheelLayout
      .filter((wheel) => wheel.name.includes("_r"))
      .map((wheel) => wheel.localPosition.z),
  );

  if (Number.isFinite(frontZ) && Number.isFinite(rearZ)) {
    return Math.abs(rearZ - frontZ);
  }

  return bodyConfig.collisionBottomMax.z - bodyConfig.collisionBottomMin.z;
}

function averageWheelRadius(wheelLayout) {
  return (
    wheelLayout.reduce((sum, wheel) => sum + wheel.radius, 0) /
    Math.max(wheelLayout.length, 1)
  );
}

function estimateWheelRadius(tireRoot) {
  if (!tireRoot) {
    return null;
  }

  const box = new THREE.Box3().setFromObject(tireRoot);
  const size = new THREE.Vector3();
  box.getSize(size);
  const radius = Math.max(size.y, size.x) * 0.5;
  return Number.isFinite(radius) && radius > 0 ? radius : null;
}

function createWheelVisualState(wheelLayout) {
  return wheelLayout.map((wheel) => ({
    name: wheel.name,
    offsetY: 0,
    grounded: false,
    spinAngle: 0,
  }));
}

function applyGroundContact(
  carRoot,
  trackFloorSampler,
  wheelLayout,
  state,
  spawnLift,
  snap = false,
) {
  if (!trackFloorSampler) {
    carRoot.position.y = Math.max(carRoot.position.y, spawnLift);
    state.verticalVelocity = 0;
    state.surfaceGrip = 1;
    return false;
  }

  const contacts = sampleWheelContacts(
    trackFloorSampler,
    wheelLayout,
    carRoot.position,
    state.yaw,
  );
  const groundedContacts = contacts.filter((contact) => contact.hit);

  for (const wheelState of state.wheelStates) {
    wheelState.grounded = false;
    wheelState.offsetY = 0;
  }

  if (groundedContacts.length === 0) {
    return false;
  }

  const planeNormal = computeGroundPlaneNormal(groundedContacts);
  const rootY = computeGroundedRootY(groundedContacts);
  const forward = getYawForward(state.yaw, TMP_FORWARD);
  TMP_A.copy(forward).projectOnPlane(planeNormal);
  if (TMP_A.lengthSq() < 1e-5) {
    TMP_A.copy(forward);
  }
  TMP_A.normalize();

  TMP_ORIGIN.set(carRoot.position.x, rootY, carRoot.position.z);
  TMP_TARGET.copy(TMP_ORIGIN).add(TMP_A);
  const matrix = new THREE.Matrix4().lookAt(
    TMP_ORIGIN,
    TMP_TARGET,
    planeNormal,
  );
  TMP_QUATERNION.setFromRotationMatrix(matrix);

  carRoot.position.y = snap
    ? rootY
    : THREE.MathUtils.lerp(carRoot.position.y, rootY, 0.8);
  carRoot.quaternion.copy(TMP_QUATERNION);
  state.verticalVelocity = Math.min(state.verticalVelocity, 0);
  state.verticalVelocity = 0;
  state.surfaceGrip =
    groundedContacts.reduce(
      (sum, contact) => sum + surfaceGripForType(contact.hit.surfaceType),
      0,
    ) / groundedContacts.length;

  for (const contact of groundedContacts) {
    const wheelState = state.wheelStates.find(
      (entry) => entry.name === contact.wheel.name,
    );

    if (!wheelState) {
      continue;
    }

    const localY =
      contact.hit.point.y +
      contact.wheel.radius +
      contact.wheel.suspensionLift -
      carRoot.position.y;
    wheelState.offsetY = THREE.MathUtils.clamp(
      localY - contact.wheel.localPosition.y,
      -MAX_SUSPENSION_TRAVEL,
      MAX_SUSPENSION_TRAVEL * 0.35,
    );
    wheelState.grounded = true;
  }

  return true;
}

function sampleWheelContacts(
  trackFloorSampler,
  wheelLayout,
  rootPosition,
  yaw,
) {
  const yawQuaternion = TMP_QUATERNION.setFromAxisAngle(WORLD_UP, yaw);

  return wheelLayout.map((wheel) => {
    TMP_LOCAL.copy(wheel.localPosition).applyQuaternion(yawQuaternion);
    TMP_ORIGIN.copy(rootPosition).add(TMP_LOCAL);
    const hit = trackFloorSampler.sample(TMP_ORIGIN, {
      rayHeight: CONTACT_RAY_HEIGHT,
      rayDistance: CONTACT_RAY_DISTANCE,
      minUpDot: 0.12,
    });

    return { wheel, hit };
  });
}

function computeGroundPlaneNormal(contacts) {
  if (contacts.length < 3) {
    return TMP_NORMAL.copy(WORLD_UP);
  }

  TMP_CENTROID.set(0, 0, 0);
  for (const contact of contacts) {
    TMP_CENTROID.add(contact.hit.point);
  }
  TMP_CENTROID.divideScalar(contacts.length);

  TMP_NORMAL.set(0, 0, 0);
  for (let index = 0; index < contacts.length; index += 1) {
    const current = contacts[index].hit.point;
    const next = contacts[(index + 1) % contacts.length].hit.point;
    TMP_A.copy(current).sub(TMP_CENTROID);
    TMP_B.copy(next).sub(TMP_CENTROID);
    const cross = TMP_LOCAL.crossVectors(TMP_B, TMP_A);
    if (cross.y < 0) {
      cross.multiplyScalar(-1);
    }
    TMP_NORMAL.add(cross);
  }

  if (TMP_NORMAL.lengthSq() < 1e-5) {
    return TMP_NORMAL.copy(WORLD_UP);
  }

  return TMP_NORMAL.normalize();
}

function computeGroundedRootY(contacts) {
  return (
    contacts.reduce(
      (sum, contact) =>
        sum +
        (contact.hit.point.y +
          contact.wheel.radius +
          contact.wheel.suspensionLift -
          contact.wheel.localPosition.y),
      0,
    ) / contacts.length
  );
}

function computeSteerTarget(steerInput, speedKph, handbrake) {
  const magnitude =
    Math.abs(steerInput) < 0.02
      ? 0
      : Math.abs(steerInput) *
        (1 / Math.max(STEERING_PROFILE.sensitivity, 1e-4));
  const speedLimitedMagnitude = Math.min(
    magnitude * computeSpeedLimitedSteer(speedKph) * (handbrake > 0 ? 1.18 : 1),
    1,
  );

  return Math.sign(steerInput) * speedLimitedMagnitude;
}

function computeSpeedLimitedSteer(speedKph) {
  const limits = STEERING_PROFILE.speedLimitFactors;
  const speeds = STEERING_PROFILE.speedBreakpointsKph;

  if (speedKph <= speeds[0]) {
    return limits[0];
  }

  for (let index = 1; index < speeds.length; index += 1) {
    if (speedKph <= speeds[index]) {
      return THREE.MathUtils.lerp(
        limits[index - 1],
        limits[index],
        (speedKph - speeds[index - 1]) / (speeds[index] - speeds[index - 1]),
      );
    }
  }

  return limits[limits.length - 1] * STEERING_PROFILE.steeringLimitRate;
}

function simulateFixedSubstep(
  state,
  steerInput,
  throttle,
  brake,
  handbrake,
  tireConfig,
  vehicleLength,
  dt,
) {
  const forward = getYawForward(state.yaw, TMP_FORWARD);
  const right = getYawRight(forward, TMP_RIGHT);
  const horizontalSpeedKph = horizontalSpeed(state.velocity) * 3.6;

  updateSteerState(state, steerInput, handbrake, horizontalSpeedKph, dt);

  let forwardSpeed = state.velocity.dot(forward);
  let lateralSpeed = state.velocity.dot(right);

  if (throttle > 0) {
    forwardSpeed += ENGINE_ACCELERATION * throttle * state.surfaceGrip * dt;
  } else if (brake > 0) {
    if (forwardSpeed > 0.75) {
      forwardSpeed = Math.max(forwardSpeed - SERVICE_BRAKE * brake * dt, 0);
    } else {
      forwardSpeed = Math.max(
        forwardSpeed - REVERSE_ACCELERATION * brake * dt,
        -MAX_REVERSE_SPEED,
      );
    }
  }

  const rollingDrag =
    (0.55 + tireConfig.rollingResistance * 1.2 + handbrake * 2.8) * dt;
  const aeroDrag =
    tireConfig.inducedDragCoeff * Math.abs(forwardSpeed) * 0.012 * dt;
  if (throttle <= 0) {
    forwardSpeed = dampTowardZero(forwardSpeed, rollingDrag + aeroDrag);
  }

  const baseLateralGrip = computeLateralGrip(
    tireConfig,
    Math.abs(forwardSpeed),
    state.surfaceGrip,
  );
  const lateralGrip = THREE.MathUtils.lerp(baseLateralGrip, 1.1, handbrake);
  lateralSpeed = dampTowardZero(lateralSpeed, lateralGrip * dt);

  const yawRateScale = handbrake > 0 ? 1.35 : 1.0;
  const yawDelta =
    state.steerState *
    computeSpeedLimitedSteer(horizontalSpeedKph) *
    yawRateScale *
    (forwardSpeed / Math.max(vehicleLength, 0.1)) *
    Math.max(state.surfaceGrip, 0.45) *
    1.9 *
    dt;
  state.yaw += yawDelta;

  const updatedForward = getYawForward(state.yaw, TMP_FORWARD);
  const updatedRight = getYawRight(updatedForward, TMP_RIGHT);
  state.velocity
    .copy(updatedForward)
    .multiplyScalar(forwardSpeed)
    .addScaledVector(updatedRight, lateralSpeed);
}

function updateSteerState(
  state,
  steerInput,
  handbrake,
  horizontalSpeedKph,
  dt,
) {
  const steerTarget = computeSteerTarget(
    steerInput,
    horizontalSpeedKph,
    handbrake,
  );
  const steerRate = THREE.MathUtils.lerp(
    STEERING_PROFILE.digitalSpeedRange[0],
    STEERING_PROFILE.digitalSpeedRange[1],
    Math.abs(steerInput),
  );
  const steerSnapRate =
    Math.abs(steerTarget) > Math.abs(state.steerState)
      ? steerRate
      : STEERING_PROFILE.centeringSpeed;

  state.steerState = moveToward(
    state.steerState,
    steerTarget,
    steerSnapRate * dt,
  );
}

function computeLateralGrip(tireConfig, speed, surfaceGrip) {
  const friction =
    tireConfig.xFrictionBase +
    tireConfig.xFrictionSlope * THREE.MathUtils.clamp(speed * 3.6, 0, 140);

  return THREE.MathUtils.clamp((2.8 + friction * 2.2) * surfaceGrip, 1.8, 6.2);
}

function surfaceGripForType(surfaceType) {
  switch (surfaceType) {
    case "tarmac":
      return 1.0;
    case "gravel":
      return 0.88;
    case "dirt":
      return 0.82;
    case "grass":
      return 0.76;
    case "sand":
      return 0.67;
    case "hazard":
      return 0.73;
    default:
      return 0.92;
  }
}

function updateWheelVisuals(carRoot, wheelLayout, state, deltaSeconds) {
  const speed = state.velocity.length();
  const wheelSpin = (speed / 0.34) * deltaSeconds;
  const steerAngle = THREE.MathUtils.degToRad(24) * state.steerVisual;

  for (const wheel of wheelLayout) {
    const tire = wheel.tire ?? carRoot.getObjectByName(`${wheel.name}_tire`);
    const wheelState = state.wheelStates.find(
      (entry) => entry.name === wheel.name,
    );

    if (!tire || !wheelState) {
      continue;
    }

    wheelState.spinAngle += wheelSpin;
    tire.position.copy(tire.userData.basePosition ?? wheel.localPosition);
    tire.position.y += wheelState.offsetY;
    tire.quaternion.copy(tire.userData.baseQuaternion ?? tire.quaternion);

    if (wheel.name.includes("_f")) {
      TMP_STEER.setFromAxisAngle(LOCAL_UP, steerAngle);
      tire.quaternion.multiply(TMP_STEER);
    }

    TMP_SPIN.setFromAxisAngle(LOCAL_RIGHT, wheelState.spinAngle);
    tire.quaternion.multiply(TMP_SPIN);
  }
}

function resolveBodyCollisions(
  carRoot,
  trackFloorSampler,
  bodyConfig,
  state,
  dt,
) {
  if (!trackFloorSampler?.raycast) {
    return;
  }

  const planarSpeed = horizontalSpeed(state.velocity);
  if (planarSpeed < 0.05) {
    return;
  }

  TMP_DIRECTION.set(state.velocity.x, 0, state.velocity.z).normalize();
  const clearance = planarSpeed * dt + WALL_COLLISION_SKIN;
  const probeHeight = THREE.MathUtils.lerp(
    bodyConfig.collisionBottomMin.y,
    bodyConfig.collisionTopMax.y,
    0.55,
  );
  const probeOffsets = [
    new THREE.Vector3(
      bodyConfig.collisionFullMin.x,
      probeHeight,
      bodyConfig.collisionFullMin.z,
    ),
    new THREE.Vector3(
      bodyConfig.collisionFullMax.x,
      probeHeight,
      bodyConfig.collisionFullMin.z,
    ),
    new THREE.Vector3(
      bodyConfig.collisionFullMin.x,
      probeHeight,
      bodyConfig.collisionFullMax.z,
    ),
    new THREE.Vector3(
      bodyConfig.collisionFullMax.x,
      probeHeight,
      bodyConfig.collisionFullMax.z,
    ),
    new THREE.Vector3(0, probeHeight, bodyConfig.collisionFullMin.z),
    new THREE.Vector3(0, probeHeight, bodyConfig.collisionFullMax.z),
    new THREE.Vector3(bodyConfig.collisionFullMin.x, probeHeight, 0),
    new THREE.Vector3(bodyConfig.collisionFullMax.x, probeHeight, 0),
  ];

  for (const offset of probeOffsets) {
    TMP_CONTACT_OFFSET.copy(offset).applyQuaternion(carRoot.quaternion);
    TMP_ORIGIN.copy(carRoot.position).add(TMP_CONTACT_OFFSET);
    const hit = trackFloorSampler.raycast(TMP_ORIGIN, TMP_DIRECTION, {
      rayDistance: clearance + 0.2,
      minUpDot: -0.9,
      maxUpDot: 0.35,
    });

    if (!hit) {
      continue;
    }

    const alongNormal = state.velocity.dot(hit.normal);
    if (alongNormal >= 0) {
      continue;
    }

    const penetration = clearance - hit.distance;
    if (penetration > -0.02) {
      TMP_PUSH.copy(hit.normal).multiplyScalar(
        Math.max(penetration, 0) + WALL_COLLISION_SKIN,
      );
      carRoot.position.add(TMP_PUSH);
      state.velocity.addScaledVector(hit.normal, -alongNormal);
      state.cameraShake = Math.min(
        state.cameraShake + Math.abs(alongNormal) * 0.04,
        1.4,
      );
      TMP_DIRECTION.set(state.velocity.x, 0, state.velocity.z);
      if (TMP_DIRECTION.lengthSq() > 1e-8) {
        TMP_DIRECTION.normalize();
      }
    }
  }
}

function resetVehicle(
  carRoot,
  spawnPosition,
  spawnQuaternion,
  wheelLayout,
  state,
  trackFloorSampler,
  spawnLift,
) {
  carRoot.position.copy(spawnPosition);
  carRoot.quaternion.copy(spawnQuaternion);
  state.velocity.set(0, 0, 0);
  state.verticalVelocity = 0;
  state.steerState = 0;
  state.steerVisual = 0;
  state.yaw = extractYaw(spawnQuaternion);
  state.grounded = false;
  state.cameraShake = 0;
  state.previousPosition.copy(spawnPosition);
  state.previousYaw = state.yaw;

  applyGroundContact(
    carRoot,
    trackFloorSampler,
    wheelLayout,
    state,
    spawnLift,
    true,
  );
}

function updateCameraState(state, carRoot, dt, forwardSpeed, lateralSpeed) {
  const euler = TMP_EULER.setFromQuaternion(carRoot.quaternion, "YXZ");
  const yawDelta = normalizeAngle(state.yaw - state.previousYaw);

  state.cameraState.forwardSpeed = forwardSpeed;
  state.cameraState.heading = state.yaw;
  state.cameraState.lateralSpeed = lateralSpeed;
  state.cameraState.horizontalSpeed = horizontalSpeed(state.velocity);
  state.cameraState.verticalVelocity =
    (carRoot.position.y - state.previousPosition.y) / Math.max(dt, 1e-4);
  state.cameraState.yawRate = yawDelta / Math.max(dt, 1e-4);
  state.cameraState.roll = euler.z;
  state.cameraState.pitch = euler.x;
  state.cameraState.surfaceGrip = state.surfaceGrip;
  state.cameraState.grounded = state.grounded;
  state.cameraState.cameraShake = state.cameraShake;

  state.previousPosition.copy(carRoot.position);
  state.previousYaw = state.yaw;
}

function moveToward(current, target, maxStep) {
  if (Math.abs(target - current) <= maxStep) {
    return target;
  }

  return current + Math.sign(target - current) * maxStep;
}

function dampTowardZero(value, amount) {
  if (Math.abs(value) <= amount) {
    return 0;
  }

  return value - Math.sign(value) * amount;
}

function getYawForward(yaw, target) {
  return target.set(0, 0, -1).applyAxisAngle(WORLD_UP, yaw).normalize();
}

function getYawRight(forward, target) {
  return target.crossVectors(forward, WORLD_UP).normalize();
}

function horizontalSpeed(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

function extractYaw(quaternion) {
  TMP_EULER.setFromQuaternion(quaternion, "YXZ");
  return TMP_EULER.y;
}

function normalizeAngle(angle) {
  let wrapped = angle;

  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }

  while (wrapped < -Math.PI) {
    wrapped += Math.PI * 2;
  }

  return wrapped;
}

async function loadBodyConfig(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load body config: ${response.status}`);
  }

  return parseBodyConfig(await response.text());
}

async function loadTireConfig(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load tire config: ${response.status}`);
  }

  return parseTireConfig(await response.text());
}

function parseBodyConfig(text) {
  return {
    collisionFullMin:
      parseIniVector(text, "CollisionFullMin") ??
      DEFAULT_BODY_CONFIG.collisionFullMin.clone(),
    collisionFullMax:
      parseIniVector(text, "CollisionFullMax") ??
      DEFAULT_BODY_CONFIG.collisionFullMax.clone(),
    collisionBottomMin:
      parseIniVector(text, "CollisionBottomMin") ??
      DEFAULT_BODY_CONFIG.collisionBottomMin.clone(),
    collisionBottomMax:
      parseIniVector(text, "CollisionBottomMax") ??
      DEFAULT_BODY_CONFIG.collisionBottomMax.clone(),
    collisionTopMin:
      parseIniVector(text, "CollisionTopMin") ??
      DEFAULT_BODY_CONFIG.collisionTopMin.clone(),
    collisionTopMax:
      parseIniVector(text, "CollisionTopMax") ??
      DEFAULT_BODY_CONFIG.collisionTopMax.clone(),
  };
}

function parseTireConfig(text) {
  const zFriction = parseIniArray(text, "ZFriction", 2);
  const xFriction = parseIniArray(text, "XFriction", 2);

  return {
    rollingResistance:
      parseIniNumber(text, "RollingResistance") ??
      DEFAULT_TIRE_CONFIG.rollingResistance,
    inducedDragCoeff:
      parseIniNumber(text, "InducedDragCoeff") ??
      DEFAULT_TIRE_CONFIG.inducedDragCoeff,
    pneumaticTrail:
      parseIniNumber(text, "PneumaticTrail") ??
      DEFAULT_TIRE_CONFIG.pneumaticTrail,
    pneumaticOffset:
      parseIniNumber(text, "PneumaticOffset") ??
      DEFAULT_TIRE_CONFIG.pneumaticOffset,
    zFrictionBase: zFriction?.[0] ?? DEFAULT_TIRE_CONFIG.zFrictionBase,
    zFrictionSlope: zFriction?.[1] ?? DEFAULT_TIRE_CONFIG.zFrictionSlope,
    xFrictionBase: xFriction?.[0] ?? DEFAULT_TIRE_CONFIG.xFrictionBase,
    xFrictionSlope: xFriction?.[1] ?? DEFAULT_TIRE_CONFIG.xFrictionSlope,
  };
}

function parseIniNumber(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*([-+]?\\d*\\.?\\d+)`));
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function parseIniArray(text, key, count) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));

  if (!match) {
    return null;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length >= count ? values.slice(0, count) : null;
}

function parseIniVector(text, key) {
  const values = parseIniArray(text, key, 3);

  if (!values) {
    return null;
  }

  return new THREE.Vector3(values[0], values[1], values[2]);
}
