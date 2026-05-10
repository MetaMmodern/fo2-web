# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_tune5.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0280 delta=+0.0250 (+835.5%)
roll_abs_p95_deg: original=0.0032 web=0.0543 delta=+0.0510 (+1590.8%)
roll_drift_deg_per_s: original=0.0000 web=-0.0026 delta=-0.0026 (-355887.9%)
yaw_rate_std: original=0.0000 web=0.2642 delta=+0.2642 (+5349139.1%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.3661 delta=+0.2837 (+26.2%)
speed_decel_avg_mps2: original=10.4264 web=9.2352 delta=-1.1911 (-11.4%)
web_slip_lat_avg: original=-- web=0.0663 delta=--
web_slip_long_avg: original=-- web=0.0395 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=36.0000 delta=+28.0000 (+350.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7745 delta=+0.0765 (+11.0%)
yaw_jerk_abs_p95: original=4.2492 web=5.4760 delta=+1.2268 (+28.9%)
web_steer_state_lag_avg: original=0.2552 web=0.3425 delta=+0.0873 (+34.2%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1576 delta=+12.2469 (+51.2%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--