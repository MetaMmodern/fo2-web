import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import modelUrl from "./data/car_1/model_assimp.glb";
import skin1TextureUrl from "url:./data/car_1/skin1.png";
import commonTextureUrl from "url:./data/shared/common.png";
import interiorTextureUrl from "url:./data/shared/interior.png";
import windowsTextureUrl from "url:./data/shared/windows.png";
import lightsTextureUrl from "url:./data/shared/lights.png";
import shadowTextureUrl from "url:./data/shared/shadow.png";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f2ee);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(5.6, 2.8, 6.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

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
  shadow: shadowTextureUrl,
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
  gltfLoader.load(
    modelUrl,
    (gltf) => {
      const carRoot = gltf.scene;
      scene.add(carRoot);

      prepareMaterials(carRoot);
      centerCarAtOrigin(carRoot);
    },
    undefined,
    (error) => {
      console.error("Error loading model:", error);
    },
  );
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
      side: THREE.DoubleSide,
    });
  }

  if (name === "common" || name === "shear") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("common"),
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
  }

  if (
    name === "shearspring" ||
    name === "shearhock" ||
    name === "scalespring" ||
    name === "scaleshock"
  ) {
    return new THREE.MeshStandardMaterial({
      color: 0x8a8a8a,
      roughness: 0.55,
      metalness: 0.18,
      side: THREE.DoubleSide,
    });
  }

  if (name === "interior") {
    return new THREE.MeshStandardMaterial({
      map: getTexture("interior"),
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
  }

  if (name.startsWith("window")) {
    return new THREE.MeshStandardMaterial({
      map: getTexture("windows"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      roughness: 0.08,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
  }

  if (name.startsWith("light_")) {
    return new THREE.MeshStandardMaterial({
      map: getTexture("lights"),
      color: 0xffffff,
      emissive: new THREE.Color(0x2a1300),
      emissiveIntensity: 0.8,
      roughness: 0.45,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
  }

  if (name === "shadow") {
    return new THREE.MeshBasicMaterial({
      map: getTexture("shadow"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
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
