import { Department, User, FileItem, QuickAccessFolder, FileTransfer, NotificationItem, AuditLog, SystemSettings } from '../types';

export const DEPARTMENTS: Department[] = [
  { id: 'dept-general', name: 'مدیریت کل', code: 'HQ', color: '#6E1B1B', defaultQuotaGB: 100 },
];

export const CURRENT_USER: User = {
  id: 'usr-admin',
  fullName: 'مدیر کل سیستم',
  email: 'admin@company.internal',
  password: 'admin',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  avatarInitials: 'مد',
  role: 'SUPER_ADMIN',
  departmentId: 'dept-general',
  departmentName: 'مدیریت کل',
  storageQuotaGB: 1000,
  storageUsedGB: 0,
  isActive: true,
  lastLogin: 'تاکنون وارد نشده',
  canSendOfficialLetters: true,
  canSignOfficialLetters: true,
};

export const STAFF_USERS: User[] = [
  CURRENT_USER,
];

export const INITIAL_QUICK_ACCESS: QuickAccessFolder[] = [];

export const INITIAL_FILES: FileItem[] = [];

export const INITIAL_TRANSFERS: FileTransfer[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_SETTINGS: SystemSettings = {
  companyName: 'شرکت مهندسی و فناوری داده‌پرداز',
  companySubtitle: 'سامانه یکپارچه مکاتبات اداری و اسناد رسمی',
  systemTitle: 'سامانه اتوماسیون اداری و تبادل فایل',
  maxUploadSizeBytes: 5368709120, // 5 GB
  allowedFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'zip', 'tar.gz', 'png', 'jpg', 'jpeg', 'mp4', 'ts', 'py', 'json', 'csv'],
  sessionTimeoutMinutes: 60,
  enableExternalSharing: false,
  requireTransferPasswordByDefault: false,
  autoPurgeDays: 14,
  defaultUserQuotaGB: 25,
  ceoName: 'مدیریت محترم عامل',
  ceoTitle: 'مدیرعامل',
  ceoSignatureUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" width="300" height="120"><path d="M30 65 C 70 15, 100 85, 140 35 C 160 15, 190 75, 230 25 M90 55 C 120 45, 150 95, 270 60 M130 70 L 250 70 M170 25 C 180 75, 200 85, 220 45" fill="none" stroke="%231a365d" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><text x="150" y="105" font-family="Tahoma, sans-serif" font-size="13" font-weight="bold" fill="%231a365d" text-anchor="middle">امضای مدیریت</text></svg>`,
  companyStampUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160"><circle cx="80" cy="80" r="72" fill="none" stroke="%23991b1b" stroke-width="3" stroke-dasharray="6,2"/><circle cx="80" cy="80" r="62" fill="none" stroke="%23991b1b" stroke-width="1.5"/><path id="textCircle" d="M 80,80 m -48,0 a 48,48 0 1,1 96,0 a 48,48 0 1,1 -96,0" fill="none"/><text fill="%23991b1b" font-size="8" font-family="Tahoma" font-weight="bold"><textPath href="%23textCircle" startOffset="50%" text-anchor="middle">دبیرخانه و مکاتبات اداری</textPath></text><text x="80" y="75" fill="%23991b1b" font-size="11" font-weight="bold" text-anchor="middle" font-family="Tahoma">تایید شد</text><text x="80" y="95" fill="%23991b1b" font-size="9" font-weight="bold" text-anchor="middle" font-family="Tahoma">امضای مدیر</text></svg>`,
};
