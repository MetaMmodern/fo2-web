# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_tune2.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0274 delta=+0.0244 (+813.6%)
roll_abs_p95_deg: original=0.0032 web=0.0536 delta=+0.0504 (+1569.4%)
roll_drift_deg_per_s: original=0.0000 web=-0.0025 delta=-0.0025 (-338534.3%)
yaw_rate_std: original=0.0000 web=0.2615 delta=+0.2615 (+5296020.9%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.6073 delta=+0.5250 (+48.5%)
speed_decel_avg_mps2: original=10.4264 web=10.0665 delta=-0.3598 (-3.5%)
web_slip_lat_avg: original=-- web=0.0671 delta=--
web_slip_long_avg: original=-- web=0.0484 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=34.0000 delta=+26.0000 (+325.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7247 delta=+0.0268 (+3.8%)
yaw_jerk_abs_p95: original=4.2492 web=4.2198 delta=-0.0294 (-0.7%)
web_steer_state_lag_avg: original=0.2552 web=0.3552 delta=+0.1000 (+39.2%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1723 delta=+12.2616 (+51.3%)