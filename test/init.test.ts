import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("runInit", () => {
  it("defaults to AGENTS.md when no canonical file exists", async () => {
    const root = await createTempRoot();

    expect(await runInit(root)).toBe("Created .agent-md.json with canonical AGENTS.md");
  });

  it("uses existing CLAUDE.md as canonical when AGENTS.md is absent", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "CLAUDE.md"), "# Rules\n", "utf8");

    expect(await runInit(root)).toBe("Created .agent-md.json with canonical CLAUDE.md");
  });

  it("uses existing GEMINI.md as canonical when AGENTS.md and CLAUDE.md are absent", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "GEMINI.md"), "# Rules\n", "utf8");

    expect(await runInit(root)).toBe("Created .agent-md.json with canonical GEMINI.md");
  });

  it("automatically enables existing instruction files as mirror targets", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Rules\n", "utf8");

    await runInit(root);

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(root, ".agent-md", "manifest.json"), "utf8"));

    expect(config.canonical).toBe("AGENTS.md");
    expect(config.targets).toContainEqual({ path: "CLAUDE.md", mode: "mirror", enabled: true });
    expect(manifest.targets).toHaveLength(1);
    expect(manifest.targets[0].path).toBe("CLAUDE.md");
  });

  it("uses the explicit primary model as canonical", async () => {
    const root = await createTempRoot();

    expect(await runInit(root, { model: "gemini" })).toBe("Created .agent-md.json with canonical GEMINI.md");
    expect(await readFile(join(root, ".agent-md.json"), "utf8")).toContain('"canonical": "GEMINI.md"');
    expect(await readFile(join(root, ".agent-md", "manifest.json"), "utf8")).toContain('"id": "project"');
  });

  it("keeps mirror targets disabled when only the primary model is selected", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "claude" });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.canonical).toBe("CLAUDE.md");
    expect(config.targets).toEqual([
      { path: "AGENTS.md", mode: "mirror", enabled: false },
      { path: "GEMINI.md", mode: "mirror", enabled: false },
      { path: ".codex/AGENTS.md", mode: "mirror", enabled: false },
      { path: ".github/copilot-instructions.md", mode: "mirror", enabled: false }
    ]);
  });

  it("enables only explicitly selected mirror targets", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "claude", mirrors: ["opencode", "gemini"] });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));

    expect(config.targets).toEqual([
      { path: "AGENTS.md", mode: "mirror", enabled: true },
      { path: "GEMINI.md", mode: "mirror", enabled: true },
      { path: ".codex/AGENTS.md", mode: "mirror", enabled: false },
      { path: ".github/copilot-instructions.md", mode: "mirror", enabled: false }
    ]);
  });

  it("rejects ambiguous existing instruction files with different content", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude rules\n", "utf8");

    await expect(runInit(root)).rejects.toThrow(/Choose the primary model explicitly/);
  });

  it("allows explicit model when existing instruction files differ", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# OpenCode rules\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude rules\n", "utf8");

    expect(await runInit(root, { model: "claude" })).toBe("Created .agent-md.json with canonical CLAUDE.md");
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
});
