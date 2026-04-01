import * as THREE from "three";

export function createTextureRegistry(textureUrls, maxAnisotropy = 1) {
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();

  function getTexture(textureName) {
    if (textureCache.has(textureName)) {
      return textureCache.get(textureName);
    }

    const texture = textureLoader.load(textureUrls[textureName]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.anisotropy = maxAnisotropy;
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
  const materialName = name ?? "";

  if (name === "body") {
    return new THREE.MeshBasicMaterial({
      name: materialName,
      map: getTexture("skin"),
      color: 0xffffff,
      vertexColors: true,
    });
  }

  if (name === "common" || name === "shear") {
    return new THREE.MeshStandardMaterial({
      name: materialName,
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
      name: materialName,
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
      name: materialName,
      map: getTexture("interior"),
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
    });
  }

  if (name.startsWith("window")) {
    const material = new THREE.MeshStandardMaterial({
      name: materialName,
      map: getTexture("windows"),
      color: 0x8ea2ad,
      transparent: true,
      opacity: 0.5,
      roughness: 0.08,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          float flatoutWindowFresnel(vec3 viewDir, vec3 normal) {
            float facing = 1.0 - abs(dot(normalize(viewDir), normalize(normal)));
            return pow(clamp(facing, 0.0, 1.0), 5.0);
          }`,
        )
        .replace(
          "#include <opaque_fragment>",
          `float flatoutFresnel = flatoutWindowFresnel(vViewPosition, normal);
          outgoingLight = mix(outgoingLight * 0.52, vec3(0.72, 0.82, 0.90), flatoutFresnel * 0.9);
          diffuseColor.a = max(diffuseColor.a, 0.48);
          #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => "flatout-window-fresnel-v1";
    return material;
  }

  if (name.startsWith("light_")) {
    const isFront = name.startsWith("light_front");
    const isBrake = name.startsWith("light_brake");
    const isReverse = name.startsWith("light_reverse");

    let lightColor = 0xffffff;
    let emissiveColor = 0x141414;
    let emissiveIntensity = 0.32;

    if (isFront) {
      emissiveColor = 0xffefc1;
      emissiveIntensity = 0.55;
    } else if (isBrake) {
      emissiveColor = 0xa11200;
      emissiveIntensity = 0.65;
    } else if (isReverse) {
      emissiveColor = 0xa8c8ff;
      emissiveIntensity = 0.5;
    }

    return new THREE.MeshStandardMaterial({
      name: materialName,
      map: getTexture("lights"),
      color: lightColor,
      transparent: isFront,
      alphaTest: 0.02,
      emissiveMap: getTexture("lights"),
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity,
      roughness: 0.18,
      metalness: 0.04,
      depthWrite: !isFront,
      side: THREE.DoubleSide,
    });
  }

  if (name === "shadow") {
    return new THREE.MeshBasicMaterial({
      name: materialName,
      map: getTexture("shadow"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    });
  }

  if (name === "tire") {
    return new THREE.MeshStandardMaterial({
      name: materialName,
      map: getTexture("tire"),
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
    });
  }

  if (name === "rim") {
    return new THREE.MeshStandardMaterial({
      name: materialName,
      map: getTexture("tire"),
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.38,
      metalness: 0.32,
    });
  }

  return new THREE.MeshStandardMaterial({
    name: materialName,
    color: 0x777777,
    roughness: 0.72,
    metalness: 0.04,
  });
}
