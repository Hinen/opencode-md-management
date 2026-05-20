import { rename, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AgentMdManifest } from "./types.js";
import { assertParentChainInsideRoot, ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";

const manifestTargetSchema = z.object({
  path: z.string().min(1),
  mode: z.literal("mirror"),
  lastSyncedHash: z.string().startsWith("sha256:")
});

const manifestSchema = z.object({
  version: z.literal(1),
  canonical: z.object({
    path: z.string().min(1),
    hash: z.string().startsWith("sha256:")
  }),
  targets: z.array(manifestTargetSchema)
});

export const manifestPath = ".agent-md/manifest.json";

export function parseManifest(input: unknown): AgentMdManifest {
  return manifestSchema.parse(input);
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
