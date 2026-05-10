# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_sliploop4.csv

## Straight Stability
rows: original=78.0000 web=111.00 delta=+33.0000 (+42.3%)
roll_abs_avg_deg: original=0.0030 web=0.0287 delta=+0.0257 (+858.8%)
roll_abs_p95_deg: original=0.0032 web=0.0496 delta=+0.0464 (+1446.9%)
roll_drift_deg_per_s: original=0.0000 web=-0.0039 delta=-0.0039 (-524324.1%)
yaw_rate_std: original=0.0000 web=0.3604 delta=+0.3604 (+7298274.3%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.5367 delta=+0.4544 (+42.0%)
speed_decel_avg_mps2: original=10.4264 web=10.3320 delta=-0.0944 (-0.9%)
web_slip_lat_avg: original=-- web=0.0861 delta=--
web_slip_long_avg: original=-- web=0.0515 delta=--
slip_angle_deg_avg: original=18.7890 web=4.9468 delta=-13.8422 (-73.7%)

## High-Speed Steering Twitch
rows: original=8.0000 web=27.0000 delta=+19.0000 (+237.5%)
yaw_rate_abs_avg: original=0.6980 web=0.6740 delta=-0.0240 (-3.4%)
yaw_jerk_abs_p95: original=4.2492 web=5.6941 delta=+1.4449 (+34.0%)
web_steer_state_lag_avg: original=0.2552 web=0.3966 delta=+0.1414 (+55.4%)
slip_angle_deg_avg: original=3.4399 web=1.2701 delta=-2.1699 (-63.1%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=79.6267 delta=+79.2670 (+22038.7%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=79.6266 delta=+79.0827 (+14540.1%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=75.9020 delta=+75.3214 (+12973.1%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=10.0174 delta=+9.8717 (+6775.5%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.5770 delta=+3.5921 (+90.1%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=34.2451 delta=+10.3344 (+43.2%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--