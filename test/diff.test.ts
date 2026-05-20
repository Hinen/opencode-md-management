import { describe, expect, it } from "vitest";
import { renderUnifiedDiff } from "../src/core/diff.js";

describe("renderUnifiedDiff", () => {
  it("renders a simple unified diff", () => {
    const diff = renderUnifiedDiff("CLAUDE.md", "old\n", "new\n");

    expect(diff).toContain("--- a/CLAUDE.md");
    expect(diff).toContain("@@ -1,2 +1,2 @@");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });

  it("renders inserted lines without rewriting following context", () => {
    const diff = renderUnifiedDiff("AGENTS.md", "# Rules\none\nthree", "# Rules\none\ntwo\nthree");

    expect(diff).toContain("+two");
    expect(diff).toContain(" three");
    expect(diff).not.toContain("-three");
  });

  it("splits distant changes into multiple hunks", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");
    const after = ["a", "B", "c", "d", "e", "f", "g", "h", "I", "j"].join("\n");
    const diff = renderUnifiedDiff("AGENTS.md", before, after, { context: 1 });

    expect(diff.match(/^@@/gm)).toHaveLength(2);
  });
});
