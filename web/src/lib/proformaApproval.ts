import type { Deal, SystemSettings, User } from '../types';

type ApprovalSettings = Pick<SystemSettings, 'proformaApprovalRequired' | 'proformaApproverId' | 'proformaIssuers'>;

/**
 * Whether the approval of a person is asked before a proforma of this issuing company may be sent.
 * Each of the two companies has its own tick: the official one is `proformaApprovalRequired`, the other lives on the issuer.
 */
export const approvalRequired = (settings?: ApprovalSettings | null, issuerId?: string) => {
  if (!issuerId || issuerId === 'main') return settings?.proformaApprovalRequired === true;
  return settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approvalRequired === true;
};

/** The person chosen to approve this company's proformas ('' = anyone who holds the «can sign official letters» tick). */
export const approverIdFor = (settings?: ApprovalSettings | null, issuerId?: string) =>
  (!issuerId || issuerId === 'main' ? settings?.proformaApproverId : settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approverId) || '';

/** May this person approve / reject the proformas of this company? (Also true for the person who made the proforma.) */
export const canApproveProforma = (u?: Pick<User, 'id' | 'canSignOfficialLetters'> | null, settings?: ApprovalSettings | null, issuerId?: string) => {
  if (!u) return false;
  const chosen = approverIdFor(settings, issuerId);
  return chosen ? chosen === u.id : u.canSignOfficialLetters === true;
};

/** Is this person the approver of at least one of the two companies that ask for approval? */
export const isAnyApprover = (u?: Pick<User, 'id' | 'canSignOfficialLetters'> | null, settings?: ApprovalSettings | null) =>
  ['main', ...(settings?.proformaIssuers || []).map((i) => i.id)].some((id) => approvalRequired(settings, id) && canApproveProforma(u, settings, id));

export const approvalStatus = (deal: Pick<Deal, 'proformaApproval'>) => deal.proformaApproval?.status;

/** May this proforma be printed or sent to the customer (with the company's stamp and signature)? */
export const proformaReleased = (deal: Pick<Deal, 'proformaApproval' | 'proformaIssuerId'>, settings?: ApprovalSettings | null) =>
  !approvalRequired(settings, deal.proformaIssuerId) || deal.proformaApproval?.status === 'APPROVED';
