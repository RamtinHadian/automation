import type { Deal, SystemSettings, User } from '../types';

/** The CEO is the person who holds the «can sign official letters» tick. */
export const canApproveProforma = (u?: Pick<User, 'canSignOfficialLetters'> | null) => u?.canSignOfficialLetters === true;

/** Whether the system setting asks for the CEO's approval before a proforma may be sent. */
export const approvalRequired = (settings?: Pick<SystemSettings, 'proformaApprovalRequired'> | null) => settings?.proformaApprovalRequired === true;

export const approvalStatus = (deal: Pick<Deal, 'proformaApproval'>) => deal.proformaApproval?.status;

/** May this proforma be printed or sent to the customer (with the CEO's stamp and signature)? */
export const proformaReleased = (deal: Pick<Deal, 'proformaApproval'>, settings?: Pick<SystemSettings, 'proformaApprovalRequired'> | null) =>
  !approvalRequired(settings) || deal.proformaApproval?.status === 'APPROVED';
