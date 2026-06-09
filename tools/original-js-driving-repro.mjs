#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as THREE from "three";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_DT = 1 / 60;
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);

installFileFetch();

const { createDrivingSimulation } = await loadOriginalPhysicsModule();
const carId = process.argv.find((arg) => /^car_\d+$/.test(arg)) ?? "car_16";

const scenarios = [
  await runScenario({
    name: "standing_donut_right",
    carId,
    duration: 6,
    sampleEvery: 0.1,
    track: createFlatTrack(),
    inputAt(time) {
      return {
        throttle: time >= 0.8 ? 1 : 0,
        brake: 0,
        handbrake: 0,
        steer: time >= 0.8 ? 1 : 0,
      };
    },
  }),
  await runScenario({
    name: "straight_brake_stop",
    carId,
    duration: 8,
    sampleEvery: 0.1,
    track: createFlatTrack(),
    inputAt(time) {
      return {
        throttle: time >= 0.5 && time < 3 ? 1 : 0,
        brake: time >= 3 ? 1 : 0,
        handbrake: 0,
        steer: 0,
      };
    },
  }),
  await runScenario({
    name: "sideways_handbrake_scrub",
    carId,
    duration: 7,
    sampleEvery: 0.1,
    track: createFlatTrack(),
    inputAt(time) {
      return {
        throttle: time >= 0.5 && time < 3.1 ? 1 : 0,
        brake: 0,
        handbrake: time >= 3.1 ? 1 : 0,
        steer: time >= 2.2 ? 1 : 0,
      };
    },
  }),
  await runScenario({
    name: "airborne_attitude",
    carId,
    duration: 5,
    sampleEvery: 0.05,
    track: createRampTrack(),
    inputAt(time) {
      return {
        throttle: time >= 0.4 ? 1 : 0,
        brake: 0,
        handbrake: 0,
        steer: 0.2,
      };
    },
  }),
];

for (const scenario of scenarios) {
  printScenarioSummary(scenario);
}

const failed = scenarios.some((scenario) => !scenario.pass);
process.exitCode = failed ? 1 : 0;

async function runScenario({ name, carId, duration, sampleEvery, track, inputAt }) {
  const carRoot = await createSyntheticCarRoot(carId);
  const input = {
    throttle: 0,
    brake: 0,
    handbrake: 0,
    steer: 0,
    resetPressed: false,
  };
  const simulation = await createDrivingSimulation({
    carId,
    carRoot,
    assetUrls: assetUrlsForCar(carId),
    input,
    dynamicObjects: [],
    trackFloorSampler: track.trackFloorSampler,
    debugOptions: { bodyContacts: false },
  });
  const samples = [];
  let nextSample = 0;

  for (let time = 0; time < duration; time += FIXED_DT) {
    Object.assign(input, inputAt(time));
    simulation.update(FIXED_DT);

    if (time + 1e-6 >= nextSample) {
      samples.push(captureSample(time, carRoot, simulation.getDebugState()));
      nextSample += sampleEvery;
    }
  }

  simulation.dispose();
  return evaluateScenario(name, samples);
}

function evaluateScenario(name, samples) {
  const maxYawRate = max(samples.map((sample) => Math.abs(sample.yawRateDeg)));
  const maxSpeed = max(samples.map((sample) => sample.speed));
  const maxRear398 = max(samples.map((sample) => sample.rear398));
  const maxRearSlip = max(samples.map((sample) => sample.rearSlip));
  const startBrake = sampleAtOrAfter(samples, 3.05);
  const end = samples[samples.length - 1];
  const airborne = samples.filter((sample) => sample.contacts === 0);
  const airbornePitchRange = range(airborne.map((sample) => sample.pitchDeg));
  const airborneRollRange = range(airborne.map((sample) => sample.rollDeg));

  let pass = true;
  const checks = [];

  if (name === "standing_donut_right") {
    checks.push(["rear398_active", maxRear398 > 0.2, `max=${round(maxRear398, 2)}`]);
    checks.push(["rear_slip_active", maxRearSlip > 0.35, `max=${round(maxRearSlip, 2)}`]);
    checks.push(["yaw_rate_builds", maxYawRate > 35, `max=${round(maxYawRate, 1)}deg/s`]);
  } else if (name === "straight_brake_stop") {
    const startSpeed = startBrake?.speed ?? 0;
    const speedDrop = startSpeed - (end?.speed ?? 0);
    checks.push(["accelerated", startSpeed > 2.5, `start=${round(startSpeed, 2)}m/s`]);
    checks.push(["brake_drops_speed", speedDrop > startSpeed * 0.55, `drop=${round(speedDrop, 2)}m/s`]);
  } else if (name === "sideways_handbrake_scrub") {
    const startSpeed = startBrake?.speed ?? 0;
    const speedDrop = startSpeed - (end?.speed ?? 0);
    checks.push(["entered_slide", maxYawRate > 20, `maxYaw=${round(maxYawRate, 1)}deg/s`]);
    checks.push(["handbrake_scrubs_speed", speedDrop > startSpeed * 0.28, `drop=${round(speedDrop, 2)}m/s`]);
  } else if (name === "airborne_attitude") {
    checks.push(["became_airborne", airborne.length > 4, `samples=${airborne.length}`]);
    checks.push([
      "attitude_changes_in_air",
      airbornePitchRange + airborneRollRange > 1.5,
      `pitchRange=${round(airbornePitchRange, 2)} rollRange=${round(airborneRollRange, 2)}`,
    ]);
  }

  for (const [, ok] of checks) {
    pass &&= ok;
  }

  return {
    name,
    pass,
    checks,
    final: end,
    maxSpeed,
    maxYawRate,
    maxRear398,
    maxRearSlip,
  };
}

function printScenarioSummary(result) {
  console.log(`\n${result.name}: ${result.pass ? "PASS" : "FAIL"}`);
  for (const [name, pass, detail] of result.checks) {
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
  }
  console.log(
    `  final speed=${round(result.final?.speed ?? 0, 2)}m/s yawRate=${round(result.final?.yawRateDeg ?? 0, 1)}deg/s rear398=${round(result.final?.rear398 ?? 0, 2)} rearSlip=${round(result.final?.rearSlip ?? 0, 2)}`,
  );
}

function captureSample(time, carRoot, debugState) {
  const orientation = orientationFromQuaternion(carRoot.quaternion);
  return {
    time,
    speed: debugState?.speedHorizontal ?? 0,
    yawRateDeg: debugState?.yawRateDeg ?? 0,
    pitchDeg: orientation.pitchDeg,
    rollDeg: orientation.rollDeg,
    contacts: debugState?.wheelContacts ?? 0,
    rear398: debugState?.rearWheel398 ?? 0,
    rearSlip: debugState?.rearSlipLongAvg ?? 0,
  };
}

function orientationFromQuaternion(quaternion) {
  const forward = LOCAL_FORWARD.clone().applyQuaternion(quaternion).normalize();
  const up = LOCAL_UP.clone().applyQuaternion(quaternion).normalize();
  return {
    pitchDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1))),
    rollDeg: THREE.MathUtils.radToDeg(Math.atan2(up.x, up.y)),
  };
}

function createFlatTrack() {
  return {
    trackFloorSampler: {
      sample(position) {
        return {
          point: new THREE.Vector3(position.x, 0, position.z),
          normal: new THREE.Vector3(0, 1, 0),
          surfaceType: "tarmac",
        };
      },
    },
  };
}

function createRampTrack() {
  return {
    trackFloorSampler: {
      sample(position) {
        if (position.z > -14 && position.z < -2) {
          const t = THREE.MathUtils.clamp((-position.z - 2) / 12, 0, 1);
          const y = t * 1.9;
          return {
            point: new THREE.Vector3(position.x, y, position.z),
            normal: new THREE.Vector3(0, 0.93, -0.37).normalize(),
            surfaceType: "tarmac",
          };
        }
        if (position.z <= -14) {
          return null;
        }
        return {
          point: new THREE.Vector3(position.x, 0, position.z),
          normal: new THREE.Vector3(0, 1, 0),
          surfaceType: "tarmac",
        };
      },
    },
  };
}

async function createSyntheticCarRoot(carId) {
  const [bodyIni, tires] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, "src/data/cars", carId, "body.ini"), "utf8"),
    parseHeaderFile(fileURLToPath(drivingDbUrlsForCar(carId).tires)),
  ]);
  const minBounds = parseIniVector(bodyIni, "CollisionFullMin") ?? [-0.9, 0.1, -2.2];
  const maxBounds = parseIniVector(bodyIni, "CollisionFullMax") ?? [0.9, 1.1, 2.2];
  const frontRadius = readProfileScalar(tires.FrontRadius, 0.32);
  const rearRadius = readProfileScalar(tires.RearRadius, frontRadius);
  const root = new THREE.Object3D();
  root.name = carId;

  const frontZ = minBounds[2] + frontRadius * 1.25;
  const rearZ = maxBounds[2] - rearRadius * 1.25;
  const leftX = minBounds[0] + Math.max(frontRadius, rearRadius) * 0.55;
  const rightX = maxBounds[0] - Math.max(frontRadius, rearRadius) * 0.55;
  addWheelAnchor(root, "placeholder_tire_fl", leftX, frontRadius, frontZ, frontRadius);
  addWheelAnchor(root, "placeholder_tire_fr", rightX, frontRadius, frontZ, frontRadius);
  addWheelAnchor(root, "placeholder_tire_rl", leftX, rearRadius, rearZ, rearRadius);
  addWheelAnchor(root, "placeholder_tire_rr", rightX, rearRadius, rearZ, rearRadius);
  return root;
}

function addWheelAnchor(root, name, x, y, z, radius) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.set(x, y, z);
  root.add(anchor);

  const tire = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 1.7, radius * 2, radius * 2),
    new THREE.MeshBasicMaterial(),
  );
  tire.name = `${name}_tire`;
  tire.position.copy(anchor.position);
  root.add(tire);
}

function assetUrlsForCar(carId) {
  return {
    bodyConfig: pathToFileURL(path.join(REPO_ROOT, "src/data/cars", carId, "body.ini")).href,
    tireConfig: pathToFileURL(path.join(REPO_ROOT, "src/data/cars", carId, "tires.ini")).href,
    drivingDb: drivingDbUrlsForCar(carId),
  };
}

async function loadOriginalPhysicsModule() {
  const cacheDir = path.join(REPO_ROOT, ".cache/headless-original-js");
  await fs.mkdir(cacheDir, { recursive: true });
  const drivingConfigText = await fs.readFile(
    path.join(REPO_ROOT, "src/game/drivingConfig.js"),
    "utf8",
  );
  let physicsText = await fs.readFile(
    path.join(REPO_ROOT, "src/game/physics.js"),
    "utf8",
  );
  physicsText = physicsText.replace(
    'import { loadDrivingConfig } from "./drivingConfig";',
    'import { loadDrivingConfig } from "./drivingConfig.mjs";',
  );
  await Promise.all([
    fs.writeFile(path.join(cacheDir, "drivingConfig.mjs"), drivingConfigText),
    fs.writeFile(path.join(cacheDir, "physics.mjs"), physicsText),
  ]);
  return import(`${pathToFileURL(path.join(cacheDir, "physics.mjs")).href}?t=${Date.now()}`);
}

function drivingDbUrlsForCar(carId) {
  const padded = carId === "car_10" ? "10" : String(Number(carId.replace(/^car_/, ""))).padStart(2, "0");
  const carFile = carId === "car_10" ? "Car10Bonus.h" : `Car${padded}.h`;
  const db = (...parts) =>
    pathToFileURL(path.join(REPO_ROOT, "src/data/database/flatout2.db extracted/root/Data", ...parts)).href;
  return {
    steeringPc: db("Physics/Car/Steering_PC.h"),
    tireDynamics: {
      tarmac: db("Physics/TireDynamics/Tarmac.h"),
      gravel: db("Physics/TireDynamics/Gravel.h"),
      sand: db("Physics/TireDynamics/Sand.h"),
      hazard: db("Physics/TireDynamics/Hazard.h"),
      forest: db("Physics/TireDynamics/Forest.h"),
      stuntTarmac: db("Physics/TireDynamics/StuntTarmac.h"),
      snow: db("Physics/TireDynamics/Snow.h"),
      ice: db("Physics/TireDynamics/Ice.h"),
      object: db("Physics/TireDynamics/Object.h"),
    },
    car: db(`Cars/Amateur/${carFile}`),
    body: db(`Parts/Body/RaceCar${padded}.h`),
    engine: db(`Parts/Engine/RaceCar${padded}.h`),
    gearbox: db(`Parts/Gearbox/RaceCar${padded}.h`),
    suspension: db(`Parts/Suspension/RaceCar${padded}.h`),
    tires: db(`Parts/Tires/RaceCar${padded}.h`),
    differentials: {
      front: db("Parts/Differential/Front.h"),
      rear: db("Parts/Differential/Rear.h"),
      defaultFront: db("Parts/Differential/DefaultFront.h"),
      defaultRear: db("Parts/Differential/DefaultRear.h"),
    },
    throttleCurves: {
      front: db("Parts/Differential/ThrottleCurves/Front.h"),
      rear: db("Parts/Differential/ThrottleCurves/Rear.h"),
      default: db("Parts/Differential/ThrottleCurves/Default.h"),
    },
    brakeCurves: {
      front: db("Parts/Differential/BrakeCurves/Front.h"),
      rear: db("Parts/Differential/BrakeCurves/Rear.h"),
      default: db("Parts/Differential/BrakeCurves/Default.h"),
    },
    speedCurves: {
      front: db("Parts/Differential/SpeedCurves/Front.h"),
      rear: db("Parts/Differential/SpeedCurves/Rear.h"),
      default: db("Parts/Differential/SpeedCurves/Default.h"),
    },
  };
}

function installFileFetch() {
  globalThis.fetch = async (url) => {
    const text = await fs.readFile(fileURLToPath(url), "utf8");
    return {
      ok: true,
      status: 200,
      async text() {
        return text;
      },
    };
  };
}

async function parseHeaderFile(filePath) {
  return parseHeaderObject(await fs.readFile(filePath, "utf8"));
}

function parseHeaderObject(text) {
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
  return rawValue.replace(/^"/, "").replace(/"$/, "");
}

function parseHeaderList(rawValue) {
  return rawValue
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));
}

function parseIniVector(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`, "m"));
  return match ? parseHeaderList(match[1]) : null;
}

function readProfileScalar(value, fallback) {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? value[0] : fallback;
  }
  return Number.isFinite(value) ? value : fallback;
}

function sampleAtOrAfter(samples, time) {
  return samples.find((sample) => sample.time >= time) ?? null;
}

function max(values) {
  return values.reduce((acc, value) => Math.max(acc, Number.isFinite(value) ? value : -Infinity), -Infinity);
}

function range(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return 0;
  }
  return max(finite) - Math.min(...finite);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
