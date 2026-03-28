import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const PHYSICS_TIMESTEP = 1 / 60;
const DEFAULT_BODY_CONFIG = {
  collisionFullMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionFullMax: new THREE.Vector3(0.878, 1.084, 1.835),
  collisionBottomMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionBottomMax: new THREE.Vector3(0.878, 0.705, 1.835),
};
const DEFAULT_TIRE_CONFIG = {
  zStiffness: [0, 12540, 0],
  xStiffness: [16280, 3.4, 0],
  zFriction: [1.0, -0.0076],
  xFriction: [1.121, -0.0076],
};

export async function createDrivingSimulation({
  trackRoot,
  carRoot,
  assetUrls,
  input,
}) {
  await RAPIER.init();

  const [bodyConfig, tireConfig] = await Promise.all([
    loadBodyConfig(assetUrls.bodyConfig).catch(() => DEFAULT_BODY_CONFIG),
    loadTireConfig(assetUrls.tireConfig).catch(() => DEFAULT_TIRE_CONFIG),
  ]);

  const world = new RAPIER.World({ x: 0, y: -16, z: 0 });
  world.timestep = PHYSICS_TIMESTEP;
  world.numSolverIterations = 8;
  world.maxCcdSubsteps = 2;

  createTrackColliders(world, trackRoot);

  const chassis = createChassisRigidBody(world, carRoot, bodyConfig);
  createChassisCollider(world, chassis, bodyConfig, tireConfig);
  snapChassisToGround(world, chassis, bodyConfig);
  const spawnState = {
    translation: { ...chassis.translation() },
    rotation: { ...chassis.rotation() },
  };
  const visualRideHeight = Math.max(bodyConfig.collisionBottomMin.y, 0.16);
  let accumulator = 0;
  let previousResetPressed = false;

  return {
    update(deltaSeconds) {
      accumulator += Math.min(deltaSeconds, 0.1);

      while (accumulator >= PHYSICS_TIMESTEP) {
        applyDrivingControls(chassis, input, tireConfig);
        world.step();
        accumulator -= PHYSICS_TIMESTEP;
      }

      syncVisualCarToPhysics(carRoot, chassis, visualRideHeight);

      const resetPressed = Boolean(input?.resetPressed);

      if (
        (resetPressed && !previousResetPressed) ||
        chassis.translation().y < -15
      ) {
        resetVehicle(chassis, spawnState);
      }

      previousResetPressed = resetPressed;
    },
    speedKph() {
      const velocity = chassis.linvel();
      return Math.hypot(velocity.x, velocity.z) * 3.6;
    },
  };
}

function createTrackColliders(world, trackRoot) {
  const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  trackRoot.updateWorldMatrix(true, true);
  trackRoot.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute("position")) {
      return;
    }

    const colliderDesc = buildTriMeshColliderDesc(object);

    if (!colliderDesc) {
      return;
    }

    colliderDesc.setFriction(0.95);
    world.createCollider(colliderDesc, fixedBody);
  });
}

function buildTriMeshColliderDesc(mesh) {
  const geometry = mesh.geometry;
  const positionAttribute = geometry.getAttribute("position");

  if (!positionAttribute || positionAttribute.count < 3) {
    return null;
  }

  const vertices = new Float32Array(positionAttribute.count * 3);
  const matrixWorld = mesh.matrixWorld.clone();
  const tempVector = new THREE.Vector3();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    tempVector.fromBufferAttribute(positionAttribute, index).applyMatrix4(matrixWorld);
    vertices[index * 3] = tempVector.x;
    vertices[index * 3 + 1] = tempVector.y;
    vertices[index * 3 + 2] = tempVector.z;
  }

  let indices;

  if (geometry.index) {
    indices = new Uint32Array(geometry.index.array);
  } else {
    indices = new Uint32Array(positionAttribute.count);

    for (let index = 0; index < positionAttribute.count; index += 1) {
      indices[index] = index;
    }
  }

  return RAPIER.ColliderDesc.trimesh(vertices, indices);
}

function createChassisRigidBody(world, carRoot, bodyConfig) {
  const translation = carRoot.position;
  const rotation = carRoot.quaternion;
  const lift = Math.max(bodyConfig.collisionBottomMax.y, 1) + 0.75;

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(translation.x, translation.y + lift, translation.z)
    .setRotation({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    })
    .setLinearDamping(0.45)
    .setAngularDamping(2.4)
    .setCanSleep(false)
    .setCcdEnabled(true)
    .setAdditionalMass(1200);

  const rigidBody = world.createRigidBody(bodyDesc);
  rigidBody.setEnabledRotations(false, true, false, true);
  rigidBody.enableCcd(true);

  return rigidBody;
}

function createChassisCollider(world, chassis, bodyConfig, tireConfig) {
  const centerX =
    (bodyConfig.collisionBottomMin.x + bodyConfig.collisionBottomMax.x) * 0.5;
  const centerZ =
    (bodyConfig.collisionBottomMin.z + bodyConfig.collisionBottomMax.z) * 0.5;
  const center = bodyConfig.collisionBottomMin
    .clone()
    .add(bodyConfig.collisionBottomMax)
    .multiplyScalar(0.5);
  const halfExtents = bodyConfig.collisionBottomMax
    .clone()
    .sub(bodyConfig.collisionBottomMin)
    .multiplyScalar(0.5);
  const colliderDesc = RAPIER.ColliderDesc.cuboid(
    halfExtents.x,
    halfExtents.y,
    halfExtents.z,
  )
    .setTranslation(centerX, halfExtents.y, centerZ)
    .setFriction(Math.max(tireConfig.xFriction?.[0] ?? 1.1, 0.9))
    .setRestitution(0)
    .setMass(1200);

  return world.createCollider(colliderDesc, chassis);
}

function applyDrivingControls(chassis, input, tireConfig) {
  const throttle = input?.throttle ?? 0;
  const brake = input?.brake ?? 0;
  const steer = input?.steer ?? 0;
  const handbrake = input?.handbrake ?? 0;
  const rotation = chassis.rotation();
  const velocity = chassis.linvel();
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(
      new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
    )
    .setY(0);

  if (forward.lengthSq() < 1e-4) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const horizontalVelocity = new THREE.Vector3(velocity.x, 0, velocity.z);
  const forwardSpeed = horizontalVelocity.dot(forward);
  const lateralSpeed = horizontalVelocity.dot(right);
  const rollingResistance = (tireConfig.rollingResistance ?? 0.5) * 0.6;
  const maxForwardSpeed = 36;
  const maxReverseSpeed = 18;
  const acceleration = 26;
  const reverseAcceleration = 22;
  const serviceBrake = 42;
  const handbrakeGripLoss = handbrake > 0 ? 0.94 : 0.78;
  const longitudinalDrag = 0.024 + rollingResistance * 0.012;
  let targetForwardSpeed = forwardSpeed;

  if (throttle > 0) {
    targetForwardSpeed = Math.min(
      forwardSpeed + acceleration * throttle * PHYSICS_TIMESTEP,
      maxForwardSpeed,
    );
  } else if (brake > 0) {
    if (forwardSpeed > 0.75) {
      targetForwardSpeed = Math.max(
        forwardSpeed - serviceBrake * brake * PHYSICS_TIMESTEP,
        0,
      );
    } else {
      targetForwardSpeed = Math.max(
        forwardSpeed - reverseAcceleration * brake * PHYSICS_TIMESTEP,
        -maxReverseSpeed,
      );
    }
  } else {
    targetForwardSpeed *= 1 - longitudinalDrag;
  }

  const correctedVelocity = new THREE.Vector3()
    .addScaledVector(forward, targetForwardSpeed)
    .addScaledVector(right, -lateralSpeed * handbrakeGripLoss)
    .addScaledVector(forward, 0);
  chassis.setLinvel(
    { x: correctedVelocity.x, y: velocity.y, z: correctedVelocity.z },
    true,
  );

  const steerStrength = Math.min(Math.abs(targetForwardSpeed) / 7, 1) * 2.2;
  const driftBoost = handbrake > 0 ? 1.4 : 1;
  chassis.setAngvel(
    { x: 0, y: steer * steerStrength * driftBoost, z: 0 },
    true,
  );
}

function syncVisualCarToPhysics(carRoot, chassis, visualRideHeight = 0) {
  const translation = chassis.translation();
  const rotation = chassis.rotation();

  carRoot.position.set(
    translation.x,
    translation.y + visualRideHeight,
    translation.z,
  );
  carRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

function resetVehicle(chassis, spawnState) {
  chassis.setTranslation(spawnState.translation, true);
  chassis.setRotation(spawnState.rotation, true);
  chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
  chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

function snapChassisToGround(world, chassis, bodyConfig) {
  const translation = chassis.translation();
  const ray = new RAPIER.Ray(
    { x: translation.x, y: translation.y + 12, z: translation.z },
    { x: 0, y: -1, z: 0 },
  );
  const hit = world.castRay(ray, 40, true, undefined, undefined, undefined, chassis);

  if (!hit) {
    return;
  }

  const clearance = 0.04;
  const hitPointY = ray.pointAt(hit.timeOfImpact).y;
  chassis.setTranslation(
    {
      x: translation.x,
      y: hitPointY + clearance,
      z: translation.z,
    },
    true,
  );
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
      parseIniVector(text, "CollisionFullMin") ?? DEFAULT_BODY_CONFIG.collisionFullMin.clone(),
    collisionFullMax:
      parseIniVector(text, "CollisionFullMax") ?? DEFAULT_BODY_CONFIG.collisionFullMax.clone(),
    collisionBottomMin:
      parseIniVector(text, "CollisionBottomMin") ??
      DEFAULT_BODY_CONFIG.collisionBottomMin.clone(),
    collisionBottomMax:
      parseIniVector(text, "CollisionBottomMax") ??
      DEFAULT_BODY_CONFIG.collisionBottomMax.clone(),
  };
}

function parseTireConfig(text) {
  return {
    rollingResistance: parseIniNumber(text, "RollingResistance") ?? 0.5,
    zStiffness: parseIniArray(text, "ZStiffness") ?? DEFAULT_TIRE_CONFIG.zStiffness.slice(),
    xStiffness: parseIniArray(text, "XStiffness") ?? DEFAULT_TIRE_CONFIG.xStiffness.slice(),
    zFriction: parseIniArray(text, "ZFriction") ?? DEFAULT_TIRE_CONFIG.zFriction.slice(),
    xFriction: parseIniArray(text, "XFriction") ?? DEFAULT_TIRE_CONFIG.xFriction.slice(),
  };
}

function parseIniVector(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));

  if (!match) {
    return null;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 3) {
    return null;
  }

  return new THREE.Vector3(values[0], values[1], values[2]);
}

function parseIniArray(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));

  if (!match) {
    return null;
  }

  return match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseIniNumber(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*([-+]?\\d*\\.?\\d+)`));
  return match ? Number.parseFloat(match[1]) : null;
}
