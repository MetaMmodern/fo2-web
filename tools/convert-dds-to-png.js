const fs = require("fs");
const path = require("path");

const parseDDS = require("parse-dds");
const decodeDXT = require("decode-dxt");
const { PNG } = require("pngjs");

function printUsage() {
  console.error(
    "Usage: node tools/convert-dds-to-png.js <input.dds> [output.png] [--keep-alpha] [--unpremultiply]",
  );
}

function main() {
  const args = process.argv.slice(2);
  const keepAlpha = args.includes("--keep-alpha");
  const unpremultiplyAlpha = args.includes("--unpremultiply");
  const positionalArgs = args.filter(
    (arg) => arg !== "--keep-alpha" && arg !== "--unpremultiply",
  );
  const [inputPathArg, outputPathArg] = positionalArgs;

  if (!inputPathArg) {
    printUsage();
    process.exit(1);
  }

  const inputPath = path.resolve(inputPathArg);
  const outputPath = path.resolve(
    outputPathArg ||
      inputPath.replace(/\.dds$/i, ".png"),
  );

  const sourceBuffer = fs.readFileSync(inputPath);
  const arrayBuffer = sourceBuffer.buffer.slice(
    sourceBuffer.byteOffset,
    sourceBuffer.byteOffset + sourceBuffer.byteLength,
  );

  const dds = parseDDS(arrayBuffer);

  if (!dds.images?.length) {
    throw new Error("DDS file did not contain any image data");
  }

  const topMip = dds.images[0];
  const [width, height] = topMip.shape;
  const byteOffset = sourceBuffer.byteOffset + topMip.offset;
  const dxtData = new DataView(
    sourceBuffer.buffer,
    byteOffset,
    topMip.length,
  );
  const rgbaData = decodeDXT(dxtData, width, height, dds.format);

  // Optional recovery path for DDS files that appear alpha-premultiplied.
  // Disabled by default because FlatOut car skins look closer to the game
  // without this correction.
  if (unpremultiplyAlpha) {
    for (let i = 0; i < rgbaData.length; i += 4) {
      const alpha = rgbaData[i + 3];

      if (alpha > 0 && alpha < 255) {
        rgbaData[i] = Math.min(255, Math.round((rgbaData[i] * 255) / alpha));
        rgbaData[i + 1] = Math.min(
          255,
          Math.round((rgbaData[i + 1] * 255) / alpha),
        );
        rgbaData[i + 2] = Math.min(
          255,
          Math.round((rgbaData[i + 2] * 255) / alpha),
        );
      }
    }
  }

  if (!keepAlpha) {
    for (let i = 3; i < rgbaData.length; i += 4) {
      rgbaData[i] = 255;
    }
  }

  const png = new PNG({ width, height });
  png.data = Buffer.from(rgbaData);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));

  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        format: dds.format,
        size: [width, height],
        mipmaps: dds.images.length,
        keepAlpha,
        unpremultiplyAlpha,
      },
      null,
      2,
    ),
  );
}

main();
