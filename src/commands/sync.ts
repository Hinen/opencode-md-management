import { requireWritableScope, type ScopeSelection } from "../core/scope-context.js";
import { applySyncPlan, createSyncPlan } from "../core/sync.js";

export type SyncCommandOptions = {
  apply?: boolean;
  force?: boolean;
  target?: string;
  scope?: ScopeSelection;
};

export async function runSync(root: string, options: SyncCommandOptions = {}): Promise<string> {
  const scope = await requireWritableScope(root, options.scope);
  const scopedConfig = scope.config!;
  const plan = await createSyncPlan(scope.root, scopedConfig);

  if (options.target && !plan.aliases.some((alias) => alias.path === options.target)) {
    const available = plan.aliases.map((alias) => alias.path).join(", ");

    throw new Error(available.length === 0
      ? `Unknown alias: ${options.target}. No aliases are configured yet.`
      : `Unknown alias: ${options.target}. Available aliases: ${available}.`);
  }

  const aliases = options.target ? plan.aliases.filter((alias) => alias.path === options.target) : plan.aliases;
  const scopedPlan = { ...plan, aliases };

  if (scopedPlan.aliases.every((alias) => alias.status === "ok"))
    return "No changes";

  if (!options.apply) {
    const diffs = scopedPlan.aliases
      .filter((alias) => alias.status !== "ok")
      .map((alias) => alias.diff);

    return diffs.length === 0 ? "No changes" : diffs.join("\n");
  }

  await applySyncPlan(scope.root, scopedConfig, scopedPlan, { force: options.force });

  const repaired = scopedPlan.aliases.filter((alias) => alias.status !== "ok").length;

  return `Repaired ${repaired} alias(es)`;
}
