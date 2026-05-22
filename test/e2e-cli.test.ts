import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runLearn } from "../src/commands/learn.js";
import { runProposalApprove, runProposalGc, runProposalList, runProposalReject, runProposalShow } from "../src/commands/proposal.js";
import { runRevise } from "../src/commands/revise.js";
import { runReview } from "../src/commands/review.js";
import { runSync } from "../src/commands/sync.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

async function canCreateSymlink(): Promise<boolean> {
  const root = await createTempRoot();
  await writeFile(join(root, "target.md"), "rules", "utf8");

  try {
    await symlink("target.md", join(root, "link.md"));

    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM")
      return false;

    throw error;
  }
}

const canCreateWindowsSymlink = process.platform === "win32" ? await canCreateSymlink() : true;
const symlinkIt = it.skipIf(process.platform === "win32" && !canCreateWindowsSymlink);

describe("CLI workflow handlers", () => {
  it("creates, shows, and approves a revise proposal", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await runRevise(root, { notes: "Always run npm test" });
    const show = await runProposalShow(root);

    expect(show).toContain("+Always run npm test");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");

    await runProposalApprove(root);

    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("Always run npm test");
  });

  it("lists, rejects, and garbage-collects proposals", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await runRevise(root, { notes: "First change" });
    const [firstJson] = JSON.parse(await runProposalList(root, { json: true }));
    await runLearn(root, { notes: "Second change" });
    const list = await runProposalList(root);
    const [first, second] = JSON.parse(await runProposalList(root, { json: true }));

    expect(first.id).toBe(firstJson.id);
    expect(list).toContain("1. pending instruction update");
    expect(list).toContain("2. pending instruction update");
    expect(list).toContain("request: First change");
    expect(list).toContain("preview: ## Proposed Instruction Update; <!-- omm: untrusted notes begin -->; First change");
    expect(list).toContain("Use /omm:proposal-show 1 to review");
    expect(list).not.toContain(first.id);
    expect(list).not.toContain(second.id);

    const json = JSON.parse(await runProposalList(root, { json: true }));

    expect(json).toEqual([
      expect.objectContaining({ id: first.id, status: "pending", source: expect.objectContaining({ kind: "revise" }), canonicalPath: "AGENTS.md" }),
      expect.objectContaining({ id: second.id, status: "pending", source: expect.objectContaining({ kind: "learn" }), canonicalPath: "AGENTS.md" })
    ]);
    expect(json[0]).toHaveProperty("createdAt");

    expect(await runProposalReject(root, "1", { reason: "obsolete" })).toBe("Rejected instruction update");
    expect(await runProposalList(root, { status: "rejected" })).toContain("1. rejected instruction update");
    expect(await runProposalList(root, { status: "rejected" })).not.toContain(first.id);

    const rejectedJson = JSON.parse(await runProposalList(root, { status: "rejected", json: true }));

    expect(rejectedJson).toHaveLength(1);
    expect(rejectedJson[0]).toEqual(expect.objectContaining({ id: first.id, status: "rejected" }));

    await runProposalApprove(root, "2");

    const gc = await runProposalGc(root, { olderThanDays: 0 });

    expect(gc).toContain("Deleted 2 proposals");
    expect(await runProposalList(root)).toBe("No instruction updates found");
    expect(await runProposalList(root, { json: true })).toBe("[]");
  });

  it("throws friendly errors for unknown proposals and invalid status filters", async () => {
    const root = await createTempRoot();

    await expect(runProposalShow(root, "unknown-id")).rejects.toThrow(/Proposal not found: unknown-id/);
    await expect(runProposalList(root, { status: "bogus" })).rejects.toThrow(/Invalid status filter: bogus/);
  });

  it("creates review proposals from audit findings", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n- Maybe run tests later.\n", "utf8");
    await runInit(root);

    const output = await runReview(root);

    expect(output).toContain("Instruction update [pending]");
    expect(output).toContain("vague-instruction");
  });

  it("rejects unknown sync aliases", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await expect(runSync(root, { target: "NOPE.md" })).rejects.toThrow(/Unknown alias/);
  });

  it("rejects sync across multiple scopes", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await writeFile(join(root, ".claude.local.md"), "# Local\n", "utf8");
    await runInit(root);

    await expect(runSync(root, { scope: "all" })).rejects.toThrow(/Cannot write to all instruction file scopes/);
  });

  symlinkIt("sync only sees explicitly enabled init aliases", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "CLAUDE.md"), "# Rules\n", "utf8");
    await runInit(root, { model: "claude", aliases: ["opencode"] });
    await rm(join(root, "AGENTS.md"));

    const preview = await runSync(root);

    expect(preview).toContain("symlink: AGENTS.md → CLAUDE.md");
    expect(preview).not.toContain("GEMINI.md");
  });
});
