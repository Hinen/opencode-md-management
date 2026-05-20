import { loadConfig } from "../core/config.js";
import { createSyncPlan } from "../core/sync.js";

export async function runDoctor(root: string): Promise<string> {
  const config = await loadConfig(root);
  const plan = await createSyncPlan(root, config);
  const lines = [`canonical: ${plan.canonical.path} [ok]`, "targets:"];

  for (const target of plan.targets)
    lines.push(`  ${target.path} [${target.status}]`);

  return lines.join("\n");
}
