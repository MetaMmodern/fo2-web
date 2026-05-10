# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_port_manual_latest_2026-04-27T202909706Z.csv

## Straight Stability
rows: original=78.0000 web=468.00 delta=+390.00 (+500.0%)
roll_abs_avg_deg: original=0.0030 web=0.0599 delta=+0.0569 (+1897.3%)
roll_abs_p95_deg: original=0.0032 web=0.4633 delta=+0.4601 (+14337.5%)
roll_drift_deg_per_s: original=0.0000 web=0.0005 delta=+0.0005 (+73227.7%)
yaw_rate_std: original=0.0000 web=0.6825 delta=+0.6825 (+13819434.2%)

## Handbrake Drift
rows: original=15.0000 web=86.0000 delta=+71.0000 (+473.3%)
yaw_rate_abs_avg: original=1.0823 web=2.4656 delta=+1.3832 (+127.8%)
speed_decel_avg_mps2: original=10.4264 web=13.9772 delta=+3.5509 (+34.1%)
web_slip_lat_avg: original=-- web=0.0991 delta=--
web_slip_long_avg: original=-- web=0.0873 delta=--
slip_angle_deg_avg: original=18.7890 web=5.7001 delta=-13.0889 (-69.7%)

## High-Speed Steering Twitch
rows: original=8.0000 web=193.00 delta=+185.00 (+2312.5%)
yaw_rate_abs_avg: original=0.6980 web=1.8387 delta=+1.1407 (+163.4%)
yaw_jerk_abs_p95: original=4.2492 web=25.6961 delta=+21.4469 (+504.7%)
web_steer_state_lag_avg: original=0.2552 web=0.7279 delta=+0.4727 (+185.2%)
slip_angle_deg_avg: original=3.4399 web=3.1225 delta=-0.3174 (-9.2%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=73.6266 delta=+73.2670 (+20370.5%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=73.6314 delta=+73.0875 (+13437.8%)
hb_rear_front_spin_ratio: original=0.6613 web=0.9999 delta=+0.3386 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=77.2812 delta=+76.7006 (+13210.6%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=0.5366 delta=+0.3909 (+268.3%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=144.03 delta=+140.05 (+3514.3%)

## General
rows_total: original=489.00 web=2591.00 delta=+2102.00 (+429.9%)
speed_max_mps: original=23.9107 web=32.1517 delta=+8.2410 (+34.5%)

## Camera
rows: original=489.00 web=2591.00 delta=+2102.00 (+429.9%)
camera_distance_avg_m: original=4.0562 web=4.0960 delta=+0.0398 (+1.0%)
camera_distance_p95_m: original=4.3107 web=4.3078 delta=-0.0029 (-0.1%)
camera_height_offset_avg_m: original=1.4239 web=1.5730 delta=+0.1491 (+10.5%)
camera_fov_avg_rad: original=1.7412 web=1.7415 delta=+0.0003 (+0.0%)
camera_fov_delta_rate_p95: original=0.0000 web=0.0000 delta=+0.0000
camera_mode_switch_count: original=5.0000 web=5.0000 delta=+0.0000 (+0.0%)
camera_forward_alignment_avg: original=0.9638 web=0.9581 delta=-0.0057 (-0.6%)