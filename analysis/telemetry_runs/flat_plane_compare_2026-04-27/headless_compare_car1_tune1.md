# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_tune1.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0282 delta=+0.0252 (+842.0%)
roll_abs_p95_deg: original=0.0032 web=0.0548 delta=+0.0516 (+1608.6%)
roll_drift_deg_per_s: original=0.0000 web=-0.0027 delta=-0.0027 (-361065.5%)
yaw_rate_std: original=0.0000 web=0.2649 delta=+0.2649 (+5364331.8%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.5979 delta=+0.5156 (+47.6%)
speed_decel_avg_mps2: original=10.4264 web=9.0374 delta=-1.3890 (-13.3%)
web_slip_lat_avg: original=-- web=0.0586 delta=--
web_slip_long_avg: original=-- web=0.0458 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=36.0000 delta=+28.0000 (+350.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7855 delta=+0.0875 (+12.5%)
yaw_jerk_abs_p95: original=4.2492 web=4.9883 delta=+0.7391 (+17.4%)
web_steer_state_lag_avg: original=0.2552 web=0.3476 delta=+0.0924 (+36.2%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1723 delta=+12.2616 (+51.3%)