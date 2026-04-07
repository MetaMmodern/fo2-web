import * as THREE from "three";

const DEFAULT_SUN_DIRECTION = new THREE.Vector3(0.3, 0.8, -0.5);
const DEFAULT_SUN_COLOR = new THREE.Color(0xffe6c7);
const DEFAULT_AMBIENT_COLOR = new THREE.Color(0x414141);
const DEFAULT_SPECULAR_COLOR = new THREE.Color(0xfff3db);

export function createTextureRegistry(textureUrls, maxAnisotropy = 1) {
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();

  function getTexture(textureName) {
    if (textureCache.has(textureName)) {
      return textureCache.get(textureName);
    }

    const texture = textureLoader.load(textureUrls[textureName]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.anisotropy = maxAnisotropy;
    textureCache.set(textureName, texture);
    return texture;
  }

  return { getTexture };
}

export function prepareMaterials(root, getTexture, environmentState = null) {
  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }

    obj.castShadow = false;
    obj.receiveShadow = false;

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    const mappedMaterials = sourceMaterials.map((material) =>
      material
        ? createMaterialForName(
            material.name,
            getTexture,
            environmentState,
            Boolean(obj.geometry?.getAttribute("color")),
          )
        : material,
    );

    obj.material =
      mappedMaterials.length === 1 ? mappedMaterials[0] : mappedMaterials;
  });
}

export function setVehicleSunVisibility(root, visibility) {
  const clampedVisibility = THREE.MathUtils.clamp(visibility, 0, 1);

  root?.traverse?.((obj) => {
    if (!obj.isMesh) {
      return;
    }

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    materials.forEach((material) => {
      if (!material?.uniforms?.uSunVisibility) {
        return;
      }

      material.uniforms.uSunVisibility.value = clampedVisibility;
    });
  });
}

export function setVehicleLightState(
  root,
  lightState = {},
  environmentState = null,
  lightsConfig = null,
) {
  const resolvedLightState = lightState ?? {};
  const brakeStrength = THREE.MathUtils.clamp(
    resolvedLightState.brakeStrength ?? 0,
    0,
    1,
  );
  const reverseStrength = THREE.MathUtils.clamp(
    resolvedLightState.reverseStrength ?? 0,
    0,
    1,
  );
  const nightFactor = resolveVehicleNightFactor(environmentState);
  const frontGlow = THREE.MathUtils.lerp(0, 0.82, nightFactor);
  const runningRearGlow = THREE.MathUtils.lerp(0, 0.14, nightFactor);
  const brakeGlow = Math.max(
    runningRearGlow,
    THREE.MathUtils.lerp(0.1, 1.15, brakeStrength),
  );
  const reverseGlow = THREE.MathUtils.lerp(0, 1.25, reverseStrength);
  const materialBindings = lightsConfig?.materials ?? null;

  root?.traverse?.((obj) => {
    if (!obj.isMesh) {
      return;
    }

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    materials.forEach((material) => {
      if (!material?.uniforms?.uGlowStrength) {
        return;
      }

      const glowStrength = resolveVehicleMaterialGlowStrength(
        material,
        materialBindings,
        frontGlow,
        runningRearGlow,
        brakeGlow,
        reverseGlow,
      );

      if (glowStrength == null) {
        material.uniforms.uGlowStrength.value = 0;
        return;
      }

      material.uniforms.uGlowStrength.value = glowStrength;
    });
  });
}

function createMaterialForName(
  name,
  getTexture,
  environmentState,
  useVertexColors,
) {
  const materialName = name ?? "";

  if (name === "body") {
    return createCarBodyMaterial({
      name: materialName,
      baseMap: getTexture("skin"),
      useVertexColors,
      environmentState,
    });
  }

  if (name === "common" || name === "shear") {
    return createDynamicVehicleMaterial({
      name: materialName,
      map: getTexture("common"),
      useVertexColors,
      environmentState,
      specularStrength: 0.2,
      specularPower: 16,
    });
  }

  if (
    name === "shearspring" ||
    name === "shearhock" ||
    name === "scalespring" ||
    name === "scaleshock"
  ) {
    return createDynamicVehicleMaterial({
      name: materialName,
      map: getTexture("shock"),
      useVertexColors,
      environmentState,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      specularStrength: 0.12,
      specularPower: 12,
    });
  }

  if (name === "interior") {
    return createDynamicVehicleMaterial({
      name: materialName,
      map: getTexture("interior"),
      useVertexColors,
      environmentState,
      specularStrength: 0.08,
      specularPower: 10,
    });
  }

  if (name.startsWith("window")) {
    return createCarWindowMaterial({
      name: materialName,
      baseMap: getTexture("windows"),
      environmentState,
    });
  }

  if (name.startsWith("light_")) {
    const isFront = name.startsWith("light_front");
    const isBrake = name.startsWith("light_brake");
    const isReverse = name.startsWith("light_reverse");
    let glowColor = new THREE.Color(0xffffff);

    if (isBrake) {
      glowColor = new THREE.Color(0xff3a20);
    } else if (isReverse) {
      glowColor = new THREE.Color(0xa8c8ff);
    } else if (isFront) {
      glowColor = new THREE.Color(0xffefc1);
    }

    return createCarLightMaterial({
      name: materialName,
      baseMap: getTexture("lights"),
      glowMap: getTexture("lightsGlow"),
      litMap: getTexture("lightsGlowLit"),
      useVertexColors,
      environmentState,
      glowColor,
      transparent: isFront,
      alphaTest: 0.02,
    });
  }

  if (name === "shadow") {
    return new THREE.MeshBasicMaterial({
      name: materialName,
      map: getTexture("shadow"),
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    });
  }

  if (name === "tire") {
    return createDynamicVehicleMaterial({
      name: materialName,
      map: getTexture("tire"),
      useVertexColors,
      environmentState,
      specularStrength: 0,
      specularPower: 12,
      enableSpecular: false,
    });
  }

  if (name === "rim") {
    return createDynamicVehicleMaterial({
      name: materialName,
      map: getTexture("tire"),
      useVertexColors,
      environmentState,
      transparent: true,
      alphaTest: 0.12,
      specularStrength: 0.16,
      specularPower: 20,
      enableSpecular: true,
    });
  }

  return createDynamicVehicleMaterial({
    name: materialName,
    map: getTexture("common"),
    useVertexColors,
    environmentState,
    specularStrength: 0.14,
    specularPower: 16,
  });
}

function createDynamicVehicleMaterial({
  name,
  map,
  useVertexColors,
  environmentState,
  transparent = false,
  alphaTest = 0,
  side = THREE.FrontSide,
  specularStrength = 0.14,
  specularPower = 16,
  enableSpecular = specularStrength > 0,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uMap: { value: map },
      uSunDirection: {
        value: environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uSunVisibility: { value: 1.0 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uSpecularIntensity: {
        value: (environmentState?.specularIntensity ?? 1) * specularStrength,
      },
      uSpecularPower: { value: specularPower },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
    },
    useVertexColors,
    transparent,
    alphaTest,
    side,
    vertexShader: buildVehicleVertexShader(useVertexColors),
    fragmentShader: buildDynamicVehicleFragmentShader(
      useVertexColors,
      enableSpecular,
      transparent || alphaTest > 0,
    ),
  });
  material.userData.textureRefs = map ? [map] : [];
  return material;
}

function createCarBodyMaterial({
  name,
  baseMap,
  useVertexColors,
  environmentState,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uSunDirection: {
        value: environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uSunVisibility: { value: 1.0 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uSpecularIntensity: {
        value: environmentState?.specularIntensity ?? 0.24,
      },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
      uFresnelBias: { value: 0.15 },
      uFresnelScale: { value: 0.85 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
    },
    // The original car-body shader consumes vertex color as a damage/dirt blend
    // input, not as a direct RGB tint on the final body color.
    useVertexColors: false,
    vertexShader: buildVehicleVertexShader(false),
    fragmentShader: buildCarBodyFragmentShader(useVertexColors, false),
  });
  material.transparent = false;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.userData.textureRefs = [baseMap].filter(Boolean);
  return material;
}

function createCarWindowMaterial({
  name,
  baseMap,
  environmentState,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uFresnelBias: { value: 0.25 },
      uFresnelScale: { value: 0.5 },
      uWindowAlpha: { value: 0.25 },
      uWindowMinAlpha: { value: 0.08 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: buildVehicleVertexShader(false),
    fragmentShader: buildCarWindowFragmentShader(),
  });
  material.depthWrite = false;
  material.depthTest = false;
  material.userData.textureRefs = [baseMap].filter(Boolean);
  return material;
}

function createCarLightMaterial({
  name,
  baseMap,
  glowMap,
  litMap,
  useVertexColors,
  environmentState,
  glowColor,
  transparent = false,
  alphaTest = 0,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uGlowMap: { value: glowMap },
      uLitMap: { value: litMap ?? baseMap },
      uSunDirection: {
        value: environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uSunVisibility: { value: 1.0 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uGlowColor: { value: glowColor.clone() },
      uGlowStrength: { value: 0 },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
    },
    useVertexColors,
    transparent,
    alphaTest,
    side: THREE.DoubleSide,
    vertexShader: buildVehicleVertexShader(useVertexColors),
    fragmentShader: buildCarLightFragmentShader(
      useVertexColors,
      transparent || alphaTest > 0,
    ),
  });
  material.depthWrite = !transparent;
  material.userData.vehicleLightRole = name.startsWith("light_front")
    ? "front"
    : name.startsWith("light_brake")
      ? "brake"
      : name.startsWith("light_reverse")
        ? "reverse"
        : "other";
  material.userData.textureRefs = [baseMap, glowMap, litMap].filter(Boolean);
  return material;
}

function createVehicleShaderMaterial({
  name,
  uniforms,
  useVertexColors = false,
  transparent = false,
  alphaTest = 0,
  side = THREE.FrontSide,
  vertexShader,
  fragmentShader,
}) {
  return new THREE.ShaderMaterial({
    name,
    uniforms: {
      ...uniforms,
      uAlphaTest: { value: alphaTest },
    },
    vertexColors: useVertexColors,
    transparent,
    alphaTest,
    side,
    vertexShader,
    fragmentShader,
  });
}

function buildVehicleVertexShader(useVertexColors) {
  return `
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;
    varying vec3 vViewDirection;
    varying vec3 vReflectDirection;
    void main() {
      vUv = uv;
      vColor = vec4(1.0);
      ${useVertexColors ? "vColor = vec4(color.rgb, 1.0);" : ""}
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
      vec3 viewDirection = normalize(cameraPosition - worldPosition.xyz);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = worldNormal;
      vViewDirection = viewDirection;
      vReflectDirection = reflect(-viewDirection, worldNormal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;
}

function buildDynamicVehicleFragmentShader(
  useVertexColors,
  withSpecular,
  preserveTextureAlpha,
) {
  return `
    uniform sampler2D uMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform float uSunVisibility;
    uniform vec3 uAmbientColor;
    uniform float uAmbientIntensity;
    uniform vec3 uSpecularColor;
    uniform float uSpecularIntensity;
    uniform float uSpecularPower;
    uniform float uMaxOverBrighting;
    uniform vec3 uColorMul;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vViewDirection;
    void main() {
      vec4 texel = texture2D(uMap, vUv) * vec4(uColorMul, 1.0);
      vec4 shaded = texel * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      float coverage = shaded.a;
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      vec3 v = normalize(vViewDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * uSunVisibility * ndotl);
      shaded.rgb *= lighting * 2.0;
      ${
        withSpecular
          ? `
      vec3 h = normalize(v + l);
      float spec = pow(max(dot(n, h), 0.0), uSpecularPower) * step(0.0, ndotl);
      shaded.rgb += uSpecularColor * (uSpecularIntensity * uSunVisibility * spec);`
          : ""
      }
      shaded.rgb = min(shaded.rgb, vec3(uMaxOverBrighting));
      if (uAlphaTest > 0.0 && coverage <= uAlphaTest) discard;
      gl_FragColor = vec4(shaded.rgb, ${preserveTextureAlpha ? "coverage" : "1.0"});
    }
  `;
}

function buildCarBodyFragmentShader(useVertexColors, preserveTextureAlpha) {
  return `
    uniform sampler2D uBaseMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform float uSunVisibility;
    uniform vec3 uAmbientColor;
    uniform float uAmbientIntensity;
    uniform vec3 uSpecularColor;
    uniform float uSpecularIntensity;
    uniform float uMaxOverBrighting;
    uniform vec3 uColorMul;
    uniform float uFresnelBias;
    uniform float uFresnelScale;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    varying vec3 vViewDirection;
    varying vec3 vReflectDirection;

    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv) * vec4(uColorMul, 1.0);
      float damageBlend = ${
        useVertexColors
          ? "clamp(dot(vColor.rgb, vec3(0.3333333)), 0.0, 1.0)"
          : "0.0"
      };
      vec4 shaded = baseSample;
      float coverage = baseSample.a;
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      vec3 v = normalize(vViewDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * uSunVisibility * ndotl);
      vec3 litBase = clamp(shaded.rgb * lighting * 2.0, 0.0, 1.0);
      vec3 h = normalize(v + l);
      float spec = pow(max(dot(n, h), 0.0), 16.0) * step(0.0, ndotl);
      float fresnel = uFresnelBias + uFresnelScale * pow(1.0 - abs(dot(v, n)), 5.0);
      float glossMask = coverage * 0.18;
      vec3 skyReflect = mix(
        uAmbientColor * 0.8,
        uSunColor * (0.25 * uSunIntensity),
        clamp(vReflectDirection.y * 0.5 + 0.5, 0.0, 1.0)
      );
      vec3 reflected = skyReflect;
      vec3 specular = uSpecularColor * (uSpecularIntensity * uSunVisibility * spec * glossMask);
      float reflectionMix = clamp(glossMask * fresnel * 0.18, 0.0, 1.0);
      vec3 color = mix(litBase + specular, reflected, reflectionMix);
      color = mix(color, color * 0.82, damageBlend * 0.18);
      color = min(color, vec3(uMaxOverBrighting));
      if (uAlphaTest > 0.0 && coverage <= uAlphaTest) discard;
      gl_FragColor = vec4(color, ${preserveTextureAlpha ? "coverage" : "1.0"});
    }
  `;
}

function buildCarWindowFragmentShader() {
  return `
    uniform sampler2D uBaseMap;
    uniform vec3 uSpecularColor;
    uniform float uFresnelBias;
    uniform float uFresnelScale;
    uniform float uWindowAlpha;
    uniform float uWindowMinAlpha;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vViewDirection;
    varying vec3 vReflectDirection;

    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv);
      vec3 n = normalize(vWorldNormal);
      vec3 v = normalize(vViewDirection);
      float fresnel = uFresnelBias + uFresnelScale * pow(1.0 - abs(dot(v, n)), 5.0);
      float reflectMix = clamp(vReflectDirection.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 reflectionColor = mix(
        uSpecularColor * 0.22,
        uSpecularColor,
        reflectMix
      );
      vec3 color = reflectionColor * clamp(fresnel, 0.0, 1.0);
      float alpha = clamp(
        max(uWindowMinAlpha, (1.0 - fresnel) * uWindowAlpha) * baseSample.a,
        0.0,
        0.92
      );
      if (alpha <= uAlphaTest) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `;
}

function buildCarLightFragmentShader(useVertexColors, preserveTextureAlpha) {
  return `
    uniform sampler2D uBaseMap;
    uniform sampler2D uGlowMap;
    uniform sampler2D uLitMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform float uSunVisibility;
    uniform vec3 uAmbientColor;
    uniform float uAmbientIntensity;
    uniform vec3 uGlowColor;
    uniform float uGlowStrength;
    uniform float uMaxOverBrighting;
    uniform vec3 uColorMul;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv) * vec4(uColorMul, 1.0);
      vec4 glowSample = texture2D(uGlowMap, vUv);
      vec4 litSample = texture2D(uLitMap, vUv) * vec4(uColorMul, 1.0);
      vec4 shaded = baseSample * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * uSunVisibility * ndotl);
      vec3 color = shaded.rgb * lighting * 2.0;
      color += litSample.rgb * uGlowStrength;
      color += glowSample.rgb * uGlowColor * (uGlowStrength * 0.55);
      color = min(color, vec3(uMaxOverBrighting));
      float alpha = baseSample.a;
      if (uAlphaTest > 0.0 && alpha <= uAlphaTest) discard;
      gl_FragColor = vec4(color * alpha, ${preserveTextureAlpha ? "alpha" : "1.0"});
    }
  `;
}

function resolveVehicleNightFactor(environmentState) {
  const sunIntensity = environmentState?.sunIntensity ?? 1.25;
  const ambientIntensity = environmentState?.ambientIntensity ?? 0.9;
  const brightness = sunIntensity * 0.75 + ambientIntensity * 0.5;
  return THREE.MathUtils.clamp(1 - brightness / 1.65, 0, 1);
}

function resolveVehicleMaterialGlowStrength(
  material,
  materialBindings,
  frontGlow,
  runningRearGlow,
  brakeGlow,
  reverseGlow,
) {
  const materialName = material?.name ?? "";
  const configuredBinding = materialBindings?.get?.(materialName) ?? null;

  if (configuredBinding) {
    const toggles = configuredBinding.toggles ?? [];
    const flareEntries = configuredBinding.flareEntries ?? [];
    let glowStrength = 0;

    if (toggles.includes("off")) {
      if (materialName.startsWith("light_front")) {
        glowStrength = Math.max(
          glowStrength,
          resolveConfiguredGlowStrength(flareEntries, "off", frontGlow),
        );
      } else if (materialName.startsWith("light_brake")) {
        glowStrength = Math.max(
          glowStrength,
          resolveConfiguredGlowStrength(flareEntries, "off", runningRearGlow),
        );
      }
    }
    if (toggles.includes("brake")) {
      glowStrength = Math.max(
        glowStrength,
        resolveConfiguredGlowStrength(flareEntries, "brake", brakeGlow),
      );
    }
    if (toggles.includes("reverse")) {
      glowStrength = Math.max(
        glowStrength,
        resolveConfiguredGlowStrength(flareEntries, "reverse", reverseGlow),
      );
    }

    return glowStrength;
  }

  const role = material?.userData?.vehicleLightRole;

  if (role === "front") {
    return frontGlow;
  }
  if (role === "brake") {
    return brakeGlow;
  }
  if (role === "reverse") {
    return reverseGlow;
  }

  return null;
}

function resolveConfiguredGlowStrength(flareEntries, toggle, inputStrength) {
  const matchingEntries = flareEntries.filter(
    (entry) => entry?.toggle === toggle,
  );

  if (matchingEntries.length === 0) {
    return inputStrength;
  }

  const minAlpha = matchingEntries.reduce(
    (best, entry) => Math.max(best, entry?.minAlpha ?? 0),
    0,
  );
  const maxAlpha = matchingEntries.reduce(
    (best, entry) => Math.max(best, entry?.maxAlpha ?? minAlpha),
    minAlpha,
  );
  const normalizedStrength = THREE.MathUtils.clamp(inputStrength, 0, 1);
  const authoredAlpha = THREE.MathUtils.lerp(
    minAlpha,
    maxAlpha,
    normalizedStrength,
  );

  return authoredAlpha * 2;
}
