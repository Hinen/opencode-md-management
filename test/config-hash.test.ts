import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";

describe("config and hash", () => {
  it("applies config defaults", () => {
    const config = parseConfig({ targets: [{ path: "CLAUDE.md" }] });

    expect(config.targets[0]).toEqual({ path: "CLAUDE.md", mode: "mirror", enabled: true });
    expect(config.sync.requireGitClean).toBe(true);
    expect(config.audit.maxSectionLines).toBe(200);
    expect(config.audit.duplicateContentMinWords).toBe(12);
    expect(config.audit.checkLocalLinks).toBe(true);
  });

  it("upgrades legacy canonical configs to v2 shape in memory", () => {
    const config = parseConfig({ canonical: "CLAUDE.md", targets: [] });

    expect(config.schemaVersion).toBe(2);
    expect(config.primary).toBe("CLAUDE.md");
    expect(config.scope).toEqual({ id: "project", kind: "project", tool: null });
  });

  it("rejects legacy local target mode", () => {
    expect(() => parseConfig({ targets: [{ path: ".claude.local.md", mode: "local" }] })).toThrow();
  });

  it("does not expose the removed toast block", () => {
    const config = parseConfig({ toast: { onDrift: true } });

    expect((config as { toast?: unknown }).toast).toBeUndefined();
  });

  it("normalizes line endings before hashing", () => {
    expect(hashContent("a\nb\n")).toBe(hashContent("a\r\nb\r\n"));
  });
});
