# Collision CDB2 Solver Body Layout 2026-06-09

Purpose: record the confirmed static-collision, contact-solver, and vehicle-body layout details recovered after the no-assumptions collision gate. This note distinguishes confirmed decompilation from implementation implications.

## Confirmed From Ghidra

### Static CDB2 Path

`CollisionSpatial_GenerateBodyTriangleContacts` @ `0x00570040` is the active body-vs-static world contact generator. It traverses authored CDB2/BVH data, expands leaf commands, filters collision materials, clips accepted triangles against a transformed body box, and writes `0x38` byte generated contacts.

`CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0` is the static query path used by wheel/raycast consumers. It builds a transformed query, traverses the same collision tree, filters candidates by query/material flags, and writes `0x40` byte triangle query records.

`CollisionSpatial_RaycastTriangleSoup` @ `0x005639e0` consumes those query records for wheel/reset ray or sweep tests and writes hit point, normal, and material id.

### CDB2 Candidate Expansion

`CollisionCdb2_ExpandLeafCommands` @ `0x0056d3d0` expands CDB2 leaf command pairs into triangle candidates.

Candidate stride is `0x10`:

- `+0x00`: material id byte
- `+0x01`: edge/flag byte
- `+0x02`: vertex attribute / edge flag byte used by ray/query filtering
- `+0x03`: padding/unused
- `+0x04`: vertex 0 pointer
- `+0x08`: vertex 1 pointer
- `+0x0c`: vertex 2 pointer

Decoder dispatch table is at `0x0069bd28`:

- mode 0: `CollisionCdb2_DecodeTriangles_Mode0` @ `0x0056ce10`
- mode 1: `CollisionCdb2_DecodeTriangles_Mode1` @ `0x0056cfa0`
- mode 2: `CollisionCdb2_DecodeTriangles_Mode2` @ `0x0056d120`
- mode 3: `CollisionCdb2_DecodeTriangles_Mode3` @ `0x0056d1c0`
- mode 4: `CollisionCdb2_DecodeTriangles_Mode4` @ `0x0056d250`
- mode 5: `CollisionCdb2_DecodeTriangles_Mode5` @ `0x0056d330`

`CollisionCdb2_ExpandOneLeafCommand` @ `0x0056d490` is the single-command variant used by `CollisionSpatial_RaycastCdb2TreeNearestTriangle` @ `0x0056ba60`.

Follow-up confirmed 2026-06-10:

- The decoder outputs vertex pointers as `vertexBase + wordOffset * 2`.
- The packed references are word offsets into the vertex blob, not 6-byte vertex record indices.
- Each referenced vertex is still read as three signed int16 values at `+0/+2/+4`, scaled by CDB2 coordinate multipliers.
- A web parser that treats references as sequential 6-byte vertex indices will decode invalid track heights and wrong triangles.

Decoder payload sizes:

- mode 0: first triangle consumes 6 payload bytes; subsequent triangles consume 9 payload bytes.
- mode 1: first triangle consumes 6 payload bytes; subsequent triangles consume 8 payload bytes.
- mode 2: each triangle consumes 5 payload bytes and stores three 8-bit offsets relative to the header base.
- mode 3: each triangle consumes 4 payload bytes and reuses the header material.
- mode 4: each triangle consumes 5 payload bytes and packs larger relative word offsets.
- mode 5: each triangle consumes 3 payload bytes and packs small relative word offsets.

### Static CDB2 Structure Fields

Confirmed fields used by the collision query/generation consumers:

- `+0x00/+0x04/+0x08`: coordinate multiplier inverses used to quantize query min/max.
- `+0x0c/+0x10/+0x14`: coordinate multipliers/scales used to convert int16 vertex coordinates to world units.
- `+0x18/+0x1c/+0x20`: raw min bounds.
- `+0x24/+0x28/+0x2c`: raw max bounds.
- `+0x34`: BVH/root node pointer.
- `+0x38`: triangle command blob base.
- `+0x3c`: vertex base pointer.

BVH nodes are two `uint32` words:

- `word0 & 3 == 3`: leaf node.
- `word1 & 0x7f`: leaf command count.
- `word0 >> 8`: child/command offset, depending on branch/leaf use.
- axis nodes use low/high int16 split bounds from the second word.

### Contact Record

`CollisionSpatial_ClipTriangleAgainstBodyBoxContact` @ `0x00571080` emits `0x38` byte generated contacts:

- `+0x00..+0x08`: world contact point.
- `+0x0c..+0x14`: contact normal.
- `+0x18..+0x20`: body/contact velocity term at the contact.
- `+0x24..+0x2c`: body-local clipped centroid/contact point.
- `+0x30`: penetration/depth.
- `+0x34`: material or triangle id.

`ContactManifold_ReduceContactsByDepthAndExtents` @ `0x0056f7d0` reduces generated contacts by keeping the deepest contact and extremal tangent contacts when body-static clipping emits too many points.

### Contact Node And Solver

`PhysicsWorld_InitializeContactPoolsAndDefaults` @ `0x00565a10` initializes `0x400` contact nodes at `world+0xf720`, stride `0x44`, with contact vtable `0x0067bc0c`.

Contact vtable `0x0067bc0c`:

- slot 0: `ContactConstraint_GetSolverRowCount` @ `0x0056f2b0`
- slot `+4`: `ContactConstraint_FillSolverRowsAndBounds` @ `0x0056f2d0`
- slot `+8`: `ContactConstraint_ResetNodeLinks` @ `0x00565220`

Confirmed partial contact node layout:

- `+0x00`: vtable pointer.
- `+0x04`: solver/cache field, exact label not final.
- `+0x08`: flags.
- `+0x10`: scalar/callback-related field selected by some body cases.
- `+0x18`: body A pointer.
- `+0x24`: body A contact-list link.
- `+0x28`: body B pointer, zero for static.
- `+0x34`: callback/threshold pointer, exact struct not final.
- `+0x38`: generated `0x38` contact record pointer.
- `+0x3c`: restitution scalar / bounce term.
- `+0x40`: friction coefficient / tangent impulse bound.

Confirmed flag meanings:

- `0x1`: tangent/friction rows enabled.
- `0x2`: restitution/bounce path enabled.
- `0x4`: active/solvable contact.
- `0x8`: static/material contact bias path.
- `0x10` and `0x20`: body/material cases; labels not final.

`ContactConstraint_GetSolverRowCount` returns one normal row unless flag `0x1` is set, in which case it returns three rows.

`ContactConstraint_FillSolverRowsAndBounds` builds the normal row, optional two tangent rows, penetration bias, restitution term, and projected impulse bounds from the node and generated contact.

`PhysicsSolver_SolveContactConstraint` @ `0x00572fb0` is the per-contact solve path. It fills rows through the contact vtable, builds effective mass/RHS, solves bounded projected constraints, applies impulses to body A/body B, and handles native impact threshold/callback checks.

### Vehicle Body Volumes

`Vehicle_LoadCollisionPanelsAndCrashConfig` @ `0x00431b50` reads:

- `CollisionFullMin` @ `0x0066a44c`
- `CollisionFullMax` @ `0x0066a438`
- `CollisionBottomMin` @ `0x0066a424`
- `CollisionBottomMax` @ `0x0066a410`
- `CollisionTopMin` @ `0x0066a400`
- `CollisionTopMax` @ `0x0066a3f0`

It subtracts the model center at `vehicle+0x1c60/+0x1c64/+0x1c68`, then stores min/max, center, and half extents for full, bottom, and top body volumes.

The current web collision-volume path only using `CollisionFullMin/Max` is therefore incomplete.

### Collision Material Flags

Recovered config keys:

- `BodyCollision` @ `0x0067bf3c`
- `CameraCollision` @ `0x0067bf2c`
- `RayCollision` @ `0x0067bf1c`
- `BodyFriction` @ `0x0067bf68`
- `Friction` @ `0x0067bf78`
- `CollisionSound` @ `0x0067bf94`
- `BodyEffect1` @ `0x0067bef8`
- `RoadEffect1` @ `0x0067bf10`
- `RoadEffect2` @ `0x0067bf04`

Material records consumed by static body contacts have stride `0x14`. Body contact participation uses material offset `+0x0c`, bit `0x1`. Friction/restitution are consumed from material offsets `+0x04` and `+0x08` by `PhysicsWorld_AppendContactConstraint`.

## Implementation Strategy Change

The web port should not keep using `collision.meta.json` as a render-surface subset if the target is 1:1. The raw shipped `track_bvh.gen` and `track_cdb2.gen` files are present, and the command/candidate format is now sufficiently recovered to build native static query structures directly.

## Web Implementation Slice 2026-06-10

Implemented the first native static-collision slice:

- Added `src/game/nativeCollision.js`.
- Added raw `track_bvh.gen` and `track_cdb2.gen` asset URLs to the generated runtime catalog.
- `loadTrack` now prefers a decoded native CDB2 sampler for contact/raycast queries and keeps the old collision GLB sampler as fallback.
- The native CDB2 sampler:
  - parses the shipped CDB2 header
  - traverses reachable 8-byte BVH nodes from the root
  - expands leaf command pairs through recovered decoder modes 0..5
  - reads vertices through native word-offset pointer math
  - applies the existing source-to-scene Z mirror
  - returns native material id, edge flags, point, normal, and distance for ray hits
  - builds a coarse X/Z grid for triangle raycast candidate reduction
- `src/game/physics.js` now parses and stores full/bottom/top car collision volumes from `CollisionFull*`, `CollisionBottom*`, and `CollisionTop*`.
- Original-JS body side contacts now probe from those native collision volumes instead of one circular body radius.
- `src/game/physicsRapier.js` also preserves the parsed volume data in config, though Rapier colliders still use the full box path.

Static validation run:

- `arena/arena1/a`: 21420 decoded native triangles
- `city/city1/a`: 35282 decoded native triangles
- `city/city1/b`: 32338 decoded native triangles
- `forest/forest1/a`: 23433 decoded native triangles
- `forest/forest1/c`: 38580 decoded native triangles
- `garagetest/garagetest1/a`: 32932 decoded native triangles

Current limitation:

- The web sampler preserves native material ids but does not yet rebuild the original `0x14` material table. Material participation/friction/restitution are therefore not fully native yet.
- Body-vs-static response is still a staged volume/raycast response, not the full native triangle clipping plus `0x38` contact record and `0x44` solver-node path.
- Dynamic props/cones/barriers still require the separate dynamic-object body setup and activation/live-set pass.

Garagetest correction 2026-06-10:

- Raw decoded CDB2 downward rays at the garagetest spawn can hit high upward-facing CDB2 surfaces before the visible/driveable floor.
- The generated W32/BVH collision mesh samples the same spawn near track height, while native CDB2 without material filtering samples around `y ~= 11.8`.
- Until the original `0x14` material table is reconstructed and RayCollision/BodyCollision filters are applied, `loadTrack` uses a hybrid contact sampler:
  - downward ground/wheel rays prefer the existing generated collision mesh
  - non-ground side/body rays prefer the decoded native CDB2 sampler
  - both paths retain fallback to the other sampler
- This is a regression guard, not final parity. The final fix is native material-table filtering, not permanent render-mesh ground selection.

Wall-response wiring correction 2026-06-10:

- The first implementation left `resolveTrackBodyContacts` behind the `bodyContacts` debug option, whose default was `false`.
- It also passed the scene floor sampler into `runVehicleSubstep`, so side/body rays were not using the native CDB2-preferring contact sampler.
- `bodyContacts` now defaults to enabled, and body collision receives `trackContactSampler ?? trackFloorSampler`.
- This enables the staged wall response in Original JS mode. It is still not the final native `0x38` contact / `0x44` solver-node implementation.

Performance correction 2026-06-10:

- Enabling body contacts exposed a pathological JS fallback in `nativeCollision.js`: when the coarse ray grid found no occupied cell, it fell back to testing every decoded CDB2 triangle.
- That fallback is removed for indexed native collision rays.
- The temporary JS acceleration structure is now a coarse 3D grid with a per-ray candidate cap.
- Original-JS body probes were reduced from eight static side directions per volume to four cardinal directions plus current travel direction.
- Static garagetest benchmark for 5000 short side rays dropped from about `9436 ms` to about `216 ms`.
- Follow-up: non-ground hybrid contact rays no longer fall back from native CDB2 into the generated Three.js collision mesh, which prevented side-ray misses from invoking expensive mesh raycasts every fixed substep.
- Follow-up: the fixed-step accumulator is clamped after max-step frames so a slow collision frame cannot create an ever-growing simulation backlog.
- Static garagetest benchmark for 10000 short side rays is about `388 ms` after the fallback removal.
- Follow-up: unfiltered native CDB2 side rays can still hit invisible/hidden collision surfaces before the visible collision mesh. Body side probes now request a bounded indexed sampler built from `collision.meta.json`, so blocking matches the HUD-visible collision mesh until native material filtering is ported.
- Static garagetest benchmark for the visible collision-meta sampler: build about `113 ms`, 10000 short side rays about `132 ms`.
- Follow-up: ground/wheel sampling must not use the indexed collision-meta sampler first. That caused unstable ground hits and extra work. Ground rays now prefer the existing generated floor/collision mesh path; the indexed sampler is used only when body probes pass `preferIndexed`.
- Follow-up: `preferIndexed` body rays no longer fall back into Three.js mesh raycasting on a miss.
- Follow-up: body contacts must receive the contact sampler, not the floor sampler. A wiring error in `runVehicleSubstep` routed `resolveTrackBodyContacts` to the floor path, so visible wall queries were not actually being used by the car body.
- Follow-up: the indexed `collision.meta.json` sampler must mirror source Z into scene Z, matching the debug collision GLB transform in `loadTrack`. Without that mirror, the staged wall sampler blocks mirrored invisible geometry and misses visible walls.
- Follow-up: wheel contact sampling is kept on the floor sampler regardless of the HUD `surfaceSampler` toggle, so the unfinished contact sampler cannot enter the wheel loop and cause 0 FPS while debugging walls.
- Follow-up: center-out body rays are not sufficient for walls. They miss thin or already-overlapped wall triangles unless a ray happens to cross the triangle. The staged web path now adds a bounded OBB-vs-triangle overlap query on the indexed collision-meta sampler and feeds full/bottom/top car collision volumes through that query before falling back to rays.
- Follow-up: grounded tire visuals are clamped to authored suspension travel. This prevents a steep or wall-adjacent wheel contact from rendering the tire above the chassis while the real body-contact path is still staged.
- Follow-up: wheel contact rays must not accept wall-like normals. The staged web wheel sampler now requires upward-facing normals (`minUpDot` `0.2`) so vertical walls cannot become suspension contacts and launch the car when the tire center reaches the wall.
- Follow-up: body contacts must include ground/floor normals, not only side-wall normals. The previous staged filter rejected upward normals and therefore let bumpers/roof/body volumes dive through ground until wheel suspension corrected the chassis. Body OBB contacts now allow `maxUpDot: 1`.
- Follow-up: the OBB triangle test is now a real triangle-vs-box SAT test instead of broad local AABB overlap, reducing false body contacts from nearby triangles inside the same coarse grid cell.
- This is still a staging optimization; final parity should use native BVH traversal and material filtering instead of the capped JS triangle grid.

Recommended next implementation order:

1. Rebuild/load the original `0x14` collision material table so body/ray/camera participation and friction/restitution match native data.
2. Replace body side ray probes with native body-vs-static triangle clipping and `0x38` contact generation.
3. Port contact reduction, `0x44` contact-node construction, and per-contact solving.
4. Continue Ghidra on dynamic-object body setup and broadphase activation before implementing movable props.

## Remaining Reverse-Engineering Work

The following are still blockers for exact movable prop/cone/barrier behavior:

- Dynamic object body and shape construction from template/config data.
- Exact broadphase pair filters and active/live-set transitions.
- Final labels for contact node flags `0x10/0x20`.
- Final callback/threshold struct at contact node `+0x34` and helper `FUN_00564a60`.
- Full material table loader mapping that builds the consumed `0x14` material records.

These remaining gaps should be resolved before implementing dynamic props as physical objects. Static collision and wheel query work can proceed without inventing behavior.
