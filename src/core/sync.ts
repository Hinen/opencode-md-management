import { lstat, readlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { hashContent } from "./hash.js";
import { createManifest, manifestPathForScope, readManifest, writeManifest } from "./manifest.js";
import { resolveCanonical } from "./canonical.js";
import type { AgentMdConfig, AgentMdManifest, CanonicalFile } from "./types.js";
import { assertGitClean } from "../util/git.js";
import { computeLinkTargetRelative, ensureSymlink } from "../util/link.js";

export type AliasStatus = "ok" | "missing" | "conflict";

export type AliasSyncPlan = {
  path: string;
  status: AliasStatus;
  diff: string;
};

export type SyncPlan = {
  canonical: CanonicalFile;
  manifest?: AgentMdManifest;
  aliases: AliasSyncPlan[];
  manifestPath: string;
};

export async function createSyncPlan(root: string, config: AgentMdConfig, canonicalOverride?: CanonicalFile): Promise<SyncPlan> {
  const canonical = canonicalOverride ?? await resolveCanonical(root, config);
  const manifestPath = manifestPathForScope(config.scope.id);
  const manifest = await readManifest(root, manifestPath);
  const aliases = await Promise.all(config.aliases.map((alias) => planAlias(root, alias, canonical)));

  return { canonical, manifest, aliases, manifestPath };
}

async function planAlias(root: string, alias: string, canonical: CanonicalFile): Promise<AliasSyncPlan> {
  const expectedRel = computeLinkTargetRelative(alias, canonical.path);
  const inspection = await inspectSymlink(join(root, alias));
  const { status, currentInfo } = classifySymlinkStatus(inspection, expectedRel);

  return {
    path: alias,
    status,
    diff: `symlink: ${alias} → ${expectedRel}${currentInfo}`
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

    return { kind: "symlink", target: (await readlink(linkPath)).replace(/\\/g, "/") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { kind: "missing" };

    throw error;
  }
}

function classifySymlinkStatus(inspection: SymlinkInspection, expectedRel: string): { status: AliasStatus; currentInfo: string } {
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

  const conflict = plan.aliases.find((alias) => alias.status === "conflict");

  if (conflict && !options.force)
    throw new Error(`Alias has drift and requires --force: ${conflict.path}`);

  for (const alias of plan.aliases) {
    if (alias.status === "ok")
      continue;

    await applyAlias(root, alias.path, plan.canonical, options.force ?? false);
  }

  const manifest = mergeManifest(plan.manifest, plan.canonical, plan.aliases.map((alias) => alias.path), {
    root,
    configPath: config.scope.id === "local" ? ".agent-md.local.json" : ".agent-md.json",
    configHash: hashContent(JSON.stringify(config)),
    scope: config.scope
  });

  await writeManifest(root, manifest, plan.manifestPath);

  return manifest;
}

async function applyAlias(root: string, aliasPath: string, canonical: CanonicalFile, force: boolean): Promise<void> {
  const outcome = await ensureSymlink(root, aliasPath, canonical.path);

  if (outcome !== "conflict-regular-file")
    return;

  if (!force)
    throw new Error(`Alias has drift and requires --force: ${aliasPath}`);

  await rm(join(root, aliasPath), { force: true });
  await ensureSymlink(root, aliasPath, canonical.path);
}

export function mergeManifest(previous: AgentMdManifest | undefined, canonical: CanonicalFile, aliases: string[], metadata?: {
  root: string;
  configPath: string;
  configHash: string;
  scope: AgentMdManifest["scope"];
}): AgentMdManifest {
  return createManifest({
    root: metadata?.root ?? previous?.root ?? ".",
    configPath: metadata?.configPath ?? previous?.configPath ?? ".agent-md.json",
    configHash: metadata?.configHash ?? previous?.configHash ?? hashContent("legacy-sync"),
    scope: metadata?.scope ?? previous?.scope ?? { id: "project", kind: "project", tool: null },
    primary: {
      path: canonical.path,
      hash: canonical.hash
    },
    aliases: [...aliases].sort((left, right) => left.localeCompare(right))
  });
}
