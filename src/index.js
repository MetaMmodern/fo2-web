import "./styles.css";
import * as THREE from "three";

import {
  buildVehicleAssetUrls,
  buildVehicleMaterialTextures,
  carCatalog,
  defaultSelection,
  getCarById,
  getSkinById,
  getTrackById,
  trackCatalog,
} from "./game/catalog";
import { loadTrackEnvironment } from "./game/environment";
import { createTrackEnvironmentState } from "./game/environmentState";
import {
  createHud,
  syncHudSelection,
  updateHudTelemetry,
} from "./game/hud";
import { createDrivingInput } from "./game/input";
import { loadVehicleLightsConfig } from "./game/lightsConfig";
import {
  createTextureRegistry,
  prepareMaterials,
  setVehicleLightState,
  setVehicleSunVisibility,
} from "./game/materials";
import { createDrivingSimulation } from "./game/physicsWorkerClient";
import { createColorFilterPass } from "./game/postprocessing";
import {
  createChaseCamera,
  createSceneApp,
  loadVehicleCameraConfig,
} from "./game/scene";
import { loadTrack, placeVehicleOnTrack } from "./game/track";
import { loadVehicle } from "./game/vehicle";

const { scene, camera, renderer, controls } = createSceneApp();
const drivingInput = createDrivingInput();
const drivingDebug = {
  enabled: true,
  substeps: 1,
  sampleContacts: true,
  alignToGround: true,
  tireForces: true,
  aeroForces: true,
  gravity: true,
  gearbox: true,
  wheelVisuals: true,
  cameraShake: true,
  freezePosition: false,
};
const initialTrack = getTrackById(defaultSelection.trackId);
const cameraDebug = {
  enableDynamics: true,
  headingResponseScale: 1,
  positionResponseScale: 1,
  lookResponseScale: 1,
  verticalFactorScale: 1,
  rotateFactorScale: 1,
  shakeScale: 1,
};
const runtimeDebug = {
  paused: false,
  autoPauseAfterLoad: false,
  collisionFramesVisible: false,
  renderGeometryVisible: true,
  togglePause() {
    runtimeDebug.paused = !runtimeDebug.paused;
  },
  toggleCollisionFrames() {
    runtimeDebug.collisionFramesVisible = !runtimeDebug.collisionFramesVisible;
    setCollisionFrameVisibility(runtimeDebug.collisionFramesVisible);
  },
  toggleRenderGeometry() {
    runtimeDebug.renderGeometryVisible = !runtimeDebug.renderGeometryVisible;
    setRenderGeometryVisibility(runtimeDebug.renderGeometryVisible);
  },
};
const hud = createHud({
  tracks: trackCatalog,
  cars: carCatalog,
  selection: { ...defaultSelection },
  cameraDebug,
  runtimeDebug,
  onTrackChange(trackId) {
    applySelection({ trackId });
  },
  onCarChange(carId) {
    const car = getCarById(carId);
    applySelection({
      carId,
      skinId: getSkinById(car, car?.defaultSkinId)?.id ?? null,
    });
  },
  onSkinChange(skinId) {
    applySelection({ skinId });
  },
});
let colorFilterPass = createColorFilterPass(renderer, {
  addTexture: initialTrack.environment.filterAddTexture,
  subTexture: initialTrack.environment.filterSubTexture,
});
colorFilterPass.applyWeatherProfile(initialTrack.environment.weatherProfile);

const selection = { ...defaultSelection };
const sceneState = {
  trackRoot: null,
  collisionAsset: null,
  dynamicObjects: [],
  contactSampler: null,
  sceneSampler: null,
  startPoints: [],
  carRoot: null,
  tireRoot: null,
  chaseCamera: null,
  drivingSimulation: null,
  lightsConfig: null,
  environmentState: null,
  environmentController: null,
};
let transitionChain = Promise.resolve();
const sunOcclusionOrigin = new THREE.Vector3();
const sunOcclusionDirection = new THREE.Vector3();
const sunWorldPosition = new THREE.Vector3();
let smoothedVehicleSunVisibility = 1;
const FRAME_TRACE_LIMIT = 240;
const frameTrace = [];
let smoothedFrameMs = 16.7;
let smoothedSimMs = 0;
let smoothedRenderMs = 0;
let smoothedChaseMs = 0;

if (typeof window !== "undefined") {
  window.__flatoutDebug = {
    scene,
    camera,
    renderer,
    controls,
    drivingDebug,
    get chaseCamera() {
      return sceneState.chaseCamera;
    },
    setDrivingPerfMode(mode) {
      if (mode === "off") {
        Object.assign(drivingDebug, {
          enabled: false,
        });
        return;
      }
      if (mode === "bare") {
        Object.assign(drivingDebug, {
          enabled: true,
          substeps: 1,
          sampleContacts: false,
          alignToGround: false,
          tireForces: false,
          aeroForces: false,
          gravity: false,
          gearbox: false,
          wheelVisuals: false,
          cameraShake: false,
          freezePosition: false,
        });
        return;
      }
      if (mode === "contacts") {
        Object.assign(drivingDebug, {
          enabled: true,
          substeps: 1,
          sampleContacts: true,
          alignToGround: true,
          tireForces: false,
          aeroForces: false,
          gravity: false,
          gearbox: false,
          wheelVisuals: false,
          cameraShake: false,
          freezePosition: false,
        });
        return;
      }
      if (mode === "forces") {
        Object.assign(drivingDebug, {
          enabled: true,
          substeps: 1,
          sampleContacts: true,
          alignToGround: true,
          tireForces: true,
          aeroForces: true,
          gravity: true,
          gearbox: true,
          wheelVisuals: false,
          cameraShake: false,
          freezePosition: false,
        });
        return;
      }
      if (mode === "full") {
        Object.assign(drivingDebug, {
          enabled: true,
          substeps: 1,
          sampleContacts: true,
          alignToGround: true,
          tireForces: true,
          aeroForces: true,
          gravity: true,
          gearbox: true,
          wheelVisuals: true,
          cameraShake: true,
          freezePosition: false,
        });
      }
    },
    get environmentState() {
      return sceneState.environmentState;
    },
    get environmentController() {
      return sceneState.environmentController;
    },
    disableChaseCamera() {
      sceneState.chaseCamera?.dispose?.();
      sceneState.chaseCamera = null;
      controls.enabled = true;
    },
    get frameTrace() {
      return frameTrace;
    },
    showCollisionDebug(show = true) {
      setCollisionFrameVisibility(show);
    },
    frameTraceSummary(count = 60) {
      return summarizeFrameTrace(frameTrace.slice(-count));
    },
  };
}

queueTransition(() =>
  loadSceneSelection({ reloadTrack: true, reloadCar: true }),
);

const frameClock = new THREE.Clock();

animate();

function animate() {
  requestAnimationFrame(animate);
  const frameStart = performance.now();
  const measuredDeltaSeconds = Math.min(frameClock.getDelta(), 0.1);
  const deltaSeconds = runtimeDebug.paused ? 0 : measuredDeltaSeconds;
  const simStart = performance.now();
  if (!runtimeDebug.paused) {
    sceneState.drivingSimulation?.update(deltaSeconds);
  }
  const simMs = performance.now() - simStart;
  const chaseStart = performance.now();
  sceneState.chaseCamera?.update(measuredDeltaSeconds);
  const chaseMs = performance.now() - chaseStart;
  const envStart = performance.now();
  sceneState.environmentController?.update(camera);
  const environmentMs = performance.now() - envStart;
  const sunStart = performance.now();
  updateVehicleSunOcclusion(deltaSeconds);
  const sunMs = performance.now() - sunStart;
  const lightsStart = performance.now();
  updateVehicleLights();
  const lightsMs = performance.now() - lightsStart;

  let controlsMs = 0;
  if (!sceneState.chaseCamera) {
    const controlsStart = performance.now();
    controls.update();
    controlsMs = performance.now() - controlsStart;
  }

  const renderStart = performance.now();
  colorFilterPass.render(scene, camera, {
    scene: sceneState.environmentController?.getOverlayScene?.(),
    camera: sceneState.environmentController?.getOverlayCamera?.(),
  });
  const renderMs = performance.now() - renderStart;
  const totalMs = performance.now() - frameStart;
  smoothedFrameMs = THREE.MathUtils.lerp(smoothedFrameMs, totalMs, 0.12);
  smoothedSimMs = THREE.MathUtils.lerp(smoothedSimMs, simMs, 0.12);
  smoothedRenderMs = THREE.MathUtils.lerp(smoothedRenderMs, renderMs, 0.12);
  smoothedChaseMs = THREE.MathUtils.lerp(smoothedChaseMs, chaseMs, 0.12);
  updateHudTelemetry(hud, {
    speedKph: sceneState.drivingSimulation?.speedKph?.() ?? 0,
    fps: smoothedFrameMs > 1e-3 ? 1000 / smoothedFrameMs : null,
    frameMs: smoothedFrameMs,
    simMs: smoothedSimMs,
    renderMs: smoothedRenderMs,
    chaseMs: smoothedChaseMs,
    physicsDebug: formatPhysicsDebug(
      sceneState.drivingSimulation?.getDebugState?.() ?? null,
    ),
    worldDebug: formatWorldDebug(
      sceneState.drivingSimulation?.getDebugState?.() ?? null,
    ),
  });
  recordFrameTrace({
    deltaSeconds,
    simMs,
    chaseMs,
    environmentMs,
    sunMs,
    lightsMs,
    controlsMs,
    renderMs,
    totalMs,
  });
}

function formatPhysicsDebug(debugState) {
  if (!debugState) {
    return null;
  }

  const pos = debugState.chassisPosition;
  const vel = debugState.chassisVelocity;
  return [
    `m=${debugState.mode ?? "--"}`,
    `g=${debugState.grounded ? 1 : 0}`,
    `toi=${Number.isFinite(debugState.groundToi) ? debugState.groundToi.toFixed(2) : "--"}`,
    `thr=${debugState.throttle.toFixed(1)}`,
    `st=${debugState.steer.toFixed(1)}`,
    `drv=${debugState.engineForce.toFixed(0)}`,
    `wc=${debugState.wheelContacts ?? 0}`,
    `imp=${Number.isFinite(debugState.forwardImpulse) ? debugState.forwardImpulse.toFixed(0) : "--"}`,
    `sus=${Number.isFinite(debugState.suspensionForce) ? debugState.suspensionForce.toFixed(0) : "--"}`,
    `spd=${debugState.speedHorizontal.toFixed(2)}`,
    `y=${pos.y.toFixed(2)}`,
    `vy=${vel.y.toFixed(2)}`,
  ].join(" ");
}

function formatWorldDebug(debugState) {
  const world = debugState?.staticWorld;

  if (!world) {
    return null;
  }

  const minY = Array.isArray(world.boundsMin) ? world.boundsMin[1] : null;
  const maxY = Array.isArray(world.boundsMax) ? world.boundsMax[1] : null;

  return [
    `on=${world.enabled ? 1 : 0}`,
    `col=${world.colliderCount ?? 0}`,
    `mesh=${world.meshCount ?? 0}`,
    `tri=${Math.round(world.triangleCount ?? 0)}`,
    `dyn=${world.dynamicBodyCount ?? 0}/${world.dynamicObjectCount ?? 0}`,
    `cats=${world.dynamicCategorySummary || "--"}`,
    `minY=${Number.isFinite(minY) ? minY.toFixed(2) : "--"}`,
    `maxY=${Number.isFinite(maxY) ? maxY.toFixed(2) : "--"}`,
  ].join(" ");
}

function updateVehicleSunOcclusion(deltaSeconds) {
  if (
    !sceneState.carRoot ||
    !sceneState.sceneSampler ||
    !sceneState.environmentState?.sunPosition
  ) {
    return;
  }

  sceneState.carRoot.updateWorldMatrix(true, false);
  sceneState.carRoot.getWorldPosition(sunOcclusionOrigin);
  sunOcclusionOrigin.y += 1.0;

  sunWorldPosition.copy(sceneState.environmentState.sunPosition);
  sunOcclusionDirection.copy(sunWorldPosition).sub(sunOcclusionOrigin);
  const sunDistance = sunOcclusionDirection.length();

  if (sunDistance <= 1e-4) {
    return;
  }

  sunOcclusionDirection.divideScalar(sunDistance);

  const hit = sceneState.sceneSampler.raycast(sunOcclusionOrigin, sunOcclusionDirection, {
    rayDistance: sunDistance,
    minUpDot: -1,
    maxUpDot: 1,
  });
  const targetVisibility = hit ? 0.18 : 1.0;
  const followRate = targetVisibility < smoothedVehicleSunVisibility ? 10 : 4;
  const blend = 1 - Math.exp(-followRate * deltaSeconds);
  smoothedVehicleSunVisibility = THREE.MathUtils.lerp(
    smoothedVehicleSunVisibility,
    targetVisibility,
    blend,
  );
  setVehicleSunVisibility(sceneState.carRoot, smoothedVehicleSunVisibility);
}

function updateVehicleLights() {
  if (!sceneState.carRoot) {
    return;
  }

  setVehicleLightState(
    sceneState.carRoot,
    sceneState.drivingSimulation?.getLightState?.() ?? null,
    sceneState.environmentState,
    sceneState.lightsConfig,
  );
}

function recordFrameTrace(sample) {
  frameTrace.push(sample);
  if (frameTrace.length > FRAME_TRACE_LIMIT) {
    frameTrace.splice(0, frameTrace.length - FRAME_TRACE_LIMIT);
  }
}

function summarizeFrameTrace(samples) {
  return {
    frames: samples.length,
    avgSimMs: averageFrameMetric(samples, "simMs"),
    avgChaseMs: averageFrameMetric(samples, "chaseMs"),
    avgEnvironmentMs: averageFrameMetric(samples, "environmentMs"),
    avgSunMs: averageFrameMetric(samples, "sunMs"),
    avgLightsMs: averageFrameMetric(samples, "lightsMs"),
    avgControlsMs: averageFrameMetric(samples, "controlsMs"),
    avgRenderMs: averageFrameMetric(samples, "renderMs"),
    avgTotalMs: averageFrameMetric(samples, "totalMs"),
    maxTotalMs: maxFrameMetric(samples, "totalMs"),
    last: samples[samples.length - 1] ?? null,
  };
}

function averageFrameMetric(samples, key) {
  if (samples.length === 0) {
    return null;
  }

  return (
    samples.reduce((sum, sample) => sum + (sample[key] ?? 0), 0) / samples.length
  );
}

function maxFrameMetric(samples, key) {
  if (samples.length === 0) {
    return null;
  }

  return Math.max(...samples.map((sample) => sample[key] ?? 0));
}

function applySelection(nextPartialSelection) {
  const nextSelection = {
    ...selection,
    ...nextPartialSelection,
  };
  const selectedCar = getCarById(nextSelection.carId);
  const selectedSkin = getSkinById(selectedCar, nextSelection.skinId);

  nextSelection.carId = selectedCar?.id ?? selection.carId;
  nextSelection.skinId = selectedSkin?.id ?? selection.skinId;

  const reloadTrack = nextSelection.trackId !== selection.trackId;
  const reloadCar =
    reloadTrack ||
    nextSelection.carId !== selection.carId ||
    nextSelection.skinId !== selection.skinId;

  Object.assign(selection, nextSelection);
  syncHudSelection(hud, { tracks: trackCatalog, cars: carCatalog, selection });
  queueTransition(() => loadSceneSelection({ reloadTrack, reloadCar }));
}

function queueTransition(task) {
  transitionChain = transitionChain
    .then(() => task())
    .catch((error) => {
      console.error("Error updating scene selection:", error);
    });
}

async function loadSceneSelection({ reloadTrack, reloadCar }) {
  const track = getTrackById(selection.trackId);
  const car = getCarById(selection.carId);
  const skin = getSkinById(car, selection.skinId);

  if (!track || !car || !skin) {
    return;
  }

  if (reloadTrack) {
    if (sceneState.trackRoot) {
      scene.remove(sceneState.trackRoot);
      disposeHierarchy(sceneState.trackRoot);
      sceneState.trackRoot = null;
      if (sceneState.collisionAsset?.root) {
        disposeHierarchy(sceneState.collisionAsset.root);
      }
      sceneState.collisionAsset = null;
      sceneState.dynamicObjects = [];
      sceneState.contactSampler = null;
      sceneState.sceneSampler = null;
      sceneState.startPoints = [];
    }

    sceneState.environmentController?.dispose?.();
    sceneState.environmentController = null;
    sceneState.environmentState?.dispose?.();
    sceneState.environmentState = createTrackEnvironmentState(track, renderer);
    sceneState.environmentController = await loadTrackEnvironment(
      scene,
      track.environment,
    );
    colorFilterPass.setFilterTextures({
      addTexture: track.environment.filterAddTexture,
      subTexture: track.environment.filterSubTexture,
    });
    colorFilterPass.applyWeatherProfile(track.environment.weatherProfile);

    const loadedTrack = await loadTrack(
      track,
      scene,
      renderer,
      sceneState.environmentState,
    );
    sceneState.trackRoot = loadedTrack.trackRoot;
    sceneState.collisionAsset = loadedTrack.collisionAsset ?? null;
    sceneState.dynamicObjects = loadedTrack.dynamicObjects ?? [];
    sceneState.contactSampler = loadedTrack.contactSampler ?? null;
    sceneState.sceneSampler = loadedTrack.sceneSampler ?? null;
    sceneState.startPoints = loadedTrack.startPoints;
    syncEnvironmentSunToTrack(sceneState.environmentState, sceneState.trackRoot);
    smoothedVehicleSunVisibility = 1;
    setCollisionFrameVisibility(runtimeDebug.collisionFramesVisible);
    setRenderGeometryVisibility(runtimeDebug.renderGeometryVisible);
  }

  if (reloadCar) {
    const previousCameraState = sceneState.chaseCamera?.getState?.() ?? null;
    sceneState.chaseCamera?.dispose?.();
    sceneState.chaseCamera = null;
    sceneState.drivingSimulation?.dispose?.();
    sceneState.drivingSimulation = null;
    sceneState.lightsConfig = null;

    if (sceneState.carRoot) {
      scene.remove(sceneState.carRoot);
      disposeHierarchy(sceneState.carRoot);
      sceneState.carRoot = null;
      sceneState.tireRoot = null;
    }

    const vehicleTextures = buildVehicleMaterialTextures(car, skin);
    const vehicleAssetUrls = buildVehicleAssetUrls(car, skin);
    const textureRegistry = createTextureRegistry(
      vehicleTextures,
      renderer.capabilities.getMaxAnisotropy(),
    );
    const [{ carRoot, tireRoot }, cameraConfig, lightsConfig] = await Promise.all([
      loadVehicle(vehicleAssetUrls, scene, controls, (root) =>
        prepareMaterials(
          root,
          textureRegistry.getTexture,
          sceneState.environmentState,
        ),
      ),
      loadVehicleCameraConfig(vehicleAssetUrls.cameraConfig).catch((error) => {
        console.warn("Falling back to default chase camera config:", error);
        return null;
      }),
      loadVehicleLightsConfig(vehicleAssetUrls.lightsConfig).catch((error) => {
        console.warn("Falling back to heuristic vehicle lights:", error);
        return null;
      }),
    ]);

    sceneState.carRoot = carRoot;
    sceneState.tireRoot = tireRoot;
    sceneState.lightsConfig = lightsConfig;
    smoothedVehicleSunVisibility = 1;
    setVehicleSunVisibility(sceneState.carRoot, smoothedVehicleSunVisibility);
    setVehicleLightState(
      sceneState.carRoot,
      null,
      sceneState.environmentState,
      sceneState.lightsConfig,
    );

    if (sceneState.trackRoot) {
      placeVehicleOnTrack(
        sceneState.trackRoot,
        carRoot,
        sceneState.startPoints,
        sceneState.contactSampler,
      );
    }

    sceneState.drivingSimulation = await createDrivingSimulation({
      carId: car.id,
      carRoot,
      assetUrls: vehicleAssetUrls,
      input: drivingInput,
      collisionRoot: sceneState.collisionAsset?.root ?? sceneState.trackRoot,
      dynamicObjects: sceneState.dynamicObjects,
    });
    if (runtimeDebug.autoPauseAfterLoad) {
      runtimeDebug.paused = true;
    }
    setRenderGeometryVisibility(runtimeDebug.renderGeometryVisible);
    sceneState.chaseCamera = createChaseCamera(camera, controls, carRoot, {
      ...(cameraConfig ?? {}),
      debugControls: cameraDebug,
      getDynamics: () =>
        sceneState.drivingSimulation?.getCameraState?.() ?? null,
      trackFloorSampler: sceneState.sceneSampler,
      initialState: previousCameraState,
    });
    updateVehicleLights();
  } else if (reloadTrack && sceneState.trackRoot && sceneState.carRoot) {
    placeVehicleOnTrack(
      sceneState.trackRoot,
      sceneState.carRoot,
      sceneState.startPoints,
      sceneState.contactSampler,
    );
    sceneState.drivingSimulation?.dispose?.();
    sceneState.drivingSimulation = await createDrivingSimulation({
      carId: car.id,
      carRoot: sceneState.carRoot,
      assetUrls: buildVehicleAssetUrls(car, skin),
      input: drivingInput,
      collisionRoot: sceneState.collisionAsset?.root ?? sceneState.trackRoot,
      dynamicObjects: sceneState.dynamicObjects,
    });
    if (runtimeDebug.autoPauseAfterLoad) {
      runtimeDebug.paused = true;
    }
    smoothedVehicleSunVisibility = 1;
    setVehicleSunVisibility(sceneState.carRoot, smoothedVehicleSunVisibility);
    setRenderGeometryVisibility(runtimeDebug.renderGeometryVisible);
    updateVehicleLights();
  }
}

function syncEnvironmentSunToTrack(environmentState, trackRoot) {
  if (!environmentState?.sourceSunPosition || !trackRoot) {
    return;
  }

  const sourceSun = environmentState.sourceSunPosition;
  const alignedSceneSun = new THREE.Vector3(
    sourceSun.x,
    sourceSun.y,
    -sourceSun.z,
  ).add(trackRoot.position);

  environmentState.sunPosition.copy(alignedSceneSun);
  environmentState.sunDirection.copy(alignedSceneSun).normalize();
  sceneState.environmentController?.setSunPosition(
    alignedSceneSun.x,
    alignedSceneSun.y,
    alignedSceneSun.z,
  );
}

function setCollisionFrameVisibility(show) {
  if (sceneState.collisionAsset?.root) {
    sceneState.collisionAsset.root.visible = Boolean(show);
    if (show && !sceneState.collisionAsset.root.parent) {
      scene.add(sceneState.collisionAsset.root);
    }
    if (!show && sceneState.collisionAsset.root.parent === scene) {
      scene.remove(sceneState.collisionAsset.root);
    }
  }
}

function setRenderGeometryVisibility(show) {
  if (sceneState.trackRoot) {
    sceneState.trackRoot.visible = Boolean(show);
  }

  if (sceneState.carRoot) {
    sceneState.carRoot.visible = Boolean(show);
  }
}

function disposeHierarchy(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];

    materials.forEach((material) => {
      material?.map?.dispose?.();
      material?.lightMap?.dispose?.();
      material?.emissiveMap?.dispose?.();
      material?.userData?.textureRefs?.forEach((texture) => texture?.dispose?.());
      material?.dispose?.();
    });
  });
}
