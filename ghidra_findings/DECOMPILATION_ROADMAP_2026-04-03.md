# Decompilation Roadmap 2026-04-03

Purpose: define what “100%” should mean for the FlatOut 2 executable decompilation effort, explain why the current pass started with keyboard/input, and lay out a pragmatic long-term path for moving the project toward full subsystem recovery.

## What 100% means

“100%” should not mean “every function renamed.”

It should mean:

- the executable is partitioned into real subsystems
- each subsystem has its runtime entry points mapped
- key data/config paths are tied to consuming functions
- critical call chains are confirmed
- behavior is recoverable in C/C++ with reasonable confidence
- the remaining unknowns are edge semantics and cleanup work, not major blind spots

## Agreed workflow

This document now uses the following workflow as the active project policy:

1. Pick one subsystem at a time.
2. Prefer foundational subsystems first.
3. Start from that subsystem's top-level/runtime entry points.
4. Decompile the subsystem downward until the path is coherent and as complete as practical.
5. Push that recovered subsystem into `source/decomp2` before moving on.
6. Then pick the next subsystem.

Practical meaning:

- Ghidra is the recovery and confirmation tool.
- `source/decomp2` is the durable reconstructed codebase.
- The stopping point for a subsystem pass is not merely "we have notes."
- The stopping point is:
  - the subsystem is mapped deeply enough to be controllable
  - the recovered structure has been migrated into source form

Subsystem-level "100%" should be interpreted as:

- top-level entry points are known
- major call chains are confirmed
- key globals/types/config paths are understood well enough to reconstruct
- the subsystem has been landed into `source/decomp2` with explicit `TODO`s for remaining gaps

Global project "100%" still does not mean every symbol is perfect. It means every subsystem has gone through this cycle.

## Why the current pass started with keyboard/input

The choice was pragmatic, not thematic.

Input already had stable anchors in the current Ghidra state:

- `Keyboard_*`
- `VirtualKeyboard_*`
- `LoadDInputLibrary`
- `InputHandler_IsControllerConnected`

That made it a good early target because it offered:

- low-risk naming progress
- a clear Windows/DirectInput boundary
- an immediately recoverable call path
- a good test case for the working method:
  - pick a subsystem with real anchors
  - turn those anchors into a confirmed runtime path
  - annotate Ghidra
  - persist findings in repo docs

This does **not** mean keyboard is the most important final subsystem. It means it was the cheapest reliable next move.

## Recommended overall structure of the executable at 100%

### 1. Foundation layer

- process/app bootstrap
- memory/object system
- file/pack/archive I/O
- config/property DB
- scripting/Lua bridge
- input system
- renderer bootstrap and resource managers
- audio bootstrap

### 2. Gameplay runtime layer

- menu/UI flow
- race flow/state machine
- player/controller abstraction
- camera system
- HUD
- replay/ghost systems if present

### 3. Simulation layer

- car runtime/control path
- drivetrain/engine/gearbox
- tire/suspension/contact solve
- collision system
- obstacle/destruction physics
- ragdoll/driver physics
- AI driving/runtime decisions

### 4. World/content layer

- track loading
- object spawning
- weather/environment
- lighting/atmosphere
- particle/effects systems
- shader loading/binding/postprocess order

### 5. Closure layer

- save/profile/options
- networking if present
- debug/dev leftovers
- final type cleanup
- class recovery
- struct layouts
- enums/constants

## Long-term order of attack

The project should be prioritized by dependency and payoff, not by feature glamour.

Recommended order:

1. App bootstrap and resource/config systems
2. Input, scripting bridge, and UI/menu framework
3. Renderer bootstrap, shader/resource loading, atmosphere/postprocess
4. Race state machine and player object lifecycle
5. Vehicle control path and drivetrain
6. Vehicle collision, obstacle/destruction, and ragdoll
7. AI runtime
8. Weather and secondary systems
9. Final cleanup and type recovery

## Why that order makes sense

- Systems like physics, lighting, AI, and menus depend on lower-level loaders, config binders, object factories, and runtime managers.
- Mapping the foundations first makes later subsystem work cheaper because callsites and data layouts stop being anonymous.
- The repo already has meaningful progress in vehicle, camera, and postprocess work, so the current input pass was an adjacent win rather than a reset.

## Suggested interpretation of percentage progress

Use percentages in two scopes:

- global project percentage
- active subsystem percentage

The global percentage should represent how much of the executable has been organized into confirmed subsystem knowledge, not how many raw functions are named.

Suggested project-phase interpretation:

- `0-15%`
  - subsystem map and major entry points established
- `15-35%`
  - runtime call chains and config/data bindings recovered for major systems
- `35-60%`
  - important structs, classes, and behavior-critical inner loops recovered
- `60-80%`
  - broad naming cleanup, secondary systems, and cross-subsystem integration
- `80-100%`
  - hard leftovers, exact semantics, edge cases, and source-quality reconstruction

## Current project read

Current working interpretation:

- the overall project is still in the early part of phase 2
- some strong islands already exist:
  - vehicle runtime/control
  - camera behavior
  - postprocess/bloom/radial blur
- the executable is not yet globally organized into one coherent subsystem map

## Recommended working method

Keep one active subsystem at a time and finish it to a controllable level before switching.

For each subsystem:

1. Recover the top-level entry points and lifetime/ownership model in Ghidra.
2. Recover the major call chains, key globals/strings, and config/property paths.
3. Drive downward into the subsystem until the missing pieces are local rather than structural.
4. Migrate the recovered structure into `source/decomp2`.
5. Leave explicit `TODO` markers where behavior is still unresolved.
6. Persist stable anchors and notes so the Ghidra work and source work stay aligned.

For each subsystem pass:

- annotate findings in Ghidra
- persist stable anchors in `GHIDRA_VISUAL_ADDRESSBOOK.md`
- write a focused note in `ghidra_findings/`
- land or update the corresponding code in `source/decomp2`
- report both global and subsystem percentages

## Deprecated approaches

The following approaches are now deprecated because they conflict with the workflow above:

- `Deprecated`: broad Ghidra-only exploration across many subsystems without source migration
  - Reason: it creates analysis debt and delays the reconstructed codebase.

- `Deprecated`: waiting for a hypothetical whole-project "100% Ghidra decompilation" before writing C/C++
  - Reason: subsystem-level recovery is sufficient to start durable source reconstruction.

- `Deprecated`: isolated function-by-function source dumping without first recovering the surrounding subsystem path
  - Reason: it hardens wrong assumptions about ownership, types, and module boundaries.

## Recommended next subsystem choices

The next useful step is not necessarily “more keyboard.”

Strong candidates:

- app bootstrap/resource loading
- renderer/shader/bootstrap path
- menu/UI framework
- obstacle/destruction physics
- AI runtime
- weather/atmosphere

Recommended next focus:

- `app bootstrap/resource loading`
  - best choice if the goal is to unlock many downstream systems
- `renderer/shader/bootstrap path`
  - best choice if the goal is to connect visual systems, shader load order, and resource ownership

## ROMU note

ROMU is likely useful when it helps identify:

- property/binding semantics
- engine organization
- DirectInput wrappers
- virtual keyboard/UI input classes
- renderer/bootstrap abstractions

It is not useful merely because a symbol name looks similar. It should be used as a cross-check source when the recovered FlatOut 2 call path is already concrete enough to compare against engine-side concepts.
