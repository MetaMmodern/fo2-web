# Driving Port Baseline Audit 2026-04-10

Purpose: record the post-worker-reset baseline and the next smallest safe physics-port slice.

## Confirmed from existing repo findings and source data

- Native vehicle runtime note updated 2026-06-08:
  - `Vehicle_ResetPoseAndRunPhysicsSubsteps` (`FUN_0042c650`) runs `100` fixed `0.01` substeps after wheel/contact reset and contact resolution, but its confirmed xrefs are reset/spawn/catch-up paths.
  - Normal steady-state driving advances fixed `0.01` ticks through `UpdateCamera` (`0x004725c0`) according to the due tick count, not `100` vehicle ticks per rendered frame.
- Native collision bootstrap note remains:
  - car runtime setup reads `CollisionFull*`, `CollisionBottom*`, and `CollisionTop*` from `body.ini`.
- Car-side body collision data is already present in repo:
  - `src/data/cars/car_*/body.ini`
- Original shipped track tree includes generated collision-side assets such as:
  - `track_bvh.gen`
  - `track_cdb2.gen`
  - `track_spvs.gen`

## Confirmed in current web runtime

- The failed worker integration has been isolated out of the live runtime path.
- The active runtime again uses a coherent main-thread vehicle scene graph for:
  - vehicle simulation
  - chase camera
  - sun occlusion
  - light updates
  - render/post stack
- Current vehicle grounding still samples only the main track floor sampler.
- Current runtime grounding baseline:
  - body `y` follows grounded wheel contacts
  - chassis attitude is still not ported from native behavior yet
- Current runtime now includes an initial chassis blocking pass:
  - `CollisionFull* / Bottom* / Top*` from `body.ini` are converted into local body probes
  - those probes raycast against the live track sampler on the main thread
  - steep surface hits push the chassis back out and remove inward velocity

## Confirmed gap

- Current runtime still does not apply the native body volumes as full authored hulls; it currently uses a reduced probe approximation.
- A prior wheel-height-based pitch/roll attempt was rolled back because it rotated the chassis without a coherent height/contact solve and caused wheel lift / body penetration on sloped ground.
- Current runtime does not yet have a live collision-asset path wired from original generated track collision data.
- Therefore:
  - gravity and body tilt can be improved on the current baseline
  - object interaction should not be treated as a solver-tuning task
  - object interaction needs collision-data integration first

## Implementation direction

- Do not jump straight to `100` substeps per rendered frame on the current web port. Use `100` fixed `0.01` ticks only as a reset/spawn settle analogue if that path is needed.
- Next safe slice after the grounded-attitude step:
  - use `CollisionFull* / Bottom* / Top*` from `body.ini` for chassis/body blocking against collision geometry
- After that:
  - wire authoritative track collision assets into the runtime sampler
  - then handle dynamic/light object interaction separately from static blocking geometry

## Inference vs confirmation

- Confirmed:
  - native substep structure
  - native body-volume config usage
  - presence of original generated collision assets
  - current main-thread baseline shape
- Inferred:
  - the first practical path to authentic object interaction in the web port is collision-asset integration, not timestep escalation
