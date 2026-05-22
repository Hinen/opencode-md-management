import { loadConfig } from "../core/config.js";
import { resolveCanonical } from "../core/canonical.js";
import { assertSafeProposalOutput, MockLlmProvider, type LlmProvider } from "../core/llm.js";
import { createProposal, renderProposalForReview } from "../core/proposals.js";

export type ReviseCommandOptions = {
  notes: string;
  after?: string;
  provider?: LlmProvider;
  kind?: "revise" | "learn";
  scope?: string;
};

export async function runRevise(root: string, options: ReviseCommandOptions): Promise<string> {
  if (options.scope && options.scope !== "project") {
    const command = options.kind ?? "revise";

    throw new Error(`${command} is project-only in MVP; use --scope project or omit --scope.`);
  }

  const config = await loadConfig(root);

  if (!config.llm.enabled)
    throw new Error("LLM proposals are disabled in .agent-md.json");

  const canonical = await resolveCanonical(root, config);
  const result = options.after === undefined
    ? await (options.provider ?? new MockLlmProvider()).proposeRevision({
      canonicalPath: canonical.path,
      canonicalContent: canonical.content,
      notes: options.notes,
      promptInjectionGuard: config.llm.promptInjectionGuard
    })
    : {
      after: options.after,
      summary: options.notes
    };

  assertSafeProposalOutput(result.after);

  const proposal = await createProposal(root, {
    source: { kind: options.kind ?? "revise", summary: options.notes },
    canonical,
    after: result.after
  });

  return renderProposalForReview(proposal);
}
