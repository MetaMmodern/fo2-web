# Web Renderer Port Notes

Date: `2026-04-06`

## Vehicle Window Binding Note

User-reported and not yet resolved:

- car window rendering appears to show the wrong image / wrong texture binding
- visually it reads like a vinyl or unrelated image on the glass surface, not
  simply "glass is too transparent"
- this should be treated as a texture/source binding issue first, not an
  opacity-only issue
- confirmed renderer mismatch: the original `pro_car_body.sha` and
  `pro_car_window.sha` use a reflection-vector-driven lookup for the reflection
  / specular texture path, while the web port had been sampling that texture by
  mesh UVs; that can directly cause "wrong image on glass" and uneven/dull car
  body response

## Vehicle Body Lighting Note

Confirmed from `pro_car_body.sha`:

- car body input format is `PosNormColorTex1`
- vertex color is not used as a final RGB tint on the body
- vertex color is forwarded into the secondary interpolator as the dirt/damage
  blend input, while the final body RGB is built from base texture, SH ambient,
  diffuse lookup, reflection, fresnel, and specular
- therefore a web-side `baseColor * vertexColor` body path is structurally
  wrong and can directly cause dull / unevenly dark body color

Current web-side correction:

- car body no longer multiplies its final RGB by mesh vertex color
- current vertex color handling is reduced to a weak damage-darkening proxy
  until the original secondary dirt/damage texture path is reconstructed more
  faithfully

## Sun Positioning Note

Confirmed runtime mismatch:

- extracted weather `SunPosition` values are authored in native track space
- start points are explicitly converted into scene space with
  `(x, y, z) -> (x, y, -z)` before use
- the imported track is then shifted again by `alignTrackAtOrigin()`, which
  subtracts the track bounds center on X/Z and the bounds minimum on Y
- the web environment path had been using weather `SunPosition` directly,
  without applying the same source-to-scene conversion and track alignment

Consequence:

- the sun marker / directional light can look incorrect relative to the
  imported track and start grid even when the extracted weather values
  themselves are correct

Current web-side correction:

- after track load and alignment, sun position is remapped to scene space as
  `(x, y, -z) + trackRoot.position`
- that corrected position is then pushed into the environment state,
  environment controller, flare position, and live HUD sun debug controls

## Dynamic Sun Occlusion Note

Confirmed from shader/source review:

- `pro_car_body.sha` does not perform its own geometry-aware "under a roof"
  visibility test
- dynamic body lighting there is built from SH ambient, diffuse lookup,
  reflection/specular, and fresnel
- separate shadow/sunmap infrastructure exists in the original renderer:
  `pro_rendertarget_shadow.sha`, `pro_shadow_dynamic.sha`, shadow constant
  upload, and sunmap shader families
- that means "car darkens under overhead cover" is most likely coming from the
  separate shadow/sunmap path, not from the car-body shader alone

Current web-side approximation:

- raycast from the car toward the corrected sun position using the existing
  track floor sampler
- when static track geometry blocks that path, reduce direct sun/specular on
  vehicle shader families while keeping ambient intact
- this is a practical stopgap for missing dynamic shadow/sunmap consumption,
  not a claim of exact native parity yet

## Tire / Rim Specular Note

Confirmed from extracted asset logs:

- shared wheel material `tire` is `nShaderId: 7 (car diffuse)` in
  [tire_4_log.txt](/Users/metamodern/Documents/Github/Personal/flatout_oss/src/data/cars/shared/tire_4_log.txt)
- shared wheel material `rim` is `nShaderId: 9 (car tire)` in that same file
- therefore the rubber tire itself should not be treated like the special
  reflective/specular rim shader path

Web-side bug that caused over-shiny wheels:

- `createDynamicVehicleMaterial()` was resolving `uSpecularIntensity` as
  `environmentState.specularIntensity ?? specularStrength`
- that means the scene-wide environment specular value overrode the intended
  per-material tire/rim tuning instead of being scaled by it

Current correction:

- tire material uses the non-specular dynamic path
- rim keeps a reduced specular path
- per-material specular now multiplies the environment term instead of being
  replaced by it

## Cross-Track Terrain Brightness Note

Observed mismatch:

- some tracks read globally too bright on terrain-like ground surfaces
  (example: garage)
- others read globally too dark on the same terrain families
  (example: forest `c`)

Best-supported cause in the current web port:

- terrain materials with `nUseColormap = 1` are still using `lightmap1_w2.png`
  as a surrogate modulation source because the original resolved colormap path
  is not faithfully recovered in the extracted web asset set
- those per-track atlases are not authored to have a consistent average
  exposure when treated as a direct terrain modulation input
- so one global surrogate multiply rule can look acceptable on one track and
  badly biased on another

Current correction:

- estimate average luminance of the loaded surrogate terrain lightmap per track
- derive a bounded normalization gain from that average
- apply that gain only on the surrogate-lightmap terrain branch, not on the
  original non-surrogate multiply path

This is a cross-track stabilization for the current surrogate path, not a claim
that the missing original colormap semantics are fully solved yet.

## Sky / Horizon Parameter Note

Confirmed original authored/runtime parameters:

- weather profiles provide:
  - `SkyDomeFile`
  - `SkyDomeOffset`
  - `HorizonRadius`
  - `HorizonHeight`
  - `HorizonBase`
  - `HorizonOffset`
- track atmosphere files provide:
  - `SkyDome_Radius`
  - `CloudLayer_Altitude`
  - `CloudLayer_Size`
  - `CloudLayer_Tiling`
  - `CloudLayer_Curvature`
  - `CloudLayer_Volume`
  - `Horizon_Radius`
  - `Horizon_Base`
  - `Horizon_Height`

Recovered subsystem notes also confirm:

- sky rendering is environment-owned
- `Environment_DrawSkyDomeMesh` is the native sky-dome path
- `Environment_DrawHorizonBand` is the native horizon path
- `SkyDomeOffset` is a real bound weather field in the native environment object

Web-side correction:

- remove the old fixed/hardcoded sky and horizon scene sizes
- use authored sky-dome radius, cloud altitude/size, horizon radius/base/height,
  and horizon offset directly
- keep one explicit inference only for the web-only "sky top plane":
  its size is now derived from authored sky-dome radius instead of a hardcoded
  constant, but that plane itself is still a web approximation rather than a
  confirmed native primitive

Important follow-up correction:

- those authored atmosphere/weather values are still in the original native
  world scale, not in the imported Three.js scene scale
- a temporary direct-use pass caused the sky/horizon to collapse toward track
  height and the horizon/background to disappear
- the current web path therefore keeps source-backed ownership of the values
  but converts them into scene scale before rendering
- `SkyDomeOffset` is treated as an offset on sky/cloud placement, not as "put
  the sky plane at this exact world Y"

Further correction after visual seam regression:

- decomp evidence still confirms a sky draw path and a separate horizon-band
  pass, but that function naming alone does not prove the visible top-sky
  primitive is literally a sphere in the authored race scene
- user-side visual debugging of the original game confirms the visible top sky
  behaves like a plane above the track plus a circular horizon band around it
- the previous web-side switch to dome-textured sky therefore overfit the
  decomp naming and was reverted
- current web path uses a camera-relative sky plane for the visible top sky,
  keeps the circular horizon band as a separate pass, and retains a plain
  gradient dome only as a fallback backdrop so no empty strip leaks through
- horizon, clouds, sky plane, and fallback dome are all anchored to the active
  camera in X/Z to avoid backdrop drift relative to the race camera

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
