Yes. Before you switch OSes, here’s the practical version.

**Tracks**

For a web pipeline, split track extraction into `render`, `race metadata`, and `collision`. From your asset tree, each track bundle consistently includes:

- `track_geom.w32`
- `track_cdb2.gen`
- `track_bvh.gen`
- `plant_vdb.gen`
- `splitpoints.bed`
- sometimes `track_spvs.gen`

That pattern is visible throughout [`original_data_tree.txt`](/Users/metamodern/Documents/Github/Personal/flatout_oss/original_data_tree.txt).

What to export and keep:

1. **Render mesh**
- Input: `track_geom.w32`
- Export:
  - `track_geom.fbx` via `FlatOutW32BGMTool_gcp.exe ... -export_fbx`
  - then `track_geom.glb` via `assimp export`
- Also export:
  - `track_geom.txt` via `-export_text`
  - this is useful for materials/shader names and sanity checks

2. **Race metadata**
- Keep raw:
  - `splitpoints.bed`
- Reason:
  - this is the most obvious candidate for checkpoints / lap progression / split logic
- I would not ignore it.

3. **Collision**
- Keep raw:
  - `track_cdb2.gen`
- Reason:
  - this is very likely important collision data
- For alpha, you can fake collision from simplified render geometry.
- For beta+, you should preserve `track_cdb2.gen` for later reverse engineering.

4. **Culling / visibility / vegetation helpers**
- Keep raw:
  - `track_bvh.gen`
  - `plant_vdb.gen`
  - `track_spvs.gen` when present
- Reason:
  - these are probably not required for first playable web races
  - but they are absolutely worth archiving because they may become important for performance or prop/visibility behavior

So the **minimum smart extraction set per track** is:

- `track_geom.w32 -> track_geom.fbx -> track_geom.glb`
- `track_geom.w32 -> track_geom.txt`
- copy raw `splitpoints.bed`
- copy raw `track_cdb2.gen`
- copy raw `track_bvh.gen`
- copy raw `plant_vdb.gen`
- copy raw `track_spvs.gen` if present
- copy all referenced textures for that track

If you want the short “what do I actually do on Windows” version:

```bat
FlatOutW32BGMTool_gcp.exe track_geom.w32 -export_fbx
FlatOutW32BGMTool_gcp.exe track_geom.w32 -export_text
```

Then later on macOS:
```bash
assimp export track_geom.fbx track_geom.glb
```

My recommendation:
- For `alpha`: use `track_geom.glb` + `splitpoints.bed` + raw texture set. Ignore native collision/culling at first.
- For `beta`: bring in `track_cdb2.gen`, `track_bvh.gen`, `plant_vdb.gen`, `track_spvs.gen` because those are the likely pain points later.

Source for W32 export behavior: the tool explicitly supports exporting tracks to `.fbx` and text, plus BVH/collision-related creation/editing flags in its README/usage docs:
- https://github.com/gaycoderprincess/FlatOutW32BGMTool
- https://github.com/gaycoderprincess/FlatOutW32BGMTool/blob/main/EXAMPLES.md

**EXE reverse-engineering workflow**

Yes, we can do this in a way where I can participate. But for native EXEs, the right equivalent of “decompiled Java folder” is not one big pretty source tree. It’s a shared reverse-engineering workspace made of plain-text artifacts.

Use this structure in the repo:

```text
reverse/
  flatout2/
    originals/
      FlatOut2.exe
      *.dll
    ghidra/
      notes.md
      strings.txt
      imports.txt
      functions.csv
      interesting/
        vehicle_update.c
        tire_forces.c
        ai_driver_update.c
        damage_apply.c
        race_state_update.c
      xrefs/
        car.txt
        tire.txt
        suspension.txt
        checkpoint.txt
        damage.txt
```

Practical setup:

1. **Copy binaries**
- Put `FlatOut2.exe` and any relevant DLLs into `reverse/flatout2/originals/`

2. **Open in Ghidra**
- Create a project
- Import `FlatOut2.exe`
- Run default analysis
- Let it identify architecture and functions

3. **Export the useful text artifacts**
- `strings.txt`
- `imports.txt`
- `functions.csv` or function list dump
- decompiled pseudocode of interesting functions into separate `.c` or `.txt` files
- notes on renamed functions / structs in `notes.md`

4. **Search by domain keywords**
Start with:
- `car`
- `wheel`
- `tire`
- `susp`
- `gear`
- `engine`
- `damage`
- `ragdoll`
- `driver`
- `checkpoint`
- `lap`
- `race`
- `split`

5. **Dump only the important functions**
Do not try to export the whole EXE as pseudo-C. That becomes noise.
Instead, export only functions around:
- vehicle update
- tire force / suspension
- AI update
- race state / checkpoint handling
- damage application
- driver ejection

6. **Optional runtime help**
Use Cheat Engine or x64dbg to find:
- speed value
- RPM
- lap count
- car transform
- player-car pointer chains

Write those findings into `notes.md`. That helps tie runtime variables back to functions.

What I can help with once that folder exists:
- parse strings/imports/functions
- suggest what functions to inspect next
- infer likely structs from decompiled output
- help rename fields/functions
- map “what lives in data” vs “what lives in code”
- turn findings into a reconstruction plan for physics/AI/race logic

The key is: don’t try to hand me a raw Ghidra project only. Hand me exported text artifacts in a folder.

If you want, next I can write you a ready-to-use markdown checklist for:
- `Windows export tasks`
- `track extraction tasks`
- `EXE reverse-engineering workspace setup`

so you can follow it mechanically when you switch OSes.