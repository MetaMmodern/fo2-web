# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_slip2.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0274 delta=+0.0244 (+813.8%)
roll_abs_p95_deg: original=0.0032 web=0.0537 delta=+0.0505 (+1572.9%)
roll_drift_deg_per_s: original=0.0000 web=-0.0025 delta=-0.0025 (-338642.4%)
yaw_rate_std: original=0.0000 web=0.2616 delta=+0.2615 (+5296165.0%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4178 delta=+0.3355 (+31.0%)
speed_decel_avg_mps2: original=10.4264 web=10.0373 delta=-0.3891 (-3.7%)
web_slip_lat_avg: original=-- web=0.0724 delta=--
web_slip_long_avg: original=-- web=0.0430 delta=--
slip_angle_deg_avg: original=18.7890 web=4.1570 delta=-14.6320 (-77.9%)

## High-Speed Steering Twitch
rows: original=8.0000 web=33.0000 delta=+25.0000 (+312.5%)
yaw_rate_abs_avg: original=0.6980 web=0.7229 delta=+0.0249 (+3.6%)
yaw_jerk_abs_p95: original=4.2492 web=5.6688 delta=+1.4196 (+33.4%)
web_steer_state_lag_avg: original=0.2552 web=0.3592 delta=+0.1040 (+40.7%)
slip_angle_deg_avg: original=3.4399 web=1.5619 delta=-1.8780 (-54.6%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=87.7915 delta=+87.4318 (+24308.7%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=87.7913 delta=+87.2474 (+16041.2%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=74.1987 delta=+73.6181 (+12679.7%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=9.3390 delta=+9.1933 (+6309.9%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.9450 delta=+3.9601 (+99.4%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=36.1678 delta=+12.2570 (+51.3%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--