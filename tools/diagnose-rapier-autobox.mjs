import fs from "node:fs/promises";
import path from "node:path";
import RAPIER from "@dimforge/rapier3d-compat";

const repoRoot = process.cwd();
const FIXED_DT = 0.01;

const carId = process.argv[2] ?? "car_7";
const carNumber = Number.parseInt(carId.replace(/^car_/, ""), 10);

if (!Number.isFinite(carNumber)) {
  console.error(`Invalid car id: ${carId}`);
  process.exit(1);
}

const padded = String(carNumber).padStart(2, "0");
const enginePath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Engine",
  `RaceCar${padded}.h`,
);
const gearboxPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Gearbox",
  `RaceCar${padded}.h`,
);
const tiresPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Tires",
  `RaceCar${padded}.h`,
);
const bodyPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Body",
  `RaceCar${padded}.h`,
);
const carPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Cars/Amateur",
  `Car${padded}.h`,
);
const diffFrontPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Differential",
  "Front.h",
);
const throttleFrontPath = path.join(
  repoRoot,
  "src/data/database/flatout2.db extracted/root/Data/Parts/Differential/ThrottleCurves",
  "Front.h",
);

const [engineText, gearboxText, tiresText, bodyText, carText, diffFrontText, throttleFrontText] =
  await Promise.all([
  fs.readFile(enginePath, "utf8"),
  fs.readFile(gearboxPath, "utf8"),
  fs.readFile(tiresPath, "utf8"),
  fs.readFile(bodyPath, "utf8"),
   fs.readFile(carPath, "utf8"),
   fs.readFile(diffFrontPath, "utf8"),
   fs.readFile(throttleFrontPath, "utf8"),
 ]);

const engine = {
  idleRpm: parseFirstScalar(engineText, "IdleRpm", 1000),
  peakTorqueRpm: parseFirstScalar(engineText, "PeakTorqueRpm", 4500),
  peakTorque: parseFirstScalar(engineText, "PeakTorque", 210),
  peakPowerRpm: parseFirstScalar(engineText, "PeakPowerRpm", 6000),
  redLineRpm: parseFirstScalar(engineText, "RedLineRpm", 6500),
};
const gearbox = {
  endRatio: parseFirstScalar(gearboxText, "EndRatio", 3.7),
  reverseRatio: parseFirstScalar(gearboxText, "GearR", -4.1),
  ratios: Array.from({ length: 6 }, (_, index) =>
    parseFirstScalar(gearboxText, `Gear${index + 1}`, 0),
  ).filter((value) => Math.abs(value) > 1e-3),
};
const massKg = parseFirstScalar(carText, "Mass", 1200);
const frontTraction = parseBool(bodyText, "FrontTraction", true);
const rearTraction = parseBool(bodyText, "RearTraction", false);
const aeroDrag = parseFirstVector(bodyText, "AeroDrag", [0.3, 0.3]);
const drivenWheelRadius = averageDrivenWheelRadius({
  frontTraction,
  rearTraction,
  frontRadius: parseFirstScalar(tiresText, "FrontRadius", 0.33),
  rearRadius: parseFirstScalar(tiresText, "RearRadius", 0.34),
});
const differential = {
  maxTorque: parseFirstScalar(diffFrontText, "MaxTorque", 5500),
  throttleCurve: parseFloatArray(throttleFrontText, "Value"),
};
const shiftBands = buildShiftBands({
  gearRatios: gearbox.ratios,
  endRatio: gearbox.endRatio,
  engine,
  drivenWheelRadius,
});

console.log(`Car ${carId}`);
console.log(
  JSON.stringify(
    {
      massKg,
      engine,
      gearbox,
      frontTraction,
      rearTraction,
      drivenWheelRadius,
      aeroDrag,
      shiftBands,
    },
    null,
    2,
  ),
);

console.log("\nShift diagnostics:");
for (const [index, ratio] of gearbox.ratios.entries()) {
  const gear = index + 1;
  const speedAtPeakTorque = rpmToKph(
    engine.peakTorqueRpm,
    ratio,
    gearbox.endRatio,
    drivenWheelRadius,
  );
  const speedAtPeakPower = rpmToKph(
    engine.peakPowerRpm,
    ratio,
    gearbox.endRatio,
    drivenWheelRadius,
  );
  const speedAtRedline = rpmToKph(
    engine.redLineRpm,
    ratio,
    gearbox.endRatio,
    drivenWheelRadius,
  );
  console.log(
    `G${gear}: torque=${speedAtPeakTorque.toFixed(1)} power=${speedAtPeakPower.toFixed(
      1,
    )} redline=${speedAtRedline.toFixed(1)}`,
  );
}

console.log("\nForce crossover diagnostics:");
for (let index = 0; index < gearbox.ratios.length - 1; index += 1) {
  const currentGear = index + 1;
  const nextGear = currentGear + 1;
  const currentRatio = gearbox.ratios[index];
  const nextRatio = gearbox.ratios[index + 1];

  for (const rpm of [
    engine.peakTorqueRpm,
    engine.peakPowerRpm,
    engine.redLineRpm,
  ]) {
    const speedKph = rpmToKph(rpm, currentRatio, gearbox.endRatio, drivenWheelRadius);
    const nextRpm =
      speedToWheelOmega(speedKph, drivenWheelRadius) *
      nextRatio *
      gearbox.endRatio *
      (60 / (Math.PI * 2));
    const currentForce = wheelForceAtRpm(engine, rpm, currentRatio, gearbox.endRatio, drivenWheelRadius);
    const nextForce = wheelForceAtRpm(
      engine,
      nextRpm,
      nextRatio,
      gearbox.endRatio,
      drivenWheelRadius,
    );
    console.log(
      `G${currentGear}->G${nextGear} @ ${rpm.toFixed(0)} rpm (${speedKph.toFixed(
        1,
      )} kph): nextRpm=${nextRpm.toFixed(0)} force=${currentForce.toFixed(
        0,
      )}->${nextForce.toFixed(0)}`,
    );
  }
}

console.log("\nPure time-step simulation:");
const pureResult = simulatePureAcceleration({
  massKg,
  engine,
  gearbox,
  frontTraction,
  rearTraction,
  drivenWheelRadius,
  aeroDrag,
  differential,
});
printTimeline(pureResult.timeline);
console.log(
  `Pure final: speed=${pureResult.final.speedKph.toFixed(1)} gear=${pureResult.final.gear} rpm=${pureResult.final.rpm.toFixed(0)}`,
);

console.log("\nHeadless Rapier simulation:");
for (const preset of [
  { label: "current", frictionSlipFront: 2.1, frictionSlipRear: 2.4, sideFront: 2.1, sideRear: 1.6, mirrorZ: false, engineForceSign: -1 },
  { label: "mirrorZ", frictionSlipFront: 2.1, frictionSlipRear: 2.4, sideFront: 2.1, sideRear: 1.6, mirrorZ: true, engineForceSign: -1 },
  { label: "mirrorZ+force", frictionSlipFront: 2.1, frictionSlipRear: 2.4, sideFront: 2.1, sideRear: 1.6, mirrorZ: true, engineForceSign: 1 },
  { label: "mirrorZ+slip25", frictionSlipFront: 25, frictionSlipRear: 25, sideFront: 2.1, sideRear: 1.6, mirrorZ: true, engineForceSign: -1 },
]) {
  console.log(`\nPreset ${preset.label}:`);
  const rapierResult = await simulateRapierAcceleration({
    massKg,
    engine,
    gearbox,
    frontTraction,
    rearTraction,
    frontRadius: parseFirstScalar(tiresText, "FrontRadius", 0.33),
    rearRadius: parseFirstScalar(tiresText, "RearRadius", 0.34),
    aeroDrag,
    differential,
    ...preset,
  });
  printTimeline(rapierResult.timeline);
  console.log(
    `Rapier final: speed=${rapierResult.final.speedKph.toFixed(1)} gear=${rapierResult.final.gear} rpm=${rapierResult.final.rpm.toFixed(0)}`,
  );
}

function parseFirstScalar(text, key, fallback) {
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*[A-Za-z0-9_* ]+\\s+${key}\\s*=\\s*\\{?\\s*([-+]?\\d*\\.?\\d+)`, "m"),
  );
  return match ? Number.parseFloat(match[1]) : fallback;
}

function parseFirstVector(text, key, fallback) {
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*[A-Za-z0-9_* ]+\\s+${key}\\s*=\\s*\\{\\s*([^}]+)\\}`, "m"),
  );
  if (!match) {
    return fallback;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length >= fallback.length ? values.slice(0, fallback.length) : fallback;
}

function parseBool(text, key, fallback) {
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*bool\\s+${key}\\s*=\\s*(true|false)`, "m"),
  );
  return match ? match[1] === "true" : fallback;
}

function parseFloatArray(text, key) {
  const match = text.match(new RegExp(`${key}\\[\\]\\s*=\\s*\\{([\\s\\S]*?)\\}`, "m"));
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function averageDrivenWheelRadius({ frontTraction, rearTraction, frontRadius, rearRadius }) {
  let total = 0;
  let count = 0;
  if (frontTraction) {
    total += frontRadius * 2;
    count += 2;
  }
  if (rearTraction) {
    total += rearRadius * 2;
    count += 2;
  }
  return count > 0 ? total / count : 0.34;
}

function rpmToKph(rpm, gearRatio, endRatio, wheelRadius) {
  const wheelOmega = (rpm * Math.PI * 2) / 60;
  const speedMs =
    (wheelOmega * wheelRadius) / Math.max(Math.abs(gearRatio * endRatio), 0.1);
  return speedMs * 3.6;
}

function speedToWheelOmega(speedKph, wheelRadius) {
  return (speedKph / 3.6) / Math.max(wheelRadius, 0.1);
}

function sampleEngineTorque(engine, rpm) {
  const torqueAtPowerPeak = engine.peakTorque * 0.86;

  if (rpm <= engine.peakTorqueRpm) {
    return lerp(
      engine.peakTorque * 0.58,
      engine.peakTorque,
      inverseLerp(engine.idleRpm, engine.peakTorqueRpm, rpm),
    );
  }

  if (rpm <= engine.peakPowerRpm) {
    return lerp(
      engine.peakTorque,
      torqueAtPowerPeak,
      inverseLerp(engine.peakTorqueRpm, engine.peakPowerRpm, rpm),
    );
  }

  return lerp(
    torqueAtPowerPeak,
    engine.peakTorque * 0.38,
    inverseLerp(engine.peakPowerRpm, engine.redLineRpm, rpm),
  );
}

function wheelForceAtRpm(engine, rpm, gearRatio, endRatio, wheelRadius) {
  const torque = sampleEngineTorque(engine, rpm);
  return (torque * gearRatio * endRatio) / Math.max(wheelRadius, 0.1);
}

function inverseLerp(min, max, value) {
  if (Math.abs(max - min) < 1e-6) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function moveToward(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

function dampToward(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(rate, 0) * Math.max(dt, 0));
  return lerp(current, target, alpha);
}

function buildShiftBands({ gearRatios, endRatio, engine, drivenWheelRadius }) {
  return gearRatios.map((ratio, index) => ({
    upshiftKph: rpmToKph(engine.redLineRpm * 0.99, ratio, endRatio, drivenWheelRadius),
    downshiftKph:
      index === 0
        ? 0
        : rpmToKph(
            Math.max(engine.idleRpm * 1.8, engine.peakTorqueRpm * 0.55),
            ratio,
            endRatio,
            drivenWheelRadius,
          ),
  }));
}

function createDebugState(engine) {
  return {
    throttleAxis: 0,
    brakeAxis: 0,
    handbrakeAxis: 0,
    reverseLatched: false,
    gear: 1,
    shiftFromGear: 1,
    shiftTargetGear: 1,
    shiftTimer: 0,
    upshiftCooldown: 0,
    downshiftCooldown: 0,
    clutch: 1,
    engineRpm: engine.idleRpm,
  };
}

function updateGearboxState(debugState, config, speedForward, dt) {
  debugState.upshiftCooldown = Math.max((debugState.upshiftCooldown ?? 0) - dt, 0);
  debugState.downshiftCooldown = Math.max((debugState.downshiftCooldown ?? 0) - dt, 0);
  const idleRpm = config.engine.idleRpm;
  const speedKph = Math.abs(speedForward) * 3.6;
  const targetRpmFromSpeed = projectEngineRpmForSpeed(speedForward, debugState.gear, config);
  const freeRevTarget =
    idleRpm +
    Math.abs(debugState.throttleAxis ?? 0) * (config.engine.redLineRpm - idleRpm);

  debugState.engineRpm = dampToward(
    debugState.engineRpm ?? idleRpm,
    Math.max(targetRpmFromSpeed, freeRevTarget * 0.28, idleRpm),
    8,
    dt,
  );

  const ratios = config.gearbox.ratios;
  if (ratios.length === 0) {
    debugState.gear = 1;
    debugState.clutch = 1;
    return;
  }

  if ((debugState.shiftTimer ?? 0) > 0) {
    debugState.shiftTimer = Math.max(debugState.shiftTimer - dt, 0);
    debugState.clutch = clamp(
      1 - debugState.shiftTimer / Math.max(config.gearbox.clutchEngageTime, 0.05),
      0.2,
      1,
    );
    if (debugState.shiftTimer === 0) {
      debugState.gear = debugState.shiftTargetGear;
      debugState.clutch = 1;
    }
    return;
  }

  debugState.gear = clamp(debugState.gear <= 0 ? 1 : debugState.gear, 1, ratios.length);
  debugState.clutch = 1;
  const currentBand = config.shiftBands[debugState.gear - 1] ?? null;
  const throttleOpen = (debugState.throttleAxis ?? 0) > 0.12;

  if (
    currentBand &&
    (debugState.upshiftCooldown ?? 0) <= 0 &&
    debugState.gear < ratios.length &&
    throttleOpen &&
    speedKph >= currentBand.upshiftKph
  ) {
    startShift(debugState, debugState.gear + 1, config, "up");
    return;
  }

  if (
    currentBand &&
    (debugState.downshiftCooldown ?? 0) <= 0 &&
    debugState.gear > 1 &&
    speedKph <= currentBand.downshiftKph
  ) {
    startShift(debugState, debugState.gear - 1, config, "down");
  }
}

function startShift(debugState, nextGear, config, direction = "up") {
  if (nextGear === debugState.gear) {
    return;
  }
  debugState.shiftFromGear = debugState.gear;
  debugState.shiftTargetGear = nextGear;
  debugState.shiftTimer =
    Math.max(config.gearbox.clutchEngageTime, 0.05) +
    Math.max(config.gearbox.clutchReleaseTime, 0.05);
  debugState.clutch = 0.2;
  const cooldown =
    direction === "down"
      ? Math.max(debugState.shiftTimer, 0.35)
      : Math.max(debugState.shiftTimer, 0.75);
  if (direction === "down") {
    debugState.downshiftCooldown = cooldown;
  } else {
    debugState.upshiftCooldown = cooldown;
  }
}

function getCurrentGearRatio(debugState, config) {
  if ((debugState.gear ?? 1) < 0) {
    return Math.abs(config.gearbox.reverseRatio);
  }
  return config.gearbox.ratios[(debugState.gear ?? 1) - 1] ?? config.gearbox.ratios[0] ?? 1;
}

function sampleCurve(curve, normalized) {
  if (!Array.isArray(curve) || curve.length === 0) {
    return normalized;
  }
  const scaled = clamp(normalized, 0, 1) * (curve.length - 1);
  const lowIndex = Math.floor(scaled);
  const highIndex = Math.min(lowIndex + 1, curve.length - 1);
  const alpha = scaled - lowIndex;
  return lerp(curve[lowIndex], curve[highIndex], alpha);
}

function projectEngineRpmForGear(driveWheelOmega, gear, config) {
  const ratio =
    gear < 0
      ? Math.abs(config.gearbox.reverseRatio)
      : config.gearbox.ratios[gear - 1] ?? config.gearbox.ratios[0] ?? 1;
  return Math.abs(driveWheelOmega * ratio * config.gearbox.endRatio) * (60 / (Math.PI * 2));
}

function projectEngineRpmForSpeed(speedForward, gear, config) {
  const wheelOmega = Math.abs(speedForward) / Math.max(config.drivenWheelRadius, 0.1);
  return projectEngineRpmForGear(wheelOmega, gear, config);
}

function computeWheelEngineForce(debugState, config, throttleMagnitude) {
  const engineTorque =
    sampleEngineTorque(config.engine, debugState.engineRpm) * throttleMagnitude;
  const gearRatio = getCurrentGearRatio(debugState, config);
  const torqueScale = sampleCurve(config.differential.throttleCurve, throttleMagnitude);
  const wheelTorque =
    engineTorque *
    gearRatio *
    config.gearbox.endRatio *
    Math.max(debugState.clutch ?? 1, 0.2) *
    (0.35 + torqueScale * 0.65);
  const clampedTorque = clamp(
    wheelTorque,
    -config.differential.maxTorque,
    config.differential.maxTorque,
  );
  return clampedTorque / Math.max(config.drivenWheelRadius, 0.1);
}

function createSimConfig({
  massKg,
  engine,
  gearbox,
  drivenWheelRadius,
  aeroDrag,
  differential,
}) {
  return {
    massKg,
    engine: {
      ...engine,
      idleRpm: engine.idleRpm,
    },
    gearbox: {
      ...gearbox,
      clutchEngageTime: 0.1,
      clutchReleaseTime: 0.1,
    },
    shiftBands: buildShiftBands({
      gearRatios: gearbox.ratios,
      endRatio: gearbox.endRatio,
      engine: {
        ...engine,
        idleRpm: engine.idleRpm,
      },
      drivenWheelRadius,
    }),
    drivenWheelRadius,
    aeroDrag,
    differential,
  };
}

function simulatePureAcceleration(input) {
  const config = createSimConfig(input);
  const debugState = createDebugState(config.engine);
  let speedForward = 0;
  let time = 0;
  let nextLog = 0;
  const timeline = [];
  const drivenWheelCount = (input.frontTraction ? 2 : 0) + (input.rearTraction ? 2 : 0);

  while (time <= 20) {
    debugState.throttleAxis = moveToward(debugState.throttleAxis, 1, FIXED_DT * 3.6);
    updateGearboxState(debugState, config, speedForward, FIXED_DT);
    const wheelForce = computeWheelEngineForce(debugState, config, debugState.throttleAxis);
    const totalDriveForce = wheelForce * Math.max(drivenWheelCount, 1);
    const dragForce =
      -Math.sign(speedForward) * speedForward * speedForward * config.aeroDrag[0] * 0.8;
    const acceleration = (totalDriveForce + dragForce) / config.massKg;
    speedForward = Math.max(speedForward + acceleration * FIXED_DT, 0);

    if (time >= nextLog - 1e-6) {
      timeline.push({
        time,
        gear: debugState.gear,
        rpm: debugState.engineRpm,
        speedKph: speedForward * 3.6,
        wheelForce,
        totalDriveForce,
      });
      nextLog += 1;
    }

    time += FIXED_DT;
  }

  return {
    timeline,
    final: timeline.at(-1),
  };
}

async function simulateRapierAcceleration(input) {
  await RAPIER.init();
  const config = createSimConfig({
    ...input,
    drivenWheelRadius: averageDrivenWheelRadius({
      frontTraction: input.frontTraction,
      rearTraction: input.rearTraction,
      frontRadius: input.frontRadius,
      rearRadius: input.rearRadius,
    }),
  });
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 1, 200), groundBody);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.2, 0);
  const chassis = world.createRigidBody(bodyDesc);
  chassis.setAdditionalMass(config.massKg);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.35, 2.0), chassis);

  const controller = world.createVehicleController(chassis);
  controller.indexUpAxis = 1;
  controller.setIndexForwardAxis = 2;

  const wheelSpecs = [
    { x: -0.78, y: 0, z: input.mirrorZ ? -1.25 : 1.25, radius: input.frontRadius, driven: input.frontTraction },
    { x: 0.78, y: 0, z: input.mirrorZ ? -1.25 : 1.25, radius: input.frontRadius, driven: input.frontTraction },
    { x: -0.78, y: 0, z: input.mirrorZ ? 1.25 : -1.25, radius: input.rearRadius, driven: input.rearTraction },
    { x: 0.78, y: 0, z: input.mirrorZ ? 1.25 : -1.25, radius: input.rearRadius, driven: input.rearTraction },
  ];
  for (const wheel of wheelSpecs) {
    controller.addWheel(
      { x: wheel.x, y: wheel.y, z: wheel.z },
      { x: 0, y: -1, z: 0 },
      { x: -1, y: 0, z: 0 },
      0.2,
      wheel.radius,
    );
  }
  for (let i = 0; i < wheelSpecs.length; i += 1) {
    controller.setWheelMaxSuspensionTravel(i, 0.65);
    controller.setWheelSuspensionStiffness(i, 22);
    controller.setWheelSuspensionCompression(i, 2.4);
    controller.setWheelSuspensionRelaxation(i, 3.2);
    controller.setWheelMaxSuspensionForce(i, config.massKg * 24);
    controller.setWheelFrictionSlip(
      i,
      i < 2 ? input.frictionSlipFront : input.frictionSlipRear,
    );
    controller.setWheelSideFrictionStiffness(
      i,
      i < 2 ? input.sideFront : input.sideRear,
    );
  }

  const debugState = createDebugState(config.engine);
  let time = 0;
  let nextLog = 0;
  const timeline = [];

  while (time <= 20) {
    const linvel = chassis.linvel();
    const speedForward = linvel.z;
    debugState.throttleAxis = moveToward(debugState.throttleAxis, 1, FIXED_DT * 3.6);
    updateGearboxState(debugState, config, speedForward, FIXED_DT);

    for (let i = 0; i < wheelSpecs.length; i += 1) {
      const wheel = wheelSpecs[i];
      const wheelForce = wheel.driven
        ? computeWheelEngineForce(debugState, config, debugState.throttleAxis)
        : 0;
      controller.setWheelEngineForce(i, input.engineForceSign * wheelForce);
      controller.setWheelBrake(i, 0);
      controller.setWheelSteering(i, 0);
    }

    controller.updateVehicle(FIXED_DT);
    const afterVel = chassis.linvel();
    chassis.addForce(
      {
        x: 0,
        y: 0,
        z:
          -Math.sign(afterVel.z) *
          afterVel.z *
          afterVel.z *
          config.aeroDrag[0] *
          0.8,
      },
      true,
    );
    world.step();

    if (time >= nextLog - 1e-6) {
      timeline.push({
        time,
        gear: debugState.gear,
        rpm: debugState.engineRpm,
        speedKph: Math.abs(chassis.linvel().z) * 3.6,
        currentVehicleSpeed: Math.abs(controller.currentVehicleSpeed()) * 3.6,
        impulse: Math.abs(controller.wheelForwardImpulse(0) ?? 0),
      });
      nextLog += 1;
    }

    time += FIXED_DT;
  }

  return {
    timeline,
    final: timeline.at(-1),
  };
}

function printTimeline(timeline) {
  for (const step of timeline) {
    const extras = [];
    if (Number.isFinite(step.wheelForce)) {
      extras.push(`wf=${step.wheelForce.toFixed(0)}`);
    }
    if (Number.isFinite(step.totalDriveForce)) {
      extras.push(`tf=${step.totalDriveForce.toFixed(0)}`);
    }
    if (Number.isFinite(step.currentVehicleSpeed)) {
      extras.push(`cvs=${step.currentVehicleSpeed.toFixed(1)}`);
    }
    if (Number.isFinite(step.impulse)) {
      extras.push(`imp=${step.impulse.toFixed(0)}`);
    }
    console.log(
      `t=${step.time.toFixed(0)} gear=${step.gear} rpm=${step.rpm.toFixed(0)} speed=${step.speedKph.toFixed(1)} ${extras.join(" ")}`.trim(),
    );
  }
}
