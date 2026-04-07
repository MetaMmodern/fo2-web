# AGENTS.md

## Ghidra Workflow

- Any time Ghidra MCP is used for reverse-engineering, document the findings in-repo before closing the task.
- When the MCP supports persistent edits, also save the finding into the Ghidra project itself via comments, renames, prototypes, or other appropriate annotations.
- Update [GHIDRA_VISUAL_ADDRESSBOOK.md](/Users/metamodern/Documents/Github/Personal/flatout_oss/GHIDRA_VISUAL_ADDRESSBOOK.md) when the finding is a stable anchor: function address, string address, config table, subsystem entry point, or runtime call path.
- Add or update a focused note in `/Users/metamodern/Documents/Github/Personal/flatout_oss/ghidra_findings/` when the work is subsystem-specific, exploratory, or too detailed for the addressbook.
- If a finding also changes implementation strategy, reflect that in the relevant top-level findings doc as well, not only in the addressbook.
- Do not leave Ghidra-derived conclusions only in chat.
- Repo notes complement the Ghidra project; they do not replace it.

## Reverse-Engineering Notes

- Prefer concrete addresses, symbol names, string VAs, and config keys over vague summaries.
- Mark clearly what is confirmed from disassembly/decompilation versus inferred from surrounding data.
- When a runtime config path is recovered, record both the config key and the consuming function.

## Source Of Truth

- For gameplay, physics, camera, VFX, UI behavior, and rendering ports, use `reference/FlatOut-2-decomp-main/` and original shipped data in `src/data/` as the source of truth.
- Prefer decompiled C/C++, original configs, original shaders, and original assets over replacement logic.
- Do not invent behavior, constants, formulas, or tunings when porting original-game systems.
- If the required original behavior or value cannot be confirmed from decompilation, shipped data, or documented findings already in-repo, stop and ask the user for further instructions.

## Build And Runtime Safety

- Do not run build commands, dev servers, or other runtime-mutating commands unless the user explicitly asks for them.
- Do not run commands that can disrupt the live runtime environment.
- Safe static inspection and parse-only checks are allowed unless the user says otherwise.

## Porting Default

- When the user says to port a system or behavior, inspect `reference/FlatOut-2-decomp-main/` and the original shipped asset/config/shader data first.
- Port the original logic and data flow directly when they can be recovered.
- If a required part of the original logic cannot be confirmed, stop, report exactly what is missing, and wait for further instructions.
