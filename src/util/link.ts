import { lstat, readlink, rename, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirnameNative, isAbsolute, normalize, relative as relativeNative, resolve, sep } from "node:path";
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

// Cross-scope absolute-path symlink for global scopes. Both link and target must live
// under the home root (os.homedir(), or AGENT_MD_HOME when set for tests). Stores the
// absolute target so that ~/.claude/CLAUDE.md → /home/u/.config/opencode/AGENTS.md is
// machine-specific but readlink-inspectable.
export async function ensureAbsoluteSymlink(linkPath: string, canonicalPath: string): Promise<EnsureLinkOutcome> {
  const homeRoot = trustedHomeRoot();
  const absoluteLink = resolve(linkPath);
  const absoluteCanonical = resolve(canonicalPath);

  assertUnderHome(absoluteLink, homeRoot, "link path");
  assertUnderHome(absoluteCanonical, homeRoot, "canonical path");

  await ensureParentDirectory(absoluteLink);

  const existing = await lstat(absoluteLink).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT"))
      return null;

    throw error;
  });

  if (existing && !existing.isSymbolicLink())
    return "conflict-regular-file";

  if (existing) {
    const currentTarget = (await readlink(absoluteLink)).replace(/\\/g, "/");
    const expectedTarget = absoluteCanonical.replace(/\\/g, "/");

    if (currentTarget === expectedTarget)
      return "ok";
  }

  await writeSymlink(absoluteCanonical, absoluteLink, absoluteLink, Boolean(existing));

  return existing ? "replaced" : "created";
}

function trustedHomeRoot(): string {
  return resolve(process.env.AGENT_MD_HOME ?? homedir());
}

function assertUnderHome(absolutePath: string, homeRoot: string, label: string): void {
  const rel = relativeNative(homeRoot, absolutePath);

  if (rel.startsWith("..") || isAbsolute(rel) || rel === "" || rel.startsWith(`..${sep}`))
    throw new Error(`Refusing cross-scope symlink: ${label} ${absolutePath} is outside the trusted home root ${homeRoot}.`);

  if (normalize(rel).split(sep).includes(".."))
    throw new Error(`Refusing cross-scope symlink: ${label} ${absolutePath} escapes the trusted home root ${homeRoot}.`);

  // dirnameNative defends against passing the home root itself.
  if (dirnameNative(absolutePath) === absolutePath)
    throw new Error(`Refusing cross-scope symlink: ${label} ${absolutePath} resolves to a filesystem root.`);
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
      throw new Error(`Symlink creation failed at ${linkPathRel}: enable Windows Developer Mode (Settings → Privacy & security → For developers → Developer Mode) or run as administrator. opencode-md-management requires symlink support. Underlying error: ${error.message}`);

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
