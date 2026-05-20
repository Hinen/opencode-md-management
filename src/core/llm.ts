export type LlmProposalRequest = {
  canonicalPath: string;
  canonicalContent: string;
  notes: string;
  promptInjectionGuard: boolean;
};

export type LlmProposalResult = {
  after: string;
  summary?: string;
};

export interface LlmProvider {
  proposeRevision(request: LlmProposalRequest): Promise<LlmProposalResult>;
}

export class MockLlmProvider implements LlmProvider {
  async proposeRevision(request: LlmProposalRequest): Promise<LlmProposalResult> {
    const notes = request.promptInjectionGuard ? wrapUntrustedNotes(request.notes) : request.notes;
    const separator = request.canonicalContent.endsWith("\n") ? "" : "\n";

    return {
      after: `${request.canonicalContent}${separator}\n## Proposed Instruction Update\n\n${notes}\n`,
      summary: "Mock proposal generated from notes"
    };
  }
}

export function assertSafeProposalOutput(output: string): void {
  if (output.length === 0)
    throw new Error("LLM proposal output is empty");

  if (output.includes("\0"))
    throw new Error("LLM proposal output contains invalid characters");
}

function wrapUntrustedNotes(notes: string): string {
  return [
    "<!-- agent-md: untrusted notes begin -->",
    notes,
    "<!-- agent-md: untrusted notes end -->"
  ].join("\n");
}
