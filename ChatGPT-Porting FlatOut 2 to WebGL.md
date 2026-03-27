# Porting FlatOut 2 to WebGL

**User:** 
**Created:** 3/27/2026 13:54:56  
**Updated:** 3/27/2026 16:20:41  
**Exported:** 3/27/2026 16:39:19  


## Prompt:
I would like to try to port flatout2 game into webgl(threejs) on web. I wanna start with very basic things. Obviously, moving menus is very simple and shouldn't be if any trouble, I want to take the core, the race part of the game. I have the bfs files already unpacked so I guess I should have resources available. But the engine logic is probably not there. Idk how I'd parse it out. How do we approach this step by step?

## Response:
I’m going to ground this in what’s actually known about FlatOut 2 assets and modding formats, then turn that into a practical porting plan. The main thing to avoid is trying to “extract engine logic” too early, because that’s usually where these projects die.

Thought for 16s

Treat this as a **reimplementation project**, not an “extract the game and make it run in WebGL” project.

For FlatOut 2, the assets are reachable: `.bfs` is Bugbear’s archive format, and existing tools can extract FlatOut 2 BFS archives. There is also community reverse-engineering work on FlatOut 2 file formats, including track-related formats, plus modding SDK work that exposes some runtime game data for the original engine. That strongly suggests a split: **reuse assets where legally allowed, but rebuild gameplay systems yourself** rather than trying to “parse out” the original engine logic from resources. [mrwonko.de+3docs.rs+3GitHub+3](https://docs.rs/crate/bfstool/latest)

The biggest mindset shift is this:

**Do not start with “the race mode.” Start with a vertical slice of one track segment, one car, one camera, one lap trigger, and fake/simple physics.**

That is the path that keeps the project alive.

What is likely inside your unpacked data
----------------------------------------

From the available tooling and reverse-engineering work, FlatOut 2 has known or partially known **archive and asset/container formats**, and track/custom-content work has historically depended on reverse engineering proprietary formats, especially collision-related data. That means you may be able to extract models, textures, some metadata, maybe track geometry, but not cleanly recover a full portable gameplay runtime from the files alone. [docs.rs+2GitHub+2](https://docs.rs/crate/bfstool/latest)

So think in layers:

1.  **Assets**  
    Meshes, textures, materials, sounds, UI art.
2.  **Static data**  
    Car params, camera offsets, maybe track metadata, spawn points, etc.
3.  **Runtime logic**  
    Vehicle physics, AI, collisions, damage, lap rules, race state, HUD update logic.  
    This is the part you usually **won’t get “for free”** from unpacked assets.

The step-by-step approach
-------------------------

Phase 1 — Prove you can load one real asset
-------------------------------------------

Goal: get one FlatOut 2 asset into a browser scene.

Do this before thinking about racing.

Tasks:

*   Identify one simple model and one texture from your unpacked files.
*   Write a converter from the FlatOut-specific model/texture format into an intermediate format you control.
*   In the browser, load that intermediate format and render it in Three.js.
*   Ignore animation, collisions, wheels, suspension, UI, everything else.

Your first milestone is not “car drives.”  
Your first milestone is:

**“I can render one authentic FlatOut 2 mesh with its texture in Three.js.”**

Why this matters:

*   It validates your parser assumptions.
*   It shows whether coordinates, scale, normals, UVs, and texture decoding are understood.
*   It prevents months of engine work before you even know if the asset path is viable.

Phase 2 — Build an offline conversion pipeline
----------------------------------------------

Do not parse original game files directly in the browser at runtime unless you absolutely must.

Build a desktop/offline converter in Node.js, Python, Rust, or C# that does:

*   read FlatOut file(s)
*   decode mesh/material/texture
*   export to something browser-friendly:
    *   `glTF` for models
    *   PNG/WebP for textures
    *   JSON for metadata

This is a huge simplification. Three.js already works very well with glTF, so every minute spent pushing your data toward glTF saves you a lot of engine pain later.

A good output layout:

```
/build-assets
  /cars/car_01/
    car.gltf
    body_basecolor.png
    wheels.gltf
    metadata.json

  /tracks/track_01/
    track.gltf
    collision.json
    checkpoints.json
    materials.json
```

That pipeline becomes your foundation.

Phase 3 — Ignore original physics at first
------------------------------------------

Do **not** try to recreate FlatOut 2 handling from day one.

Start with one of these:

*   fake arcade movement
*   Rapier-based simplified rigid body
*   cannon-es / ammo.js if you already know them
*   or even “kinematic car on spline/ground” for the first build

First target:

*   car moves forward/back
*   steer left/right
*   camera follows
*   car stays on ground
*   lap trigger works

Only after that:

*   drifting feel
*   suspension
*   wheel traction
*   weight transfer
*   collision impulses
*   damage

FlatOut 2’s feel comes from many small systems interacting. If you chase “the real feel” too early, you’ll get stuck.

Phase 4 — Track loading before full racing
------------------------------------------

Once you can render a car, do the same for one track.

You need to separate three track representations:

1.  **Visual mesh**  
    What the player sees.
2.  **Collision mesh / simplified collider**  
    What the car collides with.
3.  **Gameplay markers**  
    Start grid, checkpoints, lap line, respawn points, maybe AI spline later.

Community reverse-engineering around custom tracks specifically calls out the pain around proprietary collision formats, which is a warning sign: even if visual geometry is understood, collision/gameplay data may need custom reverse engineering or manual reconstruction. [mrwonko.de+1](https://mrwonko.de/blog/2022/return-to-flatout-2-modding.html)

So your first track milestone can be:

*   import visible track mesh
*   build your **own** simplified collision mesh if necessary
*   manually place checkpoint boxes in JSON
*   manually place start line in JSON

That is totally acceptable for an MVP.

Phase 5 — Define your own runtime schema
----------------------------------------

Even if you decode original files, convert them into **your own engine schema**.

Example:

```
type CarSpec = {
  mass: number
  wheelBase: number
  steerAngleMax: number
  engineForce: number
  brakeForce: number
  gripFront: number
  gripRear: number
  suspensionStiffness: number
  suspensionDamping: number
  cameraFollowOffset: [number, number, number]
}

type TrackSpec = {
  startTransform: {
    position: [number, number, number]
    rotationY: number
  }
  checkpoints: Array<{
    id: string
    position: [number, number, number]
    size: [number, number, number]
  }>
  lapLine: {
    position: [number, number, number]
    size: [number, number, number]
  }
}
```

Why:

*   original formats may be messy/incomplete
*   browser runtime should be clean and debuggable
*   you can hand-fix data while reverse engineering continues

Phase 6 — Rebuild systems in the easiest order
----------------------------------------------

Recommended order:

### 1\. Renderer

*   load car mesh
*   load track mesh
*   skybox / simple lighting
*   chase camera

### 2\. Input

*   keyboard only
*   throttle / brake / steer / handbrake

### 3\. Vehicle motion

*   simplified physics first
*   tune until it feels roughly arcade

### 4\. Collision

*   broadphase with static world
*   respawn if flipped or stuck

### 5\. Race rules

*   countdown
*   lap line
*   checkpoint order
*   finish state
*   timer
*   ranking only if multiple cars exist

### 6\. HUD

*   speed
*   lap
*   time
*   position

### 7\. AI

*   ghost / spline follower first
*   only then full opponents

### 8\. Damage / deformation

*   dead last

Damage and deformation are one of the most expensive, distracting parts. Leave them for much later.

About “extracting engine logic”
-------------------------------

You probably have three realistic sources of “logic”:

### A. Config/INI-like data

If the unpacked resources contain text configs, parameter tables, camera settings, etc., those are gold. Reuse them.

### B. Runtime modding / hook-based knowledge

Existing SDK/modding work for FlatOut 2 shows that people can inspect and hook game runtime structures in the original executable. That can help you understand variable names, object structures, race state, car IDs, level names, and maybe more. [GitHub](https://github.com/Sewer56/FlatOut2.SDK)

### C. Reverse engineering the executable

Possible, but this is a separate long-term track. Use it only to answer specific questions like:

*   how is checkpoint progression stored?
*   what is the wheelbase/suspension format?
*   how is a specific file decoded?

Do not make “full decompilation” a prerequisite for your web prototype. There is a public hobby decompilation effort, but it is clearly ongoing and incomplete. [GitHub](https://github.com/ZackWilde27/FlatOut-2-decomp?utm_source=chatgpt.com)

So the rule is:

**Reverse engineer only what blocks the next milestone.**

Not more.

A practical first 4-week roadmap
--------------------------------

Week 1
------

*   catalog unpacked files by extension
*   identify candidate files for:
    *   one car mesh
    *   one texture
    *   one track mesh
    *   any config/INI text files
*   build a tiny parser or extractor for one model format
*   render one static asset in Three.js

Deliverable:

*   browser page showing a FlatOut 2 car or track piece

Week 2
------

*   convert model pipeline to glTF
*   decode/import textures
*   import one full track visually
*   establish world scale and axis conventions
*   make chase camera orbit around a static car

Deliverable:

*   track + car in same scene, visually correct scale

Week 3
------

*   implement very simple arcade vehicle controller
*   add ground collision or wheel raycasts
*   add start position and respawn
*   add keyboard handling

Deliverable:

*   drivable car on a simple piece of track

Week 4
------

*   add checkpoint volumes and lap line
*   add timer and lap counter
*   add basic HUD
*   tune camera and steering feel

Deliverable:

*   one playable lap on one track, single car, no AI

That would already be a huge win.

Recommended project structure
-----------------------------

```
/flatout-web
  /tools
    /extractors
    /converters
    /inspectors
  /game
    /src
      /assets
      /rendering
      /physics
      /vehicles
      /race
      /ui
      /data
  /research
    file-formats.md
    coordinate-system.md
    car-format-notes.md
    track-format-notes.md
```

And keep a research log like:

```
# car_format_notes.md

- File: car_01.xxx
- Header bytes:
- Suspected vertex stride:
- UV offset:
- Index format:
- Coordinate handedness:
- Texture references:
- Confirmed by rendering: yes/no
```

That sounds boring, but it will save you.

What I would not do at the start
--------------------------------

Do not start with:

*   multiplayer
*   full menu recreation
*   multiple cars
*   destruction/deformation
*   AI
*   exact original physics
*   sound system parity
*   browser parsing of original archives at runtime
*   “full game port”

Also, be careful legally: a browser remake that uses original copyrighted assets can be fine for personal experimentation, but distribution is a separate question. Keep that in mind from the start.

Best technical stack for the first prototype
--------------------------------------------

For the first playable slice, I’d use:

*   **Three.js** for rendering
*   **TypeScript**
*   **Vite**
*   **Rapier** or a very lightweight custom arcade controller
*   **glTF** as the converted asset target
*   **JSON** for your hand-authored gameplay metadata

That stack gives you the least friction.

The single most important principle
-----------------------------------

You are not porting FlatOut 2.

You are building:

**“A small web racing game that progressively learns how to consume FlatOut 2 data.”**

That framing keeps the project feasible.

The exact first task I’d give you
---------------------------------

Open your unpacked files and make a table with:

*   extension
*   guessed purpose
*   example file path
*   whether it looks binary or text
*   whether it references textures/material names
*   priority

For example:

```
.bfs  archive         data/europe.bfs           binary  already unpacked   low
.xxx  car mesh?       cars/car_01/model.xxx     binary  likely important   high
.tex  texture         cars/car_01/skin1.tex     binary  likely important   high
.ini  config          cars/car_01/camera.ini    text    easy win           very high
```

Then pick the **easiest text or semi-text file first**, not the hardest binary one.

If you send me a list of the top file extensions and a couple example filenames from your unpacked FlatOut 2 folders, I’ll help you turn that into a concrete parser/conversion order.

## Prompt:
okkkay. I've ran a simple codesandbox with threejs for now.
Now, would it help if I shared the complete text description of the entire data folder so you could pick stuff up yourself? there's sooo much there.
if yes, give me a simple command to get out everything down to lowest internal folder outputed into a .txt file and I'll send you the result.

## Response:
Yes — that would help a lot 👍  
What I need is basically a **recursive file tree + file sizes**. That alone lets me infer formats, priorities, and likely pipelines.

Keep it simple.

If you're on macOS / Linux
--------------------------

Run this in the `data` folder:

```
find . -type f -exec ls -lh {} \; > data_dump.txt
```

This gives:

*   full relative paths
*   file sizes (super useful to spot meshes vs configs vs textures)

If you also want folder structure clarity (optional but nice):

```
tree -h > data_tree.txt
```

(if `tree` isn’t installed: `brew install tree` or `apt install tree`)

* * *

If you're on Windows (PowerShell)
---------------------------------

```
Get-ChildItem -Recurse | Select-Object FullName, Length | Out-File data_dump.txt
```

* * *

What I’ll do with it
--------------------

From that dump I’ll:

*   group by extensions
*   identify:
    *   likely mesh formats
    *   texture formats
    *   config/text files (easy wins)
*   suggest:
    *   **what to parse first**
    *   **what to ignore initially**
    *   **conversion pipeline order**
*   possibly guess known FlatOut formats based on patterns

* * *

Important note
--------------

Don’t paste raw binary or file contents — just the listing is perfect.

* * *

Once you send it, I’ll give you a **very concrete next step like:**

> “Parse these 2 file types first, ignore the rest, here’s how to get your first car rendering”

That’s where things will start moving fast.

## Prompt:
data\_tree.txt

Document

okay, this is huge. have a look:) everything is here. one prominent thing to me is the .db file. what do you think is there?

## Response:
Thought for 39s

Yep — this is already useful.

The `.db` file is here:

*   `database/flatout2.db` — size about **344 KB**
    data\_tree

My first reaction: this is **probably not the core physics / engine logic**. Much more likely it stores some kind of **gameplay metadata / lookup data / tuning tables / career-ish structured data / UI-facing structured content**, because:

*   it sits in a dedicated `database/` folder, not in `cars/`, `tracks/`, or `scripts`
*   it’s only **344 KB**, which is tiny for anything like full engine behavior
*   the asset tree already shows lots of per-car config in plain text-ish files like `camera.ini`, `lights.ini`, `panels.ini`, `tires.ini`, plus model/texture files like `.bgm` and `.dds` in `cars/`
    data\_tree

So if I had to bet, I’d say `flatout2.db` is more likely to contain things like:

*   event / race definitions
*   car stats or unlock-related structured data
*   profiles of cups/classes/opponents
*   references tying assets together
*   menu / progression / economy-ish data

and **not**:

*   actual driving physics engine code
*   collision solver logic
*   rendering engine logic
*   AI runtime code

Those would normally live in the executable / engine binaries, not in a small data DB.

What jumps out to me from your tree:

*   `cars/` looks very promising for first rendering work:
    *   `body.bgm` = likely car mesh/model
    *   `skin*.dds` = textures
    *   `camera.ini` = easy useful metadata
    *   `crash.dat` = likely deformation / damage data, later-stage stuff
*   `tracks/` will be your next big target after one car
*   `scripts/` is extremely interesting too — that folder may contain the easiest “logic-like” data to inspect before touching the DB
    data\_tree

So priority-wise, I would **not** start with the `.db`.

I would start with:

1.  one `cars/car_X/body.bgm`
2.  one `skin1.dds`
3.  one easy `.ini`
4.  only then inspect `flatout2.db`

Because even if the DB is readable, it probably won’t get you your first visible WebGL milestone.

Best next move:  
send me just these folder listings from your dump:

*   `database/`
*   `scripts/`
*   first 30–60 lines of one `cars/car_1/*.ini`
*   first 30–60 lines around the start of `tracks/`

Then I can tell you much more concretely what to parse first.

## Prompt:
no let's do the one single car for now. the first one. you already see what files it contains. bgm, couple if inis, dds, .dat. I presume .bgm is the mesh right?
btw, sidequest for you: you have the file, find all the unique file extensions and let me know if we can work with those freely without trying to convert them into anything else. like, bgm is not something we can work with for example. .ini and .dat and .dds are workable. and so on.
So, how do we read the bgm file?

## Response:
Thought for 54s

Yes — `body.bgm` is **very likely the car mesh/model container**.

Why I’m saying that:

*   every `cars/car_*` folder has a `body.bgm`
*   it sits next to `skin*.dds`, `body.ini`, `camera.ini`, `lights.ini`, `panels.ini`, `crash.dat`
*   its size is in the few hundred KB range, which fits a 3D model much better than a config file
    data\_tree

And externally, there are tools specifically for FlatOut `.bgm` files: one open-source tool says it handles `.w32` and `.bgm` and can export cars and tracks to `.fbx`, and another importer announcement explicitly says FlatOut 2 `.bgm` support was added to 3D Object Converter / i3DConverter. [GitHub+1](https://github.com/gaycoderprincess/FlatOutW32BGMTool)

So the practical answer is:

Don’t read `.bgm` from scratch first
------------------------------------

Your fastest path is:

1.  **use an existing `.bgm` tool**
2.  export `body.bgm` to something sane like **FBX**
3.  convert/import that into your Three.js prototype
4.  only after that decide whether you want to reverse-engineer the binary format yourself

That existing tool is especially attractive because it claims:

*   parsing/recreating the format
*   exporting cars/tracks to `.fbx`
*   exporting a human-readable text dump too [GitHub](https://github.com/gaycoderprincess/FlatOutW32BGMTool)

That is exactly what you need right now.

* * *

Unique extensions I found in your uploaded tree
-----------------------------------------------

I parsed your `data_tree.txt` and found these unique file extensions in the `data` folder listing:  
`.4b`, `.abc`, `.act`, `.ai`, `.avi`, `.bak`, `.bed`, `.bgm`, `.bin`, `.bsa`, `.cfg`, `.dat`, `.db`, `.dds`, `.gen`, `.ini`, `.ogg`, `.rep`, `.sha`, `.tga`, `.txt`, `.w32`, `.wav`, plus some files with **no extension**. This comes from your uploaded tree, which includes `cars/car_1/body.bgm`, the texture files, and many other asset types.

data\_tree

Which ones are “freely workable” right away
-------------------------------------------

### Good / directly workable in a web pipeline

These are the ones I’d call easy or normal:

*   `.ini` — yes, plain text config
*   `.txt` — yes
*   `.cfg` — probably yes
*   `.dds` — yes, with Three.js DDSLoader or by converting to PNG/WebP
*   `.tga` — yes, but usually convert first
*   `.wav` — yes
*   `.ogg` — yes
*   `.avi` — technically yes, but probably not part of the first car milestone

### Not directly workable, or likely custom/proprietary

These I would treat as custom or game-specific until proven otherwise:

*   `.bgm`
*   `.w32`
*   `.gen`
*   `.bed`
*   `.4b`
*   `.sha`
*   `.ai`
*   `.abc`
*   `.bsa`
*   `.rep`
*   `.act`
*   `.bin`
*   `.dat`
*   `.db`
*   files with no extension

So no, `.bgm` is **not** something Three.js can just open.

And I would **not** assume `.dat` is freely workable either. `crash.dat` is probably structured binary game data, not something browser-native.

* * *

What I would do next, exactly
-----------------------------

### Path A — fastest and smartest

Use the existing BGM/W32 tool to dump `car_1/body.bgm` to:

*   **FBX** for viewing/import
*   **text dump** for understanding structure

If that works, you immediately get:

*   mesh confirmed
*   submeshes/material names
*   maybe object hierarchy
*   maybe easier matching to `skin1.dds`

This is the highest-leverage move. [GitHub](https://github.com/gaycoderprincess/FlatOutW32BGMTool)

### Path B — if you want to inspect manually

Open `body.bgm` in a hex viewer and check:

*   magic bytes at offset `0x00`
*   whether there are ASCII strings inside
*   whether texture names like `skin1` appear
*   whether there are repeated float-looking patterns

Good commands:

```
xxd -l 256 body.bgm
strings body.bgm | head -100
strings body.bgm | grep -i skin
```

If `strings` reveals material names / texture names / node names, that’s a great sign.

* * *

My recommendation for you right now
-----------------------------------

Do this in order:

1.  run `strings` on `cars/car_1/body.bgm`
2.  try the existing FlatOut W32/BGM tool on that file
3.  export to text and FBX
4.  separately load `skin1.dds` in Three.js using `DDSLoader`

That way you split the problem cleanly:

*   **geometry path** = `.bgm`
*   **texture path** = `.dds`

* * *

The exact commands I want from you next
---------------------------------------

From the `car_1` folder:

```
strings body.bgm | head -100 > body_strings.txt
xxd -l 256 body.bgm > body_header.txt
```

And if you want a little more:

```
strings body.bgm | grep -i -E "skin|wheel|body|glass|damage" > body_names.txt
```

Send me those outputs, and I’ll tell you whether the file looks easy to reverse a little, or whether we should skip straight to exporter-based conversion.

## Prompt:
is fbx format okay to later use inside threejs? if not, give me the target format and I'll work through that

## Response:
Short answer: **FBX is _okay_, but not what you want long-term.**

The right target format
-----------------------

Use: **glTF (.gltf / .glb)**

That is the **native format of Three.js** and the entire web 3D ecosystem.

* * *

Why NOT FBX (even though it works)
----------------------------------

Yes, Three.js has FBXLoader. But:

Problems with FBX:

*   heavier and slower to load
*   inconsistent exports depending on tool
*   materials often break or need fixing
*   no compression benefits
*   not web-native
*   pain with coordinate systems / scaling

FBX is basically a **temporary interchange format**, not a runtime format.

* * *

Why glTF is the correct choice
------------------------------

glTF is:

*   fast to load in browser
*   directly supported by Three.js (`GLTFLoader`)
*   supports:
    *   meshes
    *   materials (PBR)
    *   hierarchy
    *   animations (later useful)
*   supports compression (Draco, Meshopt)
*   predictable and stable

Think of it like:

> **glTF = “JPEG/MP4 of 3D”**

* * *

Your pipeline should be this
----------------------------

```
.bgm  →  FBX  →  glTF (.glb)  →  Three.js
```

So yes:

*   use FBX only as **intermediate step**
*   final output must be **.glb**

* * *

How to convert FBX → glTF
-------------------------

Use **Blender**

Steps:

1.  Import FBX into Blender
2.  Fix scale / orientation if needed
3.  Assign textures (DDS → might need conversion to PNG)
4.  Export as:
    *   **glTF Binary (.glb)**

Settings:

*   Apply transforms ✅
*   +Y Up (default)
*   Apply modifiers ✅
*   Include normals ✅

* * *

Texture note (important)
------------------------

Your textures are `.dds`:

*   Three.js _can_ load DDS
*   BUT for simplicity early on → convert to PNG

Later you can optimize:

*   use KTX2 (compressed GPU textures)

* * *

Final recommendation (do this)
------------------------------

1.  Extract `body.bgm` → FBX (with that tool)
2.  Open FBX in Blender
3.  Export → `car.glb`
4.  Load in Three.js via `GLTFLoader`

That gets you to your **first visible milestone fast**.

* * *

When to avoid Blender
---------------------

Later (not now), you can:

*   write your own `.bgm → glTF` converter
*   skip FBX entirely

But for now:

> **Blender = fastest path to progress**

* * *

What I want you to do next
--------------------------

Try:

*   convert `body.bgm → FBX`
*   open it in Blender

Then tell me:

*   does the mesh load correctly?
*   do you see separate parts (wheels/body/etc)?

From there we’ll:  
→ hook textures  
→ load into Three.js  
→ make it render properly

That’s your first real win.

## Prompt:
I got the fbx file, yay. can't I convert it online to glb?

2/2

## Response:
Yeah, you _can_ convert online — but I’d strongly recommend **not relying on it** for this project.

Here’s the real breakdown:

Quick answer
------------

*   ✅ Yes, online converters work sometimes
*   ❌ They often break materials / scale / hierarchy
*   ✅ Best option: **Blender (offline, 2 min setup)**

* * *

Why online converters are risky
-------------------------------

For game assets like FlatOut:

*   materials may get lost (very common)
*   coordinate system can flip (car upside down / rotated)
*   scale becomes wrong
*   multi-mesh hierarchy may collapse
*   textures (especially `.dds`) usually break

They’re fine for:

> “random FBX from Sketchfab”

But your case is:

> reverse-engineered game asset → much higher chance of weirdness

* * *

If you REALLY want online (quick try)
-------------------------------------

You can try:

*   Aspose 3D
*   AnyConv

Just:

*   upload FBX
*   download GLB

But expect:

*   missing textures
*   wrong orientation

* * *

The correct (safe) workflow — 2 minutes
---------------------------------------

Use Blender:

1.  Open Blender
2.  Delete default cube
3.  File → Import → FBX
4.  File → Export → glTF (.glb)

That’s it.

* * *

Important checks in Blender
---------------------------

Before exporting, look for:

*   ✔ Car is upright (not sideways/upside down)
*   ✔ Scale looks reasonable
*   ✔ Separate parts exist (body, wheels, etc.)

If something is off:

*   `A` → select all
*   `Ctrl + A → Apply All Transforms`

* * *

Texture situation (you WILL hit this)
-------------------------------------

Even if conversion works:

*   your `.dds` textures won’t automatically bind

So expect:

*   gray car at first → totally fine

We’ll fix that next by:

*   loading `.dds` in Three.js
*   or converting to PNG

* * *

What success looks like
-----------------------

After conversion:

*   you have `car.glb`
*   you load it in Three.js via `GLTFLoader`
*   you see a gray (or partially textured) car

That’s already a **huge milestone**

* * *

My recommendation (don’t overthink)
-----------------------------------

Skip online tools.

Just:

> **FBX → Blender → GLB → Three.js**

* * *

Next step after you convert
---------------------------

Once you have `.glb`, send me:

*   screenshot from Blender OR
*   confirm if it loaded correctly

Then I’ll guide you through:  
👉 loading it in Three.js  
👉 attaching textures  
👉 fixing orientation if needed

We’re very close to seeing your first FlatOut car in WebGL 🚀

## Prompt:
idk man, I just tried it, it works alright, even rendered the car. gltf binary, right?

## Response:
Nice — that’s actually a solid win 👍

Yes, you want:

👉 **glTF Binary = `.glb`** (that’s the correct one)

* * *

Why `.glb` is exactly what you want
-----------------------------------

*   single file (no separate textures/json)
*   fastest to load in browser
*   easiest to manage
*   works perfectly with Three.js `GLTFLoader`

So if your converter gave you `.glb` and:

*   the car shows up
*   geometry looks correct

→ you’re **good to proceed**

* * *

Quick sanity checklist (don’t skip this)
----------------------------------------

Before moving on, confirm:

*   ✔ Car is not upside down
*   ✔ Scale is reasonable (not microscopic or gigantic)
*   ✔ Geometry isn’t broken (no exploded vertices)
*   ✔ Parts exist (not one weird merged blob — unless that’s expected)

If all good → you just unlocked the hardest part: **asset ingestion**

* * *

Next step (this is where things get real)
-----------------------------------------

Now we move to:

👉 **Load it in Three.js**

Minimal example:

```
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

loader.load('/car.glb', (gltf) => {
  const car = gltf.scene;

  scene.add(car);

  car.position.set(0, 0, 0);
  car.scale.set(1, 1, 1);
});
```

* * *

What will likely happen next
----------------------------

You’ll probably see:

*   gray / untextured car → normal
*   or partially textured → lucky

That’s because:

*   `.dds` textures didn’t come through cleanly

We’ll fix that next.

* * *

Important: don’t chase textures yet
-----------------------------------

Your next milestone is:

> **“I can render the car model in Three.js and rotate camera around it”**

Not:

*   not materials
*   not physics
*   not wheels

* * *

If you want to sanity-check quickly
-----------------------------------

Drop your `.glb` here:  
👉 [https://gltf-viewer.donmccurdy.com/](https://gltf-viewer.donmccurdy.com/)

If it looks correct there:  
→ your pipeline is solid

* * *

Where we go next
----------------

Once you confirm it renders in Three.js, we’ll:

1.  Fix orientation (if needed)
2.  Attach textures (`.dds`)
3.  Identify wheels vs body
4.  Prepare for movement

* * *

Bottom line
-----------

You just did:

> proprietary game format → modern web format

That’s the biggest bottleneck in the whole project.

* * *

Send me:

*   what it looks like (textured / not / weird orientation)
*   or a screenshot

and I’ll guide you to the next step cleanly.

## Prompt:
![Uploaded image](https://chatgpt.com/backend-api/estuary/content?id=file_00000000c818720a90c702d83d61feb4&ts=492947&p=fs&cid=1&sig=d7866c16d6b1e86bcd1d0555c69c154f02456b250d17a936efe8250f9b37623b&v=0)

online viewer of fbx. I mean, it looks a little bit rigged, like, not smooth. but I guess it's later configured somehow elsewhere(?). I'll try to shove this into threejs now.
Btw, here's current code:
import "./styles.css";

import * as THREE from "three";

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// THREE.StereoEffect = function(renderer) {};

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

var geometry = new THREE.BoxGeometry();
var material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
var cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

If you have a paste-in thing give it to me.

## Response:
Yep, that looks fine for a first import.

And yes — the “rigid / faceted / low-poly” look is probably one of these:

*   that’s just how the mesh actually is
*   normals/smoothing groups didn’t survive conversion
*   some parts/material setup are still missing

That is not a blocker right now.

Here’s a **paste-in Three.js version** that replaces your cube with a `.glb` car and gives you orbit controls.

Install imports
---------------

Use this as your file:

```
import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(4, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(40, 40);
scene.add(grid);

// Axes helper (optional)
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Load model
const loader = new GLTFLoader();

loader.load(
  "/car.glb", // change path if needed
  (gltf) => {
    const car = gltf.scene;

    scene.add(car);

    // Optional: inspect parts
    car.traverse((obj) => {
      if (obj.isMesh) {
        console.log("mesh:", obj.name, obj);

        obj.castShadow = true;
        obj.receiveShadow = true;

        // Helpful if normals/materials came in weird
        if (obj.material) {
          obj.material.side = THREE.FrontSide;
        }

        // If shading looks broken, try uncommenting this:
        // obj.geometry.computeVertexNormals();
      }
    });

    // Center model automatically
    const box = new THREE.Box3().setFromObject(car);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    car.position.sub(center);
    car.position.y += size.y * 0.5;

    // Optional: scale if too huge/tiny
    // car.scale.setScalar(0.01);

    controls.target.set(0, size.y * 0.4, 0);

    console.log("Model loaded");
    console.log("Size:", size);
    console.log("Center:", center);
  },
  (progress) => {
    if (progress.total) {
      console.log(
        `Loading: ${((progress.loaded / progress.total) * 100).toFixed(1)}%`
      );
    }
  },
  (error) => {
    console.error("Error loading GLB:", error);
  }
);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

Important note
--------------

Put `car.glb` somewhere your sandbox serves statically.

Usually that means:

*   in Vite: inside `public/car.glb`
*   then load with `"/car.glb"`

If the car is invisible
-----------------------

Most likely causes:

*   wrong path
*   scale too big or too small
*   camera clipping
*   model imported far from origin

If invisible, first try:

```
car.scale.setScalar(0.01);
```

or

```
car.scale.setScalar(10);
```

If it is sideways or upside down
--------------------------------

Try one of these after load:

```
car.rotation.x = -Math.PI / 2;
```

or

```
car.rotation.y = Math.PI;
```

or

```
car.rotation.z = Math.PI;
```

Not all at once — test one by one.

If the shading looks ugly
-------------------------

That faceted look may improve with:

```
obj.geometry.computeVertexNormals();
```

inside the `traverse`, but only test it after you get the model loading. Sometimes it helps, sometimes it makes imported hard edges worse.

What I’d do next
----------------

Your next milestone is just:

*   get `car.glb` visible in Three.js
*   orbit around it
*   print mesh names in console

Once that works, we can do the next useful step:  
**find wheels/body as separate meshes and inspect whether the exporter preserved part names.** That tells us how viable movement/animation will be.

## Prompt:
okay this one worked PEERFECTLY.

import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(4, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(40, 40);
scene.add(grid);

// Axes helper (optional)
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Load model
const loader = new GLTFLoader();

loader.load(
  "/src/body_1.glb", // change path if needed
  (gltf) => {
    const car = gltf.scene;

    scene.add(car);

    // Optional: inspect parts
    car.traverse((obj) => {
      if (obj.isMesh) {
        console.log("mesh:", obj.name, obj);

        obj.castShadow = true;
        obj.receiveShadow = true;

        // Helpful if normals/materials came in weird
        if (obj.material) {
          obj.material.side = THREE.FrontSide;
        }

        // If shading looks broken, try uncommenting this:
        // obj.geometry.computeVertexNormals();
      }
    });

    // Center model automatically
    const box = new THREE.Box3().setFromObject(car);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    car.position.sub(center);
    car.position.y += size.y * 0.5;

    // Optional: scale if too huge/tiny
    // car.scale.setScalar(0.01);

    controls.target.set(0, size.y * 0.4, 0);

    console.log("Model loaded");
    console.log("Size:", size);
    console.log("Center:", center);
  },
  (progress) => {
    if (progress.total) {
      console.log(
        Loading: ${((progress.loaded / progress.total) * 100).toFixed(1)}%
      );
    }
  },
  (error) => {
    console.error("Error loading GLB:", error);
  }
);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

please use this as base code.
Now, I see that it lags a lot. like, the motion is not laggy, but interactions are pretty much delayed. dunno what's the problem here though. We'd maybe want to request more resources from the machine for this to work? or what. anyway
I wanna do the rest of the things now:
1) texture
2) wheels
what else is there?

## Response:
Nice. This is the first real milestone.

And yes, use this as the base now.

About the lag: **don’t assume you need a stronger machine yet**. Since you said rendering itself is smooth, but **interactions feel delayed**, the likely causes are more like:

*   CodeSandbox / browser tab overhead
*   Devtools open
*   orbit controls damping feeling “draggy”
*   huge model vertex count / bad normals recalculation later
*   loading from `/src/...` instead of proper static asset path
*   browser running on integrated GPU / battery saver
*   touchpad input latency feeling worse than actual FPS

First thing I’d try:

```
controls.enableDamping = false;
```

If the interaction suddenly feels snappy, then the “lag” is mostly just damping inertia, not performance.

Also add this once in `animate()` temporarily:

```
console.log(renderer.info.render);
```

Not every frame forever, just inspect a bit. It helps tell whether the scene is absurdly heavy.

And change:

```
loader.load("/src/body_1.glb", ...)
```

to a proper static-served path if your setup allows it, like:

```
loader.load("/body_1.glb", ...)
```

with the file in `public/`. `/src/...` often works awkwardly depending on tooling.

* * *

What’s next after body mesh
---------------------------

Your next useful chunks are:

1.  **texture**
2.  **wheel meshes / wheel placement**
3.  **material assignment**
4.  **car metadata from `.ini`**
5.  **camera setup**
6.  **simple movement**
7.  **track import**

So yes, texture and wheels are the right next targets.

* * *

What else is there in a car folder, conceptually
------------------------------------------------

Usually this kind of folder gives you:

*   `body.bgm` → main car geometry
*   `skin*.dds` → body textures / liveries
*   `body.ini` → probably references, offsets, part data, maybe materials
*   `camera.ini` → camera offsets
*   `lights.ini` → headlight / brake light positions
*   `panels.ini` → detachable or damageable body panels
*   `tires.ini` → wheel/tire-related metadata
*   `crash.dat` → damage/deformation stuff

For your current stage, the high-value order is:

**textures → wheels → body.ini / tires.ini / camera.ini**

Not `crash.dat` yet.

* * *

First: make the scene easier to inspect
---------------------------------------

Use your code, but add references and a little cleaner structure.

Paste this version. It stays very close to yours and prepares for textures/wheels:

```
import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(4, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(40, 40);
scene.add(grid);

// Axes helper
const axes = new THREE.AxesHelper(2);
scene.add(axes);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; // important for testing input lag
controls.target.set(0, 1, 0);

// Refs
let carRoot = null;
const wheelMeshes = [];

// Load model
const loader = new GLTFLoader();

loader.load(
  "/src/body_1.glb",
  (gltf) => {
    carRoot = gltf.scene;
    scene.add(carRoot);

    carRoot.traverse((obj) => {
      if (obj.isMesh) {
        console.log("mesh:", obj.name, obj);

        obj.castShadow = true;
        obj.receiveShadow = true;

        if (obj.material) {
          obj.material.side = THREE.FrontSide;
        }

        // Optional debug heuristic:
        // try to detect wheel-like mesh names
        const lower = obj.name.toLowerCase();
        if (
          lower.includes("wheel") ||
          lower.includes("tire") ||
          lower.includes("tyre") ||
          lower.includes("rim")
        ) {
          wheelMeshes.push(obj);
        }
      }
    });

    const box = new THREE.Box3().setFromObject(carRoot);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    carRoot.position.sub(center);
    carRoot.position.y += size.y * 0.5;

    controls.target.set(0, size.y * 0.4, 0);

    console.log("Model loaded");
    console.log("Size:", size);
    console.log("Center:", center);
    console.log("Detected wheel-like meshes:", wheelMeshes);
  },
  (progress) => {
    if (progress.total) {
      console.log(
        `Loading: ${((progress.loaded / progress.total) * 100).toFixed(1)}%`
      );
    }
  },
  (error) => {
    console.error("Error loading GLB:", error);
  }
);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  renderer.render(scene, camera);
}
animate();
```

* * *

1) Texture
----------

There are two possibilities:

### Case A — texture is already embedded in the GLB

Then you’re done.

### Case B — geometry came through, but materials/textures did not

That is more likely.

Your source textures are `.dds`, so the next task is:

*   inspect the car folder
*   identify which `skin*.dds` belongs to the body
*   load or convert that texture
*   assign it to the right mesh/material

### Fastest path

Convert the relevant `.dds` to `.png` first.

Why:

*   much easier than debugging DDS in browser right now
*   lets you prove material hookup fast

Then in Three.js:

```
const textureLoader = new THREE.TextureLoader();
const bodyTexture = textureLoader.load("/src/skin1.png");
bodyTexture.flipY = false;
bodyTexture.colorSpace = THREE.SRGBColorSpace;
```

Then after model load:

```
carRoot.traverse((obj) => {
  if (obj.isMesh) {
    obj.material = new THREE.MeshStandardMaterial({
      map: bodyTexture
    });
  }
});
```

That applies the same texture everywhere just as a test. Ugly maybe, but great for proving UVs work.

### Better later

Use DDS directly with `DDSLoader`, or convert to KTX2 for web-optimized textures.

For now, PNG is the least painful route.

* * *

2) Wheels
---------

Important question: are the wheels already in `body_1.glb` as separate meshes?

Your screenshot suggests the body and rough wheel shapes are there, but we do not yet know whether:

*   they are separate wheel meshes
*   they are merged into the body mesh
*   they are placeholder low-detail pieces
*   actual wheel data lives elsewhere

So the next step is not yet “animate wheels.”

The next step is:

**inspect mesh names and count wheel-like parts.**

In console, look at what mesh names came out.

Best case:

*   `wheel_fl`
*   `wheel_fr`
*   `wheel_rl`
*   `wheel_rr`

or some equivalent

Then life is easy.

If the exporter preserved separate wheels, you can later do:

```
wheel.rotation.x += 0.1;
```

for spinning, and pivot steering for front wheels.

If wheels are not separate, you’ll need to:

*   extract wheels from another asset
*   or split them in Blender
*   or fake it later

* * *

What else is there after texture + wheels
-----------------------------------------

After those two, the next best tasks are:

### 3) Read `.ini` files

This is where the “real game data” starts becoming useful.

Especially:

*   `camera.ini`
*   `tires.ini`
*   `body.ini`
*   `lights.ini`

These may tell you:

*   wheel positions
*   camera offset
*   light positions
*   named parts

Which is huge.

### 4) Basic material cleanup

Once texture works:

*   glass material
*   black plastic
*   headlights
*   metallic paint later if needed

### 5) Car transform wrapper

You’ll want:

*   a parent object = whole car movement
*   child meshes = body + wheels

That lets you move the whole car while rotating wheels independently.

### 6) Track

Only after car body + wheels + simple movement should you go to track import.

* * *

The clean next order
--------------------

Here’s the order I’d use now:

**A. inspect wheel mesh names**  
**B. test one body texture as PNG**  
**C. read `camera.ini` and `tires.ini`**  
**D. decide whether wheels are already separated**  
**E. build a simple car wrapper object**  
**F. fake wheel spin/steer**  
**G. move toward track**

* * *

About the lag, specifically
---------------------------

Before doing more, test these:

1.  set

```
controls.enableDamping = false;
```

2.  close devtools if open
3.  try on a local Vite dev server instead of sandbox if possible
4.  keep only one light + no heavy helpers if needed:

```
scene.remove(grid);
scene.remove(axes);
```

5.  do not call `computeVertexNormals()` yet

If rendering is smooth but interaction feels delayed, I still suspect the main culprit is **OrbitControls damping + environment**, not raw GPU shortage.

* * *

What I need from you next
-------------------------

Two very useful things:

*   paste the console output of the mesh names
*   paste the contents of:
    *   `camera.ini`
    *   `tires.ini`
    *   `body.ini`

Then I can tell you:

*   whether the wheels are already separable
*   how to texture properly
*   what game metadata is worth wiring next

If you want, next message I can give you a **small paste-in upgrade** that loads a test PNG texture onto the car and also highlights wheel candidate meshes in a different color.

## Prompt:
I did share the folders and files with you before above, can't you check if there are wheels anywhere in there?

## Response:
Thought for 32s

Yeah, I checked the tree itself.

And the key finding is: **yes, there are separate tire/wheel assets in the game data** — just apparently **not inside `cars/car_1/` itself**.

What I found in the tree:

*   every car folder has a tiny `tires.ini`
*   there is a shared set of tire meshes:
    *   `tire_1.bgm`
    *   `tire_2.bgm`
    *   ...
    *   up to at least `tire_19.bgm`
*   and matching tire textures:
    *   `tire_01.dds`
    *   `tire_02.dds`
    *   etc.

So the likely setup is:

*   `cars/car_1/body.bgm` = car body shell / main model
*   `cars/car_1/tires.ini` = tells the game **which shared tire mesh + texture to use**
*   shared `tire_*.bgm` somewhere else in data = actual wheel/tire model asset

So your current GLB probably contains:

*   body
*   wheel-well placeholders / hubs / maybe brake-ish geometry

but **not necessarily the final reusable tire mesh asset**.

That’s actually good news, because it means the game likely composes the full car from:

1.  body model
2.  shared tire model
3.  parameters from `tires.ini`

So the next move is obvious
---------------------------

Open and paste the contents of:

```
cars/car_1/tires.ini
```

That file is tiny, and it’s probably the bridge between:

*   car\_1
*   the correct `tire_X.bgm`
*   maybe wheel scale / offsets / texture index

That’s the highest-value file right now.

* * *

What I think the pipeline is now
--------------------------------

For one proper car in Three.js, you probably want:

1.  `body_1.glb` from `body.bgm`
2.  `tire_X.glb` from the right `tire_X.bgm`
3.  use `tires.ini` to figure out which tire model belongs to `car_1`
4.  instantiate that tire mesh 4 times
5.  place them manually at first
6.  later read exact offsets from config if available

* * *

About “what else is there?”
---------------------------

For the car slice, the likely next useful files are:

*   `tires.ini` — wheel asset selection
*   `camera.ini` — chase camera offset
*   `lights.ini` — light positions
*   `body.ini` — maybe materials / body setup / hardpoints
*   `panels.ini` — detachable parts later
*   `crash.dat` — damage later, ignore for now

So the updated priority is:

**1\. tires.ini**  
**2\. camera.ini**  
**3\. body texture hookup**  
**4\. separate tire mesh import**  
**5\. wheel placement + fake spinning**

* * *

What to do right now
--------------------

Please paste:

*   `cars/car_1/tires.ini`
*   `cars/car_1/camera.ini`
*   `cars/car_1/body.ini`

Start with `tires.ini` if you want just one.

Once I see that, I can probably tell you:

*   which `tire_*.bgm` to convert next
*   whether wheels should be separate objects
*   how to attach them cleanly in your current Three.js codebase

And yes — your intuition was right to ask. The wheel assets do appear to exist separately.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)