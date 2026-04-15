# Gearbox Recommended Gear Findings 2026-04-14

Purpose: document the concrete gearbox auto-shift logic recovered after the Rapier drivetrain wrapper began hunting between 1st and 2nd gear.

## Scope

Focused functions:

- `Gearbox_GetRecommendedGear` @ `0x00441f10`
- `Gearbox_RequestGear` @ `0x00442160`
- `Gearbox_UpdateShiftState` @ `0x004421d0`
- `Gearbox_LoadHandlingCurves` @ `0x00441c40`
- `Drivetrain_UpdateWheelRatesAndAutoShift` @ `0x004414f0`

## Confirmed From Ghidra

### 1. Recommended gear is not RPM-only

`Gearbox_GetRecommendedGear` projects vehicle velocity onto the car forward basis:

- forward basis components at vehicle `+0x280/+0x284/+0x288`
- velocity components at vehicle `+0x1d0/+0x1d4/+0x1d8`

It then compares the projected forward speed against runtime gearbox threshold arrays.

Confirmed runtime offsets used by the helper:

- current/requested gear state around gearbox `+0x48`
- max forward gear at gearbox `+0x58`
- threshold arrays addressed from gearbox `+0x9c` and `+0xa0`

This means the original game does not choose the next gear from a simple RPM threshold alone.

### 2. Reverse and neutral have explicit special cases

Recovered special handling in `Gearbox_GetRecommendedGear`:

- if current gear is `-1`, the local evaluation path resets to `1`
- if current gear is `1`, low projected speed plus an engine/wheel-state comparison can return `0`
- if current gear is `0`, another engine/wheel-state comparison returns either `0` or `1`

Confirmed implication:

- launch behavior passes through an explicit neutral/low-speed gate
- a web-port wrapper that only flips between `1..N` misses native launch logic

### 3. Auto-shift uses runtime threshold arrays, not the raw `.h` ratios directly

`Gearbox_GetRecommendedGear` compares the converted forward-speed scalar against values already prepared in the gearbox runtime object:

- lower/adjacent thresholds read via `gearbox + 0x9c + gear*4`
- upper/adjacent thresholds read via `gearbox + 0xa0 + gear*4`

`Gearbox_LoadHandlingCurves` copies gearbox-handling data into runtime slots `+0x5c..+0x98`, sets `numGears` at `+0x58`, and also copies timing values into `+0xbc/+0xc0`.

Confirmed implication:

- the recommended-gear helper depends on precomputed runtime threshold tables
- reimplementing auto-shift from only raw RPM guesses or raw gear ratios is structurally incomplete

### 4. Shifting is a timed state machine

Recovered state fields:

- requested/current target gear at `+0x48`
- shift state at `+0x4c`
- shift timer at `+0x50`
- currently applied drive gear at `+0x40`

Recovered behavior:

- `Gearbox_RequestGear` validates requested gear in `[-1, numGears]`
- when idle (`+0x4c == 0`), it enters shift state `1` and zeros the timer
- if no currently applied gear is active (`+0x40 == 0`), it can apply immediately and move into state `3`
- if already in state `3`, it re-enters state `1` with a timer scaled by clutch timing values

`Gearbox_UpdateShiftState`:

- advances the shift timer at `+0x50`
- in state `1`, applies the requested gear once timer reaches `+0xc0`
- in state `3`, returns to idle once timer reaches `+0xc0 + +0xbc`

Confirmed implication:

- native auto-shift includes both recommendation logic and a timed application window
- a wrapper without separate engage/release timing and shift hysteresis will gear-hunt

### 5. The live drivetrain tick refreshes ratio state before dispatching shift-state logic

`Drivetrain_UpdateWheelRatesAndAutoShift`:

- updates per-wheel rate scalars from step delta
- refreshes driven-wheel ratio aggregate
- calls `Gearbox_GetRecommendedGear`
- if the recommendation changes, updates cached ratio values and calls `Gearbox_RefreshDriveRatiosAndControlAxes`
- then dispatches the current gearbox state handler

Confirmed implication:

- the auto-shift recommendation is part of a broader drive-ratio refresh path
- it is not just a standalone “if RPM > X then gear++” rule

## Porting Impact

Confirmed implementation constraint for the web port:

- do not continue tuning the Rapier drivetrain with ad hoc RPM-only upshift/downshift thresholds
- the next correct parity step is to port the native recommended-gear path around projected forward speed plus runtime threshold arrays

What is still missing:

- exact semantic decoding of the runtime threshold arrays at gearbox `+0x9c/+0xa0`
- exact mapping from the loaded gearbox handling block into those threshold arrays

Until that is recovered, any further shift-threshold tuning is heuristic, not source-faithful.

## Addendum 2026-04-14 (Later Pass)

Additional constants and equations are now confirmed.

### 6. Confirmed speed-unit and hysteresis constants in `Gearbox_GetRecommendedGear`

From direct data-label reads and xrefs:

- `FLOAT_0067dd6c = 3.6`
  - used in the recommendation path to convert projected speed to km/h domain before threshold comparison.
- `FLOAT_0067dd70 = 1.15`
  - used as a low-speed guard scaling factor in the projected-speed branch.
- `FLOAT_0067dbe8 = 10.0`
  - applied as a downshift-side hysteresis margin in the threshold walk.

Porting implication:

- auto-shift parity should use the native km/h conversion and hysteresis constants directly.

### 7. Confirmed nonlinear torque scalar in `Drivetrain_DistributeTorqueToDrivenWheels`

From `0x00441090`:

- runtime scalar is:
  - `s = c * FLOAT_0067dc14 + c^3 * FLOAT_0067dc60`
  - with `FLOAT_0067dc14 = 0.3`
  - and `FLOAT_0067dc60 = 0.7`
- `s` is written into runtime torque fields before the differential split stage.

Porting implication:

- drivetrain parity cannot be achieved by a simple linear throttle-to-force map; this nonlinear stage must be represented before left/right wheel torque distribution.
