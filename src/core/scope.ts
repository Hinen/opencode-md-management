import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { AgentMdConfig } from "./types.js";

export type ScopeSelection = string | "all" | undefined;

export type InstructionScope = {
  id: string;
  root: string;
  canonical: string;
  kind: "project" | "local" | "global" | "nested";
};

const ignoredDirectories = new Set([".git", ".agent-md", "node_modules", "dist", "coverage"]);

export async function discoverInstructionScopes(root: string, config: AgentMdConfig, selection: ScopeSelection = undefined): Promise<InstructionScope[]> {
  const projectScope: InstructionScope = {
    id: config.scope ?? "project",
    root,
    canonical: config.canonical ?? "AGENTS.md",
    kind: "project"
  };
  const configuredScopes = config.scopes.map((scope) => ({
    id: scope.id,
    root: resolveScopeRoot(root, scope.root),
    canonical: scope.canonical ?? "CLAUDE.md",
    kind: scope.id === "global" ? "global" as const : "nested" as const
  }));
  const discoveredScopes = selection === "all" ? await discoverClaudeScopes(root) : [];
  const scopes = uniqueScopes([projectScope, ...configuredScopes, ...discoveredScopes]);

  if (!selection || selection === "project")
    return [projectScope];

  if (selection === "all")
    return scopes;

  const selected = scopes.filter((scope) => scope.id === selection);

  if (selected.length === 0)
    throw new Error(`Unknown scope: ${selection}`);

  return selected;
}

export function configForScope(config: AgentMdConfig, scope: InstructionScope): AgentMdConfig {
  if (scope.kind === "project")
    return config;

  return {
    ...config,
    scope: scope.id,
    canonical: scope.canonical,
    targets: []
  };
}

function resolveScopeRoot(root: string, scopeRoot: string): string {
  if (scopeRoot === "~" || scopeRoot.startsWith("~/"))
    return resolve(homedir(), scopeRoot.slice(2));

  return resolve(root, scopeRoot);
}

async function discoverClaudeScopes(root: string): Promise<InstructionScope[]> {
  const scopes: InstructionScope[] = [];

  if (await exists(join(root, ".claude.local.md"))) {
    scopes.push({
      id: "local",
      root,
      canonical: ".claude.local.md",
      kind: "local"
    });
  }

  const globalRoot = join(homedir(), ".claude");

  if (await exists(join(globalRoot, "CLAUDE.md"))) {
    scopes.push({
      id: "global",
      root: globalRoot,
      canonical: "CLAUDE.md",
      kind: "global"
    });
  }

  for (const path of await findNestedClaudeFiles(root)) {
    const scopeRoot = dirname(path);
    const id = normalizeScopeId(relative(root, scopeRoot));

    if (id)
      scopes.push({ id, root: scopeRoot, canonical: "CLAUDE.md", kind: "nested" });
  }

  return scopes;
}

async function findNestedClaudeFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  await walk(root, found);

  return found.filter((path) => dirname(path) !== root);
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
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

function uniqueScopes(scopes: InstructionScope[]): InstructionScope[] {
  const seen = new Set<string>();
  const unique: InstructionScope[] = [];

  for (const scope of scopes) {
    if (seen.has(scope.id))
      continue;

    seen.add(scope.id);
    unique.push(scope);
  }

  return unique;
}

function normalizeScopeId(path: string): string {
  return path.replace(/\\/g, "/");
}
