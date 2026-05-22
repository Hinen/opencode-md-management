import { lstat, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeLinkTargetRelative, ensureSymlink } from "../src/util/link.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "opencode-md-management-"));
}

async function canCreateSymlink(): Promise<boolean> {
  const root = await createTempRoot();
  await writeFile(join(root, "target.md"), "rules", "utf8");

  try {
    await symlink("target.md", join(root, "link.md"));

    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM")
      return false;

    throw error;
  }
}

const canCreateWindowsSymlink = process.platform === "win32" ? await canCreateSymlink() : true;
const symlinkIt = it.skipIf(process.platform === "win32" && !canCreateWindowsSymlink);

describe("symlink utilities", () => {
  symlinkIt("creates a fresh symlink", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");

    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).resolves.toBe("created");
    await expect(readlink(join(root, "AGENTS.md"))).resolves.toBe("CLAUDE.md");
  });

  symlinkIt("returns ok for an existing matching symlink", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");
    await ensureSymlink(root, "AGENTS.md", "CLAUDE.md");
    const before = await lstat(join(root, "AGENTS.md"));

    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).resolves.toBe("ok");
    const after = await lstat(join(root, "AGENTS.md"));

    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  symlinkIt("replaces an existing symlink with the wrong target", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "OLD.md"), "old", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");
    await symlink("OLD.md", join(root, "AGENTS.md"));

    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).resolves.toBe("replaced");
    await expect(readlink(join(root, "AGENTS.md"))).resolves.toBe("CLAUDE.md");
  });

  it("reports a regular file conflict without overwriting it", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");
    await writeFile(join(root, "AGENTS.md"), "keep", "utf8");

    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).resolves.toBe("conflict-regular-file");
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toBe("keep");
  });

  symlinkIt("creates cross-directory symlinks with relative targets", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "AGENTS.md"), "rules", "utf8");

    expect(computeLinkTargetRelative(".codex/AGENTS.md", "AGENTS.md")).toBe("../AGENTS.md");
    await expect(ensureSymlink(root, ".codex/AGENTS.md", "AGENTS.md")).resolves.toBe("created");

    const stored = await readlink(join(root, ".codex", "AGENTS.md"));

    expect(stored.replace(/\\/g, "/")).toBe("../AGENTS.md");
  });

  it("rejects link paths outside the root", async () => {
    const root = await createTempRoot();

    await expect(ensureSymlink(root, "../escape.md", "AGENTS.md")).rejects.toThrow(/escapes/);
  });

  it.skipIf(process.platform !== "win32" || canCreateWindowsSymlink)("reports Windows symlink permission guidance", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "CLAUDE.md"), "rules", "utf8");

    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).rejects.toThrow(/Developer Mode/);
    await expect(ensureSymlink(root, "AGENTS.md", "CLAUDE.md")).rejects.toThrow(/omm mirrors --mode mirror/);
  });
});
