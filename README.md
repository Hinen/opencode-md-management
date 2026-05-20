# opencode-md-management

Manage AI instruction markdown files for OpenCode.

`opencode-md-management` keeps `AGENTS.md` as the default canonical instruction file and manages target files such as `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, and `.github/copilot-instructions.md` with explicit, one-way sync. It focuses on closing OpenCode-native instruction markdown lifecycle gaps, not broad parity with other tools.

## What it does

- Plugin tools expose the same management surface inside OpenCode: `agent_md_init`, `agent_md_doctor`, `agent_md_audit`, `agent_md_sync`, `agent_md_revise`, `agent_md_learn`, `agent_md_proposal_list`, `agent_md_proposal_show`, `agent_md_proposal_approve`, `agent_md_proposal_reject`, and `agent_md_proposal_gc`.
- `init` creates `.agent-md.json` without touching markdown files.
- `doctor` reports canonical and target file status.
- `audit` checks the canonical markdown for duplicate headings, vague instructions, long sections, and secret-like values.
- `sync` previews canonical-to-target changes by default and writes only with `--apply`.
- `revise` and `learn` create canonical update proposals. They do not write markdown files directly.
- Proposal lifecycle commands list, show, approve, reject, and garbage-collect stored proposals. `proposal:approve` writes only the canonical file when the proposal is not stale. Target files are updated separately with `sync --apply`.

## Non-goals

- No automatic bidirectional merge.
- No automatic overwrite of existing target files.
- No model-specific dialect rewriting.
- No automatic session learning append.
- No drift watcher, session mining, slash command, or TUI toast integration in this release.

## Install

```bash
npm install
npm run build
```

## Usage

Inside OpenCode, install the package as a plugin and call the exposed tools when managing instruction files.

```json
{
  "plugin": ["opencode-md-management"]
}
```

The same functionality is available as a standalone CLI:

```bash
npx opencode-md-management init
npx opencode-md-management doctor
npx opencode-md-management audit
npx opencode-md-management sync
npx opencode-md-management sync --apply
npx opencode-md-management revise --notes "Add migration troubleshooting rules"
npx opencode-md-management learn --notes-file ./session-notes.md
npx opencode-md-management proposal:list
npx opencode-md-management proposal:list --status pending
npx opencode-md-management proposal:show <id>
npx opencode-md-management proposal:approve <id>
npx opencode-md-management proposal:reject <id> --reason "obsolete"
npx opencode-md-management proposal:gc --older-than-days 30 --status approved,stale,rejected
```

## Proposal lifecycle

| CLI | Plugin tool |
|-----|-------------|
| `proposal:list [--status pending\|approved\|stale\|rejected]` | `agent_md_proposal_list` |
| `proposal:show <id>` | `agent_md_proposal_show` |
| `proposal:approve <id>` | `agent_md_proposal_approve` |
| `proposal:reject <id> [--reason <text>]` | `agent_md_proposal_reject` |
| `proposal:gc [--older-than-days <n>] [--status approved,stale,rejected]` | `agent_md_proposal_gc` |

`proposal:list` prints one tab-delimited proposal per line: `id`, `status`, `createdAt`, `source.kind`, and `canonicalPath`. Missing proposal ids are reported as clean CLI errors with a non-zero exit code. `proposal:gc` refuses to delete `pending` proposals; by default it deletes `approved`, `stale`, and `rejected` proposals older than 30 days.

## Configuration

`.agent-md.json`:

```json
{
  "canonical": "AGENTS.md",
  "targets": [
    { "path": "CLAUDE.md", "mode": "mirror", "enabled": true },
    { "path": "GEMINI.md", "mode": "mirror", "enabled": true }
  ],
  "sync": {
    "requireGitClean": true,
    "backupDir": ".agent-md/backups"
  },
  "llm": {
    "enabled": true,
    "promptInjectionGuard": true
  }
}
```

## LLM provider

This release ships only `MockLlmProvider`. It makes no external network calls. `llm.enabled` selects the provider abstraction, and `llm.promptInjectionGuard` wraps user notes in HTML comment delimiters before they are concatenated to the canonical content.

The guard is structural delimiter wrapping only. It does not sanitize, strip, or semantically validate note content, and `MockLlmProvider` appends the wrapped notes verbatim to the canonical document. Treat proposal `after` content as user-supplied until a real provider with output validation is added.

## learn --notes-file policy

`--notes-file` is resolved relative to the current worktree. Absolute paths and paths that escape the worktree via `..` are rejected before any read because the path is routed through `resolveInsideRoot`.

## Safety model

Sync is canonical-to-target only. Existing target files that drift from the last synced hash are blocked unless `--force` is passed. Dry-run is the default.

`revise` and `learn` store proposals under `.agent-md/proposals/` and return a unified diff for review. `proposal:approve` re-reads the canonical file and rejects stale proposals when the canonical hash changed after proposal creation. Approval updates only the canonical file; run `sync --apply` separately to update target files.

Proposal inventory is fail-closed for valid proposal ids: non-JSON files and invalid-id filenames are ignored, but corrupt JSON or schema-invalid files with valid proposal ids raise an error instead of silently disappearing from lists.

## Plugin hook surface (current)

`@opencode-ai/plugin@1.15.5` exposes the `tool` and `command.execute.before` surfaces used by this package. It does not expose a drift watcher (`file.watcher.updated`), a session-idle hook (`session.idle`), or a toast surface (`tui.toast.show`). Drift watcher, session mining, slash command UX, and TUI toasts remain non-goals for this release; `command.execute.before` can intercept commands but is not a toast output surface.

## Deferred

- No automatic session mining.
- No slash command or TUI toast integration.
- No drift watcher.
- No model-specific dialect rewriting.
- No section-level structured editing.
