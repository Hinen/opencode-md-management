import { lstat, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export function resolveInsideRoot(root: string, path: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, path);
  const relativePath = relative(resolvedRoot, resolvedPath);

  if (relativePath.startsWith("..") || relativePath === "" && resolvedPath !== resolvedRoot)
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
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;

    throw error;
  }
}
