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
};
