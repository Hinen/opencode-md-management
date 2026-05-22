#!/usr/bin/env node

import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runAuditReport } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runLearn } from "./commands/learn.js";
import { runMirrors } from "./commands/mirrors.js";
import { runProposalApprove, runProposalGc, runProposalList, runProposalReject, runProposalShow } from "./commands/proposal.js";
import { runRevise } from "./commands/revise.js";
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
    .description("Create .agent-md.json without modifying markdown files")
    .option("--model <model>", "primary instruction model/tool (opencode|claude|gemini|codex|copilot)")
    .option("--mirror <model...>", "mirror target model/tool to enable (opencode|claude|gemini|codex|copilot)")
    .option("--scope <scope>", "scope to initialize (project|local|global:claude|global:opencode|global:codex)")
    .option("--adopt", "adopt an existing primary file without rewriting it")
    .action(async (options: { model?: string; mirror?: string[]; scope?: string; adopt?: boolean }) => {
      console.log(await runInit(process.cwd(), {
        model: parseInitModelOption(options.model),
        mirrors: parseInitMirrorOption(options.mirror),
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
    .description("Preview or apply canonical-to-target sync")
    .option("--apply", "write target files")
    .option("--force", "overwrite drifted target files")
    .option("--target <path>", "sync one target")
    .option("--scope <scope>", "scope to sync (project|global|local|nested id)")
    .action(async (options: { apply?: boolean; force?: boolean; target?: string; scope?: string }) => {
      console.log(await runSync(process.cwd(), options));
    });

  program.command("mirrors")
    .description("Enable or disable project mirror targets")
    .option("--enable <model...>", "mirror target model/tool to enable (opencode|claude|gemini|codex|copilot)")
    .option("--disable <model...>", "mirror target model/tool to disable (opencode|claude|gemini|codex|copilot)")
    .option("--scope <scope>", "scope for mirrors (MVP supports project only)")
    .action(async (options: { enable?: string[]; disable?: string[]; scope?: string }) => {
      console.log(await runMirrors(process.cwd(), {
        enable: parseInitMirrorOption(options.enable),
        disable: parseInitMirrorOption(options.disable),
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

  program.command("proposal:show")
    .description("Show a stored proposal diff")
    .argument("<id>", "proposal id")
    .action(async (id: string) => {
      console.log(await runProposalShow(process.cwd(), id));
    });

  program.command("proposal:list")
    .description("List stored proposals")
    .option("--status <status>", "filter by status (pending|approved|stale|rejected)")
    .option("--json", "output JSON array")
    .action(async (options: { status?: string; json?: boolean }) => {
      console.log(await runProposalList(process.cwd(), options));
    });

  program.command("proposal:approve")
    .description("Approve a stored proposal and write the canonical file")
    .argument("<id>", "proposal id")
    .action(async (id: string) => {
      console.log(await runProposalApprove(process.cwd(), id));
    });

  program.command("proposal:reject")
    .description("Reject a stored proposal")
    .argument("<id>", "proposal id")
    .option("--reason <text>", "human-readable rejection reason")
    .action(async (id: string, options: { reason?: string }) => {
      console.log(await runProposalReject(process.cwd(), id, options));
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

function parseInitMirrorOption(value: string[] | undefined): InitModel[] | undefined {
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
