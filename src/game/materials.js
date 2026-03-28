import * as THREE from "three";

export function createTextureRegistry(textureUrls) {
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();

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

  return { getTexture };
}

export function prepareMaterials(root, getTexture) {
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
      material ? createMaterialForName(material.name, getTexture) : material,
    );

    obj.material =
      mappedMaterials.length === 1 ? mappedMaterials[0] : mappedMaterials;
  });
}

function createMaterialForName(name, getTexture) {
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
