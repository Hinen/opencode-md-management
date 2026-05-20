import { describe, expect, it } from "vitest";
import { auditMarkdown } from "../src/core/audit-rules.js";

describe("auditMarkdown", () => {
  it("detects duplicate headings and vague instructions", () => {
    const findings = auditMarkdown("# Rules\nDo this later\n# Rules\n", {
      maxSectionLines: 200,
      forbidSecretsPatterns: true
    });

    expect(findings.map((finding) => finding.rule)).toContain("duplicate-heading");
    expect(findings.map((finding) => finding.rule)).toContain("vague-instruction");
  });

  it("detects secret-like values", () => {
    const findings = auditMarkdown("token = abc123", {
      maxSectionLines: 200,
      forbidSecretsPatterns: true
    });

    expect(findings[0]).toMatchObject({ rule: "secret-like-value", severity: "error", line: 1 });
  });
});
