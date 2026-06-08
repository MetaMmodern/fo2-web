import { createDrivingSimulation as createOriginalDrivingSimulation } from "./physics";
import { createDrivingSimulation as createRapierDrivingSimulation } from "./physicsRapier";

export const DRIVING_SIMULATION_MODES = {
  rapier: "Rapier",
  original: "Original JS",
};

export async function createDrivingSimulation(options) {
  const mode = normalizeDrivingSimulationMode(options?.simulationMode);

  if (mode === DRIVING_SIMULATION_MODES.original) {
    return createOriginalDrivingSimulation({
      ...options,
      trackFloorSampler: options?.trackFloorSampler,
    });
  }

  return createRapierDrivingSimulation(options);
}

export function normalizeDrivingSimulationMode(mode) {
  if (mode === DRIVING_SIMULATION_MODES.original || mode === "original") {
    return DRIVING_SIMULATION_MODES.original;
  }

  return DRIVING_SIMULATION_MODES.rapier;
}
