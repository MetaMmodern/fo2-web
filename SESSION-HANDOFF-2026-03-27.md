# FlatOut WebGL Handoff

## Current State

- Local viewer works and renders the car in a white studio scene.
- Current runtime entrypoint is [`src/index.js`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/index.js).
- Current model source is [`src/data/car_1/model_assimp.glb`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/model_assimp.glb).
- Current original FBX source is [`src/data/car_1/body.fbx`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/body.fbx).
- Current original DDS textures include [`src/data/car_1/skin1.dds`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin1.dds) and [`src/data/car_1/skin2.dds`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin2.dds).
- DDS conversion script exists at [`tools/convert-dds-to-png.js`](/Users/metamodern/Documents/Github/Personal/flatout_oss/tools/convert-dds-to-png.js).

## Important Findings

- The original online-converted GLB was missing material texture bindings. It should not be treated as authoritative.
- The FBX is materially sane. `assimp info` showed these texture refs:
  - `body -> skin1.dds`
  - `window_* -> windows.dds`
  - `light_* -> lights.dds`
  - `interior -> interior.dds`
  - `common -> common.dds`
- A local `assimp export` of the FBX preserved those bindings, producing `model_assimp.glb`.
- The root texture-loading bug was not DDS decode at one point, but bad URLs:
  - Parcel texture imports needed `url:` prefix.
  - Without that, runtime requests were going to `...[object Object]`.
- `flipY = false` is currently the correct setting for the manually assigned textures in this viewer.
- Full bindings for shared textures are currently hardcoded and working well enough:
  - `common.png`
  - `interior.png`
  - `windows.png`
  - `lights.png`
  - `shadow.png`

## What Was Debugged

- Checker textures rendered correctly.
- Different GLB sources rendered correctly enough to compare.
- Preview planes proved the skin textures were loading once the `url:` import issue was fixed.
- The car body texture is basically fine now.
- The current major visual issue is not the global body skin. It is panel-specific.

## Hood Issue

- The hood problem is currently unresolved.
- The likely problem is hood-specific UV mapping, not texture decode and not global `flipY`.
- Observation:
  - the hood texture region the game appears to use is on the left side of the atlas
  - the rendered hood seems to sample a different region from the right side
- That suggests:
  - the hood mesh UVs are wrong or mismatched
  - likely introduced somewhere in `.bgm -> .fbx` or `.fbx -> .glb`
- We tried:
  - moving the hood down
  - hiding the hood
  - rotating the hood
- Those were not the right fixes. The issue appears to be UV placement for the `hood` panel.

## Relevant Files

- App:
  - [`src/index.js`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/index.js)
  - [`src/styles.css`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/styles.css)
- Model assets:
  - [`src/data/car_1/body.fbx`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/body.fbx)
  - [`src/data/car_1/model.glb`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/model.glb)
  - [`src/data/car_1/model_assimp.glb`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/model_assimp.glb)
- Car textures:
  - [`src/data/car_1/skin1.dds`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin1.dds)
  - [`src/data/car_1/skin1.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin1.png)
  - [`src/data/car_1/skin2.dds`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin2.dds)
  - [`src/data/car_1/skin2.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/skin2.png)
- Shared textures:
  - [`src/data/shared/common.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shared/common.png)
  - [`src/data/shared/interior.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shared/interior.png)
  - [`src/data/shared/windows.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shared/windows.png)
  - [`src/data/shared/lights.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shared/lights.png)
  - [`src/data/shared/shadow.png`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/shared/shadow.png)
- Original metadata:
  - [`src/data/car_1/body.ini`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/body.ini)
  - [`src/data/car_1/camera.ini`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/camera.ini)
  - [`src/data/car_1/lights.ini`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/lights.ini)
  - [`src/data/car_1/panels.ini`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/panels.ini)
  - [`src/data/car_1/tires.ini`](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/car_1/tires.ini)
- Global asset inventory:
  - [`original_data_tree.txt`](/Users/metamodern/Documents/Github/Personal/flatout_oss/original_data_tree.txt)

## Installed / Verified Tools

- `ffmpeg` was installed but could not decode this DDS variant correctly.
- `imagemagick` was installed but also failed on the original DDS directly.
- `assimp` was installed and was useful:
  - `assimp info src/data/car_1/body.fbx`
  - `assimp export src/data/car_1/body.fbx /tmp/body_assimp.glb`

## Recommended Next Step

- Focus specifically on the `hood` panel UVs.
- Do not re-open global DDS debugging unless new evidence points there.
- Suggested next debugging move:
  - isolate the `hood` mesh only
  - render it with a UV checker
  - inspect which atlas island it samples
  - compare that to the expected hood island on `skin1`
  - if mismatched, apply a hood-specific UV remap or source a better conversion path for that panel
## Important: Parcel Asset Pipeline

- `src/game/generated/runtimeAssetCatalog.js` currently imports a very large portion of `src/data` via `url:` imports.
- Because of that, Parcel owns those assets in its graph and will fingerprint/hash them and spend build time traversing them.
- If build time needs to be reduced, the fix is not a Parcel flag on the current setup.
- The real fix is to change `tools/generate-runtime-catalog.js` so it emits plain runtime paths for data assets instead of `url:` imports, then copy/serve `src/data` as raw files.
- As long as the generated catalog keeps importing `src/data`, Parcel optimization work on that folder is expected.
