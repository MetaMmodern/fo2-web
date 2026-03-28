import modelUrl from "../data/cars/car_1/model_assimp.glb";
import tireModelUrl from "../data/cars/shared/tire_4_out.glb";
import arenaTrackModelUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_out.fbx";
import arenaTrackLogUrl from "url:../data/tracks/arena/arena1/a/geometry/track_geom_log.txt";
import arenaTrackStartPointsUrl from "url:../data/tracks/arena/arena1/a/data/startpoints.bed";
import arenaTrackLightmapUrl from "url:../data/tracks/arena/arena1/a/lighting/lightmap1_w2.png";
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
  lightmap: arenaTrackLightmapUrl,
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
