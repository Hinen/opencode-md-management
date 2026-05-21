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

  if (options.target && !plan.targets.some((target) => target.path === options.target))
    throw new Error(`Unknown target: ${options.target}`);

  const targets = options.target ? plan.targets.filter((target) => target.path === options.target) : plan.targets;
  const scopedPlan = { ...plan, targets };

  if (scopedPlan.targets.every((target) => target.status === "ok"))
    return "No changes";

  if (!options.apply) {
    const diffs = scopedPlan.targets
      .filter((target) => target.diff.length > 0)
      .map((target) => target.diff);

    return diffs.length === 0 ? "No changes" : diffs.join("\n");
  }

  await applySyncPlan(scope.root, scopedConfig, scopedPlan, { force: options.force });

  return `Synced ${scopedPlan.targets.length} target(s)`;
}
