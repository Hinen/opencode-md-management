import { tool, type Plugin } from "@opencode-ai/plugin";
import { runAudit } from "./commands/audit.js";
import { runDoctor } from "./commands/doctor.js";
import { runInit } from "./commands/init.js";
import { runLearn } from "./commands/learn.js";
import { runProposalApprove, runProposalGc, runProposalList, runProposalReject, runProposalShow } from "./commands/proposal.js";
import { runRevise } from "./commands/revise.js";
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
        status: tool.schema.string().optional().describe("Filter by status: pending|approved|stale|rejected.")
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
