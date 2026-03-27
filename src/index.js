import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import car_1_model from "./data/car_1/model.glb";
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000,
);
camera.position.set(4, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(40, 40);
scene.add(grid);

// Axes helper (optional)
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Load model
const loader = new GLTFLoader();

loader.load(
  car_1_model,
  (gltf) => {
    const car = gltf.scene;

    scene.add(car);

    // Optional: inspect parts
    car.traverse((obj) => {
      if (obj.isMesh) {
        console.log("mesh:", obj.name, obj);

        obj.castShadow = true;
        obj.receiveShadow = true;

        // Helpful if normals/materials came in weird
        if (obj.material) {
          obj.material.side = THREE.FrontSide;
        }

        // If shading looks broken, try uncommenting this:
        // obj.geometry.computeVertexNormals();
      }
    });

    // Center model automatically
    const box = new THREE.Box3().setFromObject(car);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    car.position.sub(center);
    car.position.y += size.y * 0.5;

    // Optional: scale if too huge/tiny
    // car.scale.setScalar(0.01);

    controls.target.set(0, size.y * 0.4, 0);

    console.log("Model loaded");
    console.log("Size:", size);
    console.log("Center:", center);
  },
  (progress) => {
    if (progress.total) {
      console.log(
        `Loading: ${((progress.loaded / progress.total) * 100).toFixed(1)}%`,
      );
    }
  },
  (error) => {
    console.error("Error loading GLB:", error);
  },
);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
