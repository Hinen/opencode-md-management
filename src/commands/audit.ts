import { loadConfig } from "../core/config.js";
import { resolveCanonical } from "../core/canonical.js";
import { auditMarkdown, scoreMarkdownQuality } from "../core/audit-rules.js";
import { configForScope, discoverInstructionScopes, type ScopeSelection } from "../core/scope.js";

export type AuditReport = {
  output: string;
  hasErrors: boolean;
};

export type AuditCommandOptions = {
  scope?: ScopeSelection;
};

export async function runAudit(root: string, options: AuditCommandOptions = {}): Promise<string> {
  return (await runAuditReport(root, options)).output;
}

export async function runAuditReport(root: string, options: AuditCommandOptions = {}): Promise<AuditReport> {
  const config = await loadConfig(root);
  const scopes = await discoverInstructionScopes(root, config, options.scope);
  const reports = await Promise.all(scopes.map((scope) => auditScope(scope.root, configForScope(config, scope), scope.id)));

  return {
    output: reports.map((report) => report.output).join("\n"),
    hasErrors: reports.some((report) => report.hasErrors)
  };
}

async function auditScope(root: string, config: Awaited<ReturnType<typeof loadConfig>>, scopeId: string): Promise<AuditReport> {
  const canonical = await resolveCanonical(root, config);
  const findings = auditMarkdown(canonical.content, config.audit);
  const quality = scoreMarkdownQuality(canonical.content, findings);
  const qualityOutput = [
    `scope: ${scopeId}`,
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
