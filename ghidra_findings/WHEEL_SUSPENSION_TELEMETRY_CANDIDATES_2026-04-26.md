# Wheel And Suspension Telemetry Candidates

Date: `2026-04-26`

## Scope

Start logging tire/suspension/body-dynamics telemetry for feel matching. This is
the first candidate pass, not final semantic naming.

## Confirmed Anchors

`Vehicle_ResetPoseAndRunPhysicsSubsteps` @ `0x0042c650` rebuilds per-wheel
contact/suspension samples before the fixed `100 x 0.01` physics substeps.

`Vehicle_AccumulateWheelTireAndSteeringForces` @ `0x00429be0` consumes the same
per-wheel blocks for contact, load/spin-like state, and tire force accumulation.

The per-wheel runtime blocks are observed at:

- base: `vehicle + 0x0a00`
- stride: `0x03a0`
- wheel index range: `0..3`

## Candidate Offsets Added To Telemetry

For each `wheel_i`:

- `wheel_i_contact_flag`: `wheel + 0x334`, raw int
- `wheel_i_contact_ptr`: `wheel + 0x348`
- `wheel_i_grounded_by_load_candidate`: derived from
  `wheel_i_vertical_load_candidate > 1.0`
- `wheel_i_contact_surface_44_candidate`: `*(float *)(contact_ptr + 0x44)`
- `wheel_i_contact_surface_48_candidate`: `*(float *)(contact_ptr + 0x48)`
- `wheel_i_contact_surface_4c_candidate`: `*(float *)(contact_ptr + 0x4c)`
- `wheel_i_contact_surface_50_candidate`: `*(float *)(contact_ptr + 0x50)`
- `wheel_i_contact_surface_54_candidate`: `*(float *)(contact_ptr + 0x54)`
- `wheel_i_suspension_length_candidate`: `wheel + 0x084`
- `wheel_i_tire_force_multiplier_candidate`: `wheel + 0x378`
- `wheel_i_load_or_spin_candidate`: `wheel + 0x388`
- `wheel_i_rotation_or_phase_candidate`: `wheel + 0x32c`
- `wheel_i_vertical_load_candidate`: `wheel + 0x330`

Earlier CSV builds also logged static probe/suspension candidates at
`wheel + 0x308`, `0x30c`, and `0x318`, plus `wheel + 0x334`. Runtime validation
showed these were constant or effectively zero in the tested sessions, so they
were removed from the active logger.

## Body Tilt Telemetry Added

The telemetry mod now also logs:

- `right_x/right_y/right_z`
- `up_x/up_y/up_z`
- `pitch_radians/pitch_degrees`
- `roll_radians/roll_degrees`

These are derived from the vehicle world matrix and should be used for the
car-body rocking/tilting validation path.

## Validation Plan

Use one short run with:

- normal straight acceleration
- hard brake
- hard steering left/right
- handbrake slide
- curb hit or cone hit if available
- jump/crest or obvious suspension unload if available

Expected signals:

- contact flags/pointers should change or drop during jumps/unloads
- suspension candidates should move during braking, curb hits, and landing
- load/spin/force candidates should spike during throttle, braking, sliding, and
  impacts
- pitch/roll should visibly match body dive, squat, roll, and landing recovery

## Runtime Validation Notes

CSV `phase1_basic.20260426-072731.csv` included a useful accidental stuck/tilted
event on the jump board. This strongly validated the body matrix telemetry:

- `roll_degrees`: observed range approximately `-67.7 .. 7.1`
- `pitch_degrees`: observed range approximately `-9.7 .. 31.2`
- the extreme roll/pitch rows aligned with the described stuck-on-board moment

The same event made `wheel_i_force_y_candidate` spike heavily, especially on
wheels `0` and `1`, so that field is now logged as
`wheel_i_vertical_load_candidate`. This is still a candidate semantic name, but
it is currently the best wheel-load signal.

The previous `wheel_i_contact_flag` at `wheel + 0x344` did not behave like a
simple boolean during runtime logging.

Follow-up Ghidra correction on 2026-06-09: `wheel + 0x344` is the final
resolved suspension load written by `Vehicle_ResolveWheelSuspensionLoads`
@ `0x0042b8c0`, not a contact flag. This explains why it behaved like a
float-like runtime quantity in earlier captures.

CSV `phase1_basic.20260426-092422.csv` used a structured validation run:
straight/brake, dirt/curbs, tilted slope, handbrake slide, and a real jump.

Key observations:

- `wheel_i_vertical_load_candidate` drops near zero during the airborne portion
  of the jump, then returns on landing. Around `t=118.1..122.1`, loads were
  approximately `0.0..0.5` on all wheels while speed stayed high, confirming
  this is a useful unload/contact proxy.
- The landing/body impact portion around `t=122.6..123.6` produced large body
  angular velocity spikes: `angular_velocity_x` up to about `3.38` and
  `angular_velocity_z` up to about `7.19`, with pitch/roll excursions around
  `pitch=-24.4..30.6` and `roll=-24.5..11.5` in the jump segment.
- The hard handbrake slide around `t=86.6..87.6` produced a clean yaw-rate
  signature (`yaw_rate` down to about `-2.6`) and sequential wheel-load spikes:
  wheel `0`, then `1`, then `3`, then `2`. This looks like load transfer while
  rotating/sliding.
- `wheel_i_contact_candidate_338` and `wheel_i_contact_candidate_33c` were
  constant `0x3f800000` (`1.0f` interpreted as int), and
  `wheel_i_contact_candidate_340` was just the wheel index (`0..3`). These are
  not contact booleans.
- `wheel_i_contact_candidate_344` behaves like a float-like runtime quantity
  when reinterpreted, not a boolean flag. It should not be treated as confirmed
  contact state.

Implementation implication: keep `wheel_i_vertical_load_candidate` for now and
derive an explicit `wheel_i_load_grounded_candidate` from it in analysis or a
future logger pass. Do not rely on the current contact candidate columns as
actual original contact flags.

## Corrected Contact Offsets

Follow-up Ghidra inspection of `Vehicle_AccumulateWheelTireAndSteeringForces`
confirmed the contact reads in assembly:

- `0x00429c38`: `MOV EAX,dword ptr [EDI + 0xd34]` reads wheel 0 contact flag.
- `0x00429c58`: `MOV EAX,dword ptr [EDI + 0xd48]` reads wheel 0 contact pointer.
- wheel 1/2/3 use the same pattern at `vehicle + 0x10d4/0x10e8`,
  `0x1474/0x1488`, and `0x1814/0x1828`.

With per-wheel block base `vehicle + 0x0a00 + index*0x03a0`, this means:

- contact flag is `wheel + 0x334`
- contact pointer is `wheel + 0x348`
- final suspension load is `wheel + 0x344`, written by
  `Vehicle_ResolveWheelSuspensionLoads` after the spring/damper force solve

The contact pointer is then consumed for floats at `+0x44`, `+0x48`, `+0x4c`,
`+0x50`, and `+0x54`. These are not semantically named yet, but they appear in
the tire-force/contact material path and are now logged as contact-surface
candidates for dirt/curb/material validation.

## Corrected Contact Runtime Validation

CSV `phase1_basic.20260426-100022.csv` validated the corrected contact fields:

- Each `wheel_i_contact_flag` only emitted `0` or `1`, unlike the previous
  `+0x344` candidate.
- During the jump/airborne section, roughly `t=41.45..44.25`, all four
  `contact_flag` values were `0` while speed stayed high (`~27..38`), then
  individual flags returned as the car landed/recovered.
- The `grounded_by_load_candidate` derived from vertical load is not reliable:
  it can be `0` during normal high-speed contact and can remain `1` for one
  wheel during airborne rows because the load proxy retains small residual
  values. Prefer the original `contact_flag`.
- Contact pointers resolved to three observed contact profiles in this run.
  Two common profiles had surface candidate values `+0x48 = 0.6` and zeros for
  `+0x4c/+0x50/+0x54`; a rarer profile had `+0x48 = 0.4`, `+0x4c = 1.2`,
  `+0x50 = 0.05`, and `+0x54 = 0.15`, appearing around the dirt/curb sections.

Implementation implication: remove or ignore `grounded_by_load_candidate` in
the next cleanup. Treat `contact_flag` as the primary per-wheel contact state,
and keep contact-surface candidate floats for material/friction validation.

## Final Phase-4 Candidate Pass

Follow-up Ghidra inspection narrowed the remaining Phase-4 telemetry additions
to a compact set tied to code paths rather than broad offset scanning:

- `Vehicle_ResetPoseAndRunPhysicsSubsteps` writes contact/suspension values
  through the per-wheel contact sampling path. The logger now keeps
  `wheel + 0x084` as the suspension-length candidate.
- `Vehicle_AccumulateWheelTireAndSteeringForces` uses
  `ABS(*(float *)(wheel + 0x378))` while scaling tire force in the contact path.
  The logger now reads this as `wheel_i_tire_force_multiplier_candidate`.

Validation should focus on whether these fields separate:

- normal straight driving
- braking dive
- curb hits
- handbrake/drift slip
- jump unload/landing

CSV `phase1_basic.20260426-101810.csv` validated this final pass:

- `wheel_i_suspension_length_candidate` moves under curbs/jump/landing, with
  much larger excursion during the jump/landing segment than flat driving.
- `wheel_i_tire_force_multiplier_candidate` moves dynamically and reaches
  near `abs(1.0)` in braking/sliding/high-load sections; it is useful for
  tire-force comparison but still should be treated as a candidate name.
- `wheel_i_load_or_spin_candidate` responds strongly during the dirt handbrake
  slide, reaching about `abs(1.5)` on multiple wheels.
- `wheel_i_suspension_travel_candidate` at `wheel + 0x318` was constant `25`
  in this run and was removed from the active logger.
- `wheel_i_tire_slip_candidate_37c` at `wheel + 0x37c` was constant `1.06103`
  in this run and was removed from the active logger.

Implementation implication: Phase 4 is sufficient for comparison logging. Keep
the remaining wheel fields stable unless a future port-comparison session shows
a specific missing signal.

## Angular-Velocity Mapping Follow-up (2026-05-01)

Goal: recover a reliable original-game wheel angular velocity signal for
slip/burnout parity checks.

### Confirmed from decompilation

- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0` writes:
  - `wheel + 0x31c = param_1 / (wheel + 0x30c)` for all 4 wheels
  - aggregate wheel-rate-like value at `vehicle + 0x3a4` (`unaff_EBX[0xe9]`)
    sourced either from gear-node `+0x2c` values or a single node path.
- `GearNode_AccumulateAngularVelocityAndTorque` @ `0x004416b0` accumulates
  child-node values into `node + 0x38` and `node + 0x3c`, with scale from
  `node + 0x20`.
- `Vehicle_ComputeBrakeAndHandbrakeWheelTorques` @ `0x0042c540` writes
  per-wheel brake torque to `wheel + 0x320`.
- `wheel + 0x32c` remains a strong per-wheel rotational phase carrier in live
  telemetry (continuous wrap-like evolution, clear rear lock signature under
  handbrake).

### Runtime validation result (straight accel -> handbrake, no steering)

CSV: `phase1_basic.20260501-165934.csv`

- `wheel_i_brake_torque_confirmed_0320`:
  - front wheels cap around `2000`
  - rear wheels rise up to `6000` during handbrake
- `wheel_i_omega_or_phase_candidate_032c`:
  - rear-wheel phase delta collapses sharply during handbrake lock window
  - front-wheel phase delta remains high while vehicle is still moving
- `wheel_i_rate_from_drivetrain_confirmed_031c`:
  - observed flat `0` in this capture (not usable as direct always-live wheel
    omega in this path/session)

### Implementation update in telemetry mod

To avoid blind guessing, the logger now captures:

- per-wheel dense probe window `wheel + 0x300..0x35c` (step `+0x4`)
- drivetrain-node probes tied to the exact decomp path:
  - vehicle pointers at `+0x380/+0x488/+0x590`
  - aggregate at `vehicle + 0x3a4`
  - per-node candidates at `+0x2c/+0x38/+0x3c`

This pass is intended to identify whether FO2 stores a standalone wheel omega
field or reconstructs effective wheel rate from mixed phase/drivetrain state.
