import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { resolveCanonical } from "./canonical.js";
import { hashContent } from "./hash.js";
import { renderUnifiedDiff } from "./diff.js";
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
  canonicalPath: z.string().min(1),
  beforeHash: z.string().startsWith("sha256:"),
  before: z.string(),
  after: z.string(),
  diff: z.string(),
  status: z.enum(["pending", "approved", "stale"]),
  approvedAt: z.string().optional(),
  approvedHash: z.string().startsWith("sha256:").optional()
});

export type Proposal = z.infer<typeof proposalSchema>;

export type CreateProposalInput = {
  source: Proposal["source"];
  canonical: CanonicalFile;
  after: string;
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
  const raw = await readFile(proposalPath(root, id), "utf8");

  return parseProposal(JSON.parse(raw));
}

export async function approveProposal(root: string, id: string, config: AgentMdConfig): Promise<Proposal> {
  const proposal = await showProposal(root, id);

  if (proposal.status === "approved")
    return proposal;

  const canonical = await resolveCanonical(root, config);

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

  await writeCanonical(canonical.path, proposal.after, {
    root,
    requireGitClean: config.sync.requireGitClean,
    backupDir: config.sync.backupDir
  });

  const approved = parseProposal({
    ...proposal,
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedHash: hashContent(proposal.after)
  });

  await writeProposal(root, approved);

  return approved;
}

export function renderProposalForReview(proposal: Proposal): string {
  return [
    `Proposal ${proposal.id} [${proposal.status}]`,
    `kind: ${proposal.source.kind}`,
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
  if (basename(id) !== id || !/^[a-zA-Z0-9-]+$/.test(id))
    throw new Error(`Invalid proposal id: ${id}`);

  return resolveInsideRoot(root, join(proposalsDirectory, `${id}.json`));
}
