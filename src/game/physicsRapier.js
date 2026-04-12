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
const TMP_VEC_D = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_QUAT_B = new THREE.Quaternion();
const TMP_QUAT_C = new THREE.Quaternion();
const TMP_MAT = new THREE.Matrix4();
const TMP_MAT_B = new THREE.Matrix4();
const ENABLE_STATIC_WORLD_COLLISION = true;
const ENABLE_DIRECT_DRIVE_DEBUG = false;

export async function createDrivingSimulation({
  carId,
  carRoot,
  assetUrls,
  input,
  collisionRoot = null,
  dynamicObjects = [],
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
        stepVehicle(world, chassis, vehicleController, config, input, debugState);
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
  const suspension = rawConfig.suspension ?? {};
  const steering = rawConfig.steering ?? {};
  const bounds = resolveBodyBounds(bodyCollision, carRoot);
  const wheelMetrics = resolveWheelLayout(carRoot);
  const wheelLayout = buildWheelVisualLayout(carRoot, suspension);

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
    frontTraction: Boolean(body.FrontTraction),
    rearTraction: body.RearTraction !== false,
    peakTorque: Math.max(Number.parseFloat(engine.PeakTorque ?? 210), 120),
    brakeTorque: Math.max(Number.parseFloat(body.BrakeTorque ?? 5200), 3200),
    handBrakeTorque: Math.max(Number.parseFloat(body.HandBrakeTorque ?? 5200), 3200),
    brakeBalance: clamp(pickScalar(body.BrakeBalance, 0.6), 0.1, 0.9),
    tireTurnAngleInDeg: Math.max(Number.parseFloat(body.TireTurnAngleIn ?? 36), 20),
    tireTurnAngleOutDeg: Math.max(Number.parseFloat(body.TireTurnAngleOut ?? body.TireTurnAngleIn ?? 38), 20),
    downforceConst: Math.max(Number.parseFloat(body.DownforceConst ?? 2), 0.5),
    aeroDrag: pickVec2(body.AeroDrag, [0.3, 0.3]),
    steering: {
      Sensitivity: pickScalar(steering.Sensitivity, 0.5),
      MinAnalogSpeed: pickScalar(steering.MinAnalogSpeed, 0.1),
      MaxAnalogSpeed: pickScalar(steering.MaxAnalogSpeed, 2),
      CenteringSpeed: pickScalar(steering.CenteringSpeed, 0.9),
      DigitalThreshold: pickScalar(steering.DigitalThreshold, 0.2),
      MinDigitalSpeed: pickScalar(steering.MinDigitalSpeed, 1),
      MaxDigitalSpeed: pickScalar(steering.MaxDigitalSpeed, 2.5),
      SteeringLimitRate: pickVec4(steering.SteeringLimitRate, [1, 0.8, 0.5, 0.25]),
      SteeringLimitSpeed: pickVec4(steering.SteeringLimitSpeed, [20, 40, 100, 250]),
    },
    frontSuspension: {
      defaultCompression: Math.max(
        Number.parseFloat(suspension.FrontDefaultCompression ?? 0.08),
        0,
      ),
      restLength: Math.max(
        Number.parseFloat(suspension.FrontRestLength ?? 0.24) -
          Number.parseFloat(suspension.FrontDefaultCompression ?? 0.08),
        0.08,
      ),
      maxTravel: Math.max(Number.parseFloat(suspension.FrontMaxLength ?? 0.65), 0.12),
      stiffness: Math.max(Number.parseFloat(suspension.FrontZStiffness ?? 18), 14),
      compression: Math.max(Number.parseFloat(suspension.FrontBumpDamp ?? 2.4), 1.4),
      relaxation: Math.max(Number.parseFloat(suspension.FrontReboundDamp ?? 3.2), 1.8),
    },
    rearSuspension: {
      defaultCompression: Math.max(
        Number.parseFloat(suspension.RearDefaultCompression ?? 0.1),
        0,
      ),
      restLength: Math.max(
        Number.parseFloat(suspension.RearRestLength ?? 0.26) -
          Number.parseFloat(suspension.RearDefaultCompression ?? 0.1),
        0.08,
      ),
      maxTravel: Math.max(Number.parseFloat(suspension.RearMaxLength ?? 0.65), 0.12),
      stiffness: Math.max(Number.parseFloat(suspension.RearZStiffness ?? 20), 14),
      compression: Math.max(Number.parseFloat(suspension.RearBumpDamp ?? 2.2), 1.4),
      relaxation: Math.max(Number.parseFloat(suspension.RearReboundDamp ?? 3), 1.8),
    },
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

function buildWheelVisualLayout(carRoot, suspension) {
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
    .setRestitution(0);
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
        mass: 8,
        linearDamping: 0.28,
        angularDamping: 0.32,
        friction: 0.76,
        restitution: 0.08,
      };
    case "plastic_light":
    case "window":
    case "fence_wood":
    case "fence_metal":
    case "explosive_gaspump":
    case "metal_lightpole":
    case "metal_structure_tilt":
    case "metal_gate_180":
      return {
        bodyType: "fixed",
        releaseOnImpact: true,
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

  if (chassisSpeed < 0.5) {
    return;
  }

  for (const entry of dynamicObjectState) {
    if (!entry.dormant || !entry.body || !entry.collider) {
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
      .multiplyScalar(Math.max(entry.category.mass * 0.18, 1.5));
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
    .setFriction(0.08)
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
    .setDensity(0);
  world.createCollider(frontInteractionDesc, body);

  return body;
}

function createVehicleController(world, chassis, config) {
  const controller = world.createVehicleController(chassis);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;

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
    controller.setWheelFrictionSlip(wheelIndex, wheel.front ? 2.1 : 2.4);
    controller.setWheelSideFrictionStiffness(wheelIndex, wheel.front ? 2.1 : 1.6);
  });

  return controller;
}

function stepVehicle(world, chassis, vehicleController, config, input, debugState) {
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
  updateSteeringState(debugState, config, rawSteer, rawHandbrake, speedHorizontalNow(speedForwardNow, chassis), FIXED_DT);

  const throttle = debugState.throttleAxis;
  const brake = debugState.brakeAxis;
  const handbrake = debugState.handbrakeAxis;
  const steer = debugState.steerState;
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
  const engineForceTotal = throttle * config.peakTorque * -42;
  const frontBrake = brake * config.brakeTorque * config.brakeBalance;
  const rearBrake =
    brake * config.brakeTorque * (1 - config.brakeBalance) +
    handbrake * config.handBrakeTorque;
  const frontSteerAngles = computeFrontWheelSteerAngles(steer, config);

  config.wheelLayout.forEach((wheel, wheelIndex) => {
    const driven =
      (wheel.front && config.frontTraction) ||
      (!wheel.front && config.rearTraction);
    let steerAngle = 0;
    if (wheel.front) {
      steerAngle = wheel.side < 0 ? frontSteerAngles.left : frontSteerAngles.right;
    }
    vehicleController.setWheelSteering(wheelIndex, steerAngle);
    vehicleController.setWheelEngineForce(
      wheelIndex,
      driven ? engineForceTotal * 0.5 : 0,
    );
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

  const dragForce = linvel
    .clone()
    .set(0, 0, 0)
    .addScaledVector(
      TMP_FORWARD,
      -Math.sign(speedForward) * speedForward * speedForward * config.aeroDrag[0] * 0.8,
    )
    .addScaledVector(
      TMP_RIGHT,
      -Math.sign(speedRight) * speedRight * speedRight * config.aeroDrag[1] * 1.4,
    );
  chassis.addForce(vectorFromThree(dragForce), true);
  chassis.addForce(
    { x: 0, y: -speedHorizontal * speedHorizontal * config.downforceConst * 0.012, z: 0 },
    true,
  );

  const targetUp = grounded ? surfaceNormal.clone().normalize() : WORLD_UP;
  const uprightTorque = TMP_UP.clone()
    .cross(targetUp)
    .multiplyScalar(config.massKg * (grounded ? 5.5 : 2.5))
    .add(angvel.multiplyScalar(-config.massKg * 0.22));
  chassis.addTorque(vectorFromThree(uprightTorque), true);

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

  debugState.grounded = grounded;
  debugState.groundToi = groundHit?.timeOfImpact ?? null;
  debugState.throttle = rawThrottle;
  debugState.brake = rawBrake;
  debugState.handbrake = rawHandbrake;
  debugState.steer = rawSteer;
  debugState.engineForce = engineForceTotal;
  debugState.brakeForce = frontBrake + rearBrake;
  debugState.speedForward = speedForward;
  debugState.speedRight = speedRight;
  debugState.speedHorizontal = speedHorizontal;
  debugState.wheelContacts = wheelContacts;
  debugState.forwardImpulse = forwardImpulse;
  debugState.suspensionForce = suspensionForce;
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
    // TODO: Rapier vehicle wheel visuals still need an explicit airborne free-spin path.
    // Current runtime observation: driven wheels should keep spinning in the air under throttle,
    // but the present prototype does not model that yet.
    wheel.spinAngle = vehicleController.wheelRotation(wheelIndex) ?? wheel.spinAngle;
    if (!Number.isFinite(wheel.spinAngle)) {
      wheel.spinAngle += speed * dt / Math.max(wheel.tireRadius, 0.1);
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
  const steerLimit = computeSteeringLimit(config.steering, horizontalKph);
  const steerTarget = rawSteer * steerLimit * (rawHandbrake > 0.1 ? 1.1 : 1);
  const digitalInput = Math.abs(rawSteer) >= config.steering.DigitalThreshold;

  if (Math.abs(rawSteer) < 1e-3) {
    const centeringRate = Math.max(config.steering.CenteringSpeed * 6, 1);
    debugState.steerState = dampToward(debugState.steerState ?? 0, 0, centeringRate, dt);
  } else {
    const minSpeed = digitalInput
      ? config.steering.MinDigitalSpeed
      : config.steering.MinAnalogSpeed;
    const maxSpeed = digitalInput
      ? config.steering.MaxDigitalSpeed
      : config.steering.MaxAnalogSpeed;
    const rate =
      THREE.MathUtils.lerp(minSpeed, maxSpeed, Math.abs(rawSteer)) *
      (1 + Math.abs(steerTarget - (debugState.steerState ?? 0)) * 0.35);
    debugState.steerState = moveToward(
      debugState.steerState ?? 0,
      steerTarget,
      rate * dt,
    );
  }

  debugState.steerState = clamp(debugState.steerState ?? 0, -1, 1);
}

function computeFrontWheelSteerAngles(steerState, config) {
  const steerAmount = Math.abs(steerState);
  if (steerAmount < 1e-4) {
    return { left: 0, right: 0 };
  }

  const tireTurnIn = THREE.MathUtils.degToRad(config.tireTurnAngleInDeg);
  const tireTurnOut = THREE.MathUtils.degToRad(config.tireTurnAngleOutDeg);
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
    throttleAxis: 0,
    brakeAxis: 0,
    handbrakeAxis: 0,
    reverseLatched: false,
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
    wheelContacts: 0,
    forwardImpulse: 0,
    suspensionForce: 0,
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

function dampToward(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(rate, 0) * Math.max(dt, 0));
  return THREE.MathUtils.lerp(current, target, alpha);
}

function computeSteeringLimit(steeringConfig, horizontalKph) {
  const speedBreaks = steeringConfig.SteeringLimitSpeed ?? [20, 40, 100, 250];
  const limitRates = steeringConfig.SteeringLimitRate ?? [1, 0.8, 0.5, 0.25];

  if (horizontalKph <= speedBreaks[0]) {
    return limitRates[0];
  }

  for (let index = 1; index < speedBreaks.length; index += 1) {
    if (horizontalKph <= speedBreaks[index]) {
      const t = inverseLerp(speedBreaks[index - 1], speedBreaks[index], horizontalKph);
      return THREE.MathUtils.lerp(limitRates[index - 1], limitRates[index], t);
    }
  }

  return limitRates[limitRates.length - 1];
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

function speedHorizontalNow(speedForwardNow, chassis) {
  const vel = chassis.linvel();
  return Math.hypot(vel.x, vel.z) * 3.6;
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}
