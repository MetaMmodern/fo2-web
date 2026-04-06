const TOGGLE_MAP = {
  TOGGLE_OFF: "off",
  TOGGLE_BRAKE: "brake",
  TOGGLE_REVERSE: "reverse",
};

export async function loadVehicleLightsConfig(url) {
  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load lights config: ${response.status} ${response.statusText}`);
  }

  return parseVehicleLightsConfig(await response.text());
}

export function parseVehicleLightsConfig(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    return null;
  }

  const lightsBlock = extractNamedBlock(text, "Lights");

  if (!lightsBlock) {
    return null;
  }

  const lights = extractIndexedBlocks(lightsBlock).map((body) => {
    const materialName = matchQuotedValue(body, "Material");
    const positionName = matchQuotedValue(body, "Position");
    const flaresBlock = extractNamedBlock(body, "Flares");
    const flareEntries = flaresBlock
      ? extractIndexedBlocks(flaresBlock).map(parseFlareEntry).filter(Boolean)
      : [];
    const toggleValues = flareEntries
      .map((flare) => flare.toggle)
      .filter(Boolean);
    const toggle = toggleValues[0] ?? null;

    return {
      materialName,
      positionName,
      toggle,
      flareEntries,
    };
  }).filter((light) => light.materialName);

  const materials = new Map();

  lights.forEach((light) => {
    const existing = materials.get(light.materialName) ?? {
      materialName: light.materialName,
      toggles: new Set(),
      flareEntries: [],
      positionNames: new Set(),
    };

    if (light.toggle) {
      existing.toggles.add(light.toggle);
    }
    if (light.positionName) {
      existing.positionNames.add(light.positionName);
    }
    existing.flareEntries.push(...light.flareEntries);
    materials.set(light.materialName, existing);
  });

  return {
    lights,
    materials: new Map(
      Array.from(materials.entries(), ([materialName, value]) => [
        materialName,
        {
          materialName,
          toggles: Array.from(value.toggles),
          flareEntries: value.flareEntries,
          positionNames: Array.from(value.positionNames),
        },
      ]),
    ),
  };
}

function parseFlareEntry(body) {
  const toggleToken = matchTokenValue(body, "Toggle");

  return {
    orientationName: matchQuotedValue(body, "Orientation"),
    toggle: TOGGLE_MAP[toggleToken] ?? null,
    minAlpha: matchNumberValue(body, "MinAlpha"),
    maxAlpha: matchNumberValue(body, "MaxAlpha"),
  };
}

function matchQuotedValue(text, key) {
  return text.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
}

function matchTokenValue(text, key) {
  return text.match(new RegExp(`${key}\\s*=\\s*([A-Z0-9_]+)`))?.[1] ?? null;
}

function matchNumberValue(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*(-?\\d*\\.?\\d+)`));
  return match ? Number.parseFloat(match[1]) : null;
}

function extractNamedBlock(text, key) {
  const tokenIndex = text.indexOf(`${key} =`);

  if (tokenIndex < 0) {
    return null;
  }

  const openIndex = text.indexOf("{", tokenIndex);

  if (openIndex < 0) {
    return null;
  }

  return extractBraceBody(text, openIndex);
}

function extractIndexedBlocks(text) {
  const blocks = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const markerIndex = text.indexOf("[", searchIndex);

    if (markerIndex < 0) {
      break;
    }

    const assignIndex = text.indexOf("=", markerIndex);
    const openIndex = text.indexOf("{", assignIndex);

    if (assignIndex < 0 || openIndex < 0) {
      break;
    }

    blocks.push(extractBraceBody(text, openIndex));
    searchIndex = openIndex + blocks[blocks.length - 1].length + 2;
  }

  return blocks;
}

function extractBraceBody(text, openIndex) {
  let depth = 0;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(openIndex + 1, index);
      }
    }
  }

  return "";
}
