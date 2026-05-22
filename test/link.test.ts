import { lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runLink } from "../src/commands/link.js";

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

describe("runLink", () => {
  it("rejects non-project scope", async () => {
    await expect(runLink(".", { model: "claude", scope: "global:claude" })).rejects.toThrow(/Omit --scope or use --scope project/);
  });

  it("throws when trying to link the primary instruction file", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "CLAUDE.md"), "# instructions\n", "utf8");
    await runInit(root, { model: "claude" });

    await expect(runLink(root, { model: "claude" })).rejects.toThrow(/Cannot link the primary instruction file \(CLAUDE\.md\)/);
  });

  symlinkIt("creates root symlink and updates config when apply is true", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "# instructions\n", "utf8");
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "claude" });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const claudeTarget = config.targets.find((t: { path: string }) => t.path === "CLAUDE.md");

    expect(claudeTarget.mode).toBe("symlink");
    expect(claudeTarget.enabled).toBe(true);

    const stat = await lstat(join(root, "CLAUDE.md"));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it("updates config but does not materialize when apply is false", async () => {
    const root = await createTempRoot();
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "claude", apply: false });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const claudeTarget = config.targets.find((t: { path: string }) => t.path === "CLAUDE.md");

    expect(claudeTarget.mode).toBe("symlink");
    expect(claudeTarget.enabled).toBe(true);

    await expect(lstat(join(root, "CLAUDE.md"))).rejects.toThrow();
  });

  it("does not walk nested AGENTS.md when hierarchical is false", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "# nested\n", "utf8");
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "claude", apply: false, hierarchical: false });

    await expect(lstat(join(root, "Foo", "CLAUDE.md"))).rejects.toThrow();
  });

  symlinkIt("creates nested CLAUDE.md symlinks when hierarchical is true for claude", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "# instructions\n", "utf8");
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "# nested\n", "utf8");
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "claude" });

    const stat = await lstat(join(root, "Foo", "CLAUDE.md"));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  symlinkIt("does not walk nested AGENTS.md for codex (no hierarchical support)", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "# instructions\n", "utf8");
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "# nested\n", "utf8");
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "codex" });

    await expect(lstat(join(root, "Foo", ".codex"))).rejects.toThrow();
  });

  symlinkIt("creates cross-directory symlink for codex", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "# instructions\n", "utf8");
    await runInit(root, { model: "opencode" });

    await runLink(root, { model: "codex" });

    const stat = await lstat(join(root, ".codex", "AGENTS.md"));
    expect(stat.isSymbolicLink()).toBe(true);
  });
});
