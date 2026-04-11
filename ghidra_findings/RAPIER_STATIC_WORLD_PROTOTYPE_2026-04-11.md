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
