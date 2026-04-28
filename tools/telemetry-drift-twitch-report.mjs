#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ORIGINAL = path.join(
  REPO_ROOT,
  "analysis/telemetry_runs/flat_plane_compare_2026-04-27/original_flat_plane.csv",
);
const DEFAULT_WEB = path.join(
  REPO_ROOT,
  "analysis/telemetry_runs/flat_plane_compare_2026-04-27/web_port_flat_plane.csv",
);

const args = parseArgs(process.argv.slice(2));
const originalPath = path.resolve(args.original ?? DEFAULT_ORIGINAL);
const webPath = path.resolve(args.web ?? DEFAULT_WEB);
const outPath = args.out ? path.resolve(args.out) : null;

const [originalRows, webRows] = await Promise.all([
  readCsvRows(originalPath),
  readCsvRows(webPath),
]);

const originalMetrics = computeMetrics(originalRows);
const webMetrics = computeMetrics(webRows);
const report = buildReport({
  originalPath,
  webPath,
  originalMetrics,
  webMetrics,
});

if (outPath) {
  await fs.writeFile(outPath, report, "utf8");
}

process.stdout.write(`${report}\n`);

function computeMetrics(rows) {
  const straight = rows.filter(
    (row) =>
      value(row, "player_throttle", 0) > 0.85 &&
      Math.abs(value(row, "player_steer", 0)) < 0.05 &&
      value(row, "vehicle_applied_handbrake", 0) < 0.1 &&
      value(row, "planar_speed_magnitude", 0) > 8,
  );
  const handbrakeDrift = rows.filter(
    (row) =>
      value(row, "vehicle_applied_handbrake", 0) > 0.6 &&
      Math.abs(value(row, "player_steer", 0)) > 0.35 &&
      value(row, "planar_speed_magnitude", 0) > 6,
  );
  const highSpeedSteer = rows.filter(
    (row) =>
      value(row, "planar_speed_magnitude", 0) > 16 &&
      Math.abs(value(row, "player_steer", 0)) > 0.18 &&
      value(row, "vehicle_applied_handbrake", 0) < 0.2,
  );

  const yawJerk = deriveRate(
    highSpeedSteer,
    "yaw_rate",
    "race_time_seconds",
  );
  const speedDecel = deriveRate(
    handbrakeDrift,
    "planar_speed_magnitude",
    "race_time_seconds",
  ).map((x) => -x);

  const cameraSampleRows = cameraRows(rows);

  return {
    rows: rows.length,
    straightRows: straight.length,
    handbrakeRows: handbrakeDrift.length,
    highSpeedSteerRows: highSpeedSteer.length,
    straightRollAvg: avg(straight.map((row) => Math.abs(value(row, "roll_degrees", 0)))),
    straightRollP95: p(straight.map((row) => Math.abs(value(row, "roll_degrees", 0))), 95),
    straightRollDriftDegPerS: linearSlope(
      straight.map((row) => value(row, "race_time_seconds", 0)),
      straight.map((row) => value(row, "roll_degrees", 0)),
    ),
    straightYawRateStd: stddev(straight.map((row) => value(row, "yaw_rate", 0))),
    highSpeedYawRateAbsAvg: avg(
      highSpeedSteer.map((row) => Math.abs(value(row, "yaw_rate", 0))),
    ),
    highSpeedYawJerkP95: p(yawJerk.map((x) => Math.abs(x)), 95),
    highSpeedSteerStateLagAvg: avg(
      highSpeedSteer.map((row) =>
        Math.abs(value(row, "web_steer_raw", value(row, "player_steer", 0)) - value(row, "web_steer_state", value(row, "vehicle_applied_steer", 0))),
      ),
    ),
    handbrakeYawRateAbsAvg: avg(
      handbrakeDrift.map((row) => Math.abs(value(row, "yaw_rate", 0))),
    ),
    handbrakeDecelAvg: avg(speedDecel),
    handbrakeLatSlipAvg: avg(handbrakeDrift.map((row) => value(row, "web_slip_lat_avg", NaN))),
    handbrakeLongSlipAvg: avg(handbrakeDrift.map((row) => value(row, "web_slip_long_avg", NaN))),
    handbrakeSlipAngleDegAvg: avg(handbrakeDrift.map(vehicleSlipAngleDeg)),
    highSpeedSlipAngleDegAvg: avg(highSpeedSteer.map(vehicleSlipAngleDeg)),
    handbrakeRearWheelSpinAbsAvg: avg(
      handbrakeDrift.map((row) =>
        avgAbs([wheelAngularVelocity(row, 2), wheelAngularVelocity(row, 3)]),
      ),
    ),
    handbrakeFrontWheelSpinAbsAvg: avg(
      handbrakeDrift.map((row) =>
        avgAbs([wheelAngularVelocity(row, 0), wheelAngularVelocity(row, 1)]),
      ),
    ),
    handbrakeRearFrontSpinRatio: ratio(
      avg(
        handbrakeDrift.map((row) =>
          avgAbs([wheelAngularVelocity(row, 2), wheelAngularVelocity(row, 3)]),
        ),
      ),
      avg(
        handbrakeDrift.map((row) =>
          avgAbs([wheelAngularVelocity(row, 0), wheelAngularVelocity(row, 1)]),
        ),
      ),
    ),
    handbrakeRearGripProxyAbsAvg: avg(
      handbrakeDrift.map((row) =>
        avgAbs([wheelGripProxy(row, 2), wheelGripProxy(row, 3)]),
      ),
    ),
    handbrakeFrontGripProxyAbsAvg: avg(
      handbrakeDrift.map((row) =>
        avgAbs([wheelGripProxy(row, 0), wheelGripProxy(row, 1)]),
      ),
    ),
    handbrakeRearFrontGripProxyRatio: ratio(
      avg(
        handbrakeDrift.map((row) =>
          avgAbs([wheelGripProxy(row, 2), wheelGripProxy(row, 3)]),
        ),
      ),
      avg(
        handbrakeDrift.map((row) =>
          avgAbs([wheelGripProxy(row, 0), wheelGripProxy(row, 1)]),
        ),
      ),
    ),
    speedMax: max(rows.map((row) => value(row, "planar_speed_magnitude", 0))),
    cameraRows: cameraSampleRows.length,
    cameraDistanceAvg: avg(cameraSampleRows.map(cameraDistance)),
    cameraDistanceP95: p(cameraSampleRows.map(cameraDistance), 95),
    cameraHeightOffsetAvg: avg(cameraSampleRows.map(cameraHeightOffset)),
    cameraFovRadAvg: avg(cameraSampleRows.map(cameraFovRad)),
    cameraFovDeltaRateP95: p(
      deriveRate(cameraSampleRows, "__camera_fov_rad__", "race_time_seconds", cameraFovRad).map(
        (x) => Math.abs(x),
      ),
      95,
    ),
    cameraModeSwitchCount: cameraModeSwitchCount(rows),
    cameraForwardAlignAvg: avg(cameraRows(rows).map(cameraForwardAlignment)),
  };
}

function buildReport({ originalPath, webPath, originalMetrics, webMetrics }) {
  const lines = [];
  lines.push("# Drift/Twitch Telemetry Comparison");
  lines.push("");
  lines.push(`Original: ${originalPath}`);
  lines.push(`Web:      ${webPath}`);
  lines.push("");
  lines.push("## Straight Stability");
  lines.push(metricLine("rows", originalMetrics.straightRows, webMetrics.straightRows));
  lines.push(
    metricLine(
      "roll_abs_avg_deg",
      originalMetrics.straightRollAvg,
      webMetrics.straightRollAvg,
    ),
  );
  lines.push(
    metricLine(
      "roll_abs_p95_deg",
      originalMetrics.straightRollP95,
      webMetrics.straightRollP95,
    ),
  );
  lines.push(
    metricLine(
      "roll_drift_deg_per_s",
      originalMetrics.straightRollDriftDegPerS,
      webMetrics.straightRollDriftDegPerS,
    ),
  );
  lines.push(
    metricLine(
      "yaw_rate_std",
      originalMetrics.straightYawRateStd,
      webMetrics.straightYawRateStd,
    ),
  );
  lines.push("");
  lines.push("## Handbrake Drift");
  lines.push(metricLine("rows", originalMetrics.handbrakeRows, webMetrics.handbrakeRows));
  lines.push(
    metricLine(
      "yaw_rate_abs_avg",
      originalMetrics.handbrakeYawRateAbsAvg,
      webMetrics.handbrakeYawRateAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "speed_decel_avg_mps2",
      originalMetrics.handbrakeDecelAvg,
      webMetrics.handbrakeDecelAvg,
    ),
  );
  lines.push(
    metricLine(
      "web_slip_lat_avg",
      originalMetrics.handbrakeLatSlipAvg,
      webMetrics.handbrakeLatSlipAvg,
    ),
  );
  lines.push(
    metricLine(
      "web_slip_long_avg",
      originalMetrics.handbrakeLongSlipAvg,
      webMetrics.handbrakeLongSlipAvg,
    ),
  );
  lines.push(
    metricLine(
      "slip_angle_deg_avg",
      originalMetrics.handbrakeSlipAngleDegAvg,
      webMetrics.handbrakeSlipAngleDegAvg,
    ),
  );
  lines.push("");
  lines.push("## High-Speed Steering Twitch");
  lines.push(metricLine("rows", originalMetrics.highSpeedSteerRows, webMetrics.highSpeedSteerRows));
  lines.push(
    metricLine(
      "yaw_rate_abs_avg",
      originalMetrics.highSpeedYawRateAbsAvg,
      webMetrics.highSpeedYawRateAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "yaw_jerk_abs_p95",
      originalMetrics.highSpeedYawJerkP95,
      webMetrics.highSpeedYawJerkP95,
    ),
  );
  lines.push(
    metricLine(
      "web_steer_state_lag_avg",
      originalMetrics.highSpeedSteerStateLagAvg,
      webMetrics.highSpeedSteerStateLagAvg,
    ),
  );
  lines.push(
    metricLine(
      "slip_angle_deg_avg",
      originalMetrics.highSpeedSlipAngleDegAvg,
      webMetrics.highSpeedSlipAngleDegAvg,
    ),
  );
  lines.push("");
  lines.push("## Tire Slip Proxies");
  lines.push(
    metricLine(
      "hb_rear_wheel_spin_abs_avg",
      originalMetrics.handbrakeRearWheelSpinAbsAvg,
      webMetrics.handbrakeRearWheelSpinAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "hb_front_wheel_spin_abs_avg",
      originalMetrics.handbrakeFrontWheelSpinAbsAvg,
      webMetrics.handbrakeFrontWheelSpinAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "hb_rear_front_spin_ratio",
      originalMetrics.handbrakeRearFrontSpinRatio,
      webMetrics.handbrakeRearFrontSpinRatio,
    ),
  );
  lines.push(
    metricLine(
      "hb_rear_grip_proxy_abs_avg",
      originalMetrics.handbrakeRearGripProxyAbsAvg,
      webMetrics.handbrakeRearGripProxyAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "hb_front_grip_proxy_abs_avg",
      originalMetrics.handbrakeFrontGripProxyAbsAvg,
      webMetrics.handbrakeFrontGripProxyAbsAvg,
    ),
  );
  lines.push(
    metricLine(
      "hb_rear_front_grip_proxy_ratio",
      originalMetrics.handbrakeRearFrontGripProxyRatio,
      webMetrics.handbrakeRearFrontGripProxyRatio,
    ),
  );
  lines.push("");
  lines.push("## General");
  lines.push(metricLine("rows_total", originalMetrics.rows, webMetrics.rows));
  lines.push(metricLine("speed_max_mps", originalMetrics.speedMax, webMetrics.speedMax));
  lines.push("");
  lines.push("## Camera");
  lines.push(metricLine("rows", originalMetrics.cameraRows, webMetrics.cameraRows));
  lines.push(
    metricLine(
      "camera_distance_avg_m",
      originalMetrics.cameraDistanceAvg,
      webMetrics.cameraDistanceAvg,
    ),
  );
  lines.push(
    metricLine(
      "camera_distance_p95_m",
      originalMetrics.cameraDistanceP95,
      webMetrics.cameraDistanceP95,
    ),
  );
  lines.push(
    metricLine(
      "camera_height_offset_avg_m",
      originalMetrics.cameraHeightOffsetAvg,
      webMetrics.cameraHeightOffsetAvg,
    ),
  );
  lines.push(
    metricLine(
      "camera_fov_avg_rad",
      originalMetrics.cameraFovRadAvg,
      webMetrics.cameraFovRadAvg,
    ),
  );
  lines.push(
    metricLine(
      "camera_fov_delta_rate_p95",
      originalMetrics.cameraFovDeltaRateP95,
      webMetrics.cameraFovDeltaRateP95,
    ),
  );
  lines.push(
    metricLine(
      "camera_mode_switch_count",
      originalMetrics.cameraModeSwitchCount,
      webMetrics.cameraModeSwitchCount,
    ),
  );
  lines.push(
    metricLine(
      "camera_forward_alignment_avg",
      originalMetrics.cameraForwardAlignAvg,
      webMetrics.cameraForwardAlignAvg,
    ),
  );
  return lines.join("\n");
}

function metricLine(name, originalValue, webValue) {
  return `${name}: original=${fmt(originalValue)} web=${fmt(webValue)} delta=${fmtDelta(originalValue, webValue)}`;
}

function fmt(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function fmtDelta(base, value) {
  if (!Number.isFinite(base) || !Number.isFinite(value)) {
    return "--";
  }
  const delta = value - base;
  const rel = Math.abs(base) > 1e-9 ? (delta / Math.abs(base)) * 100 : NaN;
  if (Number.isFinite(rel)) {
    return `${delta >= 0 ? "+" : ""}${fmt(delta)} (${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%)`;
  }
  return `${delta >= 0 ? "+" : ""}${fmt(delta)}`;
}

function deriveRate(rows, valueKey, timeKey, accessor = null) {
  const rates = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prevT = value(rows[i - 1], timeKey, NaN);
    const nextT = value(rows[i], timeKey, NaN);
    const prevV = accessor ? accessor(rows[i - 1]) : value(rows[i - 1], valueKey, NaN);
    const nextV = accessor ? accessor(rows[i]) : value(rows[i], valueKey, NaN);
    const dt = nextT - prevT;
    if (!Number.isFinite(dt) || dt <= 1e-5 || !Number.isFinite(prevV) || !Number.isFinite(nextV)) {
      continue;
    }
    rates.push((nextV - prevV) / dt);
  }
  return rates;
}

function cameraRows(rows) {
  return rows.filter((row) => Number.isFinite(cameraDistance(row)));
}

function cameraDistance(row) {
  const px = value(row, "position_x", NaN);
  const py = value(row, "position_y", NaN);
  const pz = value(row, "position_z", NaN);
  const cx = value(row, "camera_position_x", NaN);
  const cy = value(row, "camera_position_y", NaN);
  const cz = value(row, "camera_position_z", NaN);
  if (![px, py, pz, cx, cy, cz].every(Number.isFinite)) {
    return NaN;
  }
  return Math.hypot(cx - px, cy - py, cz - pz);
}

function cameraHeightOffset(row) {
  const py = value(row, "position_y", NaN);
  const cy = value(row, "camera_position_y", NaN);
  if (!Number.isFinite(py) || !Number.isFinite(cy)) {
    return NaN;
  }
  return cy - py;
}

function cameraFovRad(row) {
  const fovRad = value(row, "camera_fov", NaN);
  if (Number.isFinite(fovRad) && Math.abs(fovRad) <= Math.PI * 1.5) {
    return fovRad;
  }
  const webFovDeg = value(row, "web_camera_fov_degrees", NaN);
  if (Number.isFinite(webFovDeg)) {
    return (webFovDeg * Math.PI) / 180;
  }
  if (Number.isFinite(fovRad) && Math.abs(fovRad) > Math.PI * 1.5) {
    return (fovRad * Math.PI) / 180;
  }
  return NaN;
}

function cameraModeSwitchCount(rows) {
  let count = 0;
  let prev = null;
  for (const row of rows) {
    const mode = value(row, "camera_mode_index", NaN);
    if (!Number.isFinite(mode)) {
      continue;
    }
    if (prev != null && mode !== prev) {
      count += 1;
    }
    prev = mode;
  }
  return count;
}

function cameraForwardAlignment(row) {
  const cfx = value(row, "camera_forward_x", NaN);
  const cfy = value(row, "camera_forward_y", NaN);
  const cfz = value(row, "camera_forward_z", NaN);
  const ffx = value(row, "forward_x", NaN);
  const ffy = value(row, "forward_y", NaN);
  const ffz = value(row, "forward_z", NaN);
  if (![cfx, cfy, cfz, ffx, ffy, ffz].every(Number.isFinite)) {
    return NaN;
  }
  const cLen = Math.hypot(cfx, cfy, cfz);
  const fLen = Math.hypot(ffx, ffy, ffz);
  if (cLen <= 1e-8 || fLen <= 1e-8) {
    return NaN;
  }
  return (cfx * ffx + cfy * ffy + cfz * ffz) / (cLen * fLen);
}

function vehicleSlipAngleDeg(row) {
  const explicit = value(row, "web_slip_angle_deg", NaN);
  if (Number.isFinite(explicit)) {
    return Math.abs(explicit);
  }
  const vx = value(row, "velocity_x", NaN);
  const vy = value(row, "velocity_y", NaN);
  const vz = value(row, "velocity_z", NaN);
  const fx = value(row, "forward_x", NaN);
  const fy = value(row, "forward_y", NaN);
  const fz = value(row, "forward_z", NaN);
  const rx = value(row, "right_x", NaN);
  const ry = value(row, "right_y", NaN);
  const rz = value(row, "right_z", NaN);
  if (![vx, vy, vz, fx, fy, fz, rx, ry, rz].every(Number.isFinite)) {
    return NaN;
  }
  const speedForward = vx * fx + vy * fy + vz * fz;
  const speedRight = vx * rx + vy * ry + vz * rz;
  const angle = Math.atan2(Math.abs(speedRight), Math.max(Math.abs(speedForward), 0.15));
  return (angle * 180) / Math.PI;
}

function wheelAngularVelocity(row, wheelIndex) {
  const web = value(row, `web_wheel_${wheelIndex}_angular_velocity`, NaN);
  if (Number.isFinite(web)) {
    return web;
  }
  return value(row, `wheel_${wheelIndex}_load_or_spin_candidate`, NaN);
}

function wheelGripProxy(row, wheelIndex) {
  const web = value(row, `web_wheel_${wheelIndex}_forward_impulse`, NaN);
  if (Number.isFinite(web)) {
    return web;
  }
  return value(row, `wheel_${wheelIndex}_tire_force_multiplier_candidate`, NaN);
}

function linearSlope(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) {
    return NaN;
  }
  const meanX = avg(xs);
  const meanY = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  return den > 1e-9 ? num / den : NaN;
}

function avgAbs(values) {
  return avg(values.map((x) => (Number.isFinite(x) ? Math.abs(x) : NaN)));
}

function ratio(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) <= 1e-8) {
    return NaN;
  }
  return num / den;
}

function readCsvRows(filePath) {
  return fs.readFile(filePath, "utf8").then((text) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    if (lines.length < 2) {
      return [];
    }
    const headers = parseCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const parts = parseCsvLine(lines[i]);
      const row = {};
      for (let h = 0; h < headers.length; h += 1) {
        row[headers[h]] = parts[h] ?? "";
      }
      rows.push(row);
    }
    return rows;
  });
}

function parseCsvLine(line) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function value(row, key, fallback) {
  const raw = row?.[key];
  if (raw == null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function avg(values) {
  const usable = values.filter(Number.isFinite);
  if (usable.length === 0) {
    return NaN;
  }
  return usable.reduce((sum, x) => sum + x, 0) / usable.length;
}

function max(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length === 0 ? NaN : Math.max(...usable);
}

function p(values, percentile) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (usable.length === 0) {
    return NaN;
  }
  const rank = ((percentile / 100) * (usable.length - 1));
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const t = rank - lo;
  return usable[lo] * (1 - t) + usable[hi] * t;
}

function stddev(values) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 2) {
    return NaN;
  }
  const mean = avg(usable);
  const variance =
    usable.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) /
    (usable.length - 1);
  return Math.sqrt(variance);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, valuePart] = arg.slice(2).split("=", 2);
    const value = valuePart ?? "";
    if (key === "original") {
      result.original = value;
    } else if (key === "web") {
      result.web = value;
    } else if (key === "out") {
      result.out = value;
    }
  }
  return result;
}
