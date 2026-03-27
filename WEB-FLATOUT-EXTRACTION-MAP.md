# Web FlatOut Extraction Map

## Why the EXE Can Still Matter

Yes, a ~3 MB executable can still contain a lot of the important gameplay logic.

That size does not mean "physics must be elsewhere." In a game from this era:

- Asset-heavy content lives in archives and data folders.
- The executable contains compiled gameplay code, update loops, AI, collision handling, state machines, and glue logic.
- Some tunable values are externalized into config/data files, but the actual simulation and rules often remain in native code.

So the likely split is:

- Data folder: assets plus some tunables and metadata.
- EXE / engine binaries: behavior, runtime rules, AI, damage logic, physics integration, race flow.

For a web remake, the goal is not "extract every bit exactly." The goal is:

1. Identify what can be copied directly from data files.
2. Identify what must be inferred or reimplemented.
3. Identify what must be reverse-engineered from runtime code if fidelity matters.

## Project Framing

This project should be treated as a staged remake using original assets and extracted metadata, not as a literal one-shot port.

The hard parts are not:

- car/body model extraction
- texture conversion
- map geometry conversion
- basic rendering

The hard parts are:

- vehicle physics feel
- AI behavior
- collisions and damage/destruction
- race/game rules
- performance and streaming
- content integration across many legacy formats

The right approach is to dip into each major subsystem early, build a throwaway proof for each, and only then decide how much fidelity is worth chasing.

## Full Target Scope

This section maps the complete version worth understanding, even if the first playable build cuts large parts of it.

### 1. Core Asset Extraction

#### Cars

Need:

- body meshes
- detachable panel meshes
- wheel/tire meshes
- shared car materials/textures
- per-car skins
- per-car config files
- wheel hub / dummy / attachment node data

Likely sources:

- `cars/car_*/body.bgm`
- `cars/car_*/skin*.dds`
- `cars/car_*/body.ini`
- `cars/car_*/lights.ini`
- `cars/car_*/camera.ini`
- `cars/car_*/panels.ini`
- `cars/car_*/tires.ini`
- shared tire `.bgm` and tire `.dds`
- shared `common.dds`, `windows.dds`, `lights.dds`, etc.

Need to preserve:

- node names
- material names
- UVs
- panel hierarchy
- attachment points / joints / dummy objects

#### Drivers / Ragdoll Characters

Need:

- driver body mesh(es)
- driver textures/materials
- seat position / steering wheel relation
- ragdoll / flying body representation
- stunt eject / crash launch rules

Likely sources:

- shared `male.bgm`, `female.bgm`
- matching textures/materials
- possible animation or skeleton metadata if any exists externally
- runtime logic from EXE for eject, ragdoll, and driver state transitions

Unknowns:

- whether skeleton/bones are externalized cleanly
- whether ejection physics is data-driven or mostly coded

#### Maps / Tracks

Need:

- static geometry
- collision geometry
- surface/material tagging
- checkpoints / split points / lap triggers
- prop placement
- hidden prop variants
- BVH / culling data if useful
- vegetation / particles / dynamic objects

Likely sources:

- `.w32`
- `.gen`
- splitpoint-related data
- track config files
- related textures and shader metadata

Important distinction:

- render geometry is only one half
- race logic needs checkpoints, start grids, triggers, and surface behavior

#### UI / Menus / HUD

Need:

- fonts
- UI textures
- menu flow
- race HUD
- damage and speed indicators
- post-race and career UI if ever needed

Likely sources:

- UI assets in data archives
- layout logic likely in EXE or scripts if any exist

This is relatively easy to replace rather than reproduce exactly.

#### Audio

Need:

- engine loops
- tire / skid sounds
- suspension impacts
- collisions
- destruction
- ambience
- announcer / menu / UI sounds

Likely sources:

- `.wav`, `.ogg`, and related sound directories
- metadata for routing and triggering may be partial or coded

Important:

- audio behavior matters almost as much as visuals for "FlatOut feel"
- dynamic mixing rules may need to be rebuilt manually

#### Video / FMV

Need only if pursuing near-full parity:

- intro / menu videos
- transitions / attract sequences

This can be heavily cut for an early web version.

### 2. Vehicle System

This is one of the main hard subsystems.

#### Vehicle Representation

Need:

- chassis transform
- mass / inertia model
- wheel locations
- center of mass
- suspension anchors
- steering geometry assumptions
- drivetrain layout assumptions

Likely sources:

- wheel dummy positions in body mesh
- `body.ini`
- `tires.ini`
- maybe additional inferred values from runtime

#### Vehicle Physics

Need:

- throttle / brake / reverse
- handbrake
- steering input and speed-sensitive steering
- suspension compression / rebound
- tire longitudinal and lateral grip
- drag / rolling resistance
- weight transfer
- collision response
- airborne behavior
- landing behavior
- wall / prop interaction

Sources split:

- tunables: partial data files like `tires.ini`
- actual behavior: likely EXE / runtime reverse engineering

#### Drivetrain

Need:

- engine torque approximation
- RPM behavior
- gear ratios
- automatic shifting rules
- clutch assumptions if any
- top speed balancing

Likely source:

- mostly runtime code and inferred feel
- maybe some upgrade/career data if game stores class differences externally

#### Controls

Need:

- keyboard
- gamepad
- steering smoothing
- analog deadzones
- assist behavior
- camera-relative or vehicle-relative controls

These do not need extraction; they need good design and tuning.

### 3. AI Drivers

This is another major hard subsystem.

Need:

- path following
- overtaking
- obstacle avoidance
- recovery when spun out
- aggression
- rubber-banding or difficulty scaling
- stunt / chaos behavior if relevant
- contact tolerance

Likely sources:

- track waypoints / split points / hidden route metadata if present
- runtime code for behavior and decision-making

Important:

- exact original AI is likely coded, not stored plainly in data
- a good fake AI is more practical than exact extraction

### 4. Damage / Destruction

This is a signature feature and should be split carefully.

#### Visual Damage

Need:

- panel detach rules
- panel hinge axes
- release thresholds
- damaged materials / damaged windows / lights
- per-part hierarchy

Likely sources:

- `panels.ini`
- `lights.ini`
- mesh panel structure
- damaged textures like `windows_damaged.dds`, `lights_damaged.dds`

#### Mechanical / Gameplay Damage

Need:

- damage accumulation
- health/state per subsystem
- effect on handling and top speed
- wheel damage / steering bias
- engine damage if present

Likely sources:

- partly in EXE / runtime logic
- may not be cleanly available in plain data

#### Driver Ejection / Ragdoll

Need:

- trigger conditions
- ejection pose and timing
- ragdoll or fake ballistic behavior
- landing / collision interactions

Likely source:

- runtime code and character assets

For a web version, a staged fake may be enough initially.

### 5. Race / Game Rules

Need:

- start countdown
- lap counting
- checkpoint validation
- finish conditions
- ranking and timing
- reset / respawn
- penalties if any
- menu/race transitions

Likely sources:

- track metadata
- runtime code

This is not difficult conceptually, but exact parity may require reverse engineering.

### 6. Rendering / Performance / Streaming

Need:

- model/texture conversion pipeline
- material simplification
- texture compression
- LOD strategy
- culling
- loading screens / progressive streaming
- per-track chunking if needed
- particle systems
- shadow strategy

This is a web-engineering problem more than an extraction problem.

### 7. Tooling / Pipeline

Need:

- batch asset conversion
- validation tools
- metadata extraction tools
- debug viewers for cars, tracks, panels, materials, wheels, lights
- JSON or glTF-adjacent normalized runtime format

Recommended pipeline:

1. Original asset extraction.
2. Conversion to stable intermediate assets.
3. Normalization into your own runtime schema.
4. Validation viewer.
5. Runtime integration.

## Extraction Categories

To stay sane, classify every needed thing as one of these:

### A. Directly Extractable

Can usually be copied/converted from assets with little interpretation.

Examples:

- car meshes
- track meshes
- textures
- sounds
- visible attachment points / node names
- simple config values

### B. Extractable But Needs Interpretation

Exists in data, but not yet in a shape your web runtime can use directly.

Examples:

- panel joints
- wheel/tire metadata
- collision bounds
- light placements
- checkpoints and route data
- shader/material meaning

### C. Probably Runtime-Only

Likely implemented in code rather than plain data.

Examples:

- detailed physics integration
- exact AI behavior
- damage propagation rules
- ragdoll behavior
- race-state transitions
- gameplay balancing logic

### D. Better Rebuilt Than Extracted

Could be reverse-engineered, but should likely be reauthored.

Examples:

- menus
- HUD
- input system
- save/progression shell
- network layer if ever added

## Full Version Extraction Checklist

### Cars

- Every `body.bgm`
- Every car skin `.dds`
- Shared car textures
- `body.ini`
- `camera.ini`
- `lights.ini`
- `panels.ini`
- `tires.ini`
- tire mesh and texture selections

### Drivers

- male/female meshes
- driver textures
- any skeleton or dummy metadata
- seat placement relation

### Tracks

- track geometry
- collision data
- split/checkpoint data
- start grid data
- prop placements
- hidden prop variants
- culling / BVH data if useful

### Audio

- engine loops
- gear shift
- impact sounds
- suspension sounds
- skid/brake sounds
- UI sounds
- music/ambience if needed

### Damage

- panel detach metadata
- damage textures
- damaged glass/light assets
- ejection-related assets

### Systems

- physics feel model
- AI behavior model
- race rule model
- camera model
- respawn/reset logic

## Alpha Version

Alpha should answer one question only:

"Can a browser build capture the core feel of a FlatOut-style race at all?"

### Alpha Goal

One drivable car, one track, a few AI cars, basic collisions, convincing sound, and enough speed/handling chaos to feel promising.

### Alpha Must Have

#### Assets

- 1 car
- 1 matching tire set
- 1 driver model, even static if needed
- 1 track
- essential sounds only

#### Rendering

- car rendering with correct materials
- wheel rendering and placement
- track rendering
- shadows good enough to read motion
- particles only if cheap

#### Physics

- arcade vehicle controller
- suspension approximation
- drift / slide behavior
- collisions with walls and props
- airborne behavior

This does not need exact original physics.

#### AI

- 3 to 7 opponents
- waypoint/path following
- catch-up behavior
- basic overtaking / obstacle avoidance

#### Damage

- visual panel loosen/detach for a few major parts
- glass state change
- simple health/damage accumulation

#### Audio

- engine pitch loop
- skid sound
- collision thumps
- suspension / landing sounds

#### Race Rules

- start countdown
- lap checkpoints
- race finish
- position/rank
- reset if flipped or stuck

### Alpha Can Fake

- exact drivetrain fidelity
- exact AI logic
- full ragdoll
- full car roster
- full destruction depth
- exact menu system
- career mode
- full soundtrack/video shell

### Alpha Extraction Priorities

1. Car + tires + correct wheel placement.
2. One track + collision + checkpoints.
3. Engine/skid/crash sounds.
4. `panels.ini`-driven simple detachment.
5. Basic AI route following.
6. Race loop and HUD.

## Beta Version

Beta should answer the next question:

"Can this scale into a real game-sized browser experience without collapsing?"

### Beta Goal

A small but real playable package with enough content and systems to expose the true technical risks.

### Beta Must Have

#### Content

- 3 to 6 cars
- 2 to 3 tracks
- working tire variations
- multiple skins

#### Physics

- improved vehicle tuning per car
- stable 8-car races
- better airborne/landing behavior
- car-to-car collisions that feel acceptable

#### AI

- 7 AI opponents
- difficulty tiers
- recovery behavior
- more aggressive passing/contact behavior

#### Damage

- panel detach for main detachable parts
- visible damage states
- gameplay consequence from damage
- first rough pass on driver ejection or a substitute stunt/crash payoff

#### Audio

- per-car sound variation or at least parameterized engine behavior
- richer crash and suspension audio
- ambient track audio

#### UX

- minimal menu flow
- pre-race / post-race flow
- car selection
- simple settings and controls screen

#### Performance

- desktop-browser target performance at race scale
- asset streaming strategy
- texture compression strategy
- stable memory usage

### Beta Can Still Defer

- full campaign/career
- all tracks and all cars
- exact original AI parity
- exact destruction parity
- perfect ragdoll fidelity
- replay/photo mode
- full polish of menus and progression

## Reverse-Engineering Priorities

If fidelity matters, these are the highest-value runtime questions to answer from EXE/decomp/hooking work:

1. Vehicle update loop layout.
2. Tire force and suspension formulas.
3. Drivetrain and shift logic.
4. Damage thresholds and state transitions.
5. AI steering/throttle decision model.
6. Driver ejection trigger logic.
7. Track checkpoint / race-state flow.

Do not reverse-engineer broadly. Reverse-engineer only what blocks the next milestone.

## Recommended Working Strategy

### Phase 1: Asset Confidence

- batch-convert cars, tires, and one track
- normalize assets into your own runtime format
- validate node names, wheels, panels, and materials

### Phase 2: Scrap Demo

- one track
- one player car
- a few AI cars
- simple race loop
- good-enough audio
- simplified damage

### Phase 3: Truth Test

- scale to 8 cars
- add more collisions and effects
- measure performance and memory
- decide whether AI/physics fidelity is worth deeper reverse engineering

### Phase 4: Beta

- small content set
- stable race package
- enough systems integrated to expose the real long-tail cost

## Bottom Line

For this project, "extracting assets and rendering them" is the easy lane.

The real extraction/rebuild burden is:

- vehicle dynamics
- AI
- damage/destruction
- race rules
- audio behavior
- scalable performance

That is exactly why the right move is not to wait for a full perfect extraction story.

The right move is:

1. get a scrap demo across all hard subsystems
2. find the worst one
3. decide whether to fake, simplify, or reverse-engineer it
4. only then scale up
