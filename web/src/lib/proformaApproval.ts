import type { Deal, SystemSettings, User } from '../types';

/** The CEO is the person who holds the «can sign official letters» tick. */
export const canApproveProforma = (u?: Pick<User, 'canSignOfficialLetters'> | null) => u?.canSignOfficialLetters === true;

type ApprovalSettings = Pick<SystemSettings, 'proformaApprovalRequired' | 'proformaIssuers'>;

/**
 * Whether the CEO's approval is asked before a proforma of this issuing company may be sent.
 * Each of the two companies has its own tick: the official one is `proformaApprovalRequired`, the other lives on the issuer.
 */
export const approvalRequired = (settings?: ApprovalSettings | null, issuerId?: string) => {
  if (!issuerId || issuerId === 'main') return settings?.proformaApprovalRequired === true;
  return settings?.proformaIssuers?.find((i) => i.id === issuerId)?.approvalRequired === true;
};

export const approvalStatus = (deal: Pick<Deal, 'proformaApproval'>) => deal.proformaApproval?.status;

/** May this proforma be printed or sent to the customer (with the CEO's stamp and signature)? */
export const proformaReleased = (deal: Pick<Deal, 'proformaApproval' | 'proformaIssuerId'>, settings?: ApprovalSettings | null) =>
  !approvalRequired(settings, deal.proformaIssuerId) || deal.proformaApproval?.status === 'APPROVED';
