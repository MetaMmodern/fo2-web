# Short-Term Physics Reset Plan 2026-04-10

Purpose: record the short-term execution plan after the failed worker path and failed surface-tilt experiments.

This is a short-term plan, not the final architecture note.

## Why This Reset Exists

- The current custom JS vehicle solver is not failing because "physics is impossible in JS".
- It is failing because the current runtime architecture does not match the native FlatOut 2 driving/collision pipeline closely enough.
- Native behavior depends on:
  - explicit wheel-contact probing
  - suspension/load resolution
  - pose/collision attachment updates
  - a structured fixed-step force pipeline
  - a separate collision/object subsystem
- The current web port still relies too heavily on:
  - render-mesh raycasts
  - ad hoc chassis-height solving
  - heuristic pose adjustments layered on after the fact

## Short-Term Plan

1. Restore and hold a stable baseline.
   - Keep the live runtime on the main thread.
   - Remove or isolate failed tilt experiments.
   - Do not continue random solver tuning on the current custom path.

2. Reintroduce authored collision assets from the original generated track-side collision data.
   - Bring the `bvn` / generated collision path back into scope.
   - Use original collision-side data rather than visible render meshes as the source of truth for vehicle/world contact.
   - Keep this step focused on static authoritative collision first.
   - Recover `stash-collisions` parser/debug tooling only in isolation.
   - Do not treat the recovered debug GLB path as the final authoritative collision import.
   - Current implementation path for static collision: extract indexed `track_geom.w32` surfaces referenced by `track_bvh.gen`.
   - `track_cdb2.gen` remains a follow-up parity/research task, not the blocker for static track collision assets.
   - Runtime loader support for optional `collision.glb` / `collision.meta.json` is now wired.
   - Constraint: collision assets must inherit the render track origin transform and must not be independently re-centered.

3. Move the low-level collision/contact layer onto a real physics solver.
   - Preserve FO2 gameplay logic and handling data above that layer.
   - Use the library for rigid-body integration, collision response, constraints, and dynamic object interaction.
   - Do not replace FO2 steering/drivetrain/tire logic with generic arcade-car helper code.
   - Status update 2026-04-11: the live runtime has now been switched to a Rapier-backed static-world/chassis prototype because the custom Three.js raycast-based authored-collision path was validated as non-viable.

4. Reapply FO2 vehicle logic on top of authored collision and the new low-level solver.
   - steering shaping
   - drivetrain/gearbox rules
   - tire/suspension parameters
   - car body collision volumes from `body.ini`
   - dynamic object interaction rules
   - Status update 2026-04-14: recovered Ghidra pass confirms the native auto-shift path is driven by projected forward speed plus runtime gearbox threshold arrays, not by a simple RPM gate. Do not keep tuning Rapier shift thresholds heuristically; recover and port `Gearbox_GetRecommendedGear` / gearbox runtime threshold preparation first.

5. Revisit surface tilt only after the contact/suspension/body pose path is coherent.
   - Surface tilt should emerge from contact and suspension state.
   - It should not be reintroduced as a visual or post-pose heuristic.

## Library Direction

Current recommendation for the web port:
- `Rapier`

Reason:
- mature WebAssembly physics backend for web use
- stronger rigid-body/contact foundation than the current custom scene-raycast approach
- good fit for chassis/world/object collision and constraints
- can be used as a low-level solver while preserving FO2-authored gameplay logic above it

Non-goal:
- do not hand control over to a generic off-the-shelf vehicle gameplay model

## Immediate Execution Order

1. confirm or restore stable baseline
2. recover and wire authored collision assets
3. prototype low-level collision/contact on `Rapier`
4. port FO2 collision/body-volume logic into that path
5. only then retry slope/body attitude behavior

## Decision Constraint

Until authored collision data and a coherent low-level contact path are in place:
- do not spend more time trying to fake chassis tilt with heuristic body rotation
