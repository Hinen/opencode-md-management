import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { discoverInstructionScopes } from "../src/core/scope.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("instruction scopes", () => {
  it("discovers project, local, and nested CLAUDE scopes", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");
    await writeFile(join(root, ".claude.local.md"), "local", "utf8");
    await mkdir(join(root, "packages", "api"), { recursive: true });
    await writeFile(join(root, "packages", "api", "CLAUDE.md"), "api", "utf8");

    const scopes = await discoverInstructionScopes(root, parseConfig({ canonical: "AGENTS.md", targets: [] }), "all");

    expect(scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "project", canonical: "AGENTS.md", kind: "project" }),
      expect.objectContaining({ id: "local", canonical: ".claude.local.md", kind: "local" }),
      expect.objectContaining({ id: "packages/api", canonical: "CLAUDE.md", kind: "nested" })
    ]));
  });
});
