import { createDrivingSimulation as createMainThreadDrivingSimulation } from "./physics";

export async function createDrivingSimulation(options) {
  // The worker experiment split simulation authority away from the live
  // scene graph, while chase camera, sun occlusion, lights, and render
  // still consume the main-thread car root every frame. Keep the baseline
  // coherent until that whole pipeline is moved together.
  return createMainThreadDrivingSimulation(options);
}
