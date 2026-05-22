import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderUnifiedDiff } from "./diff.js";
import { hashContent } from "./hash.js";
import { createManifest, manifestPathForScope, readManifest, writeManifest } from "./manifest.js";
import { resolveCanonical } from "./canonical.js";
import { atomicWrite } from "./writer.js";
import type { AgentMdConfig, AgentMdManifest, CanonicalFile, ManifestTarget } from "./types.js";
import { assertGitClean } from "../util/git.js";

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
  manifestPath: string;
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

export async function createSyncPlan(root: string, config: AgentMdConfig, canonicalOverride?: CanonicalFile): Promise<SyncPlan> {
  const canonical = canonicalOverride ?? await resolveCanonical(root, config);
  const manifestPath = manifestPathForScope(config.scope.id);
  const manifest = await readManifest(root, manifestPath);
  const targets = await Promise.all(config.targets
    .filter((target) => target.enabled)
    .map(async (target) => {
      if (target.mode !== "mirror")
        throw new Error(`Unsupported target mode: ${target.mode}`);

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

  return { canonical, manifest, targets, manifestPath };
}

export async function applySyncPlan(root: string, config: AgentMdConfig, plan: SyncPlan, options: { force?: boolean; skipGitClean?: boolean } = {}): Promise<AgentMdManifest> {
  if (config.sync.requireGitClean && !options.skipGitClean)
    await assertGitClean(root);

  const conflict = plan.targets.find((target) => target.status === "conflict");

  if (conflict && !options.force)
    throw new Error(`Target has drift and requires --force: ${conflict.path}`);

  for (const target of plan.targets) {
    if (target.status !== "ok")
      await atomicWrite(target.path, target.after, {
        root,
        requireGitClean: false,
        backupDir: config.sync.backupDir
      });
  }

  const manifest = mergeManifest(plan.manifest, plan.canonical, plan.targets, {
    root,
    configPath: config.scope.id === "local" ? ".agent-md.local.json" : ".agent-md.json",
    configHash: hashContent(JSON.stringify(config)),
    scope: config.scope
  });

  await writeManifest(root, manifest, plan.manifestPath);

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

export function mergeManifest(previous: AgentMdManifest | undefined, canonical: CanonicalFile, appliedTargets: TargetSyncPlan[], metadata?: {
  root: string;
  configPath: string;
  configHash: string;
  scope: AgentMdManifest["scope"];
}): AgentMdManifest {
  const targets = new Map<string, ManifestTarget>(previous?.targets.map((target) => [target.path, target]) ?? []);

  for (const target of appliedTargets) {
    targets.set(target.path, {
      path: target.path,
      mode: "mirror",
      lastSyncedHash: canonical.hash
    });
  }

  return createManifest({
    root: metadata?.root ?? previous?.root ?? ".",
    configPath: metadata?.configPath ?? previous?.configPath ?? ".agent-md.json",
    configHash: metadata?.configHash ?? previous?.configHash ?? hashContent("legacy-sync"),
    scope: metadata?.scope ?? previous?.scope ?? { id: "project", kind: "project", tool: null },
    primary: {
      path: canonical.path,
      hash: canonical.hash
    },
    targets: [...targets.values()].sort((left, right) => left.path.localeCompare(right.path))
  });
}
