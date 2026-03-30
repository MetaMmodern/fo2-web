# Zack Reference Notes - 2026-03-30

Useful upstream references to keep nearby for the current FO2 renderer work:

- Shader conversion / discussion repo:
  - https://github.com/ZackWilde27/FlatOut2-HLSLToSHA
- Filters / LUT discussion:
  - https://github.com/ZackWilde27/FlatOut2-HLSLToSHA/issues/2
- Ongoing decomp repo:
  - https://github.com/ZackWilde27/FlatOut-2-decomp

Key takeaways from Zack's Discord + issue comments:

- `post_colorremap_by_alpha` is the color-grading path.
- The scene luminance is written into alpha first, then alpha is used to index a `256x1` filter texture.
- The filter texture is treated as signed bias data rather than simple `0..255` color.
- Bloom is built from box-blurring the render target with a 4-sample path in the DX9-era shader stack.

Why this matters to this repo:

- Our current renderer direction is broadly correct about "luminance in alpha + LUT remap + bloom".
- The main remaining errors are in the exact pass ordering and combine behavior, not in the high-level existence of those systems.
