import { lstat, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import { writeManifest } from "../src/core/manifest.js";
import { applySyncPlan, createSyncPlan } from "../src/core/sync.js";
import { runInit } from "../src/commands/init.js";
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

  it("plans symlink-mode missing target with synthesized diff", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("missing");
    expect(plan.targets[0].mode).toBe("symlink");
    expect(plan.targets[0].before).toBe("");
    expect(plan.targets[0].after).toBe("");
    expect(plan.targets[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md");
  });

  symlinkIt("plans symlink-mode correctly-linked target as ok", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await symlink("AGENTS.md", join(root, "CLAUDE.md"));

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("ok");
    expect(plan.targets[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md");
  });

  symlinkIt("plans symlink-mode wrong-link target as conflict with readlink info", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "OTHER.md"), "other", "utf8");
    await symlink("OTHER.md", join(root, "CLAUDE.md"));

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("conflict");
    expect(plan.targets[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md (currently: OTHER.md)");
  });

  it("plans symlink-mode regular-file target as conflict with file marker", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "existing", "utf8");

    const plan = await createSyncPlan(root, config);

    expect(plan.targets[0].status).toBe("conflict");
    expect(plan.targets[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md (currently: regular file)");
  });

  symlinkIt("applies symlink-mode missing target by creating link and recording sentinel", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const manifest = await applySyncPlan(root, config, await createSyncPlan(root, config));

    expect((await lstat(join(root, "CLAUDE.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(manifest.targets).toEqual([
      { path: "CLAUDE.md", mode: "symlink", lastSyncedHash: "symlink" }
    ]);
  });

  symlinkIt("applies mixed mirror and symlink targets in one plan", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [
        { path: "CLAUDE.md", mode: "mirror" },
        { path: "GEMINI.md", mode: "symlink" }
      ],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const manifest = await applySyncPlan(root, config, await createSyncPlan(root, config));

    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("rules");
    expect((await lstat(join(root, "GEMINI.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(root, "GEMINI.md"))).toBe("AGENTS.md");
    expect(manifest.targets).toEqual([
      { path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("rules") },
      { path: "GEMINI.md", mode: "symlink", lastSyncedHash: "symlink" }
    ]);
  });

  symlinkIt("blocks symlink-mode regular-file conflict without force and overwrites with force", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      targets: [{ path: "CLAUDE.md", mode: "symlink" }],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "existing", "utf8");

    const plan = await createSyncPlan(root, config);

    await expect(applySyncPlan(root, config, plan)).rejects.toThrow(/--force/);
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("existing");

    const forced = await applySyncPlan(root, config, plan, { force: true });

    expect((await lstat(join(root, "CLAUDE.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(forced.targets).toEqual([
      { path: "CLAUDE.md", mode: "symlink", lastSyncedHash: "symlink" }
    ]);
  });

  it("syncs explicitly selected local scopes without touching project manifest", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, ".claude.local.md"), "local rules", "utf8");
    await runInit(root);
    const projectManifest = await readFile(join(root, ".agent-md", "manifest.json"), "utf8");

    await runInit(root, { scope: "local", adopt: true });

    expect(await runSync(root, { scope: "local", apply: true })).toBe("No changes");
    expect(await readFile(join(root, ".agent-md", "manifest.json"), "utf8")).toBe(projectManifest);
    expect(await readFile(join(root, ".agent-md.local", "manifest.json"), "utf8")).toContain('"id": "local"');
  });
});
