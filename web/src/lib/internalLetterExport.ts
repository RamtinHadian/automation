import { FileTransfer, SystemSettings, User } from '../types';
import { InternalLetter } from './api';
import { LetterheadChoice } from './letterheads';

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
export function internalAsTransfer(l: InternalLetter, _settings: SystemSettings, letterhead: LetterheadChoice | null): FileTransfer {
  const lines = (l.body || '').split(/\r?\n/);
  const html = `<p><b>به: ${esc(l.toName)}</b></p>` + lines.map((x) => `<p>${x.trim() ? esc(x) : '<br>'}</p>`).join('');
  const sender = { id: l.senderId, fullName: l.senderName, email: '', avatarUrl: '', avatarInitials: '', role: 'STAFF', departmentId: '', departmentName: l.senderDept || '', storageQuotaGB: 0, storageUsedGB: 0, isActive: true, lastLogin: '' } as User;
  const copies = (l.referrals || []).map((r) => r.toName);
  return {
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
    pageSize: 'A4',
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
    ...(copies.length ? { copyTo: copies } : {}),
    ...(letterhead ? { letterhead } : {}),
  } as FileTransfer;
}
