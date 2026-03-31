import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export async function loadVehicle(assetUrls, scene, controls, prepareMaterials) {
  const gltfLoader = createVehicleLoader(assetUrls.textureOverrides);
  const [carGltf, tireGltf] = await Promise.all([
    loadGltf(gltfLoader, assetUrls.carModel),
    loadGltf(gltfLoader, assetUrls.tireModel),
  ]);

  const carRoot = carGltf.scene;
  const tireRoot = tireGltf.scene;

  scene.add(carRoot);

  prepareMaterials(carRoot);
  prepareMaterials(tireRoot);
  hideWheelhubMeshes(carRoot);
  hideCrashMeshes(carRoot);
  addHoodUnderside(carRoot);
  attachTires(carRoot, tireRoot);
  centerCarAtOrigin(carRoot, controls);

  return { carRoot, tireRoot };
}

function loadGltf(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function createVehicleLoader(textureOverrides = {}) {
  const loadingManager = new THREE.LoadingManager();
  const normalizedOverrides = new Map();

  Object.entries(textureOverrides).forEach(([key, value]) => {
    normalizedOverrides.set(key.toLowerCase(), value);
    normalizedOverrides.set(normalizeTextureOverrideKey(key), value);
  });

  loadingManager.setURLModifier((url) => {
    if (!url || url === "null") {
      return createTransparentTextureDataUrl();
    }

    const normalizedUrl = url.replace(/^.*[\\/]/, "").toLowerCase();
    const normalizedTextureKey = normalizeTextureOverrideKey(url);

    if (normalizedOverrides.has(normalizedUrl)) {
      return normalizedOverrides.get(normalizedUrl);
    }

    if (normalizedOverrides.has(normalizedTextureKey)) {
      return normalizedOverrides.get(normalizedTextureKey);
    }

    return url;
  });

  return new GLTFLoader(loadingManager);
}

function createTransparentTextureDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
}

function normalizeTextureOverrideKey(url) {
  return url
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

function centerCarAtOrigin(root, controls) {
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  root.position.sub(center);
  root.position.y += size.y * 0.5;
  controls.target.set(0, size.y * 0.38, 0);
}

function addHoodUnderside(carRoot) {
  const hood = carRoot.getObjectByName("hood");

  if (!hood || !hood.parent) {
    return;
  }

  const hoodUnderside = hood.clone(true);
  hoodUnderside.name = "hood_underside";

  hoodUnderside.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    const sourceMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
    const undersideMaterials = sourceMaterials.map((material) => {
      if (!material) {
        return material;
      }

      const undersideMaterial = material.clone();
      undersideMaterial.side = THREE.BackSide;
      undersideMaterial.color = undersideMaterial.color.clone().multiplyScalar(0.78);
      undersideMaterial.depthWrite = true;
      undersideMaterial.polygonOffset = true;
      undersideMaterial.polygonOffsetFactor = 1;
      undersideMaterial.polygonOffsetUnits = 1;
      return undersideMaterial;
    });

    obj.material =
      undersideMaterials.length === 1 ? undersideMaterials[0] : undersideMaterials;
    obj.castShadow = false;
    obj.receiveShadow = true;
  });

  hood.parent.add(hoodUnderside);
}

function attachTires(carRoot, tireRoot) {
  const tireTemplates = {
    placeholder_tire_fl: tireRoot.getObjectByName("tire_fl"),
    placeholder_tire_fr: tireRoot.getObjectByName("tire_fr"),
    placeholder_tire_rl: tireRoot.getObjectByName("tire_rl"),
    placeholder_tire_rr: tireRoot.getObjectByName("tire_rr"),
  };

  Object.entries(tireTemplates).forEach(([anchorName, tireTemplate]) => {
    const anchor = carRoot.getObjectByName(anchorName);

    if (!anchor || !tireTemplate) {
      return;
    }

    const tireClone = tireTemplate.clone(true);
    tireClone.name = `${anchorName}_tire`;
    tireClone.position.copy(anchor.position);
    tireClone.userData.basePosition = anchor.position.clone();
    tireClone.userData.baseQuaternion = tireClone.quaternion.clone();
    carRoot.add(tireClone);
  });
}

function hideWheelhubMeshes(carRoot) {
  carRoot.traverse((obj) => {
    if (obj.isMesh && obj.name.startsWith("wheelhub_")) {
      obj.visible = false;
    }
  });
}

function hideCrashMeshes(carRoot) {
  carRoot.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    if (obj.name?.toLowerCase?.().endsWith("_crash")) {
      obj.visible = false;
    }
  });
}
