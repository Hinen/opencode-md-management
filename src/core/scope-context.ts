import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { configFileName, loadConfigFile, localConfigFileName } from "./config.js";
import { hashContent } from "./hash.js";
import type { AgentMdConfig, ScopeKind, ScopeTool } from "./types.js";

export type ScopeSelection = string | "all" | undefined;

export type ScopeContext = {
  id: string;
  kind: ScopeKind;
  tool: ScopeTool;
  root: string;
  configPath: string | null;
  stateDir: string;
  manifestPath: string;
  primary: string;
  config?: AgentMdConfig;
  adopted: boolean;
  writePolicy: "writable" | "read-only" | "inventory-only";
  source: "explicit" | "discovered";
  configHash: string | null;
  overridePath?: string;
};

const ignoredDirectories = new Set([".git", ".agent-md", ".agent-md.local", "node_modules", "dist", "coverage"]);

export async function discoverScopes(root: string, selection: ScopeSelection = undefined): Promise<ScopeContext[]> {
  const includeDiscovered = selection === "all" || Boolean(selection && selection !== "project");
  const scopes = uniqueScopes([
    await projectScope(root),
    ...includeDiscovered ? await discoveredScopes(root) : []
  ]);

  if (!selection || selection === "project")
    return [scopes[0]];

  if (selection === "all")
    return scopes.map((scope) => ({ ...scope, writePolicy: "read-only" as const }));

  const selected = scopes.filter((scope) => scope.id === selection || scope.id === normalizeLegacySelection(selection));

  if (selected.length === 0)
    throw new Error(`Unknown scope: ${selection}`);

  return selected;
}

export async function requireWritableScope(root: string, selection: ScopeSelection): Promise<ScopeContext> {
  if (selection === "all")
    throw new Error("scope=all is read-only and write commands require a single scope. Pass --scope <scope>.");

  const scopes = await discoverScopes(root, selection);

  if (scopes.length !== 1)
    throw new Error("write commands require a single scope. Pass --scope <scope> instead of --scope all.");

  const scope = scopes[0];

  if (!scope.adopted || !scope.config)
    throw new Error(`Scope is not adopted: ${scope.id}. Run init --scope ${scope.id} first.`);

  if (scope.writePolicy !== "writable")
    throw new Error(`Scope is read-only: ${scope.id}`);

  return scope;
}

export async function scopeContextFromProjectConfig(root: string, config: AgentMdConfig): Promise<ScopeContext> {
  return buildScope({
    id: config.scope.id,
    kind: config.scope.kind,
    tool: config.scope.tool,
    root,
    primary: config.primary,
    config,
    configPath: join(root, configFileName),
    stateDir: join(root, ".agent-md"),
    source: "explicit"
  });
}

export function globalScopeRoot(tool: Exclude<ScopeTool, null>): string {
  if (process.env.AGENT_MD_HOME)
    return join(process.env.AGENT_MD_HOME, tool);

  if (tool === "claude")
    return join(homedir(), ".claude");

  if (tool === "codex")
    return join(homedir(), ".codex");

  if (tool === "opencode")
    return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode");

  return join(homedir(), `.${tool}`);
}

export function defaultPrimaryForScope(id: string): string {
  if (id === "global:claude")
    return "CLAUDE.md";

  if (id === "local")
    return ".claude.local.md";

  return "AGENTS.md";
}

async function projectScope(root: string): Promise<ScopeContext> {
  const configPath = join(root, configFileName);
  const config = await readConfigIfExists(configPath);

  return buildScope({
    id: config?.scope.id ?? "project",
    kind: config?.scope.kind ?? "project",
    tool: config?.scope.tool ?? null,
    root,
    primary: config?.primary ?? "AGENTS.md",
    config,
    configPath: config ? configPath : null,
    stateDir: join(root, ".agent-md"),
    source: config ? "explicit" : "discovered"
  });
}

async function discoveredScopes(root: string): Promise<ScopeContext[]> {
  return [
    ...await localScopes(root),
    ...await globalScopes(),
    ...await nestedScopes(root)
  ];
}

async function localScopes(root: string): Promise<ScopeContext[]> {
  const configPath = join(root, localConfigFileName);
  const config = await readConfigIfExists(configPath);
  const hasPrimary = await exists(join(root, ".claude.local.md"));

  if (!config && !hasPrimary)
    return [];

  return [await buildScope({
    id: "local",
    kind: "local",
    tool: null,
    root,
    primary: config?.primary ?? ".claude.local.md",
    config,
    configPath: config ? configPath : null,
    stateDir: join(root, ".agent-md.local"),
    source: config ? "explicit" : "discovered"
  })];
}

async function globalScopes(): Promise<ScopeContext[]> {
  const tools: Array<Exclude<ScopeTool, null>> = ["claude", "opencode", "codex"];
  const scopes: ScopeContext[] = [];

  for (const tool of tools) {
    const id = `global:${tool}`;
    const root = globalScopeRoot(tool);
    const primary = defaultPrimaryForScope(id);
    const configPath = join(root, configFileName);
    const config = await readConfigIfExists(configPath);
    const hasPrimary = await exists(join(root, primary));
    const hasOverride = await exists(join(root, "AGENTS.override.md"));

    if (!config && !hasPrimary && !hasOverride)
      continue;

    scopes.push(await buildScope({
      id,
      kind: "global",
      tool,
      root,
      primary: config?.primary ?? primary,
      config,
      configPath: config ? configPath : null,
      stateDir: join(root, ".agent-md"),
      source: config ? "explicit" : "discovered",
      overridePath: hasOverride ? "AGENTS.override.md" : undefined
    }));
  }

  return scopes;
}

async function nestedScopes(root: string): Promise<ScopeContext[]> {
  const found: string[] = [];

  await walk(root, found);

  return Promise.all(found
    .filter((path) => dirname(path) !== root)
    .map((path) => {
      const scopeRoot = dirname(path);
      const id = `nested:${relative(root, scopeRoot).replace(/\\/g, "/")}`;

      return buildScope({
        id,
        kind: "nested",
        tool: null,
        root: scopeRoot,
        primary: "CLAUDE.md",
        config: undefined,
        configPath: null,
        stateDir: join(scopeRoot, ".agent-md"),
        source: "discovered"
      });
    }));
}

async function buildScope(input: {
  id: string;
  kind: ScopeKind;
  tool: ScopeTool;
  root: string;
  primary: string;
  config?: AgentMdConfig;
  configPath: string | null;
  stateDir: string;
  source: "explicit" | "discovered";
  overridePath?: string;
}): Promise<ScopeContext> {
  const adopted = input.config !== undefined;
  const root = resolve(input.root);
  const stateDir = resolve(input.stateDir);

  return {
    id: input.id,
    kind: input.kind,
    tool: input.tool,
    root,
    configPath: input.configPath ? resolve(input.configPath) : null,
    stateDir,
    manifestPath: join(stateDir, "manifest.json"),
    primary: input.primary,
    config: input.config,
    adopted,
    writePolicy: adopted ? "writable" : "inventory-only",
    source: input.source,
    configHash: input.config ? hashContent(JSON.stringify(input.config)) : null,
    overridePath: input.overridePath
  };
}

async function readConfigIfExists(path: string): Promise<AgentMdConfig | undefined> {
  try {
    return await loadConfigFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}

async function walk(directory: string, found: string[]): Promise<void> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        await walk(path, found);

      continue;
    }

    if (entry.isFile() && entry.name === "CLAUDE.md")
      found.push(path);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

function uniqueScopes(scopes: ScopeContext[]): ScopeContext[] {
  const seen = new Set<string>();
  const unique: ScopeContext[] = [];

  for (const scope of scopes) {
    if (seen.has(scope.id))
      continue;

    seen.add(scope.id);
    unique.push(scope);
  }

  return unique;
}

function normalizeLegacySelection(selection: string): string {
  if (selection === "global")
    return "global:claude";

  if (selection.includes("/") || selection.includes("\\"))
    return `nested:${selection.replace(/\\/g, "/")}`;

  return selection;
}
