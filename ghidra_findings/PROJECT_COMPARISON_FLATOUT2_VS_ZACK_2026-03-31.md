# FlatOut 2 Ghidra Project Comparison

Date: 2026-03-31

## Scope

Compare the local Ghidra projects:

- `reference/ghidra_projects/flatout2.rep`
- `reference/ghidra_projects/fo2_zack_result.rep`

Goal: determine whether they target the same executable and whether Zack's project contains materially deeper reverse-engineering progress worth merging.

## Confirmed executable identity

Confirmed from Ghidra headless `Program Information` in both projects:

- Executable MD5: `40078c35de1366488d7c3dc761008cd4`
- Executable SHA256: `612c6c45d6e675b11751fedb3a11d7674fa381cda1921ec852073464c3d5ba20`
- Image base: `0x00400000`
- Executable format: `Portable Executable (PE)`

Project-specific import paths:

- `flatout2.rep`: `/Users/metamodern/Documents/Github/Personal/flatout_oss/reference/FlatOut2.exe`
- `fo2_zack_result.rep`: `/C:/GOG Games/FlatOut 2/FlatOut2.exe`

Conclusion:

- These two projects target the same FlatOut 2 executable binary, not different EXE versions.
- The local project name suffix `FlatOut2.exe-730d02` is a Ghidra naming detail, not evidence of a different binary.

## Ghidra project metadata

- `flatout2.rep` size: about `50M`
- `fo2_zack_result.rep` size: about `125M`
- `flatout2.rep` created with Ghidra `12.0.4`
- `fo2_zack_result.rep` created with Ghidra `10.3`

## Analysis depth comparison

Confirmed from headless metric extraction:

### `flatout2.rep`

- Function count: `6955`
- User-defined function count: `0`
- Symbol count: `73785`
- User-defined symbol count: `0`
- Analysis-generated symbol count: `7585`
- Comment-bearing code units: `1225`

### `fo2_zack_result.rep`

- Function count: `7818`
- User-defined function count: `1641`
- Symbol count: `72666`
- User-defined symbol count: `2076`
- Analysis-generated symbol count: `7727`
- Comment-bearing code units: `3448`

## Sample recovered function names from Zack project

Confirmed examples:

- `ReadINIFile` at `0x004115d0`
- `Player_CreateAIPlayer` at `0x004088c0`
- `UpdateAICarHUD` at `0x004094e0`
- `FixCar` at `0x00427620`
- `ExplodeCar` at `0x00427910`
- `SetUpVehicleTextures` at `0x00430da0`
- `LoadTireMeshes` at `0x004312d0`
- `SetupCarDoorPhysics` at `0x00434d90`
- `Settings_ResetToDefault` at `0x00450aa0`
- `CreateSetupWindow` at `0x00450ba0`
- `WndProc` at `0x00451520`
- `Lua_AddFontFunctions` at `0x004516f0`
- `GUI_DefaultSettingsForReal` at `0x00452070`
- `OpenLanguageDat` at `0x00452f80`
- `GetPhrase` at `0x00453210`

## Interpretation

Confirmed:

- Zack's project is materially more developed as a reverse-engineering base.
- The strongest signal is the presence of `1641` user-defined function names and `2076` user-defined symbols, while the current local project has none.
- Zack's project also has substantially more comment-bearing code units and a higher discovered function count.

Inference:

- Our local project currently preserves some useful comment work, but it is not competitive with Zack's project as the primary naming/symbol baseline.
- The best merge direction is probably to treat `fo2_zack_result.rep` as the richer analysis source and carry over any newer local comments/findings selectively into a fresh merged project or via Ghidra Version Tracking / scripted transfer.

## Merge recommendation

Recommended:

1. Keep Zack's project as the base analysis database for this EXE hash.
2. Diff our local notes/comments against Zack's named areas before discarding anything.
3. Prefer a controlled merge strategy rather than manual copy-paste:
   - Ghidra Version Tracking if both programs are kept side by side.
   - Or script-assisted transfer of comments/labels from one database to the other.
4. Because the binaries match by MD5 and SHA256, symbol and comment transfer is low risk compared with cross-version merging.

## Merge action taken

On 2026-03-31, the local `flatout2.rep` annotations were exported and diffed against `fo2_zack_result.rep`.

Confirmed results:

- `flatout2.rep` contributed `0` user-defined symbols
- `flatout2.rep` contributed `0` user-defined function names
- Raw unique comment count versus Zack project: `32`
- Of those `32`, only `2` were clearly human-authored reverse-engineering findings
- The remaining `30` were auto-analysis or import/resource/library comments and were not merged to avoid polluting Zack's project

Transferred into Zack's live Ghidra project via MCP comments:

- `0x00431b50`
  - `Car runtime setup: loads panels.ini/body.bgm/crash.dat, resolves wheel and placeholder tire anchors, and reads CollisionFull/Bottom/Top body volumes from config.`
- `0x0043aa30`
  - `Reads Data.Physics.TireDynamics and copies tire behavior coefficients such as RollingResistance, PneumaticTrail, friction curves, UnderSteer, SlideControl, and AntiSpin into runtime wheel state.`

Conclusion:

- Zack's project already subsumed effectively all meaningful naming work.
- The only reliable project-level findings from the local `flatout2.rep` that needed migration were the two comments above, and those have now been applied.

## Tooling note

Headless metric extraction script added locally:

- `tools/GhidraCompareMetrics.java`

Annotation export helper added locally:

- `tools/GhidraExportAnnotations.java`

Used only to inspect project metadata and analysis coverage; no gameplay/runtime conclusions were derived here.
