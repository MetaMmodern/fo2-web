#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "../src/data/database/flatout2.db",
);
const DEFAULT_OUTPUT_DIR = path.resolve(
  __dirname,
  "../src/data/database/extracted",
);

function main() {
  const inputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_INPUT;
  const outputDir = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : DEFAULT_OUTPUT_DIR;

  const buffer = fs.readFileSync(inputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const strings = extractStrings(buffer);
  const clusters = clusterStrings(strings);
  const environmentBindings = inferEnvironmentBindings(clusters);
  const sceneCandidates = inferSceneCandidates(environmentBindings);

  writeCsv(
    path.join(outputDir, "flatout2_strings.csv"),
    ["offset", "length", "text"],
    strings.map((entry) => [
      entry.offset,
      entry.length,
      csvSafe(entry.text),
    ]),
  );

  fs.writeFileSync(
    path.join(outputDir, "flatout2_clusters.json"),
    JSON.stringify(clusters, null, 2),
  );

  writeCsv(
    path.join(outputDir, "flatout2_environment_bindings.csv"),
    [
      "cluster_index",
      "start_offset",
      "end_offset",
      "environment",
      "atmosphere_ini",
      "background_texture",
      "add_filter",
      "sub_filter",
      "all_strings",
    ],
    environmentBindings.map((entry) => [
      entry.clusterIndex,
      entry.startOffset,
      entry.endOffset,
      entry.environment ?? "",
      entry.atmosphereIni ?? "",
      entry.backgroundTexture ?? "",
      entry.addFilter ?? "",
      entry.subFilter ?? "",
      csvSafe(entry.allStrings.join(" | ")),
    ]),
  );

  writeCsv(
    path.join(outputDir, "flatout2_scene_candidates.csv"),
    [
      "environment",
      "cluster_indices",
      "start_offset",
      "end_offset",
      "atmosphere_ini",
      "background_texture",
      "add_filter",
      "sub_filter",
      "clusters_summary",
    ],
    sceneCandidates.map((entry) => [
      entry.environment ?? "",
      entry.clusterIndices.join("|"),
      entry.startOffset,
      entry.endOffset,
      entry.atmosphereIni ?? "",
      entry.backgroundTexture ?? "",
      entry.addFilter ?? "",
      entry.subFilter ?? "",
      csvSafe(entry.clusterSummaries.join(" || ")),
    ]),
  );

  const summary = {
    inputPath,
    outputDir,
    fileSize: buffer.length,
    strings: strings.length,
    clusters: clusters.length,
    environmentBindings: environmentBindings.length,
    sceneCandidates: sceneCandidates.length,
  };

  fs.writeFileSync(
    path.join(outputDir, "flatout2_summary.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log(JSON.stringify(summary, null, 2));
}

function extractStrings(buffer, minLength = 4) {
  const strings = [];
  let start = -1;

  for (let index = 0; index <= buffer.length; index += 1) {
    const byte = index < buffer.length ? buffer[index] : 0;
    const isPrintable = byte >= 32 && byte <= 126;

    if (isPrintable) {
      if (start === -1) {
        start = index;
      }
      continue;
    }

    if (start !== -1) {
      const end = index;
      const length = end - start;

      if (length >= minLength) {
        strings.push({
          offset: start,
          length,
          text: buffer.toString("latin1", start, end),
        });
      }

      start = -1;
    }
  }

  return strings;
}

function clusterStrings(strings, maxGap = 160) {
  const clusters = [];
  let current = null;

  for (const entry of strings) {
    const entryEnd = entry.offset + entry.length;

    if (!current) {
      current = createCluster(entry);
      continue;
    }

    if (entry.offset - current.endOffset <= maxGap) {
      current.entries.push(entry);
      current.endOffset = entryEnd;
      continue;
    }

    clusters.push(finalizeCluster(current, clusters.length));
    current = createCluster(entry);
  }

  if (current) {
    clusters.push(finalizeCluster(current, clusters.length));
  }

  return clusters;
}

function createCluster(entry) {
  return {
    startOffset: entry.offset,
    endOffset: entry.offset + entry.length,
    entries: [entry],
  };
}

function finalizeCluster(cluster, index) {
  return {
    index,
    startOffset: cluster.startOffset,
    endOffset: cluster.endOffset,
    size: cluster.endOffset - cluster.startOffset,
    entries: cluster.entries,
    texts: cluster.entries.map((entry) => entry.text),
  };
}

function inferEnvironmentBindings(clusters) {
  return clusters
    .map((cluster) => {
      const texts = cluster.texts;
      const environment = texts.find(isEnvironmentKey) ?? null;
      const atmosphereIni = texts.find((text) => /\.ini$/i.test(text)) ?? null;
      const backgroundTexture =
        texts.find((text) => /_background.*\.tga$/i.test(text)) ?? null;
      const addFilter = texts.find((text) => /_add$/i.test(text)) ?? null;
      const subFilter = texts.find((text) => /_sub$/i.test(text)) ?? null;

      if (!environment && !addFilter && !subFilter && !backgroundTexture) {
        return null;
      }

      return {
        clusterIndex: cluster.index,
        startOffset: cluster.startOffset,
        endOffset: cluster.endOffset,
        environment,
        atmosphereIni,
        backgroundTexture,
        addFilter,
        subFilter,
        allStrings: texts,
      };
    })
    .filter(Boolean);
}

function inferSceneCandidates(bindings, maxGap = 900) {
  const candidates = [];

  for (let index = 0; index < bindings.length; index += 1) {
    const seed = bindings[index];
    if (!seed.environment) {
      continue;
    }

    const candidate = {
      environment: seed.environment,
      clusterIndices: [seed.clusterIndex],
      startOffset: seed.startOffset,
      endOffset: seed.endOffset,
      atmosphereIni: seed.atmosphereIni ?? null,
      backgroundTexture: seed.backgroundTexture ?? null,
      addFilter: seed.addFilter ?? null,
      subFilter: seed.subFilter ?? null,
      clusterSummaries: [seed.allStrings.join(" | ")],
    };

    for (let nextIndex = index + 1; nextIndex < bindings.length; nextIndex += 1) {
      const next = bindings[nextIndex];
      if (next.startOffset - candidate.endOffset > maxGap) {
        break;
      }

      candidate.clusterIndices.push(next.clusterIndex);
      candidate.endOffset = next.endOffset;
      candidate.atmosphereIni ||= next.atmosphereIni;
      candidate.backgroundTexture ||= next.backgroundTexture;
      candidate.addFilter ||= next.addFilter;
      candidate.subFilter ||= next.subFilter;
      candidate.clusterSummaries.push(next.allStrings.join(" | "));

      if (candidate.addFilter && candidate.subFilter) {
        break;
      }
    }

    candidates.push(candidate);
  }

  return dedupeSceneCandidates(candidates);
}

function dedupeSceneCandidates(candidates) {
  const seen = new Set();

  return candidates.filter((candidate) => {
    const key = [
      candidate.environment,
      candidate.atmosphereIni,
      candidate.backgroundTexture,
      candidate.addFilter,
      candidate.subFilter,
      candidate.clusterIndices.join("|"),
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isEnvironmentKey(text) {
  return /^(arena|canal|city|desert|fields|forest|racing|stunt|menu)[a-z_]*$/i.test(
    text,
  );
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      row
        .map((value) => {
          const text = String(value ?? "");
          if (/[",\n]/.test(text)) {
            return `"${text.replace(/"/g, "\"\"")}"`;
          }
          return text;
        })
        .join(","),
    );
  }

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function csvSafe(text) {
  return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

main();
