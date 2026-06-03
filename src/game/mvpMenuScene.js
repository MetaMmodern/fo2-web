import * as THREE from "three";

import {
  buildVehicleMaterialTextures,
  getCarById,
  getSkinById,
  getTrackById,
} from "./catalog.js";
import {
  createTextureRegistry,
  prepareMaterials,
  setVehicleSunVisibility,
} from "./materials.js";
import { loadMenuBgmVehicle } from "./menuBgm.js";

import menuCarShadowUrl from "url:../data/cars/shared/menu_car_shadow.png";
import tire01Url from "url:../data/cars/shared/tire_01.png";
import tire02Url from "url:../data/cars/shared/tire_02.png";
import tire03Url from "url:../data/cars/shared/tire_03.png";
import tire04Url from "url:../data/cars/shared/tire_04.png";
import tire05Url from "url:../data/cars/shared/tire_05.png";
import tire06Url from "url:../data/cars/shared/tire_06.png";
import tire07Url from "url:../data/cars/shared/tire_07.png";
import tire08Url from "url:../data/cars/shared/tire_08.png";
import tire09Url from "url:../data/cars/shared/tire_09.png";
import tire010Url from "url:../data/cars/shared/tire_010.png";
import tire011Url from "url:../data/cars/shared/tire_011.png";
import tire016Url from "url:../data/cars/shared/tire_016.png";
import bgCityUrl from "url:../data/menu/bg_city.png";
import bgForestUrl from "url:../data/menu/bg_forest.png";
import bgRacingUrl from "url:../data/menu/bg_racing.png";
import car1MenuBgmUrl from "url:../data/menu/cars/menucar_1.bgm";
import car3MenuBgmUrl from "url:../data/menu/cars/menucar_3.bgm";
import car4MenuBgmUrl from "url:../data/menu/cars/menucar_4.bgm";
import car5MenuBgmUrl from "url:../data/menu/cars/menucar_5.bgm";
import car7MenuBgmUrl from "url:../data/menu/cars/menucar_7.bgm";
import car10MenuBgmUrl from "url:../data/menu/cars/menucar_10.bgm";
import car16MenuBgmUrl from "url:../data/menu/cars/menucar_16.bgm";
import car19MenuBgmUrl from "url:../data/menu/cars/menucar_19.bgm";
import car24MenuBgmUrl from "url:../data/menu/cars/menucar_24.bgm";
import car26MenuBgmUrl from "url:../data/menu/cars/menucar_26.bgm";
import car33MenuBgmUrl from "url:../data/menu/cars/menucar_33.bgm";
import carIconsUrl from "url:../data/menu/car_icons.png";
import carIcons2Url from "url:../data/menu/car_icons_2.png";
import carLogosUrl from "url:../data/menu/car_logos.png";
import carLogos2Url from "url:../data/menu/car_logos_2.png";
import carLogos3Url from "url:../data/menu/car_logos_3.png";
import carshopBgUrl from "url:../data/menu/carshop_bg.png";
import carshopDerbyBgUrl from "url:../data/menu/carshop_derby_bg.png";
import loadingArena1Url from "url:../data/menu/loading_bg_arena1.png";
import loadingCity1aUrl from "url:../data/menu/loading_bg_city1a.png";
import loadingCity1bUrl from "url:../data/menu/loading_bg_city1b.png";
import loadingDefaultUrl from "url:../data/menu/loading_default.png";
import loadingForest1aUrl from "url:../data/menu/loading_bg_forest1a.png";
import loadingForest1cUrl from "url:../data/menu/loading_bg_forest1c.png";
import menuBackgroundUrl from "url:../data/menu/menu_background.png";
import raceSelectionBgUrl from "url:../data/menu/race_selection_bg.png";
import raceTypeImages1Url from "url:../data/menu/race_type_images1.png";
import raceTypeImages2Url from "url:../data/menu/race_type_images2.png";
import raceTypeImages3Url from "url:../data/menu/race_type_images3.png";
import singlePlayerTrackImages10Url from "url:../data/menu/single_player_track_images10.png";
import singlePlayerTrackImages16Url from "url:../data/menu/single_player_track_images16.png";
import singlePlayerTrackImages7Url from "url:../data/menu/single_player_track_images7.png";

const MENU_SCREENS = new Set([
  "resource-consent",
  "main-menu",
  "track-select",
  "car-select",
  "race-loading",
  "press-enter",
  "paused",
  "menu-loading",
]);
const MENU_CAR_AUTO_ROTATE_RADIANS_PER_SECOND = 0.10471975803375244;
const MENU_CAR_INITIAL_YAW = Math.PI * 0.5;
const MENU_CAR_SHOP_POSE = {
  position: new THREE.Vector3(0, 0, -5),
  cameraPosition: new THREE.Vector3(0, 1.8349448, 0),
  cameraTarget: new THREE.Vector3(-1.28, 0, -5),
  fovDegrees: THREE.MathUtils.radToDeg(1.350884),
};
const MENU_CAR_BGM_URLS = {
  car_1: car1MenuBgmUrl,
  car_3: car3MenuBgmUrl,
  car_4: car4MenuBgmUrl,
  car_5: car5MenuBgmUrl,
  car_7: car7MenuBgmUrl,
  car_10: car10MenuBgmUrl,
  car_16: car16MenuBgmUrl,
  car_19: car19MenuBgmUrl,
  car_24: car24MenuBgmUrl,
  car_26: car26MenuBgmUrl,
  car_33: car33MenuBgmUrl,
};
const MENU_CAR_ENVIRONMENT = {
  sunDirection: new THREE.Vector3(-0.42, 0.62, 0.66).normalize(),
  sunColor: new THREE.Color(0xfff0cf),
  sunIntensity: 1.85,
  ambientColor: new THREE.Color(0xd8d8d8),
  ambientIntensity: 1.18,
  specularColor: new THREE.Color(0xfff2d8),
  specularIntensity: 0.95,
  maxOverBrighting: 1.55,
};

export function createMvpMenuScene({
  renderer,
  tracks,
  cars,
  selection,
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 500);
  camera.position.set(0, 0, 10);
  const carCamera = new THREE.PerspectiveCamera(
    MENU_CAR_SHOP_POSE.fovDegrees,
    16 / 9,
    0.1,
    20,
  );
  carCamera.position.copy(MENU_CAR_SHOP_POSE.cameraPosition);
  carCamera.lookAt(MENU_CAR_SHOP_POSE.cameraTarget);

  const uiCanvas = document.createElement("canvas");
  uiCanvas.width = 1920;
  uiCanvas.height = 1080;
  const uiContext = uiCanvas.getContext("2d");
  const uiTexture = new THREE.CanvasTexture(uiCanvas);
  uiTexture.colorSpace = THREE.SRGBColorSpace;
  uiTexture.minFilter = THREE.LinearFilter;
  uiTexture.magFilter = THREE.LinearFilter;

  const uiMaterial = new THREE.MeshBasicMaterial({
    map: uiTexture,
    transparent: false,
    depthTest: false,
    depthWrite: false,
  });
  const uiPlane = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), uiMaterial);
  uiPlane.position.set(0, 0, -2);
  uiPlane.renderOrder = 20;
  uiPlane.layers.set(0);
  scene.add(uiPlane);

  const foregroundCanvas = document.createElement("canvas");
  foregroundCanvas.width = 1920;
  foregroundCanvas.height = 1080;
  const foregroundContext = foregroundCanvas.getContext("2d");
  const foregroundTexture = new THREE.CanvasTexture(foregroundCanvas);
  foregroundTexture.colorSpace = THREE.SRGBColorSpace;
  foregroundTexture.minFilter = THREE.LinearFilter;
  foregroundTexture.magFilter = THREE.LinearFilter;
  const foregroundMaterial = new THREE.MeshBasicMaterial({
    map: foregroundTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const foregroundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 9),
    foregroundMaterial,
  );
  foregroundPlane.position.set(0, 0, 2);
  foregroundPlane.renderOrder = 50;
  foregroundPlane.layers.set(2);
  scene.add(foregroundPlane);

  const carGroup = new THREE.Group();
  carGroup.position.copy(MENU_CAR_SHOP_POSE.position);
  carGroup.layers.set(1);
  scene.add(carGroup);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 7),
    new THREE.MeshBasicMaterial({
      color: 0x1d1c19,
      transparent: true,
      opacity: 0.72,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(2.0, -2.4, -0.3);
  floor.visible = false;
  floor.layers.set(1);
  scene.add(floor);

  const keyLight = new THREE.DirectionalLight(0xfff2d2, 3.4);
  keyLight.position.set(-2.5, 4.2, 5.4);
  keyLight.layers.enable(1);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xbccfff, 0.85);
  fillLight.position.set(5, 2.5, 3);
  fillLight.layers.enable(1);
  scene.add(fillLight);
  const ambientLight = new THREE.AmbientLight(0xd0d0d0, 1.7);
  ambientLight.layers.enable(1);
  scene.add(ambientLight);

  const carCache = new Map();
  const state = {
    active: true,
    screen: "resource-consent",
    selection: { ...selection },
    message: "",
    pauseIndex: 0,
    loadedCarId: null,
    loadingToken: 0,
  };
  const imageAssets = loadImageAssets(() => draw());

  window.addEventListener("resize", resize);
  resize();
  draw();

  function resize() {
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const menuAspect = 16 / 9;
    const halfWidth = aspect < menuAspect ? 8 : 4.5 * aspect;
    const halfHeight = aspect < menuAspect ? 8 / aspect : 4.5;

    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();

    carCamera.aspect = aspect;
    carCamera.updateProjectionMatrix();
  }

  function setState(nextState) {
    Object.assign(state, nextState);
    if (nextState.selection) {
      state.selection = { ...state.selection, ...nextState.selection };
    }
    if (Number.isFinite(nextState.pauseIndex)) {
      state.pauseIndex = nextState.pauseIndex;
    }

    state.active = MENU_SCREENS.has(state.screen);
    floor.visible = false;
    uiPlane.visible = state.active;
    foregroundPlane.visible = state.active;

    if (state.screen === "car-select") {
      ensureCarPreview();
    } else {
      carGroup.visible = false;
    }

    draw();
  }

  async function ensureCarPreview() {
    const car = getCarById(state.selection.carId);
    const skin = getSkinById(car, state.selection.skinId);

    if (!car || !skin) {
      return;
    }

    const cacheKey = `${car.id}:${skin.id}`;
    state.loadingToken += 1;
    const token = state.loadingToken;

    if (!carCache.has(cacheKey)) {
      carCache.set(cacheKey, loadMenuCar(car, skin));
    }

    const carRoot = await carCache.get(cacheKey);
    if (token !== state.loadingToken || state.screen !== "car-select") {
      return;
    }

    const resetRotation = state.loadedCarId !== car.id;
    const previewYaw = resetRotation ? MENU_CAR_INITIAL_YAW : carGroup.rotation.y;

    carGroup.clear();
    carGroup.add(carRoot);
    configureMenuCarPreview(carRoot);
    carRoot.visible = true;
    carRoot.rotation.set(0, 0, 0);
    carRoot.position.set(0, 0, 0);
    carRoot.scale.setScalar(1.18);
    carGroup.rotation.set(0, previewYaw, 0);
    carGroup.position.copy(MENU_CAR_SHOP_POSE.position);
    carGroup.visible = true;
    state.loadedCarId = car.id;
  }

  async function loadMenuCar(car, skin) {
    const bgmUrl = MENU_CAR_BGM_URLS[car.id];

    if (!bgmUrl) {
      throw new Error(`No menu BGM available for ${car.id}`);
    }

    const vehicleTextures = {
      ...buildVehicleMaterialTextures(car, skin),
      shadow: menuCarShadowUrl,
      menu_car_shadow: menuCarShadowUrl,
      tire_01: tire01Url,
      tire_02: tire02Url,
      tire_03: tire03Url,
      tire_04: tire04Url,
      tire_05: tire05Url,
      tire_06: tire06Url,
      tire_07: tire07Url,
      tire_08: tire08Url,
      tire_09: tire09Url,
      tire_010: tire010Url,
      tire_011: tire011Url,
      tire_016: tire016Url,
    };
    for (const availableSkin of car.skins) {
      const skinKey = availableSkin.id.toLowerCase();
      vehicleTextures[skinKey] = skin.texture;
    }
    const textureRegistry = createTextureRegistry(
      vehicleTextures,
      renderer.capabilities.getMaxAnisotropy(),
    );

    const carRoot = await loadMenuBgmVehicle({
      bgmUrl,
      textureRegistry,
      prepareMaterials: (root, getTexture) => {
        prepareMaterials(root, getTexture, MENU_CAR_ENVIRONMENT);
      },
    });

    setVehicleSunVisibility(carRoot, 1);
    return carRoot;
  }

  function configureMenuCarPreview(root) {
    root.traverse((node) => {
      node.renderOrder = 30;
      node.layers.set(1);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (!material) {
          return;
        }

        material.depthTest = true;
        material.depthWrite = material.transparent ? false : true;
        material.needsUpdate = true;
      });
    });
  }

  function render(deltaSeconds) {
    if (!state.active) {
      return false;
    }

    if (state.screen === "car-select" && carGroup.visible) {
      carGroup.rotation.y += deltaSeconds * MENU_CAR_AUTO_ROTATE_RADIANS_PER_SECOND;
    }

    const previousAutoClear = renderer.autoClear;
    const previousBackground = scene.background;
    renderer.autoClear = false;
    renderer.clear();

    camera.layers.set(0);
    scene.background = previousBackground;
    renderer.render(scene, camera);

    carCamera.layers.set(1);
    scene.background = null;
    renderer.render(scene, carCamera);

    camera.layers.set(2);
    renderer.clearDepth();
    renderer.render(scene, camera);

    scene.background = previousBackground;
    renderer.autoClear = previousAutoClear;
    return true;
  }

  function draw() {
    const ctx = uiContext;
    const foreground = foregroundContext;
    const track = getTrackById(state.selection.trackId);
    const car = getCarById(state.selection.carId);
    const skin = getSkinById(car, state.selection.skinId);

    ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    foreground.clearRect(0, 0, foregroundCanvas.width, foregroundCanvas.height);
    drawBackground(ctx, state.screen, state.selection, imageAssets);
    drawHazardBars(ctx);

    if (state.screen === "resource-consent") {
      drawTitle(ctx, "FLATOUT 2", "RESOURCE DOWNLOAD");
      drawCopy(ctx, 300, 410, [
        "ORIGINAL GAME RESOURCES",
        "This build may download a large resource pack.",
        "Avoid mobile internet unless that is okay.",
        "Press Enter to continue.",
      ]);
      drawFooter(ctx, "ENTER  CONTINUE");
    } else if (state.screen === "main-menu") {
      drawTitle(ctx, "FLATOUT 2", "WELCOME");
      drawCopy(ctx, 300, 470, ["START RACE"]);
      drawFooter(ctx, "ENTER  SELECT");
    } else if (state.screen === "track-select") {
      drawTitle(ctx, "SELECT RACE TYPE", track?.familyId?.toUpperCase?.() ?? "TRACK");
      drawRaceTypeHero(ctx, track, imageAssets);
      drawTrackStrip(ctx, tracks, track, imageAssets);
      drawCopy(ctx, 960, 310, [
        track?.label ?? "No track",
        "Select from currently extracted tracks.",
      ], "right");
      drawFooter(ctx, "ESC  BACK     ENTER  SELECT");
    } else if (state.screen === "car-select") {
      drawTitle(ctx, "SELECT CAR", "");
      drawCarStats(ctx, car);
      drawCarStrip(ctx, cars, car, imageAssets);
      drawCarIdentity(ctx, car, skin, imageAssets);
      drawFooter(ctx, "ARROWS  CHANGE     ENTER  SELECT     ESC  BACK");
    } else if (state.screen === "race-loading" || state.screen === "menu-loading") {
      drawTitle(ctx, "LOADING", "");
      drawLoadingBar(ctx, state.screen === "race-loading" ? 0.62 : 0.34);
      drawFooter(ctx, state.message || "LOADING");
    } else if (state.screen === "press-enter") {
      drawTitle(ctx, "READY", "");
      drawCopy(ctx, 520, 490, ["PRESS ENTER TO START"]);
      drawFooter(ctx, `${track?.label ?? "TRACK"}     ${car?.label ?? "CAR"}`);
    } else if (state.screen === "paused") {
      drawTitle(ctx, "PAUSED", "");
      drawPauseOptions(ctx, state.pauseIndex);
      drawFooter(ctx, "UP/DOWN  CHOOSE     ENTER  SELECT     ESC  RESUME");
    }

    uiTexture.needsUpdate = true;
    drawForeground(foreground, state, track, car, skin, imageAssets);
    foregroundTexture.needsUpdate = true;
  }

  return {
    setState,
    render,
    dispose() {
      window.removeEventListener("resize", resize);
      uiTexture.dispose();
      uiMaterial.dispose();
      uiPlane.geometry.dispose();
      foregroundTexture.dispose();
      foregroundMaterial.dispose();
      foregroundPlane.geometry.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      for (const carPromise of carCache.values()) {
        carPromise.then(disposeHierarchy).catch(() => {});
      }
    },
  };
}

function loadImageAssets(onLoad) {
  const definitions = {
    bgCity: bgCityUrl,
    bgForest: bgForestUrl,
    bgRacing: bgRacingUrl,
    carIcons: carIconsUrl,
    carIcons2: carIcons2Url,
    carLogos: carLogosUrl,
    carLogos2: carLogos2Url,
    carLogos3: carLogos3Url,
    carshopBg: carshopBgUrl,
    carshopDerbyBg: carshopDerbyBgUrl,
    loadingArena1: loadingArena1Url,
    loadingCity1a: loadingCity1aUrl,
    loadingCity1b: loadingCity1bUrl,
    loadingDefault: loadingDefaultUrl,
    loadingForest1a: loadingForest1aUrl,
    loadingForest1c: loadingForest1cUrl,
    menuBackground: menuBackgroundUrl,
    raceSelectionBg: raceSelectionBgUrl,
    raceTypeImages1: raceTypeImages1Url,
    raceTypeImages2: raceTypeImages2Url,
    raceTypeImages3: raceTypeImages3Url,
    trackImagesCity: singlePlayerTrackImages10Url,
    trackImagesDerby: singlePlayerTrackImages16Url,
    trackImagesForest: singlePlayerTrackImages7Url,
  };
  const assets = {};

  Object.entries(definitions).forEach(([key, url]) => {
    const image = new Image();
    image.onload = onLoad;
    image.src = url;
    assets[key] = image;
  });

  return assets;
}

function drawBackground(ctx, screen, selection, assets) {
  const background = getScreenBackground(screen, selection, assets);
  if (background?.complete && background.naturalWidth > 0) {
    drawImageCover(ctx, background, 0, 0, 1920, 1080);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
    gradient.addColorStop(0, "#050505");
    gradient.addColorStop(0.48, screen === "car-select" ? "#393832" : "#24231f");
    gradient.addColorStop(1, "#050505");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
  }

  ctx.fillStyle = screen === "car-select"
    ? "rgba(10,10,10,0.18)"
    : "rgba(0,0,0,0.42)";
  ctx.fillRect(0, 0, 1920, 1080);
}

function getScreenBackground(screen, selection, assets) {
  if (screen === "car-select") {
    return assets.carshopBg;
  }
  if (screen === "track-select") {
    const family = getTrackById(selection.trackId)?.familyId;
    if (family === "city") {
      return assets.bgCity;
    }
    if (family === "forest") {
      return assets.bgForest;
    }
    if (family === "arena" || family === "garagetest") {
      return assets.bgRacing;
    }
    return assets.raceSelectionBg;
  }
  if (screen === "race-loading") {
    return getLoadingBackground(selection.trackId, assets);
  }
  if (screen === "resource-consent" || screen === "main-menu" || screen === "menu-loading") {
    return assets.menuBackground;
  }
  if (screen === "press-enter" || screen === "paused") {
    return getLoadingBackground(selection.trackId, assets);
  }
  return assets.menuBackground;
}

function getLoadingBackground(trackId, assets) {
  const backgrounds = {
    "arena1/a": assets.loadingArena1,
    "city1/a": assets.loadingCity1a,
    "city1/b": assets.loadingCity1b,
    "forest1/a": assets.loadingForest1a,
    "forest1/c": assets.loadingForest1c,
  };

  return backgrounds[trackId] ?? assets.loadingDefault;
}

function drawForeground(ctx, state, track, car, skin, assets) {
  if (state.screen !== "car-select") {
    return;
  }

  drawHazardBars(ctx);
  drawTitle(ctx, "SELECT CAR", "");
  drawCarStats(ctx, car);
  drawCarIdentity(ctx, car, skin, assets);
  drawFooter(ctx, "ARROWS  CHANGE     ENTER  SELECT     ESC  BACK");
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) * 0.5;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) * 0.5;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawBackgroundFallbackChrome(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, "#050505");
  gradient.addColorStop(0.48, "#24231f");
  gradient.addColorStop(1, "#050505");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = -120; x < 2100; x += 250) {
    ctx.beginPath();
    ctx.moveTo(x, 170);
    ctx.lineTo(x + 190, 170);
    ctx.lineTo(x + 95, 255);
    ctx.lineTo(x - 95, 255);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHazardBars(ctx) {
  drawHazardBar(ctx, 48);
  drawHazardBar(ctx, 938);
}

function drawHazardBar(ctx, y) {
  ctx.fillStyle = "#151515";
  ctx.fillRect(130, y, 1660, 72);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(130, y, 1660, 72);

  for (let x = 150; x < 1780; x += 190) {
    const grad = ctx.createLinearGradient(x, y, x + 150, y + 72);
    grad.addColorStop(0, "#f0b500");
    grad.addColorStop(1, "#7e5300");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 115, y);
    ctx.lineTo(x + 155, y + 72);
    ctx.lineTo(x + 40, y + 72);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTitle(ctx, title, subtitle) {
  ctx.save();
  ctx.shadowColor = "black";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;
  ctx.font = "italic 700 58px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#fff8df";
  ctx.fillText(title, 155, 140);
  if (subtitle) {
    ctx.font = "italic 800 48px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#f0c21a";
    ctx.fillText(subtitle, 1220, 230);
  }
  ctx.restore();
}

function drawCopy(ctx, x, y, lines, align = "left") {
  ctx.save();
  ctx.textAlign = align;
  ctx.shadowColor = "black";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  lines.forEach((line, index) => {
    ctx.font = index === 0 ? "italic 800 50px Segoe UI, Arial, sans-serif" : "italic 700 38px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = index === 0 ? "#f0c21a" : "#fff8df";
    ctx.fillText(line, x, y + index * 58);
  });
  ctx.restore();
}

function drawFooter(ctx, text) {
  ctx.save();
  ctx.font = "italic 800 38px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff8df";
  ctx.shadowColor = "black";
  ctx.shadowBlur = 6;
  ctx.fillText(text, 960, 1018);
  ctx.restore();
}

function drawCarStats(ctx, car) {
  const labels = ["TOP SPEED", "ACCELERATION", "HANDLING", "STRENGTH", "WEIGHT", "NITRO"];
  const seed = Number.parseInt(car?.id?.replace(/\D/g, "") ?? "1", 10);

  ctx.save();
  labels.forEach((label, index) => {
    const y = 190 + index * 88;
    const value = ((seed * (index + 3)) % 82) / 10 + 1;
    ctx.font = "italic 800 42px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#fff8df";
    ctx.fillText(label, 160, y);
    ctx.fillStyle = "#f3b31b";
    ctx.beginPath();
    ctx.moveTo(165, y + 12);
    ctx.lineTo(165 + 42 + value * 34, y + 12);
    ctx.lineTo(165 + 72 + value * 34, y + 46);
    ctx.lineTo(165, y + 46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "italic 800 36px Segoe UI, Arial, sans-serif";
    ctx.fillText(value.toFixed(1), 178, y + 43);
  });
  ctx.restore();
}

function drawRaceTypeHero(ctx, track, assets) {
  const sprite = getRaceTypeSprite(track, assets);
  if (sprite?.image?.complete && sprite.image.naturalWidth > 0) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.moveTo(95, 205);
    ctx.lineTo(805, 205);
    ctx.lineTo(700, 640);
    ctx.lineTo(95, 640);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, 95, 205, 710, 468);
    ctx.restore();
  }
}

function drawTrackStrip(ctx, tracks, activeTrack, assets) {
  drawItemStrip(ctx, tracks, activeTrack, (track, active) => {
    const sprite = getTrackSprite(track, assets);
    if (sprite?.image?.complete && sprite.image.naturalWidth > 0) {
      return { type: "image", sprite, label: track.label, active };
    }
    return { type: "label", label: track.label, active };
  });
}

function drawCarStrip(ctx, cars, activeCar, assets) {
  drawItemStrip(ctx, cars, activeCar, (car, active) => {
    const sprite = getCarIconSprite(car, assets);
    if (sprite?.image?.complete && sprite.image.naturalWidth > 0) {
      return {
        type: "image",
        sprite,
        frame: getCarIconFrame(assets, active),
        label: car.label,
        active,
      };
    }
    return { type: "label", label: car.label, active };
  }, { wrap: false });
}

function drawItemStrip(ctx, items, activeItem, getContent, options = {}) {
  const wrap = options.wrap !== false;
  const center = items.findIndex((item) => item.id === activeItem?.id);
  const activeIndex = Math.max(0, center);
  const visible = [-2, -1, 0, 1, 2]
    .map((offset) => {
      const index = wrap
        ? wrapIndex(activeIndex + offset, items.length)
        : activeIndex + offset;
      return {
        item: index >= 0 && index < items.length ? items[index] : null,
        offset,
      };
    })
    .filter((entry) => entry.item);

  visible.forEach(({ item, offset }) => {
    const x = 960 + offset * 355;
    const active = item.id === activeItem?.id;
    ctx.save();
    ctx.translate(x, 800);
    const content = getContent(item, active);
    if (content.type === "image" && content.frame?.image?.complete) {
      drawSprite(ctx, content.frame, -132, -62, 264, 122);
      const box = fitRect(content.sprite.w, content.sprite.h, -100, -40, 200, 80);
      drawSprite(ctx, content.sprite, box.x, box.y, box.w, box.h);
    } else if (content.type === "image") {
      drawFallbackCard(ctx, active);
      const box = fitRect(content.sprite.w, content.sprite.h, -105, -45, 210, 88);
      drawSprite(ctx, content.sprite, box.x, box.y, box.w, box.h);
    } else {
      drawFallbackCard(ctx, active);
      ctx.fillStyle = active ? "#111" : "#fff8df";
      ctx.font = "italic 800 28px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(content.label, 0, 10);
    }
    ctx.restore();
  });
}

function drawFallbackCard(ctx, active) {
  ctx.fillStyle = active ? "#f0c21a" : "#20242a";
  ctx.strokeStyle = active ? "#fff4bb" : "#d9d9d9";
  ctx.lineWidth = active ? 8 : 5;
  ctx.beginPath();
  ctx.roundRect(-125, -58, 250, 116, 12);
  ctx.fill();
  ctx.stroke();
}

function drawSprite(ctx, sprite, x, y, width, height) {
  const scale = sprite.sourceScale ?? 1;
  ctx.drawImage(
    sprite.image,
    sprite.x * scale,
    sprite.y * scale,
    sprite.w * scale,
    sprite.h * scale,
    x,
    y,
    width,
    height,
  );
}

function getCarIconSprite(car, assets) {
  const carNumber = Number.parseInt(car?.id?.replace(/\D/g, "") ?? "", 10);
  if (!Number.isFinite(carNumber) || carNumber < 1 || carNumber > 45) {
    return null;
  }

  if (carNumber >= 28 && carNumber <= 38) {
    const index = carNumber - 28;
    return {
      image: assets.carIcons2,
      x: 3 + (index % 4) * 113,
      y: 3 + Math.floor(index / 4) * 73,
      w: 110,
      h: 70,
    };
  }

  return {
    image: assets.carIcons,
    x: ((carNumber - 1) % 6) * 79,
    y: Math.floor((carNumber - 1) / 6) * 44,
    w: 79,
    h: 44,
    sourceScale: 2,
  };
}

function getCarIconFrame(assets, active) {
  return {
    image: assets.carIcons,
    x: active ? 97 : 1,
    y: 467,
    w: 93,
    h: 43,
    sourceScale: 2,
  };
}

function getCarLogoSprite(car, assets) {
  const carNumber = Number.parseInt(car?.id?.replace(/\D/g, "") ?? "", 10);
  if (!Number.isFinite(carNumber) || carNumber < 0 || carNumber > 33) {
    return null;
  }

  if (carNumber <= 11) {
    return {
      image: assets.carLogos,
      x: (carNumber % 2) * 256,
      y: Math.floor(carNumber / 2) * 85,
      w: 256,
      h: 85,
    };
  }

  if (carNumber <= 23) {
    const index = carNumber - 12;
    return {
      image: assets.carLogos2,
      x: (index % 2) * 256,
      y: Math.floor(index / 2) * 85,
      w: 256,
      h: 85,
    };
  }

  const index = carNumber - 24;
  return {
    image: assets.carLogos3,
    x: (index % 2) * 256,
    y: Math.floor(index / 2) * 85,
    w: 256,
    h: 85,
  };
}

function drawCarIdentity(ctx, car, skin, assets) {
  ctx.save();
  ctx.textAlign = "right";
  ctx.shadowColor = "black";
  ctx.shadowBlur = 6;
  ctx.font = "italic 800 36px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#fff8df";
  ctx.fillText("DERBY CLASS", 1640, 590);

  const logo = getCarLogoSprite(car, assets);
  if (logo?.image?.complete && logo.image.naturalWidth > 0) {
    const box = fitRect(logo.w, logo.h, 1310, 608, 340, 112);
    ctx.drawImage(logo.image, logo.x, logo.y, logo.w, logo.h, box.x, box.y, box.w, box.h);
  } else {
    ctx.font = "italic 800 72px Segoe UI, Arial, sans-serif";
    ctx.fillStyle = "#f0c21a";
    ctx.fillText(car?.label?.toUpperCase?.() ?? "CAR", 1640, 675);
  }

  ctx.font = "italic 800 34px Segoe UI, Arial, sans-serif";
  ctx.fillStyle = "#fff8df";
  ctx.fillText(skin?.label?.toUpperCase?.() ?? "SKIN", 1640, 735);
  ctx.restore();
}

function fitRect(sourceWidth, sourceHeight, x, y, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;

  return {
    x: x + (width - w) * 0.5,
    y: y + (height - h) * 0.5,
    w,
    h,
  };
}

function getRaceTypeSprite(track, assets) {
  const family = track?.familyId;
  if (family === "city") {
    return { image: assets.raceTypeImages3, x: 0, y: 219, w: 332, h: 219 };
  }
  if (family === "forest") {
    return { image: assets.raceTypeImages2, x: 0, y: 219, w: 332, h: 219 };
  }
  if (family === "arena") {
    return { image: assets.raceTypeImages1, x: 0, y: 219, w: 332, h: 219 };
  }
  if (family === "garagetest") {
    return { image: assets.raceTypeImages1, x: 0, y: 0, w: 332, h: 219 };
  }
  return null;
}

function getTrackSprite(track, assets) {
  const id = track?.id;
  const sprites = {
    "city1/a": { image: assets.trackImagesCity, x: 0, y: 0, w: 332, h: 219 },
    "city1/b": { image: assets.trackImagesCity, x: 0, y: 219, w: 332, h: 219 },
    "forest1/a": { image: assets.trackImagesForest, x: 0, y: 0, w: 332, h: 219 },
    "forest1/c": { image: assets.trackImagesForest, x: 0, y: 0, w: 332, h: 219 },
    "arena1/a": { image: assets.trackImagesDerby, x: 0, y: 0, w: 332, h: 219 },
  };

  return sprites[id] ?? null;
}

function drawLoadingBar(ctx, progress) {
  ctx.fillStyle = "#050505";
  ctx.fillRect(215, 875, 1490, 24);
  ctx.fillStyle = "#f0b31b";
  ctx.fillRect(215, 875, 1490 * progress, 24);
  ctx.strokeStyle = "#342100";
  ctx.lineWidth = 4;
  ctx.strokeRect(215, 875, 1490, 24);
}

function drawPauseOptions(ctx, activeIndex) {
  ["RESUME", "EXIT RACE"].forEach((label, index) => {
    const active = index === activeIndex;
    const y = 430 + index * 95;

    ctx.save();
    ctx.fillStyle = active ? "#f0c21a" : "rgba(255,255,255,0.12)";
    ctx.strokeStyle = active ? "#fff4bb" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = active ? 6 : 3;
    ctx.beginPath();
    ctx.roundRect(610, y - 52, 700, 72, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = "italic 800 44px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = active ? "#111" : "#fff8df";
    ctx.shadowColor = active ? "transparent" : "black";
    ctx.shadowBlur = active ? 0 : 6;
    ctx.fillText(label, 960, y);
    ctx.restore();
  });
}

function wrapIndex(value, length) {
  if (length <= 0) {
    return 0;
  }

  return ((value % length) + length) % length;
}

function disposeHierarchy(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      material?.map?.dispose?.();
      material?.dispose?.();
    });
  });
}
