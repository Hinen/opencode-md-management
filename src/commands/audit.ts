import { resolveCanonical } from "../core/canonical.js";
import { auditMarkdown, scoreMarkdownQuality } from "../core/audit-rules.js";
import { parseConfig } from "../core/config.js";
import { discoverScopes, type ScopeContext, type ScopeSelection } from "../core/scope-context.js";
import { createSyncPlan } from "../core/sync.js";

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
  const scopes = await discoverScopes(root, options.scope);
  const reports = await Promise.all(scopes.map((scope) => auditScope(scope)));

  return {
    output: reports.map((report) => report.output).join("\n"),
    hasErrors: reports.some((report) => report.hasErrors)
  };
}

async function auditScope(scope: ScopeContext): Promise<AuditReport> {
  const config = scope.config ?? parseConfig({ scope: { id: scope.id, kind: scope.kind, tool: scope.tool }, primary: scope.primary, targets: [] });
  let canonical;

  try {
    canonical = await resolveCanonical(scope.root, config);
  } catch (error) {
    if (error instanceof Error)
      return { output: [`scope: ${displayScopeId(scope.id)}`, `${scope.primary} [inventory-only]`, `No adopted config`, `error: ${error.message}`].join("\n"), hasErrors: false };

    throw error;
  }

  const findings = auditMarkdown(canonical.content, config.audit);
  const quality = scoreMarkdownQuality(canonical.content, findings);
  const qualityOutput = [
    `scope: ${displayScopeId(scope.id)}`,
    `${canonical.path} quality: ${quality.score}/100 (${quality.grade})`,
    ...quality.criteria.map((criterion) => `${criterion.name}: ${criterion.score}/${criterion.maxScore} - ${criterion.message}`),
    ...await targetStatusOutput(scope, config)
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

async function targetStatusOutput(scope: ScopeContext, config: ReturnType<typeof parseConfig>): Promise<string[]> {
  if (!scope.adopted || config.targets.length === 0)
    return [];

  const plan = await createSyncPlan(scope.root, config);

  if (plan.targets.length === 0)
    return [];

  return ["Targets:", ...plan.targets.map((target) => `${target.path}: ${target.status}`)];
}

function displayScopeId(id: string): string {
  return id.startsWith("nested:") ? id.slice("nested:".length) : id;
}
