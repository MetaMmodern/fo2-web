import "./styles.css";
import * as THREE from "three";

import {
  arenaEnvironmentAssetUrls,
  textureUrls,
  trackAssetUrls,
  vehicleAssetUrls,
} from "./game/assets";
import { loadArenaEnvironment } from "./game/environment";
import { createHud, updateHud } from "./game/hud";
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
const hud = createHud();
const { getTexture } = createTextureRegistry(
  textureUrls,
  renderer.capabilities.getMaxAnisotropy(),
);
const drivingInput = createDrivingInput();
const colorFilterPass = createColorFilterPass(renderer, {
  addTexture: arenaEnvironmentAssetUrls.filterAddTexture,
  subTexture: arenaEnvironmentAssetUrls.filterSubTexture,
});
colorFilterPass.applyWeatherProfile(arenaEnvironmentAssetUrls.weatherProfile);
let chaseCamera = null;
let drivingSimulation = null;
let environmentController = null;

if (typeof window !== "undefined") {
  window.__flatoutDebug = {
    scene,
    camera,
    renderer,
    controls,
    colorFilterPass,
    get chaseCamera() {
      return chaseCamera;
    },
    disableChaseCamera() {
      chaseCamera = null;
      controls.enabled = true;
    },
  };
}

Promise.all([
  loadArenaEnvironment(scene, arenaEnvironmentAssetUrls),
  loadTrack(trackAssetUrls, scene, renderer),
  loadVehicle(vehicleAssetUrls, scene, controls, (root) =>
    prepareMaterials(root, getTexture),
  ),
  loadVehicleCameraConfig(vehicleAssetUrls.cameraConfig).catch((error) => {
    console.warn("Falling back to default chase camera config:", error);
    return null;
  }),
])
  .then(async ([environment, { trackRoot, startPoints }, { carRoot, tireRoot }, cameraConfig]) => {
    environmentController = environment;
    placeVehicleOnTrack(trackRoot, carRoot, startPoints);
    drivingSimulation = await createDrivingSimulation({
      trackRoot,
      carRoot,
      assetUrls: vehicleAssetUrls,
      input: drivingInput,
    });
    chaseCamera = createChaseCamera(camera, controls, carRoot, cameraConfig ?? {});
    updateHud(hud, carRoot, tireRoot);
  })
  .catch((error) => {
    console.error("Error loading scene assets:", error);
  });

const frameClock = new THREE.Clock();

animate();

function animate() {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min(frameClock.getDelta(), 0.1);
  drivingSimulation?.update(deltaSeconds);
  chaseCamera?.update(deltaSeconds);
  environmentController?.update(camera);
  if (!chaseCamera) {
    controls.update();
  }
  colorFilterPass.render(scene, camera, {
    scene: environmentController?.getOverlayScene?.(),
    camera: environmentController?.getOverlayCamera?.(),
  });
}
