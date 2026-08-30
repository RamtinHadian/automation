import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, FileTransfer, AuditLog, SystemSettings, FileCategory } from '../types';
import { STAFF_USERS, DEPARTMENTS, INITIAL_TRANSFERS, INITIAL_AUDIT_LOGS, INITIAL_SETTINGS } from '../lib/mock-data';
import { formatCurrentJalaliDateTime, formatJalaliFullTimestamp } from '../lib/jalali';
import { formatBytes, getFileCategory } from '../lib/utils';

interface AppContextType {
  // Users
  staffList: User[];
  setStaffList: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;

  // Transfers
  transfers: FileTransfer[];
  setTransfers: React.Dispatch<React.SetStateAction<FileTransfer[]>>;

  // Audit Logs
  auditLogs: AuditLog[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;

  // Settings
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;

  // Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Actions
  handleSendTransfer: (params: {
    rawFile: globalThis.File;
    recipientId: string;
    note: string;
    onProgress: (p: number) => void;
    onDone: () => void;
  }) => void;
  handleDownload: (t: FileTransfer) => void;
  handleDeleteTransfer: (id: string) => void;
  handleCreateUser: (data: {
    fullName: string;
    email: string;
    role: User['role'];
    departmentId: string;
    quotaGB: number;
  }) => void;
  handleUpdateUser: (userId: string, updates: Partial<User>) => void;
  handleDeleteUser: (userId: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('app_current_user_v3');
    if (saved) {
      const savedUser = JSON.parse(saved) as User;
      const staffSaved = localStorage.getItem('app_staff_v3');
      if (staffSaved) {
        const staff = JSON.parse(staffSaved) as User[];
        return staff.find((u) => u.id === savedUser.id) || STAFF_USERS[0];
      }
    }
    return STAFF_USERS[0];
  });

  const [staffList, setStaffList] = useState<User[]>(() => {
    const saved = localStorage.getItem('app_staff_v3');
    return saved ? JSON.parse(saved) : STAFF_USERS;
  });

  const [transfers, setTransfers] = useState<FileTransfer[]>(() => {
    const saved = localStorage.getItem('app_transfers_v3');
    return saved ? JSON.parse(saved) : INITIAL_TRANSFERS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('app_audit_v3');
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [settings, setSettings] = useState<SystemSettings>(() => {
    const saved = localStorage.getItem('app_settings_v3');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('app_staff_v3', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('app_transfers_v3', JSON.stringify(transfers));
  }, [transfers]);

  useEffect(() => {
    localStorage.setItem('app_audit_v3', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('app_settings_v3', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('app_current_user_v3', JSON.stringify(currentUser));
  }, [currentUser]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const handleSendTransfer = useCallback(
    ({
      rawFile,
      recipientId,
      note,
      onProgress,
      onDone,
    }: {
      rawFile: globalThis.File;
      recipientId: string;
      note: string;
      onProgress: (p: number) => void;
      onDone: () => void;
    }) => {
      const recipient = staffList.find((u) => u.id === recipientId) || staffList[1];
      let progress = 0;

      const timer = setInterval(() => {
        progress += Math.floor(Math.random() * 25) + 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(timer);

          const category: FileCategory = getFileCategory(rawFile.name);
          const newTransfer: FileTransfer = {
            id: 'tr-' + Math.random().toString(36).substring(2, 9),
            fileId: 'f-' + Math.random().toString(36).substring(2, 9),
            fileName: rawFile.name,
            fileSize: formatBytes(rawFile.size),
            category,
            sender: currentUser,
            recipients: [recipient],
            note: note.trim() || 'فایل ارسالی درون‌سازمانی',
            status: 'DELIVERED',
            sentAt: formatCurrentJalaliDateTime(),
            expiresAt: 'تا ۷ روز دیگر',
            downloadsCount: 0,
          };

          const newLog: AuditLog = {
            id: 'log-' + Math.random().toString(36).substring(2, 9),
            timestamp: formatJalaliFullTimestamp(),
            userName: currentUser.fullName,
            userEmail: currentUser.email,
            action: 'FILE_TRANSFER',
            severity: 'INFO',
            ipAddress: '192.168.1.104',
            details: `ارسال فایل "${newTransfer.fileName}" (${newTransfer.fileSize}) برای ${recipient.fullName}.`,
          };

          setTransfers((prev) => [newTransfer, ...prev]);
          setAuditLogs((prev) => [newLog, ...prev]);
          showToast(`فایل "${newTransfer.fileName}" با موفقیت برای ${recipient.fullName} ارسال شد.`);
          onDone();
        } else {
          onProgress(progress);
        }
      }, 120);
    },
    [staffList, currentUser, showToast]
  );

  const handleDownload = useCallback(
    (t: FileTransfer) => {
      setTransfers((prev) =>
        prev.map((item) =>
          item.id === t.id
            ? { ...item, downloadsCount: item.downloadsCount + 1, status: 'DOWNLOADED' }
            : item
        )
      );

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'FILE_DOWNLOAD',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `دانلود فایل "${t.fileName}" توسط ${currentUser.fullName}.`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`در حال دریافت و دانلود فایل "${t.fileName}"...`);
    },
    [currentUser, showToast]
  );

  const handleDeleteTransfer = useCallback(
    (id: string) => {
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      showToast('فایل از لیست دریافتی‌ها حذف شد.');
    },
    [showToast]
  );

  const handleCreateUser = useCallback(
    (data: {
      fullName: string;
      email: string;
      role: User['role'];
      departmentId: string;
      quotaGB: number;
    }) => {
      const dept = DEPARTMENTS.find((d) => d.id === data.departmentId) || DEPARTMENTS[0];
      const newUser: User = {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        departmentId: dept.id,
        departmentName: dept.name,
        storageQuotaGB: data.quotaGB,
        storageUsedGB: 0,
        isActive: true,
        lastLogin: 'تاکنون وارد نشده',
        avatarUrl:
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        avatarInitials: data.fullName.substring(0, 2),
      };

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'USER_CREATE',
        severity: 'WARNING',
        ipAddress: '192.168.1.104',
        details: `تعریف کاربر جدید "${newUser.fullName}" با سهمیه ${newUser.storageQuotaGB}GB در واحد ${newUser.departmentName}.`,
      };

      setStaffList((prev) => [...prev, newUser]);
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`کارمند جدید "${newUser.fullName}" با موفقیت تعریف شد.`);
    },
    [currentUser, showToast]
  );

  const handleUpdateUser = useCallback(
    (userId: string, updates: Partial<User>) => {
      setStaffList((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
      showToast('اطلاعات کاربر و سهمیه فضا به‌روزرسانی شد.');
    },
    [showToast]
  );

  const handleDeleteUser = useCallback(
    (userId: string) => {
      const u = staffList.find((usr) => usr.id === userId);
      setStaffList((prev) => prev.filter((usr) => usr.id !== userId));
      showToast(`حساب کاربری "${u?.fullName || ''}" حذف شد.`);
    },
    [staffList, showToast]
  );

  return (
    <AppContext.Provider
      value={{
        staffList,
        setStaffList,
        currentUser,
        setCurrentUser,
        transfers,
        setTransfers,
        auditLogs,
        setAuditLogs,
        settings,
        setSettings,
        toastMessage,
        showToast,
        handleSendTransfer,
        handleDownload,
        handleDeleteTransfer,
        handleCreateUser,
        handleUpdateUser,
        handleDeleteUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
};
