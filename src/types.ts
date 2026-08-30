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
  avatarUrl: string;
  avatarInitials: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  storageQuotaGB: number;
  storageUsedGB: number;
  isActive: boolean;
  lastLogin: string;
}

export type FileCategory = 'doc' | 'sheet' | 'pdf' | 'word' | 'image' | 'video' | 'zip' | 'code';

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  size: string; // e.g. "20 MB"
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
  status: TransferStatus;
  sentAt: string;
  expiresAt: string;
  downloadsCount: number;
  maxDownloads?: number;
  isEncrypted?: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type: 'TRANSFER_RECEIVED' | 'TRANSFER_DOWNLOADED' | 'QUOTA_ALERT' | 'SYSTEM';
  fileTransferId?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  action: 'FILE_UPLOAD' | 'FILE_TRANSFER' | 'FILE_DOWNLOAD' | 'USER_CREATE' | 'USER_UPDATE' | 'QUOTA_CHANGE' | 'SETTINGS_UPDATE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  ipAddress: string;
  details: string;
}

export interface SystemSettings {
  maxUploadSizeBytes: number; // e.g., 5368709120 for 5GB
  allowedFileTypes: string[];
  sessionTimeoutMinutes: number;
  enableExternalSharing: boolean;
  requireTransferPasswordByDefault: boolean;
  autoPurgeDays: number;
  defaultUserQuotaGB: number;
}
