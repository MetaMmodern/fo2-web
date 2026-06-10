import * as THREE from "three";

const HEADER_BYTES = 64;
const NODE_BYTES = 8;
const TRIANGLE_GRID_SIZE = 32;
const MAX_RAYCAST_CANDIDATES = 512;
const EPSILON = 1e-6;

const tmpSampleOrigin = new THREE.Vector3();
const tmpRayDir = new THREE.Vector3();
const tmpRayEnd = new THREE.Vector3();
const tmpCellMin = new THREE.Vector3();
const tmpCellMax = new THREE.Vector3();
const tmpEdge1 = new THREE.Vector3();
const tmpEdge2 = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpQ = new THREE.Vector3();
const tmpHitNormal = new THREE.Vector3();
const tmpBoxMin = new THREE.Vector3();
const tmpBoxMax = new THREE.Vector3();
const tmpLocalA = new THREE.Vector3();
const tmpLocalB = new THREE.Vector3();
const tmpLocalC = new THREE.Vector3();
const tmpSatEdge0 = new THREE.Vector3();
const tmpSatEdge1 = new THREE.Vector3();
const tmpSatEdge2 = new THREE.Vector3();
const tmpSatNormal = new THREE.Vector3();

export async function loadNativeTrackCollision(cdb2Url) {
  if (!cdb2Url) {
    return null;
  }

  try {
    const response = await fetch(cdb2Url);
    if (!response.ok) {
      throw new Error(`Failed to load native CDB2 collision: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return parseNativeTrackCollision(arrayBuffer);
  } catch (error) {
    console.warn("Ignoring native CDB2 collision load failure:", error);
    return null;
  }
}

export function parseNativeTrackCollision(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const header = parseCdb2Header(view, arrayBuffer.byteLength);
  const readVertex = createVertexReader(view, header);
  const triangles = decodeLeafTriangles(view, header, readVertex);
  const grid = buildTriangleGrid(triangles);

  return {
    kind: "native-cdb2",
    header,
    vertexWordCount: Math.floor((header.byteLength - header.vertOffset) / 2),
    triangles,
    grid,
    sample(worldPosition, options = {}) {
      const rayHeight = options.rayHeight ?? 12;
      const rayDistance = options.rayDistance ?? rayHeight + 32;
      const origin = tmpSampleOrigin
        .copy(worldPosition)
        .addScaledVector(new THREE.Vector3(0, 1, 0), rayHeight);
      return raycastTriangles(this, origin, new THREE.Vector3(0, -1, 0), {
        ...options,
        rayDistance,
        minUpDot: options.minUpDot ?? 0.2,
      });
    },
    raycast(origin, direction, options = {}) {
      return raycastTriangles(this, origin, direction, options);
    },
    queryObbContacts(center, axes, halfExtents, options = {}) {
      return queryObbTriangleContacts(this, center, axes, halfExtents, options);
    },
  };
}

export function createIndexedTriangleCollisionSampler(
  mesh,
  kind = "indexed-collision",
  options = {},
) {
  if (
    !mesh ||
    !Array.isArray(mesh.positions) ||
    !Array.isArray(mesh.indices) ||
    mesh.positions.length < 9 ||
    mesh.indices.length < 3
  ) {
    return null;
  }

  const mirrorZ = options.mirrorZ !== false;
  const vertices = [];
  for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
    vertices.push(
      new THREE.Vector3(
        mesh.positions[index],
        mesh.positions[index + 1],
        mirrorZ ? -mesh.positions[index + 2] : mesh.positions[index + 2],
      ),
    );
  }

  const triangles = [];
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    pushTriangle(
      (vertexIndex) => vertices[vertexIndex] ?? null,
      triangles,
      0,
      0,
      0,
      mesh.indices[index],
      mesh.indices[index + 1],
      mesh.indices[index + 2],
    );
  }

  const grid = buildTriangleGrid(triangles);

  return {
    kind,
    triangles,
    grid,
    sample(worldPosition, options = {}) {
      const rayHeight = options.rayHeight ?? 12;
      const rayDistance = options.rayDistance ?? rayHeight + 32;
      const origin = tmpSampleOrigin
        .copy(worldPosition)
        .addScaledVector(new THREE.Vector3(0, 1, 0), rayHeight);
      return raycastTriangles(this, origin, new THREE.Vector3(0, -1, 0), {
        ...options,
        rayDistance,
        minUpDot: options.minUpDot ?? 0.2,
      });
    },
    raycast(origin, direction, options = {}) {
      return raycastTriangles(this, origin, direction, options);
    },
    queryObbContacts(center, axes, halfExtents, options = {}) {
      return queryObbTriangleContacts(this, center, axes, halfExtents, options);
    },
  };
}

function parseCdb2Header(view, byteLength) {
  const triOffset = view.getUint32(56, true);
  const vertOffset = view.getUint32(60, true);

  return {
    identifier: view.getUint32(0, true),
    secondaryIdentifier: view.getUint32(4, true),
    boundingBoxMinRaw: [
      view.getInt32(8, true),
      view.getInt32(12, true),
      view.getInt32(16, true),
    ],
    boundingBoxMaxRaw: [
      view.getInt32(20, true),
      view.getInt32(24, true),
      view.getInt32(28, true),
    ],
    coordMultipliers: [
      view.getFloat32(32, true),
      view.getFloat32(36, true),
      view.getFloat32(40, true),
    ],
    coordMultipliersInv: [
      view.getFloat32(44, true),
      view.getFloat32(48, true),
      view.getFloat32(52, true),
    ],
    nodeOffset: HEADER_BYTES,
    triOffset,
    vertOffset,
    byteLength,
  };
}

function createVertexReader(view, header) {
  const cache = new Map();
  const maxWordOffset = Math.floor((header.byteLength - header.vertOffset - 6) / 2);

  return (wordOffset) => {
    if (!Number.isInteger(wordOffset) || wordOffset < 0 || wordOffset > maxWordOffset) {
      return null;
    }

    const cached = cache.get(wordOffset);
    if (cached) {
      return cached;
    }

    const offset = header.vertOffset + wordOffset * 2;
    const vertex = new THREE.Vector3(
      view.getInt16(offset, true) * header.coordMultipliers[0],
      view.getInt16(offset + 2, true) * header.coordMultipliers[1],
      -view.getInt16(offset + 4, true) * header.coordMultipliers[2],
    );
    cache.set(wordOffset, vertex);
    return vertex;
  };
}

function decodeLeafTriangles(view, header, readVertex) {
  const triangles = [];
  const visited = new Set();

  visitNode(header.nodeOffset);
  return triangles;

  function visitNode(offset) {
    if (
      offset < header.nodeOffset ||
      offset + NODE_BYTES > header.triOffset ||
      visited.has(offset)
    ) {
      return;
    }
    visited.add(offset);

    const word0 = view.getUint32(offset, true);
    const word1 = view.getUint32(offset + 4, true);
    const axisOrLeaf = word0 & 3;

    if (axisOrLeaf !== 3) {
      const childOffset = header.nodeOffset + (word0 >>> 8);
      visitNode(childOffset);
      visitNode(childOffset + NODE_BYTES);
      return;
    }

    const count = word1 & 0x7f;
    if (count === 0) {
      return;
    }
    const mode = (word0 >>> 6) & 7;
    const payloadOffset = header.triOffset + (word0 >>> 9);

    if (mode > 5 || payloadOffset < header.triOffset || payloadOffset >= header.vertOffset) {
      return;
    }

    decodeCommandTriangles({
      view,
      readVertex,
      triangles,
      mode,
      payloadOffset,
      headerWord: word1,
      count,
    });
  }
}

function decodeCommandTriangles({ view, readVertex, triangles, mode, payloadOffset, headerWord, count }) {
  const baseVertexIndex = headerWord >>> 13;
  const headerMaterial = (headerWord >>> 7) & 0x3f;

  switch (mode) {
    case 0:
      decodeMode0(view, readVertex, triangles, payloadOffset, headerWord, count);
      break;
    case 1:
      decodeMode1(view, readVertex, triangles, payloadOffset, headerWord, count);
      break;
    case 2:
      decodeMode2(view, readVertex, triangles, payloadOffset, baseVertexIndex, count);
      break;
    case 3:
      decodeMode3(view, readVertex, triangles, payloadOffset, baseVertexIndex, headerMaterial, count);
      break;
    case 4:
      decodeMode4(view, readVertex, triangles, payloadOffset, baseVertexIndex, headerMaterial, count);
      break;
    case 5:
      decodeMode5(view, readVertex, triangles, payloadOffset, baseVertexIndex, headerMaterial, count);
      break;
    default:
      break;
  }
}

function pushTriangle(readVertex, triangles, materialId, edgeFlags, vertexFlags, i0, i1, i2) {
  const a = readVertex(i0);
  const b = readVertex(i1);
  const c = readVertex(i2);

  if (!a || !b || !c || i0 === i1 || i1 === i2 || i0 === i2) {
    return;
  }

  const normal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(tmpEdge2.subVectors(c, a));
  const areaSq = normal.lengthSq();

  if (areaSq < EPSILON) {
    return;
  }

  normal.normalize();
  const min = new THREE.Vector3(
    Math.min(a.x, b.x, c.x),
    Math.min(a.y, b.y, c.y),
    Math.min(a.z, b.z, c.z),
  );
  const max = new THREE.Vector3(
    Math.max(a.x, b.x, c.x),
    Math.max(a.y, b.y, c.y),
    Math.max(a.z, b.z, c.z),
  );

  triangles.push({
    a,
    b,
    c,
    normal,
    min,
    max,
    materialId,
    edgeFlags,
    vertexFlags,
  });
}

function decodeMode0(view, readVertex, triangles, offset, headerWord, count) {
  const base = headerWord >>> 13;
  let cursor = offset;

  if (count <= 0) {
    return;
  }

  {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    const b5 = readByte(view, cursor + 5);
    pushTriangle(
      readVertex,
      triangles,
      (headerWord >>> 7) & 0x3f,
      b0 & 0x3f,
      b0 >>> 6,
      base,
      (((b3 & 7) << 16) | (b2 << 8) | b1),
      (((b5 << 8) | b4) << 5) | (b3 >>> 3),
    );
    cursor += 6;
  }

  for (let index = 1; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    const b5 = readByte(view, cursor + 5);
    const b6 = readByte(view, cursor + 6);
    const b7 = readByte(view, cursor + 7);
    const b8 = readByte(view, cursor + 8);
    pushTriangle(
      readVertex,
      triangles,
      b1 & 0x3f,
      b0 & 0x3f,
      b0 >>> 6,
      ((((b4 & 3) << 16) | (b3 << 8) | b2) << 1) | (b1 >>> 7),
      (((b6 & 0x1f) << 14) | (b5 << 6) | (b4 >>> 2)),
      (((b8 << 8) | b7) << 3) | (b6 >>> 5),
    );
    cursor += 9;
  }
}

function decodeMode1(view, readVertex, triangles, offset, headerWord, count) {
  const base = headerWord >>> 13;
  const material = (headerWord >>> 7) & 0x3f;
  let cursor = offset;

  if (count <= 0) {
    return;
  }

  {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    const b5 = readByte(view, cursor + 5);
    pushTriangle(
      readVertex,
      triangles,
      material,
      b0 & 0x3f,
      b0 >>> 6,
      base,
      (((b3 & 7) << 16) | (b2 << 8) | b1),
      (((b5 << 8) | b4) << 5) | (b3 >>> 3),
    );
    cursor += 6;
  }

  for (let index = 1; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    const b5 = readByte(view, cursor + 5);
    const b6 = readByte(view, cursor + 6);
    const b7 = readByte(view, cursor + 7);
    pushTriangle(
      readVertex,
      triangles,
      material,
      b0 & 0x3f,
      (b0 >>> 6) & 1,
      ((((b3 & 3) << 16) | (b2 << 8) | b1) << 1) | (b0 >>> 7),
      (((b5 & 0x1f) << 14) | (b4 << 6) | (b3 >>> 2)),
      (((b7 << 8) | b6) << 3) | (b5 >>> 5),
    );
    cursor += 8;
  }
}

function decodeMode2(view, readVertex, triangles, offset, base, count) {
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    pushTriangle(readVertex, triangles, b1 & 0x3f, b0 & 0x3f, b0 >>> 6, base + b2, base + b3, base + b4);
    cursor += 5;
  }
}

function decodeMode3(view, readVertex, triangles, offset, base, material, count) {
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    pushTriangle(readVertex, triangles, material, b0 & 0x3f, b0 >>> 6, base + b1, base + b2, base + b3);
    cursor += 4;
  }
}

function decodeMode4(view, readVertex, triangles, offset, base, material, count) {
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    const b3 = readByte(view, cursor + 3);
    const b4 = readByte(view, cursor + 4);
    pushTriangle(
      readVertex,
      triangles,
      material,
      b0 & 0x3f,
      (b0 >>> 6) & 1,
      base + ((((b2 & 3) << 8) | b1) << 1 | (b0 >>> 7)),
      base + ((b2 >>> 2) | ((b3 & 0x1f) << 6)),
      base + ((b3 >>> 5) | (b4 << 3)),
    );
    cursor += 5;
  }
}

function decodeMode5(view, readVertex, triangles, offset, base, material, count) {
  let cursor = offset;
  for (let index = 0; index < count; index += 1) {
    const b0 = readByte(view, cursor);
    const b1 = readByte(view, cursor + 1);
    const b2 = readByte(view, cursor + 2);
    pushTriangle(
      readVertex,
      triangles,
      material,
      b0 & 0x3f,
      b0 >>> 6,
      base + (b1 & 0x1f),
      base + ((b1 >>> 5) | ((b2 & 3) << 3)),
      base + (b2 >>> 2),
    );
    cursor += 3;
  }
}

function readByte(view, offset) {
  return view.getUint8(offset);
}

function buildTriangleGrid(triangles) {
  if (triangles.length === 0) {
    return null;
  }

  const cells = new Map();
  for (const triangle of triangles) {
    const minX = Math.floor(triangle.min.x / TRIANGLE_GRID_SIZE);
    const maxX = Math.floor(triangle.max.x / TRIANGLE_GRID_SIZE);
    const minY = Math.floor(triangle.min.y / TRIANGLE_GRID_SIZE);
    const maxY = Math.floor(triangle.max.y / TRIANGLE_GRID_SIZE);
    const minZ = Math.floor(triangle.min.z / TRIANGLE_GRID_SIZE);
    const maxZ = Math.floor(triangle.max.z / TRIANGLE_GRID_SIZE);

    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellY = minY; cellY <= maxY; cellY += 1) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
          const key = `${cellX}:${cellY}:${cellZ}`;
          const list = cells.get(key);
          if (list) {
            list.push(triangle);
          } else {
            cells.set(key, [triangle]);
          }
        }
      }
    }
  }

  return { cells, gridSize: TRIANGLE_GRID_SIZE };
}

function raycastTriangles(nativeCollision, origin, direction, options = {}) {
  if (!nativeCollision || !origin || !direction || direction.lengthSq() < EPSILON) {
    return null;
  }

  const rayDistance = options.rayDistance ?? 8;
  const minUpDot = options.minUpDot ?? -1;
  const maxUpDot = options.maxUpDot ?? 1;
  const normalizedDirection = tmpRayDir.copy(direction).normalize();
  const candidates = queryTriangleGrid(nativeCollision, origin, normalizedDirection, rayDistance);
  let best = null;
  let bestDistance = rayDistance;

  for (const triangle of candidates) {
    const normal = tmpHitNormal.copy(triangle.normal);
    if (normal.dot(normalizedDirection) > 0) {
      normal.negate();
    }

    if (normal.y < minUpDot || normal.y > maxUpDot) {
      continue;
    }

    const distance = intersectRayTriangle(origin, normalizedDirection, triangle);
    if (distance === null || distance < 0 || distance > bestDistance) {
      continue;
    }

    bestDistance = distance;
    best = triangle;
  }

  if (!best) {
    return null;
  }

  return {
    point: new THREE.Vector3().copy(origin).addScaledVector(normalizedDirection, bestDistance),
    normal: orientNormalAgainstRay(best.normal, normalizedDirection),
    distance: bestDistance,
    surfaceType: "native",
    materialSlot: best.materialId,
    materialId: best.materialId,
    edgeFlags: best.edgeFlags,
    vertexFlags: best.vertexFlags,
  };
}

function queryObbTriangleContacts(nativeCollision, center, axes, halfExtents, options = {}) {
  if (
    !nativeCollision ||
    !center ||
    !axes?.x ||
    !axes?.y ||
    !axes?.z ||
    !halfExtents
  ) {
    return [];
  }

  const skin = options.skin ?? 0.08;
  const minUpDot = options.minUpDot ?? -1;
  const maxUpDot = options.maxUpDot ?? 1;
  const maxContacts = options.maxContacts ?? 8;
  const candidates = queryTriangleGridAabb(
    nativeCollision,
    computeObbWorldAabb(center, axes, halfExtents, skin),
    options.maxCandidates ?? 4096,
  );
  const contacts = [];

  for (const triangle of candidates) {
    const normal = tmpHitNormal.copy(triangle.normal).normalize();

    if (normal.y < minUpDot || normal.y > maxUpDot) {
      continue;
    }

    const localA = worldToObbLocal(tmpLocalA, triangle.a, center, axes);
    const localB = worldToObbLocal(tmpLocalB, triangle.b, center, axes);
    const localC = worldToObbLocal(tmpLocalC, triangle.c, center, axes);
    if (!triangleIntersectsLocalBox(localA, localB, localC, halfExtents, skin)) {
      continue;
    }

    let signedDistance = normal.dot(new THREE.Vector3().subVectors(center, triangle.a));
    if (Math.abs(signedDistance) < EPSILON) {
      signedDistance = -skin;
    }

    const supportRadius =
      Math.abs(normal.dot(axes.x)) * halfExtents.x +
      Math.abs(normal.dot(axes.y)) * halfExtents.y +
      Math.abs(normal.dot(axes.z)) * halfExtents.z;
    const penetration = supportRadius + skin - Math.abs(signedDistance);

    if (penetration <= 0) {
      continue;
    }

    const contactNormal = normal.clone();
    if (signedDistance < 0) {
      contactNormal.negate();
    }

    contacts.push({
      point: closestTriangleVertexToCenter(triangle, center).clone(),
      normal: contactNormal,
      distance: Math.max(Math.abs(signedDistance) - supportRadius, 0),
      penetration,
      surfaceType: "native",
      materialSlot: triangle.materialId,
      materialId: triangle.materialId,
      edgeFlags: triangle.edgeFlags,
      vertexFlags: triangle.vertexFlags,
    });

    contacts.sort((a, b) => b.penetration - a.penetration);
    if (contacts.length > maxContacts) {
      contacts.length = maxContacts;
    }
  }

  return contacts;
}

function computeObbWorldAabb(center, axes, halfExtents, skin) {
  const extentX =
    Math.abs(axes.x.x) * halfExtents.x +
    Math.abs(axes.y.x) * halfExtents.y +
    Math.abs(axes.z.x) * halfExtents.z +
    skin;
  const extentY =
    Math.abs(axes.x.y) * halfExtents.x +
    Math.abs(axes.y.y) * halfExtents.y +
    Math.abs(axes.z.y) * halfExtents.z +
    skin;
  const extentZ =
    Math.abs(axes.x.z) * halfExtents.x +
    Math.abs(axes.y.z) * halfExtents.y +
    Math.abs(axes.z.z) * halfExtents.z +
    skin;

  tmpBoxMin.set(center.x - extentX, center.y - extentY, center.z - extentZ);
  tmpBoxMax.set(center.x + extentX, center.y + extentY, center.z + extentZ);
  return { min: tmpBoxMin, max: tmpBoxMax };
}

function worldToObbLocal(target, point, center, axes) {
  target.subVectors(point, center);
  const x = target.dot(axes.x);
  const y = target.dot(axes.y);
  const z = target.dot(axes.z);
  target.set(x, y, z);
  return target;
}

function triangleIntersectsLocalBox(a, b, c, halfExtents, skin) {
  const expandedHalfExtents = {
    x: halfExtents.x + skin,
    y: halfExtents.y + skin,
    z: halfExtents.z + skin,
  };

  if (!triangleLocalAabbOverlapsBox(a, b, c, expandedHalfExtents)) {
    return false;
  }

  tmpSatEdge0.subVectors(b, a);
  tmpSatEdge1.subVectors(c, b);
  tmpSatEdge2.subVectors(a, c);
  tmpSatNormal.crossVectors(tmpSatEdge0, tmpSatEdge1);

  if (
    !axisSeparatesTriangleAndBox(tmpSatNormal, a, b, c, expandedHalfExtents) ||
    !testTriangleBoxCrossAxes(tmpSatEdge0, a, b, c, expandedHalfExtents) ||
    !testTriangleBoxCrossAxes(tmpSatEdge1, a, b, c, expandedHalfExtents) ||
    !testTriangleBoxCrossAxes(tmpSatEdge2, a, b, c, expandedHalfExtents)
  ) {
    return false;
  }

  return true;
}

function triangleLocalAabbOverlapsBox(a, b, c, halfExtents) {
  const minX = Math.min(a.x, b.x, c.x);
  const maxX = Math.max(a.x, b.x, c.x);
  const minY = Math.min(a.y, b.y, c.y);
  const maxY = Math.max(a.y, b.y, c.y);
  const minZ = Math.min(a.z, b.z, c.z);
  const maxZ = Math.max(a.z, b.z, c.z);

  return (
    maxX >= -halfExtents.x &&
    minX <= halfExtents.x &&
    maxY >= -halfExtents.y &&
    minY <= halfExtents.y &&
    maxZ >= -halfExtents.z &&
    minZ <= halfExtents.z
  );
}

function testTriangleBoxCrossAxes(edge, a, b, c, halfExtents) {
  return (
    axisSeparatesTriangleAndBox(
      { x: 0, y: -edge.z, z: edge.y },
      a,
      b,
      c,
      halfExtents,
    ) &&
    axisSeparatesTriangleAndBox(
      { x: edge.z, y: 0, z: -edge.x },
      a,
      b,
      c,
      halfExtents,
    ) &&
    axisSeparatesTriangleAndBox(
      { x: -edge.y, y: edge.x, z: 0 },
      a,
      b,
      c,
      halfExtents,
    )
  );
}

function axisSeparatesTriangleAndBox(axis, a, b, c, halfExtents) {
  const axisLengthSq = axis.x * axis.x + axis.y * axis.y + axis.z * axis.z;
  if (axisLengthSq < EPSILON) {
    return true;
  }

  const pa = a.x * axis.x + a.y * axis.y + a.z * axis.z;
  const pb = b.x * axis.x + b.y * axis.y + b.z * axis.z;
  const pc = c.x * axis.x + c.y * axis.y + c.z * axis.z;
  const min = Math.min(pa, pb, pc);
  const max = Math.max(pa, pb, pc);
  const radius =
    halfExtents.x * Math.abs(axis.x) +
    halfExtents.y * Math.abs(axis.y) +
    halfExtents.z * Math.abs(axis.z);

  return !(min > radius || max < -radius);
}

function closestTriangleVertexToCenter(triangle, center) {
  const da = triangle.a.distanceToSquared(center);
  const db = triangle.b.distanceToSquared(center);
  const dc = triangle.c.distanceToSquared(center);
  if (da <= db && da <= dc) {
    return triangle.a;
  }
  return db <= dc ? triangle.b : triangle.c;
}

function orientNormalAgainstRay(normal, direction) {
  const result = normal.clone();
  if (result.dot(direction) > 0) {
    result.negate();
  }
  return result;
}

function queryTriangleGrid(nativeCollision, origin, direction, distance) {
  if (!nativeCollision.grid) {
    return nativeCollision.triangles;
  }

  tmpRayEnd.copy(origin).addScaledVector(direction, distance);
  tmpCellMin.set(
    Math.min(origin.x, tmpRayEnd.x),
    Math.min(origin.y, tmpRayEnd.y),
    Math.min(origin.z, tmpRayEnd.z),
  );
  tmpCellMax.set(
    Math.max(origin.x, tmpRayEnd.x),
    Math.max(origin.y, tmpRayEnd.y),
    Math.max(origin.z, tmpRayEnd.z),
  );

  const gridSize = nativeCollision.grid.gridSize;
  const minX = Math.floor(tmpCellMin.x / gridSize);
  const maxX = Math.floor(tmpCellMax.x / gridSize);
  const minY = Math.floor(tmpCellMin.y / gridSize);
  const maxY = Math.floor(tmpCellMax.y / gridSize);
  const minZ = Math.floor(tmpCellMin.z / gridSize);
  const maxZ = Math.floor(tmpCellMax.z / gridSize);
  const seen = new Set();
  const result = [];

  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const list = nativeCollision.grid.cells.get(`${cellX}:${cellY}:${cellZ}`);
        if (!list) {
          continue;
        }
        for (const triangle of list) {
          if (seen.has(triangle)) {
            continue;
          }
          seen.add(triangle);
          result.push(triangle);
          if (result.length >= MAX_RAYCAST_CANDIDATES) {
            return result;
          }
        }
      }
    }
  }

  return result;
}

function queryTriangleGridAabb(nativeCollision, box, maxCandidates = MAX_RAYCAST_CANDIDATES) {
  if (!nativeCollision.grid) {
    return nativeCollision.triangles;
  }

  const gridSize = nativeCollision.grid.gridSize;
  const minX = Math.floor(box.min.x / gridSize);
  const maxX = Math.floor(box.max.x / gridSize);
  const minY = Math.floor(box.min.y / gridSize);
  const maxY = Math.floor(box.max.y / gridSize);
  const minZ = Math.floor(box.min.z / gridSize);
  const maxZ = Math.floor(box.max.z / gridSize);
  const seen = new Set();
  const result = [];

  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const list = nativeCollision.grid.cells.get(`${cellX}:${cellY}:${cellZ}`);
        if (!list) {
          continue;
        }
        for (const triangle of list) {
          if (seen.has(triangle)) {
            continue;
          }
          seen.add(triangle);
          result.push(triangle);
          if (result.length >= maxCandidates) {
            return result;
          }
        }
      }
    }
  }

  return result;
}

function intersectRayTriangle(origin, direction, triangle) {
  tmpEdge1.subVectors(triangle.b, triangle.a);
  tmpEdge2.subVectors(triangle.c, triangle.a);
  tmpP.crossVectors(direction, tmpEdge2);
  const determinant = tmpEdge1.dot(tmpP);

  if (Math.abs(determinant) < EPSILON) {
    return null;
  }

  const invDeterminant = 1 / determinant;
  tmpT.subVectors(origin, triangle.a);
  const u = tmpT.dot(tmpP) * invDeterminant;
  if (u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }

  tmpQ.crossVectors(tmpT, tmpEdge1);
  const v = direction.dot(tmpQ) * invDeterminant;
  if (v < -EPSILON || u + v > 1 + EPSILON) {
    return null;
  }

  return tmpEdge2.dot(tmpQ) * invDeterminant;
}
