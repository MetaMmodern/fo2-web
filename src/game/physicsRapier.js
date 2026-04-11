import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import { loadDrivingConfig } from "./drivingConfig";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const MAX_FRAME_DELTA = 0.1;
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_VEC = new THREE.Vector3();
const TMP_VEC_B = new THREE.Vector3();
const TMP_VEC_C = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();
const ENABLE_STATIC_WORLD_COLLISION = true;
const ENABLE_DIRECT_DRIVE_DEBUG = true;

export async function createDrivingSimulation({
  carId,
  carRoot,
  assetUrls,
  input,
  collisionRoot = null,
}) {
  await RAPIER.init();

  const rawConfig = await loadDrivingConfig({ assetUrls });
  const config = buildRapierVehicleConfig(rawConfig, carRoot);
  const world = new RAPIER.World({ x: 0, y: -config.gravity, z: 0 });
  world.timestep = FIXED_DT;
  world.numSolverIterations = 8;
  world.numInternalPgsIterations = 2;
  world.maxCcdSubsteps = 1;

  const staticWorldDebug = buildStaticWorldFromRoot(world, collisionRoot);

  const spawnTranslation = carRoot.position
    .clone()
    .add(config.bodyOffset)
    .add(new THREE.Vector3(0, computeSpawnLift(config), 0));
  const spawnRotation = carRoot.quaternion.clone();
  const chassis = createChassisBody(world, config, spawnTranslation, spawnRotation);
  const cameraState = createCameraState();
  const debugState = createDebugState();
  debugState.staticWorld = staticWorldDebug;
  let accumulator = 0;
  let previousResetPressed = false;

  syncCarRootFromBody(carRoot, chassis, config);
  updateWheelVisuals(config, chassis, FIXED_DT);
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
        stepVehicle(world, chassis, config, input, debugState);
        world.step();
        accumulator -= FIXED_DT;
        stepCount += 1;
      }

      if (stepCount > 0) {
        syncCarRootFromBody(carRoot, chassis, config);
        updateWheelVisuals(config, chassis, FIXED_DT);
      }

      updateCameraState(cameraState, chassis, carRoot);
      updateDebugState(debugState, chassis, config);
    },
    speedKph() {
      return horizontalSpeed(rapierVectorToThree(chassis.linvel(), TMP_VEC)) * 3.6;
    },
    getCameraState() {
      return cameraState;
    },
    getLightState() {
      return {
        braking:
          Math.max(input?.brake ?? 0, input?.handbrake ?? 0) > 0.1,
        reversing: false,
      };
    },
    getDebugState() {
      return debugState;
    },
    dispose() {
      world.free();
    },
  };
}

function buildRapierVehicleConfig(rawConfig, carRoot) {
  const bodyCollision = rawConfig.bodyCollision ?? {};
  const car = rawConfig.car ?? {};
  const body = rawConfig.body ?? {};
  const engine = rawConfig.engine ?? {};
  const bounds = resolveBodyBounds(bodyCollision, carRoot);
  const wheelMetrics = resolveWheelLayout(carRoot);
  const wheelLayout = buildWheelVisualLayout(carRoot);

  return {
    gravity: 18,
    massKg:
      Math.max(
        Number.parseFloat(car.Mass ?? 980) *
          Number.parseFloat(car.MassFudgeFactor ?? 1),
        600,
      ),
    bodyHalfExtents: bounds.halfExtents,
    bodyOffset: bounds.offset,
    wheelbase: wheelMetrics.wheelbase,
    trackWidth: wheelMetrics.trackWidth,
    peakTorque: Math.max(Number.parseFloat(engine.PeakTorque ?? 210), 120),
    brakeTorque: Math.max(Number.parseFloat(body.BrakeTorque ?? 5200), 3200),
    handBrakeTorque: Math.max(Number.parseFloat(body.HandBrakeTorque ?? 5200), 3200),
    tireTurnAngleInDeg: Math.max(Number.parseFloat(body.TireTurnAngleIn ?? 36), 20),
    downforceConst: Math.max(Number.parseFloat(body.DownforceConst ?? 2), 0.5),
    wheelLayout,
    visualRideHeight: computeVisualRideHeight(bounds, wheelLayout),
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

function buildWheelVisualLayout(carRoot) {
  const wheelNames = [
    { name: "placeholder_tire_fl", front: true, side: -1 },
    { name: "placeholder_tire_fr", front: true, side: 1 },
    { name: "placeholder_tire_rl", front: false, side: -1 },
    { name: "placeholder_tire_rr", front: false, side: 1 },
  ];

  return wheelNames.map((wheel) => {
    const anchor = carRoot.getObjectByName(wheel.name);
    const tire = carRoot.getObjectByName(`${wheel.name}_tire`);
    const tireRadius = estimateTireRadius(tire);

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
  return chassisBottomLocal - lowestWheelPoint;
}

function buildStaticWorldFromRoot(world, root) {
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
  const merged = extractMergedWorldTrimesh(root);

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
    .setRestitution(0);
  world.createCollider(colliderDesc);

  return {
    enabled: true,
    colliderCount: 1,
    meshCount: merged.meshCount,
    triangleCount: merged.indices.length / 3,
    boundsMin: merged.bounds.min.toArray(),
    boundsMax: merged.bounds.max.toArray(),
  };
}

function extractMergedWorldTrimesh(root) {
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

function createChassisBody(world, config, translation, rotation) {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(translation.x, translation.y, translation.z)
    .setRotation(rotation)
    .setAdditionalMass(config.massKg)
    .setLinearDamping(0.35)
    .setAngularDamping(1.6)
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
    .setFriction(0.9)
    .setRestitution(0)
    .setContactSkin(0.02)
    .setDensity(0);
  world.createCollider(colliderDesc, body);
  body.setAdditionalMassProperties(
    config.massKg,
    { x: 0, y: -config.bodyHalfExtents.y * 0.35, z: 0 },
    {
      x: config.massKg * 1.4,
      y: config.massKg * 1.8,
      z: config.massKg * 1.4,
    },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );
  return body;
}

function stepVehicle(world, chassis, config, input, debugState) {
  const throttle = clamp(input?.throttle ?? 0, 0, 1);
  const brake = clamp(input?.brake ?? 0, 0, 1);
  const handbrake = clamp(input?.handbrake ?? 0, 0, 1);
  const steer = clamp(input?.steer ?? 0, -1, 1);
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
  const groundHit = sampleGround(world, chassis, config.bodyHalfExtents.y + 0.9);
  const surfaceNormal = groundHit
    ? rapierVectorToThree(groundHit.normal, TMP_VEC_C).normalize()
    : WORLD_UP;
  const grounded = Boolean(groundHit && groundHit.timeOfImpact <= config.bodyHalfExtents.y + 0.5);

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

  const driveDir = TMP_FORWARD.clone().projectOnPlane(surfaceNormal).normalize();
  if (driveDir.lengthSq() < 1e-6) {
    driveDir.copy(TMP_FORWARD).setY(0).normalize();
  }

  const engineForce =
    throttle *
    (config.peakTorque * 26 + config.massKg * 5) *
    (grounded ? 1 : 0.35);
  if (engineForce > 0) {
    chassis.addForce(vectorFromThree(driveDir.multiplyScalar(engineForce)), true);
  }

  const brakeForce =
    (brake * config.brakeTorque * 1.6 + handbrake * config.handBrakeTorque * 1.2) *
    Math.min(speedHorizontal / 4, 1);
  if (brakeForce > 0 && speedHorizontal > 0.05) {
    const brakingVector = linvel.clone().setY(0).normalize().multiplyScalar(-brakeForce);
    chassis.addForce(vectorFromThree(brakingVector), true);
  }

  const lateralGripScale = handbrake > 0.1 ? 3.5 : 8.5;
  const lateralGripForce = TMP_RIGHT.clone().multiplyScalar(
    -speedRight * config.massKg * lateralGripScale,
  );
  chassis.addForce(vectorFromThree(lateralGripForce), true);

  const dragForce = linvel.clone().setY(0).multiplyScalar(
    -(0.7 + config.downforceConst * 0.08 * Math.max(speedHorizontal, 0.1)),
  );
  chassis.addForce(vectorFromThree(dragForce), true);

  if (grounded) {
    const steerAuthority = clamp(speedHorizontal / 10, 0.1, 1);
    const steerTorqueMag =
      steer *
      steerAuthority *
      config.massKg *
      THREE.MathUtils.degToRad(config.tireTurnAngleInDeg) *
      3.2 *
      Math.sign(Math.abs(speedForward) > 0.5 ? speedForward : throttle - brake || 1);
    const steerAxis = surfaceNormal.clone().normalize().multiplyScalar(steerTorqueMag);
    chassis.addTorque(vectorFromThree(steerAxis), true);
  }

  const targetUp = grounded ? surfaceNormal.clone().normalize() : WORLD_UP;
  const uprightTorque = TMP_UP.clone()
    .cross(targetUp)
    .multiplyScalar(config.massKg * (grounded ? 22 : 10))
    .add(angvel.multiplyScalar(-config.massKg * 0.9));
  chassis.addTorque(vectorFromThree(uprightTorque), true);

  debugState.grounded = grounded;
  debugState.groundToi = groundHit?.timeOfImpact ?? null;
  debugState.throttle = throttle;
  debugState.brake = brake;
  debugState.handbrake = handbrake;
  debugState.steer = steer;
  debugState.engineForce = engineForce;
  debugState.brakeForce = brakeForce;
  debugState.speedForward = speedForward;
  debugState.speedRight = speedRight;
  debugState.speedHorizontal = speedHorizontal;
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

function updateWheelVisuals(config, chassis, dt) {
  const speed = horizontalSpeed(rapierVectorToThree(chassis.linvel(), TMP_VEC));
  const yawRate = chassis.angvel().y;

  for (const wheel of config.wheelLayout) {
    if (!wheel.tire) {
      continue;
    }

    wheel.steerAngle = wheel.front ? clamp(yawRate * 0.45, -0.6, 0.6) : 0;
    wheel.spinAngle += speed * dt / Math.max(wheel.tireRadius, 0.1);

    wheel.tire.position.copy(wheel.tireBasePosition);
    TMP_QUAT.setFromAxisAngle(WORLD_UP, wheel.steerAngle);
    TMP_QUAT_B.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -wheel.spinAngle);
    wheel.tire.quaternion.copy(wheel.tireBaseQuaternion);
    wheel.tire.quaternion.multiply(TMP_QUAT);
    wheel.tire.quaternion.multiply(TMP_QUAT_B);
  }
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
    mode: "force",
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
    chassisPosition: new THREE.Vector3(),
    chassisVelocity: new THREE.Vector3(),
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
