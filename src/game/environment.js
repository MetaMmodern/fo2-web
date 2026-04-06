import * as THREE from "three";

const DEBUG_HORIZON = false;
const ENVIRONMENT_SCALE = 0.02;
const SKY_TEXTURE_ROTATION = -Math.PI * 0.35;
const HORIZON_ROTATION = Math.PI * 0.18;
const FLARE_OVERLAY_DEPTH = 0.5;
const DEFAULT_ENVIRONMENT_VALUES = {
  skyPlaneSize: 3300,
  skyPlaneAltitude: 188,
  horizonRadius: 599,
  horizonBase: -40,
  horizonHeight: 217,
};

export async function loadTrackEnvironment(scene, assetUrls) {
  const weatherProfile = assetUrls.weatherProfile ?? null;
  const resolvedFlareConfigUrl = resolveFlareConfigUrl(
    assetUrls,
    weatherProfile,
  );
  const [atmosphere, flareConfig] = await Promise.all([
    loadAtmosphere(assetUrls.atmosphere, assetUrls.atmospherePreset),
    loadFlareConfig(resolvedFlareConfigUrl),
  ]);
  const textureLoader = new THREE.TextureLoader();
  const sunPosition =
    weatherProfile?.sunPosition?.clone() ??
    atmosphere.sunDirection.clone().normalize().multiplyScalar(1000);
  const sunDirection = sunPosition.clone().normalize();
  const flarePosition =
    weatherProfile?.flarePosition?.clone() ?? sunPosition.clone();
  scene.background = null;
  scene.environment = null;

  const skyTopTexture = assetUrls.skyTopTexture
    ? textureLoader.load(assetUrls.skyTopTexture)
    : null;
  if (skyTopTexture) {
    configureSkyPlaneTexture(skyTopTexture);
  }
  const cloudBottomTexture = assetUrls.cloudBottomTexture
    ? textureLoader.load(assetUrls.cloudBottomTexture)
    : null;
  const cloudTopTexture = assetUrls.cloudTopTexture
    ? textureLoader.load(assetUrls.cloudTopTexture)
    : null;
  if (cloudBottomTexture) {
    configureCloudTexture(cloudBottomTexture);
  }
  if (cloudTopTexture) {
    configureCloudTexture(cloudTopTexture);
  }

  const horizonTexture = textureLoader.load(assetUrls.horizonTexture);
  configureHorizonTexture(horizonTexture);

  const environmentValues = {
    skyPlaneSize: DEFAULT_ENVIRONMENT_VALUES.skyPlaneSize,
    skyPlaneAltitude: DEFAULT_ENVIRONMENT_VALUES.skyPlaneAltitude,
    horizonRadius:
      weatherProfile?.horizonRadius != null
        ? weatherProfile.horizonRadius * 0.05
        : DEFAULT_ENVIRONMENT_VALUES.horizonRadius,
    horizonBase:
      weatherProfile?.horizonBase != null
        ? weatherProfile.horizonBase * 0.02
        : DEFAULT_ENVIRONMENT_VALUES.horizonBase,
    horizonHeight:
      weatherProfile?.horizonHeight != null
        ? weatherProfile.horizonHeight * 0.036
        : DEFAULT_ENVIRONMENT_VALUES.horizonHeight,
  };

  const atmosphereDome = createGradientSkyDome({
    radius: Math.max(
      environmentValues.horizonRadius * 1.35,
      atmosphere.skyDomeRadius * ENVIRONMENT_SCALE,
    ),
    gradient: atmosphere.skyGradient,
  });
  scene.add(atmosphereDome);

  const cloudLayer =
    cloudBottomTexture || cloudTopTexture
      ? createCloudLayer({
          radius: Math.max(
            environmentValues.horizonRadius * 1.15,
            atmosphere.skyDomeRadius * ENVIRONMENT_SCALE * 0.92,
          ),
          altitude: atmosphere.cloudAltitude * ENVIRONMENT_SCALE,
          bottomTexture: cloudBottomTexture,
          topTexture: cloudTopTexture,
          tiling: atmosphere.cloudTiling,
          volume: atmosphere.cloudVolume,
          ambient: atmosphere.cloudAmbient,
        })
      : null;
  if (cloudLayer) {
    scene.add(cloudLayer);
  }

  const skyPlane = skyTopTexture
    ? createSkyPlane({
        size: environmentValues.skyPlaneSize,
        altitude: environmentValues.skyPlaneAltitude,
        texture: skyTopTexture,
      })
    : null;

  if (skyPlane?.material?.map) {
    skyPlane.material.map.rotation = SKY_TEXTURE_ROTATION;
    scene.add(skyPlane);
  }

  const horizonLayer = createHorizonLayer({
    radius: environmentValues.horizonRadius,
    base: environmentValues.horizonBase,
    height: environmentValues.horizonHeight,
    texture: horizonTexture,
  });
  horizonLayer.rotation.y = HORIZON_ROTATION;
  scene.add(horizonLayer);

  const sunLightColor =
    vector4ToColor(weatherProfile?.sunColor) ??
    pickGradientColor(atmosphere.skyGradient, 0.78, new THREE.Color(0xb9d8ff));
  const ambientLightColor =
    vector4ToColor(weatherProfile?.ambientColor) ??
    pickGradientColor(atmosphere.skyGradient, 0.52, new THREE.Color(0x8ab6e8));
  const specularLightColor =
    vector4ToColor(weatherProfile?.specularColor) ?? sunLightColor.clone();
  const groundLightColor = ambientLightColor
    .clone()
    .lerp(new THREE.Color(0xc39a68), 0.38);
  scene.fog = null;

  const ambientLight = new THREE.AmbientLight(
    ambientLightColor,
    weatherProfile?.ambientIntensity ??
      0.72 * atmosphere.skyAmbient + 0.42 * atmosphere.cloudAmbient,
  );
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    sunLightColor,
    groundLightColor,
    0.35 *
      (weatherProfile?.ambientIntensity ??
        1.35 * atmosphere.skyAmbient + 0.6 * atmosphere.cloudAmbient),
  );
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(
    specularLightColor,
    (weatherProfile?.sunIntensity ?? atmosphere.sunIntensity) * 1.35,
  );
  sunLight.position.copy(sunPosition);
  sunLight.castShadow = true;
  scene.add(sunLight);

  const glowTexture = textureLoader.load(
    resolveFlareGlowTextureUrl(assetUrls, flareConfig),
  );
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  glowTexture.flipY = true;
  glowTexture.wrapS = THREE.ClampToEdgeWrapping;
  glowTexture.wrapT = THREE.ClampToEdgeWrapping;

  const flareTexture = textureLoader.load(
    resolveFlareTextureUrl(assetUrls, flareConfig),
  );
  flareTexture.colorSpace = THREE.SRGBColorSpace;
  flareTexture.flipY = true;
  flareTexture.wrapS = THREE.ClampToEdgeWrapping;
  flareTexture.wrapT = THREE.ClampToEdgeWrapping;

  const flareOverlay = createSunFlareOverlay({
    glowTexture,
    flareTexture,
    flareConfig,
  });

  const environmentController = createEnvironmentController({
    scene,
    values: environmentValues,
    atmosphereDome,
    cloudLayer,
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
    flarePosition,
    glowTexture,
    flareTexture,
    flareConfig,
    flareOverlay,
    weatherProfile,
  });

  scene.userData.trackEnvironment = environmentController;
  return environmentController;
}

export const loadArenaEnvironment = loadTrackEnvironment;

function createEnvironmentController(state) {
  function rebuildHorizon() {
    const nextLayer = createHorizonLayer({
      radius: state.values.horizonRadius,
      base: state.values.horizonBase,
      height: state.values.horizonHeight,
      texture: state.horizonTexture,
    });
    nextLayer.rotation.y = HORIZON_ROTATION;
    state.scene.remove(state.horizonLayer);
    disposeHierarchy(state.horizonLayer);
    state.horizonLayer = nextLayer;
    state.scene.add(nextLayer);
  }

  function applyValue(key, value) {
    state.values[key] = value;

    if (key === "skyPlaneSize") {
      if (!state.skyPlane) {
        return;
      }
      state.skyPlane.geometry.dispose();
      state.skyPlane.geometry = new THREE.PlaneGeometry(value, value, 1, 1);
      state.skyPlane.geometry.rotateX(-Math.PI / 2);
      return;
    }

    if (key === "skyPlaneAltitude") {
      if (!state.skyPlane) {
        return;
      }
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
    setSunPosition(x, y, z) {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z)
      ) {
        return;
      }

      state.sunPosition.set(x, y, z);
      state.sunDirection.copy(state.sunPosition).normalize();
      state.flarePosition.copy(state.sunPosition);
      state.sunLight?.position.copy(state.sunPosition);
    },
    update(camera) {
      state.flareOverlay?.update(camera, state.flarePosition);
    },
    getOverlayScene() {
      return state.flareOverlay?.scene ?? null;
    },
    getOverlayCamera() {
      return state.flareOverlay?.camera ?? null;
    },
    setValue(key, value) {
      if (!(key in state.values) || !Number.isFinite(value)) {
        return;
      }

      applyValue(key, value);
    },
    dispose() {
      if (state.skyPlane) {
        state.scene.remove(state.skyPlane);
        disposeHierarchy(state.skyPlane);
      }

      if (state.atmosphereDome) {
        state.scene.remove(state.atmosphereDome);
        disposeHierarchy(state.atmosphereDome);
      }

      if (state.cloudLayer) {
        state.scene.remove(state.cloudLayer);
        disposeHierarchy(state.cloudLayer);
      }

      if (state.horizonLayer) {
        state.scene.remove(state.horizonLayer);
        disposeHierarchy(state.horizonLayer);
      }

      if (state.ambientLight) {
        state.scene.remove(state.ambientLight);
      }

      if (state.hemisphereLight) {
        state.scene.remove(state.hemisphereLight);
      }

      if (state.sunLight) {
        state.scene.remove(state.sunLight);
      }

      if (state.flareOverlay?.scene) {
        disposeHierarchy(state.flareOverlay.scene);
      }
    },
    ...state,
  };
}

function createSunFlareOverlay({ glowTexture, flareTexture, flareConfig }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const center = new THREE.Vector2();
  const sunNdc = new THREE.Vector3();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd68a,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    sizeAttenuation: false,
  });
  const glowSprite = new THREE.Sprite(glowMaterial);
  glowSprite.position.set(0, 0, FLARE_OVERLAY_DEPTH);
  glowSprite.renderOrder = 1000;
  glowSprite.frustumCulled = false;
  scene.add(glowSprite);

  const flareSprites = flareConfig.flares.map((flare) => {
    const map = flareTexture.clone();
    map.repeat.set(
      flare.uvBottomRight.x - flare.uvTopLeft.x,
      flare.uvBottomRight.y - flare.uvTopLeft.y,
    );
    map.offset.set(flare.uvTopLeft.x, 1 - flare.uvBottomRight.y);
    const material = new THREE.SpriteMaterial({
      map,
      color: 0xfff4cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      sizeAttenuation: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 0, FLARE_OVERLAY_DEPTH);
    sprite.renderOrder = 1001;
    sprite.frustumCulled = false;
    scene.add(sprite);
    return { config: flare, sprite, material };
  });

  return {
    scene,
    camera,
    update(viewCamera, sunWorldPosition) {
      sunNdc.copy(sunWorldPosition).project(viewCamera);
      const sunVisible =
        sunNdc.z > -1 &&
        sunNdc.z < 1 &&
        Math.abs(sunNdc.x) < 1.35 &&
        Math.abs(sunNdc.y) < 1.35;

      if (!sunVisible) {
        glowSprite.visible = false;
        for (const flare of flareSprites) {
          flare.sprite.visible = false;
        }
        return;
      }

      const aspect = viewCamera.aspect || 1;
      const centerDistance = Math.min(
        1,
        Math.sqrt(sunNdc.x * sunNdc.x + sunNdc.y * sunNdc.y),
      );
      const presence = THREE.MathUtils.clamp(1.1 - centerDistance * 0.75, 0, 1);
      const baseAngle = Math.atan2(sunNdc.y - center.y, sunNdc.x - center.x);

      glowSprite.visible = true;
      glowSprite.position.set(sunNdc.x, sunNdc.y, FLARE_OVERLAY_DEPTH);
      setOverlaySpriteScale(
        glowSprite,
        flareConfig.glowSizeDeg,
        viewCamera.fov,
        aspect,
      );
      glowMaterial.opacity = 0.45 + presence * 0.75;

      for (const flare of flareSprites) {
        const { config, sprite, material } = flare;
        sprite.visible = true;
        sprite.position.set(
          sunNdc.x * -config.location,
          sunNdc.y * -config.location,
          FLARE_OVERLAY_DEPTH,
        );
        sprite.material.rotation =
          baseAngle * config.angleScale + config.angleRotation;
        setOverlaySpriteScale(sprite, config.sizeDeg, viewCamera.fov, aspect);

        const sharpnessWeight = THREE.MathUtils.clamp(
          config.sharpness / 6.5,
          0.15,
          1.0,
        );
        const locationWeight = THREE.MathUtils.clamp(
          1.05 - Math.abs(config.location) * 0.1,
          0.2,
          1.0,
        );
        material.opacity = presence * sharpnessWeight * locationWeight * 0.75;
      }
    },
  };
}

function setOverlaySpriteScale(sprite, sizeDeg, fovDeg, aspect) {
  const scaleY = (sizeDeg / Math.max(fovDeg, 1e-4)) * 2;
  sprite.scale.set(scaleY / Math.max(aspect, 1e-4), scaleY, 1);
}

function disposeHierarchy(root) {
  root.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }

    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

async function loadAtmosphere(trackAtmosphereUrl, presetAtmosphereUrl) {
  const [trackText, presetText] = await Promise.all([
    fetchText(trackAtmosphereUrl, "track atmosphere"),
    fetchText(presetAtmosphereUrl, "atmosphere preset"),
  ]);
  const sunDirection = parseVector3(
    trackText,
    "Sun_Direction",
    [0, 0.707107, 0.707107],
  );
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

async function loadFlareConfig(flareConfigUrl) {
  const text = await fetchText(flareConfigUrl, "flare config");
  return parseFlareConfig(text);
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

function parseFlareConfig(text) {
  const glowSizeDeg = parseNumber(text, "GlowSize", 25);
  const flareBlocks = extractIndexedBlocks(text);

  return {
    glowMapName: parseQuotedValue(text, "GlowMap"),
    flareMapName: parseQuotedValue(text, "FlareMap"),
    glowSizeDeg,
    flares: flareBlocks.map((block) => ({
      uvTopLeft: parseVector2Block(block, "UVTopLeft", [0, 0]),
      uvBottomRight: parseVector2Block(block, "UVBottomRight", [1, 1]),
      sizeDeg: parseNumber(block, "Size", 8),
      sharpness: parseNumber(block, "Sharpness", 1),
      location: parseNumber(block, "Location", 0),
      angleScale: parseNumber(block, "AngleScale", 0),
      angleRotation: parseNumber(block, "AngleRotation", 0),
    })),
  };
}

function parseQuotedValue(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`, "i"));
  return match ? match[1] : null;
}

function extractIndexedBlocks(text) {
  const blocks = [];
  const startPattern = /\[\d+\]\s*=\s*\{/g;
  let match = startPattern.exec(text);

  while (match) {
    let depth = 1;
    let index = match.index + match[0].length;
    const contentStart = index;

    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      index += 1;
    }

    if (depth === 0) {
      blocks.push(text.slice(contentStart, index - 1));
    }
    startPattern.lastIndex = index;
    match = startPattern.exec(text);
  }

  return blocks;
}

function parseVector2Block(text, key, fallback) {
  const match = text.match(
    new RegExp(`${key}\\s*=\\s*\\{\\s*([^,}]+)\\s*,\\s*([^}]+)\\}`),
  );
  if (!match) {
    return new THREE.Vector2(...fallback);
  }

  return new THREE.Vector2(
    Number.parseFloat(match[1]),
    Number.parseFloat(match[2]),
  );
}

function parseGradientColors(text) {
  const matches = Array.from(text.matchAll(/\[\d+\]\s*=\s*\{\s*([^}]+)\}/g));

  if (matches.length === 0) {
    return [
      [0.86, 0.92, 0.95],
      [0.62, 0.78, 0.92],
      [0.22, 0.42, 0.6],
    ];
  }

  return matches
    .map((match) =>
      match[1]
        .split(",")
        .map((value) => Number.parseFloat(value.trim()))
        .filter((value) => Number.isFinite(value)),
    )
    .filter((values) => values.length === 3)
    .map((values) => values.map((value) => THREE.MathUtils.clamp(value, 0, 1)));
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
  texture.center.set(0.5, 0.5);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function configureCloudTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
}

function vector4ToColor(value) {
  if (!value) {
    return null;
  }

  return new THREE.Color(value.x, value.y, value.z);
}

function resolveFlareConfigUrl(assetUrls, weatherProfile) {
  const flareFileName = weatherProfile?.flareFile?.toLowerCase?.();
  return assetUrls.flareConfigByName?.[flareFileName] ?? assetUrls.flareConfig;
}

function resolveFlareGlowTextureUrl(assetUrls, flareConfig) {
  const flareName = flareConfig?.glowMapName?.toLowerCase?.();
  return assetUrls.flareGlowTextureByName?.[flareName] ?? assetUrls.glowTexture;
}

function resolveFlareTextureUrl(assetUrls, flareConfig) {
  const flareName = flareConfig?.flareMapName?.toLowerCase?.();
  return assetUrls.flareTextureByName?.[flareName] ?? assetUrls.flareTexture;
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

function createGradientSkyDome({ radius, gradient }) {
  const topColor = pickGradientColor(gradient, 0, new THREE.Color(0x9dc3ea));
  const midColor = pickGradientColor(gradient, 0.45, new THREE.Color(0x7eabda));
  const bottomColor = pickGradientColor(gradient, 1, new THREE.Color(0xc9b79b));
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: topColor },
      midColor: { value: midColor },
      bottomColor: { value: bottomColor },
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        vec3 color = mix(bottomColor, midColor, smoothstep(0.0, 0.55, h));
        color = mix(color, topColor, smoothstep(0.45, 1.0, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(geometry, material);
  skyDome.name = "gradient_sky_dome";
  return skyDome;
}

function createCloudLayer({
  radius,
  altitude,
  bottomTexture,
  topTexture,
  tiling,
  volume,
  ambient,
}) {
  const geometry = new THREE.SphereGeometry(radius, 40, 20);
  geometry.translate(0, altitude, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      cloudBottomMap: { value: bottomTexture },
      cloudTopMap: { value: topTexture },
      uvScale: { value: tiling ?? 1 },
      alphaScale: {
        value: THREE.MathUtils.clamp((volume ?? 50) / 55, 0.2, 1.5),
      },
      brightness: {
        value: THREE.MathUtils.clamp((ambient ?? 1) * 0.7, 0.2, 1.4),
      },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudBottomMap;
      uniform sampler2D cloudTopMap;
      uniform float uvScale;
      uniform float alphaScale;
      uniform float brightness;
      varying vec2 vUv;

      vec4 sampleOrEmpty(sampler2D mapRef, vec2 uv) {
        return texture2D(mapRef, uv);
      }

      void main() {
        vec2 uv0 = vec2(vUv.x * uvScale, vUv.y * uvScale);
        vec2 uv1 = vec2(vUv.x * uvScale * 0.85 + 0.11, vUv.y * uvScale * 0.85 + 0.07);
        vec4 bottomSample = sampleOrEmpty(cloudBottomMap, uv0);
        vec4 topSample = sampleOrEmpty(cloudTopMap, uv1);
        vec3 cloudColor = mix(bottomSample.rgb, topSample.rgb, topSample.a);
        float cloudAlpha = max(bottomSample.a, topSample.a) * alphaScale;
        cloudAlpha = smoothstep(0.04, 0.5, cloudAlpha) * 0.58;
        gl_FragColor = vec4(cloudColor * brightness, cloudAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });

  const cloudLayer = new THREE.Mesh(geometry, material);
  cloudLayer.name = "cloud_layer";
  return cloudLayer;
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
      color: DEBUG_HORIZON ? 0xff0000 : 0xf6e4cf,
      transparent: true,
      opacity: 0.94,
      alphaTest: 0.02,
      side: THREE.BackSide,
      depthWrite: false,
      fog: true,
    });

    if (material.map) {
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.map.flipY = true;
      material.map.wrapS = THREE.ClampToEdgeWrapping;
      material.map.wrapT = THREE.ClampToEdgeWrapping;
      material.map.repeat.set(1, stripHeight);
      material.map.offset.set(0, offsetY);
    }

    const wall = new THREE.Mesh(wallGeometry, material);
    wall.position.y = wallY;
    horizon.add(wall);
  });

  return horizon;
}
