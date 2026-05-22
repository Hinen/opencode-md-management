import { describe, expect, it } from "vitest";
import { auditMarkdown, scoreMarkdownQuality } from "../src/core/audit-rules.js";

function auditOptions() {
  return {
    maxSectionLines: 200,
    forbidSecretsPatterns: true,
    duplicateContentMinWords: 12,
    checkLocalLinks: true
  };
}

describe("auditMarkdown", () => {
  it("detects duplicate headings and vague instructions", () => {
    const findings = auditMarkdown("# Rules\nDo this later\n# Rules\n", auditOptions());

    expect(findings.map((finding) => finding.rule)).toContain("duplicate-heading");
    expect(findings.map((finding) => finding.rule)).toContain("vague-instruction");
  });

  it("detects secret-like values", () => {
    const findings = auditMarkdown("token = abc123", auditOptions());

    expect(findings[0]).toMatchObject({ rule: "secret-like-value", severity: "error", line: 1 });
  });

  it("detects an overlong final section", () => {
    const findings = auditMarkdown("# Rules\n1\n2\n3", {
      maxSectionLines: 2,
      forbidSecretsPatterns: true,
      duplicateContentMinWords: 12,
      checkLocalLinks: true
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
    const findings = auditMarkdown(content, auditOptions());
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
    const findings = auditMarkdown(content, auditOptions());
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

  it("detects orphaned headings", () => {
    const findings = auditMarkdown("# Rules\n## Empty\n## Next\n- Run `npm test`.\n", auditOptions());

    expect(findings).toContainEqual(expect.objectContaining({ rule: "orphaned-heading", line: 2 }));
  });

  it("detects duplicate instruction content", () => {
    const content = [
      "# Rules",
      "- Always run `npm test` before reporting completion to the user.",
      "## QA",
      "- Always run `npm test` before reporting completion to the user."
    ].join("\n");
    const findings = auditMarkdown(content, { ...auditOptions(), duplicateContentMinWords: 8 });

    expect(findings).toContainEqual(expect.objectContaining({ rule: "duplicate-content", line: 4 }));
  });

  it("detects invalid local links", () => {
    const findings = auditMarkdown("# Rules\nSee [secret](../secret.md).\n", auditOptions());

    expect(findings).toContainEqual(expect.objectContaining({ rule: "invalid-local-link", line: 2 }));
  });
});
