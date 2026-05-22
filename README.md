# opencode-md-management

Manage AI instruction markdown files for OpenCode with explicit project and scope-aware safety gates.

`opencode-md-management` manages a project primary instruction file such as `AGENTS.md` or `CLAUDE.md`, mirrors it to explicitly enabled project targets, and reports discovered local/global instruction files without writing them unless that scope is explicitly initialized. ChatGPT web UI is not a filesystem target; OpenAI's file-based target is Codex CLI (`AGENTS.md`, global `~/.codex/AGENTS.md`).

## What it does

- Registers OpenCode slash commands: `/omm:init`, `/omm:doctor`, `/omm:audit`, `/omm:sync`, `/omm:sync-apply`, `/omm:mirrors`, `/omm:revise`, `/omm:learn`, `/omm:proposals`, `/omm:proposal-show`, `/omm:proposal-approve`, `/omm:proposal-reject`, and `/omm:proposal-gc`.
- Provides matching plugin tools: `agent_md_init`, `agent_md_doctor`, `agent_md_audit`, `agent_md_sync`, `agent_md_mirrors`, `agent_md_revise`, `agent_md_learn`, and `agent_md_proposal_*`.
- Keeps writes single-scope. `--scope all` is read-only and write commands reject it.
- Treats `.claude.local.md` as a local scope, never as a project mirror target.
- Treats `AGENTS.override.md` as read-only inventory/audit information, not as a sync target.

## Install

```bash
npm install
npm run build
```

OpenCode plugin config:

```json
{
  "plugin": ["opencode-md-management"]
}
```

## Quick start

```text
/omm:init
/omm:doctor
/omm:audit
/omm:sync
/omm:sync-apply
/omm:mirrors --enable opencode
```

CLI equivalent:

```bash
npx opencode-md-management init --model claude --mirror opencode gemini
npx opencode-md-management doctor
npx opencode-md-management audit
npx opencode-md-management sync
npx opencode-md-management sync --apply
npx opencode-md-management mirrors --enable opencode
```

## Scopes

| Scope | Primary file | Write behavior |
| --- | --- | --- |
| `project` | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, or Copilot instructions | Writable after project init |
| `local` | `.claude.local.md` | Explicitly initialized local scope only |
| `global:claude` | `~/.claude/CLAUDE.md` | Explicitly initialized/adopted global scope only |
| `global:opencode` | OpenCode config `AGENTS.md` | Explicitly initialized/adopted global scope only |
| `global:codex` | `~/.codex/AGENTS.md` | Explicitly initialized/adopted global scope only |
| `nested:*` | nested `CLAUDE.md` | Inventory/audit only in MVP |

Project commands may discover global files, but they do not own or write global state. Cross-tool global mirroring is not part of this MVP.

## Commands

```bash
npx opencode-md-management init --model claude --mirror opencode gemini
npx opencode-md-management init --scope local --adopt
npx opencode-md-management init --scope global:claude --adopt
npx opencode-md-management doctor --scope all
npx opencode-md-management audit --scope all
npx opencode-md-management sync --scope project
npx opencode-md-management sync --apply --scope project
npx opencode-md-management mirrors --enable opencode --disable gemini
npx opencode-md-management revise --notes "Add migration troubleshooting rules" --scope project
npx opencode-md-management learn --notes-file ./session-notes.md --scope project
npx opencode-md-management proposal:list --status pending
npx opencode-md-management proposal:show <id>
npx opencode-md-management proposal:approve <id>
npx opencode-md-management proposal:reject <id> --reason "obsolete"
npx opencode-md-management proposal:gc --older-than-days 30 --status approved,stale,rejected
```

`revise`, `learn`, and proposal approval are project-only in the current MVP. Non-project scope arguments are rejected with a clear error until scoped proposals are fully implemented.

## Configuration

Project `.agent-md.json` uses v2 shape while still accepting legacy v1 `canonical` configs in memory:

```json
{
  "schemaVersion": 2,
  "scope": { "id": "project", "kind": "project", "tool": null },
  "primary": "CLAUDE.md",
  "canonical": "CLAUDE.md",
  "targets": [
    { "path": "AGENTS.md", "mode": "mirror", "enabled": true },
    { "path": "GEMINI.md", "mode": "mirror", "enabled": false },
    { "path": ".codex/AGENTS.md", "mode": "mirror", "enabled": false }
  ],
  "sync": { "requireGitClean": true, "backupDir": ".agent-md/backups" },
  "audit": { "maxSectionLines": 200, "forbidSecretsPatterns": true },
  "llm": { "enabled": true, "promptInjectionGuard": true }
}
```

`mode: "local"` targets are intentionally rejected. Convert local files to local scopes instead.

## Safety model

Sync is one-way from the selected scope primary to enabled targets. Dry-run is the default. Drifted targets require `--force`. Write paths must stay inside the selected scope root, and `--scope all` is read-only.

`revise` and `learn` create proposals under `.agent-md/proposals/`; approval updates only the project primary. Run `sync --apply --scope project` separately to update targets.

## Non-goals

- ChatGPT web UI integration.
- Cross-tool global mirroring.
- Effective merged audit of what a tool reads after applying all precedence rules.
- Automatic bidirectional merge.
- Watcher-driven writes, session mining, or TUI toast integration.
- Real LLM provider integration beyond the current proposal wrapper.
- `AGENTS.override.md` write or precedence handling.
