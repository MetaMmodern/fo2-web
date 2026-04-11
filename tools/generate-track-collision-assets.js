const fs = require("fs");
const path = require("path");

const { parseFile } = require("./flatout-w32-tool");

const repoRoot = path.resolve(__dirname, "..");
const tracksRoot = path.join(repoRoot, "src/data/tracks");

if (require.main === module) {
  main();
}

function main() {
  const geometryDirs = findTrackGeometryDirs(tracksRoot);

  for (const geometryDir of geometryDirs) {
    const trackGeomPath = path.join(geometryDir, "track_geom.w32");
    const bvhPath = path.join(geometryDir, "track_bvh.gen");
    const cdb2Path = path.join(geometryDir, "track_cdb2.gen");
    const logPath = path.join(geometryDir, "track_geom_log.txt");

    if (
      !fs.existsSync(trackGeomPath) ||
      !fs.existsSync(bvhPath) ||
      !fs.existsSync(cdb2Path) ||
      !fs.existsSync(logPath)
    ) {
      continue;
    }

    const meta = buildTrackCollisionMeta({
      geometryDir,
      trackGeomPath,
      bvhPath,
      cdb2Path,
      logPath,
    });
    const glb = buildCollisionGlb(meta.mesh);

    fs.writeFileSync(
      path.join(geometryDir, "collision.meta.json"),
      `${JSON.stringify(meta, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(geometryDir, "collision.glb"), glb);
    process.stdout.write(
      `generated ${path.relative(repoRoot, geometryDir)}/collision.*\n`,
    );
  }
}

function buildTrackCollisionMeta({
  geometryDir,
  trackGeomPath,
  bvhPath,
  cdb2Path,
  logPath,
}) {
  const trackGeom = parseFile(trackGeomPath);
  const trackGeomBuffer = fs.readFileSync(trackGeomPath);
  const bvh = parseTrackBvh(fs.readFileSync(bvhPath));
  const cdb2Header = parseCdb2Header(fs.readFileSync(cdb2Path));
  const logInfo = parseTrackLog(fs.readFileSync(logPath, "utf8"));
  const mesh = extractCollisionSurfaceMesh(trackGeom, trackGeomBuffer, bvh);

  return {
    formatVersion: 2,
    extractionKind: "w32-bvh-surface-subset",
    sourceFiles: {
      w32: path.relative(repoRoot, trackGeomPath),
      bvh: path.relative(repoRoot, bvhPath),
      cdb2: path.relative(repoRoot, cdb2Path),
      log: path.relative(repoRoot, logPath),
    },
    cdb2Header,
    bvh,
    models: logInfo.models,
    dynamicObjects: logInfo.dynamicObjects,
    staticBatches: logInfo.staticBatches,
    extractionStats: mesh.meta,
    mesh: {
      positions: mesh.positions,
      indices: mesh.indices,
    },
  };
}

function findTrackGeometryDirs(rootDir) {
  const result = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }

      if (entry.name === "track_geom.w32") {
        result.push(path.dirname(fullPath));
      }
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function extractCollisionSurfaceMesh(trackGeom, trackGeomBuffer, bvh) {
  const referencedSurfaceIds = new Set(
    bvh.primitives.map((primitive) => primitive.id1).filter((id) => id >= 0),
  );
  const positions = [];
  const indices = [];
  const includedSurfaceIds = [];
  const skippedVegetationSurfaceIds = [];
  const skippedUnsupportedSurfaceIds = [];
  const skippedInvalidSurfaceIds = [];
  let surfaceCount = 0;

  for (const surfaceId of [...referencedSurfaceIds].sort((left, right) => left - right)) {
    const surface = trackGeom.surfaces[surfaceId];

    if (!surface) {
      skippedInvalidSurfaceIds.push(surfaceId);
      continue;
    }

    if (surface.isVegetation) {
      skippedVegetationSurfaceIds.push(surfaceId);
      continue;
    }

    if (!(surface.numIndicesUsed > 0) || ![4, 5].includes(surface.polyMode)) {
      skippedUnsupportedSurfaceIds.push({
        surfaceId,
        polyMode: surface.polyMode,
        numIndicesUsed: surface.numIndicesUsed,
      });
      continue;
    }

    const surfaceMesh = decodeIndexedSurfaceMesh(
      trackGeom,
      trackGeomBuffer,
      surface,
      surfaceId,
    );

    if (!surfaceMesh) {
      skippedUnsupportedSurfaceIds.push({
        surfaceId,
        polyMode: surface.polyMode,
        numIndicesUsed: surface.numIndicesUsed,
        reason: "decode-failed",
      });
      continue;
    }

    const baseVertex = positions.length / 3;
    positions.push(...surfaceMesh.positions);
    indices.push(...surfaceMesh.indices.map((index) => index + baseVertex));
    includedSurfaceIds.push(surfaceId);
    surfaceCount += 1;
  }

  return {
    positions,
    indices,
    meta: {
      referencedSurfaceCount: referencedSurfaceIds.size,
      includedSurfaceCount: surfaceCount,
      includedSurfaceIds,
      skippedVegetationSurfaceIds,
      skippedUnsupportedSurfaceIds,
      skippedInvalidSurfaceIds,
      triangleCount: indices.length / 3,
      vertexCount: positions.length / 3,
      supportedPolyModes: [4, 5],
      unresolvedNote:
        "Vegetation/local-model BVH surfaces are intentionally skipped. track_cdb2 triangle command semantics are still not fully decoded.",
    },
  };
}

function decodeIndexedSurfaceMesh(trackGeom, trackGeomBuffer, surface, surfaceId) {
  if (surface.numStreamsUsed < 2) {
    return null;
  }

  const vertexStreamRef = surface.streams[0];
  const indexStreamRef = surface.streams[1];
  const vertexStream = trackGeom.streams.find(
    (stream) => stream.index === vertexStreamRef.streamId,
  );
  const indexStream = trackGeom.streams.find(
    (stream) => stream.index === indexStreamRef.streamId,
  );

  if (!vertexStream || !indexStream || vertexStream.vertexSize < 12) {
    return null;
  }

  const vertexStartOffset = vertexStream.dataOffset + vertexStreamRef.streamOffset;
  const baseVertex = Math.floor(vertexStreamRef.streamOffset / vertexStream.vertexSize);
  const localPositions = [];

  for (let index = 0; index < surface.vertexCount; index += 1) {
    const offset = vertexStartOffset + index * vertexStream.vertexSize;
    localPositions.push(
      trackGeomBuffer.readFloatLE(offset),
      trackGeomBuffer.readFloatLE(offset + 4),
      trackGeomBuffer.readFloatLE(offset + 8),
    );
  }

  const rawIndices = [];
  const indexStartOffset = indexStream.dataOffset + indexStreamRef.streamOffset;

  for (let index = 0; index < surface.numIndicesUsed; index += 1) {
    rawIndices.push(trackGeomBuffer.readUInt16LE(indexStartOffset + index * 2) - baseVertex);
  }

  if (rawIndices.some((index) => index < 0 || index >= surface.vertexCount)) {
    return null;
  }

  return {
    surfaceId,
    positions: localPositions,
    indices:
      surface.polyMode === 4
        ? expandTriangleList(rawIndices)
        : expandTriangleStrip(rawIndices),
  };
}

function expandTriangleList(indices) {
  const result = [];

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];

    if (isDegenerateTriangle(a, b, c)) {
      continue;
    }

    result.push(a, b, c);
  }

  return result;
}

function expandTriangleStrip(indices) {
  const result = [];

  for (let index = 0; index + 2 < indices.length; index += 1) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];

    if (isDegenerateTriangle(a, b, c)) {
      continue;
    }

    if (index % 2 === 0) {
      result.push(a, b, c);
    } else {
      result.push(b, a, c);
    }
  }

  return result;
}

function isDegenerateTriangle(a, b, c) {
  return a === b || b === c || a === c;
}

function parseTrackBvh(buffer) {
  let offset = 0;
  const identifier = buffer.readUInt32LE(offset);
  offset += 4;
  const version = buffer.readUInt32LE(offset);
  offset += 4;
  const primitiveCount = buffer.readUInt32LE(offset);
  offset += 4;
  const primitives = [];

  for (let index = 0; index < primitiveCount; index += 1) {
    primitives.push({
      position: readFloat3(buffer, offset),
      radius: readFloat3(buffer, offset + 12),
      id1: buffer.readInt32LE(offset + 24),
      id2: buffer.readInt32LE(offset + 28),
    });
    offset += 32;
  }

  const nodeCount = buffer.readUInt32LE(offset);
  offset += 4;
  const nodes = [];

  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push({
      position: readFloat3(buffer, offset),
      radius: readFloat3(buffer, offset + 12),
      unknown1: buffer.readInt32LE(offset + 24),
      unknown2: buffer.readInt32LE(offset + 28),
    });
    offset += 32;
  }

  return {
    identifier,
    version,
    primitiveCount,
    nodeCount,
    primitives,
    nodes,
  };
}

function parseCdb2Header(buffer) {
  return {
    identifier: buffer.readUInt32LE(0),
    dateIdentifier: buffer.readUInt32LE(4),
    boundingBoxMinRaw: [
      buffer.readUInt32LE(8),
      buffer.readUInt32LE(12),
      buffer.readUInt32LE(16),
    ],
    boundingBoxMaxRaw: [
      buffer.readUInt32LE(20),
      buffer.readUInt32LE(24),
      buffer.readUInt32LE(28),
    ],
    coordMultipliers: [
      buffer.readFloatLE(32),
      buffer.readFloatLE(36),
      buffer.readFloatLE(40),
    ],
    coordMultipliersInv: [
      buffer.readFloatLE(44),
      buffer.readFloatLE(48),
      buffer.readFloatLE(52),
    ],
    triOffset: buffer.readUInt32LE(56),
    vertOffset: buffer.readUInt32LE(60),
    byteLength: buffer.length,
  };
}

function parseTrackLog(text) {
  return {
    staticBatches: parseSection(text, "Static Batches begin", "Static Batches end", parseStaticBatchBlock),
    models: parseSection(text, "Models begin", "Models end", parseModelBlock),
    dynamicObjects: parseCompactMeshes(text),
  };
}

function parseSection(text, startMarker, endMarker, parseBlock) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);

  if (start < 0 || end < 0 || end <= start) {
    return [];
  }

  const body = text.slice(start + startMarker.length, end).trim();
  const blocks = body
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map(parseBlock).filter(Boolean);
}

function parseStaticBatchBlock(block) {
  const id = readLineNumber(block, "nId1");
  if (!Number.isFinite(id)) {
    return null;
  }

  return {
    id,
    surfaceId: readLineNumber(block, "nBVHId1_nSurfaceId"),
    bvhId2: readLineNumber(block, "nBVHId2"),
    center: readTriplet(block, "vCenter"),
    radius: readTriplet(block, "vRadius"),
  };
}

function parseModelBlock(block) {
  const name = readLineString(block, "sName");
  if (!name) {
    return null;
  }

  return {
    name,
    center: readTriplet(block, "vCenter"),
    radius: readTriplet(block, "vRadius"),
  };
}

function parseCompactMeshes(text) {
  const start = text.indexOf("Compact Meshes begin");
  const end = text.indexOf("Compact Meshes end");

  if (start < 0 || end < 0 || end <= start) {
    return [];
  }

  const body = text.slice(start + "Compact Meshes begin".length, end);
  const blocks = body
    .split(/(?=sObjectName:\s)/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => ({
    name: readLineString(block, "sObjectName"),
    dynamicName: readLineString(block, "sDynamicName"),
    flags: readLineHex(block, "nFlags"),
  }));
}

function buildCollisionGlb(mesh) {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const colors = [];

  for (let index = 0; index < positions.length / 3; index += 1) {
    colors.push(1.0, 0.72, 0.18);
  }

  return encodeGlb([
    {
      name: "track_collision",
      positions,
      colors,
      indices,
    },
  ]);
}

function encodeGlb(meshes) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const nodes = [];
  let byteOffset = 0;

  for (const mesh of meshes) {
    const positionBuffer = toFloatBuffer(mesh.positions);
    const colorBuffer = toFloatBuffer(mesh.colors);
    const indexBuffer = toIndexBuffer(mesh.indices, mesh.positions.length / 3);
    const positionView = pushBufferView(positionBuffer);
    const colorView = pushBufferView(colorBuffer);
    const indexView = pushBufferView(indexBuffer);
    const positionAccessor = pushAccessor(
      positionView,
      5126,
      mesh.positions.length / 3,
      "VEC3",
      computeMinMax(mesh.positions),
    );
    const colorAccessor = pushAccessor(
      colorView,
      5126,
      mesh.colors.length / 3,
      "VEC3",
      null,
    );
    const indexAccessor = pushAccessor(
      indexView,
      indexBuffer.componentType,
      mesh.indices.length,
      "SCALAR",
      null,
    );

    gltfMeshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            COLOR_0: colorAccessor,
          },
          indices: indexAccessor,
          material: 0,
        },
      ],
    });
    nodes.push({
      name: mesh.name,
      mesh: gltfMeshes.length - 1,
    });

    function pushBufferView(buffer) {
      const padded = padBuffer(buffer);
      const currentOffset = byteOffset;
      byteOffset += padded.length;
      chunks.push(padded);
      bufferViews.push({
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: buffer.length,
        target: buffer.target,
      });
      return bufferViews.length - 1;
    }

    function pushAccessor(bufferView, componentType, count, type, minMax) {
      accessors.push({
        bufferView,
        componentType,
        count,
        type,
        ...(minMax ? { min: minMax.min, max: minMax.max } : {}),
      });
      return accessors.length - 1;
    }
  }

  const binaryChunk = Buffer.concat(chunks);
  const jsonChunk = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0", generator: "flatout_oss collision asset generator" },
      scene: 0,
      scenes: [{ nodes: nodes.map((_, index) => index) }],
      nodes,
      meshes: gltfMeshes,
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0,
            roughnessFactor: 1,
          },
          doubleSided: true,
          alphaMode: "OPAQUE",
        },
      ],
      buffers: [{ byteLength: binaryChunk.length }],
      bufferViews,
      accessors,
    }),
  );

  const paddedJson = padJsonChunk(jsonChunk);
  const paddedBinary = padBinaryChunk(binaryChunk);
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBinary.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, paddedBinary]);
}

function toFloatBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  buffer.target = 34962;
  return buffer;
}

function toIndexBuffer(values, vertexCount) {
  const useUint32 = vertexCount > 65535;
  const buffer = Buffer.alloc(values.length * (useUint32 ? 4 : 2));
  values.forEach((value, index) => {
    if (useUint32) {
      buffer.writeUInt32LE(value, index * 4);
    } else {
      buffer.writeUInt16LE(value, index * 2);
    }
  });
  buffer.target = 34963;
  buffer.componentType = useUint32 ? 5125 : 5123;
  return buffer;
}

function computeMinMax(values) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (let index = 0; index < values.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], values[index + axis]);
      max[axis] = Math.max(max[axis], values[index + axis]);
    }
  }

  return { min, max };
}

function padJsonChunk(buffer) {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(padding, 0x20)]);
}

function padBinaryChunk(buffer) {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(padding)]);
}

function padBuffer(buffer) {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(padding)]);
}

function readFloat3(buffer, offset) {
  return [
    buffer.readFloatLE(offset),
    buffer.readFloatLE(offset + 4),
    buffer.readFloatLE(offset + 8),
  ];
}

function readTriplet(block, prefix) {
  return [
    readLineNumber(block, `${prefix}.x`),
    readLineNumber(block, `${prefix}.y`),
    readLineNumber(block, `${prefix}.z`),
  ];
}

function readLineNumber(block, key) {
  const match = block.match(new RegExp(`^${escapeRegExp(key)}:\\s*([-+]?\\d*\\.?\\d+)`, "m"));
  return match ? Number.parseFloat(match[1]) : null;
}

function readLineHex(block, key) {
  const match = block.match(new RegExp(`^${escapeRegExp(key)}:\\s*(0x[0-9A-Fa-f]+|\\d+)`, "m"));
  return match ? Number.parseInt(match[1], 0) : null;
}

function readLineString(block, key) {
  const match = block.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  buildTrackCollisionMeta,
  decodeIndexedSurfaceMesh,
  extractCollisionSurfaceMesh,
  parseCdb2Header,
  parseTrackBvh,
};
