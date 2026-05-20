import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isGitClean(root: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: root });

    return stdout
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) => !isAgentMdStatusLine(line))
      .length === 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("not a git repository"))
      return true;

    throw new Error(`Unable to verify git status: ${message}`);
  }
}

function isAgentMdStatusLine(line: string): boolean {
  return line
    .slice(3)
    .split(" -> ")
    .every((path) => path === ".agent-md" || path.startsWith(".agent-md/"));
}

export async function assertGitClean(root: string): Promise<void> {
  if (!await isGitClean(root))
    throw new Error("Working tree is dirty. Commit or stash changes before applying sync.");
}
