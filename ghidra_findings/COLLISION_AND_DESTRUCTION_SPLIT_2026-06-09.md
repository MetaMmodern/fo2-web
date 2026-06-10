# Collision And Destruction Split 2026-06-09

Purpose: separate original-game collision resolution from damage/deformation/destruction side channels before porting wall, cone, and movable-object behavior.

## Confirmed Collision Pipeline

`PhysicsWorld_StepActiveBodiesAndContacts` @ `0x0056c850` is the world-level step after vehicle force accumulation.

Confirmed call order:

- clears per-step world counters
- calls `PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`
- runs per-active-body callbacks
- calls `PhysicsWorld_GenerateContactManifolds` @ `0x005692b0`
- solves contact islands through `PhysicsIsland_SolveContactsAndIntegrateBodies` @ `0x00573780`
- updates body broadphase bounds through `PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`
- updates sleep/deactivation bookkeeping

`PhysicsWorld_BuildPotentialContactPairs` filters overlap links by body flags, collision masks, active/sleep state, and already-known pairs. It can activate dynamic objects by calling `DynamicObject_RegisterIntoEnvironmentLiveSet` @ `0x00565d50`.

`PhysicsWorld_GenerateContactManifolds` emits the actual contacts. Two important helper anchors:

- `PhysicsWorld_AppendContactConstraint` @ `0x0056a850`
  - appends a generated contact into the world contact graph
  - writes a `0x44`-stride contact node from a `0x38`-byte generated contact record
  - resolves friction/restitution/material terms from collision material tables and body flags
- `CollisionSpatial_GenerateBodyTriangleContacts` @ `0x00570040`
  - generates active body-vs-static triangle contacts
  - queries the authored static collision BVH/CDB data
  - writes caller-limited `0x38`-byte contact records for `PhysicsWorld_GenerateContactManifolds`

Porting implication: exact wall/static-object collision should not be implemented as generic mesh ray pushes. The native path builds body-vs-body and body-vs-static-triangle contact records, then solves those records in islands.

## Damage And Deformation Side Channel

`PhysicsWorld_GenerateContactManifolds` also writes damage visual contacts, but only when body flags allow it. Those are side-channel records, not the baseline collision response.

Confirmed vehicle-side consumers:

- `Vehicle_FlushQueuedCollisionRecords` @ `0x00426550`
  - copies queued `0x38`-byte collision records into a capped vehicle buffer
- `Vehicle_ProcessCollisionDamageStep` @ `0x004293c0`
  - flushes queued records
  - updates crash/deformation visuals
  - syncs attachments/cameras
  - calls `Vehicle_ApplyCollisionDamageAndDeformation` when damage processing is enabled
- `Vehicle_ApplyCollisionDamageAndDeformation` @ `0x00426670`
  - consumes queued collision records
  - computes contact bounds via `Vehicle_ComputeCollisionContactBounds` @ `0x0043f4e0`
  - updates car damage level, panel breakage, deformation bounds, events, and damage visual contacts

Porting implication: collision response should be ported first. Vehicle damage/deformation should consume collision records later and should not be required to make walls/cones physically block or move.

## Dynamic Objects

`DynamicObject_InitializeFromLua` @ `0x00590fd0` is the dynamic-object bootstrap.

Collision/runtime fields read from Lua/config:

- `Mass`
- `Restitution`
- `CollisionSound`
- `WakeupVelocity`
- `ReactivationVelocity`
- `Category`
- `Inertia`
- `AeroDragForce`

Destruction/effect fields read from the same bootstrap:

- `DamageThreshold`
- `ExplosionForce`
- `DestroyFx`
- `EmitterFx`
- optional `RotateX`, `RotateY`, `RotateZ`

`DynamicObject_DispatchDestroyAndEmitterFx` @ `0x00591cb0` is destruction/effects, not baseline collision. It handles optional explosion force, destroy effect variants, emitter effect registration, and deferred environment queue insertion.

Porting implication: cones, tires, barrels, poles, boxes, and barriers should first use data-driven mass/restitution/category/inertia/activation. Destruction thresholds and FX can remain disabled until collision parity is stable.

## Web Port Gap

Current JS/Rapier dynamic objects are mostly category-name heuristics in `src/game/physicsRapier.js`. That differs from native behavior:

- native dynamic props are not all just always-live colliders
- native collision uses activation lists and live-set transitions
- native object physics is data-driven by Lua/config fields, not hard-coded object-name categories
- static track collision uses authored `track_bvh.gen` and `track_cdb2.gen`, not render mesh semantics

## Recommended Port Order

The static CDB2/contact-solver pieces are now sufficiently recovered for a no-assumptions static collision port. Dynamic-object body setup and activation/live-set behavior still need field-level RE before cones/barriers/movable props are implemented.

1. Port vehicle body collision volumes from car collision config:
   - `CollisionFullMin/Max`
   - `CollisionBottomMin/Max`
   - `CollisionTopMin/Max`
2. Replace current surface-subset/render-material collision with native `track_bvh.gen` / `track_cdb2.gen` decoding.
3. Port wheel/raycast static queries against the native CDB2/BVH structures.
4. Port body-vs-static triangle contact generation, generated `0x38` contact records, `0x44` contact nodes, and per-contact solving.
5. Continue Ghidra on dynamic-object body setup, broadphase pair filters, and activation/live-set transitions.
6. Port dynamic-object config extraction for mass, restitution, category, inertia, wakeup/reactivation velocity once the body setup path is confirmed.
7. Add damage/deformation/destruction consumers only after collision response is stable.

This preserves the original separation: collision first, damage/deformation/destruction second.
