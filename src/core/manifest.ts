import { rename, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { AgentMdManifest } from "./types.js";
import { hashContent } from "./hash.js";
import { assertParentChainInsideRoot, ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";

const manifestTargetSchema = z.object({
  path: z.string().min(1),
  mode: z.literal("mirror"),
  lastSyncedHash: z.string().startsWith("sha256:")
});

const manifestV1Schema = z.object({
  version: z.literal(1),
  canonical: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }),
  targets: z.array(manifestTargetSchema)
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
  targets: z.array(manifestTargetSchema),
  adoptedAt: z.string().min(1)
});

export const manifestPath = ".agent-md/manifest.json";

export function parseManifest(input: unknown): AgentMdManifest {
  const version = (input as { version?: unknown }).version;

  if (version === 1) {
    const manifest = manifestV1Schema.parse(input);

    return {
      version: 2,
      scope: { id: "project", kind: "project", tool: null },
      root: ".",
      configPath: ".agent-md.json",
      configHash: hashContent("legacy-v1"),
      primary: manifest.canonical,
      canonical: manifest.canonical,
      targets: manifest.targets,
      adoptedAt: new Date(0).toISOString()
    };
  }

  const manifest = manifestV2Schema.parse(input);

  return { ...manifest, canonical: manifest.canonical ?? manifest.primary };
}

export async function readManifest(root: string): Promise<AgentMdManifest | undefined> {
  try {
    const raw = await readFile(join(root, manifestPath), "utf8");

    return parseManifest(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}

export async function writeManifest(root: string, manifest: AgentMdManifest): Promise<void> {
  const path = resolveInsideRoot(root, manifestPath);
  const tempPath = `${path}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;

  await assertParentChainInsideRoot(root, manifestPath);
  await ensureParentDirectory(path);
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tempPath, path);
}

export function createManifest(input: {
  root: string;
  configPath: string;
  configHash: string;
  scope: AgentMdManifest["scope"];
  primary: AgentMdManifest["primary"];
  targets?: AgentMdManifest["targets"];
}): AgentMdManifest {
  return {
    version: 2,
    scope: input.scope,
    root: resolve(input.root).replace(/\\/g, "/"),
    configPath: resolve(input.configPath).replace(/\\/g, "/"),
    configHash: input.configHash,
    primary: input.primary,
    canonical: input.primary,
    targets: input.targets ?? [],
    adoptedAt: new Date().toISOString()
  };
}
