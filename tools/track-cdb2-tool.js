const fs = require("fs");
const path = require("path");

function parseTrackCdb2(filePath) {
  const resolvedPath = path.resolve(filePath);
  const buffer = fs.readFileSync(resolvedPath);
  const header = parseCdb2Header(buffer);
  const vertexSection = parseLikelyVertexSection(buffer, header);
  const triangleSection = inspectTriangleSection(buffer, header, vertexSection);

  return {
    kind: "track_cdb2",
    file: resolvedPath,
    size: buffer.length,
    header,
    triangleSection,
    vertexSection,
  };
}

function parseCdb2Header(buffer) {
  return {
    identifier: buffer.readUInt32LE(0),
    secondaryIdentifier: buffer.readUInt32LE(4),
    boundingBoxMinRaw: [
      buffer.readInt32LE(8),
      buffer.readInt32LE(12),
      buffer.readInt32LE(16),
    ],
    boundingBoxMaxRaw: [
      buffer.readInt32LE(20),
      buffer.readInt32LE(24),
      buffer.readInt32LE(28),
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
  };
}

function parseLikelyVertexSection(buffer, header) {
  const byteLength = Math.max(buffer.length - header.vertOffset, 0);
  const recordSize = 6;
  const vertexCount = Math.floor(byteLength / recordSize);
  const tailByteLength = byteLength % recordSize;
  const decodedMin = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const decodedMax = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const rawMin = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  const rawMax = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const firstVertices = [];
  const sentinelCounts = { any: 0, x: 0, y: 0, z: 0 };

  for (let index = 0; index < vertexCount; index += 1) {
    const offset = header.vertOffset + index * recordSize;
    const raw = [
      buffer.readInt16LE(offset),
      buffer.readInt16LE(offset + 2),
      buffer.readInt16LE(offset + 4),
    ];

    if (raw[0] === -32768 || raw[1] === -32768 || raw[2] === -32768) {
      sentinelCounts.any += 1;
      if (raw[0] === -32768) sentinelCounts.x += 1;
      if (raw[1] === -32768) sentinelCounts.y += 1;
      if (raw[2] === -32768) sentinelCounts.z += 1;
    }

    const decoded = raw.map(
      (value, axis) => value * header.coordMultipliers[axis],
    );

    for (let axis = 0; axis < 3; axis += 1) {
      rawMin[axis] = Math.min(rawMin[axis], raw[axis]);
      rawMax[axis] = Math.max(rawMax[axis], raw[axis]);
      decodedMin[axis] = Math.min(decodedMin[axis], decoded[axis]);
      decodedMax[axis] = Math.max(decodedMax[axis], decoded[axis]);
    }

    if (index < 8) {
      firstVertices.push({ index, raw, decoded });
    }
  }

  return {
    byteLength,
    likelyRecordSize: recordSize,
    likelyVertexCount: vertexCount,
    tailByteLength,
    tailBytes:
      tailByteLength > 0
        ? Array.from(buffer.slice(buffer.length - tailByteLength))
        : [],
    rawMin,
    rawMax,
    decodedMin,
    decodedMax,
    sentinelCounts,
    firstVertices,
  };
}

function inspectTriangleSection(buffer, header, vertexSection) {
  const byteLength = Math.max(header.vertOffset - header.triOffset, 0);
  const vertexCount = vertexSection.likelyVertexCount;
  const firstU16 = [];
  const firstU32 = [];
  const indexLikeRuns = [];
  const controlTopNibbleHistogram = new Map();
  const commonControlWords = new Map();
  let inRun = false;
  let runStart = header.triOffset;

  for (let index = 0; index < Math.min(24, Math.floor(byteLength / 2)); index += 1) {
    firstU16.push(buffer.readUInt16LE(header.triOffset + index * 2));
  }

  for (let index = 0; index < Math.min(12, Math.floor(byteLength / 4)); index += 1) {
    firstU32.push(buffer.readUInt32LE(header.triOffset + index * 4));
  }

  for (let offset = header.triOffset; offset < header.vertOffset; offset += 2) {
    const value = buffer.readUInt16LE(offset);
    const isIndexLike = value < vertexCount;

    if (!isIndexLike) {
      const topNibble = value >>> 12;
      controlTopNibbleHistogram.set(
        topNibble,
        (controlTopNibbleHistogram.get(topNibble) ?? 0) + 1,
      );
      commonControlWords.set(value, (commonControlWords.get(value) ?? 0) + 1);
    }

    if (isIndexLike && !inRun) {
      inRun = true;
      runStart = offset;
    }

    if (!isIndexLike && inRun) {
      indexLikeRuns.push(buildRunSummary(buffer, runStart, offset, header));
      inRun = false;
    }
  }

  if (inRun) {
    indexLikeRuns.push(buildRunSummary(buffer, runStart, header.vertOffset, header));
  }

  indexLikeRuns.sort((left, right) => right.byteLength - left.byteLength);

  return {
    byteLength,
    firstU16,
    firstU32,
    controlTopNibbleHistogram: histogramEntries(controlTopNibbleHistogram, (value) => `0x${value.toString(16)}`),
    commonControlWords: histogramEntries(commonControlWords, (value) => `0x${value.toString(16)}`),
    longestIndexLikeRuns: indexLikeRuns.slice(0, 16),
  };
}

function buildRunSummary(buffer, start, end, header) {
  const firstValues = [];

  for (let offset = start; offset < Math.min(end, start + 24); offset += 2) {
    firstValues.push(buffer.readUInt16LE(offset));
  }

  return {
    start,
    end,
    delta: start - header.triOffset,
    byteLength: end - start,
    u16Length: (end - start) / 2,
    remainderModulo6: (end - start) % 6,
    firstValues,
  };
}

function histogramEntries(map, formatKey) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 16)
    .map(([value, count]) => ({
      value,
      key: formatKey(value),
      count,
    }));
}

function usage() {
  process.stderr.write(
    "Usage: node tools/track-cdb2-tool.js <path/to/track_cdb2.gen> [--pretty] [--out <file>]\n",
  );
}

function main() {
  const args = process.argv.slice(2);
  let input = null;
  let pretty = false;
  let outPath = null;

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
    }
  }

  if (!input) {
    usage();
    process.exit(1);
  }

  const parsed = parseTrackCdb2(input);
  const json = JSON.stringify(parsed, null, pretty || outPath ? 2 : 0);

  if (outPath) {
    const resolvedOutPath = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
    fs.writeFileSync(resolvedOutPath, `${json}\n`);
    process.stderr.write(`Wrote ${resolvedOutPath}\n`);
    return;
  }

  process.stdout.write(`${json}\n`);
}

module.exports = {
  inspectTriangleSection,
  parseCdb2Header,
  parseLikelyVertexSection,
  parseTrackCdb2,
};

if (require.main === module) {
  main();
}
