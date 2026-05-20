export type AuditSeverity = "warning" | "error";

export type AuditFinding = {
  rule: string;
  severity: AuditSeverity;
  message: string;
  line: number;
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
