import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User, FileTransfer, AuditLog, SystemSettings, FileCategory, Department, CustomFont } from '../types';
import { STAFF_USERS, DEPARTMENTS, INITIAL_TRANSFERS, INITIAL_AUDIT_LOGS, INITIAL_SETTINGS } from '../lib/mock-data';
import { formatCurrentJalaliDateTime, formatJalaliFullTimestamp, toPersianDigits, convertNumbersInHtmlToPersian } from '../lib/jalali';
import { formatBytes, getFileCategory } from '../lib/utils';
import { applyTheme } from '../lib/theme';
import { openAndDownloadPdfLetter } from '../lib/pdfLetterGenerator';
import { DEFAULT_FONTS, injectCustomFontsCss } from '../lib/fonts';
import { formatLetterNumber, DEFAULT_LETTER_NUMBERING } from '../lib/letterNumbering';

interface AppContextType {
  // Auth
  loggedInUser: User | null;
  login: (user: User) => void;
  logout: () => void;

  // Users
  staffList: User[];
  setStaffList: React.Dispatch<React.SetStateAction<User[]>>;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;

  // Departments
  departments: Department[];
  setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;

  // Transfers
  transfers: FileTransfer[];
  setTransfers: React.Dispatch<React.SetStateAction<FileTransfer[]>>;

  // Audit Logs
  auditLogs: AuditLog[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;

  // Settings & Theme & Fonts
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;
  currentTheme: string;
  setTheme: (themeId: string) => void;
  fonts: CustomFont[];
  handleAddCustomFont: (fontData: {
    name: string;
    fontFamily: string;
    fileName: string;
    format: CustomFont['format'];
    dataUrl: string;
    sizeBytes?: number;
  }) => void;
  handleDeleteCustomFont: (fontId: string) => void;
  handleSetDefaultLetterFont: (fontId: string) => void;

  // Toast
  toastMessage: string | null;
  showToast: (msg: string) => void;

  // Actions
  handleSendTransfer: (params: {
    rawFile: globalThis.File;
    recipientId: string;
    note: string;
    letterContentHtml?: string;
    letterNumber?: string;
    pageSize?: string;
    isOfficialLetter?: boolean;
    headerCenterTitle?: string;
    headerCenterOffsetX?: number;
    headerCenterOffsetY?: number;
    subjectOffsetX?: number;
    subjectOffsetY?: number;
    metaOffsetX?: number;
    metaOffsetY?: number;
    headerCenterFontFamily?: string;
    subjectFontFamily?: string;
    metaFontFamily?: string;
    signerFontFamily?: string;
    signerFontSize?: number;
    customSignerName?: string;
    customSignerTitle?: string;
    signatureOffsetX?: number;
    signatureOffsetY?: number;
    signatureHeight?: number;
    customFooterNote?: string;
    bodyOffsetX?: number;
    bodyPaddingX?: number;
    attachmentFileName?: string;
    attachmentFileSize?: string;
    attachmentFileDataUrl?: string;
    onProgress: (p: number) => void;
    onDone: () => void;
  }) => void;
  handleSignLetter: (
    transferId: string,
    comment?: string,
    signatureOptions?: {
      signatureHeight?: number;
      signatureOffsetX?: number;
      signatureOffsetY?: number;
      pageSize?: string;
      customBody?: string;
      customHeaderNumber?: string;
      customHeaderDate?: string;
      customHeaderAttachment?: string;
      customHeaderSubject?: string;
      customHeaderCompanyTitle?: string;
      customHeaderCompanySubtitle?: string;
      customHeaderCenterTitle?: string;
      customFooterNote?: string;
      metaOffsetX?: number;
      metaOffsetY?: number;
      headerCenterFontFamily?: string;
      subjectFontFamily?: string;
      metaFontFamily?: string;
      signerFontFamily?: string;
      signerFontSize?: number;
      customSignerName?: string;
      customSignerTitle?: string;
      bodyOffsetX?: number;
      bodyPaddingX?: number;
    }
  ) => void;
  handleRejectLetter: (transferId: string, reason?: string) => void;
  handleReferLetter: (transferId: string, toUserId: string, referralComment: string) => void;
  handleDownload: (t: FileTransfer) => void;
  handleDeleteTransfer: (id: string) => void;
  handleArchiveTransfer: (transferId: string) => void;
  handleUnarchiveTransfer: (transferId: string) => void;
  handleCreateUser: (data: {
    fullName: string;
    email: string;
    password?: string;
    role: User['role'];
    departmentId: string;
    quotaGB: number;
    canSendOfficialLetters?: boolean;
    canSignOfficialLetters?: boolean;
  }) => void;
  handleUpdateUser: (userId: string, updates: Partial<User>) => void;
  handleDeleteUser: (userId: string) => void;
  handleCreateDepartment: (data: Omit<Department, 'id'>) => void;
  handleUpdateDepartment: (deptId: string, updates: Partial<Department>) => void;
  handleDeleteDepartment: (deptId: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// In-memory file blob store for real instant downloads without localStorage quota issues
const fileBlobStore = new Map<string, Blob | File>();

export const getUserTheme = (user?: User | null): string => {
  if (!user || !user.id) return 'cherry';
  if (user.themeId) return user.themeId;
  try {
    const saved = localStorage.getItem(`app_user_theme_${user.id}`);
    if (saved) return saved;
  } catch (e) {}
  return 'cherry';
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staffList, setStaffList] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem('app_staff_v5');
      if (saved) {
        const parsed = JSON.parse(saved) as User[];
        return parsed.map((u) => ({
          ...u,
          password: u.password || '123456',
          themeId: u.themeId || getUserTheme(u),
        }));
      }
    } catch (e) {
      console.warn('Failed to load staff list:', e);
    }
    return STAFF_USERS.map((u) => ({
      ...u,
      themeId: u.themeId || getUserTheme(u),
    }));
  });

  const [loggedInUser, setLoggedInUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('app_logged_in_user_v5') || sessionStorage.getItem('app_logged_in_user_v5');
      if (saved) {
        const user = JSON.parse(saved) as User;
        const staffSaved = localStorage.getItem('app_staff_v5');
        if (staffSaved) {
          const staff = JSON.parse(staffSaved) as User[];
          const found = staff.find((u) => u.id === user.id);
          if (found) {
            return {
              ...found,
              password: found.password || '123456',
              themeId: found.themeId || getUserTheme(found),
            };
          }
        }
        return { ...user, themeId: user.themeId || getUserTheme(user) };
      }
    } catch (e) {
      console.warn('Failed to load logged-in user session:', e);
    }
    return null;
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const savedLogged = localStorage.getItem('app_logged_in_user_v5') || sessionStorage.getItem('app_logged_in_user_v5');
      if (savedLogged) {
        const user = JSON.parse(savedLogged) as User;
        const staffSaved = localStorage.getItem('app_staff_v5');
        if (staffSaved) {
          const staff = JSON.parse(staffSaved) as User[];
          const found = staff.find((u) => u.id === user.id);
          if (found) {
            return {
              ...found,
              password: found.password || '123456',
              themeId: found.themeId || getUserTheme(found),
            };
          }
        }
        return { ...user, themeId: user.themeId || getUserTheme(user) };
      }

      const saved = localStorage.getItem('app_current_user_v5');
      if (saved) {
        const savedUser = JSON.parse(saved) as User;
        const staffSaved = localStorage.getItem('app_staff_v5');
        if (staffSaved) {
          const staff = JSON.parse(staffSaved) as User[];
          const found = staff.find((u) => u.id === savedUser.id);
          if (found) {
            return {
              ...found,
              password: found.password || '123456',
              themeId: found.themeId || getUserTheme(found),
            };
          }
        }
        return { ...savedUser, themeId: savedUser.themeId || getUserTheme(savedUser) };
      }
    } catch (e) {
      console.warn('Failed to load current user:', e);
    }
    const defaultUser = STAFF_USERS[0];
    return { ...defaultUser, themeId: getUserTheme(defaultUser) };
  });

  const [currentTheme, setCurrentThemeState] = useState<string>(() => {
    const active = loggedInUser || currentUser || STAFF_USERS[0];
    return getUserTheme(active);
  });

  // Whenever currentUser changes (e.g. user switch in AdminPanel or Login), apply that user's theme
  useEffect(() => {
    if (currentUser?.id) {
      const userTheme = getUserTheme(currentUser);
      setCurrentThemeState(userTheme);
      applyTheme(userTheme);
    }
  }, [currentUser?.id, currentUser?.themeId]);

  const setTheme = useCallback(
    (themeId: string) => {
      setCurrentThemeState(themeId);
      applyTheme(themeId);

      if (currentUser?.id) {
        try {
          localStorage.setItem(`app_user_theme_${currentUser.id}`, themeId);
        } catch (e) {
          console.warn('Error saving user theme to localStorage:', e);
        }

        setCurrentUser((prev) => ({ ...prev, themeId }));
        setLoggedInUser((prev) => (prev && prev.id === currentUser.id ? { ...prev, themeId } : prev));
        setStaffList((prev) =>
          prev.map((u) => (u.id === currentUser.id ? { ...u, themeId } : u))
        );
      }
    },
    [currentUser?.id]
  );

  const login = useCallback(
    (user: User) => {
      const matchedUser = staffList.find((u) => u.id === user.id) || user;
      const userTheme = getUserTheme(matchedUser);
      const userWithTheme: User = { ...matchedUser, themeId: userTheme };

      try {
        localStorage.setItem('app_logged_in_user_v5', JSON.stringify(userWithTheme));
        sessionStorage.setItem('app_logged_in_user_v5', JSON.stringify(userWithTheme));
      } catch (e) {
        console.warn('Error saving logged-in user:', e);
      }

      setLoggedInUser(userWithTheme);
      setCurrentUser(userWithTheme);
      setCurrentThemeState(userTheme);
      applyTheme(userTheme);
    },
    [staffList]
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem('app_logged_in_user_v5');
      sessionStorage.removeItem('app_logged_in_user_v5');
    } catch (e) {
      console.warn('Error removing logged-in user:', e);
    }
    setLoggedInUser(null);
    setCurrentThemeState('cherry');
    applyTheme('cherry');
  }, []);

  const [departments, setDepartments] = useState<Department[]>(() => {
    try {
      const saved = localStorage.getItem('app_departments_v5');
      return saved ? JSON.parse(saved) : DEPARTMENTS;
    } catch (e) {
      return DEPARTMENTS;
    }
  });

  const [transfers, setTransfers] = useState<FileTransfer[]>(() => {
    try {
      const saved = localStorage.getItem('app_transfers_v5');
      return saved ? JSON.parse(saved) : INITIAL_TRANSFERS;
    } catch (e) {
      return INITIAL_TRANSFERS;
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('app_audit_v5');
      return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
    } catch (e) {
      return INITIAL_AUDIT_LOGS;
    }
  });

  const [settings, setSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('app_settings_v5');
      return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
    } catch (e) {
      return INITIAL_SETTINGS;
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync to LocalStorage with safe try/catch and payload sanitization
  useEffect(() => {
    try {
      localStorage.setItem('app_staff_v5', JSON.stringify(staffList));
    } catch (e) {
      console.warn('Error saving staffList to localStorage:', e);
    }
  }, [staffList]);

  useEffect(() => {
    try {
      localStorage.setItem('app_departments_v5', JSON.stringify(departments));
    } catch (e) {
      console.warn('Error saving departments to localStorage:', e);
    }
  }, [departments]);

  useEffect(() => {
    try {
      // Exclude heavy binary/dataUrls from localStorage to prevent QuotaExceededError
      const sanitized = transfers.map(({ fileDataUrl, ...rest }) => rest);
      localStorage.setItem('app_transfers_v5', JSON.stringify(sanitized));
    } catch (e) {
      console.warn('Error saving transfers to localStorage:', e);
    }
  }, [transfers]);

  useEffect(() => {
    try {
      localStorage.setItem('app_audit_v5', JSON.stringify(auditLogs));
    } catch (e) {
      console.warn('Error saving auditLogs to localStorage:', e);
    }
  }, [auditLogs]);

  useEffect(() => {
    if (settings.systemTitle) {
      document.title = settings.systemTitle;
    }
  }, [settings.systemTitle]);

  useEffect(() => {
    try {
      localStorage.setItem('app_settings_v5', JSON.stringify(settings));
    } catch (e) {
      console.warn('Error saving settings to localStorage:', e);
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('app_current_user_v5', JSON.stringify(currentUser));
    } catch (e) {
      console.warn('Error saving currentUser to localStorage:', e);
    }
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
      letterContentHtml,
      letterNumber,
      pageSize,
      isOfficialLetter,
      headerCenterTitle,
      headerCenterOffsetX,
      headerCenterOffsetY,
      subjectOffsetX,
      subjectOffsetY,
      metaOffsetX,
      metaOffsetY,
      headerCenterFontFamily,
      subjectFontFamily,
      metaFontFamily,
      signerFontFamily,
      signerFontSize,
      customSignerName,
      customSignerTitle,
      signatureOffsetX,
      signatureOffsetY,
      signatureHeight,
      customFooterNote,
      bodyOffsetX,
      bodyPaddingX,
      attachmentFileName,
      attachmentFileSize,
      attachmentFileDataUrl,
      onProgress,
      onDone,
    }: {
      rawFile: globalThis.File;
      recipientId: string;
      note: string;
      letterContentHtml?: string;
      letterNumber?: string;
      pageSize?: string;
      isOfficialLetter?: boolean;
      headerCenterTitle?: string;
      headerCenterOffsetX?: number;
      headerCenterOffsetY?: number;
      subjectOffsetX?: number;
      subjectOffsetY?: number;
      metaOffsetX?: number;
      metaOffsetY?: number;
      headerCenterFontFamily?: string;
      subjectFontFamily?: string;
      metaFontFamily?: string;
      signerFontFamily?: string;
      signerFontSize?: number;
      customSignerName?: string;
      customSignerTitle?: string;
      signatureOffsetX?: number;
      signatureOffsetY?: number;
      signatureHeight?: number;
      customFooterNote?: string;
      bodyOffsetX?: number;
      bodyPaddingX?: number;
      attachmentFileName?: string;
      attachmentFileSize?: string;
      attachmentFileDataUrl?: string;
      onProgress: (p: number) => void;
      onDone: () => void;
    }) => {
      const recipient = staffList.find((u) => u.id === recipientId) || staffList[1];
      const transferId = 'tr-' + Math.random().toString(36).substring(2, 9);
      const fileId = 'f-' + Math.random().toString(36).substring(2, 9);

      // Store the real File in memory for instant, reliable download
      fileBlobStore.set(transferId, rawFile);
      fileBlobStore.set(fileId, rawFile);

      let progress = 0;
      const timer = setInterval(() => {
        progress += Math.floor(Math.random() * 25) + 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(timer);

          const category: FileCategory = getFileCategory(rawFile.name);

          let finalLetterNumber = letterNumber;
          if (isOfficialLetter && !finalLetterNumber) {
            finalLetterNumber = formatLetterNumber(settings.letterNumbering);
          }

// Official letter numbering counter consumes and increments upon signature approval in handleSignLetter

          const newTransfer: FileTransfer = {
            id: transferId,
            fileId: fileId,
            fileName: rawFile.name,
            fileSize: formatBytes(rawFile.size),
            category,
            sender: currentUser,
            recipients: [recipient],
            note: note.trim() || (isOfficialLetter ? 'نامه رسمی جهت بررسی و امضای مدیر' : 'فایل ارسالی درون‌سازمانی'),
            letterContentHtml: convertNumbersInHtmlToPersian(letterContentHtml || (isOfficialLetter ? note : undefined) || ''),
            letterNumber: finalLetterNumber,
            pageSize,
            status: 'DELIVERED',
            sentAt: formatCurrentJalaliDateTime(),
            expiresAt: 'تا ۷ روز دیگر',
            downloadsCount: 0,
            isOfficialLetter: !!isOfficialLetter,
            signatureStatus: isOfficialLetter ? 'PENDING_SIGNATURE' : undefined,
            customHeaderCenterTitle: headerCenterTitle,
            headerCenterOffsetX,
            headerCenterOffsetY,
            subjectOffsetX,
            subjectOffsetY,
            metaOffsetX,
            metaOffsetY,
            headerCenterFontFamily,
            subjectFontFamily,
            metaFontFamily,
            signerFontFamily,
            signerFontSize,
            customSignerName,
            customSignerTitle,
            signatureOffsetX,
            signatureOffsetY,
            signatureHeight: signatureHeight || 200,
            customFooterNote,
            bodyOffsetX,
            bodyPaddingX,
            attachmentFileName,
            attachmentFileSize,
            attachmentFileDataUrl,
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
      }, 100);
    },
    [staffList, currentUser, showToast]
  );

  const handleDownload = useCallback(
    (t: FileTransfer) => {
      try {
        // 0. If it's an official letter, open and generate official PDF with embedded scanned signature & stamp
        if (t.isOfficialLetter) {
          openAndDownloadPdfLetter(t, settings, currentUser);
        } else {
          // 1. Check in-memory store for actual uploaded file
          let downloadBlob = fileBlobStore.get(t.id);

          if (t.fileDataUrl && !downloadBlob) {
            const link = document.createElement('a');
            link.href = t.fileDataUrl;
            link.download = t.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }

          // 2. Fallback for mock/seeded files so download never fails
          if (!downloadBlob && !t.fileDataUrl) {
            const sampleContent = `سامانه اتوماسیون سازمانی\n====================\nنام فایل: ${t.fileName}\nحجم: ${t.fileSize}\nفرستنده: ${t.sender.fullName} (${t.sender.departmentName})\nگیرنده: ${t.recipients.map((r) => r.fullName).join(', ')}\nتاریخ ارسال: ${t.sentAt}\nتوضیحات: ${t.note || '---'}\n\nوضعیت سند: تایید شده و رمزنگاری شده`;
            downloadBlob = new Blob([sampleContent], { type: 'text/plain;charset=utf-8' });
          }

          if (downloadBlob) {
            const url = URL.createObjectURL(downloadBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = t.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }
        }

        setTransfers((prev) =>
          prev.map((item) =>
            item.id === t.id
              ? { ...item, downloadsCount: item.downloadsCount + 1, status: 'DOWNLOADED' as const }
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
        showToast(`فایل "${t.fileName}" با موفقیت دانلود شد.`);
      } catch (err) {
        console.error('Download error:', err);
        showToast(`خطا در دانلود فایل "${t.fileName}"`);
      }
    },
    [currentUser, showToast]
  );

  const handleDeleteTransfer = useCallback(
    (id: string) => {
      const target = transfers.find((t) => t.id === id);
      if (target && target.isOfficialLetter && target.signatureStatus === 'SIGNED') {
        showToast('⚠️ امکان حذف نامه‌های رسمی امضاشده وجود ندارد. این سند حقوقی است و تنها می‌توانید آن را بایگانی کنید.');
        return;
      }
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      showToast('فایل یا پیش‌نویس از لیست حذف شد.');
    },
    [transfers, showToast]
  );

  const handleArchiveTransfer = useCallback(
    (id: string) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isArchived: true, archivedAt: formatCurrentJalaliDateTime() } : t))
      );
      const target = transfers.find((t) => t.id === id);
      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `بایگانی نامه رسمی "${target?.fileName || ''}".`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`نامه "${target?.fileName || ''}" به بخش بایگانی اسناد منتقل گردید.`);
    },
    [transfers, currentUser, showToast]
  );

  const handleUnarchiveTransfer = useCallback(
    (id: string) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isArchived: false } : t))
      );
      const target = transfers.find((t) => t.id === id);
      showToast(`نامه "${target?.fileName || ''}" از بایگانی به کارتابل جاری بازگردانده شد.`);
    },
    [transfers, showToast]
  );

  const handleSignLetter = useCallback(
    (
      transferId: string,
      comment?: string,
      signatureOptions?: {
        signatureHeight?: number;
        signatureOffsetX?: number;
        signatureOffsetY?: number;
        pageSize?: string;
        customBody?: string;
        customHeaderNumber?: string;
        customHeaderDate?: string;
        customHeaderAttachment?: string;
        customHeaderSubject?: string;
        customHeaderCompanyTitle?: string;
        customHeaderCompanySubtitle?: string;
        customHeaderCenterTitle?: string;
        customFooterNote?: string;
        metaOffsetX?: number;
        metaOffsetY?: number;
        headerCenterFontFamily?: string;
        subjectFontFamily?: string;
        metaFontFamily?: string;
        signerFontFamily?: string;
        signerFontSize?: number;
        customSignerName?: string;
        customSignerTitle?: string;
        bodyOffsetX?: number;
        bodyPaddingX?: number;
      }
    ) => {
      setTransfers((prev) =>
        prev.map((t) => {
          if (t.id === transferId) {
            return {
              ...t,
              signatureStatus: 'SIGNED',
              signedBy: settings.ceoName || currentUser.fullName,
              signedAt: formatCurrentJalaliDateTime(),
              signatureComment: comment || 'تایید و امضا شد',
              signatureImageUrl: settings.ceoSignatureUrl,
              companyStampImageUrl: settings.companyStampUrl,
              signatureHeight: signatureOptions?.signatureHeight ?? t.signatureHeight ?? 200,
              signatureOffsetX: signatureOptions?.signatureOffsetX ?? t.signatureOffsetX ?? 0,
              signatureOffsetY: signatureOptions?.signatureOffsetY ?? t.signatureOffsetY ?? 0,
              pageSize: signatureOptions?.pageSize || t.pageSize,
              letterContentHtml: convertNumbersInHtmlToPersian(signatureOptions?.customBody || t.letterContentHtml || ''),
              customHeaderNumber: signatureOptions?.customHeaderNumber || t.customHeaderNumber,
              customHeaderDate: signatureOptions?.customHeaderDate || t.customHeaderDate,
              customHeaderAttachment: signatureOptions?.customHeaderAttachment || t.customHeaderAttachment,
              customHeaderSubject: signatureOptions?.customHeaderSubject || t.customHeaderSubject,
              customHeaderCompanyTitle: signatureOptions?.customHeaderCompanyTitle || t.customHeaderCompanyTitle,
              customHeaderCompanySubtitle: signatureOptions?.customHeaderCompanySubtitle || t.customHeaderCompanySubtitle,
              customHeaderCenterTitle: signatureOptions?.customHeaderCenterTitle || t.customHeaderCenterTitle,
              customFooterNote: signatureOptions?.customFooterNote || t.customFooterNote,
              metaOffsetX: signatureOptions?.metaOffsetX !== undefined ? signatureOptions.metaOffsetX : t.metaOffsetX,
              metaOffsetY: signatureOptions?.metaOffsetY !== undefined ? signatureOptions.metaOffsetY : t.metaOffsetY,
              headerCenterFontFamily: signatureOptions?.headerCenterFontFamily || t.headerCenterFontFamily,
              subjectFontFamily: signatureOptions?.subjectFontFamily || t.subjectFontFamily,
              metaFontFamily: signatureOptions?.metaFontFamily || t.metaFontFamily,
              signerFontFamily: signatureOptions?.signerFontFamily || t.signerFontFamily,
              signerFontSize: signatureOptions?.signerFontSize || t.signerFontSize,
              customSignerName: signatureOptions?.customSignerName || t.customSignerName,
              customSignerTitle: signatureOptions?.customSignerTitle || t.customSignerTitle,
              bodyOffsetX: signatureOptions?.bodyOffsetX !== undefined ? signatureOptions.bodyOffsetX : t.bodyOffsetX,
              bodyPaddingX: signatureOptions?.bodyPaddingX !== undefined ? signatureOptions.bodyPaddingX : t.bodyPaddingX,
            };
          }
          return t;
        })
      );

      const target = transfers.find((t) => t.id === transferId);

      // Increment letter numbering counter upon signing
      const step = settings.letterNumbering?.incrementStep || 1;
      const currentNext = settings.letterNumbering?.nextNumber || 1001;
      setSettings((prev) => ({
        ...prev,
        letterNumbering: {
          ...DEFAULT_LETTER_NUMBERING,
          ...(prev.letterNumbering || {}),
          nextNumber: currentNext + step,
        },
      }));

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'ADMIN_SETTING_CHANGE',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `امضای الکترونیک نامه رسمی "${target?.fileName || ''}" توسط مدیر (${currentUser.fullName}).`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`نامه رسمی "${target?.fileName || ''}" با موفقیت توسط ${currentUser.fullName} امضا گردید.`);
    },
    [currentUser, settings, transfers, showToast, setSettings]
  );

  const handleRejectLetter = useCallback(
    (transferId: string, reason?: string) => {
      setTransfers((prev) =>
        prev.map((t) => {
          if (t.id === transferId) {
            return {
              ...t,
              signatureStatus: 'REJECTED',
              signedBy: currentUser.fullName,
              signedAt: formatCurrentJalaliDateTime(),
              signatureComment: reason || 'عدم تایید / رد شده',
            };
          }
          return t;
        })
      );

      const target = transfers.find((t) => t.id === transferId);
      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SECURITY_EVENT',
        severity: 'WARNING',
        ipAddress: '192.168.1.104',
        details: `رد پیش‌نویس نامه رسمی "${target?.fileName || ''}" توسط مدیر (${currentUser.fullName}). علت: ${reason || 'عدم انطباق'}`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast('نامه رسمی رد گردید.');
    },
    [currentUser, transfers, showToast]
  );

  const handleReferLetter = useCallback(
    (transferId: string, toUserId: string, referralComment: string) => {
      const toUser = staffList.find((u) => u.id === toUserId);
      if (!toUser) return;

      const newReferral = {
        id: 'ref-' + Math.random().toString(36).substring(2, 9),
        fromUser: currentUser,
        toUser: toUser,
        date: formatCurrentJalaliDateTime(),
        comment: referralComment.trim() || 'جهت بررسی و اقدام مقتضی',
      };

      setTransfers((prev) =>
        prev.map((t) => {
          if (t.id === transferId) {
            const alreadyInRecipients = t.recipients.some((r) => r.id === toUserId);
            const updatedRecipients = alreadyInRecipients ? t.recipients : [...t.recipients, toUser];
            const existingReferrals = t.referrals || [];
            return {
              ...t,
              recipients: updatedRecipients,
              referrals: [...existingReferrals, newReferral],
            };
          }
          return t;
        })
      );

      const target = transfers.find((t) => t.id === transferId);
      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'FILE_TRANSFER',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `ارجاع نامه رسمی "${target?.fileName || ''}" به ${toUser.fullName} با دستور: "${newReferral.comment}"`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`نامه رسمی با موفقیت به "${toUser.fullName}" ارجاع داده شد.`);
    },
    [currentUser, staffList, transfers, showToast]
  );

  const handleCreateUser = useCallback(
    (data: {
      fullName: string;
      email: string;
      password?: string;
      role: User['role'];
      departmentId: string;
      quotaGB: number;
      canSendOfficialLetters?: boolean;
      canSignOfficialLetters?: boolean;
    }) => {
      const dept = departments.find((d) => d.id === data.departmentId) || departments[0];
      const newUser: User = {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        fullName: data.fullName,
        email: data.email,
        password: data.password || '123456',
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
        canSendOfficialLetters: !!data.canSendOfficialLetters,
        canSignOfficialLetters: !!data.canSignOfficialLetters,
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
    [currentUser, departments, showToast]
  );

  const handleUpdateUser = useCallback(
    (userId: string, updates: Partial<User>) => {
      setStaffList((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
      setCurrentUser((prev) => (prev.id === userId ? { ...prev, ...updates } : prev));
      setLoggedInUser((prev) => (prev && prev.id === userId ? { ...prev, ...updates } : prev));
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

  const handleCreateDepartment = useCallback(
    (data: Omit<Department, 'id'>) => {
      const newDept: Department = {
        id: 'dept-' + Math.random().toString(36).substring(2, 9),
        ...data,
      };

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'WARNING',
        ipAddress: '192.168.1.104',
        details: `تعریف واحد سازمانی جدید "${newDept.name}" (کد: ${newDept.code}) با سهمیه پیش‌فرض ${newDept.defaultQuotaGB}GB.`,
      };

      setDepartments((prev) => [...prev, newDept]);
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`واحد سازمانی "${newDept.name}" با موفقیت ایجاد شد.`);
    },
    [currentUser, showToast]
  );

  const handleUpdateDepartment = useCallback(
    (deptId: string, updates: Partial<Department>) => {
      setDepartments((prev) =>
        prev.map((d) => (d.id === deptId ? { ...d, ...updates } : d))
      );
      // Also update departmentName in staffList if name changed
      if (updates.name) {
        setStaffList((prev) =>
          prev.map((u) =>
            u.departmentId === deptId ? { ...u, departmentName: updates.name! } : u
          )
        );
      }

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `ویرایش اطلاعات واحد سازمانی (شناسه: ${deptId}).`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast('اطلاعات واحد سازمانی به‌روزرسانی شد.');
    },
    [currentUser, showToast]
  );

  const handleDeleteDepartment = useCallback(
    (deptId: string) => {
      const dept = departments.find((d) => d.id === deptId);
      const usersInDept = staffList.filter((u) => u.departmentId === deptId);
      if (usersInDept.length > 0) {
        showToast(`خطا: ${usersInDept.length} کارمند در این واحد وجود دارد. ابتدا کارمندان را منتقل کنید.`);
        return;
      }

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'CRITICAL',
        ipAddress: '192.168.1.104',
        details: `حذف واحد سازمانی "${dept?.name || deptId}".`,
      };

      setDepartments((prev) => prev.filter((d) => d.id !== deptId));
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`واحد سازمانی "${dept?.name || ''}" حذف شد.`);
    },
    [currentUser, departments, staffList, showToast]
  );

  const fonts = useMemo<CustomFont[]>(() => {
    return [...DEFAULT_FONTS, ...(settings.customFonts || [])];
  }, [settings.customFonts]);

  // Inject dynamic @font-face CSS for uploaded fonts
  useEffect(() => {
    injectCustomFontsCss(settings.customFonts || []);
  }, [settings.customFonts]);

  const handleAddCustomFont = useCallback(
    (fontData: {
      name: string;
      fontFamily: string;
      fileName: string;
      format: CustomFont['format'];
      dataUrl: string;
      sizeBytes?: number;
    }) => {
      const newFont: CustomFont = {
        id: 'font-' + Math.random().toString(36).substring(2, 9),
        name: fontData.name.trim() || fontData.fileName.replace(/\.[^/.]+$/, ''),
        fontFamily: fontData.fontFamily.trim() || `CustomFont_${Date.now()}`,
        fileName: fontData.fileName,
        format: fontData.format || 'truetype',
        dataUrl: fontData.dataUrl,
        isDefault: false,
        uploadedAt: formatCurrentJalaliDateTime(),
        sizeBytes: fontData.sizeBytes,
      };

      setSettings((prev) => {
        const existing = prev.customFonts || [];
        return {
          ...prev,
          customFonts: [...existing, newFont],
        };
      });

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'INFO',
        ipAddress: '192.168.1.104',
        details: `بارگذاری فونت اختصاصی جدید "${newFont.name}" (${newFont.fileName}).`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`فونت "${newFont.name}" با موفقیت به سیستم اضافه شد.`);
    },
    [currentUser, showToast]
  );

  const handleDeleteCustomFont = useCallback(
    (fontId: string) => {
      const fontToDelete = (settings.customFonts || []).find((f) => f.id === fontId);
      setSettings((prev) => ({
        ...prev,
        customFonts: (prev.customFonts || []).filter((f) => f.id !== fontId),
        defaultLetterFontId: prev.defaultLetterFontId === fontId ? 'vazirmatn' : prev.defaultLetterFontId,
      }));

      const newLog: AuditLog = {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: formatJalaliFullTimestamp(),
        userName: currentUser.fullName,
        userEmail: currentUser.email,
        action: 'SETTINGS_UPDATE',
        severity: 'WARNING',
        ipAddress: '192.168.1.104',
        details: `حذف فونت سفارشی "${fontToDelete?.name || fontId}".`,
      };
      setAuditLogs((prev) => [newLog, ...prev]);
      showToast(`فونت "${fontToDelete?.name || ''}" از لیست حذف شد.`);
    },
    [settings.customFonts, currentUser, showToast]
  );

  const handleSetDefaultLetterFont = useCallback(
    (fontId: string) => {
      setSettings((prev) => ({
        ...prev,
        defaultLetterFontId: fontId,
      }));
      const allFonts = [...DEFAULT_FONTS, ...(settings.customFonts || [])];
      const chosen = allFonts.find((f) => f.id === fontId);
      showToast(`فونت پیش‌فرض مکاتبات اداری به "${chosen?.name || fontId}" تنظیم شد.`);
    },
    [settings.customFonts, showToast]
  );

  return (
    <AppContext.Provider
      value={{
        loggedInUser,
        login,
        logout,
        staffList,
        setStaffList,
        currentUser,
        setCurrentUser,
        departments,
        setDepartments,
        transfers,
        setTransfers,
        auditLogs,
        setAuditLogs,
        settings,
        setSettings,
        currentTheme,
        setTheme,
        fonts,
        handleAddCustomFont,
        handleDeleteCustomFont,
        handleSetDefaultLetterFont,
        toastMessage,
        showToast,
        handleSendTransfer,
        handleDownload,
        handleDeleteTransfer,
        handleArchiveTransfer,
        handleUnarchiveTransfer,
        handleSignLetter,
        handleRejectLetter,
        handleReferLetter,
        handleCreateUser,
        handleUpdateUser,
        handleDeleteUser,
        handleCreateDepartment,
        handleUpdateDepartment,
        handleDeleteDepartment,
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
