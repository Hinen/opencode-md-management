import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { resolveCanonical } from "./canonical.js";
import { hashContent } from "./hash.js";
import { renderUnifiedDiff } from "./diff.js";
import { applySyncPlan, createSyncPlan } from "./sync.js";
import { writeCanonical } from "./writer.js";
import type { AgentMdConfig, CanonicalFile } from "./types.js";
import { assertParentChainInsideRoot, ensureParentDirectory, resolveInsideRoot } from "../util/fs.js";

const proposalSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: z.object({
    kind: z.enum(["revise", "learn"]),
    summary: z.string().optional()
  }),
  scopeId: z.string().min(1).default("project"),
  canonicalPath: z.string().min(1),
  beforeHash: z.string().startsWith("sha256:"),
  before: z.string(),
  after: z.string(),
  diff: z.string(),
  status: z.enum(["pending", "approved", "stale", "rejected"]),
  approvedAt: z.string().optional(),
  approvedHash: z.string().startsWith("sha256:").optional(),
  rejectedAt: z.string().optional(),
  rejectedReason: z.string().optional()
});

export type Proposal = z.infer<typeof proposalSchema>;
export type ApprovedProposal = Proposal & { syncedTargets: number };

export class ProposalNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Proposal not found: ${id}`);
    this.id = id;
    this.name = "ProposalNotFoundError";
  }
}

export type CreateProposalInput = {
  source: Proposal["source"];
  canonical: CanonicalFile;
  after: string;
};

export type ListProposalsOptions = {
  status?: Proposal["status"] | Proposal["status"][];
};

export type RejectProposalOptions = {
  reason?: string;
};

export type GcProposalsOptions = {
  statuses?: Proposal["status"][];
  olderThanDays?: number;
  now?: Date;
};

export type GcProposalsResult = {
  deleted: string[];
  kept: number;
};

const proposalsDirectory = ".agent-md/proposals";

export function parseProposal(input: unknown): Proposal {
  return proposalSchema.parse(input);
}

export async function createProposal(root: string, input: CreateProposalInput): Promise<Proposal> {
  const proposal = parseProposal({
    version: 1,
    id: await createProposalId(root),
    createdAt: new Date().toISOString(),
    source: input.source,
    scopeId: "project",
    canonicalPath: input.canonical.path,
    beforeHash: input.canonical.hash,
    before: input.canonical.content,
    after: input.after,
    diff: renderUnifiedDiff(input.canonical.path, input.canonical.content, input.after),
    status: "pending"
  });

  await writeProposal(root, proposal);

  return proposal;
}

export async function showProposal(root: string, id: string): Promise<Proposal> {
  try {
    const raw = await readFile(proposalPath(root, id), "utf8");

    return parseProposal(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new ProposalNotFoundError(id);

    throw error;
  }
}

export async function listProposals(root: string, options: ListProposalsOptions = {}): Promise<Proposal[]> {
  const directory = resolveInsideRoot(root, proposalsDirectory);
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return [];

    throw error;
  }

  const wanted = normalizeStatusFilter(options.status);
  const proposals: Proposal[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json"))
      continue;

    const id = entry.slice(0, -".json".length);

    if (!isValidProposalId(id))
      continue;

    const proposal = await showProposal(root, id);

    if (wanted && !wanted.has(proposal.status))
      continue;

    proposals.push(proposal);
  }

  proposals.sort((a, b) => {
    if (a.createdAt !== b.createdAt)
      return a.createdAt < b.createdAt ? -1 : 1;

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return proposals;
}

export async function approveProposal(root: string, id: string, config: AgentMdConfig): Promise<ApprovedProposal> {
  const proposal = await showProposal(root, id);

  if (proposal.status === "approved")
    return { ...proposal, syncedTargets: 0 };

  if (proposal.status !== "pending")
    throw new Error(`Cannot approve a ${proposal.status} proposal: ${id}`);

  const canonical = await resolveCanonical(root, config);

  if (proposal.scopeId !== config.scope.id) {
    const stale = parseProposal({ ...proposal, status: "stale" });

    await writeProposal(root, stale);
    throw new Error(`Proposal scope is stale: ${id}`);
  }

  if (proposal.canonicalPath !== canonical.path) {
    const stale = parseProposal({ ...proposal, status: "stale" });

    await writeProposal(root, stale);
    throw new Error(`Proposal canonical path is stale: ${id}`);
  }

  if (canonical.hash !== proposal.beforeHash) {
    const stale = parseProposal({ ...proposal, status: "stale" });

    await writeProposal(root, stale);
    throw new Error(`Proposal is stale: ${id}`);
  }

  const nextCanonical = {
    path: canonical.path,
    content: proposal.after,
    hash: hashContent(proposal.after)
  };
  const syncPlan = await createSyncPlan(root, config, nextCanonical);
  const changedTargets = syncPlan.targets.filter((target) => target.status !== "ok");
  const conflict = changedTargets.find((target) => target.status === "conflict");

  if (conflict)
    throw new Error(`Target has drift and requires --force: ${conflict.path}`);

  await writeCanonical(canonical.path, proposal.after, {
    root,
    requireGitClean: config.sync.requireGitClean,
    backupDir: config.sync.backupDir
  });

  if (changedTargets.length > 0)
    await applySyncPlan(root, config, { ...syncPlan, targets: changedTargets }, { skipGitClean: true });

  const approved = parseProposal({
    ...proposal,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedHash: hashContent(proposal.after)
  });

  await writeProposal(root, approved);

  return { ...approved, syncedTargets: changedTargets.length };
}

export async function rejectProposal(root: string, id: string, options: RejectProposalOptions = {}): Promise<Proposal> {
  const proposal = await showProposal(root, id);

  if (proposal.status === "approved")
    throw new Error(`Cannot reject an approved proposal: ${id}`);

  if (proposal.status === "rejected")
    return proposal;

  const rejected = parseProposal({
    ...proposal,
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    rejectedReason: options.reason
  });

  await writeProposal(root, rejected);

  return rejected;
}

export async function gcProposals(root: string, options: GcProposalsOptions = {}): Promise<GcProposalsResult> {
  const statuses = new Set<Proposal["status"]>(options.statuses ?? ["approved", "stale", "rejected"]);

  if (statuses.has("pending"))
    throw new Error("Refusing to gc pending proposals");

  const now = options.now ?? new Date();
  const olderThanDays = options.olderThanDays ?? 30;
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
  const proposals = await listProposals(root);
  const deleted: string[] = [];

  for (const proposal of proposals) {
    if (!statuses.has(proposal.status))
      continue;

    if (new Date(proposal.createdAt) > cutoff)
      continue;

    await unlink(proposalPath(root, proposal.id));
    deleted.push(proposal.id);
  }

  return { deleted, kept: proposals.length - deleted.length };
}

export function renderProposalForReview(proposal: Proposal): string {
  return [
    `Proposal ${proposal.id} [${proposal.status}]`,
    `kind: ${proposal.source.kind}`,
    `scope: ${proposal.scopeId}`,
    `canonical: ${proposal.canonicalPath}`,
    `beforeHash: ${proposal.beforeHash}`,
    proposal.diff || "No changes proposed"
  ].join("\n");
}

async function writeProposal(root: string, proposal: Proposal): Promise<void> {
  const path = proposalPath(root, proposal.id);
  const relativePath = join(proposalsDirectory, `${proposal.id}.json`);
  const tempPath = `${path}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;

  await assertParentChainInsideRoot(root, relativePath);
  await ensureParentDirectory(path);
  await writeFile(tempPath, `${JSON.stringify(proposal, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tempPath, path);
}

async function createProposalId(root: string): Promise<string> {
  await mkdir(resolveInsideRoot(root, proposalsDirectory), { recursive: true });

  for (;;) {
    const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${Math.random().toString(16).slice(2, 8)}`;
    const existing = await readdir(resolveInsideRoot(root, proposalsDirectory));

    if (!existing.includes(`${id}.json`))
      return id;
  }
}

function proposalPath(root: string, id: string): string {
  if (!isValidProposalId(id))
    throw new Error(`Invalid proposal id: ${id}`);

  return resolveInsideRoot(root, join(proposalsDirectory, `${id}.json`));
}

function normalizeStatusFilter(status: ListProposalsOptions["status"]): Set<Proposal["status"]> | undefined {
  if (!status)
    return undefined;

  return new Set(Array.isArray(status) ? status : [status]);
}

function isValidProposalId(id: string): boolean {
  return basename(id) === id && /^[a-zA-Z0-9-]+$/.test(id);
}
