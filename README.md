# Flatout OSS Notes

## Arena Track Textures

- The arena track texture pipeline now uses PNG files for rendering.
- The original DDS files are kept in `src/data/tracks/arena/textures` as source material, but the app loads the generated `.png` versions.
- This was done because the DDS/compressed-texture path was not honoring the orientation fixes we need for the track billboards and signs.
- If we revisit compressed textures later, use KTX2 only after the import/orientation rules are nailed down at export time.
- The arena skybox and flare assets are also converted to PNG for the same reason.
- For the filter set, `default_add` and `default_sub` are the only ones we need for the first lighting pass; the other variants can stay on disk as backup inventory for later time-of-day work.
