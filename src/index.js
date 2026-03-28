import "./styles.css";

import {
  arenaEnvironmentAssetUrls,
  textureUrls,
  trackAssetUrls,
  vehicleAssetUrls,
} from "./game/assets";
import { loadArenaEnvironment } from "./game/environment";
import { createHud, updateHud } from "./game/hud";
import { createTextureRegistry, prepareMaterials } from "./game/materials";
import { createSceneApp, frameObject } from "./game/scene";
import { loadTrack, placeVehicleOnTrack } from "./game/track";
import { loadVehicle } from "./game/vehicle";

const { scene, camera, renderer, controls } = createSceneApp();
const hud = createHud();
const { getTexture } = createTextureRegistry(textureUrls);

Promise.all([
  loadArenaEnvironment(scene, arenaEnvironmentAssetUrls),
  loadTrack(trackAssetUrls, scene),
  loadVehicle(vehicleAssetUrls, scene, controls, (root) =>
    prepareMaterials(root, getTexture),
  ),
])
  .then(([, { trackRoot, startPoints }, { carRoot, tireRoot }]) => {
    placeVehicleOnTrack(trackRoot, carRoot, startPoints);
    frameObject(camera, controls, carRoot, {
      distanceScale: 1.05,
      heightScale: 0.65,
      lateralScale: 0.55,
      depthScale: 1.2,
    });
    updateHud(hud, carRoot, tireRoot);
  })
  .catch((error) => {
    console.error("Error loading scene assets:", error);
  });

animate();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
