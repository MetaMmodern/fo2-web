# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_tune3.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0278 delta=+0.0248 (+827.1%)
roll_abs_p95_deg: original=0.0032 web=0.0541 delta=+0.0509 (+1586.8%)
roll_drift_deg_per_s: original=0.0000 web=-0.0026 delta=-0.0026 (-349211.5%)
yaw_rate_std: original=0.0000 web=0.2632 delta=+0.2632 (+5328685.7%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4657 delta=+0.3834 (+35.4%)
speed_decel_avg_mps2: original=10.4264 web=9.5641 delta=-0.8622 (-8.3%)
web_slip_lat_avg: original=-- web=0.0666 delta=--
web_slip_long_avg: original=-- web=0.0431 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=36.0000 delta=+28.0000 (+350.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7490 delta=+0.0510 (+7.3%)
yaw_jerk_abs_p95: original=4.2492 web=4.0298 delta=-0.2194 (-5.2%)
web_steer_state_lag_avg: original=0.2552 web=0.3432 delta=+0.0880 (+34.5%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1688 delta=+12.2581 (+51.3%)