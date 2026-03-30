#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const FILE_VERSIONS = {
  0x10002: "FlatOut 1 Player Model",
  0x10003: "Retro Demo / Tough Trucks Track",
  0x10004: "FlatOut 1 Car",
  0x10005: "FlatOut 1 Track",
  0x20000: "FlatOut 2 / Ultimate Carnage Car",
  0x20001: "FlatOut 2 Track",
  0x20002: "FlatOut Ultimate Carnage Track",
};

function shaderNameFor(version, shaderId, isFoucModel) {
  if (version <= 0x10003 && version !== 0x10002) {
    const map = {
      0: "default static",
      1: "default dynamic",
      2: "lightmapped",
      3: "car body",
      4: "car window",
      5: "rendertarget shadow",
      6: "sunmap 1",
      7: "sunmap 2",
      8: "sunmap 3",
      9: "sunmap track 1",
      10: "sunmap track 2",
      11: "intensity map",
      12: "sunflare",
      13: "default static",
    };
    return map[shaderId] ?? "UNKNOWN";
  }

  const fo2Map = isFoucModel
    ? {
        0: "static prelit",
        1: "terrain",
        2: "terrain specular",
        3: "dynamic diffuse",
        4: "dynamic specular",
        5: "car body",
        6: "car window",
        7: "car diffuse",
        8: "car metal",
        9: "car tire rim",
        10: "car lights",
        11: "car shear",
        12: "car scale",
        13: "shadow project",
        14: "car lights unlit",
        15: "default",
        16: "vertex color",
        17: "shadow sampler",
        18: "grass",
        19: "tree trunk",
        20: "tree branch",
        21: "tree leaf",
        22: "particle",
        23: "sunflare",
        24: "intensitymap",
        25: "water",
        26: "skinning",
        27: "tree lod (default)",
        28: "@deprecated: streak shader on PS2",
        29: "clouds (uvscroll)",
        30: "car bodylod",
        31: "@deprecated: vertex color static",
        32: "car window damaged",
        33: "skin shadow(deprecated)",
        34: "reflecting window shader (static)",
        35: "reflecting window shader (dynamic)",
        36: "@deprecated: old STATIC_SPECULAR",
        37: "skybox",
        38: "horizon",
        39: "ghost body",
        40: "static nonlit",
        41: "dynamic nonlit",
        42: "skid marks",
        43: "car interior",
        44: "car tire",
        45: "puddle",
        46: "ambient shadow",
        47: "local water shader",
        48: "static specular/hilight shader",
        49: "lightmapped planar reflection",
        50: "racemap",
        51: "HDR default shader (runtime)",
        52: "ambient particle shader",
        53: "videoscreen shader (dynamic)",
        54: "videoscreen shader (static)",
      }
    : {
        0: "static prelit",
        1: "terrain",
        2: "terrain specular",
        3: "dynamic diffuse",
        4: "dynamic specular",
        5: "car body",
        6: "car window",
        7: "car diffuse",
        8: "car metal",
        9: "car tire",
        10: "car lights",
        11: "car shear",
        12: "car scale",
        13: "shadow project",
        14: "car lights unlit",
        15: "default",
        16: "vertex color",
        17: "shadow sampler",
        18: "grass",
        19: "tree trunk",
        20: "tree branch",
        21: "tree leaf",
        22: "particle",
        23: "sunflare",
        24: "intensitymap",
        25: "water",
        26: "skinning",
        27: "tree lod (default)",
        28: "DUMMY (streak shader on PS2)",
        29: "clouds (uvscroll)",
        30: "car bodylod",
        31: "vertex color static",
        32: "car window damaged",
        33: "skin shadow",
        34: "reflecting window shader (static)",
        35: "reflecting window shader (dynamic)",
        36: "@deprecated: old STATIC_SPECULAR",
        37: "skybox",
        38: "ghost body",
        39: "static nonlit",
        40: "dynamic nonlit",
        41: "racemap",
      };

  return fo2Map[shaderId] ?? "UNKNOWN";
}

class BufferReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  ensure(length) {
    if (this.offset + length > this.buffer.length) {
      throw new Error(
        `Unexpected EOF at 0x${this.offset.toString(16)} while reading ${length} bytes`,
      );
    }
  }

  uint32() {
    this.ensure(4);
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  int32() {
    this.ensure(4);
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  float32() {
    this.ensure(4);
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  uint16() {
    this.ensure(2);
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  bytes(length) {
    this.ensure(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
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
    while (end < this.buffer.length && this.buffer[end] !== 0) {
      end += 1;
    }

    if (end >= this.buffer.length) {
      throw new Error(`Unterminated string at 0x${this.offset.toString(16)}`);
    }

    const value = this.buffer.toString("utf8", this.offset, end);
    this.offset = end + 1;
    return value;
  }
}

function usage() {
  console.error(
    "Usage: node tools/flatout-w32-tool.js <file> [--out output.json] [--pretty]",
  );
}

function parsePlantVdb(buffer, filePath) {
  const reader = new BufferReader(buffer);
  const identifier = reader.uint32();
  if (identifier !== 0x62647370) {
    throw new Error("Not a plant_vdb/gen psdb file");
  }

  const header = [reader.int32(), reader.int32()];
  const recordCount = reader.int32();
  const records = [];

  for (let index = 0; index < recordCount; index += 1) {
    records.push({
      index,
      data: reader.floats(6),
      surfaceId: reader.uint32(),
      plantId: reader.uint32(),
    });
  }

  const trailingValue = reader.uint32();
  const array1 = reader.floats(3);
  const array2 = reader.floats(3);
  const tailOffset = reader.offset;
  const tailByteLength = buffer.length - tailOffset;
  const tailWordCount = Math.floor(tailByteLength / 4);
  const tailWords = [];
  const tailFloats = [];
  for (let index = 0; index < tailWordCount; index += 1) {
    const value = reader.uint32();
    tailWords.push(value);
    tailFloats.push(buffer.readFloatLE(tailOffset + index * 4));
  }

  return {
    kind: "plant_vdb",
    file: filePath,
    size: buffer.length,
    identifier: "psdb",
    header,
    recordCount,
    records,
    trailingValue,
    array1,
    array2,
    tailOffset,
    tailWordCount,
    tailWords,
    tailFloats,
    remainingBytes: buffer.length - reader.offset,
  };
}

function parsePlantGeom(buffer, filePath) {
  const reader = new BufferReader(buffer);
  const identifier = reader.uint32();
  if (identifier !== 0x62647370) {
    throw new Error("Not a plant_geom psdb file");
  }

  const headerCount = reader.uint32();
  const blockA = reader.floats(8);
  const blockB = reader.floats(8);
  const pairA = reader.floats(2);
  const pairB = reader.floats(2);
  const pairC = reader.floats(2);

  const mappingCount = reader.uint32();
  const mappings = [];
  for (let index = 0; index < mappingCount; index += 1) {
    mappings.push({
      index,
      value0: reader.uint32(),
      value1: reader.uint32(),
      value0Hex: `0x${mappingsHex(reader.buffer, reader.offset - 8)}`,
      value1Hex: `0x${mappingsHex(reader.buffer, reader.offset - 4)}`,
    });
  }

  const entryCount = reader.uint32();
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    entries.push({
      index,
      value0: reader.uint32(),
      value1: reader.uint32(),
    });
  }

  return {
    kind: "plant_geom",
    file: filePath,
    size: buffer.length,
    identifier: "psdb",
    headerCount,
    blockA,
    blockB,
    pairA,
    pairB,
    pairC,
    mappingCount,
    mappings,
    entryCount,
    entries,
    remainingBytes: buffer.length - reader.offset,
  };
}

function mappingsHex(buffer, offset) {
  return buffer.readUInt32LE(offset).toString(16).toUpperCase();
}

function parseMaterials(reader, version, flags) {
  const numMaterials = reader.uint32();
  const materials = [];

  for (let index = 0; index < numMaterials; index += 1) {
    const identifier = reader.uint32();
    if (identifier !== 0x4354414d) {
      throw new Error(`Invalid material chunk at index ${index}`);
    }

    const material = {
      index,
      identifier: "MATC",
      name: reader.string(),
      alpha: reader.uint32(),
      textures: [],
    };

    if (version >= 0x10004 || version === 0x10002) {
      material.v92 = reader.uint32();
      material.numTextures = reader.uint32();
      material.shaderId = reader.uint32();
      material.shaderName = shaderNameFor(version, material.shaderId, flags.isFoucModel);
      material.useColormap = reader.uint32();
      material.v74 = reader.uint32();
      material.v108 = reader.floats(3);
      material.v109 = reader.floats(3);
    } else {
      material.legacy = {
        tmp0: reader.uint32(),
        tmp1: reader.uint32(),
        tmp2: reader.uint32(),
      };
      material.shaderId = reader.uint32();
      material.shaderName = shaderNameFor(version, material.shaderId, flags.isFoucModel);
      material.useColormap = reader.uint32();
      material.v108 = [reader.float32()];
    }

    material.v98 = reader.floats(4);
    material.v99 = reader.floats(4);
    material.v100 = reader.floats(4);
    material.v101 = reader.floats(4);
    material.v102 = reader.uint32();
    material.textures.push(reader.string());
    material.textures.push(reader.string());
    material.textures.push(reader.string());
    materials.push(material);
  }

  return materials;
}

function parseStreams(reader) {
  const streamCount = reader.uint32();
  const streams = [];

  for (let index = 0; index < streamCount; index += 1) {
    const type = reader.uint32();
    if (type === 1 || type === 3) {
      const foucExtraFormat = reader.uint32();
      const vertexCount = reader.uint32();
      const vertexSize = reader.uint32();
      const flags = type === 1 ? reader.uint32() : 0;
      const byteLength = vertexCount * vertexSize;
      const dataOffset = reader.offset;
      reader.bytes(byteLength);

      streams.push({
        index,
        type,
        kind: type === 3 ? "vegetation-vertex-buffer" : "vertex-buffer",
        foucExtraFormat,
        vertexCount,
        vertexSize,
        flags,
        dataOffset,
        byteLength,
      });
      continue;
    }

    if (type === 2) {
      const foucExtraFormat = reader.uint32();
      const indexCount = reader.uint32();
      const byteLength = indexCount * 2;
      const dataOffset = reader.offset;
      reader.bytes(byteLength);

      streams.push({
        index,
        type,
        kind: "index-buffer",
        foucExtraFormat,
        indexCount,
        dataOffset,
        byteLength,
      });
      continue;
    }

    throw new Error(`Unsupported stream type ${type} at index ${index}`);
  }

  return streams;
}

function parseSurfaces(reader, flags) {
  const surfaceCount = reader.uint32();
  const surfaces = [];

  for (let index = 0; index < surfaceCount; index += 1) {
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

    if (flags.version < 0x20000) {
      surface.center = reader.floats(3);
      surface.radius = reader.floats(3);
    }

    if (flags.isFoucModel) {
      surface.foucVertexMultiplier = reader.floats(4);
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

function parseTrackBody(reader, flags) {
  const staticBatchCount = reader.uint32();
  const staticBatches = [];
  for (let index = 0; index < staticBatchCount; index += 1) {
    const batch = {
      index,
      id1: reader.uint32(),
      bvhId1: reader.uint32(),
      bvhId2: reader.uint32(),
    };

    if (flags.version >= 0x20000) {
      batch.center = reader.floats(3);
      batch.radius = reader.floats(3);
    } else {
      batch.unk = reader.uint32();
    }

    staticBatches.push(batch);
  }

  let treeColors = [];
  if (!flags.isFoucModel) {
    const treeColorCount = reader.uint32();
    treeColors = reader.uint32s(treeColorCount);
  }

  const treeLodCount = reader.uint32();
  const treeLods = [];
  for (let index = 0; index < treeLodCount; index += 1) {
    treeLods.push({
      index,
      position: reader.floats(3),
      scale: reader.float32(),
      values: reader.uint32s(3),
    });
  }

  const treeMeshCount = reader.uint32();
  const treeMeshes = [];
  for (let index = 0; index < treeMeshCount; index += 1) {
    const treeMesh = {
      index,
      isBush: reader.uint32(),
      unk2Unused: reader.uint32(),
      bvhId1: reader.uint32(),
      bvhId2: reader.uint32(),
      matrix: reader.floats(16),
      scale: reader.floats(3),
    };

    if (flags.isFoucModel) {
      treeMesh.foucTrunk = reader.float32();
      treeMesh.foucBranch = reader.float32();
      treeMesh.foucLeaf = reader.float32();
      treeMesh.foucExtraData4 = reader.floats(4);
    } else {
      treeMesh.trunkSurfaceId = reader.uint32();
      treeMesh.branchSurfaceId = reader.uint32();
      treeMesh.leafSurfaceId = reader.uint32();
      treeMesh.colorId = reader.uint32();
      treeMesh.lodId = reader.uint32();
      treeMesh.materialId = reader.uint32();
    }

    treeMeshes.push(treeMesh);
  }

  const collisionOffsetMatrix = flags.version >= 0x10004 ? reader.floats(16) : null;

  const models = parseModels(reader);
  const objects = parseObjects(reader);

  let collidableModels = [];
  let meshDamageAssociations = [];
  let compactMeshes = null;
  let lateSectionWarning = null;
  const lateSectionOffset = reader.offset;

  try {
    if (flags.version >= 0x20000) {
      collidableModels = parseCollidableModels(reader);
      meshDamageAssociations = parseMeshDamageAssociations(reader);
    }

    compactMeshes = parseCompactMeshes(reader, flags.version);
  } catch (error) {
    reader.offset = lateSectionOffset;
    lateSectionWarning = error.message;
  }

  let trailingTail = null;
  if (lateSectionWarning) {
    const tailOffset = reader.offset;
    const tailByteLength = reader.buffer.length - tailOffset;
    const tailWordCount = Math.floor(tailByteLength / 4);
    const tailWords = [];
    for (let index = 0; index < tailWordCount; index += 1) {
      tailWords.push(reader.uint32());
    }

    trailingTail = {
      tailOffset,
      tailByteLength,
      tailWordCount,
      tailWords,
    };
  }

  return {
    staticBatchCount,
    staticBatches,
    treeColors,
    treeLods,
    treeMeshes,
    collisionOffsetMatrix,
    models,
    objects,
    collidableModels,
    meshDamageAssociations,
    compactMeshes,
    lateSectionWarning,
    trailingTail,
  };
}

function parseModels(reader) {
  const modelCount = reader.uint32();
  const models = [];
  for (let index = 0; index < modelCount; index += 1) {
    const identifier = reader.uint32();
    if (identifier !== 0x444f4d42) {
      throw new Error(`Invalid model chunk at index ${index}`);
    }

    const unk = reader.uint32();
    const name = reader.string();
    const center = reader.floats(3);
    const radius = reader.floats(3);
    const sphereRadius = reader.float32();
    const surfaceCount = reader.uint32();
    const surfaces = reader.uint32s(surfaceCount);

    models.push({
      index,
      identifier: "BMOD",
      unk,
      name,
      center,
      radius,
      sphereRadius,
      surfaces,
    });
  }
  return models;
}

function parseObjects(reader) {
  const objectCount = reader.uint32();
  const objects = [];
  for (let index = 0; index < objectCount; index += 1) {
    const identifier = reader.uint32();
    if (identifier !== 0x434a424f) {
      throw new Error(`Invalid object chunk at index ${index}`);
    }

    objects.push({
      index,
      identifier: "OBJC",
      name1: reader.string(),
      name2: reader.string(),
      flags: reader.uint32(),
      matrix: reader.floats(16),
    });
  }
  return objects;
}

function parseCollidableModels(reader) {
  const count = reader.uint32();
  const models = [];
  for (let index = 0; index < count; index += 1) {
    const modelCount = reader.uint32();
    models.push({
      index,
      modelIds: reader.uint32s(modelCount),
      center: reader.floats(3),
      radius: reader.floats(3),
    });
  }
  return models;
}

function parseMeshDamageAssociations(reader) {
  const count = reader.uint32();
  const associations = [];
  for (let index = 0; index < count; index += 1) {
    associations.push({
      index,
      name: reader.string(),
      ids: reader.uint32s(2),
    });
  }
  return associations;
}

function parseCompactMeshes(reader, version) {
  const groupCount = reader.uint32();
  const meshCount = reader.uint32();
  const meshes = [];
  for (let index = 0; index < meshCount; index += 1) {
    const identifier = reader.uint32();
    if (identifier !== 0x4853454d) {
      throw new Error(`Invalid compact mesh chunk at index ${index}`);
    }

    const mesh = {
      index,
      identifier: "MESH",
      name1: reader.string(),
      name2: reader.string(),
      flags: reader.uint32(),
      group: reader.uint32(),
      matrix: reader.floats(16),
    };

    if (version >= 0x20000) {
      mesh.unk1 = reader.uint32();
      mesh.damageAssocId = reader.uint32();
    } else {
      const lodCount = reader.uint32();
      mesh.modelIds = reader.uint32s(lodCount);
    }

    meshes.push(mesh);
  }

  return {
    groupCount,
    meshCount,
    meshes,
  };
}

function parseBgmBody(reader) {
  const models = parseModels(reader);
  const meshCount = reader.uint32();
  const meshes = [];
  for (let index = 0; index < meshCount; index += 1) {
    const identifier = reader.uint32();
    if (identifier !== 0x4853454d) {
      throw new Error(`Invalid BGM mesh chunk at index ${index}`);
    }

    const modelCount = (() => {
      const mesh = {
        index,
        identifier: "MESH",
        name1: reader.string(),
        name2: reader.string(),
        flags: reader.uint32(),
        group: reader.uint32(),
        matrix: reader.floats(16),
      };
      const localModelCount = reader.uint32();
      mesh.modelIds = reader.uint32s(localModelCount);
      meshes.push(mesh);
      return localModelCount;
    })();

    void modelCount;
  }

  const objects = parseObjects(reader);
  return { models, meshes, objects };
}

function parseStandardModel(buffer, filePath) {
  const reader = new BufferReader(buffer);
  let version = reader.uint32();
  let containerMagic = null;
  let isBgmModel = false;

  if (version === 0x43524143 || version === 0x434d4742) {
    containerMagic = version === 0x43524143 ? "CARC" : "BGMC";
    version = reader.uint32();
    isBgmModel = true;
  }

  const isFoucModel = version === 0x20002;

  if (version === 0x62647370) {
    throw new Error(
      "Plant psdb file detected in standard model parser. Use plant parsing path instead.",
    );
  }

  const flags = { version, isFoucModel };

  let mapHeaderValues = [];
  if (version > 0x20000) {
    const count = reader.uint32();
    mapHeaderValues = [count];
    for (let index = 0; index < count - 1; index += 1) {
      mapHeaderValues.push(reader.uint32());
    }
  }

  const materials = parseMaterials(reader, version, { isFoucModel });

  if (version <= 0x10003) {
    throw new Error("Retro Demo / FO1 parsing is not implemented in the Node tool yet.");
  }

  const streams = parseStreams(reader);
  const surfaces = parseSurfaces(reader, flags);
  const body = isBgmModel || path.extname(filePath).toLowerCase() === ".bgm"
    ? parseBgmBody(reader)
    : parseTrackBody(reader, flags);

  return {
    kind: isBgmModel || path.extname(filePath).toLowerCase() === ".bgm" ? "bgm" : "w32",
    file: filePath,
    size: buffer.length,
    containerMagic,
    version,
    versionName: FILE_VERSIONS[version] ?? `Unknown 0x${version.toString(16)}`,
    isBgmModel: isBgmModel || path.extname(filePath).toLowerCase() === ".bgm",
    isFoucModel,
    mapHeaderValues,
    materials,
    streams,
    surfaces,
    body,
    remainingBytes: buffer.length - reader.offset,
  };
}

function parseFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const magic = buffer.length >= 4 ? buffer.readUInt32LE(0) : 0;

  if (magic === 0x62647370 && extension === ".gen") {
    return parsePlantVdb(buffer, filePath);
  }

  if (magic === 0x62647370 && extension === ".w32") {
    return parsePlantGeom(buffer, filePath);
  }

  if ([".w32", ".bgm", ".car", ".trk"].includes(extension)) {
    return parseStandardModel(buffer, filePath);
  }

  throw new Error(`Unsupported file type: ${extension}`);
}

module.exports = {
  BufferReader,
  FILE_VERSIONS,
  parseBgmBody,
  parseCompactMeshes,
  parseCollidableModels,
  parseFile,
  parseMaterials,
  parseMeshDamageAssociations,
  parseModels,
  parseObjects,
  parsePlantGeom,
  parsePlantVdb,
  parseStandardModel,
  parseStreams,
  parseSurfaces,
  parseTrackBody,
  shaderNameFor,
};

function main() {
  const args = process.argv.slice(2);
  let pretty = false;
  let outPath = null;
  let input = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--pretty") {
      pretty = true;
      continue;
    }
    if (arg === "--out") {
      outPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!input) {
      input = arg;
      continue;
    }
  }

  if (!input) {
    usage();
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), input);
  const parsed = parseFile(filePath);
  const json = JSON.stringify(parsed, null, pretty || outPath ? 2 : 0);

  if (outPath) {
    const resolvedOutPath = path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
    fs.writeFileSync(resolvedOutPath, `${json}\n`);
    console.error(`Wrote ${resolvedOutPath}`);
    return;
  }

  process.stdout.write(`${json}\n`);
}

if (require.main === module) {
  main();
}
