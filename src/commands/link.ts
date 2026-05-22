import { readdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { configFileName, loadConfig, parseConfig } from "../core/config.js";
import { applySyncPlan, createSyncPlan } from "../core/sync.js";
import type { AgentMdConfig } from "../core/types.js";
import { ensureSymlink } from "../util/link.js";
import { canonicalByModel, type InitModel } from "./init.js";

export type LinkCommandOptions = {
  model: InitModel;
  apply?: boolean;
  hierarchical?: boolean;
  scope?: string;
};

const hierarchicalSupportedModels = new Set<InitModel>(["claude", "gemini"]);
const ignoredDirs = new Set([".git", ".agent-md", ".agent-md.local", "node_modules", "dist", "coverage"]);

export async function runLink(root: string, options: LinkCommandOptions): Promise<string> {
  if (options.scope && options.scope !== "project")
    throw new Error("Mirror target changes currently apply only to project instruction files. Omit --scope or use --scope project.");

  const { model } = options;
  const apply = options.apply ?? true;
  const linkPath = canonicalByModel[model];

  const config = await loadConfig(root);

  if (linkPath === config.primary)
    throw new Error(`Cannot link the primary instruction file (${config.primary}). Choose a different model.`);

  const targetsByPath = new Map(config.targets.map((t) => [t.path, { ...t }]));
  targetsByPath.set(linkPath, { path: linkPath, mode: "symlink" as const, enabled: true });

  const nextConfig = parseConfig({
    ...config,
    targets: [...targetsByPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  });

  const lines: string[] = [];

  if (apply) {
    const syncConfig: AgentMdConfig = { ...nextConfig, targets: nextConfig.targets.filter((t) => t.path === linkPath) };
    const plan = await createSyncPlan(root, syncConfig);
    await applySyncPlan(root, syncConfig, plan, { skipGitClean: true });

    await writeFile(join(root, configFileName), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    lines.push(`Linked ${config.primary} → ${linkPath}`);
  } else {
    await writeFile(join(root, configFileName), `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
    lines.push(`Config updated: ${config.primary} → ${linkPath} (not applied)`);
  }

  const doHierarchical = options.hierarchical ?? (model === "claude");

  if (doHierarchical) {
    if (!hierarchicalSupportedModels.has(model)) {
      lines.push(`${model} does not support hierarchical aliasing`);
    } else {
      const primaryBasename = basename(config.primary);
      const linkBasename = basename(linkPath);
      const nestedPrimaries = await walkNested(root, primaryBasename);

      for (const nestedPrimary of nestedPrimaries) {
        const dir = nestedPrimary.replace(/\/[^/]+$/, "");
        const nestedLinkPath = `${dir}/${linkBasename}`;

        if (apply) {
          await ensureSymlink(root, nestedLinkPath, nestedPrimary);
          lines.push(`  Linked ${nestedPrimary} → ${nestedLinkPath}`);
        } else {
          lines.push(`  Would link ${nestedPrimary} → ${nestedLinkPath}`);
        }
      }
    }
  }

  return lines.join("\n");
}

async function walkNested(root: string, primaryFilename: string): Promise<string[]> {
  const found: string[] = [];
  await walkDir(root, root, primaryFilename, found);

  return found;
}

async function walkDir(root: string, dir: string, primaryFilename: string, found: string[]): Promise<void> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name))
        await walkDir(root, path, primaryFilename, found);

      continue;
    }

    if (entry.isFile() && entry.name === primaryFilename && dir !== root)
      found.push(relative(root, path).replace(/\\/g, "/"));
  }
}
