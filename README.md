# Flatout OSS Notes

## Ghidra Baseline

- Use [reference/ghidra_projects/fo2_zack_result.rep](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/ghidra_projects/fo2_zack_result.rep) as the active Ghidra project baseline.
- Treat [reference/ghidra_projects/flatout2.rep](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/ghidra_projects/flatout2.rep) as legacy only.
- The address book remains valid without remapping because both projects target the same `FlatOut2.exe` hash.
- Project-specific guidance lives in [README.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/ghidra_projects/README.md).

## Arena Track Textures

- The arena track texture pipeline now uses PNG files for rendering.
- The original DDS files are kept in `src/data/tracks/arena/textures` as source material, but the app loads the generated `.png` versions.
- This was done because the DDS/compressed-texture path was not honoring the orientation fixes we need for the track billboards and signs.
- If we revisit compressed textures later, use KTX2 only after the import/orientation rules are nailed down at export time.
- The arena skybox and flare assets are also converted to PNG for the same reason.
- For the filter set, `default_add` and `default_sub` are the only ones we need for the first lighting pass; the other variants can stay on disk as backup inventory for later time-of-day work.

## Arena Environment Defaults

- The current arena environment is tuned against captured gameplay footage rather than the raw atmosphere radii.
- These defaults live in `src/game/environment.js` under `DEFAULT_ENVIRONMENT_VALUES`.
- Current tuned values are `skyPlaneSize = 3300`, `skyPlaneAltitude = 188`, `horizonRadius = 599`, `horizonBase = -40`, and `horizonHeight = 217`.
- The current arena color pass uses `default_add.tga` and `default_sub.tga` as a full-screen luminance-based filter.

## Orbit Debug Camera

- Press `` ` `` to toggle orbit debug camera.
- In orbit mode, `I/J/K/L` move the camera rig on the horizontal plane.
- In orbit mode, `U/O` move the rig vertically.
- In orbit mode, the mouse wheel changes FOV instead of dollying.
- Press `1` to reduce the keyboard movement step.
- Press `2` to increase the keyboard movement step.
- Keyboard movement uses a fixed step per second, so it does not accelerate over time.

## Camera Direction

- Future gameplay camera work should follow the recovered native camera system, not a single hardcoded chase camera.
- The original game uses multiple authored camera profiles plus runtime tracker tuning from `Data.Camera.*`.
- Start from [GHIDRA_VISUAL_ADDRESSBOOK.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/GHIDRA_VISUAL_ADDRESSBOOK.md) and [CAMERA_BEHAVIOR_FINDINGS_2026-03-31.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/CAMERA_BEHAVIOR_FINDINGS_2026-03-31.md) before changing gameplay camera behavior.

## Driving Status

- The current runtime now follows the recovered FlatOut 2 driving shape instead of the earlier placeholder path.
- Steering, gearbox, body/tire config, and surface tire dynamics are loaded from the extracted handling data under `src/data/database/flatout2.db extracted/` plus the per-car `body.ini` and `tires.ini` files.
- The browser runtime uses an adaptive micro-step count rather than the literal native `100 x 0.01` loop, because the full native count is too expensive when each step includes JS-side wheel-contact raycasts.
- The web port still needs sweep-and-tune passes, but new driving work should continue from the recovered data path rather than reintroducing ad hoc prototype physics.
- Known current follow-up: the launch band right above standstill is stable now, but still twitchier than the original game. Treat that as an open low-speed steering/yaw/torque staging issue rather than a camera issue.
