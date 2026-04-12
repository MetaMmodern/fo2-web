# Rapier Static World Prototype 2026-04-11

Purpose: record the transition from the custom Three.js raycast-based live contact path to a Rapier-backed low-level collision/world prototype.

## Why The Switch Happened

Confirmed from runtime testing:

- authored collision asset extraction from original track data is valid
- feeding those assets into the existing custom JS/Three.js raycast simulation loop is not viable as the live runtime path
- perf HUD measurements showed the dominant regression moved into `Sim`, not render or camera
- isolating camera, sun occlusion, and provisional body probes was not enough to make the custom path acceptable

Conclusion:

- the authored collision source is usable
- the old query/integration mechanism is not
- the short-term plan therefore advances to the Rapier low-level solver stage

## Prototype Scope

The live simulation path now uses:

- generated static authored collision mesh (`collision.glb`) as the source for Rapier fixed trimesh colliders
- one dynamic Rapier rigid body as the chassis
- one cuboid chassis collider derived from FO2 body collision bounds when available, with bounding-box fallback
- simple throttle/brake/steer force application
- direct sync of Rapier rigid-body transform back to the Three.js car root each frame

This is intentionally a low-level contact/world prototype, not final FO2 handling parity.

## Non-Goals Of This Prototype

- not final suspension parity
- not final tire model parity
- not final drivetrain parity
- not final dynamic object interaction
- not final body deformation or damage behavior

## What Remains Source-Of-Truth Driven

- static collision still comes from original shipped track data recovered into generated collision assets
- chassis volume still prefers original `body.ini` collision bounds where available

## Immediate Testing Goal

Verify that the live runtime now has:

- gravity from Rapier
- wall/body collision from Rapier
- slope/body attitude from Rapier rigid-body contacts
- materially better behavior than the previous custom raycast-driven authored collision path

## Current Prototype Gaps Observed In Runtime

- Vehicle light-state handoff in the Rapier wrapper still needs parity verification against the existing material/light config path.
  - A wrapper mismatch was found where boolean `braking` / `reversing` flags were being returned instead of the expected `brakeStrength` / `reverseStrength` values.
  - Even after correcting the output shape, runtime validation is still required.
- Driven wheels should visibly free-spin in the air under throttle.
  - Current runtime observation from the garage-test ramp case: with all wheels airborne, the driven wheels do not keep spinning as expected.
  - This is important beyond visuals because it may also be contributing to post-jump momentum loss or wheel re-contact harshness in the current prototype.
- Per-car wheel visual fitment is not solved yet.
  - Some cars now sit roughly correctly.
  - Others still show wheels too high, too low, or intersecting the ground/body.
- Dynamic roadside-object interaction is now the next correct short-term step.
  - Collision metadata already exposes dynamic-object classes such as `rubber_cone` and `rubber_tire`.
  - These props must be removed from the static trimesh once promoted to dynamic Rapier bodies.
  - Follow-up diagnosis from original data/decomp notes:
    - static authored track collision was intentionally completed from `track_geom.w32` + `track_bvh.gen`
    - `track_cdb2.gen` remains unresolved and is explicitly called out as a likely later parity/input for lower-level collision details
    - decomp notes also expose a separate recovered dynamic-object subsystem (`InitializeRecoveredDynamicObjects`)
    - therefore cones / loose tires / similar roadside props should not be expected to emerge automatically from the current static collision world path
- Runtime status after the first dynamic-object passes:
  - garagetest cones and loose tires now spawn from collision metadata and interact with the car as separate Rapier bodies
  - tire stacks required cylinder collider alignment; a rotated prototype caused first-step overlap explosions
  - garagetest banner/sign objects (`wood_light`, `metal_light`) can be made physically present as blockers, but source-faithful breakage is still blocked on the original hinge/joint obstacle path
  - the current converted garagetest track asset does not expose the expected `dummy_*` anchors for those banner/sign objects, while other tracks like `city1/a` do expose `dummy_*` anchors
  - consequence: loose props such as barrels/boxes/fences/windows/gas pumps can advance as the next validation slice, but banner breakage should wait for recovered anchor/joint data instead of being faked
