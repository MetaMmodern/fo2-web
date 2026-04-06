const textCache = new Map();

export async function loadDrivingConfig({ assetUrls }) {
  const dbUrls = assetUrls.drivingDb;

  if (!dbUrls) {
    return createFallbackDrivingConfig();
  }

  const [
    bodyIniText,
    localTireIniText,
    steeringText,
    tarmacText,
    gravelText,
    sandText,
    hazardText,
    forestText,
    stuntTarmacText,
    snowText,
    iceText,
    objectText,
    carText,
    bodyText,
    engineText,
    gearboxText,
    suspensionText,
    tiresText,
    differentialFrontText,
    differentialRearText,
    differentialDefaultFrontText,
    differentialDefaultRearText,
    throttleFrontText,
    throttleRearText,
    throttleDefaultText,
    brakeFrontText,
    brakeRearText,
    brakeDefaultText,
    speedFrontText,
    speedRearText,
    speedDefaultText,
  ] = await Promise.all([
    readText(assetUrls.bodyConfig),
    readText(assetUrls.tireConfig),
    readText(dbUrls.steeringPc),
    readText(dbUrls.tireDynamics.tarmac),
    readText(dbUrls.tireDynamics.gravel),
    readText(dbUrls.tireDynamics.sand),
    readText(dbUrls.tireDynamics.hazard),
    readText(dbUrls.tireDynamics.forest),
    readText(dbUrls.tireDynamics.stuntTarmac),
    readText(dbUrls.tireDynamics.snow),
    readText(dbUrls.tireDynamics.ice),
    readText(dbUrls.tireDynamics.object),
    readText(dbUrls.car),
    readText(dbUrls.body),
    readText(dbUrls.engine),
    readText(dbUrls.gearbox),
    readText(dbUrls.suspension),
    readText(dbUrls.tires),
    readText(dbUrls.differentials.front),
    readText(dbUrls.differentials.rear),
    readText(dbUrls.differentials.defaultFront),
    readText(dbUrls.differentials.defaultRear),
    readText(dbUrls.throttleCurves.front),
    readText(dbUrls.throttleCurves.rear),
    readText(dbUrls.throttleCurves.default),
    readText(dbUrls.brakeCurves.front),
    readText(dbUrls.brakeCurves.rear),
    readText(dbUrls.brakeCurves.default),
    readText(dbUrls.speedCurves.front),
    readText(dbUrls.speedCurves.rear),
    readText(dbUrls.speedCurves.default),
  ]);

  const car = parseHeaderObject(carText);
  const body = parseHeaderObject(bodyText);
  const engine = parseHeaderObject(engineText);
  const gearbox = parseHeaderObject(gearboxText);
  const suspension = parseHeaderObject(suspensionText);
  const tires = parseHeaderObject(tiresText);
  const differentials = {
    front: enrichDifferential(
      parseHeaderObject(differentialFrontText),
      parseHeaderObject(throttleFrontText),
      parseHeaderObject(brakeFrontText),
      parseHeaderObject(speedFrontText),
    ),
    rear: enrichDifferential(
      parseHeaderObject(differentialRearText),
      parseHeaderObject(throttleRearText),
      parseHeaderObject(brakeRearText),
      parseHeaderObject(speedRearText),
    ),
    defaultFront: enrichDifferential(
      parseHeaderObject(differentialDefaultFrontText),
      parseHeaderObject(throttleDefaultText),
      parseHeaderObject(brakeDefaultText),
      parseHeaderObject(speedDefaultText),
    ),
    defaultRear: enrichDifferential(
      parseHeaderObject(differentialDefaultRearText),
      parseHeaderObject(throttleDefaultText),
      parseHeaderObject(brakeDefaultText),
      parseHeaderObject(speedDefaultText),
    ),
  };

  return {
    car,
    body,
    bodyCollision: parseBodyIni(bodyIniText),
    engine,
    gearbox,
    suspension,
    tires,
    localTireDynamics: parseTireIni(localTireIniText),
    steering: parseHeaderObject(steeringText),
    surfaceDynamics: {
      tarmac: parseHeaderObject(tarmacText),
      gravel: parseHeaderObject(gravelText),
      sand: parseHeaderObject(sandText),
      hazard: parseHeaderObject(hazardText),
      forest: parseHeaderObject(forestText),
      stuntTarmac: parseHeaderObject(stuntTarmacText),
      snow: parseHeaderObject(snowText),
      ice: parseHeaderObject(iceText),
      object: parseHeaderObject(objectText),
    },
    differentials,
  };
}

async function readText(url) {
  if (!url) {
    return "";
  }

  if (!textCache.has(url)) {
    textCache.set(
      url,
      fetch(url).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load driving config: ${response.status} ${url}`);
        }
        return response.text();
      }),
    );
  }

  return textCache.get(url);
}

function enrichDifferential(diff, throttle, brake, speed) {
  return {
    ...diff,
    throttleCurve: throttle.Value ?? [],
    brakeCurve: brake.Value ?? [],
    speedCurve: speed.Value ?? [],
  };
}

function parseBodyIni(text) {
  return {
    collisionFullMin: parseIniVector(text, "CollisionFullMin"),
    collisionFullMax: parseIniVector(text, "CollisionFullMax"),
    collisionBottomMin: parseIniVector(text, "CollisionBottomMin"),
    collisionBottomMax: parseIniVector(text, "CollisionBottomMax"),
    collisionTopMin: parseIniVector(text, "CollisionTopMin"),
    collisionTopMax: parseIniVector(text, "CollisionTopMax"),
  };
}

function parseTireIni(text) {
  return {
    RollingResistance: parseIniNumber(text, "RollingResistance", 0.5),
    InducedDragCoeff: parseIniNumber(text, "InducedDragCoeff", 1),
    PneumaticTrail: parseIniNumber(text, "PneumaticTrail", 0.04),
    PneumaticOffset: parseIniNumber(text, "PneumaticOffset", 0.5),
    ZStiffness: parseIniArray(text, "ZStiffness", [1, 1, 1]),
    XStiffness: parseIniArray(text, "XStiffness", [1, 1, 1]),
    CStiffness: parseIniArray(text, "CStiffness", [50, 6.4]),
    ZFriction: parseIniArray(text, "ZFriction", [1, 0]),
    XFriction: parseIniArray(text, "XFriction", [1, 0]),
  };
}

function parseIniVector(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`, "m"));

  if (!match) {
    return null;
  }

  return match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseIniArray(text, key, fallback) {
  return parseIniVector(text, key) ?? fallback;
}

function parseIniNumber(text, key, fallback = 0) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*([-+]?\\d*\\.?\\d+)`, "m"));
  return match ? Number.parseFloat(match[1]) : fallback;
}

function parseHeaderObject(text) {
  const object = {};
  const regex =
    /([A-Za-z0-9_* ]+?)\s+([A-Za-z0-9_]+)(\[\])?\s*=\s*([\s\S]*?);/g;
  let match = regex.exec(text);

  while (match) {
    const [, rawType, name, isArray, rawValue] = match;
    object[name] = parseHeaderValue(rawType.trim(), rawValue.trim(), Boolean(isArray));
    match = regex.exec(text);
  }

  return object;
}

function parseHeaderValue(type, rawValue, isArray) {
  if (type === "bool") {
    return rawValue === "true";
  }

  if (type === "int") {
    return Number.parseInt(rawValue, 10);
  }

  if (type === "float") {
    if (isArray) {
      return parseHeaderList(rawValue);
    }
    return Number.parseFloat(rawValue);
  }

  if (type === "vec2" || type === "vec3" || type === "vec4") {
    return parseHeaderList(rawValue);
  }

  if (type === "node*" || type === "const char*" || type === "char*") {
    return rawValue.replace(/^"/, "").replace(/"$/, "");
  }

  return rawValue;
}

function parseHeaderList(rawValue) {
  return rawValue
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function createFallbackDrivingConfig() {
  return {
    car: {},
    body: {},
    bodyCollision: {},
    engine: {},
    gearbox: {},
    suspension: {},
    tires: {},
    localTireDynamics: {},
    steering: {},
    surfaceDynamics: {},
    differentials: {},
  };
}
