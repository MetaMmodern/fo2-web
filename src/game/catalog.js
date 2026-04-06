import {
  carCatalog,
  defaultSelection,
  trackCatalog,
} from "./generated/runtimeAssetCatalog";
import { getDrivingDbConfigByCarId } from "./drivingConfigCatalog";
import sharedLightsGlowUrl from "url:../data/cars/shared/lights_glow.png";
import sharedLightsGlowLitUrl from "url:../data/cars/shared/lights_glowlit.png";
import car1LightsConfigUrl from "url:../data/cars/car_1/lights.ini";
import car3LightsConfigUrl from "url:../data/cars/car_3/lights.ini";
import car4LightsConfigUrl from "url:../data/cars/car_4/lights.ini";
import car5LightsConfigUrl from "url:../data/cars/car_5/lights.ini";
import car7LightsConfigUrl from "url:../data/cars/car_7/lights.ini";
import car10LightsConfigUrl from "url:../data/cars/car_10/lights.ini";
import car16LightsConfigUrl from "url:../data/cars/car_16/lights.ini";
import car19LightsConfigUrl from "url:../data/cars/car_19/lights.ini";
import car24LightsConfigUrl from "url:../data/cars/car_24/lights.ini";
import car26LightsConfigUrl from "url:../data/cars/car_26/lights.ini";
import car33LightsConfigUrl from "url:../data/cars/car_33/lights.ini";

const carsById = new Map(carCatalog.map((car) => [car.id, car]));
const tracksById = new Map(trackCatalog.map((track) => [track.id, track]));
const vehicleLightsConfigUrls = {
  car_1: car1LightsConfigUrl,
  car_3: car3LightsConfigUrl,
  car_4: car4LightsConfigUrl,
  car_5: car5LightsConfigUrl,
  car_7: car7LightsConfigUrl,
  car_10: car10LightsConfigUrl,
  car_16: car16LightsConfigUrl,
  car_19: car19LightsConfigUrl,
  car_24: car24LightsConfigUrl,
  car_26: car26LightsConfigUrl,
  car_33: car33LightsConfigUrl,
};
const legacyTireTextureIds = [
  ...Array.from({ length: 19 }, (_, index) => `tire_${String(index + 1).padStart(2, "0")}`),
  "tire_010",
  "tire_011",
  "tire_016",
];

export { carCatalog, defaultSelection, trackCatalog };

export function getCarById(carId) {
  return carsById.get(carId) ?? carCatalog[0] ?? null;
}

export function getTrackById(trackId) {
  return tracksById.get(trackId) ?? trackCatalog[0] ?? null;
}

export function getSkinById(car, skinId) {
  if (!car) {
    return null;
  }

  return (
    car.skins.find((skin) => skin.id === skinId) ??
    car.skins.find((skin) => skin.id === car.defaultSkinId) ??
    car.skins[0] ??
    null
  );
}

export function buildVehicleMaterialTextures(car, skin) {
  return {
    skin: skin.texture,
    common: car.sharedTextures.common,
    interior: car.sharedTextures.interior,
    windows: car.sharedTextures.windows,
    lights: car.sharedTextures.lights,
    lightsGlow: sharedLightsGlowUrl,
    lightsGlowLit: sharedLightsGlowLitUrl,
    shock: car.sharedTextures.shock,
    shadow: car.sharedTextures.shadow,
    tire: car.sharedTextures.tire,
  };
}

export function buildVehicleAssetUrls(car, skin) {
  const textureOverrides = {
    "common.dds": car.sharedTextures.common,
    "interior.dds": car.sharedTextures.interior,
    "windows.dds": car.sharedTextures.windows,
    "windows_damaged.dds": car.sharedTextures.windows,
    "lights.dds": car.sharedTextures.lights,
    "lights_damaged.dds": car.sharedTextures.lights,
    "lights_glow.dds": sharedLightsGlowUrl,
    "lights_glowlit.dds": sharedLightsGlowLitUrl,
    "flares.dds": car.sharedTextures.lights,
    "shock.dds": car.sharedTextures.shock,
    "shadow.dds": car.sharedTextures.shadow,
    "menu_car_shadow.dds": car.sharedTextures.shadow,
  };

  for (const availableSkin of car.skins) {
    textureOverrides[`${availableSkin.id}.dds`] = skin.texture;
    textureOverrides[`${availableSkin.id}_damaged.dds`] = skin.texture;
  }

  legacyTireTextureIds.forEach((textureId) => {
    textureOverrides[`${textureId}.dds`] = car.sharedTextures.tire;
    textureOverrides[`${textureId}.tga`] = car.sharedTextures.tire;
  });

  return {
    carModel: car.carModel,
    tireModel: car.tireModel,
    cameraConfig: car.cameraConfig,
    lightsConfig: vehicleLightsConfigUrls[car.id] ?? null,
    bodyConfig: car.bodyConfig,
    tireConfig: car.tireConfig,
    drivingDb: getDrivingDbConfigByCarId(car.id),
    textureOverrides,
  };
}
