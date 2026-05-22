import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configFileName, loadConfig, parseConfig } from "../core/config.js";
import type { AgentMdTarget } from "../core/types.js";
import { canonicalByModel, type InitModel } from "./init.js";

export type MirrorsCommandOptions = {
  enable?: InitModel[];
  disable?: InitModel[];
  scope?: string;
  mode?: "mirror" | "symlink";
};

export async function runMirrors(root: string, options: MirrorsCommandOptions = {}): Promise<string> {
  if (options.scope && options.scope !== "project")
    throw new Error("Mirror target changes currently apply only to project instruction files. Omit --scope or use --scope project.");

  const config = await loadConfig(root);
  const enablePaths = modelPaths(options.enable ?? []);
  const disablePaths = modelPaths(options.disable ?? []);

  if (enablePaths.has(config.primary) || disablePaths.has(config.primary))
    throw new Error(`Cannot mirror the primary instruction file (${config.primary}). Choose a different target.`);

  const knownTargetPaths = new Set(Object.values(canonicalByModel).filter((path) => path !== config.primary));
  const targetsByPath = new Map(config.targets.map((target) => [target.path, target]));

  for (const path of knownTargetPaths) {
    if (!targetsByPath.has(path))
      targetsByPath.set(path, { path, mode: "mirror", enabled: false });
  }

  let changed = false;

  for (const path of enablePaths) {
    changed = setTargetEnabled(targetsByPath, path, true, knownTargetPaths) || changed;

    if (options.mode !== undefined) {
      const target = targetsByPath.get(path)!;

      if (target.mode !== options.mode) {
        target.mode = options.mode;
        changed = true;
      }
    }
  }

  for (const path of disablePaths)
    changed = setTargetEnabled(targetsByPath, path, false, knownTargetPaths) || changed;

  const nextConfig = parseConfig({
    ...config,
    targets: [...targetsByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
  });

  if (changed)
    await writeFile(join(root, configFileName), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  const enabled = nextConfig.targets.filter((target) => target.enabled).map((target) => target.path);

  return enabled.length === 0 ? "Enabled mirrors: none" : `Enabled mirrors: ${enabled.join(", ")}`;
}

function modelPaths(models: InitModel[]): Set<string> {
  return new Set(models.map((model) => canonicalByModel[model]));
}

function setTargetEnabled(targetsByPath: Map<string, AgentMdTarget>, path: string, enabled: boolean, knownTargetPaths: Set<string>): boolean {
  const target = targetsByPath.get(path);

  if (!target)
    throw new Error(`Unknown mirror target: ${path}. Available targets: ${[...knownTargetPaths].join(", ")}.`);

  if (target.enabled === enabled)
    return false;

  target.enabled = enabled;

  return true;
}
