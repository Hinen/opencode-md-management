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
  duplicateContentMinWords: number;
  checkLocalLinks: boolean;
};

const vagueInstructionPattern = /\b(later|maybe|if needed|appropriate|as needed|나중에|적절히|필요시)\b/i;
const secretPattern = /(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]+/i;

export function auditMarkdown(content: string, options: AuditOptions): AuditFinding[] {
  const lines = content.split("\n");
  const findings: AuditFinding[] = [];
  const headings = new Map<string, number>();
  const instructionLines = new Map<string, number>();
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

    if (heading && isOrphanedHeading(lines, index)) {
      findings.push({
        rule: "orphaned-heading",
        severity: "warning",
        message: "Heading has no content",
        line: lineNumber
      });
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

    const duplicateKey = normalizeInstructionLine(line);

    if (wordCount(duplicateKey) >= options.duplicateContentMinWords) {
      const previousLine = instructionLines.get(duplicateKey);

      if (previousLine !== undefined) {
        findings.push({
          rule: "duplicate-content",
          severity: "warning",
          message: `Similar instruction content also appears on line ${previousLine}`,
          line: lineNumber
        });
      } else {
        instructionLines.set(duplicateKey, lineNumber);
      }
    }

    if (options.checkLocalLinks) {
      for (const finding of auditLocalLinks(line, lineNumber))
        findings.push(finding);
    }
  }

  checkSectionLength(lines.length + 1);

  return findings;
}

export function scoreMarkdownQuality(content: string, findings: AuditFinding[]): AuditQualityReport {
  const criteria: AuditQualityCriterion[] = [
    scoreCommands(content),
    scoreArchitecture(content),
    scorePatterns(content),
    scoreConciseness(content, findings),
    scoreCurrency(findings),
    scoreActionability(content, findings)
  ];
  const score = criteria.reduce((sum, criterion) => sum + criterion.score, 0);

  return { score, grade: gradeScore(score), criteria };
}

function scoreCommands(content: string): AuditQualityCriterion {
  const concreteCommandMatches = countMatches(content, [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:install|test|build|run|lint|check|typecheck)\b/gi,
    /\b(?:dotnet\s+(?:build|test|run)|cargo\s+(?:build|test|run)|go\s+test|pytest|vitest)\b/gi
  ]);
  const genericCommandMatches = countMatches(content, [/\b(?:test|build|lint|typecheck)\b/gi]);
  const score = concreteCommandMatches > 0 ? Math.min(20, 15 + (concreteCommandMatches - 1) * 5) : Math.min(10, genericCommandMatches * 5);

  return criterion("Commands/Workflows", score, 20, "Documents concrete build/test/development commands.");
}

function scoreArchitecture(content: string): AuditQualityCriterion {
  const hasArchitectureSection = /^#+\s+(?:architecture|project structure|structure|구조|프로젝트 구조|modules|모듈)\b/mi.test(content);
  const keywordMatches = countMatches(content, [/\b(?:src|test|tests|package|module|entry|lib|dist|architecture)\b/gi, /(?:구조|모듈|진입점)/g]);
  const score = Math.min(20, (hasArchitectureSection ? 10 : 0) + Math.min(10, keywordMatches * 2));

  return criterion("Architecture Clarity", score, 20, "Explains project structure, modules, or entry points.");
}

function scorePatterns(content: string): AuditQualityCriterion {
  const patternMatches = countMatches(content, [/\b(?:gotcha|quirk|workaround|never|always|important|caution|must)\b/gi, /(?:주의|예외|반드시|금지)/g]);
  const score = patternMatches === 0 ? 0 : Math.min(15, 9 + (patternMatches - 1) * 3);

  return criterion("Non-Obvious Patterns", score, 15, "Captures project-specific gotchas or required patterns.");
}

function scoreConciseness(content: string, findings: AuditFinding[]): AuditQualityCriterion {
  const nonEmptyLines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const hasVagueInstruction = findings.some((finding) => finding.rule === "vague-instruction");
  let score = 0;

  if (nonEmptyLines.length > 0 && nonEmptyLines.length <= 150)
    score += 7;
  else if (nonEmptyLines.length <= 200)
    score += 5;
  else if (nonEmptyLines.length <= 300)
    score += 2;

  if (wordCount <= 3000)
    score += 5;
  else if (wordCount <= 5000)
    score += 3;

  if (!hasVagueInstruction)
    score += 3;

  return criterion("Conciseness", score, 15, "Keeps guidance concise and avoids vague wording.");
}

function scoreCurrency(findings: AuditFinding[]): AuditQualityCriterion {
  let score = 15;

  if (findings.some((finding) => finding.rule === "duplicate-heading"))
    score -= 7;

  if (findings.some((finding) => finding.rule === "duplicate-content"))
    score -= 5;

  if (findings.some((finding) => finding.rule === "orphaned-heading"))
    score -= 4;

  if (findings.some((finding) => finding.rule === "section-length"))
    score -= 8;

  return criterion("Currency", Math.max(0, score), 15, "Avoids stale duplicate headings and oversized sections.");
}

function scoreActionability(content: string, findings: AuditFinding[]): AuditQualityCriterion {
  const hasLists = /^[-*]\s+\S/m.test(content);
  const hasInlineCode = /`[^`]+`/.test(content);
  const codeBlockCount = (content.match(/```/g) ?? []).length / 2;
  const hasSecrets = findings.some((finding) => finding.severity === "error");
  let score = 0;

  if (hasLists)
    score += 5;

  if (hasInlineCode)
    score += 8;

  if (codeBlockCount >= 1)
    score += 4;

  if (!hasSecrets)
    score += 2;

  return criterion("Actionability", Math.min(15, score), 15, "Provides concrete, copy-ready instructions without secret-like values.");
}

function criterion(name: string, score: number, maxScore: number, message: string): AuditQualityCriterion {
  return { name, score, maxScore, message };
}

function countMatches(content: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => sum + (content.match(pattern) ?? []).length, 0);
}

function isOrphanedHeading(lines: string[], headingIndex: number): boolean {
  const currentHeading = /^(#+)\s+/.exec(lines[headingIndex]);
  const currentLevel = currentHeading?.[1].length ?? 0;

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (line.length === 0)
      continue;

    const nextHeading = /^(#+)\s+/.exec(line);

    if (!nextHeading)
      return false;

    if (nextHeading[1].length > currentLevel)
      continue;

    return true;
  }

  return true;
}

function normalizeInstructionLine(line: string): string {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function auditLocalLinks(line: string, lineNumber: number): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(line)) !== null) {
    const target = match[1].trim();

    if (target.length === 0) {
      findings.push({
        rule: "invalid-local-link",
        severity: "warning",
        message: "Markdown link target is empty",
        line: lineNumber
      });
      continue;
    }

    if (isExternalLink(target) || target.startsWith("#"))
      continue;

    if (target.startsWith("../") || target.includes("/../") || target.includes("\\..\\")) {
      findings.push({
        rule: "invalid-local-link",
        severity: "warning",
        message: "Local markdown link escapes the instruction file scope",
        line: lineNumber
      });
    }
  }

  return findings;
}

function isExternalLink(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
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
