import { copyFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { assertGitClean } from "../util/git.js";
import { assertParentChainInsideRoot, assertWritableRegularPath, ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";

export type WriteOptions = {
  root: string;
  requireGitClean: boolean;
  backupDir?: string;
};

export async function atomicWrite(relativePath: string, content: string, options: WriteOptions): Promise<void> {
  const targetPath = resolveInsideRoot(options.root, relativePath);

  if (options.requireGitClean)
    await assertGitClean(options.root);

  await assertParentChainInsideRoot(options.root, relativePath);
  await assertWritableRegularPath(targetPath);
  await ensureParentDirectory(targetPath);

  if (options.backupDir)
    await backupExistingFile(relativePath, options);

  const tempPath = `${targetPath}.agent-md.tmp`;

  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}

export async function writeCanonical(relativePath: string, content: string, options: WriteOptions): Promise<void> {
  await atomicWrite(relativePath, content, options);
}

async function backupExistingFile(relativePath: string, options: WriteOptions): Promise<void> {
  const targetPath = resolveInsideRoot(options.root, relativePath);
  const backupRoot = resolveInsideRoot(options.root, options.backupDir ?? ".agent-md/backups");
  const backupPath = join(backupRoot, `${Date.now()}-${basename(relativePath)}`);

  try {
    await ensureParentDirectory(backupPath);
    await copyFile(targetPath, backupPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;

    throw error;
  }
}
