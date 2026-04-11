import * as THREE from "three";

import { createDrivingSimulation } from "./physics";

const WORKER_STEP_DT = 1 / 60;
const WORKER_STEP_MS = 1000 / 60;
const POST_EVERY_TICKS = 2;

let simulation = null;
let inputState = createInputState();
let queuedContacts = [];
let contactIndex = 0;
let workerCarRoot = null;
let tickTimer = null;
let tickCount = 0;
let postSequence = 0;

self.onmessage = async (event) => {
  const { type, payload } = event.data ?? {};

  if (type === "init") {
    inputState = createInputState();
    queuedContacts = normalizeContacts(payload.contacts);
    contactIndex = 0;
    Object.assign(inputState, payload.inputState ?? {});
    workerCarRoot = createWorkerCarRoot(payload.rig);
    simulation = await createDrivingSimulation({
      carId: payload.carId,
      carRoot: workerCarRoot,
      assetUrls: payload.assetUrls,
      input: inputState,
      trackFloorSampler: createQueuedSampler(),
      bodyCollisionSampler: createQueuedSampler(),
      debugOptions: payload.debugOptions ?? null,
    });
    tickCount = 0;
    startTickLoop();
    console.info("[physics-worker] ready", { carId: payload.carId });
    postState("ready");
    return;
  }

  if (!simulation) {
    return;
  }

  if (type === "contacts") {
    queuedContacts = normalizeContacts(payload.contacts);
    contactIndex = 0;
    return;
  }

  if (type === "input") {
    Object.assign(inputState, payload.inputState ?? {});
    if (payload.consumeReset) {
      inputState.resetPressed = false;
    }
    return;
  }

  if (type === "dispose") {
    stopTickLoop();
    simulation = null;
    workerCarRoot = null;
  }
};

function startTickLoop() {
  stopTickLoop();

  const runTick = () => {
    if (!simulation) {
      tickTimer = null;
      return;
    }

    const updateStart = performance.now();
    simulation.update(WORKER_STEP_DT);
    const updateMs = performance.now() - updateStart;
    tickCount += 1;
    if (tickCount >= POST_EVERY_TICKS) {
      tickCount = 0;
      postState("step", { updateMs });
    }
    tickTimer = self.setTimeout(runTick, WORKER_STEP_MS);
  };

  tickTimer = self.setTimeout(runTick, WORKER_STEP_MS);
}

function stopTickLoop() {
  if (tickTimer !== null) {
    self.clearTimeout(tickTimer);
    tickTimer = null;
  }
}

function postState(kind, stats = {}) {
  const cameraState = simulation?.getCameraState?.() ?? null;
  const lightState = simulation?.getLightState?.() ?? null;
  self.postMessage({
    type: "state",
    payload: {
      kind,
      sentAt: performance.now(),
      sequence: postSequence++,
      workerStats: {
        updateMs: stats.updateMs ?? 0,
        queuedContacts: queuedContacts.length,
      },
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
      cameraState: cameraState ? { ...cameraState } : null,
      lightState: lightState ? { ...lightState } : null,
      ...(kind === "ready"
        ? {
            config: cloneShallow(simulation?.getConfig?.() ?? null),
          }
        : {}),
    },
  });
}

function createQueuedSampler() {
  return {
    sample() {
      if (queuedContacts.length === 0) {
        return null;
      }

      const contact = queuedContacts[contactIndex % queuedContacts.length] ?? null;
      contactIndex += 1;
      return contact;
    },
    raycast() {
      return null;
    },
  };
}

function createWorkerCarRoot(rig) {
  const collisionBounds = rig.userData?.collisionBounds ?? null;
  const rootBoundingBox = createBoundingBox(collisionBounds);
  const nodes = new Map();
  const children = [];

  for (const [name, node] of Object.entries(rig.nodes ?? {})) {
    const workerNode = {
      name,
      position: new THREE.Vector3().fromArray(node.position ?? [0, 0, 0]),
      quaternion: new THREE.Quaternion().fromArray(
        node.quaternion ?? [0, 0, 0, 1],
      ),
      children: [],
      matrixWorld: new THREE.Matrix4(),
      updateWorldMatrix() {},
    };
    nodes.set(name, workerNode);
    children.push(workerNode);
  }

  return {
    position: new THREE.Vector3().fromArray(rig.position ?? [0, 0, 0]),
    quaternion: new THREE.Quaternion().fromArray(
      rig.quaternion ?? [0, 0, 0, 1],
    ),
    userData: {
      collisionBounds,
    },
    geometry: rootBoundingBox
      ? {
          boundingBox: rootBoundingBox,
          getAttribute() {
            return undefined;
          },
          computeBoundingBox() {},
        }
      : undefined,
    __nodes: nodes,
    children,
    matrixWorld: new THREE.Matrix4(),
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

function createBoundingBox(collisionBounds) {
  if (!collisionBounds?.min || !collisionBounds?.max) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3().fromArray(collisionBounds.min),
    new THREE.Vector3().fromArray(collisionBounds.max),
  );
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

function cloneShallow(value) {
  return value == null ? value : { ...value };
}
