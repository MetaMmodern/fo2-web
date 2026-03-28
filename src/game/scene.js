import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function createSceneApp(container = document.body) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f2ee);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    1,
    60000,
  );
  camera.position.set(16, 9, 18);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.target.set(0, 1, 0);
  controls.minDistance = 0.5;
  controls.maxDistance = 1400;
  controls.maxPolarAngle = Math.PI;
  controls.zoomToCursor = true;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls };
}

export function frameObject(camera, controls, object, options = {}) {
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const distanceScale = options.distanceScale ?? 1.35;
  const heightScale = options.heightScale ?? 0.5;
  const lateralScale = options.lateralScale ?? 0.3;
  const depthScale = options.depthScale ?? 0.65;

  controls.target.copy(center);
  camera.position.set(
    center.x + size.x * lateralScale * distanceScale,
    center.y + Math.max(size.y * heightScale * distanceScale, 3),
    center.z + size.z * depthScale * distanceScale,
  );
  camera.lookAt(center);
}
