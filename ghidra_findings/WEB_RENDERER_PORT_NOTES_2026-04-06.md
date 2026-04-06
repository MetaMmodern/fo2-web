# Web Renderer Port Notes

Date: `2026-04-06`

## Vehicle Window Binding Note

User-reported and not yet resolved:

- car window rendering appears to show the wrong image / wrong texture binding
- visually it reads like a vinyl or unrelated image on the glass surface, not
  simply "glass is too transparent"
- this should be treated as a texture/source binding issue first, not an
  opacity-only issue

## Terrain Port Note

The remaining arena ground artifact is still in active investigation.

Confirmed so far:

- `Colormap.tga` in the current extracted web asset set resolves to a placeholder
  checker texture and is not valid terrain color data
- substituting `lightmap1_w2.png` directly produced visible UV-island tiling and
  is therefore not a valid replacement
- decomp-backed shader check confirms `pro_lightmapped.sha` and
  `pro_lightmapped_spec.sha` use `PosTex2`, so `Tex0` is sampled from texcoord0
  and `Tex1` from texcoord1
- a previous web-side test incorrectly swapped those channels for the terrain
  base, which would expose UV-island tiling
- extracted terrain PNGs also carry alpha channels, but the original terrain
  shaders run in an opaque pipeline, so that alpha should not be interpreted as
  visible terrain cutout
- direct inspection of the imported `track_geom_out.glb` confirms arena terrain
  materials use a packed `TEXCOORD_0` range near `0..1` and a tiled
  `TEXCOORD_1` range up to about `9.0`, which means the visible dirt/detail
  texture belongs on the secondary UV set and the modulation/lightmap-like slot
  belongs on the primary UV set
- `pro_lightmapped_spec.sha` adds terrain specular through `r0.a` after
  `mul r0, t0, t1`, which means the multiplied texture alpha acts as a
  specular mask, not as visible cutout transparency
- a previous web-side terrain pass incorrectly neutralized the modulation slot
  to white and added specular uniformly, which explains the over-bright /
  over-shiny ground response once the UV routing was fixed
- the original terrain multiply is an old DX9-era texture-space multiply, not a
  modern explicitly linearized PBR combine; when the web port multiplies the
  two terrain inputs too literally in the current pipeline, the result can read
  flatter/dimmer than the original game
- when the modulation slot is being approximated with the packed track lightmap
  atlas, that surrogate alpha should not be trusted as the original colormap
  alpha for terrain spec masking
- the surrogate `lightmap1_w2.png` path should also not be treated as sRGB
  albedo data; in the web port it is standing in for lighting/modulation input,
  so sampling it as color texture data can mute the intended lift before post
  even sees the terrain
- separate from terrain shading, the original `post_combine2.sha` is additive;
  the web port had been using a negative bloom-combine constant in its fullscreen
  combine stage, which can suppress glow contribution instead of adding it back
- the web port final fullscreen pass was also clamping the already combined
  post-chain screen color back to `0..1` before output conversion, which
  effectively cancels the intended role of `MaxOverBrighting` in the last stage
  and can make the frame read flatter/dimmer than the original even when bloom
  and terrain shading are otherwise structurally correct
- the static-prelit path in the original `pro_static2x.sha` uses
  `mul_x2_sat` on RGB, so the web port should mirror that directly rather than
  approximating it through a generic brightness uniform
