import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_SIGNATURE_HEIGHT, resolveSignatureHeight } from '../lib/letterDefaults';
import { disablePush, registerServiceWorker, syncPushIfAllowed } from '../lib/push';
import {
  AppNotification,
  flashTitle,
  installAudioUnlock,
  isSoundEnabled,
  playChime,
  setSoundEnabled as persistSoundEnabled,
  showOsNotification,
  startNotifyStream,
} from '../lib/notifications';
import { User, FileTransfer, AuditLog, SystemSettings, FileCategory, Department, CustomFont, Task } from '../types';
import { INITIAL_SETTINGS } from '../lib/mock-data';
import { api, getToken, setToken, setUnauthorizedHandler, ServerState } from '../lib/api';
import { useServerSync, hasPendingWrites } from '../lib/useServerSync';
import { putLocalFile, getLocalFile, deleteLocalFile, dataUrlToBlob } from '../lib/localFiles';
import { startP2P, stopP2P, requestFile } from '../lib/p2p';
import { formatCurrentJalaliDateTime, formatJalaliFullTimestamp, toPersianDigits, convertNumbersInHtmlToPersian } from '../lib/jalali';
import { formatBytes, getFileCategory } from '../lib/utils';
import { applyTheme } from '../lib/theme';
import { openAndDownloadPdfLetter } from '../lib/pdfLetterGenerator';
import { DEFAULT_FONTS, injectCustomFontsCss } from '../lib/fonts';
import { formatLetterNumber, DEFAULT_LETTER_NUMBERING } from '../lib/letterNumbering';

interface AppContextType {
  // Auth
  loggedInUser: User | null;
  ready: boolean;
  loginWithCredentials: (
    identifier: string,
    password: string,
    adminOnly?: boolean
  ) => Promise<{ ok: true; user: User } | { ok: false; error: string }>;
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
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
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
    signatureImgOffsetX?: number;
    signatureImgOffsetY?: number;
    stampHeight?: number;
    stampOffsetX?: number;
    stampOffsetY?: number;
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
      signatureImgOffsetX?: number;
      signatureImgOffsetY?: number;
      stampHeight?: number;
      stampOffsetX?: number;
      stampOffsetY?: number;
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
  handleDownload: (t: FileTransfer) => Promise<void>;
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
    canUseTasks?: boolean;
  }) => void;
  handleUpdateUser: (userId: string, updates: Partial<User>) => void;
  handleDeleteUser: (userId: string) => void;
  handleCreateDepartment: (data: Omit<Department, 'id'>) => void;
  handleUpdateDepartment: (deptId: string, updates: Partial<Department>) => void;
  handleDeleteDepartment: (deptId: string) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationsRead: (ids?: string[]) => void;
  clearNotifications: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (on: boolean) => void;
  /** Set by the panel: where to go when a notification is opened. */
  setNotificationHandler: (fn: ((n: AppNotification) => void) | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const getUserTheme = (user?: User | null): string => {
  if (!user || !user.id) return 'cherry';
  if (user.themeId) return user.themeId;
  try {
    const saved = localStorage.getItem(`app_user_theme_${user.id}`);
    if (saved) return saved;
  } catch (e) {}
  return 'cherry';
};

// Placeholder used only while nobody is signed in.
const GUEST_USER: User = {
  id: '',
  fullName: '',
  email: '',
  avatarUrl: '',
  avatarInitials: '',
  role: 'STAFF',
  departmentId: '',
  departmentName: '',
  storageQuotaGB: 0,
  storageUsedGB: 0,
  isActive: false,
  lastLogin: '',
};

const SESSION_KEYS = ['admin_session_auth_v5'];
const POLL_INTERVAL_MS = 15000;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staffList, setStaffList] = useState<User[]>([]);
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User>(GUEST_USER);
  const [currentTheme, setCurrentThemeState] = useState<string>('cherry');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // `ready`: initial session check finished. `syncReady`: a valid session exists and edits are mirrored to the server.
  const [ready, setReady] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const lastStateJson = useRef('');
  const sessionUserId = useRef('');
  const transfersRef = useRef<FileTransfer[]>([]);
  transfersRef.current = transfers;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const reloadRef = useRef<() => void>(() => {});
  const { markSynced } = useServerSync({
    ready: syncReady,
    staff: staffList,
    departments,
    transfers,
    tasks,
    auditLogs,
    settings,
    onError: (e) => {
      showToast(`ذخیره‌سازی روی سرور ناموفق بود: ${e instanceof Error ? e.message : 'خطای ناشناخته'}`);
      reloadRef.current();
    },
  });

  const applyServerState = useCallback(
    (s: ServerState, force = false) => {
      const json = JSON.stringify(s);
      if (!force && json === lastStateJson.current) return;
      lastStateJson.current = json;
      sessionUserId.current = s.me.id;
      const merged: SystemSettings = { ...INITIAL_SETTINGS, ...(s.settings || {}) };
      markSynced(s, merged);
      // Keep the existing reference when nothing changed, so open forms (e.g. the settings draft)
      // are not reset by a background refresh caused by an unrelated change.
      const keep = <T,>(prev: T, next: T): T => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      setStaffList((prev) => keep(prev, s.staff));
      setDepartments((prev) => keep(prev, s.departments));
      setTransfers((prev) => keep(prev, s.transfers));
      setTasks((prev) => keep(prev, s.tasks || []));
      setAuditLogs((prev) => keep(prev, s.auditLogs));
      setSettings((prev) => keep(prev, merged));
      // Keep an admin's "act as" selection across refreshes; otherwise follow the signed-in account.
      setCurrentUser((prev) => (prev.id && prev.id !== s.me.id ? s.staff.find((u) => u.id === prev.id) || s.me : s.me));
    },
    [markSynced]
  );

  const clearSession = useCallback(() => {
    setToken(null);
    try {
      SESSION_KEYS.forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
    } catch (e) {}
    lastStateJson.current = '';
    sessionUserId.current = '';
    setSyncReady(false);
    setLoggedInUser(null);
    setCurrentUser(GUEST_USER);
    setStaffList([]);
    setDepartments([]);
    setTransfers([]);
    setTasks([]);
    setAuditLogs([]);
    setSettings(INITIAL_SETTINGS);
    setCurrentThemeState('cherry');
    applyTheme('cherry');
  }, []);

  reloadRef.current = () => {
    api.state().then((s) => applyServerState(s, true)).catch(() => {});
  };

  // Restore an existing session on page load.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (!getToken()) {
      clearSession();
      setReady(true);
      return;
    }
    api
      .state()
      .then((s) => {
        applyServerState(s, true);
        setLoggedInUser(s.me);
        setSyncReady(true);
      })
      .catch(() => clearSession())
      .finally(() => setReady(true));
  }, [applyServerState, clearSession]);

  // Serve the files stored on this computer to the recipients of the letters/transfers I sent.
  useEffect(() => {
    if (!syncReady) return;
    startP2P((requesterId, key) => {
      const transferId = key.startsWith('att:') ? key.slice(4) : key;
      const t = transfersRef.current.find((x) => x.id === transferId);
      return !!t && t.sender.id === sessionUserId.current && t.recipients.some((r) => r.id === requesterId);
    });
    return () => stopP2P();
  }, [syncReady]);

  // Pick up changes made by other users.
  useEffect(() => {
    if (!syncReady) return;
    const timer = setInterval(() => {
      if (hasPendingWrites() || document.hidden) return;
      api.state().then((s) => applyServerState(s)).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncReady, applyServerState]);

  // ---------- notifications: live stream + stored history ----------
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());
  const notificationHandler = useRef<((n: AppNotification) => void) | null>(null);
  const setNotificationHandler = useCallback((fn: ((n: AppNotification) => void) | null) => {
    notificationHandler.current = fn;
  }, []);

  useEffect(() => installAudioUnlock(), []);
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  useEffect(() => {
    if (syncReady) void syncPushIfAllowed();
  }, [syncReady]);
  // A tap on a system notification while the app is open in the background: open its target.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open-notification' && e.data.data) notificationHandler.current?.(e.data.data as AppNotification);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!syncReady) {
      setNotifications([]);
      return;
    }
    const me = sessionUserId.current;
    const seenKey = `notif_seen_${me}`;
    const getSeen = () => {
      try {
        return localStorage.getItem(seenKey) || '';
      } catch {
        return '';
      }
    };
    const setSeen = (iso: string) => {
      try {
        if (iso > getSeen()) localStorage.setItem(seenKey, iso);
      } catch {
        /* storage unavailable */
      }
    };

    const loadHistory = (announce: boolean) =>
      api
        .notifications()
        .then(({ notifications: list }) => {
          setNotifications(list);
          if (!announce) return;
          const seen = getSeen();
          const fresh = list.filter((n) => !n.read && n.createdAt > seen);
          if (fresh.length) {
            playChime(fresh[0].kind);
            showToast(fresh.length === 1 ? fresh[0].title : `${fresh.length} اعلان جدید دارید`);
          }
          if (list[0]) setSeen(list[0].createdAt);
        })
        .catch(() => {});

    let first = true;
    const stop = startNotifyStream(
      (n) => {
        setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 100)));
        setSeen(n.createdAt);
        playChime(n.kind);
        showToast(n.title);
        flashTitle(n.title);
        showOsNotification(n, () => notificationHandler.current?.(n));
        // Bring the new file / letter / task into the lists right away.
        reloadRef.current();
      },
      () => {
        // (Re)connected: catch up on anything missed while offline; only the first load announces.
        void loadHistory(first);
        if (!first) reloadRef.current();
        first = false;
      }
    );
    return stop;
  }, [syncReady, showToast]);

  const markNotificationsRead = useCallback((ids?: string[]) => {
    setNotifications((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    void api.markNotificationsRead(ids).catch(() => {});
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    void api.clearNotifications().catch(() => {});
  }, []);

  const setSoundEnabled = useCallback((on: boolean) => {
    persistSoundEnabled(on);
    setSoundEnabledState(on);
    if (on) playChime('file');
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

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

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string, adminOnly = false) => {
      try {
        const { token, user } = await api.login(identifier, password, adminOnly);
        setToken(token);
        const s = await api.state();
        applyServerState(s, true);
        if (!adminOnly) setLoggedInUser(s.me);
        setCurrentUser(s.me);
        setSyncReady(true);
        return { ok: true as const, user };
      } catch (e) {
        setToken(null);
        return { ok: false as const, error: e instanceof Error ? e.message : 'خطا در ورود' };
      }
    },
    [applyServerState]
  );

  const logout = useCallback(() => {
    // Stop pushing this user's notifications to this device before the session token is dropped.
    void Promise.race([disablePush(), new Promise((r) => setTimeout(r, 1500))]).finally(clearSession);
  }, [clearSession]);

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
      signatureImgOffsetX,
      signatureImgOffsetY,
      stampHeight,
      stampOffsetX,
      stampOffsetY,
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
      signatureImgOffsetX?: number;
      signatureImgOffsetY?: number;
      stampHeight?: number;
      stampOffsetX?: number;
      stampOffsetY?: number;
      customFooterNote?: string;
      bodyOffsetX?: number;
      bodyPaddingX?: number;
      attachmentFileName?: string;
      attachmentFileSize?: string;
      attachmentFileDataUrl?: string;
      onProgress: (p: number) => void;
      onDone: () => void;
    }) => {
      if (settings.maxUploadSizeBytes && rawFile.size > settings.maxUploadSizeBytes) {
        showToast(`حجم فایل (${formatBytes(rawFile.size)}) بیش از سقف مجاز ارسال (${formatBytes(settings.maxUploadSizeBytes)}) است.`);
        onDone();
        return;
      }
      const recipient = staffList.find((u) => u.id === recipientId) || staffList[1];
      const transferId = 'tr-' + Math.random().toString(36).substring(2, 9);

      // The file itself stays on the sender's computer; only the letter/transfer record goes to the database.
      const storeLocally = async () => {
        onProgress(30);
        await putLocalFile(transferId, rawFile);
        if (attachmentFileDataUrl) {
          await putLocalFile(`att:${transferId}`, await dataUrlToBlob(attachmentFileDataUrl));
        }
      };
      storeLocally()
        .then(() => {
          onProgress(100);

          const category: FileCategory = getFileCategory(rawFile.name);

          let finalLetterNumber = letterNumber;
          if (isOfficialLetter && !finalLetterNumber) {
            finalLetterNumber = formatLetterNumber(settings.letterNumbering);
          }

// Official letter numbering counter consumes and increments upon signature approval in handleSignLetter

          const newTransfer: FileTransfer = {
            id: transferId,
            fileId: transferId,
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
            signatureHeight,
            signatureImgOffsetX,
            signatureImgOffsetY,
            stampHeight,
            stampOffsetX,
            stampOffsetY,
            customFooterNote,
            bodyOffsetX,
            bodyPaddingX,
            attachmentFileName,
            attachmentFileSize,
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
        })
        .catch((err) => {
          showToast(`ذخیره فایل روی این سیستم ناموفق بود: ${err instanceof Error ? err.message : 'خطای ناشناخته'}`);
          onDone();
        });
    },
    [staffList, currentUser, settings, showToast]
  );

  const handleDownload = useCallback(
    async (t: FileTransfer) => {
      try {
        // Official letters are rendered to PDF client-side with the embedded signature & stamp
        if (t.isOfficialLetter) {
          openAndDownloadPdfLetter(t, settings, currentUser);
        } else {
          let downloadBlob: Blob | null = await getLocalFile(t.id);
          if (!downloadBlob) {
            if (t.sender.id === sessionUserId.current) {
              throw new Error('فایل روی این سیستم پیدا نشد (در مرورگر یا رایانهٔ دیگری ارسال شده است).');
            }
            showToast('در حال دریافت مستقیم فایل از سیستم فرستنده...');
            const picker = (window as any).showSaveFilePicker as undefined | ((o: unknown) => Promise<any>);
            if (picker) {
              // Stream straight to disk so large files don't have to fit in memory
              const handle = await picker({ suggestedName: t.fileName });
              const writable = await handle.createWritable();
              await requestFile(t.sender.id, t.id, {
                sink: {
                  write: (c) => writable.write(c),
                  close: () => writable.close(),
                  abort: () => writable.abort(),
                },
              });
            } else {
              downloadBlob = await requestFile(t.sender.id, t.id);
            }
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
          ipAddress: '',
          details: `دانلود فایل "${t.fileName}" توسط ${currentUser.fullName}.`,
        };
        setAuditLogs((prev) => [newLog, ...prev]);
        showToast(`فایل "${t.fileName}" با موفقیت دانلود شد.`);
      } catch (err) {
        console.error('Download error:', err);
        if (err instanceof DOMException && err.name === 'AbortError') return; // save dialog cancelled
        showToast(err instanceof Error && err.message ? err.message : `خطا در دانلود فایل "${t.fileName}"`);
      }
    },
    [currentUser, settings, showToast]
  );

  const handleDeleteTransfer = useCallback(
    (id: string) => {
      const target = transfers.find((t) => t.id === id);
      if (target && target.isOfficialLetter && target.signatureStatus === 'SIGNED') {
        showToast('⚠️ امکان حذف نامه‌های رسمی امضاشده وجود ندارد. این سند حقوقی است و تنها می‌توانید آن را بایگانی کنید.');
        return;
      }
      setTransfers((prev) => prev.filter((t) => t.id !== id));
      // Only the sender owns the original file; recipients merely drop their own list entry.
      if (!target || target.sender.id === sessionUserId.current) void deleteLocalFile(id).catch(() => {});
      void deleteLocalFile(`att:${id}`).catch(() => {});
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
        signatureImgOffsetX?: number;
        signatureImgOffsetY?: number;
        stampHeight?: number;
        stampOffsetX?: number;
        stampOffsetY?: number;
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
              signatureHeight: signatureOptions?.signatureHeight ?? resolveSignatureHeight(t.signatureHeight, t.pageSize === 'A5', settings.ceoSignatureHeight),
              signatureOffsetX: signatureOptions?.signatureOffsetX ?? t.signatureOffsetX ?? 0,
              signatureOffsetY: signatureOptions?.signatureOffsetY ?? t.signatureOffsetY ?? 0,
              signatureImgOffsetX: signatureOptions?.signatureImgOffsetX ?? t.signatureImgOffsetX ?? 0,
              signatureImgOffsetY: signatureOptions?.signatureImgOffsetY ?? t.signatureImgOffsetY ?? 0,
              stampHeight: signatureOptions?.stampHeight ?? t.stampHeight,
              stampOffsetX: signatureOptions?.stampOffsetX ?? t.stampOffsetX ?? 0,
              stampOffsetY: signatureOptions?.stampOffsetY ?? t.stampOffsetY ?? 0,
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
      canUseTasks?: boolean;
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
        canUseTasks: !!data.canUseTasks,
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
        ready,
        loginWithCredentials,
        logout,
        staffList,
        setStaffList,
        currentUser,
        setCurrentUser,
        departments,
        setDepartments,
        transfers,
        setTransfers,
        tasks,
        setTasks,
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
        notifications,
        unreadCount,
        markNotificationsRead,
        clearNotifications,
        soundEnabled,
        setSoundEnabled,
        setNotificationHandler,
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
