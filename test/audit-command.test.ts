import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAuditReport } from "../src/commands/audit.js";
import { runInit } from "../src/commands/init.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("runAuditReport", () => {
  it("marks reports with error findings", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "token = abc123\n", "utf8");
    await runInit(root);

    const report = await runAuditReport(root);

    expect(report.hasErrors).toBe(true);
    expect(report.output).toContain("error secret-like-value");
  });
});
