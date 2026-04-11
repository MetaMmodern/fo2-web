import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { trackCatalog } from "./game/catalog";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = "0";
document.body.style.background = "#101519";
document.body.style.color = "#e9f0f2";
document.body.style.fontFamily = "Menlo, Monaco, monospace";
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101519);
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);
camera.position.set(160, 140, 160);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 20, 0);
controls.update();

scene.add(new THREE.AxesHelper(25));
scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(120, 200, 80);
scene.add(sun);

const overlay = createOverlay();
document.body.appendChild(overlay.root);
const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const state = {
  glbRoot: null,
  groups: {
    primitives: new THREE.Group(),
    nodes: new THREE.Group(),
    dynamics: new THREE.Group(),
  },
  meta: null,
};

scene.add(state.groups.primitives, state.groups.nodes, state.groups.dynamics);

const availableTracks = trackCatalog.filter(
  (track) => track.collisionModel && track.collisionMeta,
);

for (const track of availableTracks) {
  const option = document.createElement("option");
  option.value = track.id;
  option.textContent = track.label;
  overlay.trackSelect.appendChild(option);
}

overlay.trackSelect.addEventListener("change", () => {
  loadTrackDebug(overlay.trackSelect.value).catch((error) => {
    overlay.info.textContent = String(error);
    console.error(error);
  });
});
overlay.showGlb.addEventListener("change", () => {
  if (state.glbRoot) {
    state.glbRoot.visible = overlay.showGlb.checked;
  }
});
overlay.showPrimitives.addEventListener("change", () => {
  state.groups.primitives.visible = overlay.showPrimitives.checked;
});
overlay.showNodes.addEventListener("change", () => {
  state.groups.nodes.visible = overlay.showNodes.checked;
});
overlay.showDynamics.addEventListener("change", () => {
  state.groups.dynamics.visible = overlay.showDynamics.checked;
});

renderer.domElement.addEventListener("click", onClick);
window.addEventListener("resize", onResize);

if (availableTracks[0]) {
  overlay.trackSelect.value = availableTracks[0].id;
  loadTrackDebug(availableTracks[0].id).catch(console.error);
}

animate();

async function loadTrackDebug(trackId) {
  const track = availableTracks.find((entry) => entry.id === trackId);

  if (!track) {
    return;
  }

  overlay.info.textContent = "Loading collision assets...";
  state.meta = await fetch(track.collisionMeta).then((response) => response.json());

  if (state.glbRoot) {
    scene.remove(state.glbRoot);
    disposeGroup(state.glbRoot);
    state.glbRoot = null;
  }

  clearGroup(state.groups.primitives);
  clearGroup(state.groups.nodes);
  clearGroup(state.groups.dynamics);

  const gltf = await loader.loadAsync(track.collisionModel);
  state.glbRoot = gltf.scene;
  state.glbRoot.visible = overlay.showGlb.checked;
  scene.add(state.glbRoot);

  buildBoxLines(
    state.groups.primitives,
    state.meta.bvh?.primitives ?? [],
    0xff8a33,
  );
  buildBoxLines(state.groups.nodes, state.meta.bvh?.nodes ?? [], 0x3ab0ff);
  buildBoxLines(
    state.groups.dynamics,
    state.meta.models?.filter((model) => model.name?.startsWith("dyn_")) ?? [],
    0x63ff74,
  );

  frameMetaBounds();
  overlay.info.textContent = [
    `track: ${track.label}`,
    `bvh primitives: ${state.meta.bvh?.primitiveCount ?? 0}`,
    `bvh nodes: ${state.meta.bvh?.nodeCount ?? 0}`,
    `dynamic markers: ${
      state.meta.models?.filter((model) => model.name?.startsWith("dyn_")).length ?? 0
    }`,
    `cdb2 tri offset: ${state.meta.cdb2Header?.triOffset ?? 0}`,
    `cdb2 vert offset: ${state.meta.cdb2Header?.vertOffset ?? 0}`,
  ].join("\n");
}

function buildBoxLines(group, items, colorHex) {
  const material = new THREE.LineBasicMaterial({ color: colorHex });

  for (const item of items) {
    const center = item.position ?? item.center;
    const radius = item.radius;

    if (!center || !radius) {
      continue;
    }

    const box = new THREE.Box3(
      new THREE.Vector3(
        center[0] - radius[0],
        center[1] - radius[1],
        center[2] - radius[2],
      ),
      new THREE.Vector3(
        center[0] + radius[0],
        center[1] + radius[1],
        center[2] + radius[2],
      ),
    );
    const helper = new THREE.Box3Helper(box, colorHex);
    helper.userData.meta = item;
    helper.material = material;
    group.add(helper);
  }
}

function onClick(event) {
  if (!state.meta) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = pickMetaBox(raycaster.ray);

  if (!hit) {
    return;
  }

  overlay.info.textContent = JSON.stringify(hit, null, 2);
}

function pickMetaBox(ray) {
  const candidates = [];

  if (overlay.showPrimitives.checked) {
    candidates.push(...(state.meta.bvh?.primitives ?? []));
  }
  if (overlay.showNodes.checked) {
    candidates.push(...(state.meta.bvh?.nodes ?? []));
  }
  if (overlay.showDynamics.checked) {
    candidates.push(
      ...(state.meta.models?.filter((model) => model.name?.startsWith("dyn_")) ?? []),
    );
  }

  let best = null;

  for (const item of candidates) {
    const center = item.position ?? item.center;
    const radius = item.radius;

    if (!center || !radius) {
      continue;
    }

    const box = new THREE.Box3(
      new THREE.Vector3(
        center[0] - radius[0],
        center[1] - radius[1],
        center[2] - radius[2],
      ),
      new THREE.Vector3(
        center[0] + radius[0],
        center[1] + radius[1],
        center[2] + radius[2],
      ),
    );
    const intersection = ray.intersectBox(box, new THREE.Vector3());

    if (!intersection) {
      continue;
    }

    const distance = intersection.distanceTo(ray.origin);

    if (!best || distance < best.distance) {
      best = {
        distance,
        ...item,
      };
    }
  }

  return best;
}

function frameMetaBounds() {
  const box = new THREE.Box3();
  box.makeEmpty();

  for (const item of state.meta?.bvh?.primitives ?? []) {
    const center = item.position;
    const radius = item.radius;
    if (!center || !radius) {
      continue;
    }
    box.expandByPoint(
      new THREE.Vector3(center[0] - radius[0], center[1] - radius[1], center[2] - radius[2]),
    );
    box.expandByPoint(
      new THREE.Vector3(center[0] + radius[0], center[1] + radius[1], center[2] + radius[2]),
    );
  }

  if (box.isEmpty()) {
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size.x * 0.8, size.y * 0.8, size.z * 0.8));
  controls.update();
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children.pop();
    disposeGroup(child);
  }
}

function disposeGroup(object) {
  object.traverse?.((node) => {
    node.geometry?.dispose?.();
    node.material?.dispose?.();
  });
}

function createOverlay() {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.top = "16px";
  root.style.left = "16px";
  root.style.zIndex = "5";
  root.style.padding = "12px";
  root.style.background = "rgba(7, 11, 14, 0.82)";
  root.style.border = "1px solid rgba(255,255,255,0.14)";
  root.style.backdropFilter = "blur(8px)";
  root.style.minWidth = "320px";

  const title = document.createElement("div");
  title.textContent = "Collision Debug";
  title.style.fontSize = "14px";
  title.style.marginBottom = "8px";

  const trackSelect = document.createElement("select");
  trackSelect.style.width = "100%";
  trackSelect.style.marginBottom = "8px";

  const showGlb = createCheckbox("Show GLB", true);
  const showPrimitives = createCheckbox("Show BVH Primitives", true);
  const showNodes = createCheckbox("Show BVH Nodes", false);
  const showDynamics = createCheckbox("Show Dynamic Markers", true);

  const info = document.createElement("pre");
  info.style.whiteSpace = "pre-wrap";
  info.style.fontSize = "11px";
  info.style.lineHeight = "1.45";
  info.style.maxHeight = "45vh";
  info.style.overflow = "auto";
  info.textContent = "Select a track.";

  root.append(
    title,
    trackSelect,
    showGlb.root,
    showPrimitives.root,
    showNodes.root,
    showDynamics.root,
    info,
  );

  return {
    root,
    trackSelect,
    showGlb: showGlb.input,
    showPrimitives: showPrimitives.input,
    showNodes: showNodes.input,
    showDynamics: showDynamics.input,
    info,
  };
}

function createCheckbox(label, checked) {
  const root = document.createElement("label");
  root.style.display = "block";
  root.style.fontSize = "12px";
  root.style.marginBottom = "4px";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.style.marginRight = "6px";
  root.append(input, document.createTextNode(label));
  return { root, input };
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
