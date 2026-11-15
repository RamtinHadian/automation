import { FileTransfer, SystemSettings, User } from '../types';
import { InternalLetter } from './api';
import { LetterheadChoice } from './letterheads';
import { sanitizeHtml } from './sanitizeHtml';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isoLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * An internal letter drawn as an official letter: the very same sheet (header, number and date, subject, justified body, the writer's
 * signature and name at the left, the letterhead when one is chosen) so it prints, becomes a PDF and looks like the letters of the «نامه» menu.
 */
export function internalAsTransfer(l: InternalLetter, _settings: SystemSettings, letterhead: LetterheadChoice | null | undefined): FileTransfer {
  const lines = (l.body || '').split(/\r?\n/);
  // a letter written in the rich editor keeps its formatting and tables; an older plain one is made into paragraphs
  const html = l.bodyHtml ? sanitizeHtml(l.bodyHtml) : `<p><b>به: ${esc(l.toName)}</b></p>` + lines.map((x) => `<p>${x.trim() ? esc(x) : '<br>'}</p>`).join('');
  const lay = { ...(l.layout || {}) } as Record<string, unknown>;
  for (const k of ['title', 'contentHtml', 'letterNumber', 'recipientId', 'note', 'customSignerName', 'customSignerTitle', 'copyTo', 'letterhead', 'attachmentFileName', 'attachmentFileSize', 'attachmentFileDataUrl']) delete lay[k];
  const sender = { id: l.senderId, fullName: l.senderName, email: '', avatarUrl: '', avatarInitials: '', role: 'STAFF', departmentId: '', departmentName: l.senderDept || '', storageQuotaGB: 0, storageUsedGB: 0, isActive: true, lastLogin: '' } as User;
  const fx = { signerBelow: true, ...((lay.fx as Record<string, unknown>) || {}) };
  const ownHead = (l.layout as { letterhead?: LetterheadChoice } | undefined)?.letterhead;
  return {
    signatureHeight: 70,
    ...lay,
    fx,
    id: l.id,
    fileId: l.id,
    fileName: `نامه_${l.subject}`,
    fileSize: '',
    category: 'doc',
    sender,
    recipients: [],
    status: 'DELIVERED',
    sentAt: isoLocal(l.createdAt),
    expiresAt: '',
    downloadsCount: 0,
    isOfficialLetter: true,
    letterNumber: l.number,
    letterContentHtml: html,
    pageSize: (lay.pageSize as string) || 'A4',
    signatureStatus: 'SIGNED',
    signedBy: l.senderName,
    signedAt: isoLocal(l.createdAt),
    signatureImageUrl: l.senderSignature,
    showSignatureImage: !!l.senderSignature,
    showStampImage: false,
    customHeaderNumber: l.number,
    customHeaderDate: isoLocal(l.createdAt),
    customHeaderSubject: l.subject,
    customSignerName: l.senderName,
    customSignerTitle: l.senderDept || 'کارمند',
    customHeaderAttachment: 'ندارد',
    ...(letterhead === null ? {} : ownHead && ownHead.id > 0 && !ownHead.image ? { letterhead: ownHead } : letterhead ? { letterhead } : {}),
  } as FileTransfer;
}
