# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_sliploop3.csv

## Straight Stability
rows: original=78.0000 web=111.00 delta=+33.0000 (+42.3%)
roll_abs_avg_deg: original=0.0030 web=0.0265 delta=+0.0235 (+785.0%)
roll_abs_p95_deg: original=0.0032 web=0.0530 delta=+0.0498 (+1553.0%)
roll_drift_deg_per_s: original=0.0000 web=-0.0023 delta=-0.0023 (-314896.7%)
yaw_rate_std: original=0.0000 web=0.2567 delta=+0.2567 (+5198083.4%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4760 delta=+0.3936 (+36.4%)
speed_decel_avg_mps2: original=10.4264 web=10.2786 delta=-0.1478 (-1.4%)
web_slip_lat_avg: original=-- web=0.0722 delta=--
web_slip_long_avg: original=-- web=0.0461 delta=--
slip_angle_deg_avg: original=18.7890 web=4.1482 delta=-14.6408 (-77.9%)

## High-Speed Steering Twitch
rows: original=8.0000 web=27.0000 delta=+19.0000 (+237.5%)
yaw_rate_abs_avg: original=0.6980 web=0.6279 delta=-0.0701 (-10.0%)
yaw_jerk_abs_p95: original=4.2492 web=5.6725 delta=+1.4233 (+33.5%)
web_steer_state_lag_avg: original=0.2552 web=0.4065 delta=+0.1514 (+59.3%)
slip_angle_deg_avg: original=3.4399 web=1.1517 delta=-2.2882 (-66.5%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=85.6725 delta=+85.3128 (+23719.6%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=85.6725 delta=+85.1286 (+15651.7%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=74.6580 delta=+74.0774 (+12758.8%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=9.3795 delta=+9.2338 (+6337.6%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.9597 delta=+3.9748 (+99.7%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=35.8027 delta=+11.8920 (+49.7%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--