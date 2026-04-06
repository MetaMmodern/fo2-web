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
import { createDrivingSimulation } from "./game/physics";
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
const hud = createHud({
  tracks: trackCatalog,
  cars: carCatalog,
  selection: { ...defaultSelection },
  cameraDebug,
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
  floorSampler: null,
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
  };
}

queueTransition(() =>
  loadSceneSelection({ reloadTrack: true, reloadCar: true }),
);

const frameClock = new THREE.Clock();

animate();

function animate() {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min(frameClock.getDelta(), 0.1);
  sceneState.drivingSimulation?.update(deltaSeconds);
  sceneState.chaseCamera?.update(deltaSeconds);
  sceneState.environmentController?.update(camera);
  updateVehicleSunOcclusion(deltaSeconds);
  updateVehicleLights();
  updateHudTelemetry(hud, {
    speedKph: sceneState.drivingSimulation?.speedKph?.() ?? 0,
  });

  if (!sceneState.chaseCamera) {
    controls.update();
  }

  colorFilterPass.render(scene, camera, {
    scene: sceneState.environmentController?.getOverlayScene?.(),
    camera: sceneState.environmentController?.getOverlayCamera?.(),
  });
}

function updateVehicleSunOcclusion(deltaSeconds) {
  if (
    !sceneState.carRoot ||
    !sceneState.floorSampler ||
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

  const hit = sceneState.floorSampler.raycast(sunOcclusionOrigin, sunOcclusionDirection, {
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
      sceneState.floorSampler = null;
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
    sceneState.floorSampler = loadedTrack.floorSampler;
    sceneState.startPoints = loadedTrack.startPoints;
    syncEnvironmentSunToTrack(sceneState.environmentState, sceneState.trackRoot);
    smoothedVehicleSunVisibility = 1;
  }

  if (reloadCar) {
    const previousCameraState = sceneState.chaseCamera?.getState?.() ?? null;
    sceneState.chaseCamera?.dispose?.();
    sceneState.chaseCamera = null;
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
        sceneState.floorSampler,
      );
    }

    sceneState.drivingSimulation = await createDrivingSimulation({
      carId: car.id,
      carRoot,
      assetUrls: vehicleAssetUrls,
      input: drivingInput,
      trackFloorSampler: sceneState.floorSampler,
      debugOptions: drivingDebug,
    });
    sceneState.chaseCamera = createChaseCamera(camera, controls, carRoot, {
      ...(cameraConfig ?? {}),
      debugControls: cameraDebug,
      getDynamics: () =>
        sceneState.drivingSimulation?.getCameraState?.() ?? null,
      trackFloorSampler: sceneState.floorSampler,
      initialState: previousCameraState,
    });
    updateVehicleLights();
  } else if (reloadTrack && sceneState.trackRoot && sceneState.carRoot) {
    placeVehicleOnTrack(
      sceneState.trackRoot,
      sceneState.carRoot,
      sceneState.startPoints,
      sceneState.floorSampler,
    );
    sceneState.drivingSimulation = await createDrivingSimulation({
      carId: car.id,
      carRoot: sceneState.carRoot,
      assetUrls: buildVehicleAssetUrls(car, skin),
      input: drivingInput,
      trackFloorSampler: sceneState.floorSampler,
      debugOptions: drivingDebug,
    });
    smoothedVehicleSunVisibility = 1;
    setVehicleSunVisibility(sceneState.carRoot, smoothedVehicleSunVisibility);
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
