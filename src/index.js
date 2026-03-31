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
import { createHud, syncHudSelection, updateHudTelemetry } from "./game/hud";
import { createDrivingInput } from "./game/input";
import { createTextureRegistry, prepareMaterials } from "./game/materials";
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
  environmentController: null,
};
let transitionChain = Promise.resolve();

if (typeof window !== "undefined") {
  window.__flatoutDebug = {
    scene,
    camera,
    renderer,
    controls,
    get colorFilterPass() {
      return colorFilterPass;
    },
    get chaseCamera() {
      return sceneState.chaseCamera;
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
    sceneState.environmentController = await loadTrackEnvironment(
      scene,
      track.environment,
    );
    colorFilterPass.setFilterTextures({
      addTexture: track.environment.filterAddTexture,
      subTexture: track.environment.filterSubTexture,
    });
    colorFilterPass.applyWeatherProfile(track.environment.weatherProfile);

    const loadedTrack = await loadTrack(track, scene, renderer);
    sceneState.trackRoot = loadedTrack.trackRoot;
    sceneState.floorSampler = loadedTrack.floorSampler;
    sceneState.startPoints = loadedTrack.startPoints;
  }

  if (reloadCar) {
    const previousCameraState = sceneState.chaseCamera?.getState?.() ?? null;
    sceneState.chaseCamera?.dispose?.();
    sceneState.chaseCamera = null;
    sceneState.drivingSimulation = null;

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
    const [{ carRoot, tireRoot }, cameraConfig] = await Promise.all([
      loadVehicle(vehicleAssetUrls, scene, controls, (root) =>
        prepareMaterials(root, textureRegistry.getTexture),
      ),
      loadVehicleCameraConfig(vehicleAssetUrls.cameraConfig).catch((error) => {
        console.warn("Falling back to default chase camera config:", error);
        return null;
      }),
    ]);

    sceneState.carRoot = carRoot;
    sceneState.tireRoot = tireRoot;

    if (sceneState.trackRoot) {
      placeVehicleOnTrack(
        sceneState.trackRoot,
        carRoot,
        sceneState.startPoints,
        sceneState.floorSampler,
      );
    }

    sceneState.drivingSimulation = await createDrivingSimulation({
      carRoot,
      assetUrls: vehicleAssetUrls,
      input: drivingInput,
      trackFloorSampler: sceneState.floorSampler,
    });
    sceneState.chaseCamera = createChaseCamera(camera, controls, carRoot, {
      ...(cameraConfig ?? {}),
      debugControls: cameraDebug,
      getDynamics: () =>
        sceneState.drivingSimulation?.getCameraState?.() ?? null,
      trackFloorSampler: sceneState.floorSampler,
      initialState: previousCameraState,
    });
  } else if (reloadTrack && sceneState.trackRoot && sceneState.carRoot) {
    placeVehicleOnTrack(
      sceneState.trackRoot,
      sceneState.carRoot,
      sceneState.startPoints,
      sceneState.floorSampler,
    );
    sceneState.drivingSimulation = await createDrivingSimulation({
      carRoot: sceneState.carRoot,
      assetUrls: buildVehicleAssetUrls(car, skin),
      input: drivingInput,
      trackFloorSampler: sceneState.floorSampler,
    });
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
      material?.dispose?.();
    });
  });
}
