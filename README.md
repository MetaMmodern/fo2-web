# Flatout OSS Notes

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

## Driving Prototype

- The current Rapier driving code is only a temporary prototype.
- It now proves the minimum slice: the car spawns on the track, sits roughly on its tires, and can move/reset.
- The handling quality is not acceptable yet and should not be treated as a faithful FlatOut driving model.
- Further work on driving should be guided by extracted executable logic or stronger reverse-engineering, not by continuing to stack ad hoc tuning onto the current prototype.
