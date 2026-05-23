import { lstat, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

describe("runInit", () => {
  it("defaults to AGENTS.md and creates a placeholder primary file when none exists", async () => {
    const root = await createTempRoot();
    const output = await runInit(root);

    expect(output).toContain("Created .agent-md.json with primary AGENTS.md");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("Single source of truth");
  });

  it("uses existing CLAUDE.md as primary when AGENTS.md is absent", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "CLAUDE.md"), "# Rules\n", "utf8");

    const output = await runInit(root);

    expect(output).toContain("Created .agent-md.json with primary CLAUDE.md");
    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("# Rules\n");
  });

  it("uses existing GEMINI.md as primary when AGENTS.md and CLAUDE.md are absent", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "GEMINI.md"), "# Rules\n", "utf8");

    const output = await runInit(root);

    expect(output).toContain("Created .agent-md.json with primary GEMINI.md");
  });

  it("does not auto-add aliases when only existing instruction files are present with matching content", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Rules\n", "utf8");

    await runInit(root);

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(root, ".agent-md", "manifest.json"), "utf8"));

    expect(config.primary).toBe("AGENTS.md");
    expect(config.aliases).toEqual([]);
    expect(manifest.aliases).toEqual([]);
  });

  it("uses the explicit primary model and writes a placeholder file", async () => {
    const root = await createTempRoot();
    const output = await runInit(root, { model: "gemini" });

    expect(output).toContain("Created .agent-md.json with primary GEMINI.md");
    expect(await readFile(join(root, ".agent-md.json"), "utf8")).toContain('"primary": "GEMINI.md"');
    expect(await readFile(join(root, ".agent-md", "manifest.json"), "utf8")).toContain('"id": "project"');
    expect(await readFile(join(root, "GEMINI.md"), "utf8")).toContain("Single source of truth");
  });

  symlinkIt("records selected aliases in the config without auto-enabling unrelated paths", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "claude", aliases: ["opencode", "gemini"] });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.primary).toBe("CLAUDE.md");
    expect(config.aliases).toEqual(["AGENTS.md", "GEMINI.md"]);
  });

  symlinkIt("materializes alias symlinks pointing at the primary", async () => {
    const root = await createTempRoot();
    const output = await runInit(root, { model: "claude", aliases: ["opencode"] });

    expect(output).toContain("Linked AGENTS.md → CLAUDE.md");
    expect((await lstat(join(root, "AGENTS.md"))).isSymbolicLink()).toBe(true);
  });

  it("skips aliases that already exist as regular files and reports them", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");

    const output = await runInit(root, { model: "claude", aliases: ["opencode"] });

    expect(output).toContain("Skipped AGENTS.md: existing regular file");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# OpenCode rules\n");
  });

  it("rejects ambiguous existing instruction files with different content", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude rules\n", "utf8");

    await expect(runInit(root)).rejects.toThrow(/Choose which instruction file should be primary/);
  });

  it("allows explicit model when existing instruction files differ", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude rules\n", "utf8");

    const output = await runInit(root, { model: "claude" });

    expect(output).toContain("Created .agent-md.json with primary CLAUDE.md");
  });

  it("throws a friendly error when config exists", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await expect(runInit(root)).rejects.toThrow(/\.agent-md\.json already exists/);
  });

  it("initializes local scope separately from project config", async () => {
    const root = await createTempRoot();

    expect(await runInit(root, { scope: "local" })).toBe("Created local config with primary .claude.local.md");
    expect(await readFile(join(root, ".agent-md.local.json"), "utf8")).toContain('"id": "local"');
    expect(await readFile(join(root, ".agent-md.local", "manifest.json"), "utf8")).toContain('"id": "local"');
  });

  it("initializes explicit global tool scopes under their tool roots", async () => {
    const root = await createTempRoot();
    const previousHome = process.env.AGENT_MD_HOME;
    process.env.AGENT_MD_HOME = join(root, "home");

    try {
      expect(await runInit(root, { scope: "global:claude" })).toBe("Created global:claude config with primary CLAUDE.md");
      expect(await readFile(join(root, "home", "claude", ".agent-md.json"), "utf8")).toContain('"id": "global:claude"');
    } finally {
      if (previousHome === undefined)
        delete process.env.AGENT_MD_HOME;
      else
        process.env.AGENT_MD_HOME = previousHome;
    }
  });

  symlinkIt("materializes same-directory aliases for nested AGENTS.md files", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "root rules", "utf8");

    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "foo rules", "utf8");
    await mkdir(join(root, "Foo", "Bar"), { recursive: true });
    await writeFile(join(root, "Foo", "Bar", "AGENTS.md"), "bar rules", "utf8");

    const output = await runInit(root, { model: "opencode", aliases: ["claude", "gemini"] });

    expect(output).toContain("Linked CLAUDE.md → AGENTS.md");
    expect(output).toContain("Linked GEMINI.md → AGENTS.md");
    expect(output).toContain("Linked Foo/CLAUDE.md → AGENTS.md");
    expect(output).toContain("Linked Foo/GEMINI.md → AGENTS.md");
    expect(output).toContain("Linked Foo/Bar/CLAUDE.md → AGENTS.md");
    expect(output).toContain("Linked Foo/Bar/GEMINI.md → AGENTS.md");

    const fooClaude = await lstat(join(root, "Foo", "CLAUDE.md"));

    expect(fooClaude.isSymbolicLink()).toBe(true);
  });

  symlinkIt("skips cross-directory alias models (codex/copilot) at nested levels", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "root rules", "utf8");

    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(root, "Foo"), { recursive: true });
    await writeFile(join(root, "Foo", "AGENTS.md"), "foo rules", "utf8");

    const output = await runInit(root, { model: "opencode", aliases: ["codex", "copilot"] });

    expect(output).toContain("Linked .codex/AGENTS.md → AGENTS.md");
    expect(output).toContain("Linked .github/copilot-instructions.md → AGENTS.md");
    expect(output).not.toContain("Foo/.codex");
    expect(output).not.toContain("Foo/.github");
    expect(output).not.toContain("Foo/AGENTS.md → AGENTS.md");
  });
});
