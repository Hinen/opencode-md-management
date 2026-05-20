import { loadConfig } from "../core/config.js";
import { resolveCanonical } from "../core/canonical.js";
import { assertSafeProposalOutput, MockLlmProvider, type LlmProvider } from "../core/llm.js";
import { createProposal, renderProposalForReview } from "../core/proposals.js";

export type ReviseCommandOptions = {
  notes: string;
  provider?: LlmProvider;
  kind?: "revise" | "learn";
};

export async function runRevise(root: string, options: ReviseCommandOptions): Promise<string> {
  const config = await loadConfig(root);

  if (!config.llm.enabled)
    throw new Error("LLM proposals are disabled in .agent-md.json");

  const canonical = await resolveCanonical(root, config);
  const provider = options.provider ?? new MockLlmProvider();
  const result = await provider.proposeRevision({
    canonicalPath: canonical.path,
    canonicalContent: canonical.content,
    notes: options.notes,
    promptInjectionGuard: config.llm.promptInjectionGuard
  });

  assertSafeProposalOutput(result.after);

  const proposal = await createProposal(root, {
    source: { kind: options.kind ?? "revise", summary: result.summary },
    canonical,
    after: result.after
  });

  return renderProposalForReview(proposal);
}
