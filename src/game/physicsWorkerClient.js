import { createDrivingSimulation as createRapierDrivingSimulation } from "./physicsRapier";

export async function createDrivingSimulation(options) {
  return createRapierDrivingSimulation(options);
}
