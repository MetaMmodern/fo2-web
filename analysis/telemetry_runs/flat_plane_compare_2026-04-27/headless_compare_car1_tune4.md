# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_tune4.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0274 delta=+0.0244 (+814.6%)
roll_abs_p95_deg: original=0.0032 web=0.0536 delta=+0.0504 (+1571.2%)
roll_drift_deg_per_s: original=0.0000 web=-0.0025 delta=-0.0025 (-339227.4%)
yaw_rate_std: original=0.0000 web=0.2616 delta=+0.2616 (+5297776.6%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4709 delta=+0.3886 (+35.9%)
speed_decel_avg_mps2: original=10.4264 web=10.0089 delta=-0.4175 (-4.0%)
web_slip_lat_avg: original=-- web=0.0700 delta=--
web_slip_long_avg: original=-- web=0.0443 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=35.0000 delta=+27.0000 (+337.5%)
yaw_rate_abs_avg: original=0.6980 web=0.7395 delta=+0.0415 (+5.9%)
yaw_jerk_abs_p95: original=4.2492 web=4.6004 delta=+0.3512 (+8.3%)
web_steer_state_lag_avg: original=0.2552 web=0.3470 delta=+0.0918 (+36.0%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1688 delta=+12.2581 (+51.3%)