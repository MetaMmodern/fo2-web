import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import modelUrl from "./data/cars/car_1/model_assimp.glb";
import tireModelUrl from "./data/cars/shared/tire_4_out.glb";
import skin1TextureUrl from "url:./data/cars/car_1/skin1.png";
import commonTextureUrl from "url:./data/cars/shared/common.png";
import interiorTextureUrl from "url:./data/cars/shared/interior.png";
import windowsTextureUrl from "url:./data/cars/shared/windows.png";
import lightsTextureUrl from "url:./data/cars/shared/lights.png";
import shockTextureUrl from "url:./data/cars/shared/shock.png";
import shadowTextureUrl from "url:./data/cars/shared/shadow.png";
import tireTextureUrl from "url:./data/cars/shared/tire_04.png";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2ee);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(5.6, 2.8, 6.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const hud = document.createElement("aside");
hud.className = "hud";
document.body.appendChild(hud);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd7d1c7, 1.4);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.8);
keyLight.position.set(6, 10, 9);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xe8f1ff, 1.4);
fillLight.position.set(-7, 4, 6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.2);
rimLight.position.set(-4, 8, -10);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({
    color: 0xe8e5df,
    roughness: 0.98,
    metalness: 0,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 40),
  new THREE.MeshBasicMaterial({ color: 0xf7f4ee }),
);
backWall.position.set(0, 20, -16);
scene.add(backWall);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.target.set(0, 1, 0);

const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const textureUrls = {
  skin: skin1TextureUrl,
  common: commonTextureUrl,
  interior: interiorTextureUrl,
  windows: windowsTextureUrl,
  lights: lightsTextureUrl,
  shock: shockTextureUrl,
  shadow: shadowTextureUrl,
  tire: tireTextureUrl,
};

const textureCache = new Map();

loadCar();

window.addEventListener("resize", onResize);

function getTexture(textureName) {
  if (textureCache.has(textureName)) {
    return textureCache.get(textureName);
  }

  const texture = textureLoader.load(textureUrls[textureName]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  textureCache.set(textureName, texture);
  return texture;
}

function loadCar() {
  Promise.all([loadGltf(modelUrl), loadGltf(tireModelUrl)])
    .then(([carGltf, tireGltf]) => {
      const carRoot = carGltf.scene;
      const tireRoot = tireGltf.scene;

      scene.add(carRoot);

      prepareMaterials(carRoot);
      prepareMaterials(tireRoot);
      hideWheelhubMeshes(carRoot);
      addHoodUnderside(carRoot);
      attachTires(carRoot, tireRoot);
      centerCarAtOrigin(carRoot);
      updateHud(carRoot, tireRoot);
    })
    .catch((error) => {
      console.error("Error loading vehicle:", error);
    });
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

function prepareMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    obj.castShadow = true;
    obj.receiveShadow = true;

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    const mappedMaterials = sourceMaterials.map((material) =>
      material ? createMaterialForName(material.name) : material,
    );

    obj.material =
      mappedMaterials.length === 1 ? mappedMaterials[0] : mappedMaterials;
  });
}

function createMaterialForName(name) {
  if (name === "body") {
    return new THREE.MeshBasicMaterial({
      map: getTexture("skin"),
      color: 0xffffff,
      vertexColors: false,
    });
  }

  if (name === "common" || name === "shear") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("common"),
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.04,
    });
  }

  if (
    name === "shearspring" ||
    name === "shearhock" ||
    name === "scalespring" ||
    name === "scaleshock"
  ) {
    return new THREE.MeshStandardMaterial({
      map: getTexture("shock"),
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.05,
      roughness: 0.55,
      metalness: 0.18,
    });
  }

  if (name === "interior") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("interior"),
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
  }

  if (name.startsWith("window")) {
    return new THREE.MeshStandardMaterial({
      map: getTexture("windows"),
      color: 0xaebdc7,
      transparent: true,
      opacity: 0.42,
      roughness: 0.12,
      metalness: 0.05,
      depthWrite: false,
    });
  }

  if (name.startsWith("light_")) {
    const isFront = name.startsWith("light_front");
    const isBrake = name.startsWith("light_brake");
    const isReverse = name.startsWith("light_reverse");

    let lightColor = 0xffffff;
    let emissiveColor = 0x141414;
    let emissiveIntensity = 0.2;

    if (isFront) {
      lightColor = 0xf8f4ea;
      emissiveColor = 0xfff2c2;
      emissiveIntensity = 0.45;
    } else if (isBrake) {
      lightColor = 0xd86b5c;
      emissiveColor = 0xa11200;
      emissiveIntensity = 0.35;
    } else if (isReverse) {
      lightColor = 0xf2f6ff;
      emissiveColor = 0xa8c8ff;
      emissiveIntensity = 0.25;
    }

    return new THREE.MeshStandardMaterial({
      map: getTexture("lights"),
      color: lightColor,
      transparent: true,
      alphaTest: 0.12,
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity,
      roughness: 0.18,
      metalness: 0.04,
    });
  }

  if (name === "shadow") {
    return new THREE.MeshBasicMaterial({
      map: getTexture("shadow"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    });
  }

  if (name === "tire") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("tire"),
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
    });
  }

  if (name === "rim") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("tire"),
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.38,
      metalness: 0.32,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.72,
    metalness: 0.04,
  });
}

function centerCarAtOrigin(root) {
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

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

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
    carRoot.add(tireClone);
  });
}

function updateHud(carRoot, tireRoot) {
  const hubNames = [];
  const placeholderNames = [];
  const materialNames = new Set();
  const tireNodeNames = [];

  carRoot.traverse((obj) => {
    if (obj.name.startsWith("wheelhub_")) {
      hubNames.push(obj.name);
    }

    if (obj.name.startsWith("placeholder_tire_")) {
      placeholderNames.push(obj.name);
    }

    if (obj.isMesh) {
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach((material) => {
        if (material?.name) {
          materialNames.add(material.name);
        }
      });
    }
  });

  tireRoot.traverse((obj) => {
    if (obj.name.startsWith("tire_")) {
      tireNodeNames.push(obj.name);
    }
  });

  hud.innerHTML = `
    <div class="hud-section">
      <div class="hud-title">Wheel Hubs</div>
      <div class="hud-text">${hubNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Tire Placeholders</div>
      <div class="hud-text">${placeholderNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Tire Nodes</div>
      <div class="hud-text">${tireNodeNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Materials</div>
      <div class="hud-text">${Array.from(materialNames).join(", ") || "none"}</div>
    </div>
  `;
}

function hideWheelhubMeshes(carRoot) {
  carRoot.traverse((obj) => {
    if (obj.isMesh && obj.name.startsWith("wheelhub_")) {
      obj.visible = false;
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
