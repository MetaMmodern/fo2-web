# Drift/Twitch Telemetry Comparison

Original: D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\original_flat_plane.csv
Web:      D:\flatout_oss\analysis\telemetry_runs\flat_plane_compare_2026-04-27\web_port_flat_plane.csv

## Straight Stability
rows: original=78.0000 web=523.00 delta=+445.00 (+570.5%)
roll_abs_avg_deg: original=0.0030 web=0.0177 delta=+0.0147 (+490.2%)
roll_abs_p95_deg: original=0.0032 web=0.0367 delta=+0.0335 (+1043.1%)
roll_drift_deg_per_s: original=0.0000 web=0.0000 delta=+0.0000 (+942.1%)
yaw_rate_std: original=0.0000 web=0.0000 delta=-0.0000 (-100.0%)

## Handbrake Drift
rows: original=15.0000 web=29.0000 delta=+14.0000 (+93.3%)
yaw_rate_abs_avg: original=1.0823 web=1.9443 delta=+0.8619 (+79.6%)
speed_decel_avg_mps2: original=10.4264 web=21.9893 delta=+11.5630 (+110.9%)
web_slip_lat_avg: original=-- web=0.2071 delta=--
web_slip_long_avg: original=-- web=0.1340 delta=--

## High-Speed Steering Twitch
rows: original=8.0000 web=13.0000 delta=+5.0000 (+62.5%)
yaw_rate_abs_avg: original=0.6980 web=1.1733 delta=+0.4753 (+68.1%)
yaw_jerk_abs_p95: original=4.2492 web=26.2767 delta=+22.0275 (+518.4%)
web_steer_state_lag_avg: original=0.2552 web=0.6986 delta=+0.4434 (+173.8%)

## General
rows_total: original=489.00 web=2373.00 delta=+1884.00 (+385.3%)
speed_max_mps: original=23.9107 web=18.8330 delta=-5.0777 (-21.2%)

## Camera
rows: original=489.00 web=2373.00 delta=+1884.00 (+385.3%)
camera_distance_avg_m: original=4.0562 web=3.2679 delta=-0.7883 (-19.4%)
camera_distance_p95_m: original=4.3107 web=3.4486 delta=-0.8621 (-20.0%)
camera_height_offset_avg_m: original=1.4239 web=1.0531 delta=-0.3708 (-26.0%)
camera_fov_avg_rad: original=1.7412 web=1.7409 delta=-0.0003 (-0.0%)
camera_fov_delta_rate_p95: original=0.0000 web=0.0000 delta=+0.0000
camera_mode_switch_count: original=5.0000 web=5.0000 delta=+0.0000 (+0.0%)
camera_forward_alignment_avg: original=0.9638 web=0.9721 delta=+0.0084 (+0.9%)