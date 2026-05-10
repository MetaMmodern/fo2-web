# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_slip1.csv

## Straight Stability
rows: original=78.0000 web=108.00 delta=+30.0000 (+38.5%)
roll_abs_avg_deg: original=0.0030 web=0.0278 delta=+0.0248 (+826.8%)
roll_abs_p95_deg: original=0.0032 web=0.0541 delta=+0.0509 (+1584.9%)
roll_drift_deg_per_s: original=0.0000 web=-0.0026 delta=-0.0026 (-349019.9%)
yaw_rate_std: original=0.0000 web=0.2631 delta=+0.2631 (+5328371.0%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4722 delta=+0.3899 (+36.0%)
speed_decel_avg_mps2: original=10.4264 web=9.5799 delta=-0.8465 (-8.1%)
web_slip_lat_avg: original=-- web=0.0670 delta=--
web_slip_long_avg: original=-- web=0.0434 delta=--
slip_angle_deg_avg: original=18.7890 web=3.8468 delta=-14.9422 (-79.5%)

## High-Speed Steering Twitch
rows: original=8.0000 web=36.0000 delta=+28.0000 (+350.0%)
yaw_rate_abs_avg: original=0.6980 web=0.7598 delta=+0.0618 (+8.8%)
yaw_jerk_abs_p95: original=4.2492 web=5.1860 delta=+0.9369 (+22.0%)
web_steer_state_lag_avg: original=0.2552 web=0.3425 delta=+0.0873 (+34.2%)
slip_angle_deg_avg: original=3.4399 web=1.4849 delta=-1.9550 (-56.8%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=89.2351 delta=+88.8754 (+24710.1%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=89.2350 delta=+88.6911 (+16306.7%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=69.8441 delta=+69.2635 (+11929.7%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=8.9719 delta=+8.8262 (+6057.9%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.7848 delta=+3.7998 (+95.4%)

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