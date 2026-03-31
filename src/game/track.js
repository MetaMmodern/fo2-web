import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const textureNameAliases = {
  colormap: "col",
};
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3();
const raycastOrigin = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const defaultWheelSpawnLift = 0.35;

export async function loadTrack(assetUrls, scene, renderer) {
  const [trackRoot, trackMaterialInfo, startPoints] = await Promise.all([
    loadGltf(assetUrls.model, assetUrls.trackTextures),
    loadTrackMaterialInfo(assetUrls.log),
    loadStartPoints(assetUrls.startPoints),
  ]);

  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const getTrackTexture = createTrackTextureRegistry(
    assetUrls.trackTextures,
    maxAnisotropy,
  );
  const trackLightMap = loadTrackLightMap(assetUrls.lightmap, maxAnisotropy);

  prepareTrackMaterials(
    trackRoot,
    trackMaterialInfo,
    getTrackTexture,
    trackLightMap,
  );
  alignTrackAtOrigin(trackRoot);
  scene.add(trackRoot);

  return {
    trackRoot,
    startPoints,
    floorSampler: createTrackFloorSampler(trackRoot),
  };
}

export function placeVehicleOnTrack(
  trackRoot,
  carRoot,
  startPoints = [],
  floorSampler = null,
) {
  const sampler = floorSampler ?? createTrackFloorSampler(trackRoot);

  if (startPoints.length > 0) {
    const spawnPoint = transformStartPointToScene(startPoints[0]);
    const spawnX = trackRoot.position.x + spawnPoint.position.x;
    const spawnZ = trackRoot.position.z + spawnPoint.position.z;
    const sampledFloor =
      sampler?.sample(
        new THREE.Vector3(spawnX, trackRoot.position.y + 12, spawnZ),
      ) ?? null;
    const spawnY =
      sampledFloor?.point.y ?? trackRoot.position.y + spawnPoint.position.y;

    carRoot.position.set(spawnX, spawnY + defaultWheelSpawnLift, spawnZ);
    carRoot.quaternion.copy(spawnPoint.quaternion);
    carRoot.rotateY(Math.PI);
    return;
  }

  const trackBox = new THREE.Box3().setFromObject(trackRoot);
  const trackSize = new THREE.Vector3();
  trackBox.getSize(trackSize);

  const fallbackX = 0;
  const fallbackZ = trackSize.z * 0.22;
  const sampledFloor =
    sampler?.sample(
      new THREE.Vector3(fallbackX, trackBox.max.y + 12, fallbackZ),
    ) ?? null;

  carRoot.position.set(
    fallbackX,
    (sampledFloor?.point.y ?? 3) + defaultWheelSpawnLift,
    fallbackZ,
  );
  carRoot.rotation.set(0, Math.PI, 0);
}

export function createTrackFloorSampler(trackRoot) {
  const meshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;
  raycaster.far = 128;

  trackRoot.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!node.visible) {
      return;
    }

    node.updateWorldMatrix(true, false);
    meshes.push(node);
  });

  return {
    sample(worldPosition, options = {}) {
      if (meshes.length === 0 || !worldPosition) {
        return null;
      }

      const rayHeight = options.rayHeight ?? 12;
      const minUpDot = options.minUpDot ?? 0.2;
      raycastOrigin.copy(worldPosition);
      raycastOrigin.y += rayHeight;
      raycaster.set(raycastOrigin, DOWN);
      raycaster.far = options.rayDistance ?? rayHeight + 32;
      const intersections = raycaster.intersectObjects(meshes, false);

      if (intersections.length === 0) {
        return null;
      }

      let fallbackHit = null;

      for (const hit of intersections) {
        const hitNormal = resolveWorldHitNormal(hit);

        if (!fallbackHit) {
          fallbackHit = buildTrackFloorHit(hit, hitNormal);
        }

        if (hitNormal.y >= minUpDot) {
          return buildTrackFloorHit(hit, hitNormal);
        }
      }

      return fallbackHit;
    },
    raycast(origin, direction, options = {}) {
      if (
        meshes.length === 0 ||
        !origin ||
        !direction ||
        direction.lengthSq() < 1e-8
      ) {
        return null;
      }

      raycastOrigin.copy(origin);
      FORWARD.copy(direction).normalize();
      raycaster.set(raycastOrigin, FORWARD);
      raycaster.far = options.rayDistance ?? 8;
      const intersections = raycaster.intersectObjects(meshes, false);

      if (intersections.length === 0) {
        return null;
      }

      const minUpDot = options.minUpDot ?? -1;
      const maxUpDot = options.maxUpDot ?? 1;

      for (const hit of intersections) {
        const hitNormal = resolveWorldHitNormal(hit);

        if (hitNormal.y < minUpDot || hitNormal.y > maxUpDot) {
          continue;
        }

        return buildTrackFloorHit(hit, hitNormal);
      }

      return null;
    },
  };
}

function loadGltf(url, textureUrls = {}) {
  const loader = createTrackLoader(textureUrls);

  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function createTrackLoader(textureUrls = {}) {
  const loadingManager = new THREE.LoadingManager();

  loadingManager.setURLModifier((url) => {
    if (!url || url === "null") {
      return createTransparentTextureDataUrl();
    }

    const resolvedTextureUrl = resolveTrackTextureUrl(url, textureUrls);

    if (resolvedTextureUrl) {
      return resolvedTextureUrl;
    }

    return url;
  });

  return new GLTFLoader(loadingManager);
}

function resolveTrackTextureUrl(url, textureUrls) {
  const fileName = url.replace(/^.*[\\/]/, "");
  const normalizedFileName = fileName.toLowerCase();
  const normalizedBaseName = normalizeTextureName(fileName);

  return (
    textureUrls[normalizedFileName] ?? textureUrls[normalizedBaseName] ?? null
  );
}

function createTransparentTextureDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
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
    texture.flipY = false;
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
  texture.flipY = false;
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
    const staticPrelitSettings = getStaticPrelitSettings(sourceMaterial.name);
    return createStaticPrelitMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      useVertexColors: usesVertexColors && staticPrelitSettings.useVertexColors,
      transparent: isAlphaMaterial || isLeafLikeShader,
      alphaTest: isAlphaMaterial || isLeafLikeShader ? 0.35 : 0,
      side:
        isAlphaMaterial || isLeafLikeShader
          ? THREE.DoubleSide
          : THREE.FrontSide,
      brightnessScale: staticPrelitSettings.brightnessScale,
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
  material.customProgramCacheKey = () =>
    `flatout-static-prelit-${name}-${brightnessScale.toFixed(2)}`;

  return material;
}

function getStaticPrelitSettings(materialName) {
  const normalizedName = materialName?.toLowerCase() ?? "";

  if (shouldUseTextureLedStaticPrelit(normalizedName)) {
    return {
      useVertexColors: false,
      brightnessScale: 1.05,
    };
  }

  if (normalizedName.includes("wirefence")) {
    return {
      useVertexColors: true,
      brightnessScale: 7.5,
    };
  }

  return {
    useVertexColors: true,
    brightnessScale: 6.0,
  };
}

function shouldUseTextureLedStaticPrelit(normalizedName) {
  return (
    normalizedName.startsWith("wall_") ||
    normalizedName === "curbwalls" ||
    normalizedName.includes("audience_stand") ||
    normalizedName.includes("racingaudiencestand") ||
    normalizedName.includes("racingwatchtower") ||
    normalizedName === "concrete_blocks" ||
    normalizedName.startsWith("warehouse_") ||
    normalizedName.startsWith("control_tower_") ||
    normalizedName.startsWith("track_office_") ||
    normalizedName.startsWith("roof_") ||
    normalizedName.startsWith("screen_frame") ||
    normalizedName === "lights_a"
  );
}

function createTerrainMaterial({ name, colorMap, detailMap, useVertexColors }) {
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

function resolveWorldHitNormal(hit) {
  if (!hit?.face) {
    return worldNormal.set(0, 1, 0);
  }

  return worldNormal
    .copy(hit.face.normal)
    .transformDirection(hit.object.matrixWorld)
    .normalize();
}

function buildTrackFloorHit(hit, normal) {
  const material = Array.isArray(hit.object.material)
    ? hit.object.material[hit.face?.materialIndex ?? 0]
    : hit.object.material;
  const materialName = material?.name ?? "";

  return {
    point: hit.point.clone(),
    normal: normal.clone(),
    distance: hit.distance,
    materialName,
    surfaceType: classifySurfaceType(materialName),
    object: hit.object,
  };
}

function classifySurfaceType(materialName) {
  const normalizedName = materialName.toLowerCase();

  if (
    normalizedName.includes("sand") ||
    normalizedName.includes("beach") ||
    normalizedName.includes("desert")
  ) {
    return "sand";
  }

  if (
    normalizedName.includes("gravel") ||
    normalizedName.includes("rock") ||
    normalizedName.includes("stone")
  ) {
    return "gravel";
  }

  if (
    normalizedName.includes("mud") ||
    normalizedName.includes("dirt") ||
    normalizedName.includes("soil")
  ) {
    return "dirt";
  }

  if (
    normalizedName.includes("grass") ||
    normalizedName.includes("field") ||
    normalizedName.includes("forest")
  ) {
    return "grass";
  }

  if (
    normalizedName.includes("hazard") ||
    normalizedName.includes("metal") ||
    normalizedName.includes("concrete") ||
    normalizedName.includes("wall")
  ) {
    return "hazard";
  }

  if (
    normalizedName.includes("road") ||
    normalizedName.includes("asphalt") ||
    normalizedName.includes("tarmac") ||
    normalizedName.includes("track")
  ) {
    return "tarmac";
  }

  return "default";
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

  return blocks.map((match) => parseStartPointBlock(match[1])).filter(Boolean);
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

  // BED encodes the arena grid on repeated rank sets; reconstructing those
  // ranks preserves the intended lane layout after source-to-scene conversion.
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
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    rotationMatrix,
  );
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

  return projectedPoints.map(({ alongGrid, alongRoad }) => {
    const rowIndex = findClusterIndex(gridValues, alongGrid);
    const columnIndex = findClusterIndex(roadValues, alongRoad);
    const lateralOffset =
      (columnIndex - (roadValues.length - 1) * 0.5) * laneWidth;
    const forwardOffset = ((gridValues.length - 1) * 0.5 - rowIndex) * rowDepth;
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
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    rotationMatrix,
  );

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
