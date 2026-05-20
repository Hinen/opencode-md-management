# opencode-md-management

Manage AI instruction markdown files for OpenCode.

`opencode-md-management` keeps `AGENTS.md` as the default canonical instruction file and manages target files such as `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, and `.github/copilot-instructions.md` with explicit, one-way sync.

## What it does

- Plugin tools expose the same management surface inside OpenCode: `agent_md_init`, `agent_md_doctor`, `agent_md_audit`, `agent_md_sync`, `agent_md_revise`, `agent_md_learn`, `agent_md_proposal_show`, and `agent_md_proposal_approve`.
- `init` creates `.agent-md.json` without touching markdown files.
- `doctor` reports canonical and target file status.
- `audit` checks the canonical markdown for duplicate headings, vague instructions, long sections, and secret-like values.
- `sync` previews canonical-to-target changes by default and writes only with `--apply`.
- `revise` and `learn` create canonical update proposals. They do not write markdown files directly.
- `proposal:approve` writes only the canonical file when the proposal is not stale. Target files are updated separately with `sync --apply`.

## Non-goals

- No automatic bidirectional merge.
- No automatic overwrite of existing target files.
- No model-specific dialect rewriting.
- No automatic session learning append.

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
npx opencode-md-management proposal:show <id>
npx opencode-md-management proposal:approve <id>
```

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

## Safety model

Sync is canonical-to-target only. Existing target files that drift from the last synced hash are blocked unless `--force` is passed. Dry-run is the default.

`revise` and `learn` store proposals under `.agent-md/proposals/` and return a unified diff for review. `proposal:approve` re-reads the canonical file and rejects stale proposals when the canonical hash changed after proposal creation. Approval updates only the canonical file; run `sync --apply` separately to update target files.

## Deferred

- No automatic session mining.
- No slash command or TUI toast integration.
- No model-specific dialect rewriting.
- No section-level structured editing.
