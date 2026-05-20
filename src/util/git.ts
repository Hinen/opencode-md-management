import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isGitClean(root: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: root });

    return stdout.trim().length === 0;
  } catch {
    return true;
  }
}

export async function assertGitClean(root: string): Promise<void> {
  if (!await isGitClean(root))
    throw new Error("Working tree is dirty. Commit or stash changes before applying sync.");
}
