# Ghidra MCP Setup on a New Windows Machine

I recovered the exact prior fix from the local Codex session log at `/Users/metamodern/.codex/sessions/2026/03/29/rollout-2026-03-29T19-28-42-019d3a36-2d6d-7532-9059-42d9d926e55c.jsonl` and the current working config at `/Users/metamodern/.codex/config.toml`.

The two real problems were:

- Codex does not expand `~` in the MCP `command`, so `~/.venvs/.../python` caused `Tools: (none)`.
- An earlier Python environment was missing `requests`, so `bridge_mcp_ghidra.py` crashed before tool discovery.

## Recommended Setup

1. Install Ghidra and download the GhidraMCP release zip plus `bridge_mcp_ghidra.py`.
2. In Ghidra: `File -> Install Extensions` -> add the release zip -> restart Ghidra.
3. In Ghidra: confirm `GhidraMCPPlugin` is enabled.
4. Keep Ghidra’s MCP HTTP server on `http://127.0.0.1:8080/` unless you intentionally change it.
5. Create a dedicated Python venv and install the bridge dependencies into that venv.

PowerShell:

```powershell
py -3.11 -m venv $env:USERPROFILE\.venvs\ghidra-mcp
$env:USERPROFILE\.venvs\ghidra-mcp\Scripts\python.exe -m pip install -U pip
$env:USERPROFILE\.venvs\ghidra-mcp\Scripts\python.exe -m pip install requests "mcp>=1.2.0,<2"
```

Put the bridge somewhere stable, for example:

- `C:\Users\YOUR_USER\Tools\GhidraMCP\bridge_mcp_ghidra.py`

Then add the MCP server in Codex with absolute paths only:

```powershell
codex mcp add ghidra -- `
  C:\Users\YOUR_USER\.venvs\ghidra-mcp\Scripts\python.exe `
  C:\Users\YOUR_USER\Tools\GhidraMCP\bridge_mcp_ghidra.py `
  --ghidra-server http://127.0.0.1:8080/ `
  --transport stdio
```

## Do Not Skip These

- Do not use `~` in `command`.
- Do not rely on `python` from `PATH`; use the full `python.exe` path.
- Do not put the bridge in a temporary download path if you might move or delete it later.
- If the bridge “hangs” when run manually, that is normal for `stdio`; it is waiting for an MCP client.
- If `/mcp` still shows no tools, restart Codex after adding the server.

## Verify

Run:

```powershell
codex mcp get ghidra
codex mcp list
```

The `ghidra` entry should show:

- `command: C:\Users\YOUR_USER\.venvs\ghidra-mcp\Scripts\python.exe`
- `args: C:\Users\YOUR_USER\Tools\GhidraMCP\bridge_mcp_ghidra.py --ghidra-server http://127.0.0.1:8080/ --transport stdio`

## Sources

- Local recovered fix: `/Users/metamodern/.codex/sessions/2026/03/29/rollout-2026-03-29T19-28-42-019d3a36-2d6d-7532-9059-42d9d926e55c.jsonl`
- Current working config: `/Users/metamodern/.codex/config.toml`
- GhidraMCP package/install docs: https://pypi.org/project/ghidramcp/
- Bridge dependency metadata: https://glama.ai/mcp/servers/%40pr0cf5/GhidraMCP/blob/27f316f80139e2d5dec882519a1bdf4aa46ac04c/bridge_mcp_ghidra.py
