import * as THREE from "three";

const VERTEX_POSITION = 0x2;
const VERTEX_NORMAL = 0x10;
const VERTEX_COLOR = 0x40;
const VERTEX_UV = 0x100;
const VERTEX_UV2 = 0x200;
const BGM_CONTAINER_MAGIC = 0x434d4742;
const CAR_CONTAINER_MAGIC = 0x43524143;
const MODEL_MAGIC = 0x444f4d42;
const MESH_MAGIC = 0x4853454d;
const OBJECT_MAGIC = 0x434a424f;
const MATERIAL_MAGIC = 0x4354414d;
const FO2_CAR_VERSION = 0x20000;

export async function loadMenuBgmVehicle({
  bgmUrl,
  textureRegistry,
  prepareMaterials,
}) {
  const response = await fetch(bgmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load menu car BGM: ${response.status} ${bgmUrl}`);
  }

  const parsed = parseMenuBgm(await response.arrayBuffer());
  const root = buildMenuBgmRoot(parsed);
  prepareMaterials(root, textureRegistry.getTexture);
  return root;
}

function parseMenuBgm(arrayBuffer) {
  const reader = new BinaryReader(arrayBuffer);
  let version = reader.uint32();

  if (version === BGM_CONTAINER_MAGIC || version === CAR_CONTAINER_MAGIC) {
    version = reader.uint32();
  }

  if (version !== FO2_CAR_VERSION) {
    throw new Error(`Unsupported menu BGM version 0x${version.toString(16)}`);
  }

  const materials = parseMaterials(reader, version);
  const streams = parseStreams(reader);
  const surfaces = parseSurfaces(reader, version);
  const body = parseBgmBody(reader);

  return {
    buffer: arrayBuffer,
    materials,
    streams,
    surfaces,
    body,
  };
}

function parseMaterials(reader, version) {
  const count = reader.uint32();
  const materials = [];

  for (let index = 0; index < count; index += 1) {
    reader.expectUint32(MATERIAL_MAGIC, `material ${index}`);
    const material = {
      index,
      name: reader.string(),
      alpha: reader.uint32(),
      textures: [],
    };

    material.v92 = reader.uint32();
    material.numTextures = reader.uint32();
    material.shaderId = reader.uint32();
    material.useColormap = reader.uint32();
    material.v74 = reader.uint32();
    material.v108 = reader.floats(3);
    material.v109 = reader.floats(3);
    material.v98 = reader.floats(4);
    material.v99 = reader.floats(4);
    material.v100 = reader.floats(4);
    material.v101 = reader.floats(4);
    material.v102 = reader.uint32();
    material.textures.push(reader.string());
    material.textures.push(reader.string());
    material.textures.push(reader.string());

    void version;
    materials.push(material);
  }

  return materials;
}

function parseStreams(reader) {
  const count = reader.uint32();
  const streams = [];

  for (let index = 0; index < count; index += 1) {
    const type = reader.uint32();
    const foucExtraFormat = reader.uint32();

    if (type === 1 || type === 3) {
      const vertexCount = reader.uint32();
      const vertexSize = reader.uint32();
      const flags = type === 1 ? reader.uint32() : 0;
      const dataOffset = reader.offset;
      reader.skip(vertexCount * vertexSize);
      streams.push({
        index,
        type,
        foucExtraFormat,
        vertexCount,
        vertexSize,
        flags,
        dataOffset,
      });
      continue;
    }

    if (type === 2) {
      const indexCount = reader.uint32();
      const dataOffset = reader.offset;
      reader.skip(indexCount * 2);
      streams.push({
        index,
        type,
        foucExtraFormat,
        indexCount,
        dataOffset,
      });
      continue;
    }

    throw new Error(`Unsupported menu BGM stream type ${type}`);
  }

  return streams;
}

function parseSurfaces(reader, version) {
  const count = reader.uint32();
  const surfaces = [];

  for (let index = 0; index < count; index += 1) {
    const surface = {
      index,
      isVegetation: reader.uint32(),
      materialId: reader.uint32(),
      vertexCount: reader.uint32(),
      flags: reader.uint32(),
      polyCount: reader.uint32(),
      polyMode: reader.uint32(),
      numIndicesUsed: reader.uint32(),
    };

    if (version < FO2_CAR_VERSION) {
      surface.center = reader.floats(3);
      surface.radius = reader.floats(3);
    }

    surface.numStreamsUsed = reader.uint32();
    surface.streams = [];
    for (let streamIndex = 0; streamIndex < surface.numStreamsUsed; streamIndex += 1) {
      surface.streams.push({
        streamId: reader.uint32(),
        streamOffset: reader.uint32(),
      });
    }

    surfaces.push(surface);
  }

  return surfaces;
}

function parseBgmBody(reader) {
  const models = parseModels(reader);
  const meshCount = reader.uint32();
  const meshes = [];

  for (let index = 0; index < meshCount; index += 1) {
    reader.expectUint32(MESH_MAGIC, `BGM mesh ${index}`);
    const mesh = {
      index,
      name1: reader.string(),
      name2: reader.string(),
      flags: reader.uint32(),
      group: reader.uint32(),
      matrix: reader.floats(16),
    };
    const modelCount = reader.uint32();
    mesh.modelIds = reader.uint32s(modelCount);
    meshes.push(mesh);
  }

  const objects = parseObjects(reader);
  return { models, meshes, objects };
}

function parseModels(reader) {
  const count = reader.uint32();
  const models = [];

  for (let index = 0; index < count; index += 1) {
    reader.expectUint32(MODEL_MAGIC, `model ${index}`);
    const model = {
      index,
      unk: reader.uint32(),
      name: reader.string(),
      center: reader.floats(3),
      radius: reader.floats(3),
      sphereRadius: reader.float32(),
    };
    model.surfaces = reader.uint32s(reader.uint32());
    models.push(model);
  }

  return models;
}

function parseObjects(reader) {
  const count = reader.uint32();
  const objects = [];

  for (let index = 0; index < count; index += 1) {
    reader.expectUint32(OBJECT_MAGIC, `object ${index}`);
    objects.push({
      index,
      name1: reader.string(),
      name2: reader.string(),
      flags: reader.uint32(),
      matrix: reader.floats(16),
    });
  }

  return objects;
}

function buildMenuBgmRoot(parsed) {
  const root = new THREE.Group();
  root.name = "menu_bgm_car";
  const surfaceIds = collectReferencedSurfaceIds(parsed.body.models, parsed.body.meshes);

  surfaceIds.forEach((surfaceId) => {
    const surface = parsed.surfaces[surfaceId];
    if (!surface) {
      return;
    }

    const mesh = buildSurfaceMesh(parsed, surface);
    if (mesh) {
      root.add(mesh);
    }
  });

  centerMenuBgmRoot(root);
  return root;
}

function collectReferencedSurfaceIds(models, meshes) {
  const ids = new Set();
  const referencedModelIds = meshes.flatMap((mesh) => mesh.modelIds ?? []);
  const selectedModels = referencedModelIds.length > 0
    ? referencedModelIds.map((modelId) => models[modelId]).filter(Boolean)
    : models;

  selectedModels.forEach((model) => {
    model.surfaces.forEach((surfaceId) => ids.add(surfaceId));
  });

  return ids;
}

function buildSurfaceMesh(parsed, surface) {
  if (surface.numStreamsUsed < 2 || surface.vertexCount <= 0 || surface.polyCount <= 0) {
    return null;
  }

  const vertexStreamRef = surface.streams[0];
  const indexStreamRef = surface.streams[1];
  const vertexStream = parsed.streams.find((stream) => stream.index === vertexStreamRef.streamId);
  const indexStream = parsed.streams.find((stream) => stream.index === indexStreamRef.streamId);

  if (!vertexStream || !indexStream || vertexStream.type !== 1 || indexStream.type !== 2) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const hasNormals = Boolean(vertexStream.flags & VERTEX_NORMAL);
  const hasVertexColors = Boolean(vertexStream.flags & VERTEX_COLOR);
  const hasUvs = Boolean(vertexStream.flags & (VERTEX_UV | VERTEX_UV2));
  const vertexStart = vertexStream.dataOffset + vertexStreamRef.streamOffset;

  for (let index = 0; index < surface.vertexCount; index += 1) {
    const vertexOffset = vertexStart + index * vertexStream.vertexSize;
    let offset = vertexOffset;

    if (!(vertexStream.flags & VERTEX_POSITION)) {
      return null;
    }

    positions.push(
      parsedReadFloat(parsed.buffer, offset),
      parsedReadFloat(parsed.buffer, offset + 4),
      -parsedReadFloat(parsed.buffer, offset + 8),
    );
    offset += 12;

    if (hasNormals) {
      normals.push(
        parsedReadFloat(parsed.buffer, offset),
        parsedReadFloat(parsed.buffer, offset + 4),
        -parsedReadFloat(parsed.buffer, offset + 8),
      );
      offset += 12;
    }

    if (hasVertexColors) {
      const packedColor = parsedReadUint32(parsed.buffer, offset);
      colors.push(
        (packedColor & 0xff) / 255,
        ((packedColor >> 8) & 0xff) / 255,
        ((packedColor >> 16) & 0xff) / 255,
      );
      offset += 4;
    }

    if (hasUvs) {
      uvs.push(
        parsedReadFloat(parsed.buffer, offset),
        parsedReadFloat(parsed.buffer, offset + 4),
      );
    }
  }

  const indices = buildIndices(parsed.buffer, surface, indexStream, indexStreamRef, vertexStream);
  if (indices.length === 0) {
    return null;
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (hasNormals) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }
  if (hasUvs) {
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  }
  if (hasVertexColors) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  geometry.setIndex(indices);

  if (!hasNormals) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const materialInfo = parsed.materials[surface.materialId] ?? null;
  const material = new THREE.MeshBasicMaterial({ name: materialInfo?.name ?? `surface_${surface.index}` });
  material.userData.flatoutTextures = materialInfo?.textures?.map(normalizeTextureReference) ?? [];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = material.name;
  mesh.userData.menuMaterial = materialInfo;
  return mesh;
}

function normalizeTextureReference(textureName) {
  return textureName
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

function buildIndices(buffer, surface, indexStream, indexStreamRef, vertexStream) {
  const baseVertex = Math.floor(surface.streams[0].streamOffset / vertexStream.vertexSize);
  const indexStart = indexStream.dataOffset + indexStreamRef.streamOffset;
  const raw = [];

  for (let index = 0; index < surface.numIndicesUsed; index += 1) {
    raw.push(parsedReadUint16(buffer, indexStart + index * 2) - baseVertex);
  }

  if (surface.polyMode === 5) {
    return expandTriangleStrip(raw, surface.vertexCount);
  }

  if (surface.polyMode === 4) {
    return expandTriangleList(raw, surface.vertexCount);
  }

  return expandTriangleList(raw.slice(0, surface.polyCount * 3), surface.vertexCount);
}

function expandTriangleList(raw, vertexCount) {
  const indices = [];

  for (let index = 0; index + 2 < raw.length; index += 3) {
    pushTriangle(indices, raw[index + 2], raw[index + 1], raw[index], vertexCount);
  }

  return indices;
}

function expandTriangleStrip(raw, vertexCount) {
  const indices = [];
  let flip = false;

  for (let index = 0; index + 2 < raw.length; index += 1) {
    const a = raw[index];
    const b = raw[index + 1];
    const c = raw[index + 2];

    if (flip) {
      pushTriangle(indices, a, b, c, vertexCount);
    } else {
      pushTriangle(indices, c, b, a, vertexCount);
    }
    flip = !flip;
  }

  return indices;
}

function pushTriangle(indices, a, b, c, vertexCount) {
  if (
    a < 0 ||
    b < 0 ||
    c < 0 ||
    a >= vertexCount ||
    b >= vertexCount ||
    c >= vertexCount ||
    a === b ||
    b === c ||
    a === c
  ) {
    return;
  }

  indices.push(a, b, c);
}

function centerMenuBgmRoot(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  root.position.sub(center);
  root.position.y += size.y * 0.5;
  root.userData.menuBgmSize = size;
}

function parsedReadFloat(buffer, offset) {
  return new DataView(buffer, offset, 4).getFloat32(0, true);
}

function parsedReadUint32(buffer, offset) {
  return new DataView(buffer, offset, 4).getUint32(0, true);
}

function parsedReadUint16(buffer, offset) {
  return new DataView(buffer, offset, 2).getUint16(0, true);
}

class BinaryReader {
  constructor(arrayBuffer) {
    this.buffer = arrayBuffer;
    this.view = new DataView(arrayBuffer);
    this.offset = 0;
    this.decoder = new TextDecoder("utf-8");
  }

  ensure(length) {
    if (this.offset + length > this.buffer.byteLength) {
      throw new Error(`Unexpected EOF at 0x${this.offset.toString(16)}`);
    }
  }

  expectUint32(value, label) {
    const actual = this.uint32();
    if (actual !== value) {
      throw new Error(`Invalid ${label} marker 0x${actual.toString(16)}`);
    }
  }

  skip(length) {
    this.ensure(length);
    this.offset += length;
  }

  uint16() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  uint32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  float32() {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  floats(count) {
    return Array.from({ length: count }, () => this.float32());
  }

  uint32s(count) {
    return Array.from({ length: count }, () => this.uint32());
  }

  string() {
    let end = this.offset;
    const bytes = new Uint8Array(this.buffer);

    while (end < bytes.length && bytes[end] !== 0) {
      end += 1;
    }

    if (end >= bytes.length) {
      throw new Error(`Unterminated string at 0x${this.offset.toString(16)}`);
    }

    const value = this.decoder.decode(bytes.subarray(this.offset, end));
    this.offset = end + 1;
    return value;
  }
}
