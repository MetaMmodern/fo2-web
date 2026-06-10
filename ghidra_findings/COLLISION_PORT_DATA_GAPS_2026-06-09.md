# Collision Port Data Gaps 2026-06-09

Purpose: answer whether the current repo/Ghidra state is sufficient for an assumption-free port of original FlatOut 2 wall, static body, wheel ray, and movable prop collision.

## Short Answer

The previous hard blockers for a native static collision path are now mostly recovered. The static CDB2 leaf format, body-vs-static triangle contact record, contact node layout, contact row generation, and per-contact solver path are sufficiently confirmed to design an assumption-free port for:

- vehicle wheel static queries/ray sweeps against `track_bvh.gen` / `track_cdb2.gen`
- active body-vs-static triangle contacts
- solver-compatible `0x38` contact records and `0x44` contact nodes
- vehicle full/bottom/top collision body volumes

The full original collision engine is not fully implementation-ready yet because dynamic-object body setup, broadphase/live-set activation details, and some callback/flag labels are still incomplete. Those are required before cones, barriers, walls, and movable props can be ported with no assumptions.

## Newly Confirmed: Static CDB2 And BVH

`CollisionSpatial_GenerateBodyTriangleContacts` @ `0x00570040`

- Generates active body-vs-static contacts from authored CDB2/BVH data.
- Traverses quantized static BVH nodes.
- Expands CDB2 leaf commands into triangle candidates.
- Filters material flags before clipping triangles against the body box.
- Writes caller-limited `0x38` byte generated contacts.

`CollisionSpatial_QueryTransformedAabbTriangles` @ `0x005630d0`

- Used by wheel/raycast consumers.
- Builds a transformed query with `CollisionSpatial_BuildTransformedAabbQuery` @ `0x0056d6d0`.
- Traverses the same static CDB2/BVH structure.
- Filters candidate material/ray flags and writes `0x40` triangle query records.

`CollisionCdb2_ExpandLeafCommands` @ `0x0056d3d0`

- Expands CDB2 leaf command pairs into `0x10` byte triangle candidates.
- Dispatches payload modes through table `0x0069bd28`.
- Candidate layout:
  - `+0x00`: material id byte
  - `+0x01`: edge/flag mask byte
  - `+0x02`: vertex attribute / edge flag byte used by query filtering
  - `+0x03`: padding/unused
  - `+0x04`: vertex 0 pointer
  - `+0x08`: vertex 1 pointer
  - `+0x0c`: vertex 2 pointer

CDB2 decoder table `0x0069bd28`:

- mode 0: `CollisionCdb2_DecodeTriangles_Mode0` @ `0x0056ce10`
- mode 1: `CollisionCdb2_DecodeTriangles_Mode1` @ `0x0056cfa0`
- mode 2: `CollisionCdb2_DecodeTriangles_Mode2` @ `0x0056d120`
- mode 3: `CollisionCdb2_DecodeTriangles_Mode3` @ `0x0056d1c0`
- mode 4: `CollisionCdb2_DecodeTriangles_Mode4` @ `0x0056d250`
- mode 5: `CollisionCdb2_DecodeTriangles_Mode5` @ `0x0056d330`

`CollisionCdb2_ExpandOneLeafCommand` @ `0x0056d490`

- Single-command version used by the nearest triangle raycast tree path.

## Confirmed: Generated Contact And Solver Records

`CollisionSpatial_ClipTriangleAgainstBodyBoxContact` @ `0x00571080`

- Transforms triangle vertices into body-local box space.
- Clips the triangle polygon against body extents.
- Computes the clipped polygon centroid.
- Emits a `0x38` byte generated contact record:
  - `+0x00..+0x08`: world contact point
  - `+0x0c..+0x14`: contact normal
  - `+0x18..+0x20`: body/contact velocity term at the contact
  - `+0x24..+0x2c`: body-local clipped centroid/contact point
  - `+0x30`: penetration/depth
  - `+0x34`: material or triangle id

`ContactManifold_ReduceContactsByDepthAndExtents` @ `0x0056f7d0`

- Reduces body-static generated contacts when clipping emits too many points.
- Keeps the deepest contact and extremal contacts in tangent directions.

`PhysicsWorld_InitializeContactPoolsAndDefaults` @ `0x00565a10`

- Initializes `0x400` contact nodes at `world+0xf720`, stride `0x44`.
- Installs contact vtable `0x0067bc0c`.
- Zeroes contact count/state at `world+0x20720`.
- Sets confirmed default scalars:
  - `world+0x2073c = 0.1`
  - `world+0x20738 = 0.00001`
  - `world+0x20740 = 0.25`
  - `world+0x20744 = 1.25`
  - `world+0x910 = 1.0`

`PhysicsWorld_AppendContactConstraint` @ `0x0056a850`

- Appends one generated contact into the world contact graph.
- Allocates from `world+0xf720 + world->0x20720 * 0x44`.
- Links the node into body contact lists.
- Resolves friction/restitution/material terms from material tables and body flags.

Confirmed partial `0x44` contact node layout:

- `+0x00`: vtable pointer `0x0067bc0c`
- `+0x04`: solver/impulse accumulator field, exact label not final
- `+0x08`: flags
  - bit `0x1`: tangent/friction rows enabled
  - bit `0x2`: restitution/bounce path enabled
  - bit `0x4`: active/solvable contact
  - bit `0x8`: static/material contact bias path
  - bits `0x10` and `0x20`: body/material cases, labels not final
- `+0x10`: callback/friction scalar selected by some body flag cases
- `+0x18`: body A pointer
- `+0x24`: body A list anchor
- `+0x28`: body B pointer, zero for static
- `+0x34`: callback/threshold pointer, exact struct not final
- `+0x38`: pointer to generated `0x38` contact record
- `+0x3c`: restitution scalar / bounce threshold term
- `+0x40`: friction coefficient / tangent impulse bound

## Confirmed: Contact Solver

Contact vtable `0x0067bc0c`:

- slot 0: `ContactConstraint_GetSolverRowCount` @ `0x0056f2b0`
- slot `+4`: `ContactConstraint_FillSolverRowsAndBounds` @ `0x0056f2d0`
- slot `+8`: `ContactConstraint_ResetNodeLinks` @ `0x00565220`

`ContactConstraint_GetSolverRowCount` @ `0x0056f2b0`

- Returns one normal row by default.
- Returns three rows when contact flag bit `0x1` is set, adding two tangent/friction rows.

`ContactConstraint_FillSolverRowsAndBounds` @ `0x0056f2d0`

- Builds the normal row from the contact normal and angular lever arm `r x n`.
- Builds negative body B rows when a second body exists.
- Clamps penetration depth to `[0, 0.5]`.
- Applies penetration bias using world coefficients.
- Applies restitution when node flag `0x2` and relative normal velocity meet the native threshold path.
- Adds tangent rows with `FUN_005b1940(contactNormal, outTangentA/B)` when node flag `0x1` is set.
- Uses tangent bounds `[-node+0x40, +node+0x40]`.

`PhysicsSolver_SolveContactConstraint` @ `0x00572fb0`

- Gets row count and fills rows through the contact vtable.
- Builds effective mass / RHS for one-body and two-body contacts.
- Solves projected bounded constraints.
- Applies solved impulses to body A and body B.
- Handles impact threshold/callback side effects from node `+0x34`.

Helper anchors:

- `PhysicsSolver_BuildSingleBodyRhs` @ `0x00572420`
- `PhysicsSolver_BuildTwoBodyRhs` @ `0x005725b0`
- `PhysicsSolver_ApplySolvedImpulseToBody` @ `0x00572850`
- `PhysicsSolver_SolveProjectedConstraintBounds` @ `0x00574a50`
- `PhysicsSolver_ScaleJacobianRowsByInverseMassInertia` @ `0x00572da0`
- `PhysicsSolver_ScaleJacobianRowsByBodyMatrix` @ `0x00572e60`
- `PhysicsSolver_MultiplyConstraintMatrix` @ `0x005720a0`
- `PhysicsSolver_AccumulateConstraintMatrix` @ `0x00572250`

## Confirmed: Vehicle Body Volumes

`Vehicle_LoadCollisionPanelsAndCrashConfig` @ `0x00431b50`

- Reads car collision boxes from:
  - `CollisionFullMin` @ `0x0066a44c`
  - `CollisionFullMax` @ `0x0066a438`
  - `CollisionBottomMin` @ `0x0066a424`
  - `CollisionBottomMax` @ `0x0066a410`
  - `CollisionTopMin` @ `0x0066a400`
  - `CollisionTopMax` @ `0x0066a3f0`
- Subtracts the model center at vehicle `+0x1c60/+0x1c64/+0x1c68`.
- Stores full, bottom, and top volume min/max, centers, and half extents in the vehicle runtime.

Porting implication: current web code that only uses `CollisionFullMin/Max` is not a 1:1 body collision port.

## Confirmed: Collision Material Flags

Dynamic/object material config keys:

- `BodyCollision` @ `0x0067bf3c`
- `CameraCollision` @ `0x0067bf2c`
- `RayCollision` @ `0x0067bf1c`
- `BodyFriction` @ `0x0067bf68`
- `Friction` @ `0x0067bf78`
- `CollisionSound` @ `0x0067bf94`
- `BodyEffect1` @ `0x0067bef8`
- `RoadEffect1` @ `0x0067bf10`
- `RoadEffect2` @ `0x0067bf04`

Confirmed consumer behavior:

- Body-vs-static contact generation checks material record byte/flags at material stride `0x14`, offset `+0x0c`, bit `0x1`.
- Wheel/ray query filtering uses candidate byte `+0x02` and material flags instead of render mesh material names.
- Static contacts use material `+0x04` as friction and material `+0x08` as restitution source in `PhysicsWorld_AppendContactConstraint`.

## Current Web Divergences

- `tools/generate-track-collision-assets.js` still documents `track_cdb2` triangle command semantics as unresolved and emits a W32/BVH surface subset.
- `src/data/tracks/**/geometry/collision.meta.json` is extraction kind `w32-bvh-surface-subset`, not native CDB2 collision data.
- `src/game/track.js` maps surface types from render/material names into ad hoc material slots.
- `src/game/physics.js` and `src/game/physicsRapier.js` use only the full car collision box, not full/bottom/top native volumes.
- Rapier dynamic props are mostly category/name heuristics, not native activation/live-set bodies with original material flags.

## Remaining No-Assumption Blockers

These still need decompilation before implementing full cones/walls/movable props as original behavior:

1. Dynamic object body/shape construction
   - Need exact mapping from object/template data to native body shapes, collision bounds, category/mask flags, mass, restitution, inertia, and wake/reactivation thresholds.

2. Broadphase pair filtering and live-set activation
   - Anchors exist:
     - `PhysicsWorld_BuildPotentialContactPairs` @ `0x00565f10`
     - `PhysicsWorld_UpdateBodyBroadphaseBounds` @ `0x0056ea50`
     - `DynamicObject_RegisterIntoEnvironmentActivationLists` @ `0x00565c40`
     - `DynamicObject_RegisterIntoEnvironmentLiveSet` @ `0x00565d50`
   - Field-level filters and activation transitions are not final.

3. Final callback/threshold structs
   - `0x44` contact node `+0x34`, flag bits `0x10/0x20`, and callback helper `FUN_00564a60` need final labels before collision callbacks and damage queues are ported.

4. Material table loader/source
   - Consumers and stride are confirmed, but the full loader mapping from config/database to the `0x14` material records should be recovered before generating web material tables.

## Practical Decision

Do not invent a Rapier or JS collision layer for walls/cones if the target is 1:1. The right next implementation work is a direct native-data path:

1. Decode `track_bvh.gen` / `track_cdb2.gen` with the recovered CDB2 leaf/candidate format.
2. Replace extracted surface-subset collision metadata with native CDB2-backed query structures.
3. Port wheel static query/raycast path first.
4. Port active body-vs-static triangle contact generation and contact reduction.
5. Port contact node construction and the per-contact solver.
6. Continue Ghidra on dynamic-object body setup and broadphase activation before implementing cones/movable props.
