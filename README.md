# opencode-md-management

Manage AI instruction markdown files for OpenCode through a single primary file plus symlink aliases.

`opencode-md-management` lets you maintain one primary instruction markdown file (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, or `.github/copilot-instructions.md`) and expose it to other AI tools as same-directory symlink aliases. Edit the primary; every aliased tool sees the change instantly without a sync step. Changes go through a proposal-first review pipeline.

## What it does

- Registers OpenCode slash commands: `/omm:init`, `/omm:doctor`, `/omm:audit`, `/omm:sync`, `/omm:sync-apply`, `/omm:aliases`, `/omm:revise`, `/omm:learn`, `/omm:review`, `/omm:proposals`, `/omm:proposal-show`, `/omm:proposal-approve`, `/omm:proposal-reject`, and `/omm:proposal-gc`.
- Provides matching plugin tools: `agent_md_init`, `agent_md_doctor`, `agent_md_audit`, `agent_md_sync`, `agent_md_aliases`, `agent_md_revise`, `agent_md_learn`, `agent_md_review`, and `agent_md_proposal_*`.
- Keeps writes single-scope. `--scope all` is read-only and write commands reject it.
- Treats `.claude.local.md` as a local scope, never as a project alias target.
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
/omm:init --model claude --alias gemini codex
/omm:doctor
/omm:audit
```

CLI equivalent:

```bash
npx opencode-md-management init --model claude --alias gemini codex
npx opencode-md-management doctor
npx opencode-md-management audit
```

After `init`, edit `CLAUDE.md` (the primary). `GEMINI.md` and `.codex/AGENTS.md` are symlinks to it, so every change propagates immediately. No `sync` step needed under normal use.

## Scopes

| Scope | Primary file | Write behavior |
| --- | --- | --- |
| `project` | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, or Copilot instructions | Writable after project init |
| `local` | `.claude.local.md` | Explicitly initialized local scope only |
| `global:claude` | `~/.claude/CLAUDE.md` | Explicitly initialized/adopted global scope only |
| `global:opencode` | OpenCode config `AGENTS.md` | Explicitly initialized/adopted global scope only |
| `global:codex` | `~/.codex/AGENTS.md` | Explicitly initialized/adopted global scope only |
| `nested:*` | nested `CLAUDE.md` | Inventory/audit only in MVP |

Project commands may discover global files, but they do not own or write global state. Cross-tool global symlinking is not part of this MVP.

## Commands

```bash
npx opencode-md-management init --model claude --alias gemini codex copilot
npx opencode-md-management init --scope local --adopt
npx opencode-md-management init --scope global:claude --adopt
npx opencode-md-management doctor --scope all
npx opencode-md-management audit --scope all
npx opencode-md-management sync --scope project
npx opencode-md-management sync --apply --scope project
npx opencode-md-management aliases --add gemini --remove copilot
npx opencode-md-management revise --notes "Add migration troubleshooting rules" --scope project
npx opencode-md-management learn --notes-file ./session-notes.md --scope project
npx opencode-md-management proposal:list --status pending
npx opencode-md-management proposal:show <id>
npx opencode-md-management proposal:approve <id>
npx opencode-md-management proposal:reject <id> --reason "obsolete"
npx opencode-md-management proposal:gc --older-than-days 30 --status approved,stale,rejected
```

`revise`, `learn`, `review`, and proposal approval are project-only in the current MVP. Non-project scope arguments are rejected with a clear error until scoped proposals are fully implemented.

## Configuration

Project `.agent-md.json` (v3) is a flat list of alias paths:

```json
{
  "schemaVersion": 3,
  "scope": { "id": "project", "kind": "project", "tool": null },
  "primary": "CLAUDE.md",
  "aliases": ["AGENTS.md", "GEMINI.md", ".codex/AGENTS.md"],
  "sync": { "requireGitClean": true },
  "audit": { "maxSectionLines": 200, "forbidSecretsPatterns": true },
  "llm": { "enabled": true, "promptInjectionGuard": true }
}
```

Each alias path is materialized as a same-directory relative symlink to the primary. Legacy v1/v2 configs (with `targets: [{path, mode, enabled}]`) are migrated in memory to v3 on load.

## How sync works

- The primary instruction file is the single source of truth. You edit it; aliases reflect changes immediately because they are symlinks.
- `sync` exists only to detect and repair drift — e.g. a contributor deleted an alias or replaced it with a regular file. Run `sync` to preview, `sync --apply` to recreate the broken symlinks, and `sync --apply --force` to overwrite a regular file that has taken the alias path.
- Approving a proposal writes the new content to the primary file and repairs any drifted aliases automatically.

## Platform notes

- **Windows requires symlink support.** Enable Developer Mode (Settings → Privacy & security → For developers) once per machine. The tool fails loud with an actionable error if symlink creation is rejected — there is no automatic copy fallback.
- Alias files are typically gitignored (each contributor regenerates them via `omm init` on their own machine) so that Windows clones with `core.symlinks=false` do not silently turn symlinks into text files. The CLI does not edit `.gitignore` for you.

## Safety model

Write commands operate on exactly one scope at a time. Symlink creation goes through path-safety guards that refuse to write through symlinked parent directories whose realpath escapes the repo root. The primary file is written atomically (temp + rename).

`revise` and `learn` create proposals under `.agent-md/proposals/`; approval updates the primary file in place. Drifted aliases are repaired automatically as part of approval.

## Non-goals

- ChatGPT web UI integration.
- Cross-tool global symlinking.
- Effective merged audit of what a tool reads after applying all precedence rules.
- Automatic bidirectional merge.
- Watcher-driven writes, session mining, or TUI toast integration.
- Real LLM provider integration beyond the current proposal wrapper.
- `AGENTS.override.md` write or precedence handling.
- Automatic copy fallback on Windows. Use Developer Mode.
