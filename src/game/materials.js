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
      reflectMap: getTexture("common"),
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
      reflectMap: getTexture("common"),
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
      glowMap: getTexture("lights"),
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
      specularStrength: 0.1,
      specularPower: 24,
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
      specularStrength: 0.32,
      specularPower: 28,
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
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uMap: { value: map },
      uSunDirection: {
        value:
          environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uSpecularIntensity: {
        value: environmentState?.specularIntensity ?? specularStrength,
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
    fragmentShader: buildDynamicVehicleFragmentShader(useVertexColors, true),
  });
  material.userData.textureRefs = map ? [map] : [];
  return material;
}

function createCarBodyMaterial({
  name,
  baseMap,
  reflectMap,
  useVertexColors,
  environmentState,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uReflectMap: { value: reflectMap },
      uSunDirection: {
        value:
          environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uSpecularIntensity: {
        value: environmentState?.specularIntensity ?? 0.65,
      },
      uMaxOverBrighting: {
        value: environmentState?.maxOverBrighting ?? 1.79,
      },
      uFresnelBias: { value: 0.15 },
      uFresnelScale: { value: 0.85 },
      uColorMul: { value: new THREE.Color(1, 1, 1) },
    },
    useVertexColors,
    vertexShader: buildVehicleVertexShader(useVertexColors),
    fragmentShader: buildCarBodyFragmentShader(useVertexColors),
  });
  material.userData.textureRefs = [baseMap, reflectMap].filter(Boolean);
  return material;
}

function createCarWindowMaterial({
  name,
  baseMap,
  reflectMap,
  environmentState,
}) {
  const material = createVehicleShaderMaterial({
    name,
    uniforms: {
      uBaseMap: { value: baseMap },
      uReflectMap: { value: reflectMap },
      uSpecularColor: {
        value:
          environmentState?.specularColor ?? DEFAULT_SPECULAR_COLOR.clone(),
      },
      uWindowTint: { value: new THREE.Color(0x5f6f7f) },
      uFresnelBias: { value: 0.25 },
      uFresnelScale: { value: 0.5 },
      uWindowBrightness: { value: 0.72 },
    },
    transparent: true,
    side: THREE.DoubleSide,
    vertexShader: buildVehicleVertexShader(false),
    fragmentShader: buildCarWindowFragmentShader(),
  });
  material.depthWrite = false;
  material.userData.textureRefs = [baseMap, reflectMap].filter(Boolean);
  return material;
}

function createCarLightMaterial({
  name,
  baseMap,
  glowMap,
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
      uSunDirection: {
        value:
          environmentState?.sunDirection ?? DEFAULT_SUN_DIRECTION.clone(),
      },
      uSunColor: {
        value: environmentState?.sunColor ?? DEFAULT_SUN_COLOR.clone(),
      },
      uSunIntensity: { value: environmentState?.sunIntensity ?? 1.25 },
      uAmbientColor: {
        value: environmentState?.ambientColor ?? DEFAULT_AMBIENT_COLOR.clone(),
      },
      uAmbientIntensity: { value: environmentState?.ambientIntensity ?? 0.9 },
      uGlowColor: { value: glowColor.clone() },
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
    fragmentShader: buildCarLightFragmentShader(useVertexColors),
  });
  material.depthWrite = !transparent;
  material.userData.textureRefs = [baseMap, glowMap].filter(Boolean);
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

function buildDynamicVehicleFragmentShader(useVertexColors, withSpecular) {
  return `
    uniform sampler2D uMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
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
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      vec3 v = normalize(vViewDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * ndotl);
      shaded.rgb *= lighting * 2.0;
      ${
        withSpecular
          ? `
      vec3 h = normalize(v + l);
      float spec = pow(max(dot(n, h), 0.0), uSpecularPower) * step(0.0, ndotl);
      shaded.rgb += uSpecularColor * (uSpecularIntensity * spec);`
          : ""
      }
      shaded.rgb = min(shaded.rgb, vec3(uMaxOverBrighting));
      if (shaded.a <= uAlphaTest) discard;
      gl_FragColor = shaded;
    }
  `;
}

function buildCarBodyFragmentShader(useVertexColors) {
  return `
    uniform sampler2D uBaseMap;
    uniform sampler2D uReflectMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
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
      vec4 reflectSample = texture2D(uReflectMap, vUv);
      vec4 shaded = baseSample * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      vec3 v = normalize(vViewDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * ndotl);
      vec3 litBase = shaded.rgb * lighting * 2.0;
      vec3 h = normalize(v + l);
      float spec = pow(max(dot(n, h), 0.0), 32.0) * step(0.0, ndotl);
      float fresnel = uFresnelBias + uFresnelScale * pow(1.0 - abs(dot(v, n)), 5.0);
      vec3 skyReflect = mix(uAmbientColor, uSunColor, clamp(vReflectDirection.y * 0.5 + 0.5, 0.0, 1.0));
      vec3 reflected = reflectSample.rgb * skyReflect;
      vec3 color = mix(litBase + uSpecularColor * (uSpecularIntensity * spec), reflected, clamp(baseSample.a * fresnel, 0.0, 1.0));
      color = min(color, vec3(uMaxOverBrighting));
      if (baseSample.a <= uAlphaTest) discard;
      gl_FragColor = vec4(color, baseSample.a);
    }
  `;
}

function buildCarWindowFragmentShader() {
  return `
    uniform sampler2D uBaseMap;
    uniform sampler2D uReflectMap;
    uniform vec3 uSpecularColor;
    uniform vec3 uWindowTint;
    uniform float uFresnelBias;
    uniform float uFresnelScale;
    uniform float uWindowBrightness;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vViewDirection;
    varying vec3 vReflectDirection;
    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv);
      vec4 reflectSample = texture2D(uReflectMap, vUv);
      vec3 n = normalize(vWorldNormal);
      vec3 v = normalize(vViewDirection);
      float fresnel = uFresnelBias + uFresnelScale * pow(1.0 - abs(dot(v, n)), 5.0);
      vec3 reflected = reflectSample.rgb * uSpecularColor;
      vec3 baseTint = mix(uWindowTint, baseSample.rgb * uWindowTint, 0.15);
      vec3 color = mix(baseTint, reflected, clamp(fresnel, 0.0, 1.0));
      float alpha = clamp(uWindowBrightness + fresnel * 0.18, 0.0, 0.92);
      if (alpha <= uAlphaTest) discard;
      gl_FragColor = vec4(color, alpha);
    }
  `;
}

function buildCarLightFragmentShader(useVertexColors) {
  return `
    uniform sampler2D uBaseMap;
    uniform sampler2D uGlowMap;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform vec3 uAmbientColor;
    uniform float uAmbientIntensity;
    uniform vec3 uGlowColor;
    uniform float uMaxOverBrighting;
    uniform vec3 uColorMul;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying vec4 vColor;
    varying vec3 vWorldNormal;
    void main() {
      vec4 baseSample = texture2D(uBaseMap, vUv) * vec4(uColorMul, 1.0);
      vec4 glowSample = texture2D(uGlowMap, vUv);
      vec4 shaded = baseSample * ${useVertexColors ? "vColor" : "vec4(1.0)"};
      vec3 n = normalize(vWorldNormal);
      vec3 l = normalize(uSunDirection);
      float ndotl = max(dot(n, l), 0.0);
      vec3 lighting = uAmbientColor * uAmbientIntensity + uSunColor * (uSunIntensity * ndotl);
      vec3 color = shaded.rgb * lighting * 2.0;
      color += glowSample.rgb * uGlowColor;
      color = min(color, vec3(uMaxOverBrighting));
      float alpha = baseSample.a;
      if (alpha <= uAlphaTest) discard;
      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;
}
