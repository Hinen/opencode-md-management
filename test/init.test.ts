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

  it("uses the explicit primary model as canonical", async () => {
    const root = await createTempRoot();

    expect(await runInit(root, { model: "gemini" })).toBe("Created .agent-md.json with canonical GEMINI.md");
    expect(await readFile(join(root, ".agent-md.json"), "utf8")).toContain('"canonical": "GEMINI.md"');
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
});
