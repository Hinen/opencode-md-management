import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AgentMdConfig, AgentMdScopeIdentity } from "./types.js";
import { assertManagedPath, assertUniqueManagedPaths } from "../util/fs.js";

const scopeIdentitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["project", "local", "global", "nested"]),
  tool: z.enum(["opencode", "claude", "codex", "gemini", "copilot"]).nullable().default(null)
});

const configSchema = z.object({
  schemaVersion: z.literal(3).default(3),
  scope: scopeIdentitySchema.default({ id: "project", kind: "project", tool: null }),
  primary: z.string().min(1).default("AGENTS.md"),
  canonical: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).default([]),
  sync: z.object({
    requireGitClean: z.boolean().default(true)
  }).default({}),
  audit: z.object({
    maxSectionLines: z.number().int().positive().default(200),
    forbidSecretsPatterns: z.boolean().default(true),
    duplicateContentMinWords: z.number().int().positive().default(12),
    checkLocalLinks: z.boolean().default(true)
  }).default({}),
  llm: z.object({
    enabled: z.boolean().default(true),
    promptInjectionGuard: z.boolean().default(true)
  }).default({})
});

export const configFileName = ".agent-md.json";
export const localConfigFileName = ".agent-md.local.json";

export function parseConfig(input: unknown): AgentMdConfig {
  const raw = input as { canonical?: unknown; primary?: unknown; scope?: unknown; targets?: unknown; aliases?: unknown };
  const upgraded = {
    ...(input as object),
    schemaVersion: 3,
    scope: normalizeScopeIdentity(raw.scope),
    primary: typeof raw.primary === "string" ? raw.primary : typeof raw.canonical === "string" ? raw.canonical : "AGENTS.md",
    aliases: normalizeAliases(raw.aliases, raw.targets)
  };
  const config = configSchema.parse(upgraded);

  // Global scopes store aliases as absolute paths into the home subtree. Path safety
  // for those is enforced at materialize time by ensureAbsoluteSymlink (home-root assertion).
  // assertManagedPath rejects absolute paths and is therefore project/local-only.
  if (config.scope.kind !== "global") {
    assertManagedPath(config.primary, { allowAgentMdInternal: false });

    for (const alias of config.aliases)
      assertManagedPath(alias, { canonical: config.primary });
  }

  assertUniqueManagedPaths(config.aliases);

  return { ...config, canonical: config.primary };
}

export async function loadConfig(root: string): Promise<AgentMdConfig> {
  return loadConfigFile(join(root, configFileName));
}

export async function loadConfigFile(path: string): Promise<AgentMdConfig> {
  const raw = await readFile(path, "utf8");

  return parseConfig(JSON.parse(raw));
}

function normalizeScopeIdentity(scope: unknown): AgentMdScopeIdentity {
  if (typeof scope === "string") {
    if (scope.startsWith("global:"))
      return { id: scope, kind: "global", tool: scope.slice("global:".length) as AgentMdScopeIdentity["tool"] };

    if (scope === "local")
      return { id: "local", kind: "local", tool: null };

    return { id: scope, kind: scope === "project" ? "project" : "nested", tool: null };
  }

  if (scope && typeof scope === "object")
    return scopeIdentitySchema.parse(scope);

  return { id: "project", kind: "project", tool: null };
}

// Migrates legacy v1/v2 `targets: [{ path, mode?, enabled? }]` to v3 `aliases: string[]`.
// Enabled targets become aliases; disabled targets are dropped.
function normalizeAliases(aliases: unknown, targets: unknown): string[] {
  if (Array.isArray(aliases))
    return aliases.filter((value): value is string => typeof value === "string");

  if (!Array.isArray(targets))
    return [];

  return targets
    .filter((entry): entry is { path: string; enabled?: boolean } =>
      typeof entry === "object" && entry !== null && typeof (entry as { path?: unknown }).path === "string"
    )
    .filter((entry) => entry.enabled !== false)
    .map((entry) => entry.path);
}
