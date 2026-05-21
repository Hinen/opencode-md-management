import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configFileName, localConfigFileName, parseConfig } from "../core/config.js";
import { createManifest, writeManifest } from "../core/manifest.js";
import { hashContent } from "../core/hash.js";
import { defaultPrimaryForScope, globalScopeRoot } from "../core/scope-context.js";
import type { AgentMdScopeIdentity, ScopeTool } from "../core/types.js";

export type InitModel = "opencode" | "claude" | "gemini" | "codex" | "copilot";

export type InitCommandOptions = {
  model?: InitModel;
  mirrors?: InitModel[];
  scope?: string;
  adopt?: boolean;
};

const canonicalByModel: Record<InitModel, string> = {
  opencode: "AGENTS.md",
  claude: "CLAUDE.md",
  gemini: "GEMINI.md",
  codex: ".codex/AGENTS.md",
  copilot: ".github/copilot-instructions.md"
};

const knownCanonicalCandidates = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".codex/AGENTS.md", ".github/copilot-instructions.md"];
const knownTargets = knownCanonicalCandidates;

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

  const canonical = await getDefaultCanonical(root, options);
  const mirrorPaths = new Set((options.mirrors ?? []).map((model) => canonicalByModel[model]));
  const targets = knownTargets
    .filter((path) => path !== canonical)
    .map((path) => ({ path, mode: "mirror" as const, enabled: mirrorPaths.has(path) }));
  const config = parseConfig({ scope: { id: "project", kind: "project", tool: null }, primary: canonical, canonical, targets });
  const output = `${JSON.stringify(config, null, 2)}\n`;

  try {
    await writeFile(join(root, configFileName), output, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(`${configFileName} already exists`);

    throw error;
  }

  return `Created ${configFileName} with canonical ${canonical}`;
}

async function runScopedInit(root: string, options: InitCommandOptions): Promise<string> {
  const scope = parseScopeOption(options.scope);
  const scopeRoot = scope.kind === "global" && scope.tool ? globalScopeRoot(scope.tool) : root;
  const configPath = join(scopeRoot, scope.id === "local" ? localConfigFileName : configFileName);
  const primary = options.model ? canonicalByModel[options.model] : defaultPrimaryForScope(scope.id);
  const config = parseConfig({
    scope,
    primary,
    canonical: primary,
    targets: [],
    sync: { requireGitClean: scope.kind === "project", backupDir: scope.id === "local" ? ".agent-md.local/backups" : ".agent-md/backups" }
  });

  await mkdir(scopeRoot, { recursive: true });

  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(`${configPath} already exists`);

    throw error;
  }

  const primaryPath = join(scopeRoot, primary);
  const primaryHash = options.adopt && await exists(primaryPath) ? hashContent(await readFile(primaryPath, "utf8")) : hashContent("");
  const manifest = createManifest({
    root: scopeRoot,
    configPath,
    configHash: hashContent(JSON.stringify(config)),
    scope,
    primary: { path: primary, hash: primaryHash }
  });

  await writeManifest(scopeRoot, manifest);

  return `Created ${scope.id} config with primary ${primary}`;
}

function parseScopeOption(scope: string | undefined): AgentMdScopeIdentity {
  if (scope === "local")
    return { id: "local", kind: "local", tool: null };

  if (scope?.startsWith("global:")) {
    const tool = scope.slice("global:".length) as ScopeTool;

    if (tool === "opencode" || tool === "claude" || tool === "codex")
      return { id: scope, kind: "global", tool };
  }

  throw new Error(`Invalid init scope: ${scope}`);
}

async function getDefaultCanonical(root: string, options: InitCommandOptions): Promise<string> {
  if (options.model)
    return canonicalByModel[options.model];

  await assertNoConflictingExistingInstructions(root);

  for (const path of knownCanonicalCandidates) {
    if (await exists(join(root, path)))
      return path;
  }

  return "AGENTS.md";
}

async function assertNoConflictingExistingInstructions(root: string): Promise<void> {
  const existing: Array<{ path: string; content: string }> = [];

  for (const path of knownCanonicalCandidates) {
    const absolutePath = join(root, path);

    if (await exists(absolutePath))
      existing.push({ path, content: await readFile(absolutePath, "utf8") });
  }

  if (new Set(existing.map((item) => item.content)).size <= 1)
    return;

  throw new Error([
    "Multiple existing instruction files have different content.",
    `Choose the primary model explicitly with --model <${Object.keys(canonicalByModel).join("|")}>.`,
    `Existing files: ${existing.map((item) => item.path).join(", ")}`
  ].join(" "));
}
