export type AuditSeverity = "warning" | "error";

export type AuditFinding = {
  rule: string;
  severity: AuditSeverity;
  message: string;
  line: number;
};

export type AuditQualityCriterion = {
  name: string;
  score: number;
  maxScore: number;
  message: string;
};

export type AuditQualityReport = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  criteria: AuditQualityCriterion[];
};

export type AuditOptions = {
  maxSectionLines: number;
  forbidSecretsPatterns: boolean;
};

const vagueInstructionPattern = /\b(later|maybe|if needed|appropriate|as needed|나중에|적절히|필요시)\b/i;
const secretPattern = /(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]+/i;

export function auditMarkdown(content: string, options: AuditOptions): AuditFinding[] {
  const lines = content.split("\n");
  const findings: AuditFinding[] = [];
  const headings = new Map<string, number>();
  let currentSectionStart = 1;

  const checkSectionLength = (lineNumber: number) => {
    if (lineNumber - currentSectionStart <= options.maxSectionLines)
      return;

    findings.push({
      rule: "section-length",
      severity: "warning",
      message: `Section exceeds ${options.maxSectionLines} lines`,
      line: currentSectionStart
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const heading = /^(#+)\s+(.+)$/.exec(line);

    if (heading) {
      checkSectionLength(lineNumber);

      currentSectionStart = lineNumber;

      const title = heading[2].trim().toLowerCase();
      const previousLine = headings.get(title);

      if (previousLine !== undefined) {
        findings.push({
          rule: "duplicate-heading",
          severity: "warning",
          message: `Duplicate heading also appears on line ${previousLine}`,
          line: lineNumber
        });
      }

      headings.set(title, lineNumber);
    }

    if (vagueInstructionPattern.test(line)) {
      findings.push({
        rule: "vague-instruction",
        severity: "warning",
        message: "Instruction contains vague wording",
        line: lineNumber
      });
    }

    if (options.forbidSecretsPatterns && secretPattern.test(line)) {
      findings.push({
        rule: "secret-like-value",
        severity: "error",
        message: "Line looks like it may contain a secret",
        line: lineNumber
      });
    }
  }

  checkSectionLength(lines.length + 1);

  return findings;
}

export function scoreMarkdownQuality(content: string, findings: AuditFinding[]): AuditQualityReport {
  const lines = content.split("\n");
  const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
  const criteria: AuditQualityCriterion[] = [
    scoreCriterion(
      "Commands/Workflows",
      20,
      /\b(npm|pnpm|yarn|bun|dotnet|cargo|go test|pytest|vitest|test|build|lint)\b/i.test(content),
      "Documents concrete build/test/development commands."
    ),
    scoreCriterion(
      "Architecture Clarity",
      20,
      /\b(src|test|package|module|entry|architecture|구조|모듈)\b/i.test(content),
      "Explains project structure, modules, or entry points."
    ),
    scoreCriterion(
      "Non-Obvious Patterns",
      15,
      /\b(gotcha|quirk|workaround|주의|예외|반드시|never|always)\b/i.test(content),
      "Captures project-specific gotchas or required patterns."
    ),
    scoreCriterion(
      "Conciseness",
      15,
      nonEmptyLines.length > 0 && nonEmptyLines.length <= 200 && findings.every((finding) => finding.rule !== "vague-instruction"),
      "Keeps guidance concise and avoids vague wording."
    ),
    scoreCriterion(
      "Currency",
      15,
      !findings.some((finding) => finding.rule === "duplicate-heading" || finding.rule === "section-length"),
      "Avoids stale duplicate headings and oversized sections."
    ),
    scoreCriterion(
      "Actionability",
      15,
      nonEmptyLines.some((line) => /^[-*]\s+\S/.test(line) || /`[^`]+`/.test(line)) && findings.every((finding) => finding.severity !== "error"),
      "Provides concrete, copy-ready instructions without secret-like values."
    )
  ];
  const score = criteria.reduce((sum, criterion) => sum + criterion.score, 0);

  return { score, grade: gradeScore(score), criteria };
}

function scoreCriterion(name: string, maxScore: number, passed: boolean, message: string): AuditQualityCriterion {
  return { name, score: passed ? maxScore : 0, maxScore, message };
}

function gradeScore(score: number): AuditQualityReport["grade"] {
  if (score >= 90)
    return "A";

  if (score >= 80)
    return "B";

  if (score >= 70)
    return "C";

  if (score >= 60)
    return "D";

  return "F";
}
