import { loadConfig } from "../core/config.js";
import { applySyncPlan, createSyncPlan } from "../core/sync.js";

export type SyncCommandOptions = {
  apply?: boolean;
  force?: boolean;
  target?: string;
};

export async function runSync(root: string, options: SyncCommandOptions = {}): Promise<string> {
  const config = await loadConfig(root);
  const plan = await createSyncPlan(root, config);

  if (options.target && !plan.targets.some((target) => target.path === options.target))
    throw new Error(`Unknown target: ${options.target}`);

  const targets = options.target ? plan.targets.filter((target) => target.path === options.target) : plan.targets;
  const scopedPlan = { ...plan, targets };

  if (!options.apply) {
    const diffs = scopedPlan.targets
      .filter((target) => target.diff.length > 0)
      .map((target) => target.diff);

    return diffs.length === 0 ? "No changes" : diffs.join("\n");
  }

  await applySyncPlan(root, config, scopedPlan, { force: options.force });

  return `Synced ${scopedPlan.targets.length} target(s)`;
}
