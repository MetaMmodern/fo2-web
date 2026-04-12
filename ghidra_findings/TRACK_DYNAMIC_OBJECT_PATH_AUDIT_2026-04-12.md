# Track Dynamic Object Path Audit 2026-04-12

Purpose: record what the original data and recovered decomp already prove about roadside props, breakables, and triggered world objects.

This is a focused implementation-planning note, not a final runtime design.

## Why This Audit Was Needed

The current Rapier runtime already has:

- stable gravity
- stable chassis/world contact
- authored static collision from `track_geom.w32` + `track_bvh.gen`

But the car still passes through loose cones and tires.

The key question was whether those objects should be expected to come from the same static collision path.

## Confirmed Conclusion

They should not.

Roadside props, breakables, and similar world-interaction objects belong to a separate dynamic-object subsystem in the original game.

They are not just extra triangles inside the static authored collision world.

## Confirmed From Decompiled Runtime Notes

The collision/destruction subsystem note explicitly exposes a dedicated object-side runtime:

- `0x00590fd0` -> `DynamicObject_InitializeFromLua`
- `0x00591cb0` -> `DynamicObject_DispatchDestroyAndEmitterFx`
- `0x00597320` -> `DynamicObject_InstantiateLinkedProxyByName`
- `0x00565c40` -> `DynamicObject_RegisterIntoEnvironmentActivationLists`
- `0x00565d50` -> `DynamicObject_RegisterIntoEnvironmentLiveSet`
- `0x005a3670` -> `DynamicObject_InitializeHingeConstraint`
- `0x005a3c80` -> `DynamicObject_InitializeJointConstraint`
- `0x004839b0` -> `StuntWorld_InitializeDynamicPropsAndRagdollMap`

Recovered behavior from the same note:

- object construction is Lua/data driven
- destroy/emitter/explosion side effects are explicit runtime stages
- props can instantiate linked proxies/effect objects
- some obstacles use hinge and joint constraints
- stunt worlds bootstrap additional prop/ragdoll pools

Source:

- [COLLISION_DESTRUCTION_FINDINGS_2026-04-04.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/docs/COLLISION_DESTRUCTION_FINDINGS_2026-04-04.md)
- [CollisionSystem.cpp](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/CollisionSystem.cpp)
- [CollisionSystem.h](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut-2-decomp-main/source/decomp2/decomp2/CollisionSystem.h)

## Confirmed From Original Track Data Already In Repo

The extracted `collision.meta.json` files already contain a `dynamicObjects` list with per-object `dynamicName` categories.

That means the original track-side data path already distinguishes these objects from the static world.

### Garagetest `garagetest1/a`

Top categories:

- `rubber_cone`: `585`
- `wood_light`: `205`
- `rubber_tire`: `115`
- `metal_light`: `13`

### Arena `arena1/a`

Top categories:

- `metal_light`: `125`
- `rubber_tire`: `54`
- `wood_light`: `20`
- `concrete_block_superheavy`: `1`
- `rubber_cone`: `1`
- `plastic_light`: `1`

### City `city1/a`

Top categories include:

- `metal_light`: `1861`
- `wood_light`: `595`
- `rubber_cone`: `348`
- `metal_obstacle`: `304`
- `metal_wirefence`: `204`
- `plastic_light`: `197`
- `metal_lightpole`: `190`
- `metal_pipes`: `115`
- `window`: `99`
- `metal_barrel`: `79`
- `wood_obstacle`: `57`
- `metal_car`: `53`
- `metal_heavy`: `45`
- `hay_box`: `18`
- `metal_structure_tilt`: `9`
- `rock_light`: `7`
- `metal_gate_180`: `5`
- `explosive_gaspump`: `4`
- `wood_heavy`: `4`

### Forest `forest1/a`

Top categories include:

- `wood_light`: `444`
- `metal_light`: `427`
- `fence_wood`: `315`
- `rubber_cone`: `201`
- `fence_metal`: `150`
- `advert_wood`: `102`
- `metal_sheet`: `92`
- `cardboard_box`: `46`
- `wooden_log`: `46`
- `metal_lightpole`: `42`
- `plastic_light`: `36`
- `wood_electricpole_new`: `34`
- `wood_electricpole_crossbar`: `34`
- `hay_box`: `21`
- `metal_watertank`: `21`
- `metal_barrel`: `17`
- `metal_obstacle`: `10`
- `metal_medium`: `10`
- `wood_heavy`: `9`
- `metal_heavy`: `9`

These category names line up closely with the user-observed world objects:

- cones
- loose tires
- billboards
- billboard frames
- windows / glass
- gas pumps
- fences
- barrels
- logs
- heavy rocks / obstacles

## Relation To Static Collision Work

The earlier static-collision extraction work intentionally completed only:

- `track_geom.w32`
- `track_bvh.gen`

That path is sufficient for the authored static blocking world.

It is explicitly **not** the completed path for dynamic roadside props.

Relevant note:

- [TRACK_COLLISION_EXTRACTION_IMPLEMENTATION_2026-04-11.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/TRACK_COLLISION_EXTRACTION_IMPLEMENTATION_2026-04-11.md)

## `track_cdb2.gen` Relevance

Current repo findings still mark `track_cdb2.gen` as unresolved.

Confirmed from existing notes:

- it contains a separate collision-side dataset
- it is not just a duplicate of render geometry
- it may still matter for lower-level collision/detail parity beyond the static extracted mesh

Important consequence:

- `track_cdb2.gen` should remain in scope for the dynamic-object path
- the current static BVH-derived collision mesh should not be assumed to cover all prop/runtime behavior

Relevant note:

- [TRACK_CDB2_INITIAL_FORMAT_FINDINGS_2026-04-10.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/TRACK_CDB2_INITIAL_FORMAT_FINDINGS_2026-04-10.md)

## Original Asset Tree Cross-Check

The original track tree also supports this split:

- tracks ship `track_bvh.gen`
- tracks ship `track_cdb2.gen`
- tracks ship many prop-specific textures and authored assets such as cones, tires, billboard materials, fences, and related world pieces

Relevant source:

- [original_flatout_tree.txt](/Users/metamodern/Documents/Github/Personal/flatout_oss/original_flatout_tree.txt)

## Implementation Consequence

The current Rapier runtime should not try to get final roadside-prop interaction "for free" from the static world mesh.

Correct next implementation direction:

1. treat `collision.meta.json` `dynamicObjects` as the first runtime object roster
2. keep those objects out of the static collision trimesh
3. instantiate them as a separate dynamic-object layer
4. map runtime behavior by `dynamicName` category
5. keep `track_cdb2.gen` in scope as a likely follow-up source for parity/activation/detail work
6. keep trigger-driven events such as falling rocks in scope under environment activation / live-set / stunt-prop style runtime logic rather than static collision

## Working Hypothesis For Triggered Falling Rocks

This is not yet confirmed from a dedicated pass, but the recovered subsystem shape strongly suggests that "rocks falling from the sky when the car approaches" belongs to:

- environment activation lists
- environment live set management
- or stunt/world prop bootstrap logic

It does **not** look like a property that would naturally fall out of the current static collision mesh path.
