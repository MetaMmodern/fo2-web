# Flat Plane Comparison Run - 2026-04-27

## Files

- `original_flat_plane.csv`
  - Source: `C:\Users\just me\Desktop\Reloaded-II\User\Mods\flatout2.telemetry.runtime\phase1_basic.20260426-201703.csv`
  - Rows: 489
  - Sampling: original-game logger, approximately 100 ms

- `web_port_flat_plane.csv`
  - Source: `C:\Users\just me\Downloads\web_telemetry_2026-04-26T201841309Z.csv`
  - Rows: 2373
  - Sampling: web logger, per rendered frame

## Test Notes

- Flat plane only.
- Original-game run includes a brief accidental reverse input during the braking step.
- Original hard-left input/yaw is negative in this run; web hard-left input/yaw is positive. Comparison scripts should either compare magnitudes or apply a steering/yaw sign normalization.
- In this copied web CSV, `camera_fov` is in degrees. The web logger was updated after this run so future CSVs write `camera_fov` in radians to match original telemetry, with `web_camera_fov_degrees` appended for readability.
- Wheel spin is populated in this web run: `wheel_*_load_or_spin_candidate` is no longer dead at zero.

## Comparison Command

- Run drift/twitch summary:
  - `node tools/telemetry-drift-twitch-report.mjs --original=<original.csv> --web=<web.csv> --out=<report.md>`
- Default inputs (when args are omitted):
  - `analysis/telemetry_runs/flat_plane_compare_2026-04-27/original_flat_plane.csv`
  - `analysis/telemetry_runs/flat_plane_compare_2026-04-27/web_port_flat_plane.csv`

## Headless Web Capture

- Generate deterministic web telemetry (no manual driving required):
  - `node tools/telemetry-headless-run.mjs --car=car_1 --out=analysis/telemetry_runs/flat_plane_compare_2026-04-27/web_headless_car_1_current.csv`
- The headless scenario includes:
  - straight throttle,
  - hard steer without handbrake,
  - hard steer with handbrake,
  - high-speed weave section for twitch detection.
