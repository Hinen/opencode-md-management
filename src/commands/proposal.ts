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

export async function runProposalShow(root: string, selector?: string): Promise<string> {
  return renderProposalForReview(await showProposal(root, await resolvePendingProposalId(root, selector)));
}

export async function runProposalApprove(root: string, selector?: string): Promise<string> {
  const config = await loadConfig(root);
  const proposal = await approveProposal(root, await resolvePendingProposalId(root, selector), config);

  if (proposal.syncedTargets === 0)
    return "Approved instruction update";

  return `Approved instruction update\nSynced ${proposal.syncedTargets} target(s)`;
}

export async function runProposalList(root: string, options: { status?: string; json?: boolean } = {}): Promise<string> {
  const proposals = await listProposals(root, { status: parseStatusOption(options.status, proposalStatuses) });

  if (options.json) {
    const items = proposals.map((proposal) => ({
      id: proposal.id,
      status: proposal.status,
      createdAt: proposal.createdAt,
      source: proposal.source,
      canonicalPath: proposal.canonicalPath
    }));

    return JSON.stringify(items, null, 2);
  }

  if (proposals.length === 0)
    return "No instruction updates found";

  const lines = proposals.map((proposal, index) => [
    `${index + 1}. ${proposal.status} instruction update`,
    `   file: ${proposal.canonicalPath}`,
    `   source: ${proposal.source.kind}`,
    `   created: ${proposal.createdAt}`
  ].join("\n"));

  if (proposals.some((proposal) => proposal.status === "pending"))
    lines.push("", "Use /omm:proposal-show 1 to review, /omm:proposal-approve 1 to apply, or /omm:proposal-reject 1 to discard.");

  return lines.join("\n");
}

export async function runProposalReject(root: string, selector?: string, options: { reason?: string } = {}): Promise<string> {
  await rejectProposal(root, await resolvePendingProposalId(root, selector), { reason: options.reason });

  return "Rejected instruction update";
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
      throw new Error(`Invalid status filter: ${item}. Valid statuses for this command: ${allowed.join(", ")}.`);
  }

  return parsed as Proposal["status"][];
}

async function resolvePendingProposalId(root: string, selector: string | undefined): Promise<string> {
  if (selector && !isPositiveInteger(selector))
    return selector;

  if (selector) {
    const proposals = await listProposals(root);
    const index = Number.parseInt(selector, 10) - 1;

    if (index < 0 || index >= proposals.length)
      throw new Error(`No instruction update numbered ${selector}. Run /omm:proposals to see available updates.`);

    return proposals[index].id;
  }

  const proposals = await listProposals(root, { status: "pending" });

  if (proposals.length === 0)
    throw new Error("No pending instruction updates found");

  if (proposals.length > 1)
    throw new Error("Multiple pending instruction updates found. Run /omm:proposals and pass a number, for example /omm:proposal-show 1.");

  return proposals[0].id;
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}
