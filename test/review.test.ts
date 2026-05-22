import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runReview } from "../src/commands/review.js";
import { runProposalList } from "../src/commands/proposal.js";
import type { LlmProvider } from "../src/core/llm.js";

async function createConfiguredRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opencode-md-management-"));

  await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
  await writeFile(join(root, "AGENTS.md"), "# Rules\n- Maybe run tests later.\n", "utf8");

  return root;
}

describe("runReview", () => {
  it("creates a proposal from audit review context", async () => {
    const root = await createConfiguredRoot();
    const output = await runReview(root);

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("+Review and improve this AI instruction markdown file.");
    expect(output).toContain("vague-instruction");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n- Maybe run tests later.\n");

    const list = await runProposalList(root);

    expect(list).toContain("request: Review instruction markdown quality");
    expect(list).not.toContain("request: Review and improve this AI instruction markdown file.\n");
  });

  it("passes additional review focus to the proposal provider", async () => {
    const root = await createConfiguredRoot();
    const provider: LlmProvider = {
      async proposeRevision(request) {
        return { after: `${request.canonicalContent}\n${request.notes}\n` };
      }
    };
    const output = await runReview(root, { notes: "Focus on command accuracy.", provider });

    expect(output).toContain("+Additional review notes:");
    expect(output).toContain("+Focus on command accuracy.");
  });

  it("rejects non-project scopes in MVP", async () => {
    const root = await createConfiguredRoot();

    await expect(runReview(root, { scope: "global:claude" })).rejects.toThrow(/project-only/);
  });
});
