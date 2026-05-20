import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("runInit", () => {
  it("throws a friendly error when config exists", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    await expect(runInit(root)).rejects.toThrow(/\.agent-md\.json already exists/);
  });
});
