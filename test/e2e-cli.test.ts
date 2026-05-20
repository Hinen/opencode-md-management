import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runProposalApprove, runProposalShow } from "../src/commands/proposal.js";
import { runRevise } from "../src/commands/revise.js";
import { runSync } from "../src/commands/sync.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

function proposalId(output: string): string {
  const match = output.match(/Proposal ([a-zA-Z0-9-]+)/);

  if (!match)
    throw new Error(`Proposal id not found in output: ${output}`);

  return match[1];
}

describe("CLI workflow handlers", () => {
  it("creates, shows, and approves a revise proposal", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    const revise = await runRevise(root, { notes: "Always run npm test" });
    const id = proposalId(revise);
    const show = await runProposalShow(root, id);

    expect(show).toContain("+Always run npm test");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");

    await runProposalApprove(root, id);

    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("Always run npm test");
  });

  it("rejects unknown sync targets", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await expect(runSync(root, { target: "NOPE.md" })).rejects.toThrow(/Unknown target/);
  });
});
