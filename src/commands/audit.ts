import { loadConfig } from "../core/config.js";
import { resolveCanonical } from "../core/canonical.js";
import { auditMarkdown } from "../core/audit-rules.js";

export async function runAudit(root: string): Promise<string> {
  const config = await loadConfig(root);
  const canonical = await resolveCanonical(root, config);
  const findings = auditMarkdown(canonical.content, config.audit);

  if (findings.length === 0)
    return `No findings in ${canonical.path}`;

  return findings
    .map((finding) => `${canonical.path}:${finding.line} ${finding.severity} ${finding.rule} - ${finding.message}`)
    .join("\n");
}
