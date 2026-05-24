import { lstat, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAliases } from "../src/commands/aliases.js";
import { runInit } from "../src/commands/init.js";

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

describe("runAliases", () => {
  symlinkIt("adds a model to config.aliases", async () => {
    const root = await createTempRoot();

    await runInit(root);

    const output = await runAliases(root, { add: ["claude"] });

    expect(output).toContain("Active aliases: CLAUDE.md");

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.aliases).toEqual(["CLAUDE.md"]);
  });

  symlinkIt("materializes the symlink when adding an alias", async () => {
    const root = await createTempRoot();

    await runInit(root);
    await runAliases(root, { add: ["claude"] });

    expect((await lstat(join(root, "CLAUDE.md"))).isSymbolicLink()).toBe(true);
  });

  it("rejects unmanaged scopes", async () => {
    const root = await createTempRoot();

    await runInit(root);

    await expect(runAliases(root, { add: ["claude"], scope: "global:claude" })).rejects.toThrow(/not managed yet/);
  });

  it("rejects adding or removing the primary file path", async () => {
    const root = await createTempRoot();

    await runInit(root);

    await expect(runAliases(root, { add: ["opencode"] })).rejects.toThrow(/Cannot alias the primary instruction file \(AGENTS\.md\)/);
  });

  symlinkIt("applies add and remove in one call", async () => {
    const root = await createTempRoot();

    await runInit(root);
    await runAliases(root, { add: ["gemini"] });

    const output = await runAliases(root, { add: ["claude"], remove: ["gemini"] });

    expect(output).toContain("Removed alias GEMINI.md");
    expect(output).toContain("Active aliases: CLAUDE.md");

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.aliases).toEqual(["CLAUDE.md"]);
  });

  it("reports no changes when called with empty add and remove", async () => {
    const root = await createTempRoot();

    await runInit(root);

    const output = await runAliases(root, {});

    expect(output).toContain("No changes");
    expect(output).toContain("Active aliases: none");
  });

  it("skips alias paths that already exist as regular files", async () => {
    const root = await createTempRoot();

    await runInit(root);
    await writeFile(join(root, "CLAUDE.md"), "existing content", "utf8");

    const output = await runAliases(root, { add: ["claude"] });

    expect(output).toContain("Skipped CLAUDE.md: existing regular file");
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("existing content");

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.aliases).toEqual([]);
  });

  symlinkIt("hierarchically adds aliases beside nested primaries", async () => {
    const root = await createTempRoot();
    const { mkdir } = await import("node:fs/promises");

    await runInit(root);
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "foo rules", "utf8");

    const output = await runAliases(root, { add: ["claude"] });

    expect(output).toContain("Linked CLAUDE.md → AGENTS.md");
    expect(output).toContain("Linked Foo/CLAUDE.md → AGENTS.md");

    const fooClaude = await lstat(join(root, "Foo", "CLAUDE.md"));

    expect(fooClaude.isSymbolicLink()).toBe(true);
  });

  symlinkIt("hierarchically removes aliases beside nested primaries", async () => {
    const root = await createTempRoot();
    const { mkdir } = await import("node:fs/promises");

    await runInit(root);
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "foo rules", "utf8");
    await runAliases(root, { add: ["claude"] });

    const output = await runAliases(root, { remove: ["claude"] });

    expect(output).toContain("Removed alias CLAUDE.md");
    expect(output).toContain("Removed alias Foo/CLAUDE.md");

    const { access } = await import("node:fs/promises");

    await expect(access(join(root, "Foo", "CLAUDE.md"))).rejects.toThrow();
  });

  symlinkIt("adds and removes cross-tool aliases under a global scope", async () => {
    const homeRoot = await createTempRoot();
    const previousHome = process.env.AGENT_MD_HOME;

    process.env.AGENT_MD_HOME = homeRoot;

    try {
      await runInit(homeRoot, { scope: "global:opencode", model: "opencode" });

      const opencodeRoot = join(homeRoot, "opencode");
      const claudeAlias = join(homeRoot, "claude", "CLAUDE.md");
      const opencodePrimary = join(opencodeRoot, "AGENTS.md");
      const addOutput = await runAliases(homeRoot, { scope: "global:opencode", add: ["claude"] });

      expect(addOutput).toContain(`Linked ${claudeAlias} → ${opencodePrimary}`);

      const { readlink, access } = await import("node:fs/promises");
      const claudeTarget = (await readlink(claudeAlias)).replace(/\\/g, "/");

      expect(claudeTarget).toBe(opencodePrimary.replace(/\\/g, "/"));

      const removeOutput = await runAliases(homeRoot, { scope: "global:opencode", remove: ["claude"] });

      expect(removeOutput).toContain(`Removed alias ${claudeAlias}`);
      await expect(access(claudeAlias)).rejects.toThrow();
    } finally {
      if (previousHome === undefined)
        delete process.env.AGENT_MD_HOME;
      else
        process.env.AGENT_MD_HOME = previousHome;
    }
  });
});
