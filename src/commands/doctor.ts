import { loadConfig } from "../core/config.js";
import { configForScope, discoverInstructionScopes, type ScopeSelection } from "../core/scope.js";
import { createSyncPlan } from "../core/sync.js";

export type DoctorCommandOptions = {
  scope?: ScopeSelection;
};

export async function runDoctor(root: string, options: DoctorCommandOptions = {}): Promise<string> {
  const config = await loadConfig(root);
  const scopes = await discoverInstructionScopes(root, config, options.scope);
  const output: string[] = [];

  for (const scope of scopes) {
    const plan = await createSyncPlan(scope.root, configForScope(config, scope));
    const manifestStatus = plan.manifest ? "present" : "missing";
    const lines = [`scope: ${scope.id} ${scope.root}`, `  canonical: ${plan.canonical.path} [ok]`, `  manifest: ${manifestStatus}`, "  targets:"];

    for (const target of plan.targets)
      lines.push(`    ${target.path} [${target.status}]`);

    output.push(lines.join("\n"));
  }

  return output.join("\n");
}
