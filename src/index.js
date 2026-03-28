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
import { createTextureRegistry, prepareMaterials } from "./game/materials";
import {
  createChaseCamera,
  createSceneApp,
  loadVehicleCameraConfig,
} from "./game/scene";
import { loadTrack, placeVehicleOnTrack } from "./game/track";
import { loadVehicle } from "./game/vehicle";

const { scene, camera, renderer, controls } = createSceneApp();
const hud = createHud();
const { getTexture } = createTextureRegistry(textureUrls);
let chaseCamera = null;

Promise.all([
  loadArenaEnvironment(scene, arenaEnvironmentAssetUrls),
  loadTrack(trackAssetUrls, scene),
  loadVehicle(vehicleAssetUrls, scene, controls, (root) =>
    prepareMaterials(root, getTexture),
  ),
  loadVehicleCameraConfig(vehicleAssetUrls.cameraConfig).catch((error) => {
    console.warn("Falling back to default chase camera config:", error);
    return null;
  }),
])
  .then(([, { trackRoot, startPoints }, { carRoot, tireRoot }, cameraConfig]) => {
    placeVehicleOnTrack(trackRoot, carRoot, startPoints);
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
  chaseCamera?.update(deltaSeconds);
  if (!chaseCamera) {
    controls.update();
  }
  renderer.render(scene, camera);
}
