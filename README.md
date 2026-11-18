# dsh-plugin-workspace-adopt

Auto-adopt orphan sessions into DSH workspaces, so sessions created outside the web server appear in the Web UI automatically — with **no server restart**.

## Problem

[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) (DSH) sessions can be created by different processes: the Web GUI (via the web server) and headless/CLI runs (`dsh --profile headless ...`). The web server's workspace registry adopts stored sessions **once**, during its first-start bootstrap. Any session created afterwards by another process is never attached to a workspace, so it never shows up in the Web UI session list until someone restarts the web server.

## Solution

This plugin runs inside the web server and periodically:

1. Enumerates all stored sessions via `sessionPersistence.list()`.
2. For each workspace in `workspaceRegistry`, finds stored sessions that are not yet members (and not archived).
3. Attaches them with `WorkspaceEntity.attachSession(id)` — the built-in method that validates the session's `cwd` (after `realpath`) equals the workspace path and persists the membership update, emitting the same change events as a manual attach, so the UI updates live.

Safety properties:

- **Idempotent** — already-attached sessions are skipped.
- **Archived sessions are never re-attached.**
- **Path-validated** — adoption only happens when the session's working directory canonicalizes to the workspace path; mismatches are skipped (enforced by `attachSession` itself).
- **Non-blocking** — passes are guarded against overlap; failures in one pass are logged and retried on the next tick.

Default poll interval: **15 seconds**.

## Install

### Via Plugin Manager (recommended)

```bash
dsh plugin --profile web add github:vinhome/dsh-plugin-workspace-adopt
```

Then enable the `workspace-adopt` bundle in your profile.

### Manual (local link)

```bash
# from your profile directory, e.g. ~/.dsh/profiles/web
pnpm add link:/absolute/path/to/dsh-plugin-workspace-adopt
```

Add `"dsh-plugin-workspace-adopt"` to the `dsh.profile.bundles` array in the profile `package.json`, then restart the web server **once** to load the plugin. After that, every new headless session appears in the UI within one poll interval.

## Requirements

- DSH `>= 0.2.2-rc.1` (uses the `workspaceRegistry` and `sessionPersistence` services).
- No runtime dependencies.

## Verification

End-to-end test performed on DSH `0.2.2-rc.1`:

1. Created a fresh session via `printf '…' | dsh --profile headless --json -` in a workspace directory.
2. Confirmed it was **not** a workspace member (orphan).
3. Restarted the web server once (to load the plugin).
4. Within one poll interval the session appeared in `workspace.json` membership and in the Web UI session list — no further restarts.

## License

[MIT](./LICENSE)
