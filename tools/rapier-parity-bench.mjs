#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const DEFAULT_CARS = ["car_1", "car_7", "car_10", "car_24", "car_33"];
const FIXED_DT = 1 / 120;
const DEFAULT_GRAVITY = 18;

const requestedCars = process.argv.slice(2).filter((value) => value.startsWith("car_"));
const carIds = requestedCars.length > 0 ? requestedCars : DEFAULT_CARS;

const catalogText = await fs.readFile(
  path.join(REPO_ROOT, "src/game/drivingConfigCatalog.js"),
  "utf8",
);

const reports = [];
for (const carId of carIds) {
  const dbPaths = resolveCarDbPaths(catalogText, carId);
  const [car, body, engine, gearbox, tires, diffFront, diffRear] = await Promise.all([
    parseHeaderFile(dbPaths.car),
    parseHeaderFile(dbPaths.body),
    parseHeaderFile(dbPaths.engine),
    parseHeaderFile(dbPaths.gearbox),
    parseHeaderFile(dbPaths.tires),
    parseHeaderFile(dbPaths.diffFront),
    parseHeaderFile(dbPaths.diffRear),
  ]);
  const config = normalizeCarConfig({ car, body, engine, gearbox, tires, diffFront, diffRear });
  const acceleration = runAccelerationScenario(config, 42);
  const braking = runBrakeScenario(config, acceleration.final.speedMs, acceleration.final.gear);
  const checks = evaluateChecks(config, acceleration, braking);
  reports.push({
    carId,
    name: car.Name ?? carId,
    configSummary: {
      massKg: config.massKg,
      drive: config.drive,
      gears: config.gearbox.gearRatios.length,
      redLineRpm: config.engine.redLineRpm,
      endRatio: config.gearbox.endRatio,
      drivenWheelRadius: config.drivenWheelRadius,
    },
    checks,
    shifts: acceleration.shifts,
    topSpeedKph: round(acceleration.final.speedKph, 1),
    brakeDistanceM: round(braking.distance, 1),
    timelineSample: acceleration.timeline.filter((_, index) => index % 25 === 0).slice(0, 20),
  });
}

const passed = reports.every((report) =>
  Object.values(report.checks).every((item) => item.pass),
);

for (const report of reports) {
  console.log(`\n${report.carId} (${report.name})`);
  console.log(
    `  topSpeed=${report.topSpeedKph}km/h gears=${report.configSummary.gears} drive=${report.configSummary.drive}`,
  );
  for (const [checkName, result] of Object.entries(report.checks)) {
    console.log(
      `  [${result.pass ? "PASS" : "FAIL"}] ${checkName}: ${result.detail}`,
    );
  }
}

console.log(`\nStrict bench: ${passed ? "PASS" : "FAIL"}`);
if (!passed) {
  process.exitCode = 1;
}

function resolveCarDbPaths(catalogText, carId) {
  const start = catalogText.indexOf(`${carId}: {`);
  if (start < 0) {
    throw new Error(`Missing catalog block for ${carId}`);
  }
  let depth = 0;
  let end = start;
  for (; end < catalogText.length; end += 1) {
    const char = catalogText[end];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  const block = catalogText.slice(start, end);
  const rel = (key) => {
    const match = block.match(new RegExp(`${key}:\\s*new URL\\(\\s*"([^"]+)"`, "m"));
    if (!match) {
      throw new Error(`Missing "${key}" path in catalog block for ${carId}`);
    }
    return path.join(REPO_ROOT, "src/game", match[1]);
  };
  return {
    car: rel("car"),
    body: rel("body"),
    engine: rel("engine"),
    gearbox: rel("gearbox"),
    tires: rel("tires"),
    diffFront: path.join(
      REPO_ROOT,
      "src/data/database/flatout2.db extracted/root/Data/Parts/Differential/Front.h",
    ),
    diffRear: path.join(
      REPO_ROOT,
      "src/data/database/flatout2.db extracted/root/Data/Parts/Differential/Rear.h",
    ),
  };
}

async function parseHeaderFile(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const object = {};
  const regex = /([A-Za-z0-9_* ]+?)\s+([A-Za-z0-9_]+)(\[\])?\s*=\s*([\s\S]*?);/g;
  let match = regex.exec(text);
  while (match) {
    const [, rawType, name, isArray, rawValue] = match;
    object[name] = parseHeaderValue(rawType.trim(), rawValue.trim(), Boolean(isArray));
    match = regex.exec(text);
  }
  return object;
}

function parseHeaderValue(type, rawValue, isArray) {
  if (type === "bool") {
    return rawValue === "true";
  }
  if (type === "int") {
    return Number.parseInt(rawValue, 10);
  }
  if (type === "float") {
    return isArray ? parseHeaderList(rawValue) : Number.parseFloat(rawValue);
  }
  if (type === "vec2" || type === "vec3" || type === "vec4") {
    return parseHeaderList(rawValue);
  }
  if (type === "node*" || type === "const char*" || type === "char*") {
    return rawValue.replace(/^"/, "").replace(/"$/, "");
  }
  return rawValue;
}

function parseHeaderList(rawValue) {
  return rawValue
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function normalizeCarConfig({ car, body, engine, gearbox, tires, diffFront, diffRear }) {
  const gearCount = Math.max(Math.round(readProfileScalar(gearbox.NumGears, 6)), 1);
  const gearRatios = [];
  for (let index = 1; index <= Math.min(gearCount, 6); index += 1) {
    const ratio = readProfileScalar(gearbox[`Gear${index}`], 0);
    if (Math.abs(ratio) > 1e-4) {
      gearRatios.push(ratio);
    }
  }
  const frontTraction = Boolean(body.FrontTraction);
  const rearTraction = body.RearTraction !== false;
  const frontRadius = Math.max(readProfileScalar(tires.FrontRadius, 0.34), 0.1);
  const rearRadius = Math.max(readProfileScalar(tires.RearRadius, frontRadius), 0.1);
  const drivenWheelRadius =
    frontTraction && rearTraction
      ? (frontRadius + rearRadius) * 0.5
      : frontTraction
        ? frontRadius
        : rearRadius;
  const drivenWheels = frontTraction && rearTraction ? 4 : 2;
  return {
    name: car.Name ?? "unknown",
    massKg: Math.max(readProfileScalar(car.Mass, 980), 600),
    driveForceScale: clamp(readProfileScalar(car.MassFudgeFactor, 1), 0.6, 1.6),
    drive: `${frontTraction ? "F" : ""}${rearTraction ? "R" : ""}`,
    engine: {
      idleRpm: readProfileScalar(engine.IdleRpm, 1000),
      peakTorqueRpm: readProfileScalar(engine.PeakTorqueRpm, 4500),
      peakTorque: readProfileScalar(engine.PeakTorque, 210),
      peakPowerRpm: readProfileScalar(engine.PeakPowerRpm, 6000),
      peakPower: readProfileScalar(engine.PeakPower, 120),
      redLineRpm: readProfileScalar(engine.RedLineRpm, 6500),
      launchShiftRpm: Math.max(
        readProfileScalar(engine.PeakTorqueRpm, 4500),
        readProfileScalar(engine.IdleRpm, 1000) + 1200,
      ),
      launchTargetRpm: Math.min(
        readProfileScalar(engine.RedLineRpm, 6500) * 0.94,
        Math.max(
          readProfileScalar(engine.PeakTorqueRpm, 4500) + 300,
          readProfileScalar(engine.IdleRpm, 1000) + 1600,
        ),
      ),
    },
    gearbox: {
      gearRatios,
      reverseRatio: Math.abs(readProfileScalar(gearbox.GearR, -4.1)),
      endRatio: readProfileScalar(gearbox.EndRatio, 3.7),
      clutchEngageTime: Math.max(readProfileScalar(gearbox.ClutchEngageTime, 0.1), 0.05),
      clutchReleaseTime: Math.max(readProfileScalar(gearbox.ClutchReleaseTime, 0.1), 0.05),
      clutchTorque: Math.max(readProfileScalar(gearbox.ClutchTorque, 280), 120),
    },
    tire: {
      drivenWheelRadius,
      drivenWheels,
      rollingResistance: Math.max(readProfileScalar(tires.RollingResistance, 1), 0.1) * 0.005,
      inducedDragCoeff: Math.max(readProfileScalar(tires.InducedDrag, 0), 0) * 0.2 + 0.15,
    },
    aeroDrag: readVec2(body.AeroDrag, [0.3, 0.3]),
    brake: {
      brakeTorque: Math.max(readProfileScalar(body.BrakeTorque, 5200), 1200),
      handBrakeTorque: Math.max(readProfileScalar(body.HandBrakeTorque, 5200), 1200),
      brakeBalance: clamp(readProfileScalar(body.BrakeBalance, 0.6), 0.1, 0.9),
    },
    diffFront: { maxTorque: readProfileScalar(diffFront.MaxTorque, 5500) },
    diffRear: { maxTorque: readProfileScalar(diffRear.MaxTorque, 7500) },
  };
}

function runAccelerationScenario(config, durationSeconds) {
  const state = {
    time: 0,
    speedMs: 0,
    distance: 0,
    gear: 1,
    rpm: config.engine.idleRpm,
  };
  const timeline = [];
  const shifts = [];

  while (state.time < durationSeconds) {
    stepLongitudinal(state, config, {
      throttle: 1,
      brake: 0,
      handbrake: 0,
      shifts,
    });
    timeline.push({
      t: round(state.time, 2),
      speedKph: round(state.speedMs * 3.6, 2),
      gear: state.gear,
      rpm: round(state.rpm, 0),
    });
  }

  return {
    final: {
      speedMs: state.speedMs,
      speedKph: state.speedMs * 3.6,
      gear: state.gear,
      rpm: state.rpm,
      distance: state.distance,
    },
    timeline,
    shifts,
  };
}

function runBrakeScenario(config, initialSpeedMs, initialGear) {
  const state = {
    time: 0,
    speedMs: initialSpeedMs,
    distance: 0,
    gear: Math.max(initialGear, 1),
    rpm: config.engine.redLineRpm * 0.7,
  };
  const timeline = [];

  while (state.time < 10 && state.speedMs > 0.2) {
    stepLongitudinal(state, config, {
      throttle: 0,
      brake: 1,
      handbrake: 0.2,
      shifts: null,
    });
    timeline.push({
      t: round(state.time, 2),
      speedKph: round(state.speedMs * 3.6, 2),
    });
  }

  return {
    distance: state.distance,
    duration: state.time,
    timeline,
  };
}

function stepLongitudinal(state, config, input) {
  const dt = FIXED_DT;
  const speedKph = state.speedMs * 3.6;
  const throttle = clamp(input.throttle, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const handbrake = clamp(input.handbrake, 0, 1);

  updateGearState(state, config, throttle, speedKph, input.shifts);
  const ratio = getGearRatio(state, config);
  const wheelOmega = state.speedMs / Math.max(config.tire.drivenWheelRadius, 0.1);
  const coupledRpm = Math.abs(
    wheelOmega * ratio * config.gearbox.endRatio * (60 / (Math.PI * 2)),
  );
  state.rpm = dampToward(state.rpm, Math.max(config.engine.idleRpm, coupledRpm), 8, dt);

  const torque =
    sampleEngineTorque(config.engine, state.rpm) * throttle;
  const wheelTorque =
    (Math.min(torque, config.gearbox.clutchTorque) *
      ratio *
      config.gearbox.endRatio *
      config.driveForceScale) /
    config.tire.drivenWheels;
  const maxDiffTorque = Math.min(config.diffFront.maxTorque, config.diffRear.maxTorque);
  const clampedWheelTorque = clamp(wheelTorque, -maxDiffTorque, maxDiffTorque);
  const driveForce =
    (clampedWheelTorque / Math.max(config.tire.drivenWheelRadius, 0.1)) *
    config.tire.drivenWheels;

  const brakeScale =
    (config.massKg * DEFAULT_GRAVITY * config.tire.drivenWheelRadius) /
    (4 * Math.max(config.brake.brakeTorque, 1));
  const baseBrakeForce =
    ((config.brake.brakeTorque * brakeScale) / Math.max(config.tire.drivenWheelRadius, 0.1)) *
    config.tire.drivenWheels;
  const handBrakeForce =
    ((config.brake.handBrakeTorque * brakeScale) / Math.max(config.tire.drivenWheelRadius, 0.1)) *
    2;
  const brakingForce = baseBrakeForce * brake + handBrakeForce * handbrake;

  const rollingDrag =
    state.speedMs > 0.2
      ? config.massKg * DEFAULT_GRAVITY * config.tire.rollingResistance * (1 + speedKph / 260)
      : 0;
  const aeroDrag =
    speedMsSign(state.speedMs) *
    state.speedMs *
    state.speedMs *
    (config.aeroDrag[0] * 0.8 + config.tire.inducedDragCoeff * 0.08);

  const longitudinalForce =
    driveForce -
    Math.sign(state.speedMs || 1) * brakingForce -
    Math.sign(state.speedMs || 1) * rollingDrag -
    aeroDrag;
  const acceleration = longitudinalForce / config.massKg;
  state.speedMs = Math.max(state.speedMs + acceleration * dt, 0);
  state.distance += state.speedMs * dt;
  state.time += dt;
}

function updateGearState(state, config, throttle, speedKph, shifts) {
  let nextGear = state.gear;
  const maxGear = config.gearbox.gearRatios.length;
  const currentBand = getShiftBand(state.gear, config);
  if (
    throttle > 0.16 &&
    state.gear < maxGear &&
    speedKph >= currentBand.upshiftKph * 0.985
  ) {
    nextGear += 1;
  }
  if (state.gear > 1 && speedKph < currentBand.downshiftKph * 0.94) {
    nextGear -= 1;
  }
  nextGear = clamp(nextGear, 1, maxGear);
  if (nextGear !== state.gear) {
    if (shifts) {
      shifts.push({
        from: state.gear,
        to: nextGear,
        t: round(state.time, 3),
        speedKph: round(speedKph, 2),
        rpm: round(state.rpm, 0),
      });
    }
    state.gear = nextGear;
  }
}

function getShiftBand(gear, config) {
  const ratio = config.gearbox.gearRatios[gear - 1];
  return {
    upshiftKph: rpmToKph(
      config.engine.redLineRpm * 0.985,
      ratio,
      config.gearbox.endRatio,
      config.tire.drivenWheelRadius,
    ),
    downshiftKph:
      gear === 1
        ? 0
        : rpmToKph(
            Math.max(
              config.engine.idleRpm * 1.8,
              config.engine.peakTorqueRpm * 0.55,
            ),
            ratio,
            config.gearbox.endRatio,
            config.tire.drivenWheelRadius,
          ),
  };
}

function getGearRatio(state, config) {
  if (state.gear <= 0) {
    return 0;
  }
  return config.gearbox.gearRatios[state.gear - 1] ?? config.gearbox.gearRatios[0] ?? 1;
}

function evaluateChecks(config, acceleration, braking) {
  const expectedRedline = config.engine.redLineRpm;
  const upshifts = acceleration.shifts.filter((item) => item.to > item.from && item.from > 0);
  const redlineShiftPass = upshifts.every(
    (item) => item.rpm >= expectedRedline * 0.9 && item.rpm <= expectedRedline * 1.03,
  );

  let noHuntPass = true;
  for (let index = 1; index < acceleration.shifts.length; index += 1) {
    const prev = acceleration.shifts[index - 1];
    const curr = acceleration.shifts[index];
    if (prev.from === curr.to && prev.to === curr.from && curr.t - prev.t <= 1.5) {
      noHuntPass = false;
      break;
    }
  }

  const bandPass = upshifts.every((item) => {
    const ratio = config.gearbox.gearRatios[item.from - 1];
    const redlineKph = rpmToKph(
      config.engine.redLineRpm,
      ratio,
      config.gearbox.endRatio,
      config.tire.drivenWheelRadius,
    );
    const delta = Math.abs(item.speedKph - redlineKph);
    return delta <= Math.max(redlineKph * 0.2, 10);
  });

  const monotonicPass = acceleration.timeline.every((point, index, arr) =>
    index === 0 ? true : point.speedKph >= arr[index - 1].speedKph - 0.3,
  );

  let brakeContinuityPass = true;
  for (let index = 2; index < braking.timeline.length; index += 1) {
    const a = braking.timeline[index - 2];
    const b = braking.timeline[index - 1];
    const c = braking.timeline[index];
    const dv1 = a.speedKph - b.speedKph;
    const dv2 = b.speedKph - c.speedKph;
    const jerk = Math.abs(dv2 - dv1);
    if (jerk > 6) {
      brakeContinuityPass = false;
      break;
    }
  }

  return {
    upshift_near_redline: {
      pass: redlineShiftPass,
      detail: `${upshifts.length} upshifts checked`,
    },
    no_gear_hunt: {
      pass: noHuntPass,
      detail: `shift events=${acceleration.shifts.length}`,
    },
    gear_speed_band: {
      pass: bandPass,
      detail: `upshift band tolerance <= 20%`,
    },
    monotonic_full_throttle: {
      pass: monotonicPass,
      detail: `samples=${acceleration.timeline.length}`,
    },
    brake_continuity: {
      pass: brakeContinuityPass,
      detail: `distance=${round(braking.distance, 1)}m`,
    },
  };
}

function rpmToKph(rpm, gearRatio, endRatio, wheelRadius) {
  const wheelOmega = (rpm * Math.PI * 2) / 60;
  const speedMs =
    (wheelOmega * Math.max(wheelRadius, 0.1)) /
    Math.max(Math.abs(gearRatio * endRatio), 0.1);
  return speedMs * 3.6;
}

function sampleEngineTorque(engine, rpm) {
  const idle = engine.idleRpm;
  const torquePeakRpm = engine.peakTorqueRpm;
  const powerPeakRpm = engine.peakPowerRpm;
  const redline = engine.redLineRpm;
  const peakTorque = engine.peakTorque;
  const powerPeakAngularVelocity = (Math.max(powerPeakRpm, idle) * Math.PI * 2) / 60;
  const torqueAtPowerPeak = Math.max(
    (Math.max(engine.peakPower, 1) * 1000) / Math.max(powerPeakAngularVelocity, 1e-3),
    peakTorque * 0.72,
  );
  if (rpm <= torquePeakRpm) {
    return lerp(peakTorque * 0.58, peakTorque, inverseLerp(idle, torquePeakRpm, rpm));
  }
  if (rpm <= powerPeakRpm) {
    return lerp(
      peakTorque,
      torqueAtPowerPeak,
      inverseLerp(torquePeakRpm, powerPeakRpm, rpm),
    );
  }
  return lerp(
    torqueAtPowerPeak,
    peakTorque * 0.38,
    inverseLerp(powerPeakRpm, redline, rpm),
  );
}

function readProfileScalar(value, fallback) {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? value[0] : fallback;
  }
  return Number.isFinite(value) ? value : fallback;
}

function readVec2(value, fallback) {
  if (!Array.isArray(value) || value.length < 2) {
    return fallback;
  }
  return [readProfileScalar(value[0], fallback[0]), readProfileScalar(value[1], fallback[1])];
}

function dampToward(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(rate, 0) * Math.max(dt, 0));
  return lerp(current, target, alpha);
}

function speedMsSign(value) {
  if (Math.abs(value) < 1e-5) {
    return 1;
  }
  return Math.sign(value);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function inverseLerp(a, b, value) {
  if (Math.abs(b - a) < 1e-6) {
    return 0;
  }
  return clamp((value - a) / (b - a), 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
