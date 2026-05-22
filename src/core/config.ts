import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AgentMdConfig, AgentMdScopeIdentity } from "./types.js";
import { assertManagedPath, assertUniqueManagedPaths } from "../util/fs.js";

const targetSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(["mirror", "symlink"]).default("mirror"),
  enabled: z.boolean().default(true)
});

const scopeIdentitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["project", "local", "global", "nested"]),
  tool: z.enum(["opencode", "claude", "codex", "gemini", "copilot"]).nullable().default(null)
});

const configSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  scope: scopeIdentitySchema.default({ id: "project", kind: "project", tool: null }),
  primary: z.string().min(1).default("AGENTS.md"),
  canonical: z.string().min(1).optional(),
  targets: z.array(targetSchema).default([]),
  sync: z.object({
    requireGitClean: z.boolean().default(true),
    backupDir: z.string().min(1).default(".agent-md/backups")
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
  const raw = input as { canonical?: unknown; primary?: unknown; scope?: unknown; schemaVersion?: unknown };
  const upgraded = {
    ...(input as object),
    schemaVersion: 2,
    scope: normalizeScopeIdentity(raw.scope),
    primary: typeof raw.primary === "string" ? raw.primary : typeof raw.canonical === "string" ? raw.canonical : "AGENTS.md"
  };
  const config = configSchema.parse(upgraded);

  assertManagedPath(config.primary, { allowAgentMdInternal: false });

  for (const target of config.targets)
    assertManagedPath(target.path, { canonical: config.primary });

  assertUniqueManagedPaths(config.targets.map((target) => target.path));

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
