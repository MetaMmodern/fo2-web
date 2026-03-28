import * as THREE from "three";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";

export function createColorFilterPass(renderer, assetUrls) {
  const initialSize = renderer.getDrawingBufferSize(new THREE.Vector2());
  const renderTarget = new THREE.WebGLRenderTarget(initialSize.x, initialSize.y, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  if (renderer.capabilities.isWebGL2) {
    renderTarget.samples = 4;
  }
  renderTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const tgaLoader = new TGALoader();

  const addTexture = tgaLoader.load(assetUrls.addTexture);
  const subTexture = tgaLoader.load(assetUrls.subTexture);
  configureRampTexture(addTexture);
  configureRampTexture(subTexture);

  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: renderTarget.texture },
      tAdd: { value: addTexture },
      tSub: { value: subTexture },
      addStrength: { value: 0.28 },
      subStrength: { value: 0.18 },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform sampler2D tAdd;
      uniform sampler2D tSub;
      uniform float addStrength;
      uniform float subStrength;

      varying vec2 vUv;

      vec3 sampleRampOffset(in sampler2D rampTexture, in float luminance) {
        vec3 rampColor = texture2D(rampTexture, vec2(luminance, 0.5)).rgb;
        // D3D ps_1_1's _bias modifier maps 0..1 into -0.5..0.5.
        return rampColor - vec3(0.5);
      }

      float computeLuminance(in vec3 color) {
        // The original post shaders operate on the resolved screen buffer,
        // which is effectively display/gamma space rather than linear space.
        return dot(color, vec3(0.299, 0.587, 0.114));
      }

      vec3 linearToScreen(in vec3 color) {
        return sRGBTransferOETF(vec4(clamp(color, 0.0, 1.0), 1.0)).rgb;
      }

      vec3 screenToLinear(in vec3 color) {
        return sRGBTransferEOTF(vec4(clamp(color, 0.0, 1.0), 1.0)).rgb;
      }

      void main() {
        vec4 sceneLinear = texture2D(tScene, vUv);
        vec3 sceneScreen = linearToScreen(sceneLinear.rgb);
        float luminance = computeLuminance(sceneScreen);
        vec3 addOffset = sampleRampOffset(tAdd, luminance);
        vec3 subOffset = sampleRampOffset(tSub, luminance);
        vec3 remapOffset = addOffset * addStrength + subOffset * subStrength;
        vec3 filteredScreen = clamp(
          sceneScreen + remapOffset,
          0.0,
          1.0
        );
        float highlightBalance = smoothstep(0.45, 0.95, luminance);
        filteredScreen *= mix(vec3(1.0), vec3(0.90, 0.96, 1.12), highlightBalance);
        filteredScreen = clamp(filteredScreen, 0.0, 1.0);
        vec3 filteredLinear = screenToLinear(filteredScreen);
        gl_FragColor = vec4(filteredLinear, luminance);

        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
  postScene.add(postQuad);

  function resize(width, height) {
    renderer.setSize(width, height);
    const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2());
    renderTarget.setSize(drawingBufferSize.x, drawingBufferSize.y);
  }

  window.addEventListener("resize", () => {
    resize(window.innerWidth, window.innerHeight);
  });

  return {
    render(scene, camera) {
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    setStrengths({ addStrength, subStrength }) {
      if (Number.isFinite(addStrength)) {
        postMaterial.uniforms.addStrength.value = addStrength;
      }

      if (Number.isFinite(subStrength)) {
        postMaterial.uniforms.subStrength.value = subStrength;
      }
    },
  };
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
