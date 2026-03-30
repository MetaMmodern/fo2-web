#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DB_IDENTIFIER = 0x1a424450;
const DB_VERSION = 512;
const NODE_SIZE = 20;

const DBVALUE = {
  CHAR: 1,
  STRING: 2,
  BOOL: 5,
  INT: 6,
  FLOAT: 7,
  RGBA: 8,
  VECTOR2: 9,
  VECTOR3: 10,
  VECTOR4: 11,
  NODE: 12,
};

const DBARRAY = {
  SINGLE: 0,
  FIXED: 1,
  VARIABLE: 2,
};

const VALUE_TYPE_NAMES = {
  [DBVALUE.CHAR]: "char",
  [DBVALUE.STRING]: "const char",
  [DBVALUE.BOOL]: "bool",
  [DBVALUE.INT]: "int",
  [DBVALUE.FLOAT]: "float",
  [DBVALUE.RGBA]: "rgba",
  [DBVALUE.VECTOR2]: "vec2",
  [DBVALUE.VECTOR3]: "vec3",
  [DBVALUE.VECTOR4]: "vec4",
  [DBVALUE.NODE]: "node*",
};

function getValueTypeSize(type) {
  switch (type) {
    case DBVALUE.CHAR:
    case DBVALUE.STRING:
      return 1;
    case DBVALUE.NODE:
      return 2;
    case DBVALUE.BOOL:
    case DBVALUE.RGBA:
    case DBVALUE.INT:
    case DBVALUE.FLOAT:
      return 4;
    case DBVALUE.VECTOR2:
      return 8;
    case DBVALUE.VECTOR3:
      return 12;
    case DBVALUE.VECTOR4:
      return 16;
    default:
      return 0;
  }
}

function usage() {
  console.error(
    "Usage:\n" +
      "  node tools/flatout2-db-tool.js extract <db-file> [out-dir]\n" +
      "  node tools/flatout2-db-tool.js inspect <db-file> <node-path>",
  );
}

function main() {
  const [, , command, inputArg, extraArg] = process.argv;
  if (!command || !inputArg) {
    usage();
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const db = parseDb(inputPath);

  if (command === "extract") {
    const outDir = extraArg
      ? path.resolve(process.cwd(), extraArg)
      : `${inputPath} extracted`;
    extractDb(db, outDir);
    console.log(`Extracted ${db.nodes.length} nodes to ${outDir}`);
    return;
  }

  if (command === "inspect") {
    if (!extraArg) {
      usage();
      process.exit(1);
    }
    inspectNode(db, extraArg);
    return;
  }

  usage();
  process.exit(1);
}

function parseDb(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 12) {
    throw new Error("File too small to be a FlatOut 2 DB");
  }

  const identifier = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const numNodes = buffer.readUInt32LE(8);

  if (identifier !== DB_IDENTIFIER || version !== DB_VERSION || numNodes === 0) {
    throw new Error("Invalid FlatOut 2 DB header");
  }

  const data = buffer.subarray(12);
  const nodes = [];

  for (let index = 0; index < numNodes; index += 1) {
    const offset = index * NODE_SIZE;
    nodes.push(parseNodeHeader(data, offset, index));
  }

  for (const node of nodes) {
    node.name = readCString(data, node.offset + node.nameRelOffset);
  }

  for (const node of nodes) {
    node.values = parseNodeValues(data, node, nodes);
  }

  for (const node of nodes) {
    node.fullPath = buildNodePath(node, nodes);
  }

  return {
    filePath,
    buffer,
    data,
    nodes,
  };
}

function parseNodeHeader(data, offset, index) {
  return {
    index,
    offset,
    vtable: data.readUInt32LE(offset),
    parentOffset: data.readInt16LE(offset + 4),
    lastChildOffset: data.readInt16LE(offset + 6),
    prevNodeOffset: data.readInt16LE(offset + 8),
    dataCount: data.readUInt16LE(offset + 10),
    nameRelOffset: data.readUInt32LE(offset + 12),
    valuesRelOffset: data.readUInt32LE(offset + 16),
    values: [],
  };
}

function parseNodeValues(data, node, nodes) {
  if (!node.valuesRelOffset) {
    return [];
  }

  const values = [];
  let cursor = node.offset + node.valuesRelOffset;

  for (let index = 0; index < node.dataCount; index += 1) {
    const value = parseValue(data, cursor, nodes);
    values.push(value);
    cursor += 12 + value.size;
  }

  return values;
}

function parseValue(data, offset, nodes) {
  const nameRelOffset = data.readUInt32LE(offset);
  const valueType = data.readUInt8(offset + 4);
  const size = data.readUInt16LE(offset + 5);
  const arrayType = data.readUInt8(offset + 7);
  const dataPtr = data.readUInt32LE(offset + 8);
  const name = nameRelOffset ? readCString(data, offset + nameRelOffset) : "";
  const payloadOffset = offset + 12;

  return {
    offset,
    name,
    valueType,
    size,
    arrayType,
    dataPtr,
    payloadOffset,
    values: readValuePayload(data, payloadOffset, size, valueType, arrayType, nodes),
  };
}

function readValuePayload(data, payloadOffset, size, valueType, arrayType, nodes) {
  const typeSize = getValueTypeSize(valueType);

  if (arrayType === DBARRAY.FIXED && valueType !== DBVALUE.STRING) {
    const count = typeSize === 0 ? 0 : Math.floor(size / typeSize);
    return Array.from({ length: count }, (_, index) =>
      readSingleValue(data, payloadOffset, valueType, index, nodes),
    );
  }

  return readSingleValue(data, payloadOffset, valueType, 0, nodes, size);
}

function readSingleValue(data, payloadOffset, valueType, index, nodes, sizeOverride) {
  switch (valueType) {
    case DBVALUE.CHAR:
      return data.readUInt8(payloadOffset + index);
    case DBVALUE.STRING:
      return readCString(data, payloadOffset, sizeOverride);
    case DBVALUE.BOOL:
      return data.readUInt32LE(payloadOffset + index * 4) !== 0;
    case DBVALUE.INT:
      return data.readInt32LE(payloadOffset + index * 4);
    case DBVALUE.FLOAT:
      return cleanFloat(data.readFloatLE(payloadOffset + index * 4));
    case DBVALUE.RGBA: {
      const base = payloadOffset + index * 4;
      return [
        data.readUInt8(base),
        data.readUInt8(base + 1),
        data.readUInt8(base + 2),
        data.readUInt8(base + 3),
      ];
    }
    case DBVALUE.VECTOR2: {
      const base = payloadOffset + index * 8;
      return [cleanFloat(data.readFloatLE(base)), cleanFloat(data.readFloatLE(base + 4))];
    }
    case DBVALUE.VECTOR3: {
      const base = payloadOffset + index * 12;
      return [
        cleanFloat(data.readFloatLE(base)),
        cleanFloat(data.readFloatLE(base + 4)),
        cleanFloat(data.readFloatLE(base + 8)),
      ];
    }
    case DBVALUE.VECTOR4: {
      const base = payloadOffset + index * 16;
      return [
        cleanFloat(data.readFloatLE(base)),
        cleanFloat(data.readFloatLE(base + 4)),
        cleanFloat(data.readFloatLE(base + 8)),
        cleanFloat(data.readFloatLE(base + 12)),
      ];
    }
    case DBVALUE.NODE: {
      const nodeId = data.readUInt16LE(payloadOffset + index * 2);
      return buildNodePath(nodes[nodeId], nodes);
    }
    default:
      return `*UNKNOWN:${valueType}*`;
  }
}

function cleanFloat(value) {
  return Math.abs(value) < 0.00001 ? 0 : value;
}

function readCString(data, offset, maxLength = null) {
  let end = offset;

  if (maxLength != null) {
    const limit = offset + maxLength;
    while (end < limit && data[end] !== 0) {
      end += 1;
    }
    return data.toString("utf8", offset, end);
  }

  while (end < data.length && data[end] !== 0) {
    end += 1;
  }
  return data.toString("utf8", offset, end);
}

function buildNodePath(node, nodes) {
  if (!node) {
    return "";
  }

  const parts = [node.name];
  let current = node;
  while (true) {
    const parent = getParent(current, nodes);
    if (!parent || parent === current) {
      break;
    }
    parts.push(parent.name);
    current = parent;
  }
  return parts.reverse().join("/");
}

function getParent(node, nodes) {
  const parentIndex = node.index + node.parentOffset;
  if (parentIndex < 0 || parentIndex >= nodes.length) {
    return node;
  }
  return nodes[parentIndex];
}

function nodeHasChildren(node, nodes) {
  return nodes.some((candidate) => getParent(candidate, nodes) === node && candidate !== node);
}

function extractDb(db, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  for (const node of db.nodes) {
    const nodePath = path.join(outDir, ...node.fullPath.split("/"));
    if (nodeHasChildren(node, db.nodes)) {
      fs.mkdirSync(nodePath, { recursive: true });
    }

    if (node.values.length > 0 || !nodeHasChildren(node, db.nodes)) {
      const filePath = `${nodePath}.h`;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, renderNode(node), "utf8");
    }
  }
}

function renderNode(node) {
  return node.values.map(renderValue).join("");
}

function renderValue(value) {
  const typeName = VALUE_TYPE_NAMES[value.valueType] ?? "unknown";
  const safeName = value.name.replace(/\[/g, "(").replace(/\]/g, ")");
  let header = typeName;

  if (value.valueType === DBVALUE.STRING && value.arrayType === DBARRAY.VARIABLE) {
    header += "*";
  }

  header += ` ${safeName}`;

  if (value.arrayType === DBARRAY.FIXED) {
    if (value.valueType === DBVALUE.STRING) {
      header += `[${value.size}]`;
    } else {
      header += "[]";
    }
  }

  header += " = ";

  if (value.arrayType === DBARRAY.FIXED && value.valueType !== DBVALUE.STRING) {
    const body = value.values
      .map((entry) => `\t${formatValue(entry, value.valueType)}`)
      .join(",\n");
    return `${header}{\n${body}\n};\n`;
  }

  return `${header}${formatValue(value.values, value.valueType)};\n`;
}

function formatValue(value, valueType) {
  switch (valueType) {
    case DBVALUE.STRING:
    case DBVALUE.NODE:
      return `"${value}"`;
    case DBVALUE.BOOL:
      return value ? "true" : "false";
    case DBVALUE.RGBA:
    case DBVALUE.VECTOR2:
    case DBVALUE.VECTOR3:
    case DBVALUE.VECTOR4:
      return `{ ${value.map(formatScalar).join(", ")} }`;
    default:
      return formatScalar(value);
  }
}

function formatScalar(value) {
  if (typeof value !== "number") {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

function inspectNode(db, nodePath) {
  const normalizedPath = nodePath.replace(/\\/g, "/");
  const node = db.nodes.find((entry) => entry.fullPath === normalizedPath);
  if (!node) {
    console.error(`Node not found: ${normalizedPath}`);
    process.exit(1);
  }

  const output = {
    path: node.fullPath,
    index: node.index,
    values: node.values.map((value) => ({
      name: value.name,
      type: VALUE_TYPE_NAMES[value.valueType] ?? value.valueType,
      arrayType: value.arrayType,
      size: value.size,
      value: value.values,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
