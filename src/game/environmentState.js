import * as THREE from "three";

const DEFAULT_SUN_POSITION = new THREE.Vector3(-72, 110, -200);
const DEFAULT_SUN_COLOR = new THREE.Color(0xffe6c7);
const DEFAULT_AMBIENT_COLOR = new THREE.Color(0x414141);
const DEFAULT_SPECULAR_COLOR = new THREE.Color(0xfff3db);

export function createTrackEnvironmentState(track, renderer = null) {
  const weatherProfile = track?.environment?.weatherProfile ?? null;
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;
  const lightMap = track?.lightmap
    ? loadTrackLightMap(track.lightmap, maxAnisotropy)
    : null;
  const sunPosition = weatherProfile?.sunPosition?.clone?.() ??
    DEFAULT_SUN_POSITION.clone();
  const sunDirection = sunPosition.clone().normalize();
  const sunColor = vector4ToColor(weatherProfile?.sunColor, DEFAULT_SUN_COLOR);
  const ambientColor = vector4ToColor(
    weatherProfile?.ambientColor,
    DEFAULT_AMBIENT_COLOR,
  );
  const specularColor = vector4ToColor(
    weatherProfile?.specularColor,
    DEFAULT_SPECULAR_COLOR,
  );
  const ambientIntensity = finiteOr(weatherProfile?.ambientIntensity, 0.9);
  const sunIntensity = finiteOr(weatherProfile?.sunIntensity, 1.25);
  const specularIntensity = finiteOr(weatherProfile?.specularIntensity, 0.65);
  const maxOverBrighting = finiteOr(weatherProfile?.maxOverBrighting, 1.79);
  const backgroundColor = ambientColor
    .clone()
    .multiplyScalar(0.85)
    .lerp(sunColor.clone(), 0.28)
    .offsetHSL(0, -0.05, 0.1);

  return {
    weatherProfile,
    sunPosition,
    sunDirection,
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    specularColor,
    specularIntensity,
    maxOverBrighting,
    bloomColor: vector4ToColor(weatherProfile?.bloomColor, new THREE.Color(0x968244)),
    bloomIntensity: finiteOr(weatherProfile?.bloomIntensity, 0.78),
    bloomTolerance: finiteOr(weatherProfile?.bloomTolerance, 0.15),
    bloomScale: finiteOr(weatherProfile?.bloomScale, 2.28),
    colorBloom: Boolean(weatherProfile?.colorBloom),
    globalColorAdd: vector4ToColor(
      weatherProfile?.globalColorAdd,
      new THREE.Color(0xffffff),
    ),
    globalColorSub: vector4ToColor(
      weatherProfile?.globalColorSub,
      new THREE.Color(0xffffff),
    ),
    globalAddIntensity: finiteOr(weatherProfile?.globalAddIntensity, 0),
    globalSubIntensity: finiteOr(weatherProfile?.globalSubIntensity, 0.12),
    luminanceFilterAdd: weatherProfile?.luminanceFilterAdd ?? null,
    luminanceFilterSub: weatherProfile?.luminanceFilterSub ?? null,
    luminanceFilterAddIntensity: finiteOr(
      weatherProfile?.luminanceFilterAddIntensity,
      0.15,
    ),
    luminanceFilterSubIntensity: finiteOr(
      weatherProfile?.luminanceFilterSubIntensity,
      0.02,
    ),
    skyDomeFile: weatherProfile?.skyDomeFile ?? null,
    backgroundColor,
    trackLightMap: lightMap,
    dispose() {
      lightMap?.dispose?.();
    },
  };
}

function loadTrackLightMap(lightMapUrl, maxAnisotropy) {
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(lightMapUrl);
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

function vector4ToColor(vector, fallback) {
  if (
    !vector ||
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    return fallback.clone();
  }

  return new THREE.Color(vector.x, vector.y, vector.z);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
