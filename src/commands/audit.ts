import { loadConfig } from "../core/config.js";
import { resolveCanonical } from "../core/canonical.js";
import { auditMarkdown, scoreMarkdownQuality } from "../core/audit-rules.js";

export type AuditReport = {
  output: string;
  hasErrors: boolean;
};

export async function runAudit(root: string): Promise<string> {
  return (await runAuditReport(root)).output;
}

export async function runAuditReport(root: string): Promise<AuditReport> {
  const config = await loadConfig(root);
  const canonical = await resolveCanonical(root, config);
  const findings = auditMarkdown(canonical.content, config.audit);
  const quality = scoreMarkdownQuality(canonical.content, findings);
  const qualityOutput = [
    `${canonical.path} quality: ${quality.score}/100 (${quality.grade})`,
    ...quality.criteria.map((criterion) => `${criterion.name}: ${criterion.score}/${criterion.maxScore} - ${criterion.message}`)
  ];

  if (findings.length === 0)
    return { output: [...qualityOutput, `No findings in ${canonical.path}`].join("\n"), hasErrors: false };

  return {
    output: [
      ...qualityOutput,
      ...findings.map((finding) => `${canonical.path}:${finding.line} ${finding.severity} ${finding.rule} - ${finding.message}`)
    ].join("\n"),
    hasErrors: findings.some((finding) => finding.severity === "error")
  };
}
