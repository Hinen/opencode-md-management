import { mkdtemp, writeFile } from "node:fs/promises";
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

  it("throws a friendly error when config exists", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await expect(runInit(root)).rejects.toThrow(/\.agent-md\.json already exists/);
  });
});
