import { discoverScopes, formatScopeIdForUser, type ScopeSelection } from "../core/scope-context.js";
import { manifestPathForScope, readManifest } from "../core/manifest.js";
import { createSyncPlan } from "../core/sync.js";

export type DoctorCommandOptions = {
  scope?: ScopeSelection;
};

export async function runDoctor(root: string, options: DoctorCommandOptions = {}): Promise<string> {
  const scopes = await discoverScopes(root, options.scope);
  const output: string[] = [];

  for (const scope of scopes) {
    const lines = [`scope: ${formatScopeIdForUser(scope.id)} ${scope.root}`, `  primary: ${scope.primary} [${scope.adopted ? "managed" : "detected"}]`];

    if (!scope.adopted || !scope.config) {
      lines.push("  manifest: missing", "  aliases:");

      if (scope.kind === "global")
        lines.push(`  hint: run /omm:init --scope ${scope.id} --adopt to manage this file.`);

      if (scope.overridePath)
        lines.push(`  override: ${scope.overridePath} [read-only]`);

      output.push(lines.join("\n"));
      continue;
    }

    let plan;

    try {
      plan = await createSyncPlan(scope.root, scope.config);
    } catch (error) {
      if (error instanceof Error && (error.message.includes("Canonical instruction file not found") || error.message.includes("canonical instruction markdown"))) {
        const manifest = await readManifest(scope.root, manifestPathForScope(scope.config.scope.id));

        lines.push(`  manifest: ${manifest ? "present" : "missing"}`, "  aliases:", `  error: ${error.message}`);
        output.push(lines.join("\n"));
        continue;
      }

      throw error;
    }

    lines.push(`  manifest: ${plan.manifest ? "present" : "missing"}`, "  aliases:");

    for (const alias of plan.aliases)
      lines.push(`    ${alias.path} [${alias.status}]`);

    if (scope.overridePath)
      lines.push(`  override: ${scope.overridePath} [read-only]`);

    output.push(lines.join("\n"));
  }

  return output.join("\n");
}
