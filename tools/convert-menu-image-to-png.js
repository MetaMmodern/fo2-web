const fs = require("fs");
const path = require("path");

const decodeDXT = require("decode-dxt");
const parseDDS = require("parse-dds");
const { PNG } = require("pngjs");

function usage() {
  console.error("Usage: node tools/convert-menu-image-to-png.js <input.dds|input.tga> [output.png]");
}

function decodeDds(inputPath) {
  const sourceBuffer = fs.readFileSync(inputPath);
  const arrayBuffer = sourceBuffer.buffer.slice(
    sourceBuffer.byteOffset,
    sourceBuffer.byteOffset + sourceBuffer.byteLength,
  );
  const dds = parseDDS(arrayBuffer);
  const topMip = dds.images?.[0];

  if (!topMip) {
    throw new Error(`DDS file has no image data: ${inputPath}`);
  }

  const [width, height] = topMip.shape;
  const dxtData = new DataView(
    sourceBuffer.buffer,
    sourceBuffer.byteOffset + topMip.offset,
    topMip.length,
  );

  return {
    width,
    height,
    data: Buffer.from(decodeDXT(dxtData, width, height, dds.format)),
  };
}

function decodeTga(inputPath) {
  const buffer = fs.readFileSync(inputPath);

  if (buffer.length < 18) {
    throw new Error(`TGA file is too small: ${inputPath}`);
  }

  const idLength = buffer[0];
  const colorMapType = buffer[1];
  const imageType = buffer[2];
  const width = buffer.readUInt16LE(12);
  const height = buffer.readUInt16LE(14);
  const bitsPerPixel = buffer[16];
  const descriptor = buffer[17];
  const bytesPerPixel = bitsPerPixel / 8;

  if (colorMapType !== 0 || imageType !== 2 || ![3, 4].includes(bytesPerPixel)) {
    throw new Error(
      `Unsupported TGA ${inputPath}: colorMap=${colorMapType}, type=${imageType}, bpp=${bitsPerPixel}`,
    );
  }

  const sourceOffset = 18 + idLength;
  const expectedLength = sourceOffset + width * height * bytesPerPixel;
  if (buffer.length < expectedLength) {
    throw new Error(`TGA pixel data is truncated: ${inputPath}`);
  }

  const data = Buffer.alloc(width * height * 4);
  const originTop = (descriptor & 0x20) !== 0;
  const originRight = (descriptor & 0x10) !== 0;

  for (let y = 0; y < height; y += 1) {
    const sourceY = originTop ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const sourceX = originRight ? width - 1 - x : x;
      const sourceIndex = sourceOffset + (sourceY * width + sourceX) * bytesPerPixel;
      const targetIndex = (y * width + x) * 4;
      data[targetIndex] = buffer[sourceIndex + 2];
      data[targetIndex + 1] = buffer[sourceIndex + 1];
      data[targetIndex + 2] = buffer[sourceIndex];
      data[targetIndex + 3] = bytesPerPixel === 4 ? buffer[sourceIndex + 3] : 255;
    }
  }

  return { width, height, data };
}

function convert(inputPathArg, outputPathArg) {
  const inputPath = path.resolve(inputPathArg);
  const extension = path.extname(inputPath).toLowerCase();
  const outputPath = path.resolve(
    outputPathArg ?? inputPath.replace(/\.(dds|tga)$/i, ".png"),
  );

  const decoded = extension === ".dds"
    ? decodeDds(inputPath)
    : extension === ".tga"
      ? decodeTga(inputPath)
      : null;

  if (!decoded) {
    throw new Error(`Unsupported input extension: ${extension}`);
  }

  const png = new PNG({ width: decoded.width, height: decoded.height });
  png.data = decoded.data;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));

  return outputPath;
}

function main() {
  const [inputPathArg, outputPathArg] = process.argv.slice(2);
  if (!inputPathArg) {
    usage();
    process.exit(1);
  }

  const outputPath = convert(inputPathArg, outputPathArg);
  console.error(`Wrote ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  convert,
  decodeDds,
  decodeTga,
};
