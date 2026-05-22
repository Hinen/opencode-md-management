import { lstat, readFile, readlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { renderUnifiedDiff } from "./diff.js";
import { hashContent } from "./hash.js";
import { createManifest, manifestPathForScope, readManifest, writeManifest } from "./manifest.js";
import { resolveCanonical } from "./canonical.js";
import { atomicWrite } from "./writer.js";
import type { AgentMdConfig, AgentMdManifest, AgentMdTarget, CanonicalFile, ManifestTarget, TargetMode } from "./types.js";
import { assertGitClean } from "../util/git.js";
import { computeLinkTargetRelative, ensureSymlink } from "../util/link.js";

export type TargetStatus = "ok" | "missing" | "outdated" | "conflict";

export type TargetSyncPlan = {
  path: string;
  mode: TargetMode;
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
      const manifestTarget = manifest?.targets.find((entry) => entry.path === target.path);

      if (target.mode === "symlink")
        return planSymlinkTarget(root, target, canonical, manifestTarget);

      return planMirrorTarget(root, target, canonical, manifestTarget);
    }));

  return { canonical, manifest, targets, manifestPath };
}

async function planMirrorTarget(root: string, target: AgentMdTarget, canonical: CanonicalFile, manifestTarget?: ManifestTarget): Promise<TargetSyncPlan> {
  const before = await readTarget(root, target.path);
  const currentHash = before === undefined ? undefined : hashContent(before);
  const status = getTargetStatus(before, currentHash, canonical.hash, manifestTarget);

  return {
    path: target.path,
    mode: "mirror",
    status,
    before: before ?? "",
    after: canonical.content,
    diff: renderUnifiedDiff(target.path, before ?? "", canonical.content),
    currentHash,
    lastSyncedHash: manifestTarget?.lastSyncedHash
  };
}

async function planSymlinkTarget(root: string, target: AgentMdTarget, canonical: CanonicalFile, manifestTarget?: ManifestTarget): Promise<TargetSyncPlan> {
  const expectedRel = computeLinkTargetRelative(target.path, canonical.path);
  const inspection = await inspectSymlink(join(root, target.path));
  const { status, currentInfo } = classifySymlinkStatus(inspection, expectedRel);

  return {
    path: target.path,
    mode: "symlink",
    status,
    before: "",
    after: "",
    diff: `symlink: ${target.path} → ${expectedRel}${currentInfo}`,
    lastSyncedHash: manifestTarget?.lastSyncedHash
  };
}

type SymlinkInspection =
  | { kind: "missing" }
  | { kind: "regular-file" }
  | { kind: "symlink"; target: string };

async function inspectSymlink(linkPath: string): Promise<SymlinkInspection> {
  try {
    const stat = await lstat(linkPath);

    if (!stat.isSymbolicLink())
      return { kind: "regular-file" };

    return { kind: "symlink", target: await readlink(linkPath) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { kind: "missing" };

    throw error;
  }
}

function classifySymlinkStatus(inspection: SymlinkInspection, expectedRel: string): { status: TargetStatus; currentInfo: string } {
  if (inspection.kind === "missing")
    return { status: "missing", currentInfo: "" };

  if (inspection.kind === "regular-file")
    return { status: "conflict", currentInfo: " (currently: regular file)" };

  if (inspection.target === expectedRel)
    return { status: "ok", currentInfo: "" };

  return { status: "conflict", currentInfo: ` (currently: ${inspection.target})` };
}

export async function applySyncPlan(root: string, config: AgentMdConfig, plan: SyncPlan, options: { force?: boolean; skipGitClean?: boolean } = {}): Promise<AgentMdManifest> {
  if (config.sync.requireGitClean && !options.skipGitClean)
    await assertGitClean(root);

  const conflict = plan.targets.find((target) => target.status === "conflict");

  if (conflict && !options.force)
    throw new Error(`Target has drift and requires --force: ${conflict.path}`);

  for (const target of plan.targets) {
    if (target.status === "ok")
      continue;

    if (target.mode === "symlink") {
      await applySymlinkTarget(root, target, plan.canonical, options.force ?? false);
      continue;
    }

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

async function applySymlinkTarget(root: string, target: TargetSyncPlan, canonical: CanonicalFile, force: boolean): Promise<void> {
  const outcome = await ensureSymlink(root, target.path, canonical.path);

  if (outcome !== "conflict-regular-file")
    return;

  if (!force)
    throw new Error(`Target has drift and requires --force: ${target.path}`);

  await rm(join(root, target.path), { force: true });
  await ensureSymlink(root, target.path, canonical.path);
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
      mode: target.mode,
      lastSyncedHash: target.mode === "symlink" ? "symlink" : canonical.hash
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
