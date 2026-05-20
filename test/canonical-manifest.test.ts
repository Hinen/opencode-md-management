import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCanonical } from "../src/core/canonical.js";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import { parseManifest, writeManifest } from "../src/core/manifest.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

describe("canonical and manifest", () => {
  it("resolves AGENTS.md before CLAUDE.md", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "agents", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "claude", "utf8");

    const canonical = await resolveCanonical(root, parseConfig({ targets: [] }));

    expect(canonical.path).toBe("AGENTS.md");
    expect(canonical.content).toBe("agents");
  });

  it("round-trips manifest files", async () => {
    const root = await createTempRoot();
    const manifest = parseManifest({
      version: 1,
      canonical: { path: "AGENTS.md", hash: hashContent("rules") },
      targets: [{ path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hashContent("rules") }]
    });

    await writeManifest(root, manifest);

    const raw = await readFile(join(root, ".agent-md", "manifest.json"), "utf8");

    expect(JSON.parse(raw)).toEqual(manifest);
  });
});
