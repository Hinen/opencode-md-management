import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hashContent } from "./hash.js";
import type { AgentMdConfig, CanonicalFile } from "./types.js";

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}

export async function resolveCanonical(root: string, config: AgentMdConfig): Promise<CanonicalFile> {
  const candidates = config.canonical ? [config.canonical] : ["AGENTS.md", "CLAUDE.md"];

  for (const candidate of candidates) {
    const content = await readIfExists(join(root, candidate));

    if (content !== undefined)
      return { path: candidate, content, hash: hashContent(content) };
  }

  throw new Error(`Canonical instruction file not found: ${candidates.join(", ")}`);
}
