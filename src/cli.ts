#!/usr/bin/env node

import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runAliases } from "./commands/aliases.js";
import { runAuditReport } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runLearn } from "./commands/learn.js";
import { runProposalApprove, runProposalGc, runProposalList, runProposalReject, runProposalShow } from "./commands/proposal.js";
import { runRevise } from "./commands/revise.js";
import { runReview } from "./commands/review.js";
import { runSync } from "./commands/sync.js";
import { ProposalNotFoundError } from "./core/proposals.js";
import type { InitModel } from "./commands/init.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("opencode-md-management")
    .description("Manage AI instruction markdown files for OpenCode")
    .version("0.1.0");

  program.command("init")
    .description("Create .agent-md.json, ensure the primary instruction file exists, and materialize symlink aliases")
    .option("--model <model>", "primary instruction model/tool (opencode|claude|gemini|codex|copilot)")
    .option("--alias <model...>", "model whose file to create as a symlink alias to the primary (repeatable)")
    .option("--scope <scope>", "scope to initialize (project|local|global:claude|global:opencode|global:codex)")
    .option("--adopt", "adopt an existing primary file without rewriting it")
    .action(async (options: { model?: string; alias?: string[]; scope?: string; adopt?: boolean }) => {
      console.log(await runInit(process.cwd(), {
        model: parseInitModelOption(options.model),
        aliases: parseAliasModelsOption(options.alias),
        scope: options.scope,
        adopt: options.adopt
      }));
    });

  program.command("doctor")
    .description("Inspect configured instruction files")
    .option("--scope <scope>", "scope to inspect (project|all|global|local|nested id)")
    .action(async (options: { scope?: string }) => {
      console.log(await runDoctor(process.cwd(), options));
    });

  program.command("audit")
    .description("Audit the canonical instruction markdown file")
    .option("--scope <scope>", "scope to audit (project|all|global|local|nested id)")
    .action(async (options: { scope?: string }) => {
      const report = await runAuditReport(process.cwd(), options);

      console.log(report.output);

      if (report.hasErrors)
        process.exitCode = 1;
    });

  program.command("sync")
    .description("Repair drifted symlink aliases against the canonical instruction file")
    .option("--apply", "repair drifted aliases")
    .option("--force", "overwrite alias paths even when they are regular files")
    .option("--target <path>", "limit repair to one alias")
    .option("--scope <scope>", "scope to sync (project|global|local|nested id)")
    .action(async (options: { apply?: boolean; force?: boolean; target?: string; scope?: string }) => {
      console.log(await runSync(process.cwd(), options));
    });

  program.command("aliases")
    .description("Add or remove symlink aliases for the primary instruction file")
    .option("--add <model...>", "model whose file to add as an alias (opencode|claude|gemini|codex|copilot)")
    .option("--remove <model...>", "model whose alias to remove (opencode|claude|gemini|codex|copilot)")
    .option("--scope <scope>", "scope for aliases (MVP supports project only)")
    .action(async (options: { add?: string[]; remove?: string[]; scope?: string }) => {
      console.log(await runAliases(process.cwd(), {
        add: parseAliasModelsOption(options.add),
        remove: parseAliasModelsOption(options.remove),
        scope: options.scope
      }));
    });

  program.command("revise")
    .description("Create a canonical revision proposal from notes")
    .requiredOption("--notes <text>", "notes for the revision proposal")
    .option("--scope <scope>", "scope for revise (MVP supports project only)")
    .action(async (options: { notes: string; scope?: string }) => {
      console.log(await runRevise(process.cwd(), options));
    });

  program.command("learn")
    .description("Create a canonical proposal from explicit learning notes")
    .option("--notes <text>", "learning notes")
    .option("--notes-file <path>", "file containing learning notes")
    .option("--scope <scope>", "scope for learn (MVP supports project only)")
    .action(async (options: { notes?: string; notesFile?: string; scope?: string }) => {
      console.log(await runLearn(process.cwd(), options));
    });

  program.command("review")
    .description("Review instruction markdown quality and create an improvement proposal")
    .option("--scope <scope>", "scope to review (MVP supports project only)")
    .option("--notes <text>", "additional review focus")
    .action(async (options: { scope?: string; notes?: string }) => {
      console.log(await runReview(process.cwd(), options));
    });

  program.command("proposal:show")
    .description("Show a stored proposal diff")
    .argument("[selection]", "instruction update number from proposal:list, or proposal id; uses the only pending update if omitted")
    .action(async (selection: string | undefined) => {
      console.log(await runProposalShow(process.cwd(), selection));
    });

  program.command("proposal:list")
    .description("List stored proposals")
    .option("--status <status>", "filter by status (pending|approved|stale|rejected)")
    .option("--json", "output JSON array")
    .action(async (options: { status?: string; json?: boolean }) => {
      console.log(await runProposalList(process.cwd(), options));
    });

  program.command("proposal:approve")
    .description("Approve a stored proposal; repairs symlink aliases if any drifted")
    .argument("[selection]", "instruction update number from proposal:list, or proposal id; uses the only pending update if omitted")
    .action(async (selection: string | undefined) => {
      console.log(await runProposalApprove(process.cwd(), selection));
    });

  program.command("proposal:reject")
    .description("Reject a stored proposal")
    .argument("[selection]", "instruction update number from proposal:list, or proposal id; uses the only pending update if omitted")
    .option("--reason <text>", "human-readable rejection reason")
    .action(async (selection: string | undefined, options: { reason?: string }) => {
      console.log(await runProposalReject(process.cwd(), selection, options));
    });

  program.command("proposal:gc")
    .description("Delete non-pending proposals older than a cutoff")
    .option("--older-than-days <n>", "age cutoff in days", parseIntegerOption, 30)
    .option("--status <list>", "comma-separated statuses (approved,stale,rejected)")
    .action(async (options: { olderThanDays?: number; status?: string }) => {
      console.log(await runProposalGc(process.cwd(), options));
    });

  return program;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createProgram()
    .parseAsync(process.argv)
    .catch((error: unknown) => {
      if (error instanceof ProposalNotFoundError) {
        console.error(`error: ${error.message}`);
        process.exit(1);
      }

      if (error instanceof Error) {
        console.error(`error: ${error.message}`);
        process.exit(1);
      }

      console.error(`error: ${String(error)}`);
      process.exit(1);
    });
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed))
    throw new Error(`Invalid number: ${value}`);

  return parsed;
}

function parseInitModelOption(value: string | undefined): InitModel | undefined {
  if (value === undefined)
    return undefined;

  if (value === "opencode" || value === "claude" || value === "gemini" || value === "codex" || value === "copilot")
    return value;

  throw new Error(`Invalid model: ${value}`);
}

function parseAliasModelsOption(value: string[] | undefined): InitModel[] | undefined {
  if (value === undefined)
    return undefined;

  return value.map((item) => parseRequiredInitModelOption(item));
}

function parseRequiredInitModelOption(value: string): InitModel {
  const model = parseInitModelOption(value);

  if (model === undefined)
    throw new Error(`Invalid model: ${value}`);

  return model;
}
