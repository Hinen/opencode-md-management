import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
    expect(report.output).toContain("AGENTS.md quality:");
    expect(report.output).toContain("error secret-like-value");
  });

  it("reports quality scoring when there are no findings", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), [
      "# Project Instructions",
      "## Commands",
      "- Run `npm test` before reporting completion.",
      "- Run `npm run build` before publishing.",
      "## Architecture",
      "- Source lives in `src/` and tests live in `test/`.",
      "## Gotchas",
      "- Always keep proposal approval separate from sync apply.",
      "- Never apply sync without reviewing the generated diff.",
      "- You must keep local-only notes out of mirrored files."
    ].join("\n"), "utf8");
    await runInit(root);

    const report = await runAuditReport(root);

    expect(report.hasErrors).toBe(false);
    expect(report.output).toContain("AGENTS.md quality: 100/100 (A)");
    expect(report.output).toContain("Commands/Workflows: 20/20");
    expect(report.output).toContain("No findings in AGENTS.md");
  });

  it("audits discovered scopes", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n- Run `npm test`.\n", "utf8");
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await writeFile(join(root, "packages", "api", "CLAUDE.md"), "# API\n- Run `npm test -- api`.\n", "utf8");
    await runInit(root);

    const report = await runAuditReport(root, { scope: "all" });

    expect(report.output).toContain("scope: project");
    expect(report.output).toContain("scope: packages/api");
    expect(report.output).toContain("CLAUDE.md quality:");
  });
});
