import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import { writeManifest } from "../src/core/manifest.js";
import { applySyncPlan, createSyncPlan } from "../src/core/sync.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("sync", () => {
  it("plans missing targets from canonical content", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ targets: [{ path: "CLAUDE.md" }], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("missing");
    expect(plan.targets[0].after).toBe("rules");
  });

  it("applies sync and writes manifest", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ targets: [{ path: "CLAUDE.md" }], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const manifest = await applySyncPlan(root, config, await createSyncPlan(root, config));

    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("rules");
    expect(manifest.targets[0].lastSyncedHash).toBe(hashContent("rules"));
  });

  it("blocks user-touched targets without force", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ targets: [{ path: "CLAUDE.md" }], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "new rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "manual edit", "utf8");
    await writeManifest(root, {
      version: 1,
      canonical: { path: "AGENTS.md", hash: hashContent("old rules") },
      targets: [{ path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("old rules") }]
    });

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("conflict");
    await expect(applySyncPlan(root, config, plan)).rejects.toThrow(/--force/);
  });
});
