#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as THREE from "three";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXED_DT = 1 / 60;
const SAMPLE_DT = 0.1;
const DEFAULT_DURATION = 24;
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();

const HEADERS = [
  "timestamp_utc",
  "sample_index",
  "race_time_seconds",
  "player_throttle",
  "player_steer",
  "vehicle_applied_handbrake",
  "vehicle_applied_steer",
  "position_x",
  "position_y",
  "position_z",
  "forward_x",
  "forward_y",
  "forward_z",
  "right_x",
  "right_y",
  "right_z",
  "velocity_x",
  "velocity_y",
  "velocity_z",
  "planar_speed_magnitude",
  "roll_degrees",
  "yaw_rate",
  "web_slip_lat_avg",
  "web_slip_long_avg",
  "web_slip_angle_deg",
  "web_steer_raw",
  "web_steer_state",
  "web_wheel_0_forward_impulse",
  "web_wheel_0_suspension_force",
  "web_wheel_0_angular_velocity",
  "web_wheel_1_forward_impulse",
  "web_wheel_1_suspension_force",
  "web_wheel_1_angular_velocity",
  "web_wheel_2_forward_impulse",
  "web_wheel_2_suspension_force",
  "web_wheel_2_angular_velocity",
  "web_wheel_3_forward_impulse",
  "web_wheel_3_suspension_force",
  "web_wheel_3_angular_velocity",
];

installFileFetch();
const { createDrivingSimulation } = await loadAppPhysicsModule();

const args = parseArgs(process.argv.slice(2));
const carId = args.car ?? "car_1";
const duration = Number.isFinite(args.duration) ? args.duration : DEFAULT_DURATION;
const outPath = path.resolve(
  args.out ??
    path.join(
      REPO_ROOT,
      "analysis/telemetry_runs/flat_plane_compare_2026-04-27",
      `web_headless_${carId}_${stampForFile()}.csv`,
    ),
);

const rows = await runHeadlessScenario({ carId, duration });
await writeCsv(outPath, rows);
process.stdout.write(`Wrote ${rows.length} samples: ${outPath}\n`);

async function runHeadlessScenario({ carId, duration }) {
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
    debugOptions: {},
  });

  const rows = [];
  let sampleIndex = 0;
  let nextSample = 0;
  let prevSample = null;
  for (let time = 0; time < duration; time += FIXED_DT) {
    applyScenarioInput(time, input);
    simulation.update(FIXED_DT);
    if (time + 1e-6 >= nextSample) {
      const row = captureRow(time, sampleIndex, input, carRoot, simulation.getDebugState());
      if (prevSample) {
        const dt = row.race_time_seconds - prevSample.race_time_seconds;
        if (dt > 1e-5) {
          row.yaw_rate = wrapAngleRad(row.yaw_radians - prevSample.yaw_radians) / dt;
          row.velocity_x = (row.position_x - prevSample.position_x) / dt;
          row.velocity_y = (row.position_y - prevSample.position_y) / dt;
          row.velocity_z = (row.position_z - prevSample.position_z) / dt;
        }
      }
      prevSample = row;
      rows.push(row);
      sampleIndex += 1;
      nextSample += SAMPLE_DT;
    }
  }
  simulation.dispose();
  return rows;
}

function applyScenarioInput(time, input) {
  input.throttle = 0;
  input.brake = 0;
  input.handbrake = 0;
  input.steer = 0;

  if (time >= 1 && time < 5) {
    input.throttle = 1;
    return;
  }
  if (time >= 5 && time < 6.2) {
    input.brake = 1;
    return;
  }
  if (time >= 7 && time < 11) {
    input.throttle = 1;
    return;
  }
  if (time >= 11 && time < 12.2) {
    input.throttle = 0.85;
    input.steer = -0.8;
    return;
  }
  if (time >= 12.2 && time < 14.2) {
    input.throttle = 0.65;
    input.steer = -0.9;
    input.handbrake = 1;
    return;
  }
  if (time >= 14.2 && time < 15.2) {
    input.throttle = 0.4;
    input.steer = -0.45;
    return;
  }
  if (time >= 16 && time < 20) {
    input.throttle = 1;
    return;
  }
  if (time >= 20 && time < 22) {
    input.throttle = 0.85;
    input.steer = Math.sin((time - 20) * 8) * 0.35;
    return;
  }
  if (time >= 22 && time < 24) {
    input.brake = 0.8;
  }
}

function captureRow(time, sampleIndex, input, carRoot, debugState) {
  const orientation = orientationFromQuaternion(carRoot.quaternion);
  const wheels = debugState?.wheels ?? [];
  return {
    timestamp_utc: new Date().toISOString(),
    sample_index: sampleIndex,
    race_time_seconds: time,
    player_throttle: input.throttle,
    player_steer: input.steer,
    vehicle_applied_handbrake: debugState?.handbrakeAxis ?? input.handbrake,
    vehicle_applied_steer: debugState?.steerState ?? input.steer,
    position_x: carRoot?.position?.x ?? 0,
    position_y: carRoot?.position?.y ?? 0,
    position_z: carRoot?.position?.z ?? 0,
    forward_x: orientation.forward.x,
    forward_y: orientation.forward.y,
    forward_z: orientation.forward.z,
    right_x: orientation.right.x,
    right_y: orientation.right.y,
    right_z: orientation.right.z,
    velocity_x: 0,
    velocity_y: 0,
    velocity_z: 0,
    planar_speed_magnitude: debugState?.speedHorizontal ?? 0,
    roll_degrees: THREE.MathUtils.radToDeg(orientation.roll),
    yaw_radians: orientation.yaw,
    yaw_rate: 0,
    web_slip_lat_avg: debugState?.slipLatAvg ?? 0,
    web_slip_long_avg: debugState?.slipLongAvg ?? 0,
    web_slip_angle_deg: debugState?.slipAngleDeg ?? 0,
    web_steer_raw: debugState?.steerRaw ?? input.steer,
    web_steer_state: debugState?.steerState ?? input.steer,
    web_wheel_0_forward_impulse: wheels[0]?.forwardImpulse ?? 0,
    web_wheel_0_suspension_force: wheels[0]?.suspensionForce ?? 0,
    web_wheel_0_angular_velocity: wheels[0]?.loadOrSpinCandidate ?? 0,
    web_wheel_1_forward_impulse: wheels[1]?.forwardImpulse ?? 0,
    web_wheel_1_suspension_force: wheels[1]?.suspensionForce ?? 0,
    web_wheel_1_angular_velocity: wheels[1]?.loadOrSpinCandidate ?? 0,
    web_wheel_2_forward_impulse: wheels[2]?.forwardImpulse ?? 0,
    web_wheel_2_suspension_force: wheels[2]?.suspensionForce ?? 0,
    web_wheel_2_angular_velocity: wheels[2]?.loadOrSpinCandidate ?? 0,
    web_wheel_3_forward_impulse: wheels[3]?.forwardImpulse ?? 0,
    web_wheel_3_suspension_force: wheels[3]?.suspensionForce ?? 0,
    web_wheel_3_angular_velocity: wheels[3]?.loadOrSpinCandidate ?? 0,
  };
}

function orientationFromQuaternion(quaternion) {
  if (!quaternion) {
    return {
      forward: TMP_FORWARD.set(0, 0, 0),
      right: TMP_RIGHT.set(0, 0, 0),
      up: TMP_UP.set(0, 1, 0),
      yaw: 0,
      roll: 0,
    };
  }
  const forward = TMP_FORWARD.copy(LOCAL_FORWARD).applyQuaternion(quaternion).normalize();
  const right = TMP_RIGHT.copy(LOCAL_RIGHT).applyQuaternion(quaternion).normalize();
  const up = TMP_UP.copy(LOCAL_UP).applyQuaternion(quaternion).normalize();
  return {
    forward,
    right,
    up,
    yaw: Math.atan2(forward.x, forward.z),
    roll: Math.atan2(right.y, up.y),
  };
}

function wrapAngleRad(angle) {
  let wrapped = angle;
  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }
  while (wrapped < -Math.PI) {
    wrapped += Math.PI * 2;
  }
  return wrapped;
}

async function writeCsv(outPath, rows) {
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(HEADERS.map((header) => formatCsvValue(row[header])).join(","));
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${lines.join("\r\n")}\r\n`, "utf8");
}

function formatCsvValue(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function stampForFile() {
  return new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("Z", "Z");
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, valuePart] = arg.slice(2).split("=", 2);
    const value = valuePart ?? "";
    if (key === "car") {
      result.car = value;
    } else if (key === "duration") {
      result.duration = Number(value);
    } else if (key === "out") {
      result.out = value;
    }
  }
  return result;
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
    return rawValue.trim() === "true";
  }
  if (type === "float" || type === "double") {
    if (isArray) {
      return parseArray(rawValue).map((item) => Number(item));
    }
    return Number(rawValue);
  }
  if (type === "int" || type === "uint" || type === "long") {
    if (isArray) {
      return parseArray(rawValue).map((item) => Number.parseInt(item, 10));
    }
    return Number.parseInt(rawValue, 10);
  }
  return rawValue;
}

function parseArray(raw) {
  const cleaned = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!cleaned) {
    return [];
  }
  return cleaned
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseIniVector(text, key) {
  const regex = new RegExp(`^\\s*${key}\\s*=\\s*([+-]?[\\d.]+)\\s*,\\s*([+-]?[\\d.]+)\\s*,\\s*([+-]?[\\d.]+)`, "mi");
  const match = text.match(regex);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function readProfileScalar(value, fallback) {
  if (Array.isArray(value)) {
    const first = Number(value[0]);
    return Number.isFinite(first) ? first : fallback;
  }
  const scalar = Number(value);
  return Number.isFinite(scalar) ? scalar : fallback;
}
