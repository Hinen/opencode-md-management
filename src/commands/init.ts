import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { configFileName, localConfigFileName, parseConfig } from "../core/config.js";
import { createManifest, manifestPathForScope, writeManifest } from "../core/manifest.js";
import { hashContent } from "../core/hash.js";
import { defaultPrimaryForScope, globalScopeRoot } from "../core/scope-context.js";
import { discoverNestedPrimaries } from "../util/discover.js";
import { ensureSymlink } from "../util/link.js";
import { ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";
import type { AgentMdConfig, AgentMdScopeIdentity, ScopeTool } from "../core/types.js";

export type InitModel = "opencode" | "claude" | "gemini" | "codex" | "copilot";

export type InitCommandOptions = {
  model?: InitModel;
  aliases?: InitModel[];
  scope?: string;
  adopt?: boolean;
};

export const canonicalByModel: Record<InitModel, string> = {
  opencode: "AGENTS.md",
  claude: "CLAUDE.md",
  gemini: "GEMINI.md",
  codex: ".codex/AGENTS.md",
  copilot: ".github/copilot-instructions.md"
};

const knownInstructionPaths = Object.values(canonicalByModel);

const primaryPlaceholder = `# Project instructions

Single source of truth for AI assistant guidance in this project.
Edit this file; symlinked aliases will reflect changes automatically.
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

export async function runInit(root: string, options: InitCommandOptions = {}): Promise<string> {
  if (options.scope && options.scope !== "project")
    return runScopedInit(root, options);

  const primary = await resolvePrimary(root, options);
  const aliasPaths = resolveAliasPaths(options.aliases ?? [], primary);
  const config = parseConfig({
    scope: { id: "project", kind: "project", tool: null },
    primary,
    aliases: aliasPaths
  });

  try {
    await writeFile(join(root, configFileName), `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(`${configFileName} already exists`);

    throw error;
  }

  await ensurePrimaryFile(root, primary);

  const lines = [`Created ${configFileName} with primary ${primary}`];
  const aliasModels = options.aliases ?? [];
  const linkOutcomes = await materializeAliases(root, primary, aliasPaths, aliasModels);

  lines.push(...linkOutcomes);

  await writeInitialManifest(root, join(root, configFileName), config, true);

  return lines.join("\n");
}

async function runScopedInit(root: string, options: InitCommandOptions): Promise<string> {
  const scope = parseScopeOption(options.scope);
  const scopeRoot = scope.kind === "global" && scope.tool ? globalScopeRoot(scope.tool) : root;
  const configPath = join(scopeRoot, scope.id === "local" ? localConfigFileName : configFileName);
  const primary = options.model ? canonicalByModel[options.model] : defaultPrimaryForScope(scope.id);
  const config = parseConfig({
    scope,
    primary,
    aliases: [],
    sync: { requireGitClean: scope.kind === "project" }
  });

  await mkdir(scopeRoot, { recursive: true });

  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(`${configPath} already exists`);

    throw error;
  }

  await writeInitialManifest(scopeRoot, configPath, config, options.adopt ?? false);

  return `Created ${scope.id} config with primary ${primary}`;
}

async function resolvePrimary(root: string, options: InitCommandOptions): Promise<string> {
  if (options.model)
    return canonicalByModel[options.model];

  await assertNoConflictingExistingInstructions(root);

  for (const path of knownInstructionPaths) {
    if (await exists(join(root, path)))
      return path;
  }

  return "AGENTS.md";
}

function resolveAliasPaths(aliases: InitModel[], primary: string): string[] {
  const paths = aliases
    .map((model) => canonicalByModel[model])
    .filter((path) => path !== primary);

  return Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right));
}

async function ensurePrimaryFile(root: string, primary: string): Promise<void> {
  const absolutePath = resolveInsideRoot(root, primary);

  if (await exists(absolutePath))
    return;

  await ensureParentDirectory(absolutePath);
  await writeFile(absolutePath, primaryPlaceholder, { encoding: "utf8", flag: "wx" });
}

async function materializeAliases(root: string, primary: string, aliasPaths: string[], aliasModels: InitModel[]): Promise<string[]> {
  const lines: string[] = [];

  for (const aliasPath of aliasPaths) {
    const outcome = await ensureSymlink(root, aliasPath, primary);

    if (outcome === "conflict-regular-file") {
      lines.push(`Skipped ${aliasPath}: existing regular file (delete or move it, then run omm aliases --add ${aliasPath})`);
      continue;
    }

    lines.push(`Linked ${aliasPath} → ${primary}`);
  }

  const nestedLines = await materializeHierarchicalAliases(root, primary, aliasModels);

  lines.push(...nestedLines);

  return lines;
}

// Hierarchical alias materialization: for every nested file whose basename matches the
// root primary's basename (e.g. nested CLAUDE.md beside the root CLAUDE.md), create
// same-directory symlinks for the alias models whose canonical path is also a root-level
// basename (claude/gemini/opencode). Codex and Copilot use sub-directory paths
// (.codex/AGENTS.md, .github/copilot-instructions.md) that don't map to "next to a
// nested primary"; they are intentionally skipped at nested levels.
export async function materializeHierarchicalAliases(root: string, primary: string, aliasModels: InitModel[]): Promise<string[]> {
  const lines: string[] = [];
  const nestedPrimaries = await discoverNestedPrimaries(root, primary);

  if (nestedPrimaries.length === 0)
    return lines;

  const sameDirAliasBasenames = aliasModels
    .map((model) => canonicalByModel[model])
    .filter((path) => !path.includes("/"))
    .filter((path) => basename(path) !== basename(primary));

  for (const nestedPrimary of nestedPrimaries) {
    const nestedDir = dirname(nestedPrimary);
    const nestedPrimaryBasename = basename(nestedPrimary);

    for (const aliasBasename of sameDirAliasBasenames) {
      const aliasPath = `${nestedDir}/${aliasBasename}`;
      const outcome = await ensureSymlink(root, aliasPath, nestedPrimaryBasename);

      if (outcome === "conflict-regular-file") {
        lines.push(`Skipped ${aliasPath}: existing regular file`);
        continue;
      }

      lines.push(`Linked ${aliasPath} → ${nestedPrimaryBasename}`);
    }
  }

  return lines;
}

async function writeInitialManifest(root: string, configPath: string, config: AgentMdConfig, adopt = true): Promise<void> {
  const primaryPath = join(root, config.primary);
  const primaryHash = adopt && await exists(primaryPath) ? hashContent(await readFile(primaryPath, "utf8")) : hashContent("");
  const manifest = createManifest({
    root,
    configPath,
    configHash: hashContent(JSON.stringify(config)),
    scope: config.scope,
    primary: { path: config.primary, hash: primaryHash },
    aliases: config.aliases
  });

  await writeManifest(root, manifest, manifestPathForScope(config.scope.id));
}

function parseScopeOption(scope: string | undefined): AgentMdScopeIdentity {
  if (scope === "local")
    return { id: "local", kind: "local", tool: null };

  if (scope?.startsWith("global:")) {
    const tool = scope.slice("global:".length) as ScopeTool;

    if (tool === "opencode" || tool === "claude" || tool === "codex")
      return { id: scope, kind: "global", tool };
  }

  throw new Error(`Invalid init scope: ${scope}. Valid scopes: project, local, global:opencode, global:claude, global:codex.`);
}

async function assertNoConflictingExistingInstructions(root: string): Promise<void> {
  const existing: Array<{ path: string; content: string }> = [];

  for (const path of knownInstructionPaths) {
    const absolutePath = join(root, path);

    if (await exists(absolutePath))
      existing.push({ path, content: await readFile(absolutePath, "utf8") });
  }

  if (new Set(existing.map((item) => item.content)).size <= 1)
    return;

  throw new Error([
    "Multiple existing instruction files have different content.",
    `Choose which instruction file should be primary with --model <${Object.keys(canonicalByModel).join("|")}>.`,
    `Existing files: ${existing.map((item) => item.path).join(", ")}`
  ].join(" "));
}
