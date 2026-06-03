# Menu Car Rendering Findings - 2026-06-03

## Confirmed From Ghidra

- `MenuInterface_UpdateMenuCarTransform` @ `0x004ac680` is the original menu car transform/update tick.
- `gui+0x5b4` stores the menu car yaw angle.
- Automatic rotation is controlled by `gui+0x590` and advances by:
  - `dtMilliseconds * 0.0010000000474974513 * 0.10471975803375244`
  - Equivalent: `dtSeconds * 0.10471975803375244` radians, or 6 degrees per second.
- Manual PageUp/PageDown rotation is gated by `gui+0x58c` and uses:
  - `dtSeconds * 1.0471975803375244`
  - PageUp substitutes `-0.5`; PageDown adds `+0.5`.
- The yaw matrix is a Y-axis rotation built from `sin(gui+0x5b4)` and `cos(gui+0x5b4)`, then multiplied by the selected pose matrix stored at `gui+0x510`.
- This means the display mesh should spin around its pose/model origin, not orbit around an externally offset parent.

## Asset Paths

- `MenuCar_OpenBgmFileForLoad` @ `0x004a44a0` opens `data/menu/cars/menucar_%i.bgm`.
- `MenuCar_RequestLoadById` @ `0x004acb90` checks the same `data/menu/cars/menucar_%i.bgm` path and drives the menu car load state machine.
- `LoadCarTexture` @ `0x004a45f0` opens `data/menu/cars/car_%i/skin%i.dds`.
- `MenuScene_InitializeEnvironmentAndCamera` @ `0x004ab9f0` loads shared menu car textures from `data/cars/shared`, including `menu_car_shadow.tga`.
- The same bootstrap defines `POSE_CARSHOP` as Lua value `2`.

## Car-Shop Pose / Camera

- Confirmed `MenuScene_InitializeEnvironmentAndCamera` seeds car-shop pose data before Lua scripts run.
- The recovered car-shop display pose uses the source-space car position `(0, 0, 5)`, which the port converts to `(0, 0, -5)` for the current Three.js convention.
- The recovered camera source-space position is `(0, 1.8349448, 0)`.
- The recovered car-shop look target is built from the car position plus lateral target offset `(-1.28, 0, 0)`.
- The menu camera near/far values are seeded as `0.1` and `20.0`.

## Port Implications

- The MVP menu preview should use a slow 6 degrees/sec automatic yaw.
- The preview transform should keep the model centered at its local origin and use the parent only for screen placement.
- Do not force car body materials transparent to solve UI layering. The existing port's vehicle shader already treats the body texture alpha channel as gloss/reflectivity, matching the recovered material behavior assumptions.
- Menu UI layering should be solved by scene ordering or explicit render passes, not by reinterpreting skin alpha as opacity.
- 2026-06-03 implementation update: `src/game/menuBgm.js` now loads the original FO2 `menucar_%i.bgm` compact menu-car files at runtime for the car-selection preview, instead of using the heavier race `body_out.glb` path. The canvas UI is rendered as the opaque backdrop first, and the BGM car renders on top with the original 6 degrees/sec yaw.
- 2026-06-03 follow-up: the port now renders menu backdrop, 3D menu car, and foreground UI as separate passes so car-name/class/footer text can sit in front of the car like the original UI. The preview also uses `menu_car_shadow.png` for the BGM `groundplane` material.
- Current asset gap: the workspace has `menucar_%i.bgm`, but not the original `data/menu/cars/car_%i/skin%i.dds` menu skin folders. Until those are restored/converted, the preview must still fall back to the race skin PNGs, which may not perfectly match the menu BGM UV expectations.
- 2026-06-03 material update: the runtime BGM loader now carries authored material texture names into `materials.js`, so `tire`/`rim` surfaces use the exact shared tire texture named in each BGM (`tire_04`, `tire_05`, `tire_06`, etc.) instead of the single catalog tire alias.
