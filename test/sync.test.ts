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

  it("preserves unrelated manifest targets during scoped apply", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md" }, { path: "GEMINI.md" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "old rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "old rules", "utf8");
    await writeFile(join(root, "GEMINI.md"), "old rules", "utf8");
    await writeManifest(root, {
      version: 1,
      canonical: { path: "AGENTS.md", hash: hashContent("old rules") },
      targets: [
        { path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("old rules") },
        { path: "GEMINI.md", mode: "mirror", lastSyncedHash: hashContent("old rules") }
      ]
    });
    await writeFile(join(root, "AGENTS.md"), "new rules", "utf8");

    const plan = await createSyncPlan(root, config);
    const scopedPlan = { ...plan, targets: plan.targets.filter((target) => target.path === "CLAUDE.md") };
    const manifest = await applySyncPlan(root, config, scopedPlan);

    expect(manifest.targets).toEqual([
      { path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("new rules") },
      { path: "GEMINI.md", mode: "mirror", lastSyncedHash: hashContent("old rules") }
    ]);
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

  it("checks all conflicts before writing any target", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md" }, { path: "GEMINI.md" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "new rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "old rules", "utf8");
    await writeFile(join(root, "GEMINI.md"), "manual edit", "utf8");
    await writeManifest(root, {
      version: 1,
      canonical: { path: "AGENTS.md", hash: hashContent("old rules") },
      targets: [
        { path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("old rules") },
        { path: "GEMINI.md", mode: "mirror", lastSyncedHash: hashContent("old rules") }
      ]
    });

    const plan = await createSyncPlan(root, config);

    await expect(applySyncPlan(root, config, plan)).rejects.toThrow(/GEMINI\.md/);
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("old rules");
  });
});
