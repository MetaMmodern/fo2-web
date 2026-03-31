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
