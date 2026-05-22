import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeProposalOutput, type LlmProvider } from "../src/core/llm.js";
import { runRevise } from "../src/commands/revise.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

async function createConfiguredRoot(): Promise<string> {
  const root = await createTempRoot();

  await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
  await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

  return root;
}

describe("runRevise", () => {
  it("creates a proposal without writing canonical", async () => {
    const root = await createConfiguredRoot();
    const output = await runRevise(root, { notes: "Add test rules" });

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("Run /omm:proposal-approve");
    expect(output).toContain("+Add test rules");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");
  });

  it("creates a proposal from agent-authored canonical content", async () => {
    const root = await createConfiguredRoot();
    const output = await runRevise(root, {
      notes: "Prefer small diffs",
      after: "# Rules\n\n- Prefer small diffs\n"
    });

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("+- Prefer small diffs");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");
  });

  it("rejects disabled llm proposals", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], llm: { enabled: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    await expect(runRevise(root, { notes: "Add rules" })).rejects.toThrow(/disabled/);
  });

  it("rejects invalid provider output", async () => {
    const root = await createConfiguredRoot();
    const provider: LlmProvider = {
      async proposeRevision() {
        return { after: "bad\0output" };
      }
    };

    await expect(runRevise(root, { notes: "Add rules", provider })).rejects.toThrow(/invalid/);
  });

  it("rejects non-project scopes in MVP", async () => {
    const root = await createConfiguredRoot();

    await expect(runRevise(root, { notes: "Add rules", scope: "global:claude" })).rejects.toThrow(/project-only/);
  });

  it("uses the command kind in non-project scope errors", async () => {
    const root = await createConfiguredRoot();

    await expect(runRevise(root, { notes: "Add rules", scope: "global:claude", kind: "learn" })).rejects.toThrow(/learn is project-only/);
  });
});

describe("assertSafeProposalOutput", () => {
  it("rejects empty output", () => {
    expect(() => assertSafeProposalOutput("")).toThrow(/empty/);
  });
});
