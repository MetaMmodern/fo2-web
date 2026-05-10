import * as THREE from "three";

const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const TMP_FORWARD = new THREE.Vector3();
const TMP_RIGHT = new THREE.Vector3();
const TMP_UP = new THREE.Vector3();
const TMP_CAMERA_FORWARD = new THREE.Vector3();

const BASE_FIELDS = [
  "timestamp_utc",
  "sample_index",
  "race_time_seconds",
  "game_state",
  "is_racing",
  "is_paused",
  "level_id",
  "level_name",
  "car_id",
  "car_name",
  "player_steer",
  "player_throttle",
  "player_brake",
  "position_x",
  "position_y",
  "position_z",
  "forward_x",
  "forward_y",
  "forward_z",
  "right_x",
  "right_y",
  "right_z",
  "up_x",
  "up_y",
  "up_z",
  "velocity_x",
  "velocity_y",
  "velocity_z",
  "angular_velocity_x",
  "angular_velocity_y",
  "angular_velocity_z",
  "vehicle_applied_throttle",
  "vehicle_applied_brake",
  "vehicle_applied_handbrake",
  "vehicle_control_candidate_1dfc",
  "vehicle_applied_steer",
  "vehicle_frame_delta_ms",
  "vehicle_frame_delta_seconds",
  "speed_magnitude",
  "planar_speed_magnitude",
  "yaw_radians",
  "yaw_degrees",
  "pitch_radians",
  "pitch_degrees",
  "roll_radians",
  "roll_degrees",
  "yaw_rate",
  "quat_x",
  "quat_y",
  "quat_z",
  "quat_w",
  "camera_position_x",
  "camera_position_y",
  "camera_position_z",
  "camera_forward_x",
  "camera_forward_y",
  "camera_forward_z",
  "camera_fov",
  "camera_mode_index",
  "camera_family",
];

const WHEEL_FIELD_SUFFIXES = [
  "contact_flag",
  "contact_ptr",
  "contact_surface_44_candidate",
  "contact_surface_48_candidate",
  "contact_surface_4c_candidate",
  "contact_surface_50_candidate",
  "suspension_length_candidate",
  "tire_force_multiplier_candidate",
  "load_or_spin_candidate",
  "rotation_or_phase_candidate",
  "vertical_load_candidate",
];

const WEB_FIELDS = [
  "web_telemetry_schema_version",
  "web_capture_has_simulation",
  "web_gear",
  "web_engine_rpm",
  "web_clutch",
  "web_steer_state",
  "web_steer_raw",
  "web_steer_limit",
  "web_steer_target",
  "web_steer_speed_kph",
  "web_speed_forward",
  "web_speed_right",
  "web_front_grip_scale",
  "web_rear_grip_scale",
  "web_inertia_roll_torque",
  "web_inertia_pitch_torque",
  "web_longitudinal_accel_filtered",
  "web_lateral_accel_filtered",
  "web_load_transfer_long",
  "web_load_transfer_lat",
  "web_aero_drag_force",
  "web_rolling_resistance_drag",
  "web_brake_distance_scale",
  "web_slip_long_avg",
  "web_slip_lat_avg",
  "web_slip_angle_deg",
  "web_surface_type",
  "web_surface_grip",
  "web_wheel_contacts",
  "web_forward_impulse",
  "web_suspension_force",
  "web_front_suspension_force_sum",
  "web_rear_suspension_force_sum",
  "web_suspension_force_front_rear_ratio",
  "web_suspension_force_front_minus_rear",
  "web_camera_fov_degrees",
  "web_sim_steps",
  "web_sim_backlog_ms",
  "web_wheel_0_forward_impulse",
  "web_wheel_0_suspension_force",
  "web_wheel_0_angular_velocity",
  "web_wheel_0_longitudinal_speed",
  "web_wheel_0_ground_relative_longitudinal_velocity",
  "web_wheel_0_slip_ratio",
  "web_wheel_1_forward_impulse",
  "web_wheel_1_suspension_force",
  "web_wheel_1_angular_velocity",
  "web_wheel_1_longitudinal_speed",
  "web_wheel_1_ground_relative_longitudinal_velocity",
  "web_wheel_1_slip_ratio",
  "web_wheel_2_forward_impulse",
  "web_wheel_2_suspension_force",
  "web_wheel_2_angular_velocity",
  "web_wheel_2_longitudinal_speed",
  "web_wheel_2_ground_relative_longitudinal_velocity",
  "web_wheel_2_slip_ratio",
  "web_wheel_3_forward_impulse",
  "web_wheel_3_suspension_force",
  "web_wheel_3_angular_velocity",
  "web_wheel_3_longitudinal_speed",
  "web_wheel_3_ground_relative_longitudinal_velocity",
  "web_wheel_3_slip_ratio",
  "web_input_throttle_raw",
  "web_input_brake_raw",
  "web_input_steer_raw",
  "web_input_handbrake_raw",
  "web_input_reset_raw",
  "web_input_version_raw",
  "web_input_snapshot_present",
  "web_input_sanity_mask",
  "web_input_steer_missing_under_turn_test",
];

const FIELD_NAMES = [
  ...BASE_FIELDS,
  ...buildWheelFieldNames(),
  ...WEB_FIELDS,
];

export function createTelemetryRecorder({ getContext } = {}) {
  const state = {
    status: "Idle",
    sampleCount: 0,
    filename: "--",
    simAttached: false,
    simLiveFrames: 0,
    lastRow: null,
  };
  let rows = [];
  let recording = false;
  let startedAtMs = 0;
  let sampleIndex = 0;
  let boundSimulation = null;

  return {
    state,
    get isRecording() {
      return recording;
    },
    record() {
      const context = getContext?.() ?? {};
      const activeSimulation = context.sceneState?.drivingSimulation ?? null;
      if (!activeSimulation?.getDebugState) {
        recording = false;
        state.status = "No simulation";
        state.sampleCount = 0;
        state.filename = "--";
        state.simAttached = false;
        state.simLiveFrames = 0;
        state.lastRow = null;
        return;
      }
      boundSimulation = activeSimulation;
      rows = [];
      sampleIndex = 0;
      startedAtMs = performance.now();
      recording = true;
      state.sampleCount = 0;
      state.filename = buildFilename();
      state.simAttached = true;
      state.simLiveFrames = 0;
      state.lastRow = null;
      state.status = "Recording";
    },
    stop() {
      if (!recording) {
        return;
      }
      recording = false;
      boundSimulation = null;
      state.simAttached = false;
      downloadCsv(state.filename, rows);
      state.status = rows.length > 0 ? "Saved" : "Stopped empty";
    },
    discard() {
      rows = [];
      sampleIndex = 0;
      recording = false;
      boundSimulation = null;
      state.sampleCount = 0;
      state.simAttached = false;
      state.simLiveFrames = 0;
      state.lastRow = null;
      state.status = "Idle";
      state.filename = "--";
    },
    capture(frame = {}) {
      if (!recording) {
        return;
      }
      const context = getContext?.() ?? {};
      const liveSimulation = context.sceneState?.drivingSimulation ?? boundSimulation ?? null;
      const liveDebugState = liveSimulation?.getDebugState?.() ?? null;
      const hasSimulation = Boolean(
        liveDebugState,
      );
      state.simAttached = Boolean(liveSimulation);
      if (!hasSimulation) {
        state.status = "Simulation lost";
        recording = false;
        boundSimulation = null;
        state.simLiveFrames = 0;
        return;
      }
      const elapsedSeconds = (performance.now() - startedAtMs) / 1000;
      const capture = buildRow(
        context,
        {
          ...frame,
          debugState: liveDebugState,
        },
        sampleIndex,
        elapsedSeconds,
      );
      rows.push(capture.values);
      state.lastRow = capture.object;
      sampleIndex += 1;
      state.sampleCount = rows.length;
      state.simLiveFrames += 1;
      state.status = "Recording";
    },
  };
}

function buildRow(context, frame, index, elapsedSeconds) {
  const sceneState = context.sceneState ?? {};
  const debugState = frame.debugState ?? sceneState.drivingSimulation?.getDebugState?.() ?? null;
  const track = context.track ?? null;
  const car = context.car ?? null;
  const runtimeDebug = context.runtimeDebug ?? null;
  const rawInput = frame.inputSnapshot ?? context.input?.snapshot?.() ?? null;
  const carRoot = sceneState.carRoot ?? null;
  const camera = context.camera ?? null;
  const cameraState = sceneState.chaseCamera?.getState?.() ?? null;
  const position = debugState?.chassisPosition ?? carRoot?.position ?? null;
  const velocity = debugState?.chassisVelocity ?? null;
  const angularVelocity = debugState?.chassisAngularVelocity ?? null;
  const quaternion = carRoot?.quaternion ?? null;
  const orientation = computeOrientation(quaternion);
  const frameDeltaSeconds = finite(frame.deltaSeconds, frame.measuredDeltaSeconds, 0);
  const speedMagnitude = vectorLength(velocity);
  const planarSpeed = velocity ? Math.hypot(velocity.x, velocity.z) : "";
  const rawThrottle = finite(debugState?.rawThrottleInput, rawInput?.throttle, 0);
  const rawBrake = finite(debugState?.rawBrakeInput, rawInput?.brake, 0);
  const rawSteer = finite(debugState?.rawSteerInput, rawInput?.steer, 0);
  const rawHandbrake = finite(debugState?.rawHandbrakeInput, rawInput?.handbrake, 0);
  const appliedSteer = finite(debugState?.steerState, debugState?.steer, 0);
  const sanityActive = rawThrottle > 0.25 || rawBrake > 0.25 || rawHandbrake > 0.25;
  const steerMissingUnderTurnTest =
    sanityActive && Math.abs(rawSteer) < 0.02 && Math.abs(appliedSteer) < 0.02 ? 1 : 0;
  const sanityMask = [
    rawThrottle > 0.05 ? "T" : "",
    rawBrake > 0.05 ? "B" : "",
    Math.abs(rawSteer) > 0.05 ? "S" : "",
    rawHandbrake > 0.05 ? "H" : "",
  ]
    .filter(Boolean)
    .join("");
  const row = {
    timestamp_utc: new Date().toISOString(),
    sample_index: index,
    race_time_seconds: elapsedSeconds,
    game_state: "WebPort",
    is_racing: Boolean(sceneState.drivingSimulation),
    is_paused: Boolean(runtimeDebug?.paused),
    level_id: track?.id ?? context.selection?.trackId ?? "",
    level_name: track?.name ?? track?.label ?? "",
    car_id: car?.id ?? context.selection?.carId ?? "",
    car_name: car?.name ?? car?.label ?? "",
    player_steer: finite(rawSteer, debugState?.steerRaw, debugState?.steer, 0),
    player_throttle: finite(rawThrottle, debugState?.throttle, 0),
    player_brake: finite(rawBrake, debugState?.brake, 0),
    position_x: coord(position, "x"),
    position_y: coord(position, "y"),
    position_z: coord(position, "z"),
    forward_x: orientation.forward.x,
    forward_y: orientation.forward.y,
    forward_z: orientation.forward.z,
    right_x: orientation.right.x,
    right_y: orientation.right.y,
    right_z: orientation.right.z,
    up_x: orientation.up.x,
    up_y: orientation.up.y,
    up_z: orientation.up.z,
    velocity_x: coord(velocity, "x"),
    velocity_y: coord(velocity, "y"),
    velocity_z: coord(velocity, "z"),
    angular_velocity_x: coord(angularVelocity, "x"),
    angular_velocity_y: coord(angularVelocity, "y"),
    angular_velocity_z: coord(angularVelocity, "z"),
    vehicle_applied_throttle: finite(debugState?.throttleAxis, 0),
    vehicle_applied_brake: finite(debugState?.brakeAxis, 0),
    vehicle_applied_handbrake: finite(debugState?.handbrakeAxis, 0),
    vehicle_control_candidate_1dfc: finite(debugState?.handbrakeAxis, 0),
    vehicle_applied_steer: appliedSteer,
    vehicle_frame_delta_ms: frameDeltaSeconds * 1000,
    vehicle_frame_delta_seconds: frameDeltaSeconds,
    speed_magnitude: speedMagnitude,
    planar_speed_magnitude: planarSpeed,
    yaw_radians: orientation.yaw,
    yaw_degrees: THREE.MathUtils.radToDeg(orientation.yaw),
    pitch_radians: orientation.pitch,
    pitch_degrees: THREE.MathUtils.radToDeg(orientation.pitch),
    roll_radians: orientation.roll,
    roll_degrees: THREE.MathUtils.radToDeg(orientation.roll),
    yaw_rate: finite(angularVelocity?.y, debugState?.yawRateDeg != null
      ? THREE.MathUtils.degToRad(debugState.yawRateDeg)
      : 0),
    quat_x: coord(quaternion, "x"),
    quat_y: coord(quaternion, "y"),
    quat_z: coord(quaternion, "z"),
    quat_w: coord(quaternion, "w"),
    camera_position_x: coord(camera?.position, "x"),
    camera_position_y: coord(camera?.position, "y"),
    camera_position_z: coord(camera?.position, "z"),
    camera_forward_x: cameraForward(camera).x,
    camera_forward_y: cameraForward(camera).y,
    camera_forward_z: cameraForward(camera).z,
    camera_fov: finite(camera?.fov, cameraState?.fov, "") === ""
      ? ""
      : THREE.MathUtils.degToRad(finite(camera?.fov, cameraState?.fov, 0)),
    camera_mode_index: finite(cameraState?.presetIndex, ""),
    camera_family: sceneState.chaseCamera ? "web_chase" : "orbit",
    web_telemetry_schema_version: "2026-04-28-slip-live-v5-loadtransfer",
    web_capture_has_simulation: debugState ? 1 : 0,
    web_gear: finite(debugState?.gear, ""),
    web_engine_rpm: finite(debugState?.engineRpm, ""),
    web_clutch: finite(debugState?.clutch, ""),
    web_steer_state: finite(debugState?.steerState, ""),
    web_steer_raw: finite(debugState?.steerRaw, ""),
    web_steer_limit: finite(debugState?.steerLimit, ""),
    web_steer_target: finite(debugState?.steerTarget, ""),
    web_steer_speed_kph: finite(debugState?.steerSpeedKph, ""),
    web_speed_forward: finite(debugState?.speedForward, ""),
    web_speed_right: finite(debugState?.speedRight, ""),
    web_front_grip_scale: finite(debugState?.frontGripScale, ""),
    web_rear_grip_scale: finite(debugState?.rearGripScale, ""),
    web_inertia_roll_torque: finite(debugState?.inertiaRollTorque, ""),
    web_inertia_pitch_torque: finite(debugState?.inertiaPitchTorque, ""),
    web_longitudinal_accel_filtered: finite(debugState?.longitudinalAccelFiltered, ""),
    web_lateral_accel_filtered: finite(debugState?.lateralAccelFiltered, ""),
    web_load_transfer_long: finite(debugState?.loadTransferLong, ""),
    web_load_transfer_lat: finite(debugState?.loadTransferLat, ""),
    web_aero_drag_force: finite(debugState?.aeroDragForce, ""),
    web_rolling_resistance_drag: finite(debugState?.rollingResistanceDrag, ""),
    web_brake_distance_scale: finite(debugState?.brakeDistanceScale, ""),
    web_slip_long_avg: finite(debugState?.slipLongAvg, ""),
    web_slip_lat_avg: finite(debugState?.slipLatAvg, ""),
    web_slip_angle_deg: finite(debugState?.slipAngleDeg, ""),
    web_surface_type: debugState?.surfaceType ?? "",
    web_surface_grip: finite(debugState?.surfaceGrip, ""),
    web_wheel_contacts: finite(debugState?.wheelContacts, ""),
    web_forward_impulse: finite(debugState?.forwardImpulse, ""),
    web_suspension_force: finite(debugState?.suspensionForce, ""),
    web_front_suspension_force_sum: finite(
      Math.abs(debugState?.wheels?.[0]?.suspensionForce ?? 0) +
        Math.abs(debugState?.wheels?.[1]?.suspensionForce ?? 0),
      "",
    ),
    web_rear_suspension_force_sum: finite(
      Math.abs(debugState?.wheels?.[2]?.suspensionForce ?? 0) +
        Math.abs(debugState?.wheels?.[3]?.suspensionForce ?? 0),
      "",
    ),
    web_suspension_force_front_rear_ratio: finite(
      (
        (Math.abs(debugState?.wheels?.[0]?.suspensionForce ?? 0) +
          Math.abs(debugState?.wheels?.[1]?.suspensionForce ?? 0)) /
        Math.max(
          Math.abs(debugState?.wheels?.[2]?.suspensionForce ?? 0) +
            Math.abs(debugState?.wheels?.[3]?.suspensionForce ?? 0),
          1e-4,
        )
      ),
      "",
    ),
    web_suspension_force_front_minus_rear: finite(
      (Math.abs(debugState?.wheels?.[0]?.suspensionForce ?? 0) +
        Math.abs(debugState?.wheels?.[1]?.suspensionForce ?? 0)) -
        (Math.abs(debugState?.wheels?.[2]?.suspensionForce ?? 0) +
          Math.abs(debugState?.wheels?.[3]?.suspensionForce ?? 0)),
      "",
    ),
    web_camera_fov_degrees: finite(camera?.fov, cameraState?.fov, ""),
    web_sim_steps: finite(debugState?.simSteps, ""),
    web_sim_backlog_ms: finite(debugState?.simBacklogMs, ""),
    web_wheel_0_forward_impulse: finite(debugState?.wheels?.[0]?.forwardImpulse, ""),
    web_wheel_0_suspension_force: finite(debugState?.wheels?.[0]?.suspensionForce, ""),
    web_wheel_0_angular_velocity: finite(debugState?.wheels?.[0]?.angularVelocity, ""),
    web_wheel_0_longitudinal_speed: finite(debugState?.wheels?.[0]?.wheelLongitudinalSpeed, ""),
    web_wheel_0_ground_relative_longitudinal_velocity: finite(
      debugState?.wheels?.[0]?.groundRelativeLongitudinalVelocity,
      "",
    ),
    web_wheel_0_slip_ratio: finite(debugState?.wheels?.[0]?.slipRatio, ""),
    web_wheel_1_forward_impulse: finite(debugState?.wheels?.[1]?.forwardImpulse, ""),
    web_wheel_1_suspension_force: finite(debugState?.wheels?.[1]?.suspensionForce, ""),
    web_wheel_1_angular_velocity: finite(debugState?.wheels?.[1]?.angularVelocity, ""),
    web_wheel_1_longitudinal_speed: finite(debugState?.wheels?.[1]?.wheelLongitudinalSpeed, ""),
    web_wheel_1_ground_relative_longitudinal_velocity: finite(
      debugState?.wheels?.[1]?.groundRelativeLongitudinalVelocity,
      "",
    ),
    web_wheel_1_slip_ratio: finite(debugState?.wheels?.[1]?.slipRatio, ""),
    web_wheel_2_forward_impulse: finite(debugState?.wheels?.[2]?.forwardImpulse, ""),
    web_wheel_2_suspension_force: finite(debugState?.wheels?.[2]?.suspensionForce, ""),
    web_wheel_2_angular_velocity: finite(debugState?.wheels?.[2]?.angularVelocity, ""),
    web_wheel_2_longitudinal_speed: finite(debugState?.wheels?.[2]?.wheelLongitudinalSpeed, ""),
    web_wheel_2_ground_relative_longitudinal_velocity: finite(
      debugState?.wheels?.[2]?.groundRelativeLongitudinalVelocity,
      "",
    ),
    web_wheel_2_slip_ratio: finite(debugState?.wheels?.[2]?.slipRatio, ""),
    web_wheel_3_forward_impulse: finite(debugState?.wheels?.[3]?.forwardImpulse, ""),
    web_wheel_3_suspension_force: finite(debugState?.wheels?.[3]?.suspensionForce, ""),
    web_wheel_3_angular_velocity: finite(debugState?.wheels?.[3]?.angularVelocity, ""),
    web_wheel_3_longitudinal_speed: finite(debugState?.wheels?.[3]?.wheelLongitudinalSpeed, ""),
    web_wheel_3_ground_relative_longitudinal_velocity: finite(
      debugState?.wheels?.[3]?.groundRelativeLongitudinalVelocity,
      "",
    ),
    web_wheel_3_slip_ratio: finite(debugState?.wheels?.[3]?.slipRatio, ""),
    web_input_throttle_raw: finite(rawThrottle, ""),
    web_input_brake_raw: finite(rawBrake, ""),
    web_input_steer_raw: finite(rawSteer, ""),
    web_input_handbrake_raw: finite(rawHandbrake, ""),
    web_input_reset_raw: finite(rawInput?.resetPressed, ""),
    web_input_version_raw: finite(frame.inputVersion, context.input?.version, ""),
    web_input_snapshot_present: rawInput ? 1 : 0,
    web_input_sanity_mask: sanityMask,
    web_input_steer_missing_under_turn_test: steerMissingUnderTurnTest,
  };

  for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
    addWheelFields(row, wheelIndex, debugState?.wheels?.[wheelIndex] ?? null);
  }

  return {
    object: row,
    values: FIELD_NAMES.map((fieldName) => row[fieldName] ?? ""),
  };
}

function addWheelFields(row, wheelIndex, wheel) {
  const prefix = `wheel_${wheelIndex}_`;
  row[`${prefix}contact_flag`] = finite(wheel?.contactFlag, 0);
  row[`${prefix}contact_ptr`] = wheel?.surfaceType ?? "";
  row[`${prefix}contact_surface_44_candidate`] = finite(wheel?.surfaceGrip, "");
  row[`${prefix}contact_surface_48_candidate`] = finite(wheel?.forwardImpulse, "");
  row[`${prefix}contact_surface_4c_candidate`] = finite(wheel?.suspensionForce, "");
  row[`${prefix}contact_surface_50_candidate`] = finite(wheel?.steerAngle, "");
  row[`${prefix}suspension_length_candidate`] = finite(wheel?.suspensionLength, "");
  row[`${prefix}tire_force_multiplier_candidate`] = finite(
    wheel?.tireForceMultiplierCandidate,
    "",
  );
  row[`${prefix}load_or_spin_candidate`] = finite(wheel?.loadOrSpinCandidate, "");
  row[`${prefix}rotation_or_phase_candidate`] = finite(
    wheel?.rotationOrPhaseCandidate,
    "",
  );
  row[`${prefix}vertical_load_candidate`] = finite(wheel?.verticalLoadCandidate, "");
}

function computeOrientation(quaternion) {
  if (!quaternion) {
    return {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
    };
  }

  const forward = TMP_FORWARD.copy(LOCAL_FORWARD).applyQuaternion(quaternion).normalize();
  const right = TMP_RIGHT.copy(LOCAL_RIGHT).applyQuaternion(quaternion).normalize();
  const up = TMP_UP.copy(LOCAL_UP).applyQuaternion(quaternion).normalize();
  const yaw = Math.atan2(forward.x, forward.z);
  const pitch = Math.atan2(-forward.y, Math.hypot(forward.x, forward.z));
  const roll = Math.atan2(right.y, up.y);
  return {
    forward: forward.clone(),
    right: right.clone(),
    up: up.clone(),
    yaw,
    pitch,
    roll,
  };
}

function cameraForward(camera) {
  if (!camera) {
    return TMP_CAMERA_FORWARD.set(0, 0, 0);
  }
  return camera.getWorldDirection(TMP_CAMERA_FORWARD);
}

function buildWheelFieldNames() {
  const fields = [];
  for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
    for (const suffix of WHEEL_FIELD_SUFFIXES) {
      fields.push(`wheel_${wheelIndex}_${suffix}`);
    }
  }
  return fields;
}

function downloadCsv(filename, rows) {
  const csv = [
    FIELD_NAMES.join(","),
    ...rows.map((row) => row.map(formatCsvValue).join(",")),
  ].join("\r\n");
  const blob = new Blob([`${csv}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFilename() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("Z", "Z");
  return `web_telemetry_${stamp}.csv`;
}

function formatCsvValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function finite(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return values.at(-1) ?? "";
}

function coord(vector, key) {
  return typeof vector?.[key] === "number" && Number.isFinite(vector[key])
    ? vector[key]
    : "";
}

function vectorLength(vector) {
  if (!vector) {
    return "";
  }
  return Math.hypot(vector.x ?? 0, vector.y ?? 0, vector.z ?? 0);
}
