# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_current.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0274 delta=+0.0244 (+815.1%)
roll_abs_p95_deg: original=0.0032 web=0.0536 delta=+0.0504 (+1569.4%)
roll_drift_deg_per_s: original=0.0000 web=-0.0025 delta=-0.0025 (-340400.0%)
yaw_rate_std: original=0.0000 web=0.2639 delta=+0.2639 (+5344216.7%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.8044 delta=+0.7221 (+66.7%)
speed_decel_avg_mps2: original=10.4264 web=10.0664 delta=-0.3600 (-3.5%)
web_slip_lat_avg: original=-- web=0.0545 delta=--
web_slip_long_avg: original=-- web=0.0541 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=36.0000 delta=+28.0000 (+350.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7703 delta=+0.0723 (+10.4%)
yaw_jerk_abs_p95: original=1.7249 web=2.5597 delta=+0.8347 (+48.4%)
web_steer_state_lag_avg: original=0.2552 web=0.3463 delta=+0.0912 (+35.7%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1475 delta=+12.2368 (+51.2%)