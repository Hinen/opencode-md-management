import { tool, type Config, type Plugin } from "@opencode-ai/plugin";
import { runAudit } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runLearn } from "./commands/learn.js";
import { runProposalApprove, runProposalGc, runProposalList, runProposalReject, runProposalShow } from "./commands/proposal.js";
import { runRevise } from "./commands/revise.js";
import { runSync } from "./commands/sync.js";

type OpenCodeCommand = {
  name: string;
  description: string;
  template: string;
};

type CommandConfig = Config & {
  command?: Record<string, OpenCodeCommand>;
};

const commandPrefix = "agent-md";

const commandInstructionPrefix = `You are using opencode-md-management.
Do not edit AI instruction markdown files directly.
Use the matching agent_md_* plugin tool and report the tool output.`;

const pluginCommands: Record<string, OpenCodeCommand> = {
  [`${commandPrefix}:init`]: createCommand(
    `${commandPrefix}:init`,
    "Create .agent-md.json without modifying markdown files.",
    "Call agent_md_init with no arguments."
  ),
  [`${commandPrefix}:doctor`]: createCommand(
    `${commandPrefix}:doctor`,
    "Inspect canonical, manifest, and target AI instruction file status.",
    "Call agent_md_doctor with no arguments."
  ),
  [`${commandPrefix}:audit`]: createCommand(
    `${commandPrefix}:audit`,
    "Audit the canonical AI instruction markdown file.",
    "Call agent_md_audit with no arguments."
  ),
  [`${commandPrefix}:sync`]: createCommand(
    `${commandPrefix}:sync`,
    "Preview canonical-to-target sync changes.",
    `Call agent_md_sync with apply=false.
If the user supplied a target in <arguments>, pass it as target.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:sync-apply`]: createCommand(
    `${commandPrefix}:sync-apply`,
    "Apply canonical-to-target sync changes after explicit user intent.",
    `Call agent_md_sync with apply=true.
If the user supplied --force in <arguments>, pass force=true.
If the user supplied a target path in <arguments>, pass it as target.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:revise`]: createCommand(
    `${commandPrefix}:revise`,
    "Create a canonical revision proposal from notes.",
    `If <arguments> is empty, ask the user for revision notes.
Otherwise call agent_md_revise with notes set to the full <arguments> text.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:learn`]: createCommand(
    `${commandPrefix}:learn`,
    "Create a canonical proposal from explicit learning notes.",
    `If <arguments> is empty, ask the user for learning notes.
If <arguments> contains --notes-file, call agent_md_learn with notesFile set to that path.
Otherwise call agent_md_learn with notes set to the full <arguments> text.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:proposals`]: createCommand(
    `${commandPrefix}:proposals`,
    "List stored AI instruction markdown proposals.",
    `Call agent_md_proposal_list.
If <arguments> contains a status, pass it as status.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:proposal-show`]: createCommand(
    `${commandPrefix}:proposal-show`,
    "Show a stored AI instruction markdown proposal diff.",
    `Call agent_md_proposal_show with id from <arguments>.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:proposal-approve`]: createCommand(
    `${commandPrefix}:proposal-approve`,
    "Approve a stored proposal and update only the canonical file.",
    `Call agent_md_proposal_approve with id from <arguments>.
After approval, remind the user that targets are updated separately with /agent-md:sync-apply.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:proposal-reject`]: createCommand(
    `${commandPrefix}:proposal-reject`,
    "Reject a stored AI instruction markdown proposal.",
    `Call agent_md_proposal_reject with id from <arguments>.
If a reason is supplied, pass it as reason.
<arguments>
$ARGUMENTS
</arguments>`
  ),
  [`${commandPrefix}:proposal-gc`]: createCommand(
    `${commandPrefix}:proposal-gc`,
    "Delete old non-pending AI instruction markdown proposals.",
    `Call agent_md_proposal_gc.
If <arguments> contains --older-than-days, pass olderThanDays.
If <arguments> contains --status, pass status.
<arguments>
$ARGUMENTS
</arguments>`
  )
};

export const OpencodeMdManagement: Plugin = async () => ({
  async config(config: Config) {
    const commandConfig = config as CommandConfig;

    commandConfig.command = {
      ...pluginCommands,
      ...commandConfig.command
    };
  },

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
    }),

    agent_md_revise: tool({
      description: "Create a canonical AI instruction markdown revision proposal without writing files.",
      args: {
        notes: tool.schema.string().describe("Notes or request to use for the revision proposal.")
      },
      async execute(args, context) {
        return runRevise(context.worktree, args);
      }
    }),

    agent_md_learn: tool({
      description: "Create a canonical AI instruction markdown proposal from explicit learning notes.",
      args: {
        notes: tool.schema.string().optional().describe("Learning notes to propose for canonical instructions."),
        notesFile: tool.schema.string().optional().describe("Path to a notes file to use as learning input.")
      },
      async execute(args, context) {
        return runLearn(context.worktree, args);
      }
    }),

    agent_md_proposal_show: tool({
      description: "Show a stored AI instruction markdown proposal diff.",
      args: {
        id: tool.schema.string().describe("Proposal id.")
      },
      async execute(args, context) {
        return runProposalShow(context.worktree, args.id);
      }
    }),

    agent_md_proposal_list: tool({
      description: "List stored AI instruction markdown proposals.",
      args: {
        status: tool.schema.string().optional().describe("Filter by status: pending|approved|stale|rejected."),
        json: tool.schema.boolean().optional().describe("Return a JSON array instead of tab-delimited text.")
      },
      async execute(args, context) {
        return runProposalList(context.worktree, args);
      }
    }),

    agent_md_proposal_approve: tool({
      description: "Approve a stored proposal and update the canonical file if it is not stale.",
      args: {
        id: tool.schema.string().describe("Proposal id.")
      },
      async execute(args, context) {
        return runProposalApprove(context.worktree, args.id);
      }
    }),

    agent_md_proposal_reject: tool({
      description: "Reject a stored AI instruction markdown proposal.",
      args: {
        id: tool.schema.string().describe("Proposal id."),
        reason: tool.schema.string().optional().describe("Human-readable rejection reason.")
      },
      async execute(args, context) {
        return runProposalReject(context.worktree, args.id, { reason: args.reason });
      }
    }),

    agent_md_proposal_gc: tool({
      description: "Delete non-pending AI instruction markdown proposals older than a cutoff.",
      args: {
        olderThanDays: tool.schema.number().optional().describe("Age cutoff in days (default 30)."),
        status: tool.schema.string().optional().describe("Comma-separated statuses (approved,stale,rejected).")
      },
      async execute(args, context) {
        return runProposalGc(context.worktree, args);
      }
    })
  }
});

export default OpencodeMdManagement;

function createCommand(name: string, description: string, instruction: string): OpenCodeCommand {
  return {
    name,
    description,
    template: `<command-instruction>
${commandInstructionPrefix}

${instruction}
</command-instruction>`
  };
}
