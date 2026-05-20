import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import { approveProposal, createProposal, showProposal } from "../src/core/proposals.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("proposals", () => {
  it("creates and shows pending proposals", async () => {
    const root = await createTempRoot();
    const canonical = { path: "AGENTS.md", content: "rules", hash: hashContent("rules") };

    const proposal = await createProposal(root, {
      source: { kind: "revise" },
      canonical,
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
});
