import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

const ignoredDirectories = new Set([".git", ".agent-md", ".agent-md.local", "node_modules", "dist", "coverage", ".omo"]);

// Walks the project for files whose basename matches the root primary's basename
// (e.g. "CLAUDE.md"). Returns repo-relative POSIX paths under nested directories
// only — the root primary itself is excluded.
export async function discoverNestedPrimaries(root: string, primaryRelativePath: string): Promise<string[]> {
  const targetBasename = basename(primaryRelativePath);
  const rootDir = dirname(primaryRelativePath);
  const found: string[] = [];

  await walk(root, root, targetBasename, rootDir, found);

  found.sort((left, right) => left.localeCompare(right));

  return found;
}

async function walk(root: string, dir: string, targetBasename: string, rootPrimaryDir: string, found: string[]): Promise<void> {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        await walk(root, entryPath, targetBasename, rootPrimaryDir, found);

      continue;
    }

    if (!entry.isFile() || entry.name !== targetBasename)
      continue;

    const repoRelative = relative(root, entryPath).replace(/\\/g, "/");
    const nestedDir = dirname(repoRelative);

    if (nestedDir === rootPrimaryDir || nestedDir === ".")
      continue;

    found.push(repoRelative);
  }
}
