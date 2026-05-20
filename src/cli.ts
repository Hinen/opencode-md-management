import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("opencode-md-management")
    .description("Manage AI instruction markdown files for OpenCode")
    .version("0.1.0");

  program.command("doctor")
    .description("Inspect configured instruction files")
    .action(() => {
      console.log("opencode-md-management doctor");
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`)
  createProgram().parse(process.argv);
