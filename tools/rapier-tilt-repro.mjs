#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as THREE from "three";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_DT = 1 / 60;
const SAMPLE_DT = 0.1;
const DEFAULT_DURATION = 8;
const DEFAULT_CARS = ["car_1", "car_10"];

installFileFetch();

const { createDrivingSimulation } = await loadAppPhysicsModule();

const args = parseArgs(process.argv.slice(2));
const carIds = args.cars.length > 0 ? args.cars : DEFAULT_CARS;
const duration = args.duration ?? DEFAULT_DURATION;
const scenarios = [
  { name: "all_on", debugOptions: {} },
  { name: "aero_off", debugOptions: { aeroDrag: false } },
  { name: "lateral_off", debugOptions: { lateralDrag: false } },
  { name: "downforce_off", debugOptions: { downforce: false } },
  { name: "drive_off", debugOptions: { driveForce: false } },
];

const originalSummary = await summarizeOriginalBaseline();
if (originalSummary) {
  console.log(
    `Original baseline straight roll: maxAbs=${round(originalSummary.maxAbsRollDeg, 4)}deg over ${originalSummary.rows} rows`,
  );
}

let failed = false;
for (const carId of carIds) {
  console.log(`\n${carId}`);
  for (const scenario of scenarios) {
    const result = await runScenario({ carId, duration, scenario });
    failed ||= !result.pass;
    console.log(
      [
        `  [${result.pass ? "PASS" : "FAIL"}] ${scenario.name}`,
        `maxAbsRoll=${round(result.maxAbsRollDeg, 3)}deg`,
        `finalRoll=${round(result.finalRollDeg, 3)}deg`,
        `maxSpeed=${round(result.maxSpeedMps, 2)}m/s`,
        `minContacts=${result.minContacts}`,
        `loadBiasMax=${round(result.maxLoadBias, 3)}`,
        `firstFail=${result.firstFail ?? "none"}`,
      ].join(" "),
    );
  }
}

process.exitCode = failed ? 1 : 0;

async function runScenario({ carId, duration, scenario }) {
  const carRoot = await createSyntheticCarRoot(carId);
  const { collisionRoot, trackFloorSampler } = createFlatTrack();
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
    collisionRoot,
    dynamicObjects: [],
    trackFloorSampler,
    debugOptions: scenario.debugOptions,
  });

  const samples = [];
  let nextSample = 0;
  for (let time = 0; time < duration; time += FIXED_DT) {
    input.throttle = time >= 1 ? 1 : 0;
    simulation.update(FIXED_DT);
    if (time + 1e-6 >= nextSample) {
      samples.push(captureSample(time, carRoot, simulation.getDebugState()));
      nextSample += SAMPLE_DT;
    }
  }
  simulation.dispose();

  const maxAbsRollDeg = max(samples.map((sample) => Math.abs(sample.rollDeg)));
  const maxSpeedMps = max(samples.map((sample) => sample.speedMps));
  const minContacts = min(samples.map((sample) => sample.contacts));
  const maxLoadBias = max(samples.map((sample) => Math.abs(sample.loadBias)));
  const firstFailSample = samples.find(
    (sample) =>
      sample.time > 1.25 &&
      (Math.abs(sample.rollDeg) > 1 || sample.contacts < 4 || Math.abs(sample.loadBias) > 0.28),
  );
  const finalSample = samples[samples.length - 1] ?? {};

  return {
    pass: !firstFailSample,
    samples,
    maxAbsRollDeg,
    finalRollDeg: finalSample.rollDeg ?? 0,
    maxSpeedMps,
    minContacts,
    maxLoadBias,
    firstFail: firstFailSample
      ? `t=${round(firstFailSample.time, 2)} roll=${round(firstFailSample.rollDeg, 2)} bias=${round(firstFailSample.loadBias, 2)} contacts=${firstFailSample.contacts}`
      : null,
  };
}

function captureSample(time, carRoot, debugState) {
  const orientation = orientationFromQuaternion(carRoot.quaternion);
  const wheels = debugState.wheels ?? [];
  const leftLoad =
    (wheels[0]?.verticalLoadCandidate ?? 0) + (wheels[2]?.verticalLoadCandidate ?? 0);
  const rightLoad =
    (wheels[1]?.verticalLoadCandidate ?? 0) + (wheels[3]?.verticalLoadCandidate ?? 0);
  const loadTotal = Math.max(leftLoad + rightLoad, 1);
  return {
    time,
    rollDeg: THREE.MathUtils.radToDeg(orientation.roll),
    pitchDeg: THREE.MathUtils.radToDeg(orientation.pitch),
    speedMps: debugState.speedHorizontal ?? 0,
    speedRight: debugState.speedRight ?? 0,
    contacts: debugState.wheelContacts ?? 0,
    loadBias: (rightLoad - leftLoad) / loadTotal,
    leftLoad,
    rightLoad,
    suspension: wheels.map((wheel) => wheel?.suspensionLength ?? 0),
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
  const frontY = frontRadius;
  const rearY = rearRadius;
  addWheelAnchor(root, "placeholder_tire_fl", leftX, frontY, frontZ, frontRadius);
  addWheelAnchor(root, "placeholder_tire_fr", rightX, frontY, frontZ, frontRadius);
  addWheelAnchor(root, "placeholder_tire_rl", leftX, rearY, rearZ, rearRadius);
  addWheelAnchor(root, "placeholder_tire_rr", rightX, rearY, rearZ, rearRadius);
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

function createFlatTrack() {
  const collisionRoot = new THREE.Object3D();
  const geometry = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  plane.name = "tarmac_headless_flat_plane";
  collisionRoot.add(plane);
  return {
    collisionRoot,
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

function assetUrlsForCar(carId) {
  return {
    bodyConfig: pathToFileURL(path.join(REPO_ROOT, "src/data/cars", carId, "body.ini")).href,
    tireConfig: pathToFileURL(path.join(REPO_ROOT, "src/data/cars", carId, "tires.ini")).href,
    drivingDb: drivingDbUrlsForCar(carId),
  };
}

async function loadAppPhysicsModule() {
  const cacheDir = path.join(REPO_ROOT, ".cache/headless-physics");
  await fs.mkdir(cacheDir, { recursive: true });
  const drivingConfigText = await fs.readFile(
    path.join(REPO_ROOT, "src/game/drivingConfig.js"),
    "utf8",
  );
  let physicsText = await fs.readFile(
    path.join(REPO_ROOT, "src/game/physicsRapier.js"),
    "utf8",
  );
  physicsText = physicsText.replace(
    'import { loadDrivingConfig } from "./drivingConfig";',
    'import { loadDrivingConfig } from "./drivingConfig.mjs";',
  );
  await Promise.all([
    fs.writeFile(path.join(cacheDir, "drivingConfig.mjs"), drivingConfigText),
    fs.writeFile(path.join(cacheDir, "physicsRapier.mjs"), physicsText),
  ]);
  return import(`${pathToFileURL(path.join(cacheDir, "physicsRapier.mjs")).href}?t=${Date.now()}`);
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

async function summarizeOriginalBaseline() {
  const baselinePath = path.join(
    REPO_ROOT,
    "analysis/telemetry_runs/flat_plane_compare_2026-04-27/original_flat_plane.csv",
  );
  try {
    const csv = await fs.readFile(baselinePath, "utf8");
    const rows = parseCsv(csv);
    const straight = rows.filter(
      (row) =>
        Number(row.vehicle_applied_throttle ?? row.player_throttle ?? 0) > 0.95 &&
        Math.abs(Number(row.vehicle_applied_steer ?? row.player_steer ?? 0)) < 0.01 &&
        Number(row.speed_magnitude ?? row.planar_speed_magnitude ?? 0) > 2,
    );
    return {
      rows: straight.length,
      maxAbsRollDeg: max(straight.map((row) => Math.abs(Number(row.roll_degrees ?? row.roll_deg ?? 0)))),
    };
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const cars = argv.filter((arg) => /^car_\d+$/.test(arg));
  const durationArg = argv.find((arg) => arg.startsWith("--duration="));
  return {
    cars,
    duration: durationArg ? Number(durationArg.slice("--duration=".length)) : null,
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

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(headerLine);
  return lines.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function orientationFromQuaternion(quaternion) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
  return {
    yaw: Math.atan2(forward.x, -forward.z),
    pitch: Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)),
    roll: Math.atan2(up.x, up.y),
  };
}

function readProfileScalar(value, fallback) {
  if (Array.isArray(value)) {
    return Number.isFinite(value[0]) ? value[0] : fallback;
  }
  return Number.isFinite(value) ? value : fallback;
}

function max(values) {
  return values.reduce((acc, value) => Math.max(acc, Number.isFinite(value) ? value : -Infinity), -Infinity);
}

function min(values) {
  return values.reduce((acc, value) => Math.min(acc, Number.isFinite(value) ? value : Infinity), Infinity);
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
