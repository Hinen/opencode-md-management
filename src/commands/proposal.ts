import { loadConfig } from "../core/config.js";
import { approveProposal, renderProposalForReview, showProposal } from "../core/proposals.js";

export async function runProposalShow(root: string, id: string): Promise<string> {
  return renderProposalForReview(await showProposal(root, id));
}

export async function runProposalApprove(root: string, id: string): Promise<string> {
  const config = await loadConfig(root);
  const proposal = await approveProposal(root, id, config);

  return `Approved proposal ${proposal.id}`;
}
