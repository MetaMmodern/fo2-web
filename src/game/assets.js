import modelUrl from "../data/cars/car_1/model_assimp.glb";
import tireModelUrl from "../data/cars/shared/tire_4_out.glb";
import arenaTrackModelUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_out.fbx";
import arenaTrackLogUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_log.txt";
import arenaTrackStartPointsUrl from "url:../data/tracks/arena/arena1/a/data/startpoints.bed";
import arenaTrackAtmosphereUrl from "url:../data/tracks/arena/arena1/a/data/atmosphere.ini";
import arenaTrackLightmapUrl from "url:../data/tracks/arena/arena1/a/lighting/lightmap1_w2.png";
import arenaHorizonTextureUrl from "url:../data/tracks/arena/textures/arena_one_background.png";
import arenaSkyTopTextureUrl from "url:../data/global/skybox/arena_day_u.png";
import defaultAddFilterUrl from "url:../data/global/filters/default_add.tga";
import defaultSubFilterUrl from "url:../data/global/filters/default_sub.tga";
import greyAtmosphereUrl from "url:../data/global/atmosphere/grey.ini";
import defaultCloudBottomUrl from "url:../data/global/atmosphere/default_clouds_bottom.png";
import defaultCloudTopUrl from "url:../data/global/atmosphere/default_clouds_top.png";
import dayGlowTextureUrl from "url:../data/global/flares/day_glow.png";
import dayFlareTextureUrl from "url:../data/global/flares/day_flares.png";
import dayFlareConfigUrl from "url:../data/global/flares/day.ini";
import canalDayGlowTextureUrl from "url:../data/global/flares/canalday_glow.png";
import canalDayFlareTextureUrl from "url:../data/global/flares/canalday_flares.png";
import canalDayFlareConfigUrl from "url:../data/global/flares/canalday.ini";
import eveningGlowTextureUrl from "url:../data/global/flares/evening_glow.png";
import eveningFlareTextureUrl from "url:../data/global/flares/evening_flares.png";
import eveningFlareConfigUrl from "url:../data/global/flares/sunevening.ini";
import { ARENA1_HOT_DAY_PROFILE } from "./arenaWeatherProfile";
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
  atmospherePreset: greyAtmosphereUrl,
  horizonTexture: arenaHorizonTextureUrl,
  skyTopTexture: arenaSkyTopTextureUrl,
  filterAddTexture: defaultAddFilterUrl,
  filterSubTexture: defaultSubFilterUrl,
  cloudBottomTexture: defaultCloudBottomUrl,
  cloudTopTexture: defaultCloudTopUrl,
  flareConfig: dayFlareConfigUrl,
  glowTexture: dayGlowTextureUrl,
  flareTexture: dayFlareTextureUrl,
  flareConfigByName: {
    "day.ini": dayFlareConfigUrl,
    "canalday.ini": canalDayFlareConfigUrl,
    "sunevening.ini": eveningFlareConfigUrl,
  },
  flareGlowTextureByName: {
    "day_glow.tga": dayGlowTextureUrl,
    "canalday_glow.tga": canalDayGlowTextureUrl,
    "evening_glow.tga": eveningGlowTextureUrl,
  },
  flareTextureByName: {
    "day_flares.tga": dayFlareTextureUrl,
    "canalday_flares.tga": canalDayFlareTextureUrl,
    "evening_flares.tga": eveningFlareTextureUrl,
  },
  weatherProfile: ARENA1_HOT_DAY_PROFILE,
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
