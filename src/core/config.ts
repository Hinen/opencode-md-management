import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AgentMdConfig } from "./types.js";
import { assertManagedPath, assertUniqueManagedPaths } from "../util/fs.js";

const targetSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(["mirror", "local"]).default("mirror"),
  enabled: z.boolean().default(true)
});

const scopeSchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  config: z.string().min(1).optional(),
  canonical: z.string().min(1).optional()
});

const configSchema = z.object({
  scope: z.string().min(1).optional(),
  canonical: z.string().min(1).optional(),
  targets: z.array(targetSchema).default([]),
  scopes: z.array(scopeSchema).default([]),
  sync: z.object({
    requireGitClean: z.boolean().default(true),
    backupDir: z.string().min(1).default(".agent-md/backups")
  }).default({}),
  audit: z.object({
    maxSectionLines: z.number().int().positive().default(200),
    forbidSecretsPatterns: z.boolean().default(true)
  }).default({}),
  llm: z.object({
    enabled: z.boolean().default(true),
    promptInjectionGuard: z.boolean().default(true)
  }).default({})
});

export const configFileName = ".agent-md.json";

export function parseConfig(input: unknown): AgentMdConfig {
  const config = configSchema.parse(input);

  if (config.canonical)
    assertManagedPath(config.canonical, { allowAgentMdInternal: false });

  for (const scope of config.scopes) {
    if (scope.canonical)
      assertManagedPath(scope.canonical, { allowAgentMdInternal: false });
  }

  for (const target of config.targets)
    assertManagedPath(target.path, { canonical: config.canonical ?? "AGENTS.md" });

  assertUniqueManagedPaths(config.targets.map((target) => target.path));

  return config;
}

export async function loadConfig(root: string): Promise<AgentMdConfig> {
  const raw = await readFile(join(root, configFileName), "utf8");

  return parseConfig(JSON.parse(raw));
}
