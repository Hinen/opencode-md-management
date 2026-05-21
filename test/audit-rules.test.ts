import { describe, expect, it } from "vitest";
import { auditMarkdown, scoreMarkdownQuality } from "../src/core/audit-rules.js";

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

  it("detects an overlong final section", () => {
    const findings = auditMarkdown("# Rules\n1\n2\n3", {
      maxSectionLines: 2,
      forbidSecretsPatterns: true
    });

    expect(findings).toContainEqual(expect.objectContaining({ rule: "section-length", line: 1 }));
  });

  it("scores markdown quality with Claude md management criteria", () => {
    const content = [
      "# Project Instructions",
      "## Commands",
      "- Run `npm test` before reporting completion.",
      "- Run `npm run build` before publishing.",
      "## Architecture",
      "- Source lives in `src/` and tests live in `test/`.",
      "## Gotchas",
      "- Always keep proposal approval separate from sync apply.",
      "- Never apply sync without reviewing the generated diff.",
      "- You must keep local-only notes out of mirrored files."
    ].join("\n");
    const findings = auditMarkdown(content, { maxSectionLines: 200, forbidSecretsPatterns: true });
    const quality = scoreMarkdownQuality(content, findings);

    expect(quality).toMatchObject({ score: 100, grade: "A" });
    expect(quality.criteria.map((criterion) => criterion.name)).toEqual([
      "Commands/Workflows",
      "Architecture Clarity",
      "Non-Obvious Patterns",
      "Conciseness",
      "Currency",
      "Actionability"
    ]);
  });

  it("assigns partial scores instead of binary pass or fail", () => {
    const content = [
      "# Project Instructions",
      "## Commands",
      "- Run test before release.",
      "## Architecture",
      "- The module entry is documented.",
      "## Notes",
      "- Maybe refine this later."
    ].join("\n");
    const findings = auditMarkdown(content, { maxSectionLines: 200, forbidSecretsPatterns: true });
    const quality = scoreMarkdownQuality(content, findings);
    const commands = quality.criteria.find((criterion) => criterion.name === "Commands/Workflows");
    const patterns = quality.criteria.find((criterion) => criterion.name === "Non-Obvious Patterns");
    const conciseness = quality.criteria.find((criterion) => criterion.name === "Conciseness");

    expect(commands?.score).toBeGreaterThan(0);
    expect(commands?.score).toBeLessThan(commands!.maxScore);
    expect(patterns?.score).toBe(0);
    expect(conciseness?.score).toBeGreaterThan(0);
    expect(conciseness?.score).toBeLessThan(conciseness!.maxScore);
  });
});
