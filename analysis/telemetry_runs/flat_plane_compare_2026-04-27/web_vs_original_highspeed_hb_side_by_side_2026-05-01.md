# Web vs Original: High-Speed Handbrake Side-by-Side (2026-05-01)

Context:
- Original source CSV: `original_car16_hb_trail_suite_2026-04-30_source_of_truth.csv`
- Web runtime: live DevTools scripted runs after latest handbrake/yaw tuning
- Window: `2.2s` from `handbrake_down`

## Original (from CSV, high-speed HB starts)

Detected starts (`vehicle_applied_handbrake` rising under steering, high speed):

1. `t=59.18s`
   - start speed: `132.43 kph`
   - end speed @2.2s: `2.54 kph`
   - drop: `129.89 kph`
   - peak yaw rate: `1.983 rad/s` (`~113.6 deg/s`)

2. `t=78.28s`
   - start speed: `119.37 kph`
   - end speed @2.2s: `0.94 kph`
   - drop: `118.43 kph`
   - peak yaw rate: `2.0835 rad/s` (`~119.4 deg/s`)

## Web (live scripted)

Run A (`target ~125 kph`):
- start speed: `124.62 kph`
- end speed @2.2s: `52.40 kph`
- drop: `72.22 kph`
- peak yaw rate: `2.493 rad/s` (`~142.7 deg/s`)

Run B (`target ~118 kph`):
- start speed: `117.15 kph`
- end speed @2.2s: `19.40 kph`
- drop: `97.75 kph`
- peak yaw rate: `2.487 rad/s` (`~142.7 deg/s`)

## Direct mismatch summary

- Web yaw is still too high at high speed:
  - original: `~114-119 deg/s`
  - web: `~143 deg/s`
- Web deceleration is inconsistent vs original across high-speed entries:
  - at `~125 kph`, web under-brakes relative to original (`52 kph` vs near-stop),
  - at `~118 kph`, web is closer, but still not original near-stop profile.

## Twitch audit (web)

Steady-speed steering hold test (no handbrake, ~90 kph):
- yaw sign flips: `0`
- observed issue is not sign-flip oscillation in this deterministic run.

Interpretation:
- “twitch” is more likely coming from high yaw authority / grip transition shape under steering load, not a literal yaw sign oscillation.

## Conclusion

User concern is confirmed: high-speed handbrake is still not correct in web parity terms.
- Need lower yaw authority at high speed.
- Need stronger *but smoother* longitudinal slowdown curve (closer to original near-stop behavior by ~2.2s), without reintroducing over-rotation.
