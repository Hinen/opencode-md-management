import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configFileName, loadConfig, parseConfig } from "../core/config.js";
import { ensureSymlink } from "../util/link.js";
import { resolveInsideRoot } from "../util/fs.js";
import { canonicalByModel, type InitModel } from "./init.js";

export type AliasesCommandOptions = {
  add?: InitModel[];
  remove?: InitModel[];
  scope?: string;
};

export async function runAliases(root: string, options: AliasesCommandOptions = {}): Promise<string> {
  if (options.scope && options.scope !== "project")
    throw new Error("Alias changes currently apply only to project instruction files. Omit --scope or use --scope project.");

  const config = await loadConfig(root);
  const addPaths = modelPaths(options.add ?? []);
  const removePaths = modelPaths(options.remove ?? []);

  if (addPaths.has(config.primary) || removePaths.has(config.primary))
    throw new Error(`Cannot alias the primary instruction file (${config.primary}). Choose a different model.`);

  const aliasSet = new Set(config.aliases);
  const lines: string[] = [];

  for (const path of addPaths) {
    if (aliasSet.has(path))
      continue;

    const outcome = await ensureSymlink(root, path, config.primary);

    if (outcome === "conflict-regular-file") {
      lines.push(`Skipped ${path}: existing regular file (delete or move it, then retry)`);
      continue;
    }

    aliasSet.add(path);
    lines.push(`Linked ${path} → ${config.primary}`);
  }

  for (const path of removePaths) {
    if (!aliasSet.has(path))
      continue;

    await removeAlias(root, path);
    aliasSet.delete(path);
    lines.push(`Removed alias ${path}`);
  }

  const nextConfig = parseConfig({
    ...config,
    aliases: [...aliasSet].sort((left, right) => left.localeCompare(right))
  });

  await writeFile(join(root, configFileName), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  if (lines.length === 0)
    lines.push("No changes");

  lines.push(nextConfig.aliases.length === 0 ? "Active aliases: none" : `Active aliases: ${nextConfig.aliases.join(", ")}`);

  return lines.join("\n");
}

function modelPaths(models: InitModel[]): Set<string> {
  return new Set(models.map((model) => canonicalByModel[model]));
}

async function removeAlias(root: string, aliasPath: string): Promise<void> {
  const absolute = resolveInsideRoot(root, aliasPath);

  await rm(absolute, { force: true });
}
