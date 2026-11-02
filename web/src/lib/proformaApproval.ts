import type { Deal, SystemSettings, User } from '../types';

type ApprovalSettings = Pick<SystemSettings, 'proformaApprovalRequired' | 'proformaApproverId' | 'proformaApproverIds' | 'proformaIssuers'>;

/**
 * Whether the approval of a person is asked before a proforma of this issuing company may be sent.
 * Each of the two companies has its own tick: the official one is `proformaApprovalRequired`, the other lives on the issuer.
 */
export const approvalRequired = (settings?: ApprovalSettings | null, issuerId?: string) => {
  if (!issuerId || issuerId === 'main') return settings?.proformaApprovalRequired === true;
  return settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approvalRequired === true;
};

/** The people who approve this company's proformas, in the order set by the managing director (empty = anyone who holds the «can sign official letters» tick). */
export const approverChainFor = (settings?: ApprovalSettings | null, issuerId?: string): string[] => {
  const main = !issuerId || issuerId === 'main';
  const list = (main ? settings?.proformaApproverIds : settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approverIds) || [];
  const single = (main ? settings?.proformaApproverId : settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approverId) || '';
  const out = list.filter(Boolean);
  return out.length ? out : single ? [single] : [];
};

/** The chain a running approval follows: the one fixed when the proforma was sent, else the one of the settings. */
export const dealChain = (deal: Pick<Deal, 'proformaApproval'> | undefined, settings?: ApprovalSettings | null, issuerId?: string) =>
  deal?.proformaApproval?.chain?.length ? deal.proformaApproval.chain : approverChainFor(settings, issuerId);

/**
 * May this person approve / reject now? For a proforma that waits, only the person whose turn it is (without a chain: anyone with the signing tick).
 * Without a deal (or for one that is not waiting) it says whether the person belongs to the chain.
 */
export const canApproveProforma = (u?: Pick<User, 'id' | 'canSignOfficialLetters'> | null, settings?: ApprovalSettings | null, issuerId?: string, deal?: Pick<Deal, 'proformaApproval'>) => {
  if (!u) return false;
  const chain = dealChain(deal, settings, issuerId);
  if (!chain.length) return u.canSignOfficialLetters === true;
  if (deal?.proformaApproval?.status === 'PENDING') return chain[deal.proformaApproval.step || 0] === u.id;
  return chain.includes(u.id);
};

/** Words for a proforma that waits: whose turn it is and how far it has come. */
export const approvalProgress = (deal: Pick<Deal, 'proformaApproval'>, names: (id: string) => string) => {
  const ap = deal.proformaApproval;
  if (!ap || ap.status !== 'PENDING' || !ap.chain?.length) return '';
  const st = ap.step || 0;
  return `مرحلهٔ ${st + 1} از ${ap.chain.length}: منتظر ${names(ap.chain[st])}`;
};

/** Is this person the approver of at least one of the two companies that ask for approval? */
export const isAnyApprover = (u?: Pick<User, 'id' | 'canSignOfficialLetters'> | null, settings?: ApprovalSettings | null) =>
  ['main', ...(settings?.proformaIssuers || []).map((i) => i.id)].some((id) => approvalRequired(settings, id) && (approverChainFor(settings, id).length ? approverChainFor(settings, id).includes(u?.id || '') : canApproveProforma(u, settings, id)));

export const approvalStatus = (deal: Pick<Deal, 'proformaApproval'>) => deal.proformaApproval?.status;

/** May this proforma be printed or sent to the customer (with the company's stamp and signature)? */
export const proformaReleased = (deal: Pick<Deal, 'proformaApproval' | 'proformaIssuerId'>, settings?: ApprovalSettings | null) =>
  !approvalRequired(settings, deal.proformaIssuerId) || deal.proformaApproval?.status === 'APPROVED';
