import * as THREE from "three";

const DEBUG_HORIZON = false;

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

  const skyDome = createSkyDome({
    radius: atmosphere.skyDomeRadius,
    colors: atmosphere.skyGradient,
  });
  scene.add(skyDome);

  const hemisphereLight = new THREE.HemisphereLight(0xe8f4ff, 0x6a4c2f, 1.45);
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(
    0xfff2cf,
    atmosphere.sunIntensity * 1.4,
  );
  sunLight.position.copy(sunPosition);
  sunLight.castShadow = true;
  scene.add(sunLight);

  const cloudBottomTexture = textureLoader.load(assetUrls.cloudBottomTexture);
  configureCloudTexture(cloudBottomTexture, atmosphere.cloudTiling);
  const cloudTopTexture = textureLoader.load(assetUrls.cloudTopTexture);
  configureCloudTexture(cloudTopTexture, atmosphere.cloudTiling);

  const horizonTexture = textureLoader.load(assetUrls.horizonTexture);
  configureHorizonTexture(horizonTexture);
  const horizonLayer = createHorizonLayer({
    radius: atmosphere.horizonRadius,
    base: atmosphere.horizonBase,
    height: atmosphere.horizonHeight,
    texture: horizonTexture,
  });
  scene.add(horizonLayer);

  const cloudLayer = createCloudLayer({
    altitude: atmosphere.cloudAltitude,
    size: atmosphere.cloudSize,
    curvature: atmosphere.cloudCurvature,
    volume: atmosphere.cloudVolume,
    bottomTexture: cloudBottomTexture,
    topTexture: cloudTopTexture,
  });
  scene.add(cloudLayer);

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

  scene.userData.arenaEnvironment = {
    atmosphere,
    skyDome,
    hemisphereLight,
    sunLight,
    sunDirection,
    sunPosition,
    cloudLayer,
    horizonLayer,
    cloudBottomTexture,
    cloudTopTexture,
    horizonTexture,
    glowTexture,
    flareTexture,
    glowSprite,
    flareSprite,
  };
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

function configureCloudTexture(texture, tiling) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(tiling, tiling);
}

function configureHorizonTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function createSkyDome({ radius, colors }) {
  const geometry = new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const position = geometry.getAttribute("position");
  const colorValues = new Float32Array(position.count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    const normalized = THREE.MathUtils.clamp(y / radius, 0, 1);
    const sample = sampleGradient(colors, normalized);
    color.setRGB(sample[0], sample[1], sample[2]);
    color.toArray(colorValues, index * 3);
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));

  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
}

function sampleGradient(colors, t) {
  const scaled = t * (colors.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(colors.length - 1, lowIndex + 1);
  const alpha = scaled - lowIndex;
  const low = colors[lowIndex];
  const high = colors[highIndex];

  return [
    THREE.MathUtils.lerp(low[0], high[0], alpha),
    THREE.MathUtils.lerp(low[1], high[1], alpha),
    THREE.MathUtils.lerp(low[2], high[2], alpha),
  ];
}

function createCloudLayer({
  altitude,
  size,
  curvature,
  volume,
  bottomTexture,
  topTexture,
}) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(size, size, 48, 48);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.getAttribute("position");
  const maxRadius = size * 0.5;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const radius = Math.min(1, Math.hypot(x, z) / maxRadius);
    const y = altitude - radius * radius * curvature;
    position.setY(index, y);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const bottomClouds = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: bottomTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  group.add(bottomClouds);

  const topClouds = new THREE.Mesh(
    geometry.clone(),
    new THREE.MeshBasicMaterial({
      map: topTexture,
      color: 0xf7fbff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  topClouds.position.y += volume;
  group.add(topClouds);

  return group;
}

function createHorizonLayer({ radius, base, height, texture }) {
  const horizon = new THREE.Group();
  horizon.name = "arena_horizon_layer";

  const wallWidth = radius * 2;
  const wallHeight = height;
  const wallGeometry = new THREE.PlaneGeometry(wallWidth, wallHeight, 1, 1);
  const wallY = base + wallHeight * 0.5;
  const stripHeight = 0.25;
  const stripOffsets = [0.75, 0.5, 0.25, 0];
  const placements = [
    { position: [0, wallY, -radius], rotationY: 0 },
    { position: [radius, wallY, 0], rotationY: -Math.PI / 2 },
    { position: [0, wallY, radius], rotationY: Math.PI },
    { position: [-radius, wallY, 0], rotationY: Math.PI / 2 },
  ];

  stripOffsets.forEach((offsetY, index) => {
    const material = new THREE.MeshBasicMaterial({
      map: DEBUG_HORIZON ? null : texture.clone(),
      color: DEBUG_HORIZON ? 0xff0000 : 0xffffff,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
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
    wall.position.set(...placements[index].position);
    wall.rotation.y = placements[index].rotationY;
    horizon.add(wall);
  });

  return horizon;
}
