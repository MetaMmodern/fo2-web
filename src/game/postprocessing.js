import * as THREE from "three";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";

const FO2_LUMA_WEIGHTS = new THREE.Vector3(0.296875, 0.59375, 0.1171875);
const FO2_BLOOM_INTENSITY_MAX = 4.0;
const FO2_BLOOM_INTENSITY_DIV4 = 0.25;
const FO2_POST_BUFFER_SIZE = 256;
const FO2_INTERMEDIATE_COUNT = 7;
const FO2_COMBINE_SUBTRACT = -0.5;

export function createColorFilterPass(renderer, assetUrls) {
  const initialSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const renderTarget = createFullscreenTarget(
    initialSize.x,
    initialSize.y,
    true,
  );
  if (renderer.capabilities.isWebGL2) {
    renderTarget.samples = 4;
  }
  const luminanceTarget = createFullscreenTarget(initialSize.x, initialSize.y);
  const filteredTarget = createFullscreenTarget(initialSize.x, initialSize.y);
  const maskedTarget = createFullscreenTarget(initialSize.x, initialSize.y);
  const bloomFullTarget = createFullscreenTarget(initialSize.x, initialSize.y);
  const postTargets = Array.from({ length: FO2_INTERMEDIATE_COUNT }, () =>
    createPostTarget(),
  );

  const tgaLoader = new TGALoader();
  let addTexture = tgaLoader.load(assetUrls.addTexture, () =>
    rebuildRemapLut(),
  );
  let subTexture = tgaLoader.load(assetUrls.subTexture, () =>
    rebuildRemapLut(),
  );
  configureRampTexture(addTexture);
  configureRampTexture(subTexture);

  const remapLutData = new Uint8Array(256 * 4);
  remapLutData.fill(128);
  const remapLutTexture = new THREE.DataTexture(
    remapLutData,
    256,
    1,
    THREE.RGBAFormat,
  );
  remapLutTexture.colorSpace = THREE.NoColorSpace;
  remapLutTexture.magFilter = THREE.NearestFilter;
  remapLutTexture.minFilter = THREE.NearestFilter;
  remapLutTexture.wrapS = THREE.ClampToEdgeWrapping;
  remapLutTexture.wrapT = THREE.ClampToEdgeWrapping;
  remapLutTexture.generateMipmaps = false;
  remapLutTexture.needsUpdate = true;

  const remapState = {
    luminanceFilterAddIntensity: 0.15,
    luminanceFilterSubIntensity: 0.02,
    globalColorAdd: new THREE.Color(1, 1, 1),
    globalColorSub: new THREE.Color(1, 1, 1),
    globalAddIntensity: 0.0,
    globalSubIntensity: 0.12,
  };

  const bloomState = {
    bloomTolerance: 0.15,
    bloomScale: 2.28,
    bloomIntensityDiv4: 0.78 * FO2_BLOOM_INTENSITY_DIV4,
    bloomColorPremul: new THREE.Color(0.588235, 0.509804, 0.266667),
    colorBloom: true,
    bloomPasses: 2,
    bloomDownsampled: false,
    bloomFromLuminance: true,
    combineBaseScale: 1.0,
    finalBloomStrength: 0.78,
    maskedBloomStrength: 0.3,
    maxOverBrighting: 1.79,
  };

  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postQuadGeometry = new THREE.PlaneGeometry(2, 2);
  const passScene = new THREE.Scene();

  const luminanceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: renderTarget.texture },
      lumaWeights: { value: FO2_LUMA_WEIGHTS },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform vec3 lumaWeights;

      varying vec2 vUv;

      vec3 linearToScreen(in vec3 color) {
        return sRGBTransferOETF(vec4(clamp(color, 0.0, 1.0), 1.0)).rgb;
      }

      void main() {
        vec3 sceneScreen = linearToScreen(texture2D(tScene, vUv).rgb);
        float luminance = dot(sceneScreen, lumaWeights);
        gl_FragColor = vec4(sceneScreen, luminance);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const remapMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: luminanceTarget.texture },
      tRemapLut: { value: remapLutTexture },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform sampler2D tRemapLut;

      varying vec2 vUv;

      void main() {
        vec4 source = texture2D(tScene, vUv);
        vec3 lutOffset = texture2D(tRemapLut, vec2(source.a, 0.5)).rgb - vec3(0.5);
        vec3 filteredScreen = clamp(source.rgb + lutOffset, 0.0, 1.0);
        gl_FragColor = vec4(filteredScreen, source.a);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const highpassMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: filteredTarget.texture },
      threshold: { value: bloomState.bloomTolerance },
      intensityDiv4: { value: bloomState.bloomIntensityDiv4 },
      bloomColorPremul: { value: bloomState.bloomColorPremul },
      colorBloom: { value: bloomState.colorBloom },
      bloomFromLuminance: { value: bloomState.bloomFromLuminance },
      texelSize: { value: new THREE.Vector2(1, 1) },
      sampleScale: { value: 1.0 },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform float threshold;
      uniform float intensityDiv4;
      uniform vec3 bloomColorPremul;
      uniform bool colorBloom;
      uniform bool bloomFromLuminance;
      uniform vec2 texelSize;
      uniform float sampleScale;

      varying vec2 vUv;

      vec4 sampleOffset(vec2 offset) {
        vec2 uv = clamp(vUv + offset * texelSize * sampleScale, 0.0, 1.0);
        return texture2D(tScene, uv);
      }

      void main() {
        vec4 source;
        if (bloomFromLuminance) {
          source = texture2D(tScene, vUv);
          float signal = max(source.a - threshold, 0.0);
          signal *= clamp(intensityDiv4, 0.0, 1.0) * 4.0;
          vec3 bloomRgb = colorBloom ? source.rgb * signal : vec3(signal);
          bloomRgb *= bloomColorPremul;
          gl_FragColor = vec4(bloomRgb, signal);
          return;
        }

        vec4 s0 = sampleOffset(vec2(-0.5, -0.5));
        vec4 s1 = sampleOffset(vec2(0.5, -0.5));
        vec4 s2 = sampleOffset(vec2(-0.5, 0.5));
        vec4 s3 = sampleOffset(vec2(0.5, 0.5));
        source = (s0 + s1 + s2 + s3) * 0.25;
        vec4 cut = max(source - vec4(threshold), 0.0);
        gl_FragColor = cut * (clamp(intensityDiv4, 0.0, 1.0) * 4.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const box4Material = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: postTargets[0].texture },
      texelSize: {
        value: new THREE.Vector2(
          1 / FO2_POST_BUFFER_SIZE,
          1 / FO2_POST_BUFFER_SIZE,
        ),
      },
      sampleScale: { value: 1.0 },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tInput;
      uniform vec2 texelSize;
      uniform float sampleScale;

      varying vec2 vUv;

      void main() {
        vec2 offset = texelSize * sampleScale;
        vec4 c0 = texture2D(tInput, clamp(vUv + vec2(-offset.x, -offset.y), 0.0, 1.0));
        vec4 c1 = texture2D(tInput, clamp(vUv + vec2(offset.x, -offset.y), 0.0, 1.0));
        vec4 c2 = texture2D(tInput, clamp(vUv + vec2(-offset.x, offset.y), 0.0, 1.0));
        vec4 c3 = texture2D(tInput, clamp(vUv + vec2(offset.x, offset.y), 0.0, 1.0));
        gl_FragColor = (c0 + c1 + c2 + c3) * 0.25;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: postTargets[0].texture },
      colorMul: { value: new THREE.Vector4(1, 1, 1, 1) },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tInput;
      uniform vec4 colorMul;

      varying vec2 vUv;

      void main() {
        gl_FragColor = texture2D(tInput, vUv) * colorMul;
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const combineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tBase: { value: postTargets[0].texture },
      tBloom: { value: postTargets[1].texture },
      baseScale: { value: bloomState.combineBaseScale },
      bloomScale: { value: FO2_COMBINE_SUBTRACT },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tBase;
      uniform sampler2D tBloom;
      uniform float baseScale;
      uniform float bloomScale;

      varying vec2 vUv;

      void main() {
        vec4 baseSample = texture2D(tBase, vUv) * baseScale;
        vec4 bloomSample = texture2D(tBloom, vUv) * bloomScale;
        gl_FragColor = max(baseSample + bloomSample, 0.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const maskMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: bloomFullTarget.texture },
      tMask: { value: postTargets[3].texture },
      maskStrength: { value: bloomState.maskedBloomStrength },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tColor;
      uniform sampler2D tMask;
      uniform float maskStrength;

      varying vec2 vUv;

      void main() {
        vec4 colorSample = texture2D(tColor, vUv);
        vec4 maskSample = texture2D(tMask, vUv);
        gl_FragColor = vec4(colorSample.rgb, maskSample.a * maskStrength);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const finalMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tFiltered: { value: filteredTarget.texture },
      tBloom: { value: bloomFullTarget.texture },
      tMasked: { value: maskedTarget.texture },
      finalBloomStrength: { value: bloomState.finalBloomStrength },
      maskedBloomStrength: { value: bloomState.maskedBloomStrength },
      maxOverBrighting: { value: bloomState.maxOverBrighting },
    },
    vertexShader: FULLSCREEN_VERTEX_SHADER,
    fragmentShader: `
      uniform sampler2D tFiltered;
      uniform sampler2D tBloom;
      uniform sampler2D tMasked;
      uniform float finalBloomStrength;
      uniform float maxOverBrighting;
      uniform float maskedBloomStrength;

      varying vec2 vUv;

      vec3 screenToLinear(in vec3 color) {
        return sRGBTransferEOTF(vec4(clamp(color, 0.0, 1.0), 1.0)).rgb;
      }

      void main() {
        vec4 filteredSample = texture2D(tFiltered, vUv);
        vec4 bloomSample = texture2D(tBloom, vUv);
        vec4 maskedSample = texture2D(tMasked, vUv);
        vec3 bloomContribution = bloomSample.rgb * finalBloomStrength;
        bloomContribution += maskedSample.rgb * maskedBloomStrength;
        vec3 finalScreen = clamp(filteredSample.rgb + bloomContribution, 0.0, max(1.0, maxOverBrighting));
        gl_FragColor = vec4(screenToLinear(clamp(finalScreen, 0.0, 1.0)), filteredSample.a);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const passQuad = new THREE.Mesh(postQuadGeometry, luminanceMaterial);
  passScene.add(passQuad);

  function renderFullscreen(material, target) {
    passQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, postCamera);
  }

  function resize() {
    const drawingBufferSize = renderer.getDrawingBufferSize(
      new THREE.Vector2(),
    );
    renderTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
    luminanceTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
    filteredTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
    maskedTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
    bloomFullTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
  }

  window.addEventListener("resize", resize);

  rebuildRemapLut();
  applyThresholdNormalization();
  syncFinalUniforms();

  return {
    render(scene, camera, overlay = null) {
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      if (overlay?.scene && overlay?.camera) {
        const previousAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.render(overlay.scene, overlay.camera);
        renderer.autoClear = previousAutoClear;
      }

      renderFullscreen(luminanceMaterial, luminanceTarget);
      renderFullscreen(remapMaterial, filteredTarget);

      highpassMaterial.uniforms.sampleScale.value = bloomState.bloomDownsampled
        ? 2.0
        : 1.0;
      renderFullscreen(highpassMaterial, postTargets[0]);

      let currentTarget = postTargets[0];
      for (
        let passIndex = 0;
        passIndex < bloomState.bloomPasses;
        passIndex += 1
      ) {
        box4Material.uniforms.tInput.value = currentTarget.texture;
        box4Material.uniforms.sampleScale.value = passIndex + 1;
        const nextTarget = postTargets[1 + (passIndex % 2)];
        renderFullscreen(box4Material, nextTarget);
        currentTarget = nextTarget;
      }

      combineMaterial.uniforms.tBase.value = postTargets[0].texture;
      combineMaterial.uniforms.tBloom.value = currentTarget.texture;
      renderFullscreen(combineMaterial, postTargets[3]);

      copyMaterial.uniforms.tInput.value = currentTarget.texture;
      copyMaterial.uniforms.colorMul.value.set(1, 1, 1, 1);
      renderFullscreen(copyMaterial, postTargets[4]);

      box4Material.uniforms.tInput.value = postTargets[4].texture;
      box4Material.uniforms.sampleScale.value = 1.35;
      renderFullscreen(box4Material, postTargets[5]);

      copyMaterial.uniforms.tInput.value = postTargets[5].texture;
      copyMaterial.uniforms.colorMul.value.set(1, 1, 1, 1);
      renderFullscreen(copyMaterial, bloomFullTarget);

      maskMaterial.uniforms.tColor.value = bloomFullTarget.texture;
      maskMaterial.uniforms.tMask.value = postTargets[3].texture;
      renderFullscreen(maskMaterial, maskedTarget);

      finalMaterial.uniforms.tBloom.value = bloomFullTarget.texture;
      finalMaterial.uniforms.tMasked.value = maskedTarget.texture;
      renderFullscreen(finalMaterial, null);
    },
    setStrengths({ addStrength, subStrength }) {
      if (Number.isFinite(addStrength)) {
        remapState.luminanceFilterAddIntensity = addStrength;
      }
      if (Number.isFinite(subStrength)) {
        remapState.luminanceFilterSubIntensity = subStrength;
      }
      rebuildRemapLut();
    },
    setRemap({
      luminanceFilterAddIntensity,
      luminanceFilterSubIntensity,
      globalColorAdd,
      globalColorSub,
      globalAddIntensity,
      globalSubIntensity,
    }) {
      if (Number.isFinite(luminanceFilterAddIntensity)) {
        remapState.luminanceFilterAddIntensity = luminanceFilterAddIntensity;
      }
      if (Number.isFinite(luminanceFilterSubIntensity)) {
        remapState.luminanceFilterSubIntensity = luminanceFilterSubIntensity;
      }
      if (Number.isFinite(globalAddIntensity)) {
        remapState.globalAddIntensity = globalAddIntensity;
      }
      if (Number.isFinite(globalSubIntensity)) {
        remapState.globalSubIntensity = globalSubIntensity;
      }
      if (globalColorAdd != null) {
        remapState.globalColorAdd.set(globalColorAdd);
      }
      if (globalColorSub != null) {
        remapState.globalColorSub.set(globalColorSub);
      }
      rebuildRemapLut();
    },
    setFilterTextures({
      addTexture: nextAddTexture,
      subTexture: nextSubTexture,
    }) {
      if (nextAddTexture) {
        addTexture?.dispose?.();
        addTexture = tgaLoader.load(nextAddTexture, (loadedTexture) => {
          configureRampTexture(loadedTexture);
          rebuildRemapLut();
        });
        configureRampTexture(addTexture);
      }

      if (nextSubTexture) {
        subTexture?.dispose?.();
        subTexture = tgaLoader.load(nextSubTexture, (loadedTexture) => {
          configureRampTexture(loadedTexture);
          rebuildRemapLut();
        });
        configureRampTexture(subTexture);
      }
    },
    setBloom({
      bloomTolerance,
      bloomScale,
      bloomIntensity,
      bloomColor,
      colorBloom,
      bloomPasses,
      bloomDownsampled,
      bloomFromLuminance,
      combineBaseScale,
      finalBloomStrength,
      maskedBloomStrength,
      maxOverBrighting,
    }) {
      if (Number.isFinite(bloomTolerance)) {
        bloomState.bloomTolerance = bloomTolerance;
      }
      if (Number.isFinite(bloomScale)) {
        bloomState.bloomScale = bloomScale;
      }
      if (typeof colorBloom === "boolean") {
        bloomState.colorBloom = colorBloom;
      }
      if (typeof bloomDownsampled === "boolean") {
        bloomState.bloomDownsampled = bloomDownsampled;
      }
      if (typeof bloomFromLuminance === "boolean") {
        bloomState.bloomFromLuminance = bloomFromLuminance;
      }
      if (Number.isFinite(bloomPasses)) {
        bloomState.bloomPasses = THREE.MathUtils.clamp(
          Math.round(bloomPasses),
          1,
          4,
        );
      }
      if (Number.isFinite(combineBaseScale)) {
        bloomState.combineBaseScale = combineBaseScale;
      }
      if (Number.isFinite(finalBloomStrength)) {
        bloomState.finalBloomStrength = finalBloomStrength;
      }
      if (Number.isFinite(maskedBloomStrength)) {
        bloomState.maskedBloomStrength = maskedBloomStrength;
      }
      if (Number.isFinite(maxOverBrighting)) {
        bloomState.maxOverBrighting = maxOverBrighting;
      }
      if (Number.isFinite(bloomIntensity)) {
        const clamped = THREE.MathUtils.clamp(
          bloomIntensity,
          0,
          FO2_BLOOM_INTENSITY_MAX,
        );
        bloomState.bloomIntensityDiv4 = clamped * FO2_BLOOM_INTENSITY_DIV4;
      }
      if (bloomColor != null) {
        bloomState.bloomColorPremul.set(bloomColor);
      }

      applyThresholdNormalization();
      syncFinalUniforms();
    },
    applyWeatherProfile(profile) {
      if (!profile) {
        return;
      }

      this.setRemap({
        luminanceFilterAddIntensity: profile.luminanceFilterAddIntensity,
        luminanceFilterSubIntensity: profile.luminanceFilterSubIntensity,
        globalColorAdd: vector4ToHex(profile.globalColorAdd),
        globalColorSub: vector4ToHex(profile.globalColorSub),
        globalAddIntensity: profile.globalAddIntensity,
        globalSubIntensity: profile.globalSubIntensity,
      });
      this.setBloom({
        bloomTolerance: profile.bloomTolerance,
        bloomScale: profile.bloomScale,
        bloomIntensity: profile.bloomIntensity,
        bloomColor: vector4ToHex(profile.bloomColor),
        colorBloom: profile.colorBloom,
        maxOverBrighting: profile.maxOverBrighting,
      });
    },
  };

  function applyThresholdNormalization() {
    const normalizedThreshold = bloomState.bloomTolerance;
    const normalizedScale =
      bloomState.bloomTolerance <= 1.0
        ? bloomState.bloomScale /
          Math.max(1.0 - bloomState.bloomTolerance, 1e-4)
        : bloomState.bloomScale;

    highpassMaterial.uniforms.threshold.value = normalizedThreshold;
    highpassMaterial.uniforms.intensityDiv4.value =
      bloomState.bloomIntensityDiv4 * normalizedScale;
    highpassMaterial.uniforms.colorBloom.value = bloomState.colorBloom;
    highpassMaterial.uniforms.bloomFromLuminance.value =
      bloomState.bloomFromLuminance;
  }

  function syncFinalUniforms() {
    highpassMaterial.uniforms.bloomColorPremul.value.copy(
      bloomState.bloomColorPremul,
    );
    combineMaterial.uniforms.baseScale.value = bloomState.combineBaseScale;
    maskMaterial.uniforms.maskStrength.value = bloomState.maskedBloomStrength;
    finalMaterial.uniforms.finalBloomStrength.value =
      bloomState.finalBloomStrength;
    finalMaterial.uniforms.maskedBloomStrength.value =
      bloomState.maskedBloomStrength;
    finalMaterial.uniforms.maxOverBrighting.value = bloomState.maxOverBrighting;
  }

  function rebuildRemapLut() {
    const addImage = addTexture.image;
    const subImage = subTexture.image;
    if (!addImage?.data || !subImage?.data) {
      return;
    }

    const globalAdd = remapState.globalColorAdd;
    const globalSub = remapState.globalColorSub;
    const globalOffsetR =
      globalAdd.r * remapState.globalAddIntensity -
      globalSub.r * remapState.globalSubIntensity;
    const globalOffsetG =
      globalAdd.g * remapState.globalAddIntensity -
      globalSub.g * remapState.globalSubIntensity;
    const globalOffsetB =
      globalAdd.b * remapState.globalAddIntensity -
      globalSub.b * remapState.globalSubIntensity;

    for (let index = 0; index < 256; index += 1) {
      const u = index / 255;
      const addSample = sampleRampTexture(addImage, u);
      const subSample = sampleRampTexture(subImage, u);
      const offsetR =
        (addSample[0] - 0.5) * remapState.luminanceFilterAddIntensity -
        (subSample[0] - 0.5) * remapState.luminanceFilterSubIntensity +
        globalOffsetR;
      const offsetG =
        (addSample[1] - 0.5) * remapState.luminanceFilterAddIntensity -
        (subSample[1] - 0.5) * remapState.luminanceFilterSubIntensity +
        globalOffsetG;
      const offsetB =
        (addSample[2] - 0.5) * remapState.luminanceFilterAddIntensity -
        (subSample[2] - 0.5) * remapState.luminanceFilterSubIntensity +
        globalOffsetB;
      const lutIndex = index * 4;
      remapLutData[lutIndex] = Math.round(
        THREE.MathUtils.clamp(offsetR + 0.5, 0, 1) * 255,
      );
      remapLutData[lutIndex + 1] = Math.round(
        THREE.MathUtils.clamp(offsetG + 0.5, 0, 1) * 255,
      );
      remapLutData[lutIndex + 2] = Math.round(
        THREE.MathUtils.clamp(offsetB + 0.5, 0, 1) * 255,
      );
      remapLutData[lutIndex + 3] = 255;
    }

    remapLutTexture.needsUpdate = true;
  }
}

const FULLSCREEN_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createFullscreenTarget(width, height, withDepth = false) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: withDepth,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function createPostTarget() {
  const target = createFullscreenTarget(
    FO2_POST_BUFFER_SIZE,
    FO2_POST_BUFFER_SIZE,
  );
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  return target;
}

function sampleRampTexture(image, normalizedU) {
  const width = image.width ?? 1;
  const height = image.height ?? 1;
  const x = THREE.MathUtils.clamp(
    Math.round(normalizedU * (width - 1)),
    0,
    width - 1,
  );
  const y = Math.floor(height * 0.5);
  const stride = image.data.length / (width * height);
  const pixelIndex = (y * width + x) * stride;
  const scale = 1 / 255;
  return [
    image.data[pixelIndex] * scale,
    image.data[pixelIndex + 1] * scale,
    image.data[pixelIndex + 2] * scale,
  ];
}

function configureRampTexture(texture) {
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
}

function vector4ToHex(vector) {
  if (!vector) {
    return null;
  }

  return new THREE.Color(vector.x, vector.y, vector.z).getHex();
}
