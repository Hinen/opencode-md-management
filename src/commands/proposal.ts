import { loadConfig } from "../core/config.js";
import {
  approveProposal,
  gcProposals,
  listProposals,
  rejectProposal,
  renderProposalForReview,
  showProposal,
  type Proposal
} from "../core/proposals.js";

const proposalStatuses: Proposal["status"][] = ["pending", "approved", "stale", "rejected"];
const gcStatuses: Proposal["status"][] = ["approved", "stale", "rejected"];

export async function runProposalShow(root: string, id: string): Promise<string> {
  return renderProposalForReview(await showProposal(root, id));
}

export async function runProposalApprove(root: string, id: string): Promise<string> {
  const config = await loadConfig(root);
  const proposal = await approveProposal(root, id, config);

  return `Approved proposal ${proposal.id}`;
}

export async function runProposalList(root: string, options: { status?: string } = {}): Promise<string> {
  const proposals = await listProposals(root, { status: parseStatusOption(options.status, proposalStatuses) });

  if (proposals.length === 0)
    return "No proposals found";

  return proposals
    .map((proposal) => `${proposal.id}\t${proposal.status}\t${proposal.createdAt}\t${proposal.source.kind}\t${proposal.canonicalPath}`)
    .join("\n");
}

export async function runProposalReject(root: string, id: string, options: { reason?: string } = {}): Promise<string> {
  const rejected = await rejectProposal(root, id, { reason: options.reason });

  return `Rejected proposal ${rejected.id}`;
}

export async function runProposalGc(root: string, options: { olderThanDays?: number; status?: string } = {}): Promise<string> {
  const result = await gcProposals(root, {
    olderThanDays: options.olderThanDays,
    statuses: parseStatusOption(options.status, gcStatuses)
  });

  if (result.deleted.length === 0)
    return `Deleted 0 proposals (kept ${result.kept})`;

  return [
    `Deleted ${result.deleted.length} proposals (kept ${result.kept})`,
    ...result.deleted.map((id) => `- ${id}`)
  ].join("\n");
}

function parseStatusOption(status: string | undefined, allowed: Proposal["status"][]): Proposal["status"][] | undefined {
  if (!status)
    return undefined;

  const parsed = status.split(",").map((item) => item.trim()).filter(Boolean);

  for (const item of parsed) {
    if (!allowed.includes(item as Proposal["status"]))
      throw new Error(`Invalid status filter: ${item}`);
  }

  return parsed as Proposal["status"][];
}
