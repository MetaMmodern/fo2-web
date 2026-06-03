import "./styles.css";
import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

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
import { createMvpMenu } from "./game/mvpMenu.js";
import { createMvpMenuScene } from "./game/mvpMenuScene.js";
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
import { createTelemetryRecorder } from "./game/telemetryRecorder";
import { loadTrack, placeVehicleOnTrack } from "./game/track";
import { loadVehicle } from "./game/vehicle";

const { scene, camera, renderer, controls } = createSceneApp();
const stats = createStatsPanel();
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
const mvpMenuCars = carCatalog;
const mvpInitialCar =
  mvpMenuCars.find((car) => car.id === defaultSelection.carId) ??
  mvpMenuCars[0] ??
  carCatalog[0] ??
  null;
const cameraDebug = {
  enableDynamics: true,
  enableThreeQuarterView: false,
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
  physicsIsolation: {
    driveForce: true,
    gearbox: true,
    steering: true,
    braking: true,
    handbrake: true,
    differentialCurve: true,
    aeroDrag: true,
    lateralDrag: true,
    downforce: true,
    uprightAssist: true,
    gravity: true,
  },
  physicsAllOn() {
    Object.keys(runtimeDebug.physicsIsolation).forEach((key) => {
      runtimeDebug.physicsIsolation[key] = true;
    });
  },
  physicsAllOff() {
    Object.keys(runtimeDebug.physicsIsolation).forEach((key) => {
      runtimeDebug.physicsIsolation[key] = false;
    });
  },
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
const selection = {
  ...defaultSelection,
  carId: mvpInitialCar?.id ?? defaultSelection.carId,
  skinId:
    mvpInitialCar?.defaultSkinId ??
    mvpInitialCar?.skins?.[0]?.id ??
    defaultSelection.skinId,
};
const telemetryRecorder = createTelemetryRecorder({
  getContext: () => ({
    camera,
    input: drivingInput,
    runtimeDebug,
    sceneState,
    selection,
    track: getTrackById(selection.trackId),
    car: getCarById(selection.carId),
  }),
});
const hud = createHud({
  tracks: trackCatalog,
  cars: carCatalog,
  selection: { ...selection },
  cameraDebug,
  runtimeDebug,
  telemetryRecorder,
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
const mvpMenuScene = createMvpMenuScene({
  renderer,
  tracks: trackCatalog,
  cars: mvpMenuCars,
  selection,
});
const mvpMenu = createMvpMenu({
  tracks: trackCatalog,
  cars: mvpMenuCars,
  selection,
  onSelectionChange(nextSelection) {
    setSelection(nextSelection);
  },
  onStartRace() {
    return loadRaceSelection();
  },
  onRaceStartConfirmed() {
    drivingInput.debugClear();
    setRacePaused(false);
    mvpMenuScene.setState({ screen: "racing", selection });
  },
  onPauseRace() {
    drivingInput.debugClear();
    setRacePaused(true);
  },
  onResumeRace() {
    drivingInput.debugClear();
    setRacePaused(false);
    mvpMenuScene.setState({ screen: "racing", selection });
  },
  onExitRace() {
    return unloadRaceSelection();
  },
  onStateChange(menuState) {
    mvpMenuScene.setState(menuState);
  },
});
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
    input: drivingInput,
    runtimeDebug,
    selection,
    get chaseCamera() {
      return sceneState.chaseCamera;
    },
    get sceneState() {
      return sceneState;
    },
    get drivingSimulation() {
      return sceneState.drivingSimulation;
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
    get telemetryRecorder() {
      return telemetryRecorder;
    },
    setSelection,
    loadRaceSelection,
    unloadRaceSelection,
    setRacePaused,
    async runSlipSanityCheck() {
      if (!drivingInput?.debugPress || !sceneState.drivingSimulation?.getDebugState) {
        return null;
      }

      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const samples = [];
      const capture = (label) => {
        const row = telemetryRecorder.state.lastRow;
        const debugState = sceneState.drivingSimulation?.getDebugState?.();
        const sample = {
          label,
          t: row?.race_time_seconds ?? null,
          speedForward: row?.web_speed_forward ?? debugState?.speedForward ?? null,
          slipLongAvg: row?.web_slip_long_avg ?? debugState?.slipLongAvg ?? null,
          slipLatAvg: row?.web_slip_lat_avg ?? debugState?.slipLatAvg ?? null,
          wheel0Slip: row?.web_wheel_0_slip_ratio ?? debugState?.wheels?.[0]?.slipRatio ?? null,
          wheel2Slip: row?.web_wheel_2_slip_ratio ?? debugState?.wheels?.[2]?.slipRatio ?? null,
          gear: row?.web_gear ?? debugState?.gear ?? null,
          steerState: row?.web_steer_state ?? debugState?.steerState ?? null,
          launchSlipTimer: debugState?.launchSlipTimer ?? null,
          driftRecoveryTimer: debugState?.driftRecoveryTimer ?? null,
        };
        samples.push(sample);
        return sample;
      };

      drivingInput.debugClear();
      drivingInput.debugPress("KeyR");
      await wait(80);
      drivingInput.debugRelease("KeyR");
      await wait(150);
      telemetryRecorder.discard();
      telemetryRecorder.record();
      await wait(50);

      drivingInput.debugPress("KeyW");
      for (const mark of [100, 200, 300, 500, 800, 1200]) {
        await wait(mark - (samples.length ? [100, 200, 300, 500, 800, 1200][samples.length - 1] : 0));
        capture(`launch_${mark}`);
      }

      drivingInput.debugPress("ArrowLeft");
      await wait(400);
      capture("steer_400");
      drivingInput.debugRelease("ArrowLeft");

      await wait(100);
      capture("release_100");
      await wait(150);
      capture("release_250");
      await wait(200);
      capture("release_450");

      drivingInput.debugRelease("KeyW");
      telemetryRecorder.stop();
      console.table(samples);
      return samples;
    },
    showCollisionDebug(show = true) {
      setCollisionFrameVisibility(show);
    },
    frameTraceSummary(count = 60) {
      return summarizeFrameTrace(frameTrace.slice(-count));
    },
  };
}

const frameClock = new THREE.Clock();

animate();

function animate() {
  requestAnimationFrame(animate);
  stats.begin();
  const frameStart = performance.now();
  const measuredDeltaSeconds = Math.min(frameClock.getDelta(), 0.1);
  const deltaSeconds = runtimeDebug.paused ? 0 : measuredDeltaSeconds;

  if (mvpMenuScene.render(measuredDeltaSeconds)) {
    stats.end();
    return;
  }

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
  telemetryRecorder.capture({
    debugState: sceneState.drivingSimulation?.getDebugState?.() ?? null,
    inputSnapshot: drivingInput.snapshot(),
    inputVersion: drivingInput.version,
    deltaSeconds,
    measuredDeltaSeconds,
    simMs,
    chaseMs,
    environmentMs,
    sunMs,
    lightsMs,
    controlsMs,
    renderMs,
    totalMs,
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
  stats.end();
}

function createStatsPanel() {
  const panel = new Stats();
  panel.dom.style.position = "fixed";
  panel.dom.style.left = "0";
  panel.dom.style.top = "0";
  panel.dom.style.zIndex = "10000";
  document.body.appendChild(panel.dom);
  return panel;
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
    `gear=${Number.isFinite(debugState.gear) ? debugState.gear : "--"}`,
    `rpm=${Number.isFinite(debugState.engineRpm) ? debugState.engineRpm.toFixed(0) : "--"}`,
    `thr=${debugState.throttle.toFixed(1)}`,
    `st=${debugState.steer.toFixed(1)}`,
    `sraw=${Number.isFinite(debugState.steerRaw) ? debugState.steerRaw.toFixed(2) : "--"}`,
    `sf=${Number.isFinite(debugState.steerState) ? debugState.steerState.toFixed(2) : "--"}`,
    `slim=${Number.isFinite(debugState.steerLimit) ? debugState.steerLimit.toFixed(2) : "--"}`,
    `stgt=${Number.isFinite(debugState.steerTarget) ? debugState.steerTarget.toFixed(2) : "--"}`,
    `sl=${Number.isFinite(debugState.steerLeftDeg) ? debugState.steerLeftDeg.toFixed(1) : "--"}`,
    `sr=${Number.isFinite(debugState.steerRightDeg) ? debugState.steerRightDeg.toFixed(1) : "--"}`,
    `yr=${Number.isFinite(debugState.yawRateDeg) ? debugState.yawRateDeg.toFixed(1) : "--"}`,
    `lat=${Number.isFinite(debugState.speedRight) ? debugState.speedRight.toFixed(2) : "--"}`,
    `surf=${debugState.surfaceType ?? "--"}`,
    `grip=${Number.isFinite(debugState.surfaceGrip) ? debugState.surfaceGrip.toFixed(2) : "--"}`,
    `drv=${debugState.engineForce.toFixed(0)}`,
    `wc=${debugState.wheelContacts ?? 0}`,
    `imp=${Number.isFinite(debugState.forwardImpulse) ? debugState.forwardImpulse.toFixed(0) : "--"}`,
    `sus=${Number.isFinite(debugState.suspensionForce) ? debugState.suspensionForce.toFixed(0) : "--"}`,
    `slpL=${Number.isFinite(debugState.slipLongAvg) ? debugState.slipLongAvg.toFixed(2) : "--"}`,
    `slpT=${Number.isFinite(debugState.slipLatAvg) ? debugState.slipLatAvg.toFixed(2) : "--"}`,
    `aero=${Number.isFinite(debugState.aeroDragForce) ? debugState.aeroDragForce.toFixed(0) : "--"}`,
    `roll=${Number.isFinite(debugState.rollingResistanceDrag) ? debugState.rollingResistanceDrag.toFixed(0) : "--"}`,
    `ss=${Number.isFinite(debugState.simSteps) ? debugState.simSteps : "--"}`,
    `sb=${Number.isFinite(debugState.simBacklogMs) ? debugState.simBacklogMs.toFixed(1) : "--"}`,
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
  const hadLoadedRace = hasLoadedRace();
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
  if (hadLoadedRace) {
    queueTransition(() => loadSceneSelection({ reloadTrack, reloadCar }));
  }
}

function setSelection(nextPartialSelection) {
  const nextSelection = {
    ...selection,
    ...nextPartialSelection,
  };
  const selectedTrack = getTrackById(nextSelection.trackId);
  const selectedCar = getCarById(nextSelection.carId);
  const selectedSkin = getSkinById(selectedCar, nextSelection.skinId);

  Object.assign(selection, {
    trackId: selectedTrack?.id ?? selection.trackId,
    carId: selectedCar?.id ?? selection.carId,
    skinId: selectedSkin?.id ?? selection.skinId,
  });
  syncHudSelection(hud, { tracks: trackCatalog, cars: carCatalog, selection });
}

function loadRaceSelection() {
  runtimeDebug.autoPauseAfterLoad = true;
  setRacePaused(true);
  drivingInput.debugClear();
  return queueTransition(async () => {
    await loadSceneSelection({ reloadTrack: true, reloadCar: true });
    setRacePaused(true);
    drivingInput.debugClear();
  });
}

function unloadRaceSelection() {
  drivingInput.debugClear();
  setRacePaused(true);
  return queueTransition(async () => {
    disposeLoadedRace();
    setRacePaused(false);
    runtimeDebug.autoPauseAfterLoad = false;
  });
}

function setRacePaused(paused) {
  runtimeDebug.paused = Boolean(paused);
}

function hasLoadedRace() {
  return Boolean(sceneState.trackRoot || sceneState.carRoot || sceneState.drivingSimulation);
}

function queueTransition(task) {
  const nextTransition = transitionChain.then(() => task());
  transitionChain = nextTransition.catch((error) => {
    console.error("Error updating scene selection:", error);
  });
  return nextTransition;
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
      trackFloorSampler: sceneState.sceneSampler,
      debugOptions: runtimeDebug.physicsIsolation,
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
      trackFloorSampler: sceneState.sceneSampler,
      debugOptions: runtimeDebug.physicsIsolation,
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

function disposeLoadedRace() {
  sceneState.chaseCamera?.dispose?.();
  sceneState.chaseCamera = null;
  controls.enabled = false;

  sceneState.drivingSimulation?.dispose?.();
  sceneState.drivingSimulation = null;
  sceneState.lightsConfig = null;

  if (sceneState.carRoot) {
    scene.remove(sceneState.carRoot);
    disposeHierarchy(sceneState.carRoot);
    sceneState.carRoot = null;
    sceneState.tireRoot = null;
  }

  if (sceneState.trackRoot) {
    scene.remove(sceneState.trackRoot);
    disposeHierarchy(sceneState.trackRoot);
    sceneState.trackRoot = null;
  }

  if (sceneState.collisionAsset?.root) {
    if (sceneState.collisionAsset.root.parent === scene) {
      scene.remove(sceneState.collisionAsset.root);
    }
    disposeHierarchy(sceneState.collisionAsset.root);
  }

  sceneState.collisionAsset = null;
  sceneState.dynamicObjects = [];
  sceneState.contactSampler = null;
  sceneState.sceneSampler = null;
  sceneState.startPoints = [];

  sceneState.environmentController?.dispose?.();
  sceneState.environmentController = null;
  sceneState.environmentState?.dispose?.();
  sceneState.environmentState = null;
  smoothedVehicleSunVisibility = 1;
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
