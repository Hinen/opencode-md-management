import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpencodeMdManagement } from "../src/plugin.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("plugin tools", () => {
  it("executes revise through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    const output = await hooks.tool!.agent_md_revise.execute({ notes: "Prefer small diffs" }, { worktree: root } as never);

    expect(output).toContain("Proposal");
    expect(output).toContain("+Prefer small diffs");
  });
});
