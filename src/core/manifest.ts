import { rename, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { AgentMdManifest } from "./types.js";
import { hashContent } from "./hash.js";
import { assertParentChainInsideRoot, ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";

// Legacy v1/v2 manifests carry `targets: [{ path, mode, lastSyncedHash }]`.
// v3 drops mode and lastSyncedHash (symlink-only model has no drift to hash) and stores aliases as a path list.
const legacyTargetSchema = z.object({
  path: z.string().min(1),
  mode: z.string().optional(),
  lastSyncedHash: z.string().optional()
});

const manifestV1Schema = z.object({
  version: z.literal(1),
  canonical: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }),
  targets: z.array(legacyTargetSchema)
});

const scopeIdentitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["project", "local", "global", "nested"]),
  tool: z.enum(["opencode", "claude", "codex", "gemini", "copilot"]).nullable()
});

const manifestV2Schema = z.object({
  version: z.literal(2),
  scope: scopeIdentitySchema,
  root: z.string().min(1),
  configPath: z.string().min(1),
  configHash: z.string().startsWith("sha256:"),
  primary: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }),
  canonical: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }).optional(),
  targets: z.array(legacyTargetSchema),
  adoptedAt: z.string().min(1)
});

const manifestV3Schema = z.object({
  version: z.literal(3),
  scope: scopeIdentitySchema,
  root: z.string().min(1),
  configPath: z.string().min(1),
  configHash: z.string().startsWith("sha256:"),
  primary: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }),
  canonical: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }).optional(),
  aliases: z.array(z.string().min(1)),
  adoptedAt: z.string().min(1)
});

export const manifestPath = ".agent-md/manifest.json";
export const localManifestPath = ".agent-md.local/manifest.json";

export function manifestPathForScope(scopeId: string): string {
  return scopeId === "local" ? localManifestPath : manifestPath;
}

export function parseManifest(input: unknown): AgentMdManifest {
  const version = (input as { version?: unknown }).version;

  if (version === 1) {
    const manifest = manifestV1Schema.parse(input);

    return {
      version: 3,
      scope: { id: "project", kind: "project", tool: null },
      root: ".",
      configPath: ".agent-md.json",
      configHash: hashContent("legacy-v1"),
      primary: manifest.canonical,
      canonical: manifest.canonical,
      aliases: manifest.targets.map((target) => target.path),
      adoptedAt: new Date(0).toISOString()
    };
  }

  if (version === 2) {
    const manifest = manifestV2Schema.parse(input);

    return {
      version: 3,
      scope: manifest.scope,
      root: manifest.root,
      configPath: manifest.configPath,
      configHash: manifest.configHash,
      primary: manifest.primary,
      canonical: manifest.canonical ?? manifest.primary,
      aliases: manifest.targets.map((target) => target.path),
      adoptedAt: manifest.adoptedAt
    };
  }

  const manifest = manifestV3Schema.parse(input);

  return { ...manifest, canonical: manifest.canonical ?? manifest.primary };
}

export async function readManifest(root: string, path = manifestPath): Promise<AgentMdManifest | undefined> {
  try {
    const raw = await readFile(join(root, path), "utf8");

    return parseManifest(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}

export async function writeManifest(root: string, manifest: AgentMdManifest, path = manifestPath): Promise<void> {
  const resolvedPath = resolveInsideRoot(root, path);
  const tempPath = `${resolvedPath}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;

  await assertParentChainInsideRoot(root, path);
  await ensureParentDirectory(resolvedPath);
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tempPath, resolvedPath);
}

export function createManifest(input: {
  root: string;
  configPath: string;
  configHash: string;
  scope: AgentMdManifest["scope"];
  primary: AgentMdManifest["primary"];
  aliases?: string[];
}): AgentMdManifest {
  return {
    version: 3,
    scope: input.scope,
    root: resolve(input.root).replace(/\\/g, "/"),
    configPath: resolve(input.configPath).replace(/\\/g, "/"),
    configHash: input.configHash,
    primary: input.primary,
    canonical: input.primary,
    aliases: input.aliases ?? [],
    adoptedAt: new Date().toISOString()
  };
}
