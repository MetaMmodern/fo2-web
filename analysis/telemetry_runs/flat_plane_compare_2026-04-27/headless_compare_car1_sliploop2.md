# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_sliploop2.csv

## Straight Stability
rows: original=78.0000 web=111.00 delta=+33.0000 (+42.3%)
roll_abs_avg_deg: original=0.0030 web=0.0267 delta=+0.0237 (+791.4%)
roll_abs_p95_deg: original=0.0032 web=0.0532 delta=+0.0500 (+1556.8%)
roll_drift_deg_per_s: original=0.0000 web=-0.0024 delta=-0.0024 (-320437.1%)
yaw_rate_std: original=0.0000 web=0.2576 delta=+0.2576 (+5215667.6%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4252 delta=+0.3429 (+31.7%)
speed_decel_avg_mps2: original=10.4264 web=10.0802 delta=-0.3461 (-3.3%)
web_slip_lat_avg: original=-- web=0.0750 delta=--
web_slip_long_avg: original=-- web=0.0440 delta=--
slip_angle_deg_avg: original=18.7890 web=4.3077 delta=-14.4813 (-77.1%)

## High-Speed Steering Twitch
rows: original=8.0000 web=27.0000 delta=+19.0000 (+237.5%)
yaw_rate_abs_avg: original=0.6980 web=0.6359 delta=-0.0621 (-8.9%)
yaw_jerk_abs_p95: original=4.2492 web=5.3153 delta=+1.0661 (+25.1%)
web_steer_state_lag_avg: original=0.2552 web=0.4068 delta=+0.1516 (+59.4%)
slip_angle_deg_avg: original=3.4399 web=1.0454 delta=-2.3945 (-69.6%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=86.3686 delta=+86.0089 (+23913.1%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=86.3686 delta=+85.8247 (+15779.6%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=74.5138 delta=+73.9332 (+12734.0%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=9.1352 delta=+8.9895 (+6170.0%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=8.1568 delta=+4.1718 (+104.7%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=35.8009 delta=+11.8902 (+49.7%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--