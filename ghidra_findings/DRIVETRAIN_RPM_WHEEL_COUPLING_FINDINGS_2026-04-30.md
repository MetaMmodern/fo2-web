# Drivetrain RPM/Wheel Coupling Findings (2026-04-30)

Scope: verify whether reverse->forward tire behavior in original FlatOut 2 is driven by drivetrain coupling (engine RPM/gear/differential) rather than visual-only wheel roll.

Binary: `reference/FlatOut2.exe` (MD5 `40078c35de1366488d7c3dc761008cd4`)

## Confirmed (Ghidra)

- `Differential_SolveLeftRightWheelTorques` @ `0x004408d0`
  - Differential solver redistributes axle torque across left/right driven wheels with mode-dependent branches.
  - Uses wheel runtime terms including wheel-struct candidate region around `+0x398` (already tracked in wheel telemetry work) while solving torque split/limits.

- `Drivetrain_DistributeTorqueToDrivenWheels` @ `0x00441090`
  - Applies a nonlinear driven-torque scalar before differential solve:
    - `c * 0.3 + c^3 * 0.7` (constants in decomp comments: `FLOAT_0067dc14`, `FLOAT_0067dc60`).
  - The nonlinear scalar is then multiplied into drivetrain output prior to wheel torque solve.
  - This confirms non-linear bite/slip shaping in the original drivetrain path.

- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`
  - Refreshes wheel-rate aggregate terms each update and runs `Gearbox_GetRecommendedGear`, then recomputes ratio-dependent runtime terms.
  - Confirms tight update coupling between wheel rates, drivetrain state, and shift logic (not isolated visual wheel roll).

## Confirmed (Original CSV behavior)

Source CSV:
- `analysis/telemetry_runs/flat_plane_compare_2026-04-27/original_car16_hb_trail_suite_2026-04-30_source_of_truth.csv`

Reverse->forward segment around row `1264` (Bullet / car_16):
- Gear flips from `-1` to `1` while speed is still negative (`orig_speed_forward ≈ -11.53`).
- Engine RPM remains high in the transition window (`~5.5k` region) while speed approaches zero.
- Forward acceleration begins before speed fully settles, consistent with drivetrain-driven counter-slip/catch behavior.

Interpretation:
- Original behavior is consistent with drivetrain torque and wheel-rate coupling through transition, not a strict "wheel always rolls 1:1 with road once in forward" model.

## Inferred (explicitly marked)

- Wheel candidate `wheel_i_load_or_spin_candidate` appears useful for runtime activity checks, but in this capture its absolute magnitude is small and is not yet a clean standalone wheel angular velocity ground truth.
- For parity checks, pair drivetrain fields (`gear`, RPM-like, speed-forward) with web wheel angular velocity + slip ratio, not candidate spin value alone.

