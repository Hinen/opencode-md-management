import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertManagedPath, assertUniqueManagedPaths, resolveInsideRoot } from "../src/util/fs.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("managed path validation", () => {
  it("rejects paths outside the root", async () => {
    const root = await createTempRoot();

    expect(() => resolveInsideRoot(root, "../CLAUDE.md")).toThrow(/escapes/);
    expect(() => assertManagedPath("../CLAUDE.md")).toThrow(/inside/);
  });

  it("rejects directory and control file targets", () => {
    expect(() => assertManagedPath(".")).toThrow(/file path/);
    expect(() => assertManagedPath(".agent-md/manifest.json")).toThrow(/control/);
    expect(() => assertManagedPath(".agent-md.json")).toThrow(/control/);
  });

  it("rejects target paths matching the canonical path", () => {
    expect(() => assertManagedPath("AGENTS.md", { canonical: "AGENTS.md" })).toThrow(/canonical/);
  });

  it("rejects duplicate managed paths", () => {
    expect(() => assertUniqueManagedPaths(["CLAUDE.md", "claude.md"])).toThrow(/Duplicate/);
  });
});
