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
    telemetryRecorder = null,
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
  const perfVisualState = {
    physics: {
      rpmValue: 0,
    },
  };
  const perfState = {
    fps: "--",
    frame: "-- ms",
    sim: "-- ms",
    render: "-- ms",
    renderDetail: {
      scene: "--",
      overlay: "--",
      postprocess: "--",
      calls: "--",
      triangles: "--",
      fullscreenPasses: "--",
      bloomPasses: "--",
      geometries: "--",
      textures: "--",
    },
    physics: {
      mode: "--",
      grounded: "--",
      toi: "--",
      gear: "--",
      rpm: "--",
      throttle: "--",
      steer: "--",
      steerRaw: "--",
      steerFiltered: "--",
      steerLimit: "--",
      steerTarget: "--",
      steerLeft: "--",
      steerRight: "--",
      yawRate: "--",
      pitch: "--",
      roll: "--",
      pitchRate: "--",
      rollRate: "--",
      lateralSpeed: "--",
      surfaceType: "--",
      surfaceGrip: "--",
      surfaceXFriction: "--",
      surfaceZFriction: "--",
      traction: "--",
      slipLongAvg: "--",
      slipLatAvg: "--",
      rearSlipLong: "--",
      rearWheelSpeed: "--",
      rearGroundSpeed: "--",
      drive: "--",
      wheelContacts: "--",
      impulse: "--",
      suspension: "--",
      simSteps: "--",
      simBacklog: "--",
      stepVehicle: "--",
      worldStep: "--",
      dynamicProps: "--",
      dynamicScanned: "--",
      dynamicRelease: "--",
      dynamicReleased: "--",
      dynamicNearby: "--",
      dynamicContactTests: "--",
      dynamicSync: "--",
      dynamicSyncUpdated: "--",
      dynamicSyncSkipped: "--",
      clearance: "--",
      wheelVisuals: "--",
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
  if (telemetryRecorder) {
    const recorderFolder = telemetryFolder.addFolder("Recorder");
    setReadonlyController(
      recorderFolder
        .add(telemetryRecorder.state, "status")
        .name("Status")
        .listen(),
    );
    setReadonlyController(
      recorderFolder
        .add(telemetryRecorder.state, "sampleCount")
        .name("Samples")
        .listen(),
    );
    setReadonlyController(
      recorderFolder
        .add(telemetryRecorder.state, "filename")
        .name("File")
        .listen(),
    );
    setReadonlyController(
      recorderFolder
        .add(telemetryRecorder.state, "simAttached")
        .name("Sim attached")
        .listen(),
    );
    setReadonlyController(
      recorderFolder
        .add(telemetryRecorder.state, "simLiveFrames")
        .name("Sim live frames")
        .listen(),
    );
    recorderFolder.add(telemetryRecorder, "record").name("Record");
    recorderFolder.add(telemetryRecorder, "stop").name("Stop + download");
    recorderFolder.add(telemetryRecorder, "discard").name("Discard");
  }

  if (runtimeDebug) {
    if (runtimeDebug.physicsMode && typeof runtimeDebug.setPhysicsMode === "function") {
      runtimeFolder
        .add(runtimeDebug, "physicsMode", ["Rapier", "Original JS"])
        .name("Physics mode")
        .onChange((mode) => runtimeDebug.setPhysicsMode(mode))
        .listen();
    }
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
    if (runtimeDebug.physicsIsolation) {
      const isolationFolder = runtimeFolder.addFolder("Physics isolation");
      if (
        typeof runtimeDebug.physicsAllOn === "function" &&
        typeof runtimeDebug.physicsAllOff === "function"
      ) {
        isolationFolder.add(runtimeDebug, "physicsAllOn").name("All ON");
        isolationFolder.add(runtimeDebug, "physicsAllOff").name("All OFF");
      }
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "driveForce")
        .name("Drive force")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "gearbox")
        .name("Gearbox")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "steering")
        .name("Steering")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "braking")
        .name("Braking")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "handbrake")
        .name("Handbrake")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "differentialCurve")
        .name("Diff curve")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "aeroDrag")
        .name("Aero drag")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "lateralDrag")
        .name("Lateral drag")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "downforce")
        .name("Downforce")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "uprightAssist")
        .name("Upright assist")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "gravity")
        .name("Gravity")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "staticWorld")
        .name("Static world")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "dynamicProps")
        .name("Dynamic props")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "surfaceSampler")
        .name("Surface sampler")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "clearanceGuard")
        .name("Clearance guard")
        .listen();
      isolationFolder
        .add(runtimeDebug.physicsIsolation, "wheelVisuals")
        .name("Wheel visuals")
        .listen();
    }
    if (runtimeDebug.renderIsolation) {
      const renderIsolationFolder = runtimeFolder.addFolder("Render isolation");
      if (
        typeof runtimeDebug.renderAllOn === "function" &&
        typeof runtimeDebug.renderAllOff === "function"
      ) {
        renderIsolationFolder.add(runtimeDebug, "renderAllOn").name("All ON");
        renderIsolationFolder.add(runtimeDebug, "renderAllOff").name("All OFF");
      }
      renderIsolationFolder
        .add(runtimeDebug.renderIsolation, "track")
        .name("Track")
        .listen();
      renderIsolationFolder
        .add(runtimeDebug.renderIsolation, "vehicle")
        .name("Vehicle")
        .listen();
      renderIsolationFolder
        .add(runtimeDebug.renderIsolation, "environmentOverlay")
        .name("Environment overlay")
        .listen();
      renderIsolationFolder
        .add(runtimeDebug.renderIsolation, "postprocess")
        .name("Postprocess")
        .listen();
      renderIsolationFolder
        .add(runtimeDebug.renderIsolation, "sunOcclusion")
        .name("Sun occlusion")
        .listen();
    }
  } else {
    addInfoBlock(runtimeFolder, [
      "Runtime controls unavailable for this scene.",
    ]);
  }

  addInfoBlock(helpFolder, [
    "W/S or arrows: throttle and brake",
    "A/D or arrows: steer",
    "Space: handbrake",
    "R: reset car",
    "Scene auto-pauses after load when enabled",
  ]);

  const perfSummaryFolder = perfGui.addFolder("Frame");
  const perfRenderFolder = perfGui.addFolder("Render");
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
    renderDetail: {
      scene: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "scene",
        "Scene pass",
      ),
      overlay: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "overlay",
        "Overlay",
      ),
      postprocess: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "postprocess",
        "Postprocess",
      ),
      calls: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "calls",
        "Draw calls",
      ),
      triangles: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "triangles",
        "Triangles",
      ),
      fullscreenPasses: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "fullscreenPasses",
        "Fullscreen passes",
      ),
      bloomPasses: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "bloomPasses",
        "Bloom passes",
      ),
      geometries: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "geometries",
        "Geometries",
      ),
      textures: makeReadonlyMetric(
        perfRenderFolder,
        perfState.renderDetail,
        "textures",
        "Textures",
      ),
    },
    physics: {
      speed: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "speed", "Speed"),
      gear: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "gear", "Gear"),
      rpm: makeReadonlySliderMetric(
        perfPhysicsFolder,
        perfState.physics,
        "rpm",
        "RPM",
        perfVisualState.physics,
        "rpmValue",
        0,
        9000,
        50,
      ),
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
      throttle: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "throttle",
        "Throttle",
      ),
      steer: makeReadonlyMetric(perfPhysicsFolder, perfState.physics, "steer", "Steer"),
      steerRaw: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerRaw",
        "Steer raw",
      ),
      steerFiltered: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerFiltered",
        "Steer filtered",
      ),
      steerLimit: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerLimit",
        "Steer limit",
      ),
      steerTarget: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerTarget",
        "Steer target",
      ),
      steerLeft: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerLeft",
        "Steer L deg",
      ),
      steerRight: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "steerRight",
        "Steer R deg",
      ),
      yawRate: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "yawRate",
        "Yaw deg/s",
      ),
      pitch: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "pitch",
        "Pitch deg",
      ),
      roll: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "roll",
        "Roll deg",
      ),
      pitchRate: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "pitchRate",
        "Pitch deg/s",
      ),
      rollRate: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "rollRate",
        "Roll deg/s",
      ),
      lateralSpeed: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "lateralSpeed",
        "Lat speed",
      ),
      surfaceType: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "surfaceType",
        "Surface",
      ),
      surfaceGrip: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "surfaceGrip",
        "Surface grip",
      ),
      surfaceXFriction: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "surfaceXFriction",
        "Surface X",
      ),
      surfaceZFriction: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "surfaceZFriction",
        "Surface Z",
      ),
      traction: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "traction",
        "Traction",
      ),
      slipLongAvg: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "slipLongAvg",
        "Slip long",
      ),
      slipLatAvg: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "slipLatAvg",
        "Slip lat",
      ),
      rearSlipLong: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "rearSlipLong",
        "Rear slip",
      ),
      rearWheelSpeed: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "rearWheelSpeed",
        "Rear wheel",
      ),
      rearGroundSpeed: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "rearGroundSpeed",
        "Rear ground",
      ),
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
      simSteps: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "simSteps",
        "Sim steps",
      ),
      simBacklog: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "simBacklog",
        "Sim backlog",
      ),
      stepVehicle: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "stepVehicle",
        "Step vehicle",
      ),
      worldStep: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "worldStep",
        "World step",
      ),
      dynamicProps: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicProps",
        "Dynamic props",
      ),
      dynamicRelease: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicRelease",
        "Dyn release",
      ),
      dynamicScanned: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicScanned",
        "Dyn scanned",
      ),
      dynamicReleased: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicReleased",
        "Dyn released",
      ),
      dynamicNearby: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicNearby",
        "Dyn nearby",
      ),
      dynamicContactTests: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicContactTests",
        "Dyn contacts",
      ),
      dynamicSync: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicSync",
        "Dynamic sync",
      ),
      dynamicSyncUpdated: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicSyncUpdated",
        "Dyn sync updated",
      ),
      dynamicSyncSkipped: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "dynamicSyncSkipped",
        "Dyn sync skipped",
      ),
      clearance: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "clearance",
        "Clearance",
      ),
      wheelVisuals: makeReadonlyMetric(
        perfPhysicsFolder,
        perfState.physics,
        "wheelVisuals",
        "Wheel visuals",
      ),
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
  applyMetricAccent(
    perfControllers.physics.speed,
    "hsl(0deg 78% 60%)",
    "hsla(0deg 78% 60% / 0.2)",
  );
  applyMetricAccent(
    perfControllers.physics.gear,
    "hsl(48deg 92% 62%)",
    "hsla(48deg 92% 62% / 0.2)",
  );
  applyMetricAccent(
    perfControllers.physics.rpm,
    "hsl(130deg 60% 52%)",
    "hsla(130deg 60% 52% / 0.2)",
  );

  const hud = {
    root: mainGui.domElement,
    perfRoot: perfGui.domElement,
    mainGui,
    perfGui,
    state: {
      sceneSelection,
      telemetry,
      perf: perfState,
      perfVisual: perfVisualState,
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
    renderDebug = null,
    physicsDebug = null,
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
  applyRenderDebugState(hud.state.perf.renderDetail, renderDebug);
  applyPhysicsDebugState(hud.state.perf.physics, physicsDebug);
  hud.state.perf.physics.speed = Number.isFinite(speedKph)
    ? `${Math.round(speedKph)} km/h`
    : "--";
  hud.state.perfVisual.physics.rpmValue = clampMetricValue(
    Number.parseFloat(hud.state.perf.physics.rpm),
    0,
    9000,
  );
  applyWorldDebugState(hud.state.perf.world, physicsDebug?.staticWorld);

  for (const controller of Object.values(hud.controllers.perf.physics)) {
    controller.updateDisplay();
  }
  for (const controller of Object.values(hud.controllers.perf.renderDetail)) {
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

function makeReadonlySliderMetric(
  gui,
  target,
  key,
  name,
  sliderTarget,
  sliderKey,
  min,
  max,
  step,
) {
  const controller = gui.add(sliderTarget, sliderKey, min, max, step).name(name).listen();
  controller.domElement.classList.add("debug-gui-slider-metric");
  setReadonlyController(controller, { hideInput: true });
  const slider = controller.domElement.querySelector(".slider");
  if (slider) {
    slider.setAttribute("aria-hidden", "true");
  }
  const valueLabel = document.createElement("span");
  valueLabel.className = "debug-gui-slider-value";
  controller.domElement.appendChild(valueLabel);
  const updateSliderDisplay = controller.updateDisplay.bind(controller);
  controller.updateDisplay = () => {
    updateSliderDisplay();
    valueLabel.textContent = target[key] ?? "--";
    const range = controller.domElement.querySelector(".slider");
    const minValue = Number.isFinite(min) ? min : 0;
    const maxValue = Number.isFinite(max) ? max : 1;
    const sliderValue = Number.isFinite(sliderTarget[sliderKey])
      ? sliderTarget[sliderKey]
      : minValue;
    const normalized =
      maxValue > minValue
        ? (sliderValue - minValue) / (maxValue - minValue)
        : 0;
    if (range) {
      range.style.setProperty("--slider-fill", `${clampMetricValue(normalized, 0, 1) * 100}%`);
    }
  };
  controller.updateDisplay();
  return controller;
}

function applyRenderDebugState(target, renderDebug) {
  if (!renderDebug) {
    setMissingMetrics(target);
    return;
  }

  target.scene = formatMetricMs(renderDebug.sceneMs);
  target.overlay = formatMetricMs(renderDebug.overlayMs);
  target.postprocess = formatMetricMs(renderDebug.postprocessMs);
  target.calls = formatMetricNumber(renderDebug.calls, 0);
  target.triangles = formatMetricNumber(renderDebug.triangles, 0);
  target.fullscreenPasses = formatMetricNumber(renderDebug.fullscreenPasses, 0);
  target.bloomPasses = formatMetricNumber(renderDebug.bloomPasses, 0);
  target.geometries = formatMetricNumber(renderDebug.geometries, 0);
  target.textures = formatMetricNumber(renderDebug.textures, 0);
}

function applyPhysicsDebugState(target, debugState) {
  if (!debugState) {
    setMissingMetrics(target);
    return;
  }

  target.mode = debugState.mode ?? "--";
  target.grounded = debugState.grounded ? "1" : "0";
  target.toi = formatMetricNumber(debugState.groundToi, 2);
  target.gear = formatMetricNumber(debugState.gear, 0);
  target.rpm = formatMetricNumber(debugState.engineRpm, 0);
  target.throttle = formatMetricNumber(debugState.throttle, 1);
  target.steer = formatMetricNumber(debugState.steer, 1);
  target.steerRaw = formatMetricNumber(debugState.steerRaw, 2);
  target.steerFiltered = formatMetricNumber(debugState.steerState, 2);
  target.steerLimit = formatMetricNumber(debugState.steerLimit, 2);
  target.steerTarget = formatMetricNumber(debugState.steerTarget, 2);
  target.steerLeft = formatMetricNumber(debugState.steerLeftDeg, 1);
  target.steerRight = formatMetricNumber(debugState.steerRightDeg, 1);
  target.yawRate = formatMetricNumber(debugState.yawRateDeg, 1);
  target.pitch = formatMetricNumber(debugState.pitchDeg, 1);
  target.roll = formatMetricNumber(debugState.rollDeg, 1);
  target.pitchRate = formatMetricNumber(debugState.pitchRateDeg, 1);
  target.rollRate = formatMetricNumber(debugState.rollRateDeg, 1);
  target.lateralSpeed = formatMetricNumber(debugState.speedRight, 2);
  target.surfaceType = debugState.surfaceType ?? "--";
  target.surfaceGrip = formatMetricNumber(debugState.surfaceGrip, 2);
  target.surfaceXFriction = formatMetricNumber(debugState.surfaceXFriction, 2);
  target.surfaceZFriction = formatMetricNumber(debugState.surfaceZFriction, 2);
  target.traction = debugState.traction ?? "--";
  target.slipLongAvg = formatMetricNumber(debugState.slipLongAvg, 2);
  target.slipLatAvg = formatMetricNumber(debugState.slipLatAvg, 2);
  target.rearSlipLong = formatMetricNumber(debugState.rearSlipLongAvg, 2);
  target.rearWheelSpeed = formatMetricNumber(debugState.rearWheelSpeed, 2);
  target.rearGroundSpeed = formatMetricNumber(debugState.rearGroundSpeed, 2);
  target.drive = formatMetricNumber(debugState.engineForce, 0);
  target.wheelContacts = formatMetricNumber(debugState.wheelContacts, 0);
  target.impulse = formatMetricNumber(debugState.forwardImpulse, 0);
  target.suspension = formatMetricNumber(debugState.suspensionForce, 0);
  target.simSteps = formatMetricNumber(debugState.simSteps, 0);
  target.simBacklog = formatMetricNumber(debugState.simBacklogMs, 1);
  target.y = formatMetricNumber(debugState.chassisPosition?.y, 2);
  target.vy = formatMetricNumber(debugState.chassisVelocity?.y, 2);
  target.stepVehicle = formatMetricMs(debugState.perf?.stepVehicleMs);
  target.worldStep = formatMetricMs(debugState.perf?.worldStepMs);
  target.dynamicProps = formatMetricMs(debugState.perf?.dynamicPropsMs);
  target.dynamicRelease = formatMetricMs(debugState.perf?.dynamicReleaseMs);
  target.dynamicScanned = formatMetricNumber(
    debugState.perf?.dynamicReleaseVisited,
    0,
  );
  target.dynamicReleased = formatMetricNumber(
    debugState.perf?.dynamicReleaseCount,
    0,
  );
  target.dynamicNearby = formatMetricNumber(debugState.perf?.dynamicReleaseNearby, 0);
  target.dynamicContactTests = formatMetricNumber(
    debugState.perf?.dynamicReleaseContactTests,
    0,
  );
  target.dynamicSync = formatMetricMs(debugState.perf?.dynamicSyncMs);
  target.dynamicSyncUpdated = formatMetricNumber(
    debugState.perf?.dynamicSyncUpdated,
    0,
  );
  target.dynamicSyncSkipped = formatMetricNumber(
    (debugState.perf?.dynamicSyncSkippedDormant ?? 0) +
      (debugState.perf?.dynamicSyncSkippedSleeping ?? 0),
    0,
  );
  target.clearance = formatMetricMs(debugState.perf?.clearanceMs);
  target.wheelVisuals = formatMetricMs(debugState.perf?.wheelVisualsMs);
}

function applyWorldDebugState(target, world) {
  if (!world) {
    setMissingMetrics(target);
    return;
  }

  const minY = Array.isArray(world.boundsMin) ? world.boundsMin[1] : null;
  const maxY = Array.isArray(world.boundsMax) ? world.boundsMax[1] : null;
  target.enabled = (world.runtimeEnabled ?? world.enabled) ? "1" : "0";
  target.colliders = formatMetricNumber(world.colliderCount, 0);
  target.meshes = formatMetricNumber(world.meshCount, 0);
  target.triangles = formatMetricNumber(world.triangleCount, 0);
  target.dynamic = `${world.dynamicBodyCount ?? 0}/${world.dynamicObjectCount ?? 0}`;
  target.categories = world.dynamicCategorySummary || "--";
  target.minY = formatMetricNumber(minY, 2);
  target.maxY = formatMetricNumber(maxY, 2);
}

function setMissingMetrics(target) {
  for (const key of Object.keys(target)) {
    target[key] = "--";
  }
}

function formatMetricNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatMetricMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : "-- ms";
}

function formatPerfSummary(perfState) {
  return [
    "Frame",
    `FPS=${perfState.fps}`,
    `Frame=${perfState.frame}`,
    `Sim=${perfState.sim}`,
    `Render=${perfState.render}`,
    "",
    formatPerfGroup("Render", perfState.renderDetail),
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

function setReadonlyController(controller, options = {}) {
  const { hideInput = false } = options;
  if (typeof controller.disable === "function") {
    controller.disable();
  }

  controller.domElement.classList.add("is-readonly");
  if (hideInput) {
    controller.domElement.classList.add("is-readonly-hide-input");
  }
  const inputs = controller.domElement.querySelectorAll("input, select");
  for (const input of inputs) {
    input.disabled = true;
    input.tabIndex = -1;
  }
}

function applyMetricAccent(controller, accent, accentSoft) {
  controller.domElement.classList.add("debug-gui-accent-metric");
  controller.domElement.style.setProperty("--metric-accent", accent);
  controller.domElement.style.setProperty("--metric-accent-soft", accentSoft);
}

function clampMetricValue(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
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
