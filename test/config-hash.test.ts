import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";

describe("config and hash", () => {
  it("applies config defaults", () => {
    const config = parseConfig({ aliases: ["CLAUDE.md"] });

    expect(config.aliases).toEqual(["CLAUDE.md"]);
    expect(config.sync.requireGitClean).toBe(true);
    expect(config.audit.maxSectionLines).toBe(200);
    expect(config.audit.duplicateContentMinWords).toBe(12);
    expect(config.audit.checkLocalLinks).toBe(true);
  });

  it("upgrades legacy canonical configs to v3 shape in memory", () => {
    const config = parseConfig({ canonical: "CLAUDE.md", aliases: [] });

    expect(config.schemaVersion).toBe(3);
    expect(config.primary).toBe("CLAUDE.md");
    expect(config.canonical).toBe("CLAUDE.md");
    expect(config.scope).toEqual({ id: "project", kind: "project", tool: null });
  });

  it("migrates legacy targets array to aliases preserving only enabled entries", () => {
    const config = parseConfig({
      canonical: "AGENTS.md",
      targets: [
        { path: "CLAUDE.md", mode: "symlink", enabled: true },
        { path: "GEMINI.md", mode: "mirror", enabled: false },
        { path: ".codex/AGENTS.md", mode: "mirror", enabled: true }
      ]
    });

    expect(config.aliases).toEqual(["CLAUDE.md", ".codex/AGENTS.md"]);
  });

  it("does not expose the removed toast block", () => {
    const config = parseConfig({ toast: { onDrift: true } });

    expect((config as { toast?: unknown }).toast).toBeUndefined();
  });

  it("normalizes line endings before hashing", () => {
    expect(hashContent("a\nb\n")).toBe(hashContent("a\r\nb\r\n"));
  });

  it("rejects alias paths matching the primary path", () => {
    expect(() => parseConfig({ primary: "AGENTS.md", aliases: ["AGENTS.md"] })).toThrow();
  });

  it("rejects duplicate alias paths", () => {
    expect(() => parseConfig({ primary: "AGENTS.md", aliases: ["CLAUDE.md", "claude.md"] })).toThrow();
  });
});
