import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runProposalApprove, runProposalReject, runProposalShow } from "../src/commands/proposal.js";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import {
  ProposalNotFoundError,
  approveProposal,
  createProposal,
  gcProposals,
  listProposals,
  rejectProposal,
  renderProposalForReview,
  showProposal,
  type Proposal
} from "../src/core/proposals.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

function canonical(content = "rules") {
  return { path: "AGENTS.md", content, hash: hashContent(content) };
}

async function overwriteProposal(root: string, proposal: Proposal): Promise<void> {
  await writeFile(join(root, ".agent-md", "proposals", `${proposal.id}.json`), `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
}

describe("proposals", () => {
  it("creates and shows pending proposals", async () => {
    const root = await createTempRoot();
    const input = canonical();

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: input,
      after: "rules\nmore"
    });

    expect(proposal.status).toBe("pending");
    expect((await showProposal(root, proposal.id)).diff).toContain("+more");
  });

  it("approves proposals when canonical hash matches", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });
    const approved = await approveProposal(root, proposal.id, config);

    expect(approved.status).toBe("approved");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules\nmore");
  });

  it("syncs enabled mirror targets after command approval", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");
    await runInit(root);

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    expect(await runProposalApprove(root, proposal.id)).toBe("Approved instruction update\nSynced 1 target(s)");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules\nmore");
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("rules\nmore");
  });

  it("shows, approves, and rejects the only pending proposal without an id", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");

    await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    expect(await runProposalShow(root)).toContain("+more");
    expect(await runProposalApprove(root)).toBe("Approved instruction update");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules\nmore");

    await createProposal(root, {
      source: { kind: "learn" },
      canonical: { path: "AGENTS.md", content: "rules\nmore", hash: hashContent("rules\nmore") },
      after: "rules\nmore\nagain"
    });

    expect(await runProposalReject(root)).toBe("Rejected instruction update");
  });

  it("requires an explicit proposal id when pending proposals are ambiguous", async () => {
    const root = await createTempRoot();
    const input = canonical();

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await createProposal(root, { source: { kind: "revise" }, canonical: input, after: "a" });
    await createProposal(root, { source: { kind: "learn" }, canonical: input, after: "b" });

    await expect(runProposalShow(root)).rejects.toThrow(/Multiple pending instruction updates/);
    await expect(runProposalApprove(root)).rejects.toThrow(/Multiple pending instruction updates/);
    await expect(runProposalReject(root)).rejects.toThrow(/Multiple pending instruction updates/);
  });

  it("reports no pending proposal for id-free lifecycle commands", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
    await expect(runProposalShow(root)).rejects.toThrow(/No pending instruction updates/);
    await expect(runProposalApprove(root)).rejects.toThrow(/No pending instruction updates/);
    await expect(runProposalReject(root)).rejects.toThrow(/No pending instruction updates/);
  });

  it("rejects mirror drift before changing the canonical file", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");
    await runInit(root);
    await writeFile(join(root, "CLAUDE.md"), "manual", "utf8");

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    await expect(runProposalApprove(root, proposal.id)).rejects.toThrow(/local edits since the last sync/);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules");
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("manual");
  });

  it("rejects stale proposals", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    await writeFile(join(root, "AGENTS.md"), "manual", "utf8");

    await expect(approveProposal(root, proposal.id, config)).rejects.toThrow(/stale/);
    expect((await showProposal(root, proposal.id)).status).toBe("stale");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("manual");
  });

  it("refuses to approve terminal proposals", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const stale = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nstale"
    });
    const rejected = await createProposal(root, {
      source: { kind: "learn" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nrejected"
    });

    await overwriteProposal(root, { ...stale, status: "stale" });
    await rejectProposal(root, rejected.id, { reason: "obsolete" });

    await expect(approveProposal(root, stale.id, config)).rejects.toThrow(/already stale/);
    await expect(approveProposal(root, rejected.id, config)).rejects.toThrow(/already rejected/);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules");
  });

  it("rejects proposals created for a different canonical path", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "CLAUDE.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    await expect(approveProposal(root, proposal.id, config)).rejects.toThrow(/primary instruction file changed/);
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules");
  });

  it("renders proposal scope metadata and rejects scope mismatches", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical: { path: "AGENTS.md", content: "rules", hash: hashContent("rules") },
      after: "rules\nmore"
    });

    expect(renderProposalForReview(proposal)).toContain("Instruction update [pending]");
    expect(renderProposalForReview(proposal)).not.toContain("beforeHash");

    await overwriteProposal(root, { ...proposal, scopeId: "global:claude" });

    await expect(approveProposal(root, proposal.id, config)).rejects.toThrow(/managed scope changed/);
    expect((await showProposal(root, proposal.id)).status).toBe("stale");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("rules");
  });

  it("lists proposals sorted by createdAt then id", async () => {
    const root = await createTempRoot();
    const first = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });
    const second = await createProposal(root, { source: { kind: "learn" }, canonical: canonical(), after: "b" });
    const third = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "c" });

    await overwriteProposal(root, { ...first, createdAt: "2024-01-02T00:00:00.000Z" });
    await overwriteProposal(root, { ...second, createdAt: "2024-01-01T00:00:00.000Z" });
    await overwriteProposal(root, { ...third, createdAt: "2024-01-02T00:00:00.000Z" });

    const listed = await listProposals(root);
    const sameTimeIds = [first.id, third.id].sort();

    expect(listed.map((proposal) => proposal.id)).toEqual([second.id, ...sameTimeIds]);
  });

  it("filters proposals by status", async () => {
    const root = await createTempRoot();
    const pending = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });
    const stale = await createProposal(root, { source: { kind: "learn" }, canonical: canonical(), after: "b" });
    const rejected = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "c" });

    await overwriteProposal(root, { ...stale, status: "stale" });
    await rejectProposal(root, rejected.id, { reason: "obsolete" });

    expect((await listProposals(root, { status: "pending" })).map((proposal) => proposal.id)).toEqual([pending.id]);
    expect((await listProposals(root, { status: ["pending", "rejected"] })).map((proposal) => proposal.status)).toEqual(["pending", "rejected"]);
  });

  it("ignores non-json and invalid-id filenames when listing proposals", async () => {
    const root = await createTempRoot();
    const proposal = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });

    await writeFile(join(root, ".agent-md", "proposals", "notes.txt"), "ignored", "utf8");
    await writeFile(join(root, ".agent-md", "proposals", "bad..id.json"), "not json", "utf8");

    expect((await listProposals(root)).map((item) => item.id)).toEqual([proposal.id]);
  });

  it("throws when listing a corrupt valid-id proposal file", async () => {
    const root = await createTempRoot();

    await mkdir(join(root, ".agent-md", "proposals"), { recursive: true });
    await writeFile(join(root, ".agent-md", "proposals", "valid-id.json"), "not json", "utf8");

    await expect(listProposals(root)).rejects.toThrow();
  });

  it("returns an empty list when the proposals directory is missing", async () => {
    expect(await listProposals(await createTempRoot())).toEqual([]);
  });

  it("throws ProposalNotFoundError for unknown proposal ids", async () => {
    await expect(showProposal(await createTempRoot(), "missing-id")).rejects.toBeInstanceOf(ProposalNotFoundError);
  });

  it("rejectProposal moves pending proposals to rejected and records the reason", async () => {
    const root = await createTempRoot();
    const proposal = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });
    const rejected = await rejectProposal(root, proposal.id, { reason: "obsolete" });

    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedReason).toBe("obsolete");
    expect(rejected.rejectedAt).toBeTruthy();
  });

  it("rejectProposal moves stale proposals to rejected", async () => {
    const root = await createTempRoot();
    const proposal = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });

    await overwriteProposal(root, { ...proposal, status: "stale" });

    expect((await rejectProposal(root, proposal.id)).status).toBe("rejected");
  });

  it("rejectProposal refuses approved proposals and is idempotent for rejected proposals", async () => {
    const root = await createTempRoot();
    const approved = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });
    const rejected = await createProposal(root, { source: { kind: "learn" }, canonical: canonical(), after: "b" });

    await overwriteProposal(root, { ...approved, status: "approved", approvedAt: "2024-01-01T00:00:00.000Z", approvedHash: hashContent("a") });
    const firstRejected = await rejectProposal(root, rejected.id, { reason: "obsolete" });

    await expect(rejectProposal(root, approved.id)).rejects.toThrow(/Cannot reject/);
    expect(await rejectProposal(root, rejected.id, { reason: "new" })).toEqual(firstRejected);
  });

  it("gcProposals deletes only old terminal proposals and refuses pending filters", async () => {
    const root = await createTempRoot();
    const pending = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "a" });
    const approved = await createProposal(root, { source: { kind: "learn" }, canonical: canonical(), after: "b" });
    const stale = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "c" });
    const rejected = await createProposal(root, { source: { kind: "learn" }, canonical: canonical(), after: "d" });
    const freshRejected = await createProposal(root, { source: { kind: "revise" }, canonical: canonical(), after: "e" });

    await overwriteProposal(root, { ...pending, createdAt: "2024-01-01T00:00:00.000Z" });
    await overwriteProposal(root, { ...approved, status: "approved", approvedAt: "2024-01-01T00:00:00.000Z", approvedHash: hashContent("b"), createdAt: "2024-01-01T00:00:00.000Z" });
    await overwriteProposal(root, { ...stale, status: "stale", createdAt: "2024-01-01T00:00:00.000Z" });
    await overwriteProposal(root, { ...rejected, status: "rejected", rejectedAt: "2024-01-01T00:00:00.000Z", createdAt: "2024-01-01T00:00:00.000Z" });
    await overwriteProposal(root, { ...freshRejected, status: "rejected", rejectedAt: "2024-02-01T00:00:00.000Z", createdAt: "2024-02-01T00:00:00.000Z" });

    const result = await gcProposals(root, { olderThanDays: 30, now: new Date("2024-02-15T00:00:00.000Z") });

    expect(result.deleted).toEqual([approved.id, stale.id, rejected.id].sort());
    expect((await listProposals(root)).map((proposal) => proposal.id).sort()).toEqual([freshRejected.id, pending.id].sort());
    await expect(gcProposals(root, { statuses: ["pending"] })).rejects.toThrow(/pending/);
  });
});
