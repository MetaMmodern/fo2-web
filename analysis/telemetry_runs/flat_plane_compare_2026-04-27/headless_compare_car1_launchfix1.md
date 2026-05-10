# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      d:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_headless_car_1_launchfix1.csv

## Straight Stability
rows: original=78.0000 web=107.00 delta=+29.0000 (+37.2%)
roll_abs_avg_deg: original=0.0030 web=0.0431 delta=+0.0402 (+1339.6%)
roll_abs_p95_deg: original=0.0032 web=0.0580 delta=+0.0547 (+1706.2%)
roll_drift_deg_per_s: original=0.0000 web=-0.0006 delta=-0.0006 (-77950.9%)
yaw_rate_std: original=0.0000 web=0.0377 delta=+0.0377 (+763567.2%)

## Handbrake Drift
rows: original=15.0000 web=20.0000 delta=+5.0000 (+33.3%)
yaw_rate_abs_avg: original=1.0823 web=1.4673 delta=+0.3849 (+35.6%)
speed_decel_avg_mps2: original=10.4264 web=10.1260 delta=-0.3003 (-2.9%)
web_slip_lat_avg: original=-- web=0.0829 delta=--
web_slip_long_avg: original=-- web=0.0472 delta=--
slip_angle_deg_avg: original=18.7890 web=4.7591 delta=-14.0299 (-74.7%)

## High-Speed Steering Twitch
rows: original=8.0000 web=27.0000 delta=+19.0000 (+237.5%)
yaw_rate_abs_avg: original=0.6980 web=0.6637 delta=-0.0343 (-4.9%)
yaw_jerk_abs_p95: original=4.2492 web=5.3165 delta=+1.0673 (+25.1%)
web_steer_state_lag_avg: original=0.2552 web=0.4012 delta=+0.1460 (+57.2%)
slip_angle_deg_avg: original=3.4399 web=1.2354 delta=-2.2045 (-64.1%)

## Tire Slip Proxies
hb_rear_wheel_spin_abs_avg: original=0.3597 web=82.9353 delta=+82.5757 (+22958.6%)
hb_front_wheel_spin_abs_avg: original=0.5439 web=82.9351 delta=+82.3912 (+15148.4%)
hb_rear_front_spin_ratio: original=0.6613 web=1.0000 delta=+0.3387 (+51.2%)
hb_rear_grip_proxy_abs_avg: original=0.5806 web=75.2505 delta=+74.6699 (+12860.9%)
hb_front_grip_proxy_abs_avg: original=0.1457 web=9.5636 delta=+9.4179 (+6464.0%)
hb_rear_front_grip_proxy_ratio: original=3.9850 web=7.8685 delta=+3.8835 (+97.5%)

## General
rows_total: original=489.00 web=241.00 delta=-248.00 (-50.7%)
speed_max_mps: original=23.9107 web=34.9193 delta=+11.0086 (+46.0%)

## Camera
rows: original=489.00 web=0.0000 delta=-489.00 (-100.0%)
camera_distance_avg_m: original=4.0562 web=-- delta=--
camera_distance_p95_m: original=4.3107 web=-- delta=--
camera_height_offset_avg_m: original=1.4239 web=-- delta=--
camera_fov_avg_rad: original=1.7412 web=-- delta=--
camera_fov_delta_rate_p95: original=0.0000 web=-- delta=--
camera_mode_switch_count: original=5.0000 web=0.0000 delta=-5.0000 (-100.0%)
camera_forward_alignment_avg: original=0.9638 web=-- delta=--