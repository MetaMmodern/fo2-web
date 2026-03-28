import * as THREE from "three";

const DEBUG_HORIZON = false;
const ENVIRONMENT_SCALE = 0.02;
const DEFAULT_ENVIRONMENT_VALUES = {
  skyPlaneSize: 3300,
  skyPlaneAltitude: 188,
  horizonRadius: 599,
  horizonBase: -40,
  horizonHeight: 217,
};

export async function loadArenaEnvironment(scene, assetUrls) {
  const atmosphere = await loadAtmosphere(
    assetUrls.atmosphere,
    assetUrls.atmospherePreset,
  );
  const textureLoader = new THREE.TextureLoader();
  const sunDirection = atmosphere.sunDirection.clone().normalize();
  const sunPosition = sunDirection.clone().multiplyScalar(1000);
  scene.background = null;
  scene.environment = null;

  const skyTopTexture = textureLoader.load(assetUrls.skyTopTexture);
  configureSkyPlaneTexture(skyTopTexture);

  const horizonTexture = textureLoader.load(assetUrls.horizonTexture);
  configureHorizonTexture(horizonTexture);

  const environmentValues = {
    skyPlaneSize: DEFAULT_ENVIRONMENT_VALUES.skyPlaneSize,
    skyPlaneAltitude: DEFAULT_ENVIRONMENT_VALUES.skyPlaneAltitude,
    horizonRadius: DEFAULT_ENVIRONMENT_VALUES.horizonRadius,
    horizonBase: DEFAULT_ENVIRONMENT_VALUES.horizonBase,
    horizonHeight: DEFAULT_ENVIRONMENT_VALUES.horizonHeight,
  };

  const skyPlane = createSkyPlane({
    size: environmentValues.skyPlaneSize,
    altitude: environmentValues.skyPlaneAltitude,
    texture: skyTopTexture,
  });
  scene.add(skyPlane);

  const horizonLayer = createHorizonLayer({
    radius: environmentValues.horizonRadius,
    base: environmentValues.horizonBase,
    height: environmentValues.horizonHeight,
    texture: horizonTexture,
  });
  scene.add(horizonLayer);

  const skyLightColor = pickGradientColor(atmosphere.skyGradient, 0.78, new THREE.Color(0xb9d8ff));
  const horizonLightColor = pickGradientColor(atmosphere.skyGradient, 0.52, new THREE.Color(0x8ab6e8));
  const groundLightColor = horizonLightColor.clone().lerp(new THREE.Color(0x8d6640), 0.72);
  const ambientLightColor = skyLightColor.clone().lerp(horizonLightColor, 0.45);

  const ambientLight = new THREE.AmbientLight(
    ambientLightColor,
    0.55 * atmosphere.skyAmbient + 0.35 * atmosphere.cloudAmbient,
  );
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    skyLightColor,
    groundLightColor,
    1.15 * atmosphere.skyAmbient + 0.55 * atmosphere.cloudAmbient,
  );
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(
    0xfff2cf,
    atmosphere.sunIntensity * 1.4,
  );
  sunLight.position.copy(sunPosition);
  sunLight.castShadow = true;
  scene.add(sunLight);

  const glowTexture = textureLoader.load(assetUrls.glowTexture);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.flipY = true;
  glowTexture.wrapS = THREE.ClampToEdgeWrapping;
  glowTexture.wrapT = THREE.ClampToEdgeWrapping;

  const flareTexture = textureLoader.load(assetUrls.flareTexture);
  flareTexture.colorSpace = THREE.SRGBColorSpace;
  flareTexture.flipY = true;
  flareTexture.wrapS = THREE.ClampToEdgeWrapping;
  flareTexture.wrapT = THREE.ClampToEdgeWrapping;

  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: 0xfff3c6,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  glowSprite.position.copy(sunPosition);
  glowSprite.scale.set(170, 170, 1);
  glowSprite.frustumCulled = false;
  scene.add(glowSprite);

  const flareSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flareTexture,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  flareSprite.position.copy(sunPosition);
  flareSprite.scale.set(240, 240, 1);
  flareSprite.frustumCulled = false;
  scene.add(flareSprite);

  const environmentController = createEnvironmentController({
    scene,
    values: environmentValues,
    skyPlane,
    horizonLayer,
    skyTopTexture,
    horizonTexture,
    atmosphere,
    ambientLight,
    hemisphereLight,
    sunLight,
    sunDirection,
    sunPosition,
    glowTexture,
    flareTexture,
    glowSprite,
    flareSprite,
  });

  scene.userData.arenaEnvironment = environmentController;
  return environmentController;
}

function createEnvironmentController(state) {
  function rebuildHorizon() {
    const nextLayer = createHorizonLayer({
      radius: state.values.horizonRadius,
      base: state.values.horizonBase,
      height: state.values.horizonHeight,
      texture: state.horizonTexture,
    });
    state.scene.remove(state.horizonLayer);
    disposeHierarchy(state.horizonLayer);
    state.horizonLayer = nextLayer;
    state.scene.add(nextLayer);
  }

  function applyValue(key, value) {
    state.values[key] = value;

    if (key === "skyPlaneSize") {
      state.skyPlane.geometry.dispose();
      state.skyPlane.geometry = new THREE.PlaneGeometry(value, value, 1, 1);
      state.skyPlane.geometry.rotateX(-Math.PI / 2);
      return;
    }

    if (key === "skyPlaneAltitude") {
      state.skyPlane.position.y = value;
      return;
    }

    if (
      key === "horizonRadius" ||
      key === "horizonBase" ||
      key === "horizonHeight"
    ) {
      rebuildHorizon();
    }
  }

  return {
    getValues() {
      return { ...state.values };
    },
    setValue(key, value) {
      if (!(key in state.values) || !Number.isFinite(value)) {
        return;
      }

      applyValue(key, value);
    },
    ...state,
  };
}

function disposeHierarchy(root) {
  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

async function loadAtmosphere(trackAtmosphereUrl, presetAtmosphereUrl) {
  const [trackText, presetText] = await Promise.all([
    fetchText(trackAtmosphereUrl, "track atmosphere"),
    fetchText(presetAtmosphereUrl, "atmosphere preset"),
  ]);
  const sunDirection = parseVector3(trackText, "Sun_Direction", [0, 0.707107, 0.707107]);
  const skyGradient = parseGradientColors(presetText);

  return {
    sunDirection: new THREE.Vector3(...sunDirection),
    sunIntensity: parseNumber(trackText, "Sun_Intensity", 1.5),
    skyAmbient: parseNumber(presetText, "SkyDome_Ambient", 1),
    cloudAmbient: parseNumber(presetText, "CloudLayer_Ambient", 1),
    skyDomeRadius: parseNumber(trackText, "SkyDome_Radius", 30000),
    cloudAltitude: parseNumber(trackText, "CloudLayer_Altitude", 500),
    cloudSize: parseNumber(trackText, "CloudLayer_Size", 4000),
    cloudTiling: parseNumber(trackText, "CloudLayer_Tiling", 2),
    cloudCurvature: parseNumber(trackText, "CloudLayer_Curvature", 400),
    cloudVolume: parseNumber(trackText, "CloudLayer_Volume", 50),
    horizonRadius: parseNumber(trackText, "Horizon_Radius", 25000),
    horizonBase: parseNumber(trackText, "Horizon_Base", -2000),
    horizonHeight: parseNumber(trackText, "Horizon_Height", 6000),
    skyGradient,
  };
}

async function fetchText(url, label) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ${label}: ${response.status}`);
  }

  return response.text();
}

function parseNumber(text, key, fallback) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*([-+]?\\d*\\.?\\d+)`));
  return match ? Number.parseFloat(match[1]) : fallback;
}

function parseVector3(text, key, fallback) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));
  if (!match) {
    return fallback;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length === 3 ? values : fallback;
}

function parseGradientColors(text) {
  const matches = Array.from(
    text.matchAll(/\[\d+\]\s*=\s*\{\s*([^}]+)\}/g),
  );

  if (matches.length === 0) {
    return [[0.86, 0.92, 0.95], [0.62, 0.78, 0.92], [0.22, 0.42, 0.6]];
  }

  return matches
    .map((match) =>
      match[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value)),
    )
    .filter((values) => values.length === 3)
    .map((values) =>
      values.map((value) => THREE.MathUtils.clamp(value * 1.15, 0, 1)),
    );
}

function pickGradientColor(gradient, normalizedPosition, fallbackColor) {
  if (!gradient?.length) {
    return fallbackColor.clone();
  }

  const clampedPosition = THREE.MathUtils.clamp(normalizedPosition, 0, 1);
  const sampleIndex = Math.min(
    gradient.length - 1,
    Math.round(clampedPosition * (gradient.length - 1)),
  );
  const sample = gradient[sampleIndex];

  return new THREE.Color(sample[0], sample[1], sample[2]);
}

function configureHorizonTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function configureSkyPlaneTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function createSkyPlane({ size, altitude, texture }) {
  const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const skyPlane = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    }),
  );
  skyPlane.position.y = altitude;
  skyPlane.name = "arena_sky_plane";
  return skyPlane;
}

function createHorizonLayer({ radius, base, height, texture }) {
  const horizon = new THREE.Group();
  horizon.name = "arena_horizon_layer";

  const wallY = base + height * 0.5;
  const stripHeight = 0.25;
  const stripOffsets = [0.75, 0.5, 0.25, 0];

  stripOffsets.forEach((offsetY, index) => {
    const startAngle = -Math.PI * 0.75 + index * (Math.PI / 2);
    const wallGeometry = new THREE.CylinderGeometry(
      radius,
      radius,
      height,
      24,
      1,
      true,
      startAngle,
      Math.PI / 2,
    );
    const material = new THREE.MeshBasicMaterial({
      map: DEBUG_HORIZON ? null : texture.clone(),
      color: DEBUG_HORIZON ? 0xff0000 : 0xffffff,
      transparent: true,
      opacity: 1,
      alphaTest: 0.02,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    if (material.map) {
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.map.flipY = true;
      material.map.wrapS = THREE.ClampToEdgeWrapping;
      material.map.wrapT = THREE.ClampToEdgeWrapping;
      material.map.repeat.set(1, stripHeight);
      material.map.offset.set(0, offsetY);
      material.map.needsUpdate = true;
    }

    const wall = new THREE.Mesh(wallGeometry, material);
    wall.position.y = wallY;
    horizon.add(wall);
  });

  return horizon;
}
