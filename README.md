# opencode-md-management

Manage AI instruction markdown files for OpenCode.

`opencode-md-management` keeps `AGENTS.md` as the default canonical instruction file and manages target files such as `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, and `.github/copilot-instructions.md` with explicit, one-way sync. It focuses on closing OpenCode-native instruction markdown lifecycle gaps, not broad parity with other tools.

## What it does

- OpenCode slash commands expose the management surface: `/agent-md:init`, `/agent-md:doctor`, `/agent-md:audit`, `/agent-md:sync`, `/agent-md:sync-apply`, `/agent-md:revise`, `/agent-md:learn`, `/agent-md:proposals`, `/agent-md:proposal-show`, `/agent-md:proposal-approve`, `/agent-md:proposal-reject`, and `/agent-md:proposal-gc`.
- Plugin tools remain available as the execution surface behind those commands: `agent_md_init`, `agent_md_doctor`, `agent_md_audit`, `agent_md_sync`, `agent_md_revise`, `agent_md_learn`, `agent_md_proposal_list`, `agent_md_proposal_show`, `agent_md_proposal_approve`, `agent_md_proposal_reject`, and `agent_md_proposal_gc`.
- `init` creates `.agent-md.json` without touching markdown files.
- `doctor` reports canonical, manifest, and target file status.
- `audit` scores the canonical markdown against command/workflow coverage, architecture clarity, non-obvious patterns, conciseness, currency, and actionability, then checks for duplicate headings, vague instructions, long sections, and secret-like values. Secret-like findings make the CLI exit non-zero.
- `sync` previews canonical-to-target changes by default and writes only with `--apply`.
- `revise` and `learn` create canonical update proposals. Through `/agent-md:revise` and `/agent-md:learn`, the OpenCode agent can inspect the canonical markdown and submit a full improved version as a reviewable proposal instead of appending raw notes. They do not write markdown files directly.
- Proposal lifecycle commands list, show, approve, reject, and garbage-collect stored proposals. `proposal:approve` writes only the canonical file when the proposal is not stale. Target files are updated separately with `sync --apply`.

## Non-goals

- No automatic bidirectional merge.
- No automatic overwrite of existing target files.
- No model-specific dialect rewriting.
- No automatic session learning append.
- No drift watcher, session mining, or TUI toast integration in this release.

## Install

```bash
npm install
npm run build
```

## Usage

Inside OpenCode, install the package as a plugin and use the `/agent-md:*` slash commands when managing instruction files.

```json
{
  "plugin": ["opencode-md-management"]
}
```

The slash command surface is:

```text
/agent-md:init
/agent-md:doctor
/agent-md:audit
/agent-md:sync
/agent-md:sync-apply [--force] [target]
/agent-md:revise Add migration troubleshooting rules
/agent-md:learn --notes-file ./session-notes.md
/agent-md:proposals [pending|approved|stale|rejected]
/agent-md:proposal-show <id>
/agent-md:proposal-approve <id>
/agent-md:proposal-reject <id> [reason]
/agent-md:proposal-gc [--older-than-days 30] [--status approved,stale,rejected]
```

The same functionality is also available as a standalone CLI:

```bash
npx opencode-md-management init --model claude --mirror opencode gemini
npx opencode-md-management doctor
npx opencode-md-management audit
npx opencode-md-management sync
npx opencode-md-management sync --apply
npx opencode-md-management revise --notes "Add migration troubleshooting rules"
npx opencode-md-management learn --notes-file ./session-notes.md
npx opencode-md-management proposal:list
npx opencode-md-management proposal:list --status pending
npx opencode-md-management proposal:list --json
npx opencode-md-management proposal:show <id>
npx opencode-md-management proposal:approve <id>
npx opencode-md-management proposal:reject <id> --reason "obsolete"
npx opencode-md-management proposal:gc --older-than-days 30 --status approved,stale,rejected
```

## Proposal lifecycle

| CLI | Plugin tool |
|-----|-------------|
| `proposal:list [--status pending\|approved\|stale\|rejected] [--json]` | `agent_md_proposal_list` |
| `proposal:show <id>` | `agent_md_proposal_show` |
| `proposal:approve <id>` | `agent_md_proposal_approve` |
| `proposal:reject <id> [--reason <text>]` | `agent_md_proposal_reject` |
| `proposal:gc [--older-than-days <n>] [--status approved,stale,rejected]` | `agent_md_proposal_gc` |

`proposal:list` prints one tab-delimited proposal per line: `id`, `status`, `createdAt`, `source.kind`, and `canonicalPath`. `proposal:list --json` and plugin `json: true` emit a pretty-printed JSON array with `id`, `status`, `createdAt`, `source.kind`, optional `source.summary`, and `canonicalPath`; empty results are `[]`. Missing proposal ids are reported as clean CLI errors with a non-zero exit code. `proposal:gc` refuses to delete `pending` proposals; by default it deletes `approved`, `stale`, and `rejected` proposals older than 30 days.

## Configuration

`.agent-md.json`:

`/agent-md:init` asks which primary instruction model/tool to use, then selects the matching canonical file: `opencode` → `AGENTS.md`, `claude` → `CLAUDE.md`, `gemini` → `GEMINI.md`, `codex` → `.codex/AGENTS.md`, or `copilot` → `.github/copilot-instructions.md`. It then asks which remaining models/tools should be enabled as mirror targets. Choosing no mirror targets manages only the primary file. The standalone CLI accepts the primary choice with `--model` and mirror targets with `--mirror <model...>`. If multiple existing instruction files have different content and no model is supplied, init refuses to guess and asks for an explicit model.

```json
{
  "canonical": "CLAUDE.md",
  "targets": [
    { "path": "AGENTS.md", "mode": "mirror", "enabled": true },
    { "path": "GEMINI.md", "mode": "mirror", "enabled": true },
    { "path": ".codex/AGENTS.md", "mode": "mirror", "enabled": false },
    { "path": ".github/copilot-instructions.md", "mode": "mirror", "enabled": false }
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

## Intelligent revision flow

Slash commands use the active OpenCode agent as the improvement engine: the agent reads the canonical instruction markdown, integrates the requested revision or learning notes, and calls the plugin tool with the full improved canonical content. The tool stores that content as a proposal for review; it does not write markdown directly.

The standalone CLI still uses `MockLlmProvider`. It makes no external network calls. `llm.enabled` selects the provider abstraction, and `llm.promptInjectionGuard` wraps user notes in HTML comment delimiters before they are concatenated to the canonical content.

The guard is structural delimiter wrapping only. It does not sanitize, strip, or semantically validate note content, and `MockLlmProvider` appends the wrapped notes verbatim to the canonical document. Treat proposal `after` content as user-supplied until a real provider with output validation is added.

## learn --notes-file policy

`--notes-file` is resolved relative to the current worktree. Absolute paths and paths that escape the worktree via `..` are rejected before any read because the path is routed through `resolveInsideRoot`.

## Safety model

Sync is canonical-to-target only. Existing target files that drift from the last synced hash are blocked unless `--force` is passed. Dry-run is the default.

`revise` and `learn` store proposals under `.agent-md/proposals/` and return a unified diff for review. `proposal:approve` re-reads the canonical file and rejects stale proposals when the canonical hash changed after proposal creation. Approval updates only the canonical file; run `sync --apply` separately to update target files.

Proposal inventory is fail-closed for valid proposal ids: non-JSON files and invalid-id filenames are ignored, but corrupt JSON or schema-invalid files with valid proposal ids raise an error instead of silently disappearing from lists.

Slash command arguments are prompt input to the agent, not a security boundary. The command templates instruct the agent to treat arguments as untrusted data and to call only the named tool, but review write-capable command output before relying on it.

## Plugin hook surface

`@opencode-ai/plugin@1.15.5` exposes the `config` hook used to register `/agent-md:*` commands in `config.command`, plus the `tool` surface used to execute the underlying operations. This release does not ship a drift watcher, session mining, or TUI toast integration.

## Deferred

- No automatic session mining.
- No TUI toast integration.
- No drift watcher.
- No model-specific dialect rewriting.
- No section-level structured editing.
