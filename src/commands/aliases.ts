import { rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { configFileName, localConfigFileName, parseConfig } from "../core/config.js";
import { globalScopeRoot, requireWritableScope, type ScopeContext } from "../core/scope-context.js";
import { discoverNestedPrimaries } from "../util/discover.js";
import { ensureAbsoluteSymlink, ensureSymlink } from "../util/link.js";
import { resolveInsideRoot } from "../util/fs.js";
import { canonicalByModel, type InitModel } from "./init.js";
import type { AgentMdConfig } from "../core/types.js";

export type AliasesCommandOptions = {
  add?: InitModel[];
  remove?: InitModel[];
  scope?: string;
};

export async function runAliases(root: string, options: AliasesCommandOptions = {}): Promise<string> {
  const scope = await requireWritableScope(root, options.scope);
  const config = scope.config!;

  if (scope.kind === "global")
    return runGlobalAliases(scope, config, options);

  if (scope.kind !== "project")
    throw new Error("Alias changes currently apply only to project or global instruction files.");

  return runProjectAliases(scope.root, config, options);
}

async function runProjectAliases(root: string, config: AgentMdConfig, options: AliasesCommandOptions): Promise<string> {
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

  const hierarchicalLines = await applyHierarchical(root, config.primary, options.add ?? [], options.remove ?? []);

  lines.push(...hierarchicalLines);

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

async function runGlobalAliases(scope: ScopeContext, config: AgentMdConfig, options: AliasesCommandOptions): Promise<string> {
  const primaryAbsolute = join(scope.root, config.primary);
  const primaryTool = scope.tool;
  const addAbsolutes = globalAliasAbsolutePaths(options.add ?? [], primaryTool);
  const removeAbsolutes = globalAliasAbsolutePaths(options.remove ?? [], primaryTool);

  if (addAbsolutes.includes(primaryAbsolute) || removeAbsolutes.includes(primaryAbsolute))
    throw new Error(`Cannot alias the primary instruction file (${primaryAbsolute}). Choose a different model.`);

  const aliasSet = new Set(config.aliases);
  const lines: string[] = [];

  for (const aliasAbsolute of addAbsolutes) {
    if (aliasSet.has(aliasAbsolute))
      continue;

    const outcome = await ensureAbsoluteSymlink(aliasAbsolute, primaryAbsolute);

    if (outcome === "conflict-regular-file") {
      lines.push(`Skipped ${aliasAbsolute}: existing regular file (delete or move it, then retry)`);
      continue;
    }

    aliasSet.add(aliasAbsolute);
    lines.push(`Linked ${aliasAbsolute} → ${primaryAbsolute}`);
  }

  for (const aliasAbsolute of removeAbsolutes) {
    if (!aliasSet.has(aliasAbsolute))
      continue;

    await rm(aliasAbsolute, { force: true });
    aliasSet.delete(aliasAbsolute);
    lines.push(`Removed alias ${aliasAbsolute}`);
  }

  const nextConfig = parseConfig({
    ...config,
    aliases: [...aliasSet].sort((left, right) => left.localeCompare(right))
  });
  const configPath = scope.configPath ?? join(scope.root, scope.id === "local" ? localConfigFileName : configFileName);

  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  if (lines.length === 0)
    lines.push("No changes");

  lines.push(nextConfig.aliases.length === 0 ? "Active aliases: none" : `Active aliases: ${nextConfig.aliases.join(", ")}`);

  return lines.join("\n");
}

function modelPaths(models: InitModel[]): Set<string> {
  return new Set(models.map((model) => canonicalByModel[model]));
}

function globalAliasAbsolutePaths(models: InitModel[], primaryTool: string | null): string[] {
  return models
    .filter((model) => model !== primaryTool)
    .map((model) => {
      // gemini/copilot have no dedicated global scope root; alias only to claude/codex/opencode primaries.
      if (model === "gemini" || model === "copilot")
        return null;

      const aliasScopeRoot = globalScopeRoot(model);
      const aliasCanonical = canonicalByModel[model];

      return join(aliasScopeRoot, aliasCanonical);
    })
    .filter((path): path is string => path !== null);
}

async function removeAlias(root: string, aliasPath: string): Promise<void> {
  const absolute = resolveInsideRoot(root, aliasPath);

  await rm(absolute, { force: true });
}

// Hierarchical add/remove for nested primaries (same logic as init.ts but operating on
// the add/remove model lists rather than the full alias model set).
async function applyHierarchical(root: string, primary: string, addModels: InitModel[], removeModels: InitModel[]): Promise<string[]> {
  const lines: string[] = [];
  const nestedPrimaries = await discoverNestedPrimaries(root, primary);

  if (nestedPrimaries.length === 0)
    return lines;

  const addBasenames = sameDirAliasBasenames(addModels, primary);
  const removeBasenames = sameDirAliasBasenames(removeModels, primary);

  for (const nestedPrimary of nestedPrimaries) {
    const nestedDir = dirname(nestedPrimary);
    const nestedPrimaryBasename = basename(nestedPrimary);

    for (const aliasBasename of addBasenames) {
      const aliasPath = `${nestedDir}/${aliasBasename}`;
      const outcome = await ensureSymlink(root, aliasPath, nestedPrimaryBasename);

      if (outcome === "conflict-regular-file") {
        lines.push(`Skipped ${aliasPath}: existing regular file`);
        continue;
      }

      lines.push(`Linked ${aliasPath} → ${nestedPrimaryBasename}`);
    }

    for (const aliasBasename of removeBasenames) {
      const aliasPath = `${nestedDir}/${aliasBasename}`;

      await removeAlias(root, aliasPath);
      lines.push(`Removed alias ${aliasPath}`);
    }
  }

  return lines;
}

function sameDirAliasBasenames(models: InitModel[], primary: string): string[] {
  return models
    .map((model) => canonicalByModel[model])
    .filter((path) => !path.includes("/"))
    .filter((path) => basename(path) !== basename(primary));
}
