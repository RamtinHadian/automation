export type UserRole = 'SUPER_ADMIN' | 'DEPT_ADMIN' | 'STAFF';

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string;
  defaultQuotaGB: number;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  password?: string;
  avatarUrl: string;
  avatarInitials: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  storageQuotaGB: number;
  storageUsedGB: number;
  isActive: boolean;
  lastLogin: string;
  canSendOfficialLetters?: boolean;
  canSignOfficialLetters?: boolean;
  /** Access to the task-management menu (super/department admins always have it). */
  canUseTasks?: boolean;
  /** Phone extension on the company phone system (for incoming-call pop-ups and click-to-call). */
  extension?: string;
  /** The user's own letter-editor settings (fonts, sizes, positions...), restored every time the editor opens. */
  letterPrefs?: Record<string, unknown>;
  themeId?: string;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export type ReportItemStatus = 'DONE' | 'IN_PROGRESS' | 'BLOCKED';

export interface DailyReportItem {
  id: string;
  text: string;
  taskId?: string;
  /** Time spent, in hours. */
  hours?: number;
  status: ReportItemStatus;
}

export interface DailyReport {
  id: string;
  userId: string;
  authorName: string;
  /** Report day as yyyy-mm-dd. */
  date: string;
  summary: string;
  items: DailyReportItem[];
  blockers: string;
  tomorrow: string;
  recipientIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  creatorId: string;
  creatorName: string;
  assigneeIds: string[];
  /** Due date as yyyy-mm-dd. */
  dueDate?: string;
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface LetterReferral {
  id: string;
  fromUser: User;
  toUser: User;
  date: string;
  comment: string;
}

export type FileCategory = 'doc' | 'sheet' | 'pdf' | 'word' | 'image' | 'video' | 'zip' | 'code';

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  size: string;
  sizeBytes: number;
  category: FileCategory;
  lastModified: string;
  owners: {
    name: string;
    avatarUrl: string;
    initials: string;
  }[];
  isStarred?: boolean;
  isTrashed?: boolean;
  folderId?: string;
  downloadUrl?: string;
  sharedWithCount?: number;
}

export interface QuickAccessFolder {
  id: string;
  title: string;
  categoryLabel?: string;
  sharedWith: {
    name: string;
    avatarUrl: string;
    initials: string;
  }[];
  isActiveFolder?: boolean;
  lastModified?: string;
  isProjectDoc?: boolean;
}

export type TransferStatus = 'PENDING' | 'DELIVERED' | 'DOWNLOADED' | 'EXPIRED';

export interface FileTransfer {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: string;
  category: FileCategory;
  sender: User;
  recipients: User[];
  note?: string;
  letterContentHtml?: string;
  letterNumber?: string;
  pageSize?: string;
  status: TransferStatus;
  sentAt: string;
  expiresAt: string;
  downloadsCount: number;
  maxDownloads?: number;
  isEncrypted?: boolean;
  fileDataUrl?: string;
  isOfficialLetter?: boolean;
  signatureStatus?: 'PENDING_SIGNATURE' | 'SIGNED' | 'REJECTED';
  signedBy?: string;
  signedAt?: string;
  signatureComment?: string;
  signatureImageUrl?: string;
  companyStampImageUrl?: string;
  referrals?: LetterReferral[];
  isArchived?: boolean;
  archivedAt?: string;
  signatureHeight?: number;
  signatureOffsetX?: number;
  signatureOffsetY?: number;
  // Signature image and stamp can each be moved independently of the name/title block (px)
  signatureImgOffsetX?: number;
  signatureImgOffsetY?: number;
  stampHeight?: number; // اندازهٔ مهر (اگر خالی باشد متناسب با امضا)
  stampOffsetX?: number;
  stampOffsetY?: number;
  headerCenterOffsetX?: number;
  headerCenterOffsetY?: number;
  subjectOffsetX?: number;
  subjectOffsetY?: number;
  metaOffsetX?: number;
  metaOffsetY?: number;
  headerCenterFontFamily?: string;
  subjectFontFamily?: string;
  metaFontFamily?: string;
  letterFontFamily?: string;
  signerFontFamily?: string;
  signerFontSize?: number;
  customSignerName?: string;
  customSignerTitle?: string;
  bodyOffsetX?: number;
  bodyPaddingX?: number;
  customHeaderNumber?: string;
  customHeaderDate?: string;
  customHeaderAttachment?: string;
  customHeaderSubject?: string;
  customHeaderCompanyTitle?: string;
  customHeaderCompanySubtitle?: string;
  customHeaderCenterTitle?: string;
  customFooterNote?: string;
  showFooterNote?: boolean;
  attachmentFileName?: string;
  attachmentFileSize?: string;
  attachmentFileDataUrl?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  message?: string;
  timestamp: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS' | 'TRANSFER_RECEIVED' | 'TRANSFER_DOWNLOADED' | 'QUOTA_ALERT' | 'SYSTEM';
  isRead: boolean;
  link?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userEmail: string;
  action: 'LOGIN' | 'LOGOUT' | 'FILE_UPLOAD' | 'FILE_DOWNLOAD' | 'FILE_TRANSFER' | 'FILE_DELETE' | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE' | 'DEPARTMENT_CHANGE' | 'QUOTA_UPDATE' | 'QUOTA_CHANGE' | 'PERMISSION_CHANGE' | 'ADMIN_SETTING_CHANGE' | 'SETTINGS_UPDATE' | 'SECURITY_EVENT';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  ipAddress: string;
  details: string;
}

export interface LetterNumberingSettings {
  prefix: string; // پیشوند سازمانی (مثال: "۱۰" یا "ات")
  nextNumber: number; // شماره بعدی اندیکاتور (مثال: 1001)
  incrementStep?: number; // گام افزایش خودکار پلکانی (مثال: 1 یا 5)
  year: string; // سال صدور (مثال: "1404" یا "1405")
  formatPattern: 'PREFIX_YEAR_NUM' | 'YEAR_NUM_PREFIX' | 'NUM_PREFIX_YEAR' | 'PREFIX_NUM';
  requireAttachmentForFinancial?: boolean;
  allowUniversalReferral?: boolean;
  defaultFooterNote?: string;
  showFooterNote?: boolean;
}

export interface CustomFont {
  id: string;
  name: string;
  fontFamily: string;
  fileName?: string;
  format?: 'truetype' | 'woff' | 'woff2' | 'opentype';
  dataUrl?: string;
  isDefault?: boolean;
  uploadedAt?: string;
  sizeBytes?: number;
}

export interface SystemSettings {
  companyName?: string; // نام رسمی شرکت / سازمان
  companySubtitle?: string; // عنوان فرعی سربرگ اداری
  companyLogoUrl?: string; // لوگو و آرم رسمی سازمان
  systemTitle?: string; // نام و عنوان سامانه
  maxUploadSizeBytes: number;
  allowedFileTypes: string[];
  sessionTimeoutMinutes: number;
  enableExternalSharing: boolean;
  requireTransferPasswordByDefault: boolean;
  autoPurgeDays: number;
  defaultUserQuotaGB: number;
  ceoSignatureUrl?: string;
  ceoSignatureHeight?: number; // اندازهٔ پیش‌فرض امضای مدیرعامل روی نامه‌ها (پیکسل)
  companyStampUrl?: string;
  ceoName?: string;
  ceoTitle?: string;
  themeId?: string;
  letterNumbering?: LetterNumberingSettings;
  customFonts?: CustomFont[];
  defaultLetterFontId?: string;
  companyLogoWidth?: number;
  defaultFooterNote?: string;
  showFooterNote?: boolean;
}

export type AuditAction =
  | 'FILE_UPLOAD'
  | 'FILE_TRANSFER'
  | 'FILE_DOWNLOAD'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'QUOTA_CHANGE'
  | 'SETTINGS_UPDATE'
  | 'DEPT_CREATE'
  | 'DEPT_UPDATE'
  | 'DEPT_DELETE';
