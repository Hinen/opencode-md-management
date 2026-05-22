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
  it("plans missing aliases as missing symlinks", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const plan = await createSyncPlan(root, config);

    expect(plan.aliases[0].status).toBe("missing");
    expect(plan.aliases[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md");
  });

  symlinkIt("plans correctly-linked alias as ok", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await symlink("AGENTS.md", join(root, "CLAUDE.md"));

    const plan = await createSyncPlan(root, config);

    expect(plan.aliases[0].status).toBe("ok");
    expect(plan.aliases[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md");
  });

  symlinkIt("plans wrong-link alias as conflict with readlink info", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "OTHER.md"), "other", "utf8");
    await symlink("OTHER.md", join(root, "CLAUDE.md"));

    const plan = await createSyncPlan(root, config);

    expect(plan.aliases[0].status).toBe("conflict");
    expect(plan.aliases[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md (currently: OTHER.md)");
  });

  it("plans regular-file alias as conflict with file marker", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "existing", "utf8");

    const plan = await createSyncPlan(root, config);

    expect(plan.aliases[0].status).toBe("conflict");
    expect(plan.aliases[0].diff).toBe("symlink: CLAUDE.md → AGENTS.md (currently: regular file)");
  });

  symlinkIt("applies sync and records aliases in manifest", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const manifest = await applySyncPlan(root, config, await createSyncPlan(root, config));

    expect((await lstat(join(root, "CLAUDE.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(manifest.aliases).toEqual(["CLAUDE.md"]);
  });

  symlinkIt("applies multi-alias plan and merges all into manifest", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      aliases: ["CLAUDE.md", "GEMINI.md"],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    const manifest = await applySyncPlan(root, config, await createSyncPlan(root, config));

    expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(await readlink(join(root, "GEMINI.md"))).toBe("AGENTS.md");
    expect(manifest.aliases).toEqual(["CLAUDE.md", "GEMINI.md"]);
  });

  it("preserves v1 manifest legacy entries during in-memory migration", async () => {
    const root = await createTempRoot();
    const config = parseConfig({
      aliases: ["CLAUDE.md"],
      sync: { requireGitClean: false }
    });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeManifest(root, {
      version: 3,
      scope: { id: "project", kind: "project", tool: null },
      root: ".",
      configPath: ".agent-md.json",
      configHash: hashContent("legacy"),
      primary: { path: "AGENTS.md", hash: hashContent("rules") },
      canonical: { path: "AGENTS.md", hash: hashContent("rules") },
      aliases: ["CLAUDE.md"],
      adoptedAt: new Date(0).toISOString()
    });

    const plan = await createSyncPlan(root, config);

    expect(plan.manifest?.aliases).toEqual(["CLAUDE.md"]);
  });

  it("blocks regular-file conflict without force", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "existing", "utf8");

    const plan = await createSyncPlan(root, config);

    await expect(applySyncPlan(root, config, plan)).rejects.toThrow(/--force/);
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("existing");
  });

  symlinkIt("force overwrites regular-file conflict with symlink", async () => {
    const root = await createTempRoot();
    const config = parseConfig({ aliases: ["CLAUDE.md"], sync: { requireGitClean: false } });

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "existing", "utf8");

    const plan = await createSyncPlan(root, config);
    const forced = await applySyncPlan(root, config, plan, { force: true });

    expect((await lstat(join(root, "CLAUDE.md"))).isSymbolicLink()).toBe(true);
    expect(await readlink(join(root, "CLAUDE.md"))).toBe("AGENTS.md");
    expect(forced.aliases).toEqual(["CLAUDE.md"]);
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
