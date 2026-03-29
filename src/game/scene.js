import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createSceneApp(container = document.body) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2ee);

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  const orbitForward = new THREE.Vector3();
  const orbitRight = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const presets =
    options.presets?.length > 0
      ? options.presets.map(cloneCameraPreset)
      : [cloneCameraPreset(createFallbackCameraPreset())];
  let presetIndex = options.initialPresetIndex ?? 0;
  let orbitMode = false;
  let orbitKeyboardStep = 20;
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

  applyPresetToCamera(camera, presets[presetIndex]);
  camera.updateProjectionMatrix();
  object.updateWorldMatrix(true, false);
  desiredPosition.copy(object.localToWorld(presets[presetIndex].positionOffset.clone()));
  desiredLookTarget.copy(object.localToWorld(presets[presetIndex].targetOffset.clone()));
  smoothedLookTarget.copy(desiredLookTarget);
  camera.position.copy(desiredPosition);
  controls.target.copy(smoothedLookTarget);
  controls.enabled = false;
  camera.lookAt(smoothedLookTarget);

  function toggleOrbitMode() {
    orbitMode = !orbitMode;
    controls.enabled = orbitMode;
  }

  function cyclePreset() {
    presetIndex = (presetIndex + 1) % presets.length;
    applyPresetToCamera(camera, presets[presetIndex]);
    object.updateWorldMatrix(true, false);
    desiredPosition.copy(
      object.localToWorld(presets[presetIndex].positionOffset.clone()),
    );
    desiredLookTarget.copy(
      object.localToWorld(presets[presetIndex].targetOffset.clone()),
    );
    smoothedLookTarget.copy(desiredLookTarget);
    camera.position.copy(desiredPosition);
    controls.target.copy(smoothedLookTarget);
    camera.lookAt(smoothedLookTarget);
  }

  window.addEventListener("keydown", (event) => {
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
  });

  window.addEventListener("keyup", (event) => {
    orbitKeys.delete(event.code);
  });
  controls.domElement.addEventListener("wheel", onOrbitWheel, { passive: false });

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
      desiredPosition.copy(
        object.localToWorld(presets[presetIndex].positionOffset.clone()),
      );
      desiredLookTarget.copy(
        object.localToWorld(presets[presetIndex].targetOffset.clone()),
      );

      const positionAlpha =
        1 - Math.exp(-presets[presetIndex].positionSharpness * deltaSeconds);
      const lookAlpha =
        1 - Math.exp(-presets[presetIndex].lookSharpness * deltaSeconds);

      camera.position.lerp(desiredPosition, positionAlpha);
      smoothedLookTarget.lerp(desiredLookTarget, lookAlpha);
      controls.target.copy(smoothedLookTarget);
      camera.lookAt(smoothedLookTarget);
    },
    getPresetIndex() {
      return presetIndex;
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
    stiffness: parseTrackerStiffness(body),
  }));

  const presets = cameras
    .filter((cameraConfig) => cameraConfig.positionOffset)
    .sort((left, right) => left.index - right.index)
    .map((cameraConfig) => ({
      label: `Cam ${cameraConfig.index}`,
      positionOffset: convertCameraOffsetToScene(cameraConfig.positionOffset),
      targetOffset: resolveCameraTargetOffset(cameraConfig),
      fov: cameraConfig.fov ?? 100,
      nearClipping: Math.min(cameraConfig.nearClipping ?? 0.05, 0.05),
      farClipping: cameraConfig.farClipping ?? 1000,
      positionSharpness: convertTrackerStiffness(
        cameraConfig.stiffness?.x,
        cameraConfig.targetOffset ? 4 : 9,
      ),
      lookSharpness: convertTrackerStiffness(
        cameraConfig.stiffness?.y,
        cameraConfig.targetOffset ? 5 : 11,
      ),
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
    new RegExp(
      `${sectionName}[\\s\\S]*?${key}\\s*=\\s*\\{\\s*([^}]+)\\}`,
      "m",
    ),
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

function parseTrackerStiffness(text) {
  const trackerMatch = text.match(
    /TrackerData\s*=\s*\{([\s\S]*?)\n\t\t\}/m,
  );

  if (!trackerMatch) {
    return null;
  }

  const stiffnessMatch = trackerMatch[1].match(/Stiffness\s*=\s*\{\s*([^}]+)\}/);

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
    x: values[0],
    y: values[1],
    z: values[2] ?? 0,
  };
}

function convertTrackerStiffness(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(value * 24, 1);
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
    positionOffset: preset.positionOffset.clone(),
    targetOffset: preset.targetOffset.clone(),
    fov: preset.fov,
    nearClipping: preset.nearClipping,
    farClipping: preset.farClipping,
    positionSharpness: preset.positionSharpness,
    lookSharpness: preset.lookSharpness,
  };
}

function createFallbackCameraPreset() {
  return {
    label: "Cam 1",
    positionOffset: new THREE.Vector3(0, 1.47, -4.05),
    targetOffset: new THREE.Vector3(0, 0.49, -0.011),
    fov: 100,
    nearClipping: 0.05,
    farClipping: 1000,
    positionSharpness: 4,
    lookSharpness: 5,
  };
}

function convertCameraOffsetToScene(offset) {
  return new THREE.Vector3(offset.x, offset.y, -offset.z);
}

function resolveCameraTargetOffset(cameraConfig) {
  if (cameraConfig.targetOffset) {
    return convertCameraOffsetToScene(cameraConfig.targetOffset);
  }

  const positionOffset = convertCameraOffsetToScene(cameraConfig.positionOffset);
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
