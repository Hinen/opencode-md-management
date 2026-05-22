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

  it("sets mode to symlink when enabling with mode symlink", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });
    await runMirrors(root, { enable: ["claude"], mode: "symlink" });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const claudeTarget = config.targets.find((target: { path: string }) => target.path === "CLAUDE.md");

    expect(claudeTarget.enabled).toBe(true);
    expect(claudeTarget.mode).toBe("symlink");
  });

  it("preserves explicit mirror mode when enabling with mode mirror", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });
    await runMirrors(root, { enable: ["gemini"], mode: "mirror" });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const geminiTarget = config.targets.find((target: { path: string }) => target.path === "GEMINI.md");

    expect(geminiTarget.enabled).toBe(true);
    expect(geminiTarget.mode).toBe("mirror");
  });

  it("does not change mode when disabling a target", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });
    await runMirrors(root, { enable: ["claude"], mode: "symlink" });
    await runMirrors(root, { disable: ["claude"] });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const claudeTarget = config.targets.find((target: { path: string }) => target.path === "CLAUDE.md");

    expect(claudeTarget.enabled).toBe(false);
    expect(claudeTarget.mode).toBe("symlink");
  });

  it("flips mode back to mirror when re-enabling after symlink", async () => {
    const root = await createTempRoot();

    await runInit(root, { model: "codex" });
    await runMirrors(root, { enable: ["claude"], mode: "symlink" });
    await runMirrors(root, { enable: ["claude"], mode: "mirror" });

    const config = JSON.parse(await readFile(join(root, ".agent-md.json"), "utf8"));
    const claudeTarget = config.targets.find((target: { path: string }) => target.path === "CLAUDE.md");

    expect(claudeTarget.enabled).toBe(true);
    expect(claudeTarget.mode).toBe("mirror");
  });
});
