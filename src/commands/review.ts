import { runAuditReport } from "./audit.js";
import { runRevise } from "./revise.js";
import type { LlmProvider } from "../core/llm.js";
import type { ScopeSelection } from "../core/scope-context.js";

export type ReviewCommandOptions = {
  scope?: ScopeSelection;
  notes?: string;
  provider?: LlmProvider;
};

export async function runReview(root: string, options: ReviewCommandOptions = {}): Promise<string> {
  if (options.scope && options.scope !== "project")
    throw new Error("review is project-only in MVP; use --scope project or omit --scope.");

  const audit = await runAuditReport(root, { scope: options.scope });
  const notes = [
    "Review and improve this AI instruction markdown file.",
    "",
    "Focus on:",
    "- missing project-specific commands or workflows",
    "- duplicate or stale guidance",
    "- vague or unactionable rules",
    "- guidance that appears inconsistent with the current repository",
    "",
    "Current audit output:",
    audit.output,
    options.notes ? "" : undefined,
    options.notes ? "Additional review notes:" : undefined,
    options.notes
  ].filter((line): line is string => line !== undefined).join("\n");

  return runRevise(root, {
    notes,
    summary: "Review instruction markdown quality",
    provider: options.provider,
    kind: "revise",
    scope: options.scope
  });
}
