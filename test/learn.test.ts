import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLearn } from "../src/commands/learn.js";

async function createConfiguredRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opencode-md-management-"));

  await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", targets: [], sync: { requireGitClean: false } }), "utf8");
  await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

  return root;
}

describe("runLearn", () => {
  it("creates proposals from explicit notes", async () => {
    const root = await createConfiguredRoot();
    const output = await runLearn(root, { notes: "Always run npm test" });

    expect(output).toContain("kind: learn");
    expect(output).toContain("+Always run npm test");
  });

  it("creates proposals from notes files", async () => {
    const root = await createConfiguredRoot();
    const notesFile = join(root, "notes.md");

    await writeFile(notesFile, "Prefer small commits", "utf8");

    const output = await runLearn(root, { notesFile });

    expect(output).toContain("+Prefer small commits");
  });

  it("requires explicit notes", async () => {
    const root = await createConfiguredRoot();

    await expect(runLearn(root, {})).rejects.toThrow(/requires/);
  });
});
