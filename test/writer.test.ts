import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite } from "../src/core/writer.js";
import { resolveInsideRoot } from "../src/util/fs.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("writer", () => {
  it("writes files atomically inside the root", async () => {
    const root = await createTempRoot();

    await atomicWrite("CLAUDE.md", "rules", { root, requireGitClean: false });

    expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("rules");
  });

  it("rejects paths outside the root", async () => {
    const root = await createTempRoot();

    expect(() => resolveInsideRoot(root, "../CLAUDE.md")).toThrow(/escapes/);
  });

  it("refuses to write directories", async () => {
    const root = await createTempRoot();

    await expect(atomicWrite(".", "rules", { root, requireGitClean: false })).rejects.toThrow(/non-file|file path/);
  });

  it("refuses to write through symlinks", async () => {
    const root = await createTempRoot();
    const outside = join(await createTempRoot(), "outside.md");

    await writeFile(outside, "outside", "utf8");

    try {
      await symlink(outside, join(root, "CLAUDE.md"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM")
        return;

      throw error;
    }

    await expect(atomicWrite("CLAUDE.md", "rules", { root, requireGitClean: false })).rejects.toThrow(/symlink/);
  });
});
