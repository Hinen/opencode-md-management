import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runLearn } from "../src/commands/learn.js";

async function createConfiguredRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "opencode-md-management-"));

  await writeFile(join(root, ".agent-md.json"), JSON.stringify({ canonical: "AGENTS.md", aliases: [], sync: { requireGitClean: false } }), "utf8");
  await writeFile(join(root, "AGENTS.md"), "# Rules\n", "utf8");

  return root;
}

describe("runLearn", () => {
  it("creates proposals from explicit notes", async () => {
    const root = await createConfiguredRoot();
    const output = await runLearn(root, { notes: "Always run npm test" });

    expect(output).toContain("source: learn");
    expect(output).toContain("Run /omm:proposal-approve");
    expect(output).toContain("+Always run npm test");
  });

  it("creates proposals from agent-authored learned content", async () => {
    const root = await createConfiguredRoot();
    const output = await runLearn(root, {
      notes: "Prefer small commits",
      after: "# Rules\n\n- Prefer small commits\n"
    });

    expect(output).toContain("source: learn");
    expect(output).toContain("+- Prefer small commits");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("# Rules\n");
  });

  it("creates proposals from notes files", async () => {
    const root = await createConfiguredRoot();
    const notesFile = join(root, "notes.md");

    await writeFile(notesFile, "Prefer small commits", "utf8");

    const output = await runLearn(root, { notesFile: "notes.md" });

    expect(output).toContain("+Prefer small commits");
  });

  it("requires explicit notes", async () => {
    const root = await createConfiguredRoot();

    await expect(runLearn(root, {})).rejects.toThrow(/requires/);
  });

  it("rejects ambiguous notes input", async () => {
    const root = await createConfiguredRoot();

    await writeFile(join(root, "notes.md"), "Prefer small commits", "utf8");

    await expect(runLearn(root, { notes: "Inline", notesFile: "notes.md" })).rejects.toThrow(/Cannot use both --notes and --notes-file/);
  });

  it("rejects notes files outside the worktree", async () => {
    const root = await createConfiguredRoot();

    await expect(runLearn(root, { notesFile: join(root, "..", "notes.md") })).rejects.toThrow(/escapes/);
  });
});
