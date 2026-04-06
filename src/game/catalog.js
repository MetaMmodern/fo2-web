import {
  carCatalog,
  defaultSelection,
  trackCatalog,
} from "./generated/runtimeAssetCatalog";
import { getDrivingDbConfigByCarId } from "./drivingConfigCatalog";

const carsById = new Map(carCatalog.map((car) => [car.id, car]));
const tracksById = new Map(trackCatalog.map((track) => [track.id, track]));
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
    "lights_glow.dds": car.sharedTextures.lights,
    "lights_glowlit.dds": car.sharedTextures.lights,
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
    bodyConfig: car.bodyConfig,
    tireConfig: car.tireConfig,
    drivingDb: getDrivingDbConfigByCarId(car.id),
    textureOverrides,
  };
}
