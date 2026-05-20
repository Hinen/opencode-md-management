import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { isGitClean } from "../src/util/git.js";

const execFileAsync = promisify(execFile);

async function createGitRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opencode-md-management-"));

  await execFileAsync("git", ["init"], { cwd: root });

  return root;
}

describe("isGitClean", () => {
  it("ignores agent-md internal changes", async () => {
    const root = await createGitRoot();

    await mkdir(join(root, ".agent-md"));
    await writeFile(join(root, ".agent-md", "manifest.json"), "{}", "utf8");

    expect(await isGitClean(root)).toBe(true);
  });

  it("detects regular working tree changes", async () => {
    const root = await createGitRoot();

    await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

    expect(await isGitClean(root)).toBe(false);
  });
});
