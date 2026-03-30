#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { parseFile } = require("./flatout-w32-tool.js");

function findTrackVariants(rootDir) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    const names = new Set(entries.map((entry) => entry.name));

    if (
      names.has("geometry") &&
      names.has("lighting") &&
      names.has("data") &&
      fs.existsSync(path.join(currentDir, "geometry", "track_geom.w32")) &&
      fs.existsSync(path.join(currentDir, "geometry", "plant_geom.w32")) &&
      fs.existsSync(path.join(currentDir, "geometry", "plant_vdb.gen"))
    ) {
      results.push(currentDir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      walk(path.join(currentDir, entry.name));
    }
  }

  walk(rootDir);
  return results.sort();
}

function countBy(values, keyFn) {
  const counts = new Map();

  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
    .map(([key, count]) => ({ key, count }));
}

function topRows(rows, limit = 10) {
  return rows.slice(0, limit);
}

function summarizeTrackVariant(trackDir) {
  const trackGeom = parseFile(path.join(trackDir, "geometry", "track_geom.w32"));
  const plantGeom = parseFile(path.join(trackDir, "geometry", "plant_geom.w32"));
  const plantVdb = parseFile(path.join(trackDir, "geometry", "plant_vdb.gen"));

  const surfacesById = new Map(trackGeom.surfaces.map((surface) => [surface.index, surface]));
  const materialsById = new Map(trackGeom.materials.map((material) => [material.index, material]));

  const plantSurfaceIds = [...new Set(plantVdb.records.map((record) => record.surfaceId))].sort(
    (left, right) => left - right,
  );
  const plantSurfaces = plantSurfaceIds
    .map((surfaceId) => surfacesById.get(surfaceId))
    .filter(Boolean);

  const plantMaterialIds = [...new Set(plantSurfaces.map((surface) => surface.materialId))].sort(
    (left, right) => left - right,
  );
  const plantMaterials = plantMaterialIds
    .map((materialId) => materialsById.get(materialId))
    .filter(Boolean);

  const plantSurfaceShaderCounts = countBy(plantSurfaces, (surface) => {
    const material = materialsById.get(surface.materialId);
    return `${material?.shaderId ?? "?"}:${material?.shaderName ?? "UNKNOWN"}`;
  });

  const plantSurfaceMaterialCounts = countBy(plantSurfaces, (surface) => {
    const material = materialsById.get(surface.materialId);
    return material?.name ?? `material_${surface.materialId}`;
  });

  const treeSurfaceIds = new Set();
  const treeMaterialIds = new Set();
  for (const treeMesh of trackGeom.body.treeMeshes) {
    treeSurfaceIds.add(treeMesh.trunkSurfaceId);
    treeSurfaceIds.add(treeMesh.branchSurfaceId);
    treeSurfaceIds.add(treeMesh.leafSurfaceId);
    treeMaterialIds.add(treeMesh.materialId);
  }

  const plantSurfaceIntersectionCount = plantSurfaceIds.filter((surfaceId) =>
    treeSurfaceIds.has(surfaceId),
  ).length;

  const treeMaterialDetails = [...treeMaterialIds]
    .sort((left, right) => left - right)
    .map((materialId) => materialsById.get(materialId))
    .filter(Boolean)
    .map((material) => ({
      id: material.index,
      name: material.name,
      shaderId: material.shaderId,
      shaderName: material.shaderName,
    }));

  const treeMeshSurfaceShaderCounts = countBy(trackGeom.body.treeMeshes.flatMap((treeMesh) => {
    return [treeMesh.trunkSurfaceId, treeMesh.branchSurfaceId, treeMesh.leafSurfaceId]
      .map((surfaceId) => surfacesById.get(surfaceId))
      .filter(Boolean);
  }), (surface) => {
    const material = materialsById.get(surface.materialId);
    return `${material?.shaderId ?? "?"}:${material?.shaderName ?? "UNKNOWN"}`;
  });

  return {
    trackDir: path.relative(process.cwd(), trackDir),
    surfaceCount: trackGeom.surfaces.length,
    materialCount: trackGeom.materials.length,
    plantGeom: {
      mappingCount: plantGeom.mappingCount,
      entryCount: plantGeom.entryCount,
      boundsA: plantGeom.pairA,
      boundsB: plantGeom.pairB,
      boundsC: plantGeom.pairC,
    },
    plantVdb: {
      recordCount: plantVdb.recordCount,
      uniqueSurfaceCount: plantSurfaceIds.length,
      uniquePlantIds: [...new Set(plantVdb.records.map((record) => record.plantId))].length,
      surfaceIdMin: plantSurfaceIds[0],
      surfaceIdMax: plantSurfaceIds[plantSurfaceIds.length - 1],
      shaderCounts: topRows(plantSurfaceShaderCounts),
      materialCounts: topRows(plantSurfaceMaterialCounts),
    },
    treeMeshes: {
      count: trackGeom.body.treeMeshes.length,
      uniqueSurfaceCount: treeSurfaceIds.size,
      uniqueMaterialCount: treeMaterialIds.size,
      shaderCounts: topRows(treeMeshSurfaceShaderCounts),
      materials: treeMaterialDetails,
    },
    correlation: {
      plantSurfaceIntersectionCount,
      plantSurfaceIntersectionRatio:
        plantSurfaceIds.length === 0 ? 0 : plantSurfaceIntersectionCount / plantSurfaceIds.length,
      plantSurfaceOnlyCount: plantSurfaceIds.length - plantSurfaceIntersectionCount,
    },
  };
}

function main() {
  const rootDir = path.resolve(process.cwd(), "src/data/tracks");
  const trackDirs = findTrackVariants(rootDir);
  const summary = trackDirs.map(summarizeTrackVariant);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main();
