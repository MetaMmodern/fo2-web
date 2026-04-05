import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const TMP_EULER = new THREE.Euler(0, 0, 0, "YXZ");
const DEFAULT_CAR_TRACKER_CONFIG = {
  springCoef: 1,
  springDamp: 0.82,
  rollFactor: 0.28,
  verticalFactor: 0.7,
  verticalVelocityScalar: 0.045,
  verticalVelocityMin: 8,
  verticalVelocityMax: 36,
  rotateFactor: 0.32,
};
const DEFAULT_FIXED_HEAD_CONFIG = {
  locationScale: new THREE.Vector3(1, 1, 1),
  directionScaleX: 0.12,
  directionScaleZ: 1,
  directionOffsetX: 0,
  directionOffsetZ: 0,
};
const DEFAULT_DAMAGE_SHAKE_CONFIG = {
  minInput: 0.08,
  maxInput: 1.1,
  scaleInput: 0.12,
};
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
  const smoothedLookTarget = new THREE.Vector3();
  const smoothedPosition = new THREE.Vector3();
  const desiredUp = new THREE.Vector3(0, 1, 0);
  const smoothedUp = new THREE.Vector3(0, 1, 0);
  const orbitForward = new THREE.Vector3();
  const orbitRight = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const positionVelocity = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();
  const shakeTargetOffset = new THREE.Vector3();
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
  let shakeTime = 0;
  let smoothedHeading = getTrackerHeading(getDynamics?.() ?? null, object);
  const stableLookDirection = new THREE.Vector3(0, 0, -1);
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
  const initialDebugSettings = resolveCameraDebugSettings(debugControls);
  resolveDesiredCameraPose(
    object,
    presets[presetIndex],
    getDynamics?.() ?? null,
    trackFloorSampler,
    smoothedHeading,
    initialDebugSettings,
    desiredPosition,
    desiredLookTarget,
    desiredUp,
  );
  smoothedPosition.copy(desiredPosition);
  smoothedLookTarget.copy(desiredLookTarget);
  smoothedUp.copy(desiredUp);
  stabilizeCameraAim(smoothedPosition, smoothedLookTarget, stableLookDirection);
  camera.position.copy(smoothedPosition);
  controls.target.copy(smoothedLookTarget);
  controls.enabled = orbitMode;
  camera.up.copy(smoothedUp);
  camera.lookAt(smoothedLookTarget);

  function toggleOrbitMode() {
    orbitMode = !orbitMode;
    controls.enabled = orbitMode;
  }

  function cyclePreset() {
    presetIndex = (presetIndex + 1) % presets.length;
    applyPresetToCamera(camera, presets[presetIndex]);
    const cycleDebugSettings = resolveCameraDebugSettings(debugControls);
    resolveDesiredCameraPose(
      object,
      presets[presetIndex],
      getDynamics?.() ?? null,
      trackFloorSampler,
      smoothedHeading,
      cycleDebugSettings,
      desiredPosition,
      desiredLookTarget,
      desiredUp,
    );
    smoothedPosition.copy(desiredPosition);
    smoothedLookTarget.copy(desiredLookTarget);
    smoothedUp.copy(desiredUp);
    positionVelocity.set(0, 0, 0);
    targetVelocity.set(0, 0, 0);
    camera.position.copy(smoothedPosition);
    controls.target.copy(smoothedLookTarget);
    camera.up.copy(smoothedUp);
    camera.lookAt(smoothedLookTarget);
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
      const targetHeading = getTrackerHeading(dynamics, object);
      smoothedHeading =
        preset.trackerType === 2
          ? targetHeading
          : debugSettings.enableDynamics
            ? smoothAngleToward(
                smoothedHeading,
                targetHeading,
                preset.lookResponse * debugSettings.headingResponseScale,
                deltaSeconds,
              )
            : targetHeading;
      resolveDesiredCameraPose(
        object,
        preset,
        dynamics,
        trackFloorSampler,
        smoothedHeading,
        debugSettings,
        desiredPosition,
        desiredLookTarget,
        desiredUp,
      );

      advanceCameraSpring(
        smoothedPosition,
        positionVelocity,
        desiredPosition,
        debugSettings.enableDynamics
          ? preset.positionResponse * debugSettings.positionResponseScale
          : 1000,
        preset.positionDamping,
        deltaSeconds,
      );
      advanceCameraSpring(
        smoothedLookTarget,
        targetVelocity,
        desiredLookTarget,
        preset.trackerType === 2
          ? 1000
          : debugSettings.enableDynamics
            ? preset.lookResponse * debugSettings.lookResponseScale
            : 1000,
        preset.lookDamping,
        deltaSeconds,
      );

      const upAlpha = 1 - Math.exp(-preset.upResponse * deltaSeconds);
      smoothedUp.lerp(desiredUp, upAlpha).normalize();
      applyDamageShake(
        dynamics,
        preset,
        deltaSeconds,
        debugSettings,
        smoothedPosition,
        smoothedLookTarget,
        smoothedUp,
        shakeOffset,
        shakeTargetOffset,
        renderPosition,
        renderTarget,
        orbitForward,
        orbitRight,
        orbitOffset,
        () => {
          shakeTime += deltaSeconds;
          return shakeTime;
        },
      );

      stabilizeCameraAim(renderPosition, renderTarget, stableLookDirection);

      camera.position.copy(renderPosition);
      controls.target.copy(renderTarget);
      camera.up.copy(smoothedUp);
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
      fov: cameraConfig.fov ?? 100,
      nearClipping: 0.05,
      farClipping: cameraConfig.farClipping ?? 1000,
      minGround: cameraConfig.trackerData?.minGround ?? 1,
      clampGround: cameraConfig.trackerData?.clampGround ?? 0.3,
      positionResponse: resolveCameraResponse(
        cameraConfig.trackerData?.stiffness?.x,
        cameraConfig.trackerType,
        cameraConfig.targetOffset ? 9 : 13,
      ),
      lookResponse: resolveCameraResponse(
        cameraConfig.trackerData?.stiffness?.y,
        cameraConfig.trackerType,
        cameraConfig.targetOffset ? 10 : 15,
      ),
      upResponse: cameraConfig.trackerType === 1 ? 14 : 8,
      positionDamping: cameraConfig.trackerType === 1 ? 0.9 : 0.82,
      lookDamping: cameraConfig.trackerType === 1 ? 0.88 : 0.8,
      carTrackerConfig: { ...DEFAULT_CAR_TRACKER_CONFIG },
      fixedHeadConfig: cloneFixedHeadConfig(DEFAULT_FIXED_HEAD_CONFIG),
      damageShakeConfig: { ...DEFAULT_DAMAGE_SHAKE_CONFIG },
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

function resolveCameraResponse(value, trackerType, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const scale = trackerType === 1 ? 48 : 28;
  return Math.max(value * scale, 1);
}

function applyPresetToCamera(camera, preset) {
  camera.fov = preset.fov ?? 100;
  camera.near = preset.nearClipping ?? 0.05;
  camera.far = preset.farClipping ?? camera.far;
  camera.updateProjectionMatrix();
}

function cloneCameraPreset(preset) {
  return {
    label: preset.label,
    trackerType: preset.trackerType,
    positionType: preset.positionType,
    positionOffset: preset.positionOffset.clone(),
    targetOffset: preset.targetOffset.clone(),
    fov: preset.fov,
    nearClipping: preset.nearClipping,
    farClipping: preset.farClipping,
    minGround: preset.minGround,
    clampGround: preset.clampGround,
    positionResponse: preset.positionResponse,
    lookResponse: preset.lookResponse,
    upResponse: preset.upResponse,
    positionDamping: preset.positionDamping,
    lookDamping: preset.lookDamping,
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
    fov: 100,
    nearClipping: 0.5,
    farClipping: 1000,
    minGround: 1,
    clampGround: 0.3,
    positionResponse: 9,
    lookResponse: 10,
    upResponse: 8,
    positionDamping: 0.82,
    lookDamping: 0.8,
    carTrackerConfig: { ...DEFAULT_CAR_TRACKER_CONFIG },
    fixedHeadConfig: cloneFixedHeadConfig(DEFAULT_FIXED_HEAD_CONFIG),
    damageShakeConfig: { ...DEFAULT_DAMAGE_SHAKE_CONFIG },
  };
}

function convertCameraOffsetToScene(offset) {
  return new THREE.Vector3(offset.x, offset.y, -offset.z);
}

function resolveCameraTargetOffset(cameraConfig) {
  if (cameraConfig.targetOffset) {
    return convertCameraOffsetToScene(cameraConfig.targetOffset);
  }

  const positionOffset = convertCameraOffsetToScene(
    cameraConfig.positionOffset,
  );
  const targetOffset = positionOffset.clone();

  if (cameraConfig.positionType === 3 || cameraConfig.positionType === 4) {
    targetOffset.x *= 0.2;
    targetOffset.y = Math.max(positionOffset.y * 0.95, 0.55);
    targetOffset.z -= 8;
    return targetOffset;
  }

  targetOffset.set(0, Math.max(positionOffset.y * 0.7, 0.6), -2.5);
  return targetOffset;
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
  };
}

function resolveDesiredCameraPose(
  object,
  preset,
  dynamics,
  trackFloorSampler,
  headingAngle,
  debugSettings,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
) {
  object.updateWorldMatrix(true, false);

  if (preset.trackerType === 1) {
    resolveFixedHeadPose(
      object,
      preset,
      dynamics,
      desiredPosition,
      desiredLookTarget,
      desiredUp,
    );
    return;
  }

  resolveCarTrackerPose(
    object,
    preset,
    dynamics,
    trackFloorSampler,
    headingAngle,
    debugSettings,
    desiredPosition,
    desiredLookTarget,
    desiredUp,
  );
}

function resolveCarTrackerPose(
  object,
  preset,
  dynamics,
  trackFloorSampler,
  headingAngle,
  debugSettings,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
) {
  const trackerConfig = preset.carTrackerConfig;
  const yawRotation = new THREE.Quaternion().setFromAxisAngle(
    WORLD_UP,
    headingAngle,
  );
  const forward = new THREE.Vector3()
    .copy(LOCAL_FORWARD)
    .applyQuaternion(yawRotation);
  const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize();
  const baseTarget = new THREE.Vector3()
    .copy(preset.targetOffset)
    .applyQuaternion(yawRotation)
    .add(object.position);

  desiredPosition
    .copy(preset.positionOffset)
    .applyQuaternion(yawRotation)
    .add(object.position);
  desiredLookTarget.copy(baseTarget);

  if (preset.trackerType !== 2 && dynamics && debugSettings.enableDynamics) {
    const verticalGate = inverseLerpClamped(
      trackerConfig.verticalVelocityMin,
      trackerConfig.verticalVelocityMax,
      dynamics.horizontalSpeed ?? 0,
    );
    const verticalLift =
      THREE.MathUtils.clamp(
        (dynamics.verticalVelocity ?? 0) * trackerConfig.verticalVelocityScalar,
        -trackerConfig.verticalFactor * debugSettings.verticalFactorScale,
        trackerConfig.verticalFactor * debugSettings.verticalFactorScale,
      ) * verticalGate;
    const rotateOffset = THREE.MathUtils.clamp(
      ((dynamics.lateralSpeed ?? 0) * 0.06 + (dynamics.yawRate ?? 0) * 0.05) *
        trackerConfig.rotateFactor *
        debugSettings.rotateFactorScale,
      -0.75,
      0.75,
    );

    desiredPosition.addScaledVector(WORLD_UP, verticalLift);
    desiredPosition.addScaledVector(right, rotateOffset * 0.12);
  }

  applyGroundClamp(trackFloorSampler, desiredPosition, preset);

  desiredUp.copy(WORLD_UP);
}

function resolveFixedHeadPose(
  object,
  preset,
  dynamics,
  desiredPosition,
  desiredLookTarget,
  desiredUp,
) {
  const fixedHeadConfig = preset.fixedHeadConfig;
  const objectUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(object.quaternion)
    .normalize();
  const localPosition = preset.positionOffset
    .clone()
    .multiply(fixedHeadConfig.locationScale);
  const forward = new THREE.Vector3()
    .copy(LOCAL_FORWARD)
    .applyQuaternion(object.quaternion);
  const right = new THREE.Vector3().crossVectors(forward, objectUp).normalize();

  desiredPosition
    .copy(localPosition)
    .applyQuaternion(object.quaternion)
    .add(object.position);
  desiredLookTarget.copy(desiredPosition);
  desiredLookTarget.addScaledVector(
    right,
    fixedHeadConfig.directionOffsetX +
      fixedHeadConfig.directionScaleX * (dynamics?.lateralSpeed ?? 0) * 0.08,
  );
  desiredLookTarget.addScaledVector(
    forward,
    8 * fixedHeadConfig.directionScaleZ +
      fixedHeadConfig.directionOffsetZ +
      Math.max(dynamics?.forwardSpeed ?? 0, 0) * 0.04,
  );
  desiredLookTarget.addScaledVector(WORLD_UP, 0.18);
  desiredUp.copy(objectUp).normalize();
}

function applyGroundClamp(trackFloorSampler, desiredPosition, preset) {
  if (!trackFloorSampler?.sample) {
    return;
  }

  const hit = trackFloorSampler.sample(desiredPosition, {
    rayHeight: 25,
    rayDistance: 100,
    minUpDot: 0.12,
  });

  if (!hit) {
    return;
  }

  const minCameraY = hit.point.y + (preset.minGround ?? 1);
  if (desiredPosition.y < minCameraY) {
    desiredPosition.y = THREE.MathUtils.lerp(
      desiredPosition.y,
      minCameraY,
      THREE.MathUtils.clamp(preset.clampGround ?? 0.3, 0, 1),
    );
  }
}

function advanceCameraSpring(
  current,
  velocity,
  target,
  response,
  damping,
  deltaSeconds,
) {
  const alpha = 1 - Math.exp(-Math.max(response, 0.01) * deltaSeconds);
  current.lerp(target, alpha);
  velocity
    .copy(target)
    .sub(current)
    .multiplyScalar(alpha / Math.max(deltaSeconds, 1e-4));
  velocity.multiplyScalar(Math.max(0, Math.min(damping, 0.98)));
}

function applyDamageShake(
  dynamics,
  preset,
  deltaSeconds,
  debugSettings,
  smoothedPosition,
  smoothedLookTarget,
  smoothedUp,
  shakeOffset,
  shakeTargetOffset,
  renderPosition,
  renderTarget,
  forward,
  right,
  offset,
  advanceTime,
) {
  renderPosition.copy(smoothedPosition);
  renderTarget.copy(smoothedLookTarget);

  if (!dynamics) {
    return;
  }

  const shakeConfig = preset.damageShakeConfig;
  if (!debugSettings.enableDynamics || debugSettings.shakeScale <= 0) {
    return;
  }
  const normalizedShake = inverseLerpClamped(
    shakeConfig.minInput,
    shakeConfig.maxInput,
    dynamics.cameraShake ?? 0,
  );

  if (normalizedShake <= 0) {
    return;
  }

  const time = advanceTime() * THREE.MathUtils.lerp(18, 32, normalizedShake);
  const amplitude =
    shakeConfig.scaleInput * normalizedShake * debugSettings.shakeScale;
  forward.subVectors(smoothedLookTarget, smoothedPosition).normalize();
  right.crossVectors(forward, smoothedUp).normalize();
  offset.crossVectors(right, forward).normalize();

  shakeOffset
    .copy(right)
    .multiplyScalar(Math.sin(time * 1.9) * amplitude)
    .addScaledVector(smoothedUp, Math.cos(time * 2.7) * amplitude * 0.65)
    .addScaledVector(offset, Math.sin(time * 3.4) * amplitude * 0.4);
  shakeTargetOffset.copy(shakeOffset).multiplyScalar(0.24);

  renderPosition.add(shakeOffset);
  renderTarget.add(shakeTargetOffset);
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

  return extractYaw(object.quaternion);
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
  const delta = new THREE.Vector3().subVectors(target, position);

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

function smoothAngleToward(current, target, response, deltaSeconds) {
  const delta = normalizeAngle(target - current);
  const alpha = 1 - Math.exp(-Math.max(response, 0.01) * deltaSeconds);
  return normalizeAngle(current + delta * alpha);
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
