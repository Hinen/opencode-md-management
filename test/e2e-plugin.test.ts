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

  it("executes proposal lifecycle tools through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);
    const context = { worktree: root } as never;

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    const revise = await hooks.tool!.agent_md_revise.execute({ notes: "Prefer small diffs" }, context);
    const match = revise.match(/Proposal ([a-zA-Z0-9-]+)/);

    if (!match)
      throw new Error(`Proposal id not found in output: ${revise}`);

    const id = match[1];

    expect(await hooks.tool!.agent_md_proposal_list.execute({}, context)).toContain(id);

    const json = JSON.parse(await hooks.tool!.agent_md_proposal_list.execute({ json: true }, context));

    expect(json).toEqual([expect.objectContaining({ id, status: "pending", source: expect.objectContaining({ kind: "revise" }), canonicalPath: "AGENTS.md" })]);
    expect(await hooks.tool!.agent_md_proposal_reject.execute({ id, reason: "obsolete" }, context)).toBe(`Rejected proposal ${id}`);
    expect(await hooks.tool!.agent_md_proposal_list.execute({ status: "rejected" }, context)).toContain(`${id}\trejected`);

    const rejectedJson = JSON.parse(await hooks.tool!.agent_md_proposal_list.execute({ status: "rejected", json: true }, context));

    expect(rejectedJson).toEqual([expect.objectContaining({ id, status: "rejected" })]);
    expect(await hooks.tool!.agent_md_proposal_gc.execute({ olderThanDays: 0 }, context)).toContain("Deleted 1 proposals");
  });
});
