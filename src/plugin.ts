import { tool, type Plugin } from "@opencode-ai/plugin";
import { runAudit } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runSync } from "./commands/sync.js";

export const OpencodeMdManagement: Plugin = async () => ({
  tool: {
    agent_md_init: tool({
      description: "Create .agent-md.json for managing AI instruction markdown files without editing markdown files.",
      args: {},
      async execute(_, context) {
        return runInit(context.worktree);
      }
    }),

    agent_md_doctor: tool({
      description: "Inspect canonical and target AI instruction markdown file status.",
      args: {},
      async execute(_, context) {
        return runDoctor(context.worktree);
      }
    }),

    agent_md_audit: tool({
      description: "Audit the canonical AI instruction markdown file for management issues.",
      args: {},
      async execute(_, context) {
        return runAudit(context.worktree);
      }
    }),

    agent_md_sync: tool({
      description: "Preview or apply canonical-to-target AI instruction markdown sync.",
      args: {
        apply: tool.schema.boolean().optional().describe("Write target files instead of previewing diffs."),
        force: tool.schema.boolean().optional().describe("Overwrite drifted target files."),
        target: tool.schema.string().optional().describe("Limit sync to one target path.")
      },
      async execute(args, context) {
        return runSync(context.worktree, args);
      }
    })
  }
});

export default OpencodeMdManagement;
