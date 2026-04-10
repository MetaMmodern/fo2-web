import * as THREE from "three";

import { createDrivingSimulation } from "./physics";

let simulation = null;
let inputState = createInputState();
let queuedContacts = [];
let workerCarRoot = null;

self.onmessage = async (event) => {
  const { type, payload } = event.data ?? {};

  if (type === "init") {
    inputState = createInputState();
    queuedContacts = normalizeContacts(payload.contacts);
    workerCarRoot = createWorkerCarRoot(payload.rig);
    simulation = await createDrivingSimulation({
      carId: payload.carId,
      carRoot: workerCarRoot,
      assetUrls: payload.assetUrls,
      input: inputState,
      trackFloorSampler: createQueuedSampler(),
      debugOptions: payload.debugOptions ?? null,
    });
    console.info("[physics-worker] ready", { carId: payload.carId });
    postState("ready");
    return;
  }

  if (!simulation) {
    return;
  }

  if (type === "step") {
    queuedContacts = normalizeContacts(payload.contacts);
    Object.assign(inputState, payload.inputState ?? {});
    simulation.update(payload.dt ?? 0);
    postState("step");
  }
};

function postState(kind) {
  self.postMessage({
    type: "state",
    payload: {
      kind,
      pose: {
        position: workerCarRoot.position.toArray(),
        quaternion: workerCarRoot.quaternion.toArray(),
      },
      tires: Array.from(workerCarRoot.__nodes.entries())
        .filter(([name]) => name.endsWith("_tire"))
        .map(([name, node]) => ({
          name,
          position: node.position.toArray(),
          quaternion: node.quaternion.toArray(),
        })),
      speedKph: simulation?.speedKph?.() ?? 0,
      cameraState: clonePlain(simulation?.getCameraState?.() ?? null),
      lightState: clonePlain(simulation?.getLightState?.() ?? null),
      config: clonePlain(simulation?.getConfig?.() ?? null),
    },
  });
}

function createQueuedSampler() {
  return {
    sample() {
      return queuedContacts.shift() ?? null;
    },
    raycast() {
      return null;
    },
  };
}

function createWorkerCarRoot(rig) {
  const nodes = new Map();
  for (const [name, node] of Object.entries(rig.nodes ?? {})) {
    nodes.set(name, {
      name,
      position: new THREE.Vector3().fromArray(node.position ?? [0, 0, 0]),
      quaternion: new THREE.Quaternion().fromArray(
        node.quaternion ?? [0, 0, 0, 1],
      ),
    });
  }

  return {
    position: new THREE.Vector3().fromArray(rig.position ?? [0, 0, 0]),
    quaternion: new THREE.Quaternion().fromArray(
      rig.quaternion ?? [0, 0, 0, 1],
    ),
    userData: {
      collisionBounds: rig.userData?.collisionBounds ?? null,
    },
    __nodes: nodes,
    getObjectByName(name) {
      return nodes.get(name) ?? null;
    },
    updateWorldMatrix() {},
    traverse(callback) {
      if (typeof callback !== "function") {
        return;
      }

      callback(this);
      for (const node of nodes.values()) {
        callback(node);
      }
    },
  };
}

function normalizeContacts(contacts) {
  return (contacts ?? []).map((contact) => {
    if (!contact) {
      return null;
    }

    return {
      point: new THREE.Vector3().fromArray(contact.point),
      normal: new THREE.Vector3().fromArray(contact.normal),
      distance: contact.distance,
      materialName: contact.materialName ?? "",
      surfaceType: contact.surfaceType ?? "default",
      object: null,
    };
  });
}

function createInputState() {
  return {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: 0,
    resetPressed: false,
  };
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
