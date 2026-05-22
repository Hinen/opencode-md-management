import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";
import { runMirrors } from "../src/commands/mirrors.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("runMirrors", () => {
  it("enables and disables mirror targets after init", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });

    expect(await runMirrors(root, { enable: ["opencode"] })).toBe("Enabled mirrors: AGENTS.md");

    let config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    expect(config.targets.find((target: { path: string }) => target.path === "AGENTS.md").enabled).toBe(true);

    expect(await runMirrors(root, { disable: ["opencode"] })).toBe("Enabled mirrors: none");

    config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    expect(config.targets.find((target: { path: string }) => target.path === "AGENTS.md").enabled).toBe(false);
  });

  it("rejects primary and non-project mirror changes", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });

    await expect(runMirrors(root, { enable: ["codex"] })).rejects.toThrow(/primary/);
    await expect(runMirrors(root, { enable: ["opencode"], scope: "local" })).rejects.toThrow(/project instruction files/);
  });
});
