import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

import { arenaTrackTextureUrls } from "./generated/arenaTrackTextureManifest";

const textureNameAliases = {
  colormap: "col",
};

export async function loadTrack(assetUrls, scene, renderer) {
  const [trackRoot, trackMaterialInfo, startPoints] = await Promise.all([
    loadFbx(assetUrls.model),
    loadTrackMaterialInfo(assetUrls.log),
    loadStartPoints(assetUrls.startPoints),
  ]);

  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const getTrackTexture = createTrackTextureRegistry(arenaTrackTextureUrls, maxAnisotropy);
  const trackLightMap = loadTrackLightMap(assetUrls.lightmap, maxAnisotropy);

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
    const spawnPoint = transformStartPointToScene(startPoints[0]);
    carRoot.position.set(
      trackRoot.position.x + spawnPoint.position.x,
      trackRoot.position.y + spawnPoint.position.y + 0.35,
      trackRoot.position.z + spawnPoint.position.z,
    );
    carRoot.quaternion.copy(spawnPoint.quaternion);
    carRoot.rotateY(Math.PI);
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

  return normalizeStartPointGrid(parseStartPoints(await response.text()));
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

function createTrackTextureRegistry(textureUrls, maxAnisotropy) {
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
    texture.anisotropy = maxAnisotropy;
    textureCache.set(normalizedName, texture);
    return texture;
  };
}

function loadTrackLightMap(lightMapUrl, maxAnisotropy) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(lightMapUrl);
  texture.flipY = true; // this is correct, keep it
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
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
  const isStaticPrelitShader = materialInfo?.shaderId === 0;

  if (isStaticPrelitShader) {
    return createStaticPrelitMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      useVertexColors: usesVertexColors,
      transparent: isAlphaMaterial || isLeafLikeShader,
      alphaTest: isAlphaMaterial || isLeafLikeShader ? 0.35 : 0,
      side: isAlphaMaterial || isLeafLikeShader ? THREE.DoubleSide : THREE.FrontSide,
      brightnessScale: getStaticPrelitBrightnessScale(sourceMaterial.name),
    });
  }

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
    return createTerrainMaterial({
      name: sourceMaterial.name,
      colorMap: trackLightMap,
      detailMap: detailTexture || diffuseTexture,
      useVertexColors: usesVertexColors,
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

function createStaticPrelitMaterial({
  name,
  map,
  useVertexColors,
  transparent,
  alphaTest,
  side,
  brightnessScale,
}) {
  const material = new THREE.MeshBasicMaterial({
    name,
    map,
    color: 0xffffff,
    transparent,
    alphaTest,
    side,
    vertexColors: useVertexColors,
  });

  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      diffuseColor.rgb = clamp(diffuseColor.rgb * ${brightnessScale.toFixed(2)}, 0.0, 1.0);`,
    );
  };
  material.customProgramCacheKey = () => `flatout-static-prelit-${name}-${brightnessScale.toFixed(2)}`;

  return material;
}

function getStaticPrelitBrightnessScale(materialName) {
  const normalizedName = materialName?.toLowerCase() ?? "";

  if (normalizedName.startsWith("wall_")) {
    return 9.0;
  }

  if (normalizedName.includes("wirefence")) {
    return 7.5;
  }

  return 6.0;
}

function createTerrainMaterial({
  name,
  colorMap,
  detailMap,
  useVertexColors,
}) {
  const material = new THREE.MeshBasicMaterial({
    name,
    map: colorMap,
    color: 0xffffff,
    vertexColors: useVertexColors,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detailMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <uv_pars_vertex>",
        `#include <uv_pars_vertex>
        attribute vec2 uv2;
        varying vec2 vTerrainDetailUv;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vTerrainDetailUv = uv2;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_pars_fragment>",
        `#include <map_pars_fragment>
        uniform sampler2D detailMap;
        varying vec2 vTerrainDetailUv;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec4 terrainDetail = texture2D(detailMap, vTerrainDetailUv);
        diffuseColor.rgb *= terrainDetail.rgb;
        diffuseColor.a *= terrainDetail.a;`,
      );
  };
  material.customProgramCacheKey = () => "flatout-terrain-colormap-detail-v1";

  return material;
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
    startPointsText.matchAll(/\[\d+\]\s*=\s*\{([\s\S]*?)\n\t\}/g),
  );

  return blocks
    .map((match) => parseStartPointBlock(match[1]))
    .filter(Boolean);
}

function parseStartPointBlock(blockText) {
  const position = parseVectorBlock(blockText, "Position");
  const xAxis = parseNamedVectorBlock(blockText, "x");
  const yAxis = parseNamedVectorBlock(blockText, "y");
  const zAxis = parseNamedVectorBlock(blockText, "z");

  if (!position) {
    return null;
  }

  const basisX = xAxis || new THREE.Vector3(1, 0, 0);
  const basisY = yAxis || new THREE.Vector3(0, 1, 0);
  const basisZ = zAxis || new THREE.Vector3(0, 0, 1);

  return {
    position,
    basisX,
    basisY,
    basisZ,
  };
}

function normalizeStartPointGrid(startPoints) {
  if (startPoints.length < 2) {
    return startPoints.map((startPoint) => buildSceneStartPoint(startPoint));
  }

  // BED encodes the arena grid on two repeated rank sets; rebuilding from those
  // ranks preserves the intended 4x2 stagger after the source-to-scene axis flip.
  const gridAxis = sourceVectorToScene(startPoints[0].basisX);
  const up = sourceVectorToScene(startPoints[0].basisY);
  const forward = sourceVectorToScene(startPoints[0].basisZ);
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const centroid = new THREE.Vector3();

  startPoints.forEach((startPoint) => {
    centroid.add(sourcePositionToScene(startPoint.position));
  });
  centroid.divideScalar(startPoints.length);

  const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
  const projectedPoints = startPoints.map((startPoint) => {
    const scenePosition = sourcePositionToScene(startPoint.position);
    const offset = scenePosition.clone().sub(centroid);

    return {
      startPoint,
      alongGrid: offset.dot(gridAxis),
      alongRoad: offset.dot(forward),
    };
  });
  const gridValues = clusterProjectedValues(
    projectedPoints.map((point) => point.alongGrid),
  );
  const roadValues = clusterProjectedValues(
    projectedPoints.map((point) => point.alongRoad),
  );
  const laneWidth = averageClusterStep(gridValues);
  const rowDepth = averageClusterStep(roadValues);

  return projectedPoints.map(({ startPoint, alongGrid, alongRoad }) => {
    const rowIndex = findClusterIndex(gridValues, alongGrid);
    const columnIndex = findClusterIndex(roadValues, alongRoad);
    const lateralOffset = (columnIndex - (roadValues.length - 1) * 0.5) * laneWidth;
    const forwardOffset =
      ((gridValues.length - 1) * 0.5 - rowIndex) * rowDepth;
    const correctedScenePosition = centroid
      .clone()
      .addScaledVector(gridAxis, lateralOffset)
      .addScaledVector(forward, forwardOffset);

    return {
      position: correctedScenePosition,
      basisX: right.clone(),
      basisY: up.clone(),
      basisZ: forward.clone(),
      quaternion: quaternion.clone(),
    };
  });
}

function clusterProjectedValues(values, tolerance = 0.2) {
  const clusters = [];

  values
    .slice()
    .sort((a, b) => a - b)
    .forEach((value) => {
      const lastCluster = clusters[clusters.length - 1];

      if (!lastCluster || Math.abs(lastCluster - value) > tolerance) {
        clusters.push(value);
        return;
      }

      clusters[clusters.length - 1] = (lastCluster + value) * 0.5;
    });

  return clusters;
}

function averageClusterStep(values) {
  if (values.length < 2) {
    return 0;
  }

  let total = 0;

  for (let index = 1; index < values.length; index += 1) {
    total += values[index] - values[index - 1];
  }

  return total / (values.length - 1);
}

function findClusterIndex(clusters, value) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  clusters.forEach((cluster, index) => {
    const distance = Math.abs(cluster - value);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function transformStartPointToScene(startPoint) {
  return {
    position: startPoint.position.clone(),
    basisX: startPoint.basisX.clone(),
    basisY: startPoint.basisY.clone(),
    basisZ: startPoint.basisZ.clone(),
    quaternion: startPoint.quaternion.clone(),
  };
}

function buildSceneStartPoint(startPoint) {
  const position = sourcePositionToScene(startPoint.position);
  const up = sourceVectorToScene(startPoint.basisY);
  const forward = sourceVectorToScene(startPoint.basisZ);
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

  return {
    position,
    basisX: right,
    basisY: up,
    basisZ: forward,
    quaternion,
  };
}

function sourcePositionToScene(position) {
  return new THREE.Vector3(position.x, position.y, -position.z);
}

function sourceVectorToScene(vector) {
  return new THREE.Vector3(vector.x, vector.y, -vector.z).normalize();
}

function parseVectorBlock(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));

  if (!match) {
    return null;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 3) {
    return null;
  }

  return new THREE.Vector3(values[0], values[1], values[2]);
}

function parseNamedVectorBlock(text, key) {
  const match = text.match(
    new RegExp(`\\["${key}"\\]\\s*=\\s*\\{\\s*([^}]+)\\}`),
  );

  if (!match) {
    return null;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 3) {
    return null;
  }

  return new THREE.Vector3(values[0], values[1], values[2]);
}
