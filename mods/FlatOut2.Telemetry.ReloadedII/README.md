# FlatOut 2 Runtime Telemetry Mod, Phase 1

This folder contains the first-pass source files and setup notes for a minimal Reloaded-II C# mod that:

- proves the mod loads into `FlatOut2.exe`
- initializes `FlatOut2.SDK`
- samples a few safe SDK-backed runtime fields
- writes stable, readable CSV output

This is intentionally small and testable. It does not try to map car internals yet.

## What This Phase Logs

Phase 1 logs:

- wall clock timestamp
- sample index
- race time in seconds
- game state
- `is_racing`
- `is_paused`
- current level id
- current level name
- current car id
- current car name
- player steering
- player throttle
- player brake
- vehicle position
- vehicle forward vector
- vehicle linear velocity
- vehicle angular velocity
- speed magnitude
- planar speed magnitude
- yaw radians / yaw degrees
- yaw rate
- vehicle quaternion

These come from `FlatOut2.SDK.API.Info`, `FlatOut2.SDK.Structs.Player`, and the recovered `sVehicle` runtime layout in the decomp.

Important current limitation:

- live camera pointer wiring is still not mapped in this phase.
- wheel/slip internals are not mapped in this phase yet.

## Preconditions

You already have:

- Reloaded-II installed
- `reloaded.sharedlib.hooks` installed
- `FlatOut2.SDK` available in `reference/FlatOut2.SDK-main`

You will also need a .NET SDK on the build machine.

At the time of writing, this workspace does not have `dotnet` installed on `PATH`, so build verification must happen on the machine where you develop/run the mod.

## Recommended Project Creation

Use the standard Reloaded C# project template on your build machine:

```powershell
dotnet new reloaded -n FlatOut2.Telemetry.ReloadedII --ModName "FlatOut 2 Telemetry" --ModAuthor "<your name>"
```

If you prefer the GUI flow, creating a new code mod from Reloaded-II is also fine.

After generating the project:

1. Keep the template-generated `Template/*` files.
2. Replace the generated `Mod.cs` with the `Mod.cs` in this folder.
3. Add `TelemetrySnapshot.cs` and `CsvTelemetryWriter.cs`.
4. Update the project file with the references shown below.
5. Update `ModConfig.json` with the dependency and supported app id shown below.

## Project File Changes

Your generated `.csproj` should be updated so the mod can:

- use unsafe code
- reference `FlatOut2.SDK`
- reference Reloaded assemblies already installed locally

Use the following as the important part of your project file.
Adjust the surrounding template content as needed.

```xml
<PropertyGroup>
  <TargetFramework>net7.0-windows</TargetFramework>
  <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
</PropertyGroup>

<ItemGroup>
  <ProjectReference Include="D:\flatout_oss\reference\FlatOut2.SDK-main\FlatOut2.SDK\FlatOut2.SDK.csproj" />
</ItemGroup>

<ItemGroup>
  <Reference Include="Reloaded.Mod.Interfaces">
    <HintPath>C:\Users\just me\Desktop\Reloaded-II\Reloaded.Mod.Interfaces.dll</HintPath>
    <Private>false</Private>
  </Reference>
  <Reference Include="Reloaded.Hooks.Definitions">
    <HintPath>C:\Users\just me\Desktop\Reloaded-II\Mods\reloaded.sharedlib.hooks\x86\Reloaded.Hooks.Definitions.dll</HintPath>
    <Private>false</Private>
  </Reference>
  <Reference Include="Reloaded.Hooks.ReloadedII.Interfaces">
    <HintPath>C:\Users\just me\Desktop\Reloaded-II\Mods\reloaded.sharedlib.hooks\x86\Reloaded.Hooks.ReloadedII.Interfaces.dll</HintPath>
    <Private>false</Private>
  </Reference>
</ItemGroup>
```

Why `net7.0-windows`:

- `FlatOut2.SDK` currently targets `net7.0`
- this keeps the first pass aligned with the SDK instead of immediately juggling cross-targeting questions

## ModConfig.json Changes

Make sure your mod config includes:

```json
{
  "SupportedAppId": [
    "flatout2"
  ],
  "ModDependencies": [
    "reloaded.sharedlib.hooks"
  ]
}
```

Notes:

- `SupportedAppId` should match the lower-case executable name used by Reloaded for the FlatOut 2 app.
- If your Reloaded app entry ended up with a different app id, use that exact value instead.

## Where Logs Will Appear

The mod writes to the mod config directory assigned by Reloaded.

Expected files:

- `phase1_status.log`
- `phase1_basic.csv`

In a standard Reloaded setup, you can usually locate the mod folder by right-clicking the mod in Reloaded and choosing `Open Folder`.

## Phase 1 Validation

Use this exact sequence.

### 1. Verify Mod Load

Start FlatOut 2 through Reloaded with the mod enabled.

Success signs:

- the game launches normally
- Reloaded shows the mod as loaded
- `phase1_status.log` is created

Open `phase1_status.log` and confirm it contains lines similar to:

- `Mod constructor entered.`
- `Reloaded hooks acquired successfully.`
- `FlatOut2.SDK initialized.`
- `Sampling timer started.`

If that file never appears, the mod did not start.

### 2. Verify Idle Menu Values

Stay in menus for a few seconds, then inspect `phase1_basic.csv`.

Expected behavior:

- rows are being appended
- `game_state` should be menu-like or non-race
- `is_racing` should be `false`
- inputs may remain zero

### 3. Verify In-Race Values

Enter a race and drive for 10-15 seconds.

Expected behavior:

- `is_racing` becomes `true`
- `is_paused` remains `false` while actively racing
- `level_id` and `level_name` become stable non-empty values
- `car_id` becomes stable
- `car_name` becomes non-empty

### 4. Input Sanity Checks

While watching the CSV after a short test run:

- turn left/right and confirm `steer` changes sign and magnitude sensibly
- hold throttle and confirm `throttle` rises
- press brake and confirm `brake` rises

We are not demanding exact ranges yet. We only want values that react consistently and plausibly.

### 5. Pause Sanity Check

Pause during a race for a couple of seconds, then unpause.

Expected behavior:

- `is_paused` flips to `true` during pause
- `is_paused` returns to `false` after unpausing

## Known Good First Expansion After Phase 1

Once Phase 1 is confirmed working, the next clean step is:

1. keep the CSV writer
2. switch from timer sampling to a better-timed update hook if needed
3. add current timer/tick fields
4. add position/orientation from confirmed car pointers and offsets
5. only then move to camera and wheel data

## Current SDK Notes

Confirmed useful structures so far:

- `Info.Race.GetCurrentLevelId()`
- `Info.Race.GetCurrentLevelName()`
- `Info.Race.GetCurrentCarId()`
- `Info.Race.GetCarName()`
- `Info.Race.IsPaused()`
- `Info.Race.IsRacing()`
- `Info.Race.GetCurrentTimer()`
- `Info.State.GetCurrentGameState()`
- `Player.SteerAngle`
- `Player.GasPedal`
- `Player.BrakePedal`
- `Car.Matrix` at `vehicle+0x1b0`
- `Car.Position` at `vehicle+0x1e0`
- `Car.Quaternion` at `vehicle+0x270`
- `Car.Velocity` at `vehicle+0x280`
- `Car.RotationVelocity` at `vehicle+0x290`

Confirmed limitation:

- live camera pointer wiring and wheel/slip internals are still not mapped in the SDK yet

That is why this phase reaches vehicle motion and orientation helpers plus race/session info, but not live camera or wheel/slip state yet.
