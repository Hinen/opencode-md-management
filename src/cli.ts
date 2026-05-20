#!/usr/bin/env node

import { Command } from "commander";
import { fileURLToPath } from "node:url";
import { runAudit } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runLearn } from "./commands/learn.js";
import { runProposalApprove, runProposalShow } from "./commands/proposal.js";
import { runRevise } from "./commands/revise.js";
import { runSync } from "./commands/sync.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("opencode-md-management")
    .description("Manage AI instruction markdown files for OpenCode")
    .version("0.1.0");

  program.command("init")
    .description("Create .agent-md.json without modifying markdown files")
    .action(async () => {
      console.log(await runInit(process.cwd()));
    });

  program.command("doctor")
    .description("Inspect configured instruction files")
    .action(async () => {
      console.log(await runDoctor(process.cwd()));
    });

  program.command("audit")
    .description("Audit the canonical instruction markdown file")
    .action(async () => {
      console.log(await runAudit(process.cwd()));
    });

  program.command("sync")
    .description("Preview or apply canonical-to-target sync")
    .option("--apply", "write target files")
    .option("--force", "overwrite drifted target files")
    .option("--target <path>", "sync one target")
    .action(async (options: { apply?: boolean; force?: boolean; target?: string }) => {
      console.log(await runSync(process.cwd(), options));
    });

  program.command("revise")
    .description("Create a canonical revision proposal from notes")
    .requiredOption("--notes <text>", "notes for the revision proposal")
    .action(async (options: { notes: string }) => {
      console.log(await runRevise(process.cwd(), options));
    });

  program.command("learn")
    .description("Create a canonical proposal from explicit learning notes")
    .option("--notes <text>", "learning notes")
    .option("--notes-file <path>", "file containing learning notes")
    .action(async (options: { notes?: string; notesFile?: string }) => {
      console.log(await runLearn(process.cwd(), options));
    });

  program.command("proposal:show")
    .description("Show a stored proposal diff")
    .argument("<id>", "proposal id")
    .action(async (id: string) => {
      console.log(await runProposalShow(process.cwd(), id));
    });

  program.command("proposal:approve")
    .description("Approve a stored proposal and write the canonical file")
    .argument("<id>", "proposal id")
    .action(async (id: string) => {
      console.log(await runProposalApprove(process.cwd(), id));
    });

  return program;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  createProgram().parse(process.argv);
