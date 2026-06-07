import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const textureNameAliases = {
  colormap: "col",
};
const whiteTexture = createSolidColorTexture();
const DOWN = new THREE.Vector3(0, -1, 0);
const FORWARD = new THREE.Vector3();
const raycastOrigin = new THREE.Vector3();
const raycastEnd = new THREE.Vector3();
const worldNormal = new THREE.Vector3();
const defaultWheelSpawnLift = 0.35;
const DEFAULT_SAMPLER_GRID_SIZE = 64;
const TRACK_BATCH_GRID_SIZE = 96;
const TRACK_BATCH_MIN_MESHES = 3;
const WEBTEST_TRACK_ID = "webtest";
const WEBTEST_TRACK_SIZE = 1200;
const WEBTEST_GRID_DIVISIONS = 480;

export async function loadTrack(
  assetUrls,
  scene,
  renderer,
  environmentState = null,
) {
  if (isWebtestTrack(assetUrls)) {
    return loadWebtestTrack(scene);
  }

  const [trackRoot, trackMaterialInfo, startPoints, collisionAsset] = await Promise.all([
    loadGltf(assetUrls.model, assetUrls.trackTextures),
    loadTrackMaterialInfo(assetUrls.log),
    loadStartPoints(assetUrls.startPoints),
    loadCollisionAsset(
      assetUrls.collisionModel ?? null,
      assetUrls.collisionMeta ?? null,
    ),
  ]);

  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const getTrackTexture = createTrackTextureRegistry(
    assetUrls.trackTextures,
    maxAnisotropy,
  );

  prepareTrackMaterials(
    trackRoot,
    trackMaterialInfo,
    getTrackTexture,
    environmentState,
  );
  alignTrackAtOrigin(trackRoot);

  if (collisionAsset?.root) {
    collisionAsset.root.position.copy(trackRoot.position);
    collisionAsset.root.quaternion.copy(trackRoot.quaternion);
    collisionAsset.root.scale.copy(trackRoot.scale);
    collisionAsset.root.scale.z *= -1;
    prepareCollisionDebugVisuals(collisionAsset.root);
    collisionAsset.root.updateWorldMatrix(true, true);
  }

  scene.add(trackRoot);
  const dynamicObjects = extractDynamicObjectsFromCollisionMeta(trackRoot, collisionAsset);
  batchStaticTrackRenderMeshes(trackRoot, dynamicObjects);

  return {
    trackRoot,
    startPoints,
    collisionAsset,
    dynamicObjects,
    contactSampler: createTrackFloorSampler(
      collisionAsset?.root ?? trackRoot,
      { includeInvisible: Boolean(collisionAsset?.root) },
    ),
    sceneSampler: createTrackFloorSampler(trackRoot),
  };
}

function isWebtestTrack(assetUrls) {
  return assetUrls?.id === WEBTEST_TRACK_ID || assetUrls?.synthetic === WEBTEST_TRACK_ID;
}

function loadWebtestTrack(scene) {
  const { trackRoot, collisionRoot, startPoints } = createWebtestTrackRoots();
  prepareCollisionDebugVisuals(collisionRoot);
  collisionRoot.updateWorldMatrix(true, true);
  scene.add(trackRoot);

  return {
    trackRoot,
    startPoints,
    collisionAsset: {
      root: collisionRoot,
      meta: null,
    },
    dynamicObjects: [],
    contactSampler: createTrackFloorSampler(collisionRoot, { includeInvisible: true }),
    sceneSampler: createTrackFloorSampler(trackRoot),
  };
}

function createWebtestTrackRoots() {
  const trackRoot = new THREE.Group();
  trackRoot.name = "webtest_track_root";

  const renderPlane = new THREE.Mesh(
    buildWebtestGroundGeometry(),
    new THREE.MeshStandardMaterial({
      name: "tarmac_webtest",
      color: 0xd2d2d2,
      roughness: 1,
      metalness: 0,
    }),
  );
  renderPlane.name = "webtest_ground_render";
  renderPlane.receiveShadow = true;
  trackRoot.add(renderPlane);

  const grid = new THREE.GridHelper(
    WEBTEST_TRACK_SIZE,
    WEBTEST_GRID_DIVISIONS,
    0x000000,
    0x000000,
  );
  grid.name = "webtest_grid";
  grid.position.y = 0.02;
  if (Array.isArray(grid.material)) {
    grid.material.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.75;
    });
  } else if (grid.material) {
    grid.material.transparent = true;
    grid.material.opacity = 0.75;
  }
  trackRoot.add(grid);

  const collisionRoot = new THREE.Group();
  collisionRoot.name = "webtest_collision_root";
  const collisionPlane = new THREE.Mesh(
    buildWebtestGroundGeometry(),
    new THREE.MeshBasicMaterial({
      name: "tarmac_webtest",
      color: 0x00e5a8,
    }),
  );
  collisionPlane.name = "webtest_ground_collision";
  collisionRoot.add(collisionPlane);

  const startPoints = [
    {
      position: new THREE.Vector3(0, 0, 0),
      basisX: new THREE.Vector3(1, 0, 0),
      basisY: new THREE.Vector3(0, 1, 0),
      basisZ: new THREE.Vector3(0, 0, 1),
      quaternion: new THREE.Quaternion(),
    },
  ];

  return {
    trackRoot,
    collisionRoot,
    startPoints,
  };
}

function buildWebtestGroundGeometry() {
  const geometry = new THREE.PlaneGeometry(WEBTEST_TRACK_SIZE, WEBTEST_TRACK_SIZE, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
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

export function createTrackFloorSampler(trackRoot, options = {}) {
  const meshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;
  raycaster.far = 128;
  const includeInvisible = options.includeInvisible ?? false;
  const gridSize = options.gridSize ?? DEFAULT_SAMPLER_GRID_SIZE;

  trackRoot.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!includeInvisible && !node.visible) {
      return;
    }

    node.updateWorldMatrix(true, false);
    meshes.push(node);
  });
  const spatialIndex = buildTrackSamplerSpatialIndex(meshes, gridSize);

  return {
    sample(worldPosition, options = {}) {
      if (meshes.length === 0 || !worldPosition) {
        return null;
      }

      const rayHeight = options.rayHeight ?? 12;
      const minUpDot = options.minUpDot ?? 0.2;
      const maxHitY = options.maxHitY ?? Infinity;
      raycastOrigin.copy(worldPosition);
      raycastOrigin.y += rayHeight;
      raycaster.set(raycastOrigin, DOWN);
      raycaster.far = options.rayDistance ?? rayHeight + 32;
      raycastEnd.copy(raycastOrigin).addScaledVector(DOWN, raycaster.far);
      const intersections = raycaster.intersectObjects(
        queryTrackSamplerMeshes(spatialIndex, meshes, raycastOrigin, raycastEnd),
        false,
      );

      if (intersections.length === 0) {
        return null;
      }

      let fallbackHit = null;

      for (const hit of intersections) {
        const hitNormal = resolveWorldHitNormal(hit);

        if (hit.point.y > maxHitY) {
          continue;
        }

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
      raycastEnd.copy(raycastOrigin).addScaledVector(FORWARD, raycaster.far);
      const intersections = raycaster.intersectObjects(
        queryTrackSamplerMeshes(spatialIndex, meshes, raycastOrigin, raycastEnd),
        false,
      );

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

function buildTrackSamplerSpatialIndex(meshes, gridSize) {
  if (meshes.length < 8 || !Number.isFinite(gridSize) || gridSize <= 0) {
    return null;
  }

  const grid = new Map();
  const meshBox = new THREE.Box3();
  const queryBox = new THREE.Box3();
  let indexedMeshCount = 0;

  for (const mesh of meshes) {
    meshBox.setFromObject(mesh);

    if (meshBox.isEmpty()) {
      continue;
    }

    const minX = Math.floor(meshBox.min.x / gridSize);
    const maxX = Math.floor(meshBox.max.x / gridSize);
    const minZ = Math.floor(meshBox.min.z / gridSize);
    const maxZ = Math.floor(meshBox.max.z / gridSize);

    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const key = buildTrackSamplerCellKey(cellX, cellZ);
        const cellMeshes = grid.get(key);

        if (cellMeshes) {
          cellMeshes.push(mesh);
        } else {
          grid.set(key, [mesh]);
        }
      }
    }

    indexedMeshCount += 1;
  }

  if (indexedMeshCount === 0 || grid.size === 0) {
    return null;
  }

  return {
    grid,
    gridSize,
    queryBox,
    result: [],
    seen: new Set(),
  };
}

function queryTrackSamplerMeshes(spatialIndex, fallbackMeshes, from, to) {
  if (!spatialIndex) {
    return fallbackMeshes;
  }

  const { grid, gridSize, queryBox, result, seen } = spatialIndex;
  queryBox.makeEmpty();
  queryBox.expandByPoint(from);
  queryBox.expandByPoint(to);
  queryBox.expandByScalar(1);
  result.length = 0;
  seen.clear();

  const minX = Math.floor(queryBox.min.x / gridSize);
  const maxX = Math.floor(queryBox.max.x / gridSize);
  const minZ = Math.floor(queryBox.min.z / gridSize);
  const maxZ = Math.floor(queryBox.max.z / gridSize);

  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      const cellMeshes = grid.get(buildTrackSamplerCellKey(cellX, cellZ));

      if (!cellMeshes) {
        continue;
      }

      for (const mesh of cellMeshes) {
        if (seen.has(mesh)) {
          continue;
        }

        seen.add(mesh);
        result.push(mesh);
      }
    }
  }

  return result.length > 0 ? result : fallbackMeshes;
}

function buildTrackSamplerCellKey(cellX, cellZ) {
  return `${cellX},${cellZ}`;
}

function loadGltf(url, textureUrls = {}) {
  const loader = createTrackLoader(textureUrls);

  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

function prepareCollisionDebugVisuals(root) {
  root.visible = false;

  root.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    const debugMaterial = new THREE.MeshBasicMaterial({
      color: 0x00e5a8,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    node.material = debugMaterial;
    node.renderOrder = 10;
  });
}

async function loadCollisionAsset(collisionModelUrl, collisionMetaUrl) {
  if (!collisionModelUrl) {
    return null;
  }

  const [root, meta] = await Promise.all([
    loadGltf(collisionModelUrl),
    loadJsonIfPresent(collisionMetaUrl),
  ]);

  return {
    root,
    meta,
  };
}

function extractDynamicObjectsFromCollisionMeta(trackRoot, collisionAsset) {
  const dynamicEntries = collisionAsset?.meta?.dynamicObjects;
  const dynamicModels = collisionAsset?.meta?.models ?? [];

  if (!trackRoot || !Array.isArray(dynamicEntries)) {
    return [];
  }

  const allowedNames = new Set([
    "rubber_cone",
    "rubber_tire",
    "wood_light",
    "metal_light",
    "plastic_light",
    "metal_barrel",
    "cardboard_box",
    "hay_box",
    "metal_obstacle",
    "concrete_block_superheavy",
    "fence_wood",
    "fence_metal",
    "window",
    "explosive_gaspump",
    "metal_lightpole",
    "metal_structure_tilt",
    "metal_gate_180",
  ]);
  const modelLookup = buildDynamicModelLookup(dynamicModels);
  const trackNodeLookup = buildTrackNodeLookup(trackRoot);
  const seen = new Set();
  const result = [];
  let skippedByCategory = 0;
  let skippedByRenderNode = 0;

  for (const entry of dynamicEntries) {
    const name = entry?.name ?? null;
    const dynamicName = entry?.dynamicName ?? null;

    if (!name || !dynamicName || seen.has(name)) {
      continue;
    }

    if (!allowedNames.has(dynamicName)) {
      skippedByCategory += 1;
      continue;
    }

    const renderNode = resolveTrackNodeByName(trackNodeLookup, name);
    const collisionNode = collisionAsset?.root?.getObjectByName?.(name) ?? null;

    if (!renderNode) {
      skippedByRenderNode += 1;
      continue;
    }

    tagDynamicRenderNode(renderNode, dynamicName);
    seen.add(name);
    result.push({
      name,
      collisionName: name,
      dynamicName,
      model: resolveDynamicModelByName(modelLookup, name),
      renderNode,
      collisionNode,
      flags: entry.flags ?? 0,
    });
  }

  if (result.length === 0 && dynamicEntries.length > 0) {
    console.warn("Dynamic object extraction produced no runtime props.", {
      totalEntries: dynamicEntries.length,
      allowedCategories: Array.from(allowedNames),
      skippedByCategory,
      skippedByRenderNode,
      trackNodeCount: trackNodeLookup.nodeCount,
      trackNamedNodeCount: trackNodeLookup.namedNodeCount,
      trackDynamicCandidateCount: trackNodeLookup.dynamicCandidateCount,
    });
  } else if (result.length > 0) {
    console.info("Dynamic object extraction ready.", {
      totalEntries: dynamicEntries.length,
      extracted: result.length,
      skippedByCategory,
      skippedByRenderNode,
    });
  }

  return result;
}

function tagDynamicRenderNode(renderNode, dynamicName) {
  renderNode.traverse?.((node) => {
    node.userData.trackDynamicObject = true;
    node.userData.trackDynamicName = dynamicName;
  });
}

function batchStaticTrackRenderMeshes(trackRoot, dynamicObjects = []) {
  if (!trackRoot) {
    return null;
  }

  const excludedNodes = buildExcludedRenderNodeSet(dynamicObjects);
  const rootInverse = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4();
  const localBox = new THREE.Box3();
  const localCenter = new THREE.Vector3();
  const groups = new Map();
  let candidateCount = 0;
  let skippedCount = 0;

  trackRoot.updateWorldMatrix(true, true);
  rootInverse.copy(trackRoot.matrixWorld).invert();

  trackRoot.traverse((node) => {
    if (!isStaticTrackBatchCandidate(node, excludedNodes)) {
      if (node.isMesh) {
        skippedCount += 1;
      }
      return;
    }

    const geometry = node.geometry;
    const material = node.material;
    const signature = buildGeometryBatchSignature(geometry);

    if (!signature) {
      skippedCount += 1;
      return;
    }

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      skippedCount += 1;
      return;
    }

    localMatrix.multiplyMatrices(rootInverse, node.matrixWorld);
    localBox.copy(geometry.boundingBox).applyMatrix4(localMatrix);
    localBox.getCenter(localCenter);

    const cellX = Math.floor(localCenter.x / TRACK_BATCH_GRID_SIZE);
    const cellZ = Math.floor(localCenter.z / TRACK_BATCH_GRID_SIZE);
    const key = [
      material.uuid,
      signature,
      cellX,
      cellZ,
    ].join("|");
    let group = groups.get(key);

    if (!group) {
      group = {
        material,
        cellX,
        cellZ,
        entries: [],
      };
      groups.set(key, group);
    }

    group.entries.push({
      node,
      matrix: localMatrix.clone(),
    });
    candidateCount += 1;
  });

  if (candidateCount === 0 || groups.size === 0) {
    return null;
  }

  const batchRoot = new THREE.Group();
  batchRoot.name = "track_static_render_batches";
  batchRoot.userData.trackStaticBatchRoot = true;
  let batchCount = 0;
  let batchedMeshCount = 0;

  for (const group of groups.values()) {
    if (group.entries.length < TRACK_BATCH_MIN_MESHES) {
      continue;
    }

    const geometries = group.entries.map((entry) => {
      const clonedGeometry = entry.node.geometry.clone();
      clonedGeometry.applyMatrix4(entry.matrix);
      return clonedGeometry;
    });
    const mergedGeometry = mergeGeometries(geometries, false);

    for (const geometry of geometries) {
      geometry.dispose();
    }

    if (!mergedGeometry) {
      continue;
    }

    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();

    const batchMesh = new THREE.Mesh(mergedGeometry, group.material);
    batchMesh.name = [
      "track_batch",
      cleanTrackBatchName(group.material.name),
      group.cellX,
      group.cellZ,
      batchCount,
    ].join("_");
    batchMesh.castShadow = false;
    batchMesh.receiveShadow = false;
    batchMesh.frustumCulled = true;
    batchMesh.userData.trackStaticBatch = true;
    batchMesh.userData.sourceMeshCount = group.entries.length;
    batchRoot.add(batchMesh);

    for (const entry of group.entries) {
      entry.node.visible = false;
      entry.node.userData.batchedIntoStaticTrackMesh = true;
    }

    batchCount += 1;
    batchedMeshCount += group.entries.length;
  }

  if (batchCount === 0) {
    return null;
  }

  trackRoot.add(batchRoot);
  console.info("Static track render batching ready.", {
    candidates: candidateCount,
    batchedMeshes: batchedMeshCount,
    batches: batchCount,
    skipped: skippedCount,
    gridSize: TRACK_BATCH_GRID_SIZE,
  });

  return {
    candidates: candidateCount,
    batchedMeshes: batchedMeshCount,
    batches: batchCount,
    skipped: skippedCount,
  };
}

function buildExcludedRenderNodeSet(dynamicObjects) {
  const excludedNodes = new Set();

  for (const dynamicObject of dynamicObjects) {
    dynamicObject.renderNode?.traverse?.((node) => {
      excludedNodes.add(node);
    });
  }

  return excludedNodes;
}

function isStaticTrackBatchCandidate(node, excludedNodes) {
  if (
    !node.isMesh ||
    !node.geometry ||
    !node.visible ||
    node.userData?.trackStaticBatch ||
    node.userData?.trackStaticBatchRoot ||
    excludedNodes.has(node)
  ) {
    return false;
  }

  if (
    node.isSkinnedMesh ||
    node.morphTargetInfluences ||
    Array.isArray(node.material) ||
    !node.material ||
    node.material.transparent
  ) {
    return false;
  }

  const drawRange = node.geometry.drawRange;
  if (
    drawRange &&
    Number.isFinite(drawRange.count) &&
    drawRange.count !== Infinity
  ) {
    const indexCount =
      node.geometry.index?.count ??
      node.geometry.getAttribute?.("position")?.count ??
      Infinity;

    if (drawRange.start !== 0 || drawRange.count < indexCount) {
      return false;
    }
  }

  return true;
}

function buildGeometryBatchSignature(geometry) {
  const position = geometry.getAttribute?.("position");

  if (!position || Object.keys(geometry.morphAttributes ?? {}).length > 0) {
    return null;
  }

  const attributes = Object.entries(geometry.attributes ?? {})
    .map(([name, attribute]) => {
      const arrayName = attribute?.array?.constructor?.name ?? "Array";
      return [
        name,
        attribute?.itemSize ?? 0,
        attribute?.normalized ? 1 : 0,
        arrayName,
      ].join(":");
    })
    .sort()
    .join(",");
  const indexName = geometry.index?.array?.constructor?.name ?? "no-index";
  return `${indexName}|${attributes}`;
}

function cleanTrackBatchName(name) {
  return (name || "material")
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "material";
}

function buildTrackNodeLookup(trackRoot) {
  const exact = new Map();
  const normalized = new Map();
  let nodeCount = 0;
  let namedNodeCount = 0;
  let dynamicCandidateCount = 0;

  trackRoot.traverse((node) => {
    nodeCount += 1;

    if (typeof node.name !== "string" || node.name.length === 0) {
      return;
    }

    namedNodeCount += 1;
    exact.set(node.name, node);

    const normalizedName = normalizeSceneNodeName(node.name);
    if (normalizedName.startsWith("dyn_")) {
      dynamicCandidateCount += 1;
    }
    if (!normalized.has(normalizedName)) {
      normalized.set(normalizedName, node);
    }
  });

  return {
    exact,
    normalized,
    nodeCount,
    namedNodeCount,
    dynamicCandidateCount,
  };
}

function resolveTrackNodeByName(lookup, name) {
  if (!lookup || !name) {
    return null;
  }

  return lookup.exact.get(name) ?? lookup.normalized.get(normalizeSceneNodeName(name)) ?? null;
}

function buildDynamicModelLookup(models) {
  const exact = new Map();
  const family = new Map();

  for (const model of models) {
    if (!model?.name) {
      continue;
    }

    exact.set(model.name, model);
    const familyKey = normalizeDynamicModelFamily(model.name);

    if (!family.has(familyKey)) {
      family.set(familyKey, model);
    }
  }

  return { exact, family };
}

function resolveDynamicModelByName(lookup, name) {
  if (!lookup || !name) {
    return null;
  }

  return (
    lookup.exact.get(name) ??
    lookup.family.get(normalizeDynamicModelFamily(name)) ??
    null
  );
}

function normalizeDynamicModelFamily(name) {
  return name
    .replace(/@\d+$/u, "")
    .replace(/_\d{2,3}$/u, "_##");
}

function normalizeSceneNodeName(name) {
  return String(name)
    .replace(/\0+$/u, "")
    .trim()
    .replace(/@\d+$/u, "")
    .replace(/\.\d+$/u, "");
}

async function loadJsonIfPresent(url) {
  if (!url) {
    return null;
  }

  if (typeof url === "object") {
    return url;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load json asset: ${response.status}`);
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch (parseError) {
      const bundledJson = await loadJsonModuleFallback(url);

      if (bundledJson) {
        return bundledJson;
      }

      throw parseError;
    }
  } catch (error) {
    console.warn("Ignoring collision metadata load failure:", error);
    return null;
  }
}

async function loadJsonModuleFallback(url) {
  try {
    const module = await import(/* @vite-ignore */ url);
    const value = module?.default ?? module ?? null;

    if (typeof value === "string") {
      return JSON.parse(value);
    }

    if (value && typeof value === "object") {
      return value;
    }
  } catch (moduleError) {
    console.warn("JSON module fallback failed:", moduleError);
  }

  return null;
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
  environmentState,
) {
  const materialCache = new Map();

  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    obj.castShadow = false;
    obj.receiveShadow = false;

    promoteSecondaryUvSet(obj.geometry);

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    const usesVertexColors = Boolean(obj.geometry?.getAttribute("color"));
    const mappedMaterials = sourceMaterials.map((sourceMaterial) => {
      if (!sourceMaterial) {
        return sourceMaterial;
      }

      const cacheKey = buildTrackMaterialCacheKey(
        sourceMaterial,
        trackMaterialInfo,
        usesVertexColors,
      );
      let material = materialCache.get(cacheKey);

      if (!material) {
        material = createTrackMaterial(
          sourceMaterial,
          trackMaterialInfo,
          getTrackTexture,
          usesVertexColors,
          environmentState,
        );
        materialCache.set(cacheKey, material);
      }

      return material;
    });

    obj.material =
      mappedMaterials.length === 1 ? mappedMaterials[0] : mappedMaterials;
  });
}

function buildTrackMaterialCacheKey(
  sourceMaterial,
  trackMaterialInfo,
  usesVertexColors,
) {
  const materialInfo = resolveTrackMaterialInfo(
    sourceMaterial.name,
    trackMaterialInfo,
  );
  return [
    sourceMaterial.name ?? "",
    materialInfo?.shaderId ?? "shader:none",
    materialInfo?.alpha ?? "alpha:none",
    pickTrackTextureName(materialInfo) ?? "diffuse:none",
    pickTrackDetailTextureName(materialInfo) ?? "detail:none",
    usesVertexColors ? "vc:1" : "vc:0",
  ].join("|");
}

function createTrackMaterial(
  sourceMaterial,
  trackMaterialInfo,
  getTrackTexture,
  usesVertexColors,
  environmentState,
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
  if (isWindowShader) {
    return new THREE.MeshBasicMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      color: 0xd7e4ea,
      vertexColors: usesVertexColors,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
  }

  if (isAlphaMaterial || isLeafLikeShader) {
    return new THREE.MeshBasicMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      color: 0xffffff,
      vertexColors: usesVertexColors,
      transparent: false,
      alphaTest: 0.35,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }

  if (materialInfo?.shaderId === 0) {
    return createStaticTrackMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      useVertexColors: usesVertexColors,
      brightnessScale: 2.0,
    });
  }

  if (materialInfo?.shaderId === 1) {
    const usesSurrogateLightMap =
      materialInfo.useColormap && Boolean(environmentState?.trackLightMap);
    return createTerrainMaterial({
      name: sourceMaterial.name,
      baseMap: detailTexture || diffuseTexture,
      lightMap: usesSurrogateLightMap ? environmentState.trackLightMap : null,
      lightMapGainRef: environmentState?.trackLightMapGainRef,
      useVertexColors: usesVertexColors,
      brightnessScale: 1.0,
      useSurrogateLightMap: usesSurrogateLightMap,
    });
  }

  if (materialInfo?.shaderId === 2) {
    const usesSurrogateLightMap =
      materialInfo.useColormap && Boolean(environmentState?.trackLightMap);
    return createTerrainSpecularMaterial({
      name: sourceMaterial.name,
      baseMap: detailTexture || diffuseTexture,
      lightMap: usesSurrogateLightMap ? environmentState.trackLightMap : null,
      lightMapGainRef: environmentState?.trackLightMapGainRef,
      useVertexColors: usesVertexColors,
      environmentState,
      useSurrogateLightMap: usesSurrogateLightMap,
    });
  }

  if (materialInfo?.shaderId === 3) {
    return createDynamicTrackMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      useVertexColors: usesVertexColors,
      environmentState,
      transparent: false,
      alphaTest: 0,
      side: THREE.FrontSide,
      specular: false,
    });
  }

  if (materialInfo?.shaderId === 4) {
    return createDynamicTrackMaterial({
      name: sourceMaterial.name,
      map: diffuseTexture,
      useVertexColors: usesVertexColors,
      environmentState,
      transparent: isAlphaMaterial,
      alphaTest: isAlphaMaterial ? 0.35 : 0,
      side: isAlphaMaterial ? THREE.DoubleSide : THREE.FrontSide,
      specular: true,
    });
  }

  return new THREE.MeshBasicMaterial({
    name: sourceMaterial.name,
    map: diffuseTexture,
    color: 0xffffff,
    vertexColors: usesVertexColors,
  });
}

function createStaticTrackMaterial({ name, map, useVertexColors }) {
  const material = createTrackShaderMaterial({
    name,
    uniforms: {
      uMap: { value: map },
    },
    useVertexColors,
    vertexShader: buildStaticTrackVertexShader(useVertexColors),
    fragmentShader: buildStaticTrackFragmentShader(useVertexColors),
  });
  material.userData.textureRefs = map ? [map] : [];
  return material;
}

function createTerrainMaterial({
  name,
  baseMap,
  lightMap,
  lightMapGainRef,
  useVertexColors,
  brightnessScale,
  useSurrogateLightMap = false,
}) {
  const material = createTrackShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uLightMap: { value: lightMap || whiteTexture },
      uLightMapGain: lightMapGainRef ?? { value: 1 },
      uBrightnessScale: { value: brightnessScale },
      uUseSurrogateLightMap: { value: useSurrogateLightMap ? 1 : 0 },
    },
    useVertexColors,
    vertexShader: buildTerrainVertexShader(useVertexColors),
    fragmentShader: buildTerrainFragmentShader(useVertexColors, false),
  });
  material.userData.textureRefs = [baseMap, lightMap].filter(Boolean);
  return material;
}

function createTerrainSpecularMaterial({
  name,
  baseMap,
  lightMap,
  lightMapGainRef,
  useVertexColors,
  environmentState,
  useSurrogateLightMap = false,
}) {
  const material = createTrackShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uLightMap: { value: lightMap || whiteTexture },
      uLightMapGain: lightMapGainRef ?? { value: 1 },
      uSunDirection: {
        value:
          environmentState?.sunDirection ?? new THREE.Vector3(0.3, 0.8, -0.5),
      },
      uSpecularColor: {
        value: environmentState?.specularColor ?? new THREE.Color(0xffffff),
      },
      uSpecularIntensity: {
        value: environmentState?.specularIntensity ?? 0.65,
      },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
      uBrightnessScale: { value: 1.0 },
      uUseSurrogateLightMap: { value: useSurrogateLightMap ? 1 : 0 },
    },
    useVertexColors,
    vertexShader: buildTerrainVertexShader(useVertexColors, true),
    fragmentShader: buildTerrainFragmentShader(useVertexColors, true),
  });
  material.userData.textureRefs = [baseMap, lightMap].filter(Boolean);
  return material;
}

function createDynamicTrackMaterial({
  name,
  map,
  useVertexColors,
  environmentState,
  transparent,
  alphaTest,
  side,
  specular,
}) {
  const material = createTrackShaderMaterial({
    name,
    uniforms: {
      uMap: { value: map },
      uSunDirection: {
        value:
          environmentState?.sunDirection ?? new THREE.Vector3(0.3, 0.8, -0.5),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? new THREE.Color(0xffe6c7),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? new THREE.Color(0x404040),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uSpecularColor: {
        value: environmentState?.specularColor ?? new THREE.Color(0xfff3db),
      },
      uSpecularIntensity: {
        value: environmentState?.specularIntensity ?? 0.65,
      },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
    },
    useVertexColors,
    transparent,
    alphaTest,
    side,
    vertexShader: buildDynamicTrackVertexShader(useVertexColors, specular),
    fragmentShader: buildDynamicTrackFragmentShader(useVertexColors, specular),
  });
  material.userData.textureRefs = map ? [map] : [];
  return material;
}

function createTrackShaderMaterial({
  name,
  uniforms,
  useVertexColors,
  transparent = false,
  alphaTest = 0,
  side = THREE.FrontSide,
  vertexShader,
  fragmentShader,
}) {
  return new THREE.ShaderMaterial({
    name,
    uniforms: {
      ...uniforms,
      uAlphaTest: { value: alphaTest },
    },
    vertexColors: useVertexColors,
    transparent,
    alphaTest,
    side,
    vertexShader,
    fragmentShader,
  });
}

function buildStaticTrackVertexShader(useVertexColors) {
  return `
    varying vec2 vUv;
    varying vec4 vColor;
    void main() {
      vUv = uv;
      vColor = vec4(1.0);
      ${useVertexColors ? "vColor = vec4(color.rgb, 1.0);" : ""}
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
}

function buildStaticTrackFragmentShader(useVertexColors) {
  return `
    uniform sampler2D uMap;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    void main() {
      vec4 texel = texture2D(uMap, vUv);
      vec4 shaded = texel * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      shaded.rgb = clamp(shaded.rgb * 2.0, 0.0, 1.0);
      if (shaded.a <= uAlphaTest) discard;
      gl_FragColor = shaded;
    }
  `;
}

function buildTerrainVertexShader(useVertexColors, withSpecular = false) {
  return `
    attribute vec2 uv2;
    varying vec2 vUv;
    varying vec2 vUv2;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vUv2 = uv2;
      vColor = vec4(1.0);
      ${useVertexColors ? "vColor = vec4(color.rgb, 1.0);" : ""}
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;
}

function buildTerrainFragmentShader(useVertexColors, withSpecular) {
  return `
    uniform sampler2D uBaseMap;
    uniform sampler2D uLightMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSpecularColor;
    uniform float uSpecularIntensity;
    uniform float uMaxOverBrighting;
    uniform float uBrightnessScale;
    uniform float uLightMapGain;
    uniform int uUseSurrogateLightMap;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec2 vUv2;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    vec3 linearToSrgbFast(vec3 color) {
      return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
    }

    vec3 srgbToLinearFast(vec3 color) {
      return pow(max(color, vec3(0.0)), vec3(2.2));
    }

    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv2);
      vec4 lightSample = texture2D(uLightMap, vUv);
      vec3 legacyTextureMul = srgbToLinearFast(
        linearToSrgbFast(baseSample.rgb) * linearToSrgbFast(lightSample.rgb)
      );
      vec3 combinedRgb = uUseSurrogateLightMap == 1
        ? baseSample.rgb * lightSample.rgb * uLightMapGain
        : legacyTextureMul;
      vec4 shaded = vec4(combinedRgb, 1.0);
      float specMask = baseSample.a * (uUseSurrogateLightMap == 1 ? 1.0 : lightSample.a);
      shaded *= ${useVertexColors ? "vColor" : "vec4(1.0)"};
      shaded.rgb *= max(uBrightnessScale, 1.0);
      ${
        withSpecular
          ? `
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      vec3 v = normalize(cameraPosition - vWorldPosition);
      vec3 h = normalize(v + l);
      float ndotl = max(dot(n, l), 0.0);
      float spec = pow(max(dot(n, h), 0.0), 16.0) * step(0.0, ndotl);
      shaded.rgb += uSpecularColor * (uSpecularIntensity * spec * specMask);
      shaded.rgb = min(shaded.rgb, vec3(uMaxOverBrighting));`
          : ""
      }
      shaded.a = 1.0;
      gl_FragColor = shaded;
    }
  `;
}

function createSolidColorTexture() {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function buildDynamicTrackVertexShader(useVertexColors, withSpecular) {
  return `
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vColor = vec4(1.0);
      ${useVertexColors ? "vColor = vec4(color.rgb, 1.0);" : ""}
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;
}

function buildDynamicTrackFragmentShader(useVertexColors, withSpecular) {
  return `
    uniform sampler2D uMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform vec3 uAmbientColor;
    uniform float uAmbientIntensity;
    uniform vec3 uSpecularColor;
    uniform float uSpecularIntensity;
    uniform float uMaxOverBrighting;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    void main() {
      vec4 texel = texture2D(uMap, vUv);
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * ndotl);
      vec4 shaded = texel * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      shaded.rgb *= lighting * 2.0;
      ${
        withSpecular
          ? `
      vec3 v = normalize(cameraPosition - vWorldPosition);
      vec3 h = normalize(v + l);
      float spec = pow(max(dot(n, h), 0.0), 16.0) * step(0.0, ndotl);
      shaded.rgb += uSpecularColor * (uSpecularIntensity * spec * texel.a);`
          : ""
      }
      shaded.rgb = min(shaded.rgb, vec3(uMaxOverBrighting));
      if (shaded.a <= uAlphaTest) discard;
      gl_FragColor = shaded;
    }
  `;
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
