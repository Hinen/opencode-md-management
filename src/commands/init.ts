import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configFileName, parseConfig } from "../core/config.js";

const knownTargets = ["CLAUDE.md", "GEMINI.md", ".codex/AGENTS.md", ".github/copilot-instructions.md"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

export async function runInit(root: string): Promise<string> {
  const canonical = await exists(join(root, "AGENTS.md")) ? "AGENTS.md" : "CLAUDE.md";
  const targets = knownTargets
    .filter((path) => path !== canonical)
    .map((path) => ({ path, mode: "mirror" as const, enabled: path === "CLAUDE.md" || path === "GEMINI.md" }));
  const config = parseConfig({ canonical, targets });
  const output = `${JSON.stringify(config, null, 2)}\n`;

  try {
    await writeFile(join(root, configFileName), output, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST")
      throw new Error(`${configFileName} already exists`);

    throw error;
  }

  return `Created ${configFileName} with canonical ${canonical}`;
}
