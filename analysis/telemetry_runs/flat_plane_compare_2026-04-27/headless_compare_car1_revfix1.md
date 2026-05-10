# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_revfix1.csv

## Straight Stability
rows: original=78.0000 web=110.00 delta=+32.0000 (+41.0%)
roll_abs_avg_deg: original=0.0030 web=0.0291 delta=+0.0261 (+869.7%)
roll_abs_p95_deg: original=0.0032 web=0.0503 delta=+0.0471 (+1468.9%)
roll_drift_deg_per_s: original=0.0000 web=-0.0040 delta=-0.0040 (-544249.2%)
yaw_rate_std: original=0.0000 web=0.3627 delta=+0.3627 (+7344740.7%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4966 delta=+0.4142 (+38.3%)
speed_decel_avg_mps2: original=10.4264 web=10.1484 delta=-0.2780 (-2.7%)
web_slip_lat_avg: original=-- web=0.0895 delta=--
web_slip_long_avg: original=-- web=0.0498 delta=--
slip_angle_deg_avg: original=18.7890 web=5.1401 delta=-13.6488 (-72.6%)

## High-Speed Steering Twitch
rows: original=8.0000 web=27.0000 delta=+19.0000 (+237.5%)
yaw_rate_abs_avg: original=0.6980 web=0.6739 delta=-0.0241 (-3.5%)
yaw_jerk_abs_p95: original=4.2492 web=5.8471 delta=+1.5979 (+37.6%)
web_steer_state_lag_avg: original=0.2552 web=0.3965 delta=+0.1413 (+55.4%)
slip_angle_deg_avg: original=3.4399 web=1.2683 delta=-2.1716 (-63.1%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=80.0925 delta=+79.7329 (+22168.2%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=80.0923 delta=+79.5484 (+14625.7%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=75.8298 delta=+75.2492 (+12960.7%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=9.7126 delta=+9.5669 (+6566.3%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.8074 delta=+3.8224 (+95.9%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=34.1812 delta=+10.2705 (+43.0%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--