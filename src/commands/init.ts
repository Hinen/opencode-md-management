import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { configFileName, parseConfig } from "../core/config.js";

export type InitModel = "opencode" | "claude" | "gemini" | "codex" | "copilot";

export type InitCommandOptions = {
  model?: InitModel;
  mirrors?: InitModel[];
};

const canonicalByModel: Record<InitModel, string> = {
  opencode: "AGENTS.md",
  claude: "CLAUDE.md",
  gemini: "GEMINI.md",
  codex: ".codex/AGENTS.md",
  copilot: ".github/copilot-instructions.md"
};

const knownCanonicalCandidates = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".codex/AGENTS.md", ".github/copilot-instructions.md"];
const knownTargets = knownCanonicalCandidates;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

export async function runInit(root: string, options: InitCommandOptions = {}): Promise<string> {
  const canonical = await getDefaultCanonical(root, options);
  const mirrorPaths = new Set((options.mirrors ?? []).map((model) => canonicalByModel[model]));
  const targets = knownTargets
    .filter((path) => path !== canonical)
    .map((path) => ({ path, mode: "mirror" as const, enabled: mirrorPaths.has(path) }));
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

async function getDefaultCanonical(root: string, options: InitCommandOptions): Promise<string> {
  if (options.model)
    return canonicalByModel[options.model];

  await assertNoConflictingExistingInstructions(root);

  for (const path of knownCanonicalCandidates) {
    if (await exists(join(root, path)))
      return path;
  }

  return "AGENTS.md";
}

async function assertNoConflictingExistingInstructions(root: string): Promise<void> {
  const existing: Array<{ path: string; content: string }> = [];

  for (const path of knownCanonicalCandidates) {
    const absolutePath = join(root, path);

    if (await exists(absolutePath))
      existing.push({ path, content: await readFile(absolutePath, "utf8") });
  }

  if (new Set(existing.map((item) => item.content)).size <= 1)
    return;

  throw new Error([
    "Multiple existing instruction files have different content.",
    `Choose the primary model explicitly with --model <${Object.keys(canonicalByModel).join("|")}>.`,
    `Existing files: ${existing.map((item) => item.path).join(", ")}`
  ].join(" "));
}
