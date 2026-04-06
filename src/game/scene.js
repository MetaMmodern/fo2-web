import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const TMP_EULER = new THREE.Euler(0, 0, 0, "YXZ");
const TMP_VECTOR_A = new THREE.Vector3();
const TMP_VECTOR_B = new THREE.Vector3();
const TMP_VECTOR_C = new THREE.Vector3();
const TMP_VECTOR_D = new THREE.Vector3();
const TMP_VECTOR_E = new THREE.Vector3();
const TMP_VECTOR_F = new THREE.Vector3();
const TMP_QUATERNION = new THREE.Quaternion();
const AUTHENTIC_CAR_TRACKER_CONFIG = {
  verticalVelocityScalar: 0.01,
  verticalVelocityMin: -0.5,
  verticalVelocityMax: 0.5,
  springCoef: 0.001,
  springDamp: 0.05,
  rotateFactor: 2,
};
const AUTHENTIC_DAMAGE_SHAKE_CONFIG = {
  minInput: 12,
  maxInput: 40,
  scaleInput: 0.009,
  springCoef: 0.25,
  springDamp: 0.1,
  rollFactor: 0.3,
  verticalFactor: 1.8,
};
const AUTHENTIC_FIXED_HEAD_CONFIG = {
  locationScale: new THREE.Vector3(0.025, 0.005, 0),
  directionScaleX: 0.0025,
  directionScaleZ: 0.0025,
  directionOffsetX: 0,
  directionOffsetZ: 0,
  springCoef: 0.25,
  springDamp: 0.1,
  yawFactor: 0.3,
  verticalFactor: 1.8,
};
const PLAYER_CAR_HEADING_STIFFNESS = 0.6;
const CAMERA_POWER_BASE = 0.9;
const CHASE_TILT_BLEND = 0.3;
const CAMERA_COLLISION_BUFFER = 1;
const MIN_CAMERA_COLLISION_DISTANCE = 0.05;
const MIN_CAMERA_TARGET_DISTANCE = 0.5;

export function createSceneApp(container = document.body) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb6e8);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    60000,
  );
  camera.position.set(16, 9, 18);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.target.set(0, 1, 0);
  controls.minDistance = 0.5;
  controls.maxDistance = 1400;
  controls.maxPolarAngle = Math.PI;
  controls.zoomToCursor = true;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls };
}

export async function loadVehicleCameraConfig(cameraConfigUrl) {
  const response = await fetch(cameraConfigUrl);

  if (!response.ok) {
    throw new Error(`Failed to load vehicle camera config: ${response.status}`);
  }

  return parseVehicleCameraConfig(await response.text());
}

export function createChaseCamera(camera, controls, object, options = {}) {
  const desiredPosition = new THREE.Vector3();
  const desiredLookTarget = new THREE.Vector3();
  const desiredUp = new THREE.Vector3(0, 1, 0);
  const orbitForward = new THREE.Vector3();
  const orbitRight = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const renderPosition = new THREE.Vector3();
  const renderTarget = new THREE.Vector3();
  const presets =
    options.presets?.length > 0
      ? options.presets.map(cloneCameraPreset)
      : [cloneCameraPreset(createFallbackCameraPreset())];
  const initialState = options.initialState ?? null;
  const getDynamics = options.getDynamics ?? null;
  const trackFloorSampler = options.trackFloorSampler ?? null;
  const debugControls = options.debugControls ?? null;
  let presetIndex =
    initialState?.presetIndex ?? options.initialPresetIndex ?? 0;
  presetIndex = THREE.MathUtils.clamp(presetIndex, 0, presets.length - 1);
  let orbitMode = Boolean(initialState?.orbitMode);
  let orbitKeyboardStep = 20;
  const stableLookDirection = new THREE.Vector3(0, 0, -1);
  const runtimeState = createRecoveredCameraRuntimeState();
  const orbitKeys = new Set();
  const onOrbitWheel = (event) => {
    if (!orbitMode) {
      return;
    }

    event.preventDefault();
    const nextFov = THREE.MathUtils.clamp(
      camera.fov + Math.sign(event.deltaY) * 2,
      15,
      120,
    );

    if (nextFov !== camera.fov) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  };

  if (Number.isFinite(initialState?.orbitKeyboardStep)) {
    orbitKeyboardStep = initialState.orbitKeyboardStep;
  }

  applyPresetToCamera(camera, presets[presetIndex]);
  if (Number.isFinite(initialState?.fov)) {
    camera.fov = initialState.fov;
  }
  camera.updateProjectionMatrix();
  resetRecoveredCameraState(
    runtimeState,
    presets[presetIndex],
    getDynamics?.() ?? null,
    object,
  );
  applyRecoveredCameraPose(
    object,
    presets[presetIndex],
    getDynamics?.() ?? null,
    trackFloorSampler,
    runtimeState,
    resolveCameraDebugSettings(debugControls),
    1 / 60,
    desiredPosition,
    desiredLookTarget,
    desiredUp,
    renderPosition,
    renderTarget,
  );
  stabilizeCameraAim(renderPosition, renderTarget, stableLookDirection);
  camera.position.copy(renderPosition);
  controls.target.copy(renderTarget);
  controls.enabled = orbitMode;
  camera.up.copy(desiredUp);
  camera.lookAt(renderTarget);

  function toggleOrbitMode() {
    orbitMode = !orbitMode;
    controls.enabled = orbitMode;
  }

  function cyclePreset() {
    presetIndex = (presetIndex + 1) % presets.length;
    applyPresetToCamera(camera, presets[presetIndex]);
    resetRecoveredCameraState(
      runtimeState,
      presets[presetIndex],
      getDynamics?.() ?? null,
      object,
    );
    applyRecoveredCameraPose(
      object,
      presets[presetIndex],
      getDynamics?.() ?? null,
      trackFloorSampler,
      runtimeState,
      resolveCameraDebugSettings(debugControls),
      1 / 60,
      desiredPosition,
      desiredLookTarget,
      desiredUp,
      renderPosition,
      renderTarget,
    );
    stabilizeCameraAim(renderPosition, renderTarget, stableLookDirection);
    camera.position.copy(renderPosition);
    controls.target.copy(renderTarget);
    camera.up.copy(desiredUp);
    camera.lookAt(renderTarget);
  }

  const onKeyDown = (event) => {
    if (event.code === "Backquote") {
      toggleOrbitMode();
      return;
    }

    if (event.code === "KeyC") {
      cyclePreset();
      return;
    }

    if (event.code === "Digit1") {
      orbitKeyboardStep = Math.max(2, orbitKeyboardStep * 0.5);
      return;
    }

    if (event.code === "Digit2") {
      orbitKeyboardStep = Math.min(240, orbitKeyboardStep * 2);
      return;
    }

    orbitKeys.add(event.code);
  };

  const onKeyUp = (event) => {
    orbitKeys.delete(event.code);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  controls.domElement.addEventListener("wheel", onOrbitWheel, {
    passive: false,
  });

  return {
    update(deltaSeconds) {
      if (orbitMode) {
        updateOrbitKeyboardControls(
          camera,
          controls,
          orbitKeys,
          orbitKeyboardStep,
          deltaSeconds,
          orbitForward,
          orbitRight,
          orbitOffset,
        );
        controls.update();
        return;
      }

      object.updateWorldMatrix(true, false);
      const dynamics = getDynamics?.() ?? null;
      const preset = presets[presetIndex];
      const debugSettings = resolveCameraDebugSettings(debugControls);
      applyRecoveredCameraPose(
        object,
        preset,
        dynamics,
        trackFloorSampler,
        runtimeState,
        debugSettings,
        deltaSeconds,
        desiredPosition,
        desiredLookTarget,
        desiredUp,
        renderPosition,
        renderTarget,
      );
      stabilizeCameraAim(renderPosition, renderTarget, stableLookDirection);
      camera.position.copy(renderPosition);
      controls.target.copy(renderTarget);
      camera.up.copy(desiredUp);
      camera.lookAt(renderTarget);
    },
    getPresetIndex() {
      return presetIndex;
    },
    getState() {
      return {
        presetIndex,
        orbitMode,
        orbitKeyboardStep,
        fov: camera.fov,
      };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      controls.domElement.removeEventListener("wheel", onOrbitWheel);
    },
  };
}

function updateOrbitKeyboardControls(
  camera,
  controls,
  orbitKeys,
  orbitKeyboardStep,
  deltaSeconds,
  orbitForward,
  orbitRight,
  orbitOffset,
) {
  const step = orbitKeyboardStep * deltaSeconds;

  orbitForward.subVectors(controls.target, camera.position);
  if (orbitForward.lengthSq() < 0.0001) {
    orbitForward.set(0, 0, -1);
  } else {
    orbitForward.normalize();
  }

  orbitRight.crossVectors(orbitForward, camera.up);
  if (orbitRight.lengthSq() < 0.0001) {
    orbitRight.set(1, 0, 0);
  } else {
    orbitRight.normalize();
  }

  if (orbitKeys.has("KeyI")) {
    orbitOffset.copy(orbitForward).multiplyScalar(step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }

  if (orbitKeys.has("KeyK")) {
    orbitOffset.copy(orbitForward).multiplyScalar(-step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }

  if (orbitKeys.has("KeyJ")) {
    orbitOffset.copy(orbitRight).multiplyScalar(-step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }

  if (orbitKeys.has("KeyL")) {
    orbitOffset.copy(orbitRight).multiplyScalar(step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }

  if (orbitKeys.has("KeyU")) {
    orbitOffset.copy(camera.up).multiplyScalar(step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }

  if (orbitKeys.has("KeyO")) {
    orbitOffset.copy(camera.up).multiplyScalar(-step);
    camera.position.add(orbitOffset);
    controls.target.add(orbitOffset);
  }
}

function parseVehicleCameraConfig(cameraIniText) {
  const cameraBlocks = Array.from(
    cameraIniText.matchAll(/\[(\d+)\]\s*=\s*\{([\s\S]*?)\n\t\}/g),
  ).map((match) => ({
    index: Number.parseInt(match[1], 10),
    body: match[2],
  }));

  const cameras = cameraBlocks.map(({ index, body }) => ({
    index,
    positionType: parseIniNumber(body, "PositionType"),
    targetType: parseIniNumber(body, "TargetType"),
    trackerType: parseIniNumber(body, "TrackerType"),
    nearClipping: parseIniNumber(body, "NearClipping"),
    farClipping: parseIniNumber(body, "FarClipping"),
    fov: parseIniNumber(body, "FOV"),
    positionOffset: parseIniVector(body, "Offset", "PositionFrames"),
    targetOffset: parseIniVector(body, "Offset", "TargetFrames"),
    trackerData: parseTrackerData(body),
  }));

  const presets = cameras
    .filter((cameraConfig) => cameraConfig.positionOffset)
    .sort((left, right) => left.index - right.index)
    .map((cameraConfig) => ({
      label: resolveCameraLabel(cameraConfig),
      trackerType: cameraConfig.trackerType ?? 2,
      positionType: cameraConfig.positionType ?? 2,
      positionOffset: convertCameraOffsetToScene(cameraConfig.positionOffset),
      targetOffset: resolveCameraTargetOffset(cameraConfig),
      trackerStiffness: cameraConfig.trackerData?.stiffness ?? null,
      fov: cameraConfig.fov ?? 100,
      nearClipping: cameraConfig.nearClipping ?? 0.5,
      farClipping: cameraConfig.farClipping ?? 1000,
      minGround: cameraConfig.trackerData?.minGround ?? 1,
      clampGround: cameraConfig.trackerData?.clampGround ?? 0.3,
      carTrackerConfig: { ...AUTHENTIC_CAR_TRACKER_CONFIG },
      fixedHeadConfig: cloneFixedHeadConfig(AUTHENTIC_FIXED_HEAD_CONFIG),
      damageShakeConfig: { ...AUTHENTIC_DAMAGE_SHAKE_CONFIG },
    }))
    .filter(Boolean);

  if (presets.length === 0) {
    return null;
  }

  return {
    presets,
    initialPresetIndex: 0,
  };
}

function parseIniNumber(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*([-+]?\\d*\\.?\\d+)`));
  return match ? Number.parseFloat(match[1]) : null;
}

function parseIniVector(text, key, sectionName) {
  const match = text.match(
    new RegExp(`${sectionName}[\\s\\S]*?${key}\\s*=\\s*\\{\\s*([^}]+)\\}`, "m"),
  );

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

function parseTrackerData(text) {
  const trackerMatch = text.match(/TrackerData\s*=\s*\{([\s\S]*?)\n\t\t\}/m);

  if (!trackerMatch) {
    return null;
  }

  const stiffnessMatch = trackerMatch[1].match(
    /Stiffness\s*=\s*\{\s*([^}]+)\}/,
  );

  if (!stiffnessMatch) {
    return null;
  }

  const values = stiffnessMatch[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return null;
  }

  return {
    stiffness: {
      x: values[0],
      y: values[1],
      z: values[2] ?? 0,
    },
    minGround: parseIniNumber(trackerMatch[1], "MinGround"),
    clampGround: parseIniNumber(trackerMatch[1], "ClampGround"),
  };
}

function applyPresetToCamera(camera, preset) {
  camera.fov = preset.fov ?? 100;
  camera.near = resolveSceneNearClipping(preset);
  camera.far = preset.farClipping ?? camera.far;
  camera.updateProjectionMatrix();
}

function cloneCameraPreset(preset) {
  return {
    label: preset.label,
    trackerType: preset.trackerType,
    positionType: preset.positionType,
    positionOffset: preset.positionOffset.clone(),
    targetOffset: preset.targetOffset?.clone() ?? null,
    trackerStiffness: preset.trackerStiffness
      ? { ...preset.trackerStiffness }
      : null,
    fov: preset.fov,
    nearClipping: preset.nearClipping,
    farClipping: preset.farClipping,
    minGround: preset.minGround,
    clampGround: preset.clampGround,
    carTrackerConfig: { ...preset.carTrackerConfig },
    fixedHeadConfig: cloneFixedHeadConfig(preset.fixedHeadConfig),
    damageShakeConfig: { ...preset.damageShakeConfig },
  };
}

function createFallbackCameraPreset() {
  return {
    label: "Cam 1",
    trackerType: 2,
    positionType: 2,
    positionOffset: new THREE.Vector3(0, 1.47, -4.05),
    targetOffset: new THREE.Vector3(0, 0.49, -0.011),
    trackerStiffness: {
      x: 0.25,
      y: 0.115,
      z: 0,
    },
    fov: 100,
    nearClipping: 0.5,
    farClipping: 1000,
    minGround: 1,
    clampGround: 0.3,
    carTrackerConfig: { ...AUTHENTIC_CAR_TRACKER_CONFIG },
    fixedHeadConfig: cloneFixedHeadConfig(AUTHENTIC_FIXED_HEAD_CONFIG),
    damageShakeConfig: { ...AUTHENTIC_DAMAGE_SHAKE_CONFIG },
  };
}

function convertCameraOffsetToScene(offset) {
  return new THREE.Vector3(offset.x, offset.y, -offset.z);
}

function resolveSceneNearClipping(preset) {
  const authoredNear = preset?.nearClipping ?? 0.5;
  const scaledNear = authoredNear * 0.1;

  if (preset?.trackerType === 1) {
    return THREE.MathUtils.clamp(scaledNear, 0.015, 0.04);
  }

  return THREE.MathUtils.clamp(scaledNear, 0.03, 0.08);
}

function resolveCameraTargetOffset(cameraConfig) {
  if (cameraConfig.targetOffset) {
    return convertCameraOffsetToScene(cameraConfig.targetOffset);
  }

  if (cameraConfig.trackerType === 1) {
    return null;
  }

  const positionOffset = convertCameraOffsetToScene(
    cameraConfig.positionOffset,
  );
  return new THREE.Vector3(0, Math.max(positionOffset.y * 0.7, 0.6), 0);
}

function resolveCameraLabel(cameraConfig) {
  if (cameraConfig.trackerType === 1 && cameraConfig.positionType === 4) {
    return `Cockpit ${cameraConfig.index}`;
  }

  if (cameraConfig.trackerType === 1) {
    return `Hood ${cameraConfig.index}`;
  }

  return `Chase ${cameraConfig.index}`;
}

function cloneFixedHeadConfig(config) {
  return {
    locationScale: config.locationScale.clone(),
    directionScaleX: config.directionScaleX,
    directionScaleZ: config.directionScaleZ,
    directionOffsetX: config.directionOffsetX,
    directionOffsetZ: config.directionOffsetZ,
    springCoef: config.springCoef,
    springDamp: config.springDamp,
    yawFactor: config.yawFactor,
    verticalFactor: config.verticalFactor,
  };
}

function createRecoveredCameraRuntimeState() {
  return {
    heading: 0,
    chaseHeight: 0,
    chaseHeightVelocity: 0,
    collisionLift: 0,
    collisionLiftVelocity: 0,
    collisionDistance: 0,
    fixedHeadSpring: 0,
    fixedHeadSpringVelocity: 0,
    damageShake: 0,
    damageShakeVelocity: 0,
    previousDamageTrigger: 0,
  };
}

function resetRecoveredCameraState(runtimeState, preset, dynamics, object) {
  runtimeState.heading = getTrackerHeading(dynamics, object);
  runtimeState.chaseHeight = 0;
  runtimeState.chaseHeightVelocity = 0;
  runtimeState.collisionLift = 0;
  runtimeState.collisionLiftVelocity = 0;
  runtimeState.collisionDistance =
    preset.targetOffset?.distanceTo(preset.positionOffset) ??
    Math.max(preset.positionOffset.length(), 0.001);
  runtimeState.fixedHeadSpring = 0;
  runtimeState.fixedHeadSpringVelocity = 0;
  runtimeState.damageShake = 0;
  runtimeState.damageShakeVelocity = 0;
  runtimeState.previousDamageTrigger = 0;
}

function applyRecoveredCameraPose(
  object,
  preset,
  dynamics,
  trackFloorSampler,
  runtimeState,
  debugSettings,
  deltaSeconds,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
  renderPosition,
  renderTarget,
) {
  object.updateWorldMatrix(true, false);

  if (preset.trackerType === 1) {
    resolveRecoveredFixedHeadPose(
      object,
      preset,
      dynamics,
      runtimeState,
      debugSettings,
      deltaSeconds,
      desiredPosition,
      desiredLookTarget,
      desiredUp,
    );
  } else {
    resolveRecoveredChasePose(
      object,
      preset,
      dynamics,
      trackFloorSampler,
      runtimeState,
      debugSettings,
      deltaSeconds,
      desiredPosition,
      desiredLookTarget,
      desiredUp,
    );
  }

  applyRecoveredDamageShake(
    preset,
    dynamics,
    runtimeState,
    debugSettings,
    deltaSeconds,
    desiredPosition,
    desiredLookTarget,
    desiredUp,
    renderPosition,
    renderTarget,
  );
}

function resolveRecoveredChasePose(
  object,
  preset,
  dynamics,
  trackFloorSampler,
  runtimeState,
  debugSettings,
  deltaSeconds,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
) {
  const trackerConfig = preset.carTrackerConfig;
  const headingTarget = getTrackerHeading(dynamics, object);
  const headingResponse =
    PLAYER_CAR_HEADING_STIFFNESS *
    sanitizeCameraDebugNumber(debugSettings.headingResponseScale, 1);
  runtimeState.heading = smoothAngleTowardPower(
    runtimeState.heading,
    headingTarget,
    headingResponse,
    deltaSeconds,
  );

  const targetOffset = preset.targetOffset ?? TMP_VECTOR_A.set(0, 0.6, 0);
  const positionOffset = TMP_VECTOR_D.copy(preset.positionOffset);
  TMP_VECTOR_A.copy(LOCAL_FORWARD).applyQuaternion(object.quaternion).normalize();
  TMP_VECTOR_B.copy(WORLD_UP).applyQuaternion(object.quaternion).normalize();
  TMP_VECTOR_C.set(
    -Math.sin(runtimeState.heading),
    0,
    -Math.cos(runtimeState.heading),
  );
  TMP_VECTOR_C.lerp(TMP_VECTOR_A, CHASE_TILT_BLEND).normalize();
  TMP_VECTOR_E.crossVectors(TMP_VECTOR_C, TMP_VECTOR_B);
  if (TMP_VECTOR_E.lengthSq() < 1e-6) {
    TMP_VECTOR_E.crossVectors(TMP_VECTOR_C, WORLD_UP);
  }
  TMP_VECTOR_E.normalize();
  TMP_VECTOR_F.crossVectors(TMP_VECTOR_E, TMP_VECTOR_C).normalize();

  desiredLookTarget.copy(object.position);
  desiredLookTarget.addScaledVector(TMP_VECTOR_E, targetOffset.x);
  desiredLookTarget.addScaledVector(TMP_VECTOR_F, targetOffset.y);
  desiredLookTarget.addScaledVector(TMP_VECTOR_C, -targetOffset.z);

  const heightTarget = debugSettings.enableDynamics
    ? THREE.MathUtils.clamp(
        (dynamics?.verticalVelocity ?? 0) *
          trackerConfig.verticalVelocityScalar *
          sanitizeCameraDebugNumber(debugSettings.verticalFactorScale, 1),
        trackerConfig.verticalVelocityMin,
        trackerConfig.verticalVelocityMax,
      )
    : 0;
  advanceRecoveredSpring(
    runtimeState,
    "chaseHeight",
    "chaseHeightVelocity",
    heightTarget,
    trackerConfig.springCoef *
      sanitizeCameraDebugNumber(debugSettings.positionResponseScale, 1),
    trackerConfig.springDamp,
    deltaSeconds,
  );
  desiredLookTarget.y += runtimeState.chaseHeight;

  desiredPosition.copy(positionOffset).sub(targetOffset);
  desiredPosition.set(
    TMP_VECTOR_E.x * desiredPosition.x +
      TMP_VECTOR_F.x * desiredPosition.y +
      TMP_VECTOR_C.x * -desiredPosition.z,
    TMP_VECTOR_E.y * desiredPosition.x +
      TMP_VECTOR_F.y * desiredPosition.y +
      TMP_VECTOR_C.y * -desiredPosition.z,
    TMP_VECTOR_E.z * desiredPosition.x +
      TMP_VECTOR_F.z * desiredPosition.y +
      TMP_VECTOR_C.z * -desiredPosition.z,
  );

  if (debugSettings.enableDynamics) {
    desiredPosition.applyAxisAngle(
      TMP_VECTOR_E,
      runtimeState.chaseHeight *
        trackerConfig.rotateFactor *
        sanitizeCameraDebugNumber(debugSettings.rotateFactorScale, 1),
    );
  }

  applyRecoveredChaseCollision(
    trackFloorSampler,
    runtimeState,
    preset,
    debugSettings,
    deltaSeconds,
    desiredLookTarget,
    desiredPosition,
  );

  desiredPosition.add(desiredLookTarget);
  desiredUp.copy(WORLD_UP);
}

function resolveRecoveredFixedHeadPose(
  object,
  preset,
  dynamics,
  runtimeState,
  debugSettings,
  deltaSeconds,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
) {
  const fixedHeadConfig = preset.fixedHeadConfig;
  TMP_VECTOR_A.copy(LOCAL_FORWARD).applyQuaternion(object.quaternion).normalize();
  TMP_VECTOR_B.copy(WORLD_UP).applyQuaternion(object.quaternion).normalize();
  TMP_VECTOR_C.crossVectors(TMP_VECTOR_A, TMP_VECTOR_B).normalize();

  const dynamicLateral = debugSettings.enableDynamics
    ? (dynamics?.lateralSpeed ?? 0) *
      fixedHeadConfig.locationScale.x *
      sanitizeCameraDebugNumber(debugSettings.positionResponseScale, 1)
    : 0;
  const dynamicVertical = debugSettings.enableDynamics
    ? (dynamics?.verticalVelocity ?? 0) *
      fixedHeadConfig.locationScale.y *
      sanitizeCameraDebugNumber(debugSettings.verticalFactorScale, 1)
    : 0;
  const dynamicForward = debugSettings.enableDynamics
    ? (dynamics?.forwardSpeed ?? 0) *
      fixedHeadConfig.locationScale.z *
      sanitizeCameraDebugNumber(debugSettings.positionResponseScale, 1)
    : 0;

  const fixedHeadTarget =
    debugSettings.enableDynamics &&
    Number.isFinite(dynamics?.lateralSpeed)
      ? dynamics.lateralSpeed * fixedHeadConfig.directionScaleX
      : 0;
  advanceRecoveredSpring(
    runtimeState,
    "fixedHeadSpring",
    "fixedHeadSpringVelocity",
    fixedHeadTarget,
    fixedHeadConfig.springCoef *
      sanitizeCameraDebugNumber(debugSettings.headingResponseScale, 1),
    fixedHeadConfig.springDamp,
    deltaSeconds,
  );

  TMP_VECTOR_F.set(dynamicLateral, dynamicVertical, dynamicForward);
  TMP_VECTOR_D.copy(preset.positionOffset).add(TMP_VECTOR_F);
  desiredPosition
    .copy(TMP_VECTOR_D)
    .applyQuaternion(object.quaternion)
    .add(object.position);

  desiredPosition.addScaledVector(
    TMP_VECTOR_B,
    runtimeState.fixedHeadSpring * fixedHeadConfig.verticalFactor,
  );

  TMP_VECTOR_E.copy(TMP_VECTOR_A).applyAxisAngle(
    TMP_VECTOR_B,
    runtimeState.fixedHeadSpring *
      fixedHeadConfig.yawFactor *
      sanitizeCameraDebugNumber(debugSettings.rotateFactorScale, 1),
  );

  desiredLookTarget.copy(desiredPosition);
  desiredLookTarget.addScaledVector(
    TMP_VECTOR_C,
    fixedHeadConfig.directionOffsetX +
      (debugSettings.enableDynamics ? dynamics?.lateralSpeed ?? 0 : 0) *
        fixedHeadConfig.directionScaleX,
  );
  desiredLookTarget.addScaledVector(
    TMP_VECTOR_E,
    8 +
      fixedHeadConfig.directionOffsetZ +
      Math.max(debugSettings.enableDynamics ? dynamics?.forwardSpeed ?? 0 : 0, 0) *
        fixedHeadConfig.directionScaleZ,
  );
  desiredUp.copy(TMP_VECTOR_B);
}

function applyRecoveredChaseCollision(
  trackFloorSampler,
  runtimeState,
  preset,
  debugSettings,
  deltaSeconds,
  targetPoint,
  cameraOffset,
) {
  if (!trackFloorSampler?.sample || !trackFloorSampler?.raycast) {
    return;
  }

  const desiredDistance = TMP_VECTOR_D.copy(cameraOffset).length();
  if (desiredDistance < 1e-4) {
    return;
  }

  runtimeState.collisionDistance = THREE.MathUtils.lerp(
    runtimeState.collisionDistance,
    desiredDistance,
    1 - Math.pow(0.9, normalizeFrameScale(deltaSeconds)),
  );

  const desiredCameraPosition = TMP_VECTOR_A.copy(targetPoint).add(cameraOffset);
  let collisionLiftTarget = 0;

  const groundHit = trackFloorSampler.sample(desiredCameraPosition, {
    rayHeight: 2,
    rayDistance: 8,
    minUpDot: -1,
  });
  if (groundHit) {
    const minCameraY = groundHit.point.y + (preset.minGround ?? 1);
    if (desiredCameraPosition.y < minCameraY) {
      collisionLiftTarget = minCameraY - desiredCameraPosition.y;
    }
  }
  advanceRecoveredSpring(
    runtimeState,
    "collisionLift",
    "collisionLiftVelocity",
    collisionLiftTarget,
    preset.carTrackerConfig.springCoef *
      sanitizeCameraDebugNumber(debugSettings.lookResponseScale, 1),
    preset.carTrackerConfig.springDamp,
    deltaSeconds,
  );

  TMP_VECTOR_B.copy(cameraOffset);
  TMP_VECTOR_B.y += runtimeState.collisionLift;
  const collisionHit = trackFloorSampler.raycast(
    targetPoint,
    TMP_VECTOR_B.normalize(),
    {
      rayDistance: desiredDistance + CAMERA_COLLISION_BUFFER,
      minUpDot: -1,
      maxUpDot: 1,
    },
  );
  if (collisionHit) {
    runtimeState.collisionDistance = Math.min(
      runtimeState.collisionDistance,
      Math.max(
        collisionHit.distance - CAMERA_COLLISION_BUFFER,
        MIN_CAMERA_COLLISION_DISTANCE,
      ),
    );
  }

  cameraOffset
    .setLength(
      Math.min(runtimeState.collisionDistance, desiredDistance),
    )
    .addScaledVector(
      WORLD_UP,
      runtimeState.collisionLift * (preset.clampGround ?? 0.3),
    );
}

function applyRecoveredDamageShake(
  preset,
  dynamics,
  runtimeState,
  debugSettings,
  deltaSeconds,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
  renderPosition,
  renderTarget,
) {
  renderPosition.copy(desiredPosition);
  renderTarget.copy(desiredLookTarget);

  if (!debugSettings.enableDynamics || debugSettings.shakeScale <= 0) {
    runtimeState.previousDamageTrigger = 0;
    return;
  }

  const shakeConfig = preset.damageShakeConfig;
  const trigger = inverseLerpClamped(
    shakeConfig.minInput,
    shakeConfig.maxInput,
    Math.max(dynamics?.cameraShake ?? 0, 0) * shakeConfig.maxInput,
  );
  const triggerRise = Math.max(
    trigger - runtimeState.previousDamageTrigger,
    0,
  );
  runtimeState.previousDamageTrigger = trigger;
  runtimeState.damageShakeVelocity +=
    triggerRise *
    shakeConfig.scaleInput *
    sanitizeCameraDebugNumber(debugSettings.shakeScale, 1);
  advanceRecoveredSpring(
    runtimeState,
    "damageShake",
    "damageShakeVelocity",
    0,
    shakeConfig.springCoef,
    shakeConfig.springDamp,
    deltaSeconds,
  );

  if (Math.abs(runtimeState.damageShake) < 1e-5) {
    return;
  }

  TMP_VECTOR_A.subVectors(desiredLookTarget, desiredPosition);
  TMP_VECTOR_A.applyAxisAngle(
    desiredUp,
    runtimeState.damageShake *
      shakeConfig.rollFactor *
      sanitizeCameraDebugNumber(debugSettings.shakeScale, 1),
  );
  renderPosition.addScaledVector(
    desiredUp,
    runtimeState.damageShake *
      shakeConfig.verticalFactor *
      sanitizeCameraDebugNumber(debugSettings.shakeScale, 1),
  );
  renderTarget.copy(renderPosition).add(TMP_VECTOR_A);
}

function inverseLerpClamped(min, max, value) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }

  return THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
}

function extractYaw(quaternion) {
  TMP_EULER.setFromQuaternion(quaternion, "YXZ");
  return TMP_EULER.y;
}

function getTrackerHeading(dynamics, object) {
  if (Number.isFinite(dynamics?.heading)) {
    return dynamics.heading;
  }

  TMP_VECTOR_A.copy(LOCAL_FORWARD).applyQuaternion(object.quaternion);
  TMP_VECTOR_A.y = 0;
  if (TMP_VECTOR_A.lengthSq() < 1e-6) {
    return extractYaw(object.quaternion);
  }
  TMP_VECTOR_A.normalize();
  return Math.atan2(-TMP_VECTOR_A.x, -TMP_VECTOR_A.z);
}

function resolveCameraDebugSettings(debugControls) {
  return {
    enableDynamics: debugControls?.enableDynamics !== false,
    headingResponseScale: sanitizeCameraDebugNumber(
      debugControls?.headingResponseScale,
      1,
    ),
    positionResponseScale: sanitizeCameraDebugNumber(
      debugControls?.positionResponseScale,
      1,
    ),
    lookResponseScale: sanitizeCameraDebugNumber(
      debugControls?.lookResponseScale,
      1,
    ),
    verticalFactorScale: sanitizeCameraDebugNumber(
      debugControls?.verticalFactorScale,
      1,
    ),
    rotateFactorScale: sanitizeCameraDebugNumber(
      debugControls?.rotateFactorScale,
      1,
    ),
    shakeScale: sanitizeCameraDebugNumber(debugControls?.shakeScale, 1),
  };
}

function sanitizeCameraDebugNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function stabilizeCameraAim(position, target, stableLookDirection) {
  const delta = TMP_VECTOR_A.subVectors(target, position);

  if (
    delta.lengthSq() <
    MIN_CAMERA_TARGET_DISTANCE * MIN_CAMERA_TARGET_DISTANCE
  ) {
    target
      .copy(position)
      .addScaledVector(stableLookDirection, MIN_CAMERA_TARGET_DISTANCE);
    return;
  }

  stableLookDirection.copy(delta).normalize();
}

function smoothAngleTowardPower(current, target, response, deltaSeconds) {
  const delta = normalizeAngle(target - current);
  const frameDecay = Math.pow(
    CAMERA_POWER_BASE,
    normalizeFrameScale(deltaSeconds),
  );
  const alpha = 1 - Math.pow(frameDecay, Math.max(response, 0.01));
  return normalizeAngle(current + delta * alpha);
}

function advanceRecoveredSpring(
  runtimeState,
  positionKey,
  velocityKey,
  target,
  springCoef,
  springDamp,
  deltaSeconds,
) {
  const frameScale = normalizeFrameScale(deltaSeconds);
  const current = runtimeState[positionKey];
  const velocity = runtimeState[velocityKey];
  const nextVelocity =
    velocity -
    (velocity * springDamp + (current - target) * springCoef) * frameScale;
  runtimeState[velocityKey] = nextVelocity;
  runtimeState[positionKey] = current + nextVelocity * frameScale;
}

function normalizeFrameScale(deltaSeconds) {
  return THREE.MathUtils.clamp(deltaSeconds * 60, 0, 4);
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

export function frameObject(camera, controls, object, options = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const distanceScale = options.distanceScale ?? 1.35;
  const heightScale = options.heightScale ?? 0.5;
  const lateralScale = options.lateralScale ?? 0.3;
  const depthScale = options.depthScale ?? 0.65;

  controls.target.copy(center);
  camera.position.set(
    center.x + size.x * lateralScale * distanceScale,
    center.y + Math.max(size.y * heightScale * distanceScale, 3),
    center.z + size.z * depthScale * distanceScale,
  );
  camera.lookAt(center);
}
