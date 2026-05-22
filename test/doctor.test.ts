import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

    expect(await runDoctor(root)).toContain("manifest: present");
    await runSync(root, { apply: true });
    expect(await runDoctor(root)).toContain("manifest: present");
  });

  it("keeps manifest status when the primary file is missing", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "claude" });
    await rm(join(root, "CLAUDE.md"));

    const output = await runDoctor(root);

    expect(output).toContain("manifest: present");
    expect(output).toContain("error:");
  });

  it("reports all discovered scopes", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await writeFile(join(root, ".claude.local.md"), "# Local\n", "utf8");
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await writeFile(join(root, "packages", "api", "CLAUDE.md"), "# API\n", "utf8");
    await runInit(root);

    const output = await runDoctor(root, { scope: "all" });

    expect(output).toContain("scope: project");
    expect(output).toContain("scope: local");
    expect(output).toContain("scope: packages/api");
  });

  it("reports explicitly selected local scope without replacing the project manifest", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");
    await writeFile(join(root, ".claude.local.md"), "# Local\n", "utf8");
    await runInit(root);
    const projectManifest = await readFile(join(root, ".agent-md", "manifest.json"), "utf8");

    await runInit(root, { scope: "local", adopt: true });

    expect(await runDoctor(root, { scope: "local" })).toContain("scope: local");
    expect(await readFile(join(root, ".agent-md", "manifest.json"), "utf8")).toBe(projectManifest);
    expect(await readFile(join(root, ".agent-md.local", "manifest.json"), "utf8")).toContain('"id": "local"');
  });
});
