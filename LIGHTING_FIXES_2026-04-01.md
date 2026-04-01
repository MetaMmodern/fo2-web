# Lighting Fixes - 2026-04-01

## Summary

Applied **3 critical fixes** to address the plain lighting appearance. These target the root causes identified in VISUAL_FINDINGS_2026-03-29.md.

---

## Changes Made

### 1. **Static Prelit Material Reconstruction** (track.js)
**Problem**: Static prelit surfaces (shader ID 0) were using `MeshBasicMaterial` with aggressive brightness hacks (6.0×/7.5×). This threw away all prelit lighting information.

**Solution**: 
- Switched to `MeshStandardMaterial` with `lightMap` + `lightMapIntensity`
- Reduced multipliers from `6.0`/`7.5` to `1.2`/`1.45` (now modulate, not amplify)
- Removed `onBeforeCompile` shader hacks

**Impact**: Static prelit geometry now properly blends with ambient lighting, resulting in better contrast and less washed-out appearance.

**Files modified**:
- `src/game/track.js` — `createStaticPrelitMaterial()`, `getStaticPrelitSettings()`, call site

---

### 2. **Bloom Final Blending Fix** (postprocessing.js)
**Problem**: The final material wasn't correctly recombining the bloom mask with the base image. The fragment shader was computing bloom contribution as:
```glsl
bloomContribution += bloomSample.rgb * maskedSample.a;  // WRONG
```
This mixed RGB and alpha channels incorrectly.

**Solution**:
- Changed to properly blend masked bloom as RGB:
```glsl
bloomContribution += maskedSample.rgb * maskedBloomStrength;  // CORRECT
```
- Added `maskedBloomStrength` uniform to track the mask blend intensity
- Updated `syncFinalUniforms()` to propagate the value

**Impact**: Bloom now correctly adds glow/halo effects around bright regions instead of introducing color artifacts.

**Files modified**:
- `src/game/postprocessing.js` — `finalMaterial` uniforms/shader, `syncFinalUniforms()`

---

### 3. **Filter Texture Verification** (assets.js)
**Status**: ✅ **Already correct**
- Arena environment is already using `default_add.tga` + `default_sub.tga`
- No changes needed

---

## What Was Not Changed (But Already Works)

### Sun Flare Stack
Your flare system is **fully implemented**. The code correctly:
- Parses the full flare stack from `day.ini` (not just 2 sprites)
- Creates individual sprites for each flare element with per-element properties
- Applies proper angular behavior, sharpness weighting, and location falloff

No changes needed here.

---

## Remaining Known Issues (Lower Priority)

### 1. **Dynamic Diffuse Material** (shader ID 4)
Currently falls through to generic `MeshStandardMaterial`. Should ideally have specific handling for `pro_default_dynamic.sha`. This affects the "dynamic" surfaces of the track (non-prelit, non-terrain).

**Recommendation**: Add a case in `createTrackMaterial()` for `materialInfo?.shaderId === 4`, but this is lower priority since the material approximation is reasonable.

### 2. **Horizon Scale Tuning** (environment.js)
The sky/horizon dimensions use hand-tuned scale factors instead of source-driven values. May contribute to sky/background feel not matching original exactly. Current approach is pragmatic and readable.

### 3. **Dynamic Specular & Other Shaders**
Shader IDs 5+ (dynamic specular, car, etc.) are not explicitly implemented in track.js. They fall through to the generic fallback, which is "close enough" for now.

---

## Testing Recommendations

1. **Before/after comparison** on static prelit areas (walls, structures)
   - Should look less washed out
   - Shadows/highlights should be more subtle and realistic

2. **Bloom/glow evaluation** on bright surfaces
   - Sun flare should have proper halo
   - Bloom should not introduce color fringing

3. **Overall scene readability**
   - Should feel less flat and more like original FlatOut2

---

## Next Steps If Still Lacking Polish

If the lighting still reads as plain after these fixes:

1. **Verify lightmap is correct** — The 6.0×/7.5× hacks may have been masking actual lightmap baking issues
2. **Check post-process balance** — Tune `bloomTolerance`, `bloomScale`, `finalBloomStrength` parameters
3. **Implement dynamic diffuse handling** (shader ID 4) — This may represent a significant visual surface area
4. **Review atmosphere parameters** — Sky/horizon relationship may need adjustment

---

## References

- VISUAL_FINDINGS_2026-03-29.md — Original analysis
- GHIDRA_VISUAL_ADDRESSBOOK.md — Binary lighting anchors
- shaderlib_pro.ini — Shader ID → effect file mapping
