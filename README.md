# Flatout OSS Notes

## Arena Track Textures

- The arena track texture pipeline now uses PNG files for rendering.
- The original DDS files are kept in `src/data/tracks/arena/textures` as source material, but the app loads the generated `.png` versions.
- This was done because the DDS/compressed-texture path was not honoring the orientation fixes we need for the track billboards and signs.
- If we revisit compressed textures later, use KTX2 only after the import/orientation rules are nailed down at export time.

