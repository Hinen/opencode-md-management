# opencode-md-management

Manage AI instruction markdown files for OpenCode.

`opencode-md-management` keeps `AGENTS.md` as the default canonical instruction file and manages target files such as `CLAUDE.md`, `GEMINI.md`, `.codex/AGENTS.md`, and `.github/copilot-instructions.md` with explicit, one-way sync.

## What it does

- `init` creates `.agent-md.json` without touching markdown files.
- `doctor` reports canonical and target file status.
- `audit` checks the canonical markdown for duplicate headings, vague instructions, long sections, and secret-like values.
- `sync` previews canonical-to-target changes by default and writes only with `--apply`.

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

```bash
npx opencode-md-management init
npx opencode-md-management doctor
npx opencode-md-management audit
npx opencode-md-management sync
npx opencode-md-management sync --apply
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
  }
}
```

## Safety model

Sync is canonical-to-target only. Existing target files that drift from the last synced hash are blocked unless `--force` is passed. Dry-run is the default.
