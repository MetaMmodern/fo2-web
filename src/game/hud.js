import GUI from "lil-gui";

export function createHud(
  {
    tracks,
    cars,
    selection,
    onTrackChange,
    onCarChange,
    onSkinChange,
    cameraDebug = null,
    runtimeDebug = null,
  },
  container = document.body,
) {
  const sceneSelection = {
    trackId: selection.trackId ?? tracks[0]?.id ?? "",
    carId: selection.carId ?? cars[0]?.id ?? "",
    skinId: selection.skinId ?? "",
  };
  const telemetry = {
    speed: "0 km/h",
  };
  const perfState = {
    fps: "--",
    frame: "-- ms",
    sim: "-- ms",
    render: "-- ms",
    camera: "-- ms",
    physics: {
      mode: "--",
      grounded: "--",
      toi: "--",
      gear: "--",
      rpm: "--",
      throttle: "--",
      steer: "--",
      drive: "--",
      wheelContacts: "--",
      impulse: "--",
      suspension: "--",
      speed: "--",
      y: "--",
      vy: "--",
    },
    world: {
      enabled: "--",
      colliders: "--",
      meshes: "--",
      triangles: "--",
      dynamic: "--",
      categories: "--",
      minY: "--",
      maxY: "--",
    },
  };
  const suppressCallbacks = {
    value: false,
  };
  const perfActions = {
    copyAll: () => {
      copyTextToClipboard(formatPerfSummary(perfState));
    },
    copyPhysics: () => {
      copyTextToClipboard(formatPerfGroup("Physics", perfState.physics));
    },
    copyWorld: () => {
      copyTextToClipboard(formatPerfGroup("World", perfState.world));
    },
  };

  const mainGui = new GUI({
    autoPlace: false,
    title: "Debug HUD",
    closeFolders: false,
  });
  const perfGui = new GUI({
    autoPlace: false,
    title: "Perf HUD",
    closeFolders: false,
  });

  container.appendChild(mainGui.domElement);
  container.appendChild(perfGui.domElement);

  applyGuiChrome(mainGui, "debug-gui debug-gui-main");
  applyGuiChrome(perfGui, "debug-gui debug-gui-perf");
  mainGui.close();

  const sceneFolder = mainGui.addFolder("Scene");
  const telemetryFolder = mainGui.addFolder("Telemetry");
  const runtimeFolder = mainGui.addFolder("Runtime");
  const cameraFolder = mainGui.addFolder("Camera Debug");
  const helpFolder = mainGui.addFolder("Controls");

  const trackController = addSelectionController(
    sceneFolder,
    sceneSelection,
    "trackId",
    tracks,
    (trackId) => {
      if (!suppressCallbacks.value) {
        onTrackChange?.(trackId);
      }
    },
    "Track",
  );
  const carController = addSelectionController(
    sceneFolder,
    sceneSelection,
    "carId",
    cars,
    (carId) => {
      if (!suppressCallbacks.value) {
        onCarChange?.(carId);
      }
    },
    "Car",
  );
  const skinController = addSelectionController(
    sceneFolder,
    sceneSelection,
    "skinId",
    [],
    (skinId) => {
      if (!suppressCallbacks.value) {
        onSkinChange?.(skinId);
      }
    },
    "Skin",
  );

  const speedController = telemetryFolder
    .add(telemetry, "speed")
    .name("Speed")
    .listen();
  setReadonlyController(speedController);

  if (runtimeDebug) {
    runtimeFolder.add(runtimeDebug, "paused").name("Paused").listen();
    runtimeFolder
      .add(runtimeDebug, "autoPauseAfterLoad")
      .name("Auto pause after load");
    runtimeFolder.add(runtimeDebug, "togglePause").name("Pause/Resume sim");
    runtimeFolder
      .add(runtimeDebug, "collisionFramesVisible")
      .name("Collision frames")
      .listen();
    runtimeFolder
      .add(runtimeDebug, "toggleCollisionFrames")
      .name("Toggle collision frames");
    runtimeFolder
      .add(runtimeDebug, "renderGeometryVisible")
      .name("Render geometry")
      .listen();
    runtimeFolder
      .add(runtimeDebug, "toggleRenderGeometry")
      .name("Toggle render geometry");
  } else {
    addInfoBlock(runtimeFolder, [
      "Runtime controls unavailable for this scene.",
    ]);
  }

  const cameraControllers = [];
  if (cameraDebug) {
    cameraFolder
      .add(cameraDebug, "enableDynamics")
      .name("Enable chase dynamics");
    cameraControllers.push(
      cameraFolder
        .add(cameraDebug, "headingResponseScale", 0, 2, 0.05)
        .name("Heading response"),
    );
    cameraControllers.push(
      cameraFolder
        .add(cameraDebug, "positionResponseScale", 0, 2, 0.05)
        .name("Position response"),
    );
    cameraControllers.push(
      cameraFolder
        .add(cameraDebug, "lookResponseScale", 0, 2, 0.05)
        .name("Look response"),
    );
    cameraControllers.push(
      cameraFolder
        .add(cameraDebug, "verticalFactorScale", 0, 2, 0.05)
        .name("Vertical response"),
    );
    cameraControllers.push(
      cameraFolder
        .add(cameraDebug, "rotateFactorScale", 0, 2, 0.05)
        .name("Rotate response"),
    );
    cameraControllers.push(
      cameraFolder.add(cameraDebug, "shakeScale", 0, 2, 0.05).name("Shake scale"),
    );
    for (const controller of cameraControllers) {
      controller.listen();
    }
    addInfoBlock(cameraFolder, [
      "Code path: createChaseCamera() and resolveCarTrackerPose() in src/game/scene.js",
    ]);
  } else {
    addInfoBlock(cameraFolder, [
      "Camera debug controls unavailable for this scene.",
    ]);
  }

  addInfoBlock(helpFolder, [
    "W/S or arrows: throttle and brake",
    "A/D or arrows: steer",
    "Space: handbrake",
    "R: reset car",
    "C: cycle chase cameras",
    "`: toggle orbit debug camera",
    "Orbit: I/J/K/L move, U/O vertical",
    "Orbit: 1/2 slower or faster step",
    "Orbit: mouse wheel changes FOV",
    "Scene auto-pauses after load when enabled",
  ]);

  const perfSummaryFolder = perfGui.addFolder("Frame");
  const perfPhysicsFolder = perfGui.addFolder("Physics");
  const perfWorldFolder = perfGui.addFolder("World");
  perfGui.add(perfActions, "copyAll").name("Copy all");
  perfPhysicsFolder.add(perfActions, "copyPhysics").name("Copy physics");
  perfWorldFolder.add(perfActions, "copyWorld").name("Copy world");
  const perfControllers = {
    fps: makeReadonlyMetric(perfSummaryFolder, perfState, "fps", "FPS"),
    frame: makeReadonlyMetric(perfSummaryFolder, perfState, "frame", "Frame"),
    sim: makeReadonlyMetric(perfSummaryFolder, perfState, "sim", "Sim"),
    render: makeReadonlyMetric(perfSummaryFolder, perfState, "render", "Render"),
    camera: makeReadonlyMetric(perfSummaryFolder, perfState, "camera", "Camera"),
    physics: {
      mode: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "mode",
        "Mode",
      ),
      grounded: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "grounded",
        "Grounded",
      ),
      toi: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "toi", "TOI"),
      gear: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "gear", "Gear"),
      rpm: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "rpm", "RPM"),
      throttle: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "throttle",
        "Throttle",
      ),
      steer: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "steer", "Steer"),
      drive: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "drive", "Drive"),
      wheelContacts: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "wheelContacts",
        "Wheel contacts",
      ),
      impulse: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "impulse",
        "Impulse",
      ),
      suspension: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "suspension",
        "Suspension",
      ),
      speed: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "speed", "Speed"),
      y: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "y", "Y"),
      vy: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "vy", "VY"),
    },
    world: {
      enabled: makeReadonlyMetric(
        perfWorldFolder,
        perfState.world,
        "enabled",
        "Enabled",
      ),
      colliders: makeReadonlyMetric(
        perfWorldFolder,
        perfState.world,
        "colliders",
        "Colliders",
      ),
      meshes: makeReadonlyMetric(perfWorldFolder, perfState.world, "meshes", "Meshes"),
      triangles: makeReadonlyMetric(
        perfWorldFolder,
        perfState.world,
        "triangles",
        "Triangles",
      ),
      dynamic: makeReadonlyMetric(
        perfWorldFolder,
        perfState.world,
        "dynamic",
        "Dynamic",
      ),
      categories: makeReadonlyMetric(
        perfWorldFolder,
        perfState.world,
        "categories",
        "Categories",
      ),
      minY: makeReadonlyMetric(perfWorldFolder, perfState.world, "minY", "Min Y"),
      maxY: makeReadonlyMetric(perfWorldFolder, perfState.world, "maxY", "Max Y"),
    },
  };

  const hud = {
    root: mainGui.domElement,
    perfRoot: perfGui.domElement,
    mainGui,
    perfGui,
    state: {
      sceneSelection,
      telemetry,
      perf: perfState,
    },
    controllers: {
      track: trackController,
      car: carController,
      skin: skinController,
      speed: speedController,
      perf: perfControllers,
    },
    handles: {
      suppressCallbacks,
    },
  };

  syncHudSelection(hud, { tracks, cars, selection });
  return hud;
}

export function syncHudSelection(hud, { tracks, cars, selection }) {
  const selectedCar = cars.find((car) => car.id === selection.carId) ?? cars[0] ?? null;
  const skins = selectedCar?.skins ?? [];
  const sceneSelection = hud.state.sceneSelection;

  hud.handles.suppressCallbacks.value = true;
  updateSelectionController(hud.controllers.track, tracks, selection.trackId);
  updateSelectionController(hud.controllers.car, cars, selection.carId);
  updateSelectionController(hud.controllers.skin, skins, selection.skinId);

  sceneSelection.trackId = selection.trackId ?? tracks[0]?.id ?? "";
  sceneSelection.carId = selection.carId ?? cars[0]?.id ?? "";
  sceneSelection.skinId = selection.skinId ?? skins[0]?.id ?? "";

  refreshSelectionController(hud.controllers.track, sceneSelection.trackId);
  refreshSelectionController(hud.controllers.car, sceneSelection.carId);
  refreshSelectionController(hud.controllers.skin, sceneSelection.skinId);
  hud.handles.suppressCallbacks.value = false;
}

export function updateHudTelemetry(
  hud,
  {
    speedKph = 0,
    fps = null,
    frameMs = null,
    simMs = null,
    renderMs = null,
    chaseMs = null,
    physicsDebug = null,
    worldDebug = null,
  },
) {
  hud.state.telemetry.speed = `${Math.round(speedKph)} km/h`;
  hud.controllers.speed.updateDisplay();

  hud.state.perf.fps = Number.isFinite(fps) ? `${Math.round(fps)}` : "--";
  hud.state.perf.frame = Number.isFinite(frameMs) ? `${frameMs.toFixed(1)} ms` : "-- ms";
  hud.state.perf.sim = Number.isFinite(simMs) ? `${simMs.toFixed(1)} ms` : "-- ms";
  hud.state.perf.render = Number.isFinite(renderMs)
    ? `${renderMs.toFixed(1)} ms`
    : "-- ms";
  hud.state.perf.camera = Number.isFinite(chaseMs)
    ? `${chaseMs.toFixed(1)} ms`
    : "-- ms";
  applyPerfDebugValues(
    hud.state.perf.physics,
    parseDebugPairs(physicsDebug),
    {
      mode: "m",
      grounded: "g",
      toi: "toi",
      gear: "gear",
      rpm: "rpm",
      throttle: "thr",
      steer: "st",
      drive: "drv",
      wheelContacts: "wc",
      impulse: "imp",
      suspension: "sus",
      speed: "spd",
      y: "y",
      vy: "vy",
    },
  );
  applyPerfDebugValues(
    hud.state.perf.world,
    parseDebugPairs(worldDebug),
    {
      enabled: "on",
      colliders: "col",
      meshes: "mesh",
      triangles: "tri",
      dynamic: "dyn",
      categories: "cats",
      minY: "minY",
      maxY: "maxY",
    },
  );

  for (const controller of Object.values(hud.controllers.perf.physics)) {
    controller.updateDisplay();
  }
  for (const controller of Object.values(hud.controllers.perf.world)) {
    controller.updateDisplay();
  }
  for (const controller of [
    hud.controllers.perf.fps,
    hud.controllers.perf.frame,
    hud.controllers.perf.sim,
    hud.controllers.perf.render,
    hud.controllers.perf.camera,
  ]) {
    controller.updateDisplay();
  }
}

function addSelectionController(folder, target, key, items, onChange, name) {
  const controller = folder
    .add(target, key, buildOptionMap(items))
    .name(name)
    .onChange(onChange);
  controller.__hudSignature = buildOptionSignature(items);
  return controller;
}

function updateSelectionController(controller, items, value) {
  const nextSignature = buildOptionSignature(items);
  if (controller.__hudSignature !== nextSignature) {
    if (typeof controller.options === "function") {
      controller.options(buildOptionMap(items));
      controller.__hudSignature = nextSignature;
    }
  }

  if (value != null) {
    controller.object[controller.property] = value;
  }
}

function refreshSelectionController(controller, value) {
  if (typeof controller.setValue === "function") {
    controller.setValue(value);
    return;
  }

  controller.object[controller.property] = value;
  controller.updateDisplay();
}

function makeReadonlyMetric(gui, target, key, name) {
  const controller = gui.add(target, key).name(name).listen();
  setReadonlyController(controller);
  return controller;
}

function parseDebugPairs(debugText) {
  if (typeof debugText !== "string" || debugText.trim().length === 0) {
    return {};
  }

  return Object.fromEntries(
    debugText
      .trim()
      .split(/\s+/)
      .map((segment) => {
        const splitIndex = segment.indexOf("=");
        if (splitIndex <= 0) {
          return null;
        }

        return [
          segment.slice(0, splitIndex),
          segment.slice(splitIndex + 1),
        ];
      })
      .filter(Boolean),
  );
}

function applyPerfDebugValues(target, values, fieldMap) {
  for (const [targetKey, sourceKey] of Object.entries(fieldMap)) {
    target[targetKey] = values[sourceKey] ?? "--";
  }
}

function formatPerfSummary(perfState) {
  return [
    "Frame",
    `FPS=${perfState.fps}`,
    `Frame=${perfState.frame}`,
    `Sim=${perfState.sim}`,
    `Render=${perfState.render}`,
    `Camera=${perfState.camera}`,
    "",
    formatPerfGroup("Physics", perfState.physics),
    "",
    formatPerfGroup("World", perfState.world),
  ].join("\n");
}

function formatPerfGroup(title, values) {
  return [
    title,
    ...Object.entries(values).map(
      ([key, value]) => `${formatPerfLabel(key)}=${value}`,
    ),
  ].join("\n");
}

function formatPerfLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

async function copyTextToClipboard(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path when clipboard API access is blocked.
    }
  }

  if (typeof document === "undefined") {
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function setReadonlyController(controller) {
  if (typeof controller.disable === "function") {
    controller.disable();
    return;
  }

  controller.domElement.classList.add("is-readonly");
  const input = controller.domElement.querySelector("input, select");
  if (input) {
    input.disabled = true;
    input.tabIndex = -1;
  }
}

function buildOptionMap(items) {
  return Object.fromEntries(items.map((item) => [item.label, item.id]));
}

function buildOptionSignature(items) {
  return items.map((item) => `${item.id}:${item.label}`).join("|");
}

function applyGuiChrome(gui, className) {
  gui.domElement.className = `${gui.domElement.className} ${className}`.trim();
}

function addInfoBlock(folder, lines) {
  const block = document.createElement("div");
  block.className = "debug-gui-info";
  block.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  folder.domElement.appendChild(block);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
