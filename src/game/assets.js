import modelUrl from "../data/cars/car_1/model_assimp.glb";
import tireModelUrl from "../data/cars/shared/tire_4_out.glb";
import arenaTrackModelUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_out.fbx";
import arenaTrackLogUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_log.txt";
import arenaTrackStartPointsUrl from "url:../data/tracks/arena/arena1/a/data/startpoints.bed";
import arenaTrackAtmosphereUrl from "url:../data/tracks/arena/arena1/a/data/atmosphere.ini";
import arenaTrackLightmapUrl from "url:../data/tracks/arena/arena1/a/lighting/lightmap1_w2.png";
import arenaHorizonTextureUrl from "url:../data/tracks/arena/textures/arena_one_background.png";
import arenaSkyTopTextureUrl from "url:../data/global/skybox/arena_day_u.png";
import desertAddFilterUrl from "url:../data/global/filters/desert_add.tga";
import desertSubFilterUrl from "url:../data/global/filters/desert_sub.tga";
import clearAtmosphereUrl from "url:../data/global/atmosphere/clear.ini";
import defaultCloudBottomUrl from "url:../data/global/atmosphere/default_clouds_bottom.png";
import defaultCloudTopUrl from "url:../data/global/atmosphere/default_clouds_top.png";
import arenaGlowTextureUrl from "url:../data/global/flares/day_glow.png";
import arenaFlareTextureUrl from "url:../data/global/flares/day_flares.png";
import carCameraConfigUrl from "url:../data/cars/car_1/camera.ini";
import carBodyConfigUrl from "url:../data/cars/car_1/body.ini";
import carTireConfigUrl from "url:../data/cars/car_1/tires.ini";
import skin1TextureUrl from "url:../data/cars/car_1/skin1.png";
import commonTextureUrl from "url:../data/cars/shared/common.png";
import interiorTextureUrl from "url:../data/cars/shared/interior.png";
import windowsTextureUrl from "url:../data/cars/shared/windows.png";
import lightsTextureUrl from "url:../data/cars/shared/lights.png";
import shockTextureUrl from "url:../data/cars/shared/shock.png";
import shadowTextureUrl from "url:../data/cars/shared/shadow.png";
import tireTextureUrl from "url:../data/cars/shared/tire_04.png";

export const vehicleAssetUrls = {
  carModel: modelUrl,
  tireModel: tireModelUrl,
  cameraConfig: carCameraConfigUrl,
  bodyConfig: carBodyConfigUrl,
  tireConfig: carTireConfigUrl,
  textureOverrides: {
    "skin1.dds": skin1TextureUrl,
    "common.dds": commonTextureUrl,
    "interior.dds": interiorTextureUrl,
    "windows.dds": windowsTextureUrl,
    "lights.dds": lightsTextureUrl,
    "shock.dds": shockTextureUrl,
    "shadow.dds": shadowTextureUrl,
    "tire_04.dds": tireTextureUrl,
    "tire_08.dds": tireTextureUrl,
  },
};

export const trackAssetUrls = {
  model: arenaTrackModelUrl,
  log: arenaTrackLogUrl,
  startPoints: arenaTrackStartPointsUrl,
  atmosphere: arenaTrackAtmosphereUrl,
  lightmap: arenaTrackLightmapUrl,
};

export const arenaEnvironmentAssetUrls = {
  atmosphere: arenaTrackAtmosphereUrl,
  atmospherePreset: clearAtmosphereUrl,
  horizonTexture: arenaHorizonTextureUrl,
  skyTopTexture: arenaSkyTopTextureUrl,
  filterAddTexture: desertAddFilterUrl,
  filterSubTexture: desertSubFilterUrl,
  cloudBottomTexture: defaultCloudBottomUrl,
  cloudTopTexture: defaultCloudTopUrl,
  glowTexture: arenaGlowTextureUrl,
  flareTexture: arenaFlareTextureUrl,
};

export const textureUrls = {
  skin: skin1TextureUrl,
  common: commonTextureUrl,
  interior: interiorTextureUrl,
  windows: windowsTextureUrl,
  lights: lightsTextureUrl,
  shock: shockTextureUrl,
  shadow: shadowTextureUrl,
  tire: tireTextureUrl,
};
