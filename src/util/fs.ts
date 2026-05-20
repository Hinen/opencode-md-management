import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";

export function resolveInsideRoot(root: string, path: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, path);
  const relativePath = relative(resolvedRoot, resolvedPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath) || relativePath === "" && resolvedPath !== resolvedRoot)
    throw new Error(`Path escapes repository root: ${path}`);

  return resolvedPath;
}

export async function ensureParentDirectory(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

export async function assertWritableRegularPath(path: string): Promise<void> {
  try {
    const stats = await lstat(path);

    if (stats.isSymbolicLink())
      throw new Error(`Refusing to write through symlink: ${path}`);

    if (!stats.isFile())
      throw new Error(`Refusing to write non-file path: ${path}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;

    throw error;
  }
}

export function assertManagedPath(path: string, options: { canonical?: string; allowAgentMdInternal?: boolean } = {}): void {
  const normalized = normalize(path);
  const normalizedLower = normalizeForComparison(path);

  if (isAbsolute(path) || normalized.startsWith("..") || normalized === "..")
    throw new Error(`Managed path must stay inside repository root: ${path}`);

  if (normalized === "." || normalized.endsWith(sep))
    throw new Error(`Managed path must be a file path: ${path}`);

  if (options.canonical && normalizedLower === normalizeForComparison(options.canonical))
    throw new Error(`Target path must not equal canonical path: ${path}`);

  if (!options.allowAgentMdInternal && (normalizedLower === ".agent-md.json" || normalizedLower.startsWith(`.agent-md${sep}`)))
    throw new Error(`Managed path must not target agent-md control files: ${path}`);
}

export function assertUniqueManagedPaths(paths: string[]): void {
  const seen = new Set<string>();

  for (const path of paths) {
    const normalized = normalizeForComparison(path);

    if (seen.has(normalized))
      throw new Error(`Duplicate managed path: ${path}`);

    seen.add(normalized);
  }
}

export async function assertParentChainInsideRoot(root: string, path: string): Promise<void> {
  const resolvedRoot = await realpath(root).catch(() => resolve(root));
  const absolutePath = resolveInsideRoot(root, path);
  let parent = dirname(absolutePath);

  while (parent !== dirname(parent)) {
    try {
      const stats = await lstat(parent);

      if (stats.isSymbolicLink()) {
        const realParent = await realpath(parent);
        const relativeParent = relative(resolvedRoot, realParent);

        if (relativeParent.startsWith("..") || isAbsolute(relativeParent))
          throw new Error(`Refusing to write through parent symlink outside root: ${path}`);
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        parent = dirname(parent);
        continue;
      }

      throw error;
    }

    if (parent === resolve(root))
      break;

    parent = dirname(parent);
  }
}

function normalizeForComparison(path: string): string {
  return normalize(path).toLowerCase();
}
