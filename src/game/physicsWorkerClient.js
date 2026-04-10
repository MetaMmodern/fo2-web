import * as THREE from "three";

import { createDrivingSimulation as createMainThreadDrivingSimulation } from "./physics";

const WHEEL_NAMES = [
  "placeholder_tire_fl",
  "placeholder_tire_fr",
  "placeholder_tire_rl",
  "placeholder_tire_rr",
];
const CONTACT_RAY_HEIGHT = 2.8;
const CONTACT_RAY_DISTANCE = 4.6;

export async function createDrivingSimulation({
  carId,
  carRoot,
  assetUrls,
  input,
  trackFloorSampler = null,
  debugOptions = null,
}) {
  if (typeof Worker === "undefined") {
    console.warn("[physics-worker] Worker API unavailable, using main thread");
    return createMainThreadDrivingSimulation({
      carId,
      carRoot,
      assetUrls,
      input,
      trackFloorSampler,
      debugOptions,
    });
  }

  const worker = new Worker(new URL("./physicsWorker.js", import.meta.url), {
    type: "module",
  });
  const snapshotState = {
    speedKph: 0,
    cameraState: null,
    lightState: null,
    config: null,
  };
  const pending = {
    busy: false,
    accumulatedDt: 0,
  };

  try {
    await waitForInitialState(
      worker,
      {
        type: "init",
        payload: {
          carId,
          assetUrls,
          rig: buildWorkerRig(carRoot),
          debugOptions,
          contacts: sampleWheelContacts(carRoot, trackFloorSampler),
        },
      },
      carRoot,
      snapshotState,
    );
    console.info("[physics-worker] init ok", { carId });
  } catch (error) {
    worker.terminate();
    console.error("[physics-worker] init failed, using main thread", error);
    return createMainThreadDrivingSimulation({
      carId,
      carRoot,
      assetUrls,
      input,
      trackFloorSampler,
      debugOptions,
    });
  }

  worker.addEventListener("message", (event) => {
    if (event.data?.type !== "state") {
      return;
    }

    applyWorkerState(carRoot, snapshotState, event.data.payload);
    pending.busy = false;

    if (pending.accumulatedDt > 1e-6) {
      const dt = pending.accumulatedDt;
      pending.accumulatedDt = 0;
      pending.busy = true;
      worker.postMessage({
        type: "step",
        payload: {
          dt,
          inputState: readInputState(input),
          contacts: sampleWheelContacts(carRoot, trackFloorSampler),
        },
      });
    }
  });

  return {
    update(deltaSeconds) {
      pending.accumulatedDt += deltaSeconds;

      if (pending.busy) {
        return;
      }

      const dt = pending.accumulatedDt;
      pending.accumulatedDt = 0;
      pending.busy = true;
      worker.postMessage({
        type: "step",
        payload: {
          dt,
          inputState: readInputState(input),
          contacts: sampleWheelContacts(carRoot, trackFloorSampler),
        },
      });
    },
    speedKph() {
      return snapshotState.speedKph ?? 0;
    },
    getCameraState() {
      return snapshotState.cameraState;
    },
    getLightState() {
      return snapshotState.lightState;
    },
    getConfig() {
      return snapshotState.config;
    },
    dispose() {
      worker.terminate();
    },
  };
}

function waitForInitialState(worker, message, carRoot, snapshotState) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Physics worker timed out during init."));
    }, 4000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
    };

    const onMessage = (event) => {
      if (event.data?.type !== "state") {
        return;
      }
      cleanup();
      applyWorkerState(carRoot, snapshotState, event.data.payload);
      resolve();
    };
    const onError = (event) => {
      cleanup();
      reject(event.error ?? new Error(event.message ?? "Worker error"));
    };
    const onMessageError = () => {
      cleanup();
      reject(new Error("Worker message serialization failed"));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError, { once: true });
    worker.addEventListener("messageerror", onMessageError, { once: true });
    worker.postMessage(message);
  });
}

function buildWorkerRig(carRoot) {
  const collisionBounds = resolveCollisionBounds(carRoot);
  const nodes = {};
  for (const name of WHEEL_NAMES) {
    const anchor = carRoot.getObjectByName(name);
    const tire = carRoot.getObjectByName(`${name}_tire`);

    if (anchor) {
      nodes[name] = {
        position: anchor.position.toArray(),
        quaternion: anchor.quaternion.toArray(),
      };
    }

    if (tire) {
      nodes[`${name}_tire`] = {
        position: tire.position.toArray(),
        quaternion: tire.quaternion.toArray(),
      };
    }
  }

  return {
    position: carRoot.position.toArray(),
    quaternion: carRoot.quaternion.toArray(),
    userData: {
      collisionBounds,
    },
    nodes,
  };
}

function resolveCollisionBounds(carRoot) {
  if (carRoot.userData?.collisionBounds?.min && carRoot.userData?.collisionBounds?.max) {
    return carRoot.userData.collisionBounds;
  }

  const box = new THREE.Box3().setFromObject(carRoot);
  const bounds = {
    min: box.min.clone().sub(carRoot.position).toArray(),
    max: box.max.clone().sub(carRoot.position).toArray(),
  };
  carRoot.userData.collisionBounds = bounds;
  return bounds;
}

function sampleWheelContacts(carRoot, trackFloorSampler) {
  if (!trackFloorSampler) {
    return [];
  }

  const anchorOffset = new THREE.Vector3();
  const anchorWorld = new THREE.Vector3();

  return WHEEL_NAMES.map((wheelName) => {
    const anchor = carRoot.getObjectByName(wheelName);

    if (!anchor) {
      return null;
    }

    anchorOffset.copy(anchor.position).applyQuaternion(carRoot.quaternion);
    anchorWorld.copy(carRoot.position).add(anchorOffset);
    const hit = trackFloorSampler.sample(anchorWorld, {
      rayHeight: CONTACT_RAY_HEIGHT,
      rayDistance: CONTACT_RAY_DISTANCE,
      minUpDot: -0.2,
    });

    if (!hit) {
      return null;
    }

    return {
      point: hit.point.toArray(),
      normal: hit.normal.toArray(),
      distance: hit.distance,
      materialName: hit.materialName ?? "",
      surfaceType: hit.surfaceType ?? "default",
    };
  });
}

function applyWorkerState(carRoot, snapshotState, payload) {
  if (payload?.pose) {
    carRoot.position.fromArray(payload.pose.position);
    carRoot.quaternion.fromArray(payload.pose.quaternion);
  }

  for (const tire of payload?.tires ?? []) {
    const tireNode = carRoot.getObjectByName(tire.name);

    if (!tireNode) {
      continue;
    }

    tireNode.position.fromArray(tire.position);
    tireNode.quaternion.fromArray(tire.quaternion);
  }

  snapshotState.speedKph = payload?.speedKph ?? 0;
  snapshotState.cameraState = payload?.cameraState ?? null;
  snapshotState.lightState = payload?.lightState ?? null;
  snapshotState.config = payload?.config ?? null;
}

function readInputState(input) {
  return {
    throttle: input?.throttle ?? 0,
    brake: input?.brake ?? 0,
    steer: input?.steer ?? 0,
    handbrake: input?.handbrake ?? 0,
    resetPressed: Boolean(input?.resetPressed),
  };
}
