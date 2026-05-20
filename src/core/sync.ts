import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderUnifiedDiff } from "./diff.js";
import { hashContent } from "./hash.js";
import { readManifest, writeManifest } from "./manifest.js";
import { resolveCanonical } from "./canonical.js";
import { atomicWrite } from "./writer.js";
import type { AgentMdConfig, AgentMdManifest, CanonicalFile, ManifestTarget } from "./types.js";

export type TargetStatus = "ok" | "missing" | "outdated" | "conflict";

export type TargetSyncPlan = {
  path: string;
  status: TargetStatus;
  before: string;
  after: string;
  diff: string;
  currentHash?: string;
  lastSyncedHash?: string;
};

export type SyncPlan = {
  canonical: CanonicalFile;
  manifest?: AgentMdManifest;
  targets: TargetSyncPlan[];
};

async function readTarget(root: string, path: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;

    throw error;
  }
}

export async function createSyncPlan(root: string, config: AgentMdConfig): Promise<SyncPlan> {
  const canonical = await resolveCanonical(root, config);
  const manifest = await readManifest(root);
  const targets = await Promise.all(config.targets
    .filter((target) => target.enabled)
    .map(async (target) => {
      const before = await readTarget(root, target.path);
      const manifestTarget = manifest?.targets.find((entry) => entry.path === target.path);
      const currentHash = before === undefined ? undefined : hashContent(before);
      const status = getTargetStatus(before, currentHash, canonical.hash, manifestTarget);

      return {
        path: target.path,
        status,
        before: before ?? "",
        after: canonical.content,
        diff: renderUnifiedDiff(target.path, before ?? "", canonical.content),
        currentHash,
        lastSyncedHash: manifestTarget?.lastSyncedHash
      } satisfies TargetSyncPlan;
    }));

  return { canonical, manifest, targets };
}

export async function applySyncPlan(root: string, config: AgentMdConfig, plan: SyncPlan, options: { force?: boolean } = {}): Promise<AgentMdManifest> {
  for (const target of plan.targets) {
    if (target.status === "conflict" && !options.force)
      throw new Error(`Target has drift and requires --force: ${target.path}`);

    if (target.status !== "ok")
      await atomicWrite(target.path, target.after, {
        root,
        requireGitClean: config.sync.requireGitClean,
        backupDir: config.sync.backupDir
      });
  }

  const manifest = createNextManifest(plan);

  await writeManifest(root, manifest);

  return manifest;
}

function getTargetStatus(before: string | undefined, currentHash: string | undefined, canonicalHash: string, manifestTarget?: ManifestTarget): TargetStatus {
  if (before === undefined)
    return "missing";

  if (currentHash === canonicalHash)
    return "ok";

  if (!manifestTarget)
    return "conflict";

  if (currentHash !== manifestTarget.lastSyncedHash)
    return "conflict";

  return "outdated";
}

function createNextManifest(plan: SyncPlan): AgentMdManifest {
  return {
    version: 1,
    canonical: {
      path: plan.canonical.path,
      hash: plan.canonical.hash
    },
    targets: plan.targets.map((target) => ({
      path: target.path,
      mode: "mirror",
      lastSyncedHash: plan.canonical.hash
    }))
  };
}
