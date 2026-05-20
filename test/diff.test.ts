import { describe, expect, it } from "vitest";
import { renderUnifiedDiff } from "../src/core/diff.js";

describe("renderUnifiedDiff", () => {
  it("renders a simple unified diff", () => {
    const diff = renderUnifiedDiff("CLAUDE.md", "old\n", "new\n");

    expect(diff).toContain("--- a/CLAUDE.md");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });
});
