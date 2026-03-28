import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import { arenaTrackTextureUrls } from "./generated/arenaTrackTextureManifest";

const textureNameAliases = {
  colormap: "col",
};

export async function loadTrack(assetUrls, scene) {
  const [trackRoot, trackMaterialInfo, startPoints] = await Promise.all([
    loadFbx(assetUrls.model),
    loadTrackMaterialInfo(assetUrls.log),
    loadStartPoints(assetUrls.startPoints),
  ]);

  const getTrackTexture = createTrackTextureRegistry(arenaTrackTextureUrls);
  const trackLightMap = loadTrackLightMap(assetUrls.lightmap);

  prepareTrackMaterials(
    trackRoot,
    trackMaterialInfo,
    getTrackTexture,
    trackLightMap,
  );
  alignTrackAtOrigin(trackRoot);
  scene.add(trackRoot);

  return { trackRoot, startPoints };
}

export function placeVehicleOnTrack(trackRoot, carRoot, startPoints = []) {
  if (startPoints.length > 0) {
    const spawnPoint = startPoints[0];
    carRoot.position.set(
      trackRoot.position.x + spawnPoint.position.x,
      trackRoot.position.y + spawnPoint.position.y + 0.35,
      trackRoot.position.z + spawnPoint.position.z,
    );
    carRoot.rotation.set(0, spawnPoint.yaw + Math.PI, 0);
    return;
  }

  const trackBox = new THREE.Box3().setFromObject(trackRoot);
  const trackSize = new THREE.Vector3();
  trackBox.getSize(trackSize);

  carRoot.position.set(0, 3, trackSize.z * 0.22);
  carRoot.rotation.set(0, Math.PI, 0);
}

function loadFbx(url) {
  const loader = new FBXLoader();

  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadTrackMaterialInfo(logUrl) {
  const response = await fetch(logUrl);

  if (!response.ok) {
    throw new Error(`Failed to load track log: ${response.status}`);
  }

  return parseTrackLog(await response.text());
}

async function loadStartPoints(startPointsUrl) {
  const response = await fetch(startPointsUrl);

  if (!response.ok) {
    throw new Error(`Failed to load track start points: ${response.status}`);
  }

  return parseStartPoints(await response.text());
}

function parseTrackLog(logText) {
  const materialsByName = new Map();
  const lines = logText.split(/\r?\n/);
  let currentMaterial = null;

  for (const line of lines) {
    const materialHeader = line.match(/^Material (\d+)$/);

    if (materialHeader) {
      if (currentMaterial?.name) {
        materialsByName.set(currentMaterial.name, currentMaterial);
      }

      currentMaterial = {
        textures: [],
      };
      continue;
    }

    if (!currentMaterial) {
      continue;
    }

    if (line === "Materials end") {
      if (currentMaterial.name) {
        materialsByName.set(currentMaterial.name, currentMaterial);
      }
      break;
    }

    if (line.startsWith("Name: ")) {
      currentMaterial.name = line.slice("Name: ".length).trim();
      continue;
    }

    if (line.startsWith("nAlpha: ")) {
      currentMaterial.alpha =
        Number.parseInt(line.slice("nAlpha: ".length), 10) || 0;
      continue;
    }

    const shaderMatch = line.match(/^nShaderId:\s+(\d+)/);

    if (shaderMatch) {
      currentMaterial.shaderId = Number.parseInt(shaderMatch[1], 10) || 0;
      continue;
    }

    if (line.startsWith("nUseColormap: ")) {
      currentMaterial.useColormap =
        Number.parseInt(line.slice("nUseColormap: ".length), 10) === 1;
      continue;
    }

    const textureMatch = line.match(/^Texture ([123]):\s*(.*)$/);

    if (textureMatch) {
      const textureIndex = Number.parseInt(textureMatch[1], 10) - 1;
      const textureName = textureMatch[2].trim();
      currentMaterial.textures[textureIndex] = textureName || null;
    }
  }

  return materialsByName;
}

function createTrackTextureRegistry(textureUrls) {
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();

  return function getTrackTexture(textureName) {
    const normalizedName = normalizeTextureName(textureName);

    if (!normalizedName) {
      return null;
    }

    if (textureCache.has(normalizedName)) {
      return textureCache.get(normalizedName);
    }

    const textureUrl = textureUrls[normalizedName];

    if (!textureUrl) {
      return null;
    }

    const texture = textureLoader.load(textureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    textureCache.set(normalizedName, texture);
    return texture;
  };
}

function loadTrackLightMap(lightMapUrl) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(lightMapUrl);
  texture.flipY = true; // this is correct, keep it
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function normalizeTextureName(textureName) {
  if (!textureName) {
    return null;
  }

  const baseName = textureName
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();

  return textureNameAliases[baseName] || baseName;
}

function prepareTrackMaterials(
  root,
  trackMaterialInfo,
  getTrackTexture,
  trackLightMap,
) {
  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    obj.castShadow = false;
    obj.receiveShadow = true;

    promoteSecondaryUvSet(obj.geometry);

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    const usesVertexColors = Boolean(obj.geometry?.getAttribute("color"));
    const mappedMaterials = sourceMaterials.map((sourceMaterial) =>
      createTrackMaterial(
        sourceMaterial,
        trackMaterialInfo,
        getTrackTexture,
        usesVertexColors,
        Boolean(obj.geometry?.getAttribute("uv2")),
        trackLightMap,
      ),
    );

    obj.material =
      mappedMaterials.length === 1 ? mappedMaterials[0] : mappedMaterials;
  });
}

function createTrackMaterial(
  sourceMaterial,
  trackMaterialInfo,
  getTrackTexture,
  usesVertexColors,
  hasLightMapUv,
  trackLightMap,
) {
  if (!sourceMaterial) {
    return sourceMaterial;
  }

  const materialInfo = resolveTrackMaterialInfo(
    sourceMaterial.name,
    trackMaterialInfo,
  );
  const diffuseTextureName = pickTrackTextureName(materialInfo);
  const diffuseTexture = getTrackTexture(diffuseTextureName);
  const detailTextureName = pickTrackDetailTextureName(materialInfo);
  const detailTexture = getTrackTexture(detailTextureName);
  const isAlphaMaterial = materialInfo?.alpha === 1;
  const isWindowShader = materialInfo?.shaderId === 34;
  const isLeafLikeShader =
    materialInfo?.shaderId === 20 || materialInfo?.shaderId === 21;
  const shouldUseLightMap =
    hasLightMapUv && !isAlphaMaterial && !isWindowShader;
  const isTerrainShader = materialInfo?.shaderId === 2;

  if (isWindowShader) {
    return new THREE.MeshStandardMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      color: 0xd7e4ea,
      vertexColors: usesVertexColors,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.08,
      depthWrite: false,
      lightMap: shouldUseLightMap ? trackLightMap : null,
      lightMapIntensity: 1.1,
    });
  }

  if (isAlphaMaterial || isLeafLikeShader) {
    return new THREE.MeshStandardMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      color: 0xffffff,
      vertexColors: usesVertexColors,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
      lightMap: shouldUseLightMap ? trackLightMap : null,
      lightMapIntensity: 1.05,
    });
  }

  if (isTerrainShader) {
    return new THREE.MeshBasicMaterial({
      name: sourceMaterial.name,
      map: trackLightMap,
      color: 0xffffff,
    });
  }

  return new THREE.MeshStandardMaterial({
    name: sourceMaterial.name,
    map: diffuseTexture,
    color: 0xffffff,
    vertexColors: usesVertexColors,
    roughness: 0.88,
    metalness: 0,
    lightMap: shouldUseLightMap ? trackLightMap : null,
    lightMapIntensity: 1.1,
    emissiveMap: null,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
}

function pickTrackTextureName(materialInfo) {
  if (!materialInfo) {
    return null;
  }

  if (materialInfo.useColormap && materialInfo.textures[0]) {
    return materialInfo.textures[0];
  }

  return materialInfo.textures.find(Boolean) || null;
}

function pickTrackDetailTextureName(materialInfo) {
  if (!materialInfo?.useColormap) {
    return null;
  }

  return materialInfo.textures[1] || null;
}

function resolveTrackMaterialInfo(sourceMaterialName, trackMaterialInfo) {
  if (!sourceMaterialName) {
    return null;
  }

  if (trackMaterialInfo.has(sourceMaterialName)) {
    return trackMaterialInfo.get(sourceMaterialName);
  }

  const normalizedSourceName = normalizeTextureName(sourceMaterialName);

  for (const materialInfo of trackMaterialInfo.values()) {
    if (normalizeTextureName(materialInfo.name) === normalizedSourceName) {
      return materialInfo;
    }

    for (const textureName of materialInfo.textures) {
      if (normalizeTextureName(textureName) === normalizedSourceName) {
        return materialInfo;
      }
    }
  }

  return null;
}

function alignTrackAtOrigin(trackRoot) {
  const box = new THREE.Box3().setFromObject(trackRoot);
  const center = new THREE.Vector3();

  box.getCenter(center);
  trackRoot.position.x -= center.x;
  trackRoot.position.z -= center.z;
  trackRoot.position.y -= box.min.y;
}

function promoteSecondaryUvSet(geometry) {
  if (!geometry) {
    return;
  }

  if (!geometry.getAttribute("uv2")) {
    const uv1 = geometry.getAttribute("uv1");
    if (uv1) {
      geometry.setAttribute("uv2", uv1.clone());
      return;
    }
  }

  if (!geometry.getAttribute("uv2")) {
    const uv = geometry.getAttribute("uv");
    if (uv) {
      geometry.setAttribute("uv2", uv.clone());
    }
  }
}

function parseStartPoints(startPointsText) {
  const blocks = Array.from(
    startPointsText.matchAll(
      /\[\d+\]\s*=\s*\{\s*Position\s*=\s*\{\s*([^}]+)\}\s*,\s*Orientation\s*=\s*\{\s*([^}]+)\}\s*\}/gms,
    ),
  );

  return blocks.map((match) => {
    const position = match[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    const orientation = match[2]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));

    return {
      position: new THREE.Vector3(position[0], position[1], position[2]),
      orientation,
      yaw: THREE.MathUtils.degToRad(orientation[1] ?? 0),
    };
  });
}
