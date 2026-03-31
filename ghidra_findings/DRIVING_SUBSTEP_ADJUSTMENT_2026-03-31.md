# Driving Substep Adjustment 2026-03-31

Purpose: document how this port now mirrors the native 100-substep `FUN_0042c650` vehicle solver.

## Ghidra anchor

- `FUN_0042c650` @ `0x0042c650` – vehicle simulation entry that clears accumulators, resolves wheel contacts, then *always* runs 100 fixed `0.01` substeps (`FUN_00429640` + `FUN_00429be0` per step). The frame-level dt is spread across the fixed substeps rather than solved in a single large delta.

## Port follow-up

- Introduced `MAX_SUBSTEPS = 100` and `FIXED_SUBSTEP_DT = 0.01` in `src/game/physics.js` to signal the loop size and native step size from the Ghidra run.
- Each `createDrivingSimulation.update` now divides the current frame `dt` into `MAX_SUBSTEPS` micro-steps and invokes the original steering/acceleration logic inside `simulateFixedSubstep`, keeping the total simulated time equal to `dt`.
- `simulateFixedSubstep` internally mirrors the earlier per-frame block (steer shaping, throttle/brake force, drag, lateral grip, yaw update) so that momentum/steer responses run at fine granularity, emulating the traced loop rather than a single coarse integration.
- This note tracks the new helper functions and the loop as the Ghidra-derived baseline for subsequent physics tuning.
