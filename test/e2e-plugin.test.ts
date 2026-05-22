import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OpencodeMdManagement } from "../src/plugin.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("plugin tools", () => {
  it("executes init with an explicit primary model through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude rules\n", "utf8");

    expect(await hooks.tool!.agent_md_init.execute({ model: "claude", mirrors: ["gemini"] }, { worktree: root } as never)).toBe("Created .agent-md.json with canonical CLAUDE.md");

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.targets).toEqual(expect.arrayContaining([
      { path: "AGENTS.md", mode: "mirror", enabled: false },
      { path: "GEMINI.md", mode: "mirror", enabled: true }
    ]));
  });

  it("uses the OpenCode project directory instead of the worktree root", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);
    const context = { directory: root, worktree: "/" } as never;

    expect(await hooks.tool!.agent_md_init.execute({ model: "opencode", mirrors: [] }, context)).toBe("Created .agent-md.json with canonical AGENTS.md");

    expect(await readFile(join(root, ".agent-md.json"), "utf8")).toContain('"canonical": "AGENTS.md"');
  });

  it("executes revise through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    const output = await hooks.tool!.agent_md_revise.execute({ notes: "Prefer small diffs" }, { worktree: root } as never);

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("+Prefer small diffs");
  });

  it("executes agent-authored revise content through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    const output = await hooks.tool!.agent_md_revise.execute({
      notes: "Prefer small diffs",
      after: "# Rules\n\n- Prefer small diffs\n"
    }, { worktree: root } as never);

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("+- Prefer small diffs");
  });

  it("executes proposal lifecycle tools through a fake OpenCode context", async () => {
    const root = await createTempRoot();
    const hooks = await OpencodeMdManagement({} as never);
    const context = { worktree: root } as never;

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    await hooks.tool!.agent_md_revise.execute({ notes: "Prefer small diffs" }, context);
    const list = await hooks.tool!.agent_md_proposal_list.execute({}, context);
    const match = list.match(/^([a-zA-Z0-9-]+)\t/m);

    if (!match)
      throw new Error(`Proposal id not found in output: ${list}`);

    const id = match[1];

    expect(await hooks.tool!.agent_md_proposal_list.execute({}, context)).toContain(id);

    const json = JSON.parse(await hooks.tool!.agent_md_proposal_list.execute({ json: true }, context));

    expect(json).toEqual([expect.objectContaining({ id, status: "pending", source: expect.objectContaining({ kind: "revise" }), canonicalPath: "AGENTS.md" })]);
    expect(await hooks.tool!.agent_md_proposal_reject.execute({ reason: "obsolete" }, context)).toBe("Rejected instruction update");
    expect(await hooks.tool!.agent_md_proposal_list.execute({ status: "rejected" }, context)).toContain(`${id}\trejected`);

    const rejectedJson = JSON.parse(await hooks.tool!.agent_md_proposal_list.execute({ status: "rejected", json: true }, context));

    expect(rejectedJson).toEqual([expect.objectContaining({ id, status: "rejected" })]);
    expect(await hooks.tool!.agent_md_proposal_gc.execute({ olderThanDays: 0 }, context)).toContain("Deleted 1 proposals");
  });
});
