import { Command } from "commander";
import { runAudit } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
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

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`)
  createProgram().parse(process.argv);
