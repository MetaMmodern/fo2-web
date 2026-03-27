const fs = require("fs");
const path = require("path");

function usage() {
  console.error("Usage: node tools/inspect-bgm.js <file.bgm>");
}

function readCString(buffer, offset, maxLength = 256) {
  let end = offset;
  const limit = Math.min(buffer.length, offset + maxLength);

  while (end < limit && buffer[end] !== 0) {
    end += 1;
  }

  return buffer.toString("ascii", offset, end);
}

function findAll(buffer, marker) {
  const offsets = [];
  let index = 0;

  while (index < buffer.length) {
    const next = buffer.indexOf(marker, index);
    if (next === -1) {
      break;
    }

    offsets.push(next);
    index = next + marker.length;
  }

  return offsets;
}

function findTextureRefs(windowBuffer) {
  const matches = [];
  const regex = /([A-Za-z0-9_./-]+\.(?:tga|dds))/gi;
  const text = windowBuffer.toString("ascii");
  let match;

  while ((match = regex.exec(text))) {
    matches.push(match[1]);
  }

  return [...new Set(matches)];
}

function inspectMaterials(buffer) {
  return findAll(buffer, Buffer.from("MATC", "ascii")).map((offset) => {
    const name = readCString(buffer, offset + 4, 64);
    const window = buffer.subarray(offset, Math.min(buffer.length, offset + 0x140));
    const textures = findTextureRefs(window);
    const shaderId = buffer.readUInt32LE(Math.min(buffer.length - 4, offset + 0x18));

    return {
      offset,
      name,
      shaderId,
      textures,
    };
  });
}

function inspectMeshes(buffer) {
  return findAll(buffer, Buffer.from("MESH", "ascii")).map((offset) => ({
    offset,
    name: readCString(buffer, offset + 4, 64),
  }));
}

function inspectNamedObjects(buffer) {
  const results = [];
  const seen = new Set();
  const patterns = [
    /(?:placeholder_|wheelhub_|tire_|hood_|door_|trunk_|part_[A-Za-z0-9_]+)/g,
  ];

  for (const pattern of patterns) {
    const text = buffer.toString("ascii");
    let match;

    while ((match = pattern.exec(text))) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        results.push(match[0]);
      }
    }
  }

  return results.sort();
}

function main() {
  const input = process.argv[2];

  if (!input) {
    usage();
    process.exit(1);
  }

  const filePath = path.resolve(input);
  const buffer = fs.readFileSync(filePath);

  const result = {
    file: filePath,
    size: buffer.length,
    fileVersion: `0x${buffer.readUInt32LE(0).toString(16)}`,
    declaredMaterialCount: buffer.readUInt32LE(4),
    materials: inspectMaterials(buffer),
    meshes: inspectMeshes(buffer),
    namedObjects: inspectNamedObjects(buffer),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
