import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCanonical } from "../src/core/canonical.js";
import { parseConfig } from "../src/core/config.js";
import { hashContent } from "../src/core/hash.js";
import { parseManifest, writeManifest } from "../src/core/manifest.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

async function withLanguage<T>(language: string | undefined, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.LANGUAGE;

  if (language === undefined)
    delete process.env.LANGUAGE;
  else
    process.env.LANGUAGE = language;

  try {
    return await callback();
  } finally {
    if (previous === undefined)
      delete process.env.LANGUAGE;
    else
      process.env.LANGUAGE = previous;
  }
}

describe("canonical and manifest", () => {
  it("resolves AGENTS.md before CLAUDE.md", async () => {
    const root = await createTempRoot();

    await writeFile(join(root, "AGENTS.md"), "agents", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "claude", "utf8");

    const canonical = await resolveCanonical(root, parseConfig({ aliases: [] }));

    expect(canonical.path).toBe("AGENTS.md");
    expect(canonical.content).toBe("agents");
  });

  it("uses the runtime language when telling the user where to create a missing configured canonical file", async () => {
    const root = await createTempRoot();

    await withLanguage("ko-KR", async () => {
      await expect(resolveCanonical(root, parseConfig({ canonical: "AGENTS.md", aliases: [] })))
        .rejects
        .toThrow(`다음 경로에 markdown 파일을 직접 만들어 주세요: ${join(root, "AGENTS.md")}`);
    });

    await withLanguage("en-US", async () => {
      await expect(resolveCanonical(root, parseConfig({ canonical: "AGENTS.md", aliases: [] })))
        .rejects
        .toThrow(`Create the markdown file manually at: ${join(root, "AGENTS.md")}`);
    });
  });

  it("round-trips v3 manifest files", async () => {
    const root = await createTempRoot();
    const manifest = parseManifest({
      version: 3,
      scope: { id: "project", kind: "project", tool: null },
      root: ".",
      configPath: ".agent-md.json",
      configHash: hashContent("cfg"),
      primary: { path: "AGENTS.md", hash: hashContent("rules") },
      aliases: ["CLAUDE.md"],
      adoptedAt: new Date(0).toISOString()
    });

    await writeManifest(root, manifest);

    const raw = await readFile(join(root, ".agent-md", "manifest.json"), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.version).toBe(3);
    expect(parsed.aliases).toEqual(["CLAUDE.md"]);
    expect(parsed.primary.path).toBe("AGENTS.md");
  });

  it("migrates v1 manifest into v3 aliases", () => {
    const hash = hashContent("rules");
    const manifest = parseManifest({
      version: 1,
      canonical: { path: "AGENTS.md", hash },
      targets: [{ path: "CLAUDE.md", mode: "mirror", lastSyncedHash: hash }]
    });

    expect(manifest.version).toBe(3);
    expect(manifest.primary.path).toBe("AGENTS.md");
    expect(manifest.aliases).toEqual(["CLAUDE.md"]);
  });

  it("migrates v2 manifest into v3 aliases", () => {
    const manifest = parseManifest({
      version: 2,
      scope: { id: "project", kind: "project", tool: null },
      root: ".",
      configPath: ".agent-md.json",
      configHash: hashContent("cfg"),
      primary: { path: "AGENTS.md", hash: hashContent("content") },
      targets: [
        { path: "CLAUDE.md", mode: "symlink", lastSyncedHash: "symlink" },
        { path: "GEMINI.md", mode: "mirror", lastSyncedHash: hashContent("content") }
      ],
      adoptedAt: new Date(0).toISOString()
    });

    expect(manifest.version).toBe(3);
    expect(manifest.aliases).toEqual(["CLAUDE.md", "GEMINI.md"]);
  });
});
