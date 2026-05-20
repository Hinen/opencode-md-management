import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runInit } from "../src/commands/init.js";
import { runSync } from "../src/commands/sync.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("runDoctor", () => {
  it("reports manifest presence", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await runInit(root);

    expect(await runDoctor(root)).toContain("manifest: missing");
    await runSync(root, { apply: true });
    expect(await runDoctor(root)).toContain("manifest: present");
  });
});
