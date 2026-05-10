# Original FO2 Bullet Donut Trace (Per-Row)

Source CSV copied from Reloaded mod output:

- `C:\Users\just me\Desktop\Reloaded-II\User\Mods\flatout2.telemetry.runtime\phase1_basic.20260428-114719.csv`
- copied to:
  - `analysis/telemetry_runs/flat_plane_compare_2026-04-27/original_car16_bullet_donut_lr_handbrake_2026-04-28.csv`

## Run summary

- Total rows: `156`
- Two throttle-on maneuver windows:
  - Window A (right donut): throttle ramp starts around row `30` (`t=0.95s`)
  - Window B (left donut): throttle ramp starts around row `86` (`t=6.55s`)
- Handbrake is ramped (not binary instant):
  - Window A handbrake ramp: rows `71..76` (`hb: 0.16 -> 1.00`)
  - Window B handbrake ramp: rows `128..132` (`hb: 0.20 -> 1.00`)

## Control timeline (one side to replay)

Primary replay target (Window A / right donut):

1. Rows `30..34` (`t=0.95..1.35s`):
   - `player_throttle` ramps `0.24 -> 1.00`
   - `player_steer` ramps `0.08 -> 1.00`
2. Rows `34..69` (`t=1.35..4.85s`):
   - sustained `throttle=1`, `steer=1`
3. Rows `71..76` (`t=5.05..5.55s`):
   - throttle dropped to `0`
   - handbrake ramps `0.16 -> 1.00`

Equivalent opposite side exists in Window B (`steer=-1`), but one side is enough for port replay parity checks.

## Per-wheel row-to-row behavior (not averages)

### Window A (right donut, `steer=+1`)

Early slip build (`rows 34..45`):

- `wheel_0_load_or_spin_candidate`: `-0.150 -> -0.216`
- `wheel_1_load_or_spin_candidate`: `-0.027 -> -0.088`
- `wheel_2_load_or_spin_candidate`: `+0.038 -> -0.067`
- `wheel_3_load_or_spin_candidate`: `+0.028 -> -0.036`

Mature donut (`rows 52..63`):

- `wheel_0`: `-0.374 -> -0.537`
- `wheel_1`: `-0.283 -> -0.003` (approaches near zero while others continue diverging)
- `wheel_2`: `-0.478 -> -1.455` (largest magnitude growth)
- `wheel_3`: `-0.326 -> -0.925`

Peak asymmetry region (`rows 63..69`):

- `wheel_2` and `wheel_3` keep growing in magnitude (`-1.455`, `-0.925` to `-1.376`, `-0.848`)
- `wheel_1` hovers near zero (`-0.003` to `-0.015`)
- This is a strong per-wheel separation signature during sustained throttle+steer donut.

Handbrake onset (`rows 71..76`):

- `hb`: `0.16 -> 1.00`
- `wheel_2`: `-1.208 -> -0.151` (rapid collapse toward zero)
- `wheel_3`: `-0.743 -> -0.134` (rapid collapse)
- `wheel_0`: `-0.266 -> -0.004`
- `wheel_1`: `+0.035 -> +0.004`

### Window B (left donut, `steer=-1`)

The sign pattern flips and per-wheel dominance shifts:

- Sustained donut (`rows 106..121`) shows largest positive magnitude on `wheel_3`:
  - `wheel_3`: `+0.315 -> +1.469`
  - `wheel_2`: `+0.249 -> +0.937`
  - `wheel_1`: `+0.327 -> +0.545`
  - `wheel_0`: `+0.224 -> +0.006` (drops near zero in late phase)

Late Window B (`rows 118..126`):

- `wheel_0` near zero while others remain large:
  - row `119`: `w0=-0.003`, `w1=+0.546`, `w2=+0.937`, `w3=+1.465`

Handbrake onset (`rows 128..132`):

- `hb`: `0.20 -> 1.00`
- rapid decay of all wheel spin candidates toward near-zero.

## Practical replay target for web port

To recreate this behavior in the port, script this control sequence:

1. Start from rest.
2. Hold `accelerate + right` for about `3-4s` (or until side-door visual cue).
3. Release throttle and ramp handbrake for about `0.5s`.

Expected wheel signature to match:

- sustained maneuver should show strong wheel-to-wheel separation (not uniform slip on all 4 wheels)
- one wheel can approach near-zero while others keep high magnitude
- handbrake should collapse spin candidates quickly across all wheels.

## Deferred camera note

- Current web chase camera is too rear-locked during sideways motion; it does not hold world-space framing as the car yaws.
- Not blocking tire-slip work right now.
- Follow-up idea to investigate later:
  - use alternate-camera mod runtime switching and inspect live memory deltas for camera state fields.

