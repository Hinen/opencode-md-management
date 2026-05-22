import { lstat, readlink, rename, rm, symlink } from "node:fs/promises";
import { dirname, relative } from "node:path/posix";
import { assertParentChainInsideRoot, ensureParentDirectory, resolveInsideRoot } from "./fs.js";

export type EnsureLinkOutcome = "created" | "ok" | "replaced" | "conflict-regular-file";

export function computeLinkTargetRelative(linkPathRel: string, canonicalPathRel: string): string {
  return relative(dirname(linkPathRel), canonicalPathRel);
}

export async function ensureSymlink(root: string, linkPathRel: string, canonicalPathRel: string): Promise<EnsureLinkOutcome> {
  const linkPath = resolveInsideRoot(root, linkPathRel);
  resolveInsideRoot(root, canonicalPathRel);
  await assertParentChainInsideRoot(root, linkPathRel);
  await ensureParentDirectory(linkPath);

  const existing = await lstat(linkPath).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT"))
      return null;

    throw error;
  });

  if (existing && !existing.isSymbolicLink())
    return "conflict-regular-file";

  const target = computeLinkTargetRelative(linkPathRel, canonicalPathRel);

  if (existing) {
    const currentTarget = (await readlink(linkPath)).replace(/\\/g, "/");

    if (currentTarget === target)
      return "ok";
  }

  await writeSymlink(target, linkPath, linkPathRel, Boolean(existing));

  return existing ? "replaced" : "created";
}

async function writeSymlink(target: string, linkPath: string, linkPathRel: string, replaceExisting: boolean): Promise<void> {
  const tempPath = `${linkPath}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.symlink.tmp`;

  try {
    await createSymlink(target, tempPath, linkPathRel);
    // Do not call assertWritableRegularPath: it rejects symlinks; POSIX rename is atomic, while Windows replacement is non-atomic best-effort.
    await renameSymlink(tempPath, linkPath, replaceExisting);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);

    throw error;
  }
}

async function createSymlink(target: string, path: string, linkPathRel: string): Promise<void> {
  try {
    await symlink(target, path);
  } catch (error) {
    if (process.platform === "win32" && isNodeError(error, "EPERM"))
      throw new Error(`Symlink creation failed at ${linkPathRel}: enable Windows Developer Mode or run as administrator. Alternatively, run \`omm mirrors --mode mirror <model>\` to use copy-based sync. Underlying error: ${error.message}`);

    throw error;
  }
}

async function renameSymlink(tempPath: string, linkPath: string, replaceExisting: boolean): Promise<void> {
  try {
    await rename(tempPath, linkPath);
  } catch (error) {
    if (process.platform !== "win32" || !replaceExisting)
      throw error;

    await rm(linkPath, { force: true });
    await rename(tempPath, linkPath);
  }
}

function isNodeError(error: unknown, code: string): error is Error & { code: string } {
  return error instanceof Error && "code" in error && error.code === code;
}
