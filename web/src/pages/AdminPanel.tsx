import { DemoAdminHint, useDemoInfo } from '../components/common/DemoBanner';
import { DayNightToggle } from '../components/common/DayNightToggle';
import { askConfirm } from '../lib/confirmDialog';
import { IconTab } from '../components/common/IconTab';
import { VersionBadge } from '../components/common/VersionBadge';
import { ManagementReports } from '../components/admin/ManagementReports';
import { api } from '../lib/api';
import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Activity,
  PieChart as PieChartIcon,
  Settings,
  Headset,
  Shield,
  FileSearch,
  BarChart3,
  ShieldCheck,
  Lock,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  LogOut,
  User as UserIcon,
  ArrowRight,
  Palette,
  X
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { UserManagementView } from '../components/admin/UserManagementView';
import { AnalyticsView } from '../components/admin/AnalyticsView';
import { NetWatchCard } from '../components/admin/NetWatchCard';
import { SupportAdmin } from '../components/admin/SupportAdmin';
import { useCompanyName } from '../lib/useCompanyName';
import { LoginBackdrop } from '../components/common/LoginBackdrop';
import { AuditLogsView } from '../components/admin/AuditLogsView';
import { ServerAddressCard } from '../components/admin/ServerAddressCard';
import { TransfersMonitor } from '../components/admin/TransfersMonitor';
import { SettingsView } from '../components/admin/SettingsView';
import { LetterManagementAdminView } from '../components/admin/LetterManagementAdminView';
import { Stamp, Trash2 } from 'lucide-react';
import { DepartmentManagementView } from '../components/admin/DepartmentManagementView';
import { ThemeSelector } from '../components/common/ThemeSelector';
import { toPersianDigits } from '../lib/jalali';
import { INITIAL_FILES } from '../lib/mock-data';

// Helper to normalize Persian/Arabic digits to English for verification
const normalizeDigits = (str: string) => {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.replace(new RegExp(persianDigits[i], 'g'), String(i));
    res = res.replace(new RegExp(arabicDigits[i], 'g'), String(i));
  }
  return res.trim().toLowerCase();
};

export default function AdminPanel() {
  const headerCompany = useCompanyName();
  const {
    staffList,
    currentUser,
    setCurrentUser,
    transfers,
    auditLogs,
    settings,
    setSettings,
    toastMessage,
    showToast,
    reloadState,
    departments,
    handleCreateUser,
    handleUpdateUser,
    handleDeleteUser,
    handleAdminDeleteTransfer,
    handleCreateDepartment,
    handleUpdateDepartment,
    handleDeleteDepartment,
    loginWithCredentials,
    logout,
    notifications,
    markNotificationsRead,
  } = useAppContext();

  // Authentication State for Admin Portal (Persisted to survive page refreshes)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('admin_session_auth_v5') || sessionStorage.getItem('admin_session_auth_v5');
      return !!saved;
    } catch (e) {
      return false;
    }
  });

  const [showThemeModal, setShowThemeModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const demoInfo = useDemoInfo();
  useEffect(() => {
    const d = demoInfo?.accounts?.[0];
    if (d) {
      setAdminUsername(d.identifier);
      setAdminPassword(d.password);
    }
  }, [demoInfo]);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync current user if loaded from existing admin session
  useEffect(() => {
    if (isAdminAuthenticated) {
      try {
        const savedAdminId = localStorage.getItem('admin_session_auth_v5') || sessionStorage.getItem('admin_session_auth_v5');
        if (savedAdminId) {
          const found = staffList.find((u) => u.id === savedAdminId && (u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'));
          if (found && currentUser.id !== found.id) {
            setCurrentUser(found);
          }
        }
      } catch (e) {
        console.warn('Error syncing admin session:', e);
      }
    }
  }, [isAdminAuthenticated, staffList, currentUser.id, setCurrentUser]);

  const [activeTab, setActiveTab] = useState<'users' | 'departments' | 'letters' | 'transfers' | 'audit' | 'analytics' | 'stats' | 'support' | 'settings'>('users');
  const [transfersSearch, setTransfersSearch] = useState('');
  // which files still exist on the server (and how big): read when the monitoring page is open
  const [fileSizes, setFileSizes] = useState<Record<string, number> | null>(null);
  const loadFileSizes = () => { api.adminFileInfo().then((r) => setFileSizes(r.sizes)).catch(() => setFileSizes(null)); };
  useEffect(() => {
    if (activeTab === 'transfers' && isAdminAuthenticated) loadFileSizes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdminAuthenticated]);

  // Unread notifications per console menu. Opening a menu reads its notifications, so no badge stays on it.
  type ConsoleTab = typeof activeTab;
  const tabOfNotification = (n: { kind: string; ref: { type: string } | null }): ConsoleTab | null => {
    const t = n.ref?.type;
    if (t === 'file' || t === 'letter' || n.kind === 'file' || n.kind === 'letter') return 'transfers';
    if (n.kind === 'alert' && !t) return 'audit';
    return null;
  };
  const unreadOf = (tab: ConsoleTab) => notifications.filter((n) => !n.read && tabOfNotification(n) === tab).length;
  useEffect(() => {
    const ids = notifications.filter((n) => !n.read && tabOfNotification(n) === activeTab).map((n) => n.id);
    if (ids.length) markNotificationsRead(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notifications]);
  const badge = (tab: ConsoleTab) => {
    const n = unreadOf(tab);
    return n > 0 && activeTab !== tab ? toPersianDigits(n > 99 ? '99+' : n) : undefined;
  };

  // Generate random 4-digit/character Captcha
  const generateCaptcha = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptchaInput('');
    setAuthError('');
  };

  // Draw Captcha on canvas
  useEffect(() => {
    if (!isAdminAuthenticated) {
      if (!captchaCode) {
        generateCaptcha();
      } else if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Background
          ctx.fillStyle = '#FAF5F1';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Noise lines
          for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = ['#6E1B1B33', '#D34A3233', '#C98B6A44'][i % 3];
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.bezierCurveTo(
              Math.random() * canvas.width, Math.random() * canvas.height,
              Math.random() * canvas.width, Math.random() * canvas.height,
              Math.random() * canvas.width, Math.random() * canvas.height
            );
            ctx.stroke();
          }

          // Noise dots
          for (let i = 0; i < 30; i++) {
            ctx.fillStyle = '#D34A3244';
            ctx.beginPath();
            ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw characters with rotation and styles
          ctx.font = 'bold 24px monospace';
          const colors = ['#6E1B1B', '#D34A32', '#3A241F', '#581717'];
          for (let i = 0; i < captchaCode.length; i++) {
            ctx.save();
            ctx.fillStyle = colors[i % colors.length];
            const x = 16 + i * 22;
            const y = 28 + (Math.random() * 6 - 3);
            const angle = (Math.random() * 0.4) - 0.2;
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.fillText(captchaCode[i], 0, 0);
            ctx.restore();
          }
        }
      }
    }
  }, [captchaCode, isAdminAuthenticated]);

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const uQuery = adminUsername.trim();
    if (!uQuery) {
      setAuthError('لطفاً نام کاربری یا ایمیل مدیر را وارد کنید.');
      return;
    }

    if (!adminPassword) {
      setAuthError('لطفاً رمز عبور را وارد کنید.');
      return;
    }

    // Verify Captcha
    if (normalizeDigits(captchaInput) !== captchaCode.toLowerCase()) {
      setAuthError('کد امنیتی کپچا نادرست است.');
      generateCaptcha();
      return;
    }

    const result = await loginWithCredentials(uQuery, adminPassword, true);
    if (!result.ok) {
      setAuthError(result.error);
      generateCaptcha();
      return;
    }

    // Success: remember the admin session so it survives page refreshes
    try {
      localStorage.setItem('admin_session_auth_v5', result.user.id);
      sessionStorage.setItem('admin_session_auth_v5', result.user.id);
    } catch (err) {
      console.warn('Could not save admin session:', err);
    }

    setIsAdminAuthenticated(true);
    showToast(`خوش آمدید، ${result.user.fullName} (کنسول مدیریت)`);
  };

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem('admin_session_auth_v5');
      sessionStorage.removeItem('admin_session_auth_v5');
    } catch (err) {
      console.warn('Could not clear admin session:', err);
    }
    logout();
    setIsAdminAuthenticated(false);
    setAdminPassword('');
    setCaptchaInput('');
    generateCaptcha();
    showToast('از پنل مدیریت خارج شدید.');
  };

  const filteredTransfers = transfers.filter((t) => {
    const s = transfersSearch.toLowerCase();
    return (
      t.fileName.toLowerCase().includes(s) ||
      t.sender.fullName.toLowerCase().includes(s) ||
      t.recipients.some((r) => r.fullName.toLowerCase().includes(s))
    );
  });

  // If not authenticated, show Admin Login Gate with Captcha
  if (!isAdminAuthenticated) {
    return (
      <LoginBackdrop className="p-4 font-sans select-none">
        <DayNightToggle className="fixed z-20 top-4 left-4 p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20" />
        <div className="bg-white/90 backdrop-blur-xl rounded-[32px] p-6 sm:p-8 max-w-md w-full border border-white/60 shadow-2xl shadow-black/30 space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <img src="/images/logo-full.png" alt="هورمند - سامانه اتوماسیون اداری" className="brand-logo w-40 mx-auto" draggable={false} />
            <h2 className="text-xl font-black text-[#3A241F] tracking-tight">ورود به پنل مدیریت سامانه</h2>
            <p className="text-xs text-[#8C6F66]">
              دسترسی امن مدیران ارشد با احراز هویت دوعاملی و کد کپچا
            </p>
          </div>

          <DemoAdminHint />

          {/* Form */}
          <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
            
            {/* Username / Email */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-[#3A241F]">نام کاربری یا ایمیل مدیر:</label>
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl focus-within:border-[#6E1B1B] focus-within:ring-2 focus-within:ring-[#6E1B1B]/15 transition-all">
                <UserIcon className="w-4 h-4 text-[#8C6F66] shrink-0" />
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="مثال: admin@company.internal یا نام مدیر"
                  className="w-full bg-transparent text-xs font-bold text-[#3A241F] focus:outline-none placeholder:text-[#B8A39C]"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-[#3A241F]">رمز عبور مدیر:</label>
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl focus-within:border-[#6E1B1B] focus-within:ring-2 focus-within:ring-[#6E1B1B]/15 transition-all">
                <Lock className="w-4 h-4 text-[#8C6F66] shrink-0" />
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="رمز عبور مدیریت"
                  className="w-full bg-transparent text-xs font-bold text-[#3A241F] focus:outline-none placeholder:text-[#B8A39C] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="text-[#8C6F66] hover:text-[#3A241F] transition-colors shrink-0"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Captcha Box */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#3A241F]">کد امنیتی کپچا:</label>
              <div className="flex items-center gap-2">
                <div className="relative border border-[#EBDBCE] rounded-2xl overflow-hidden bg-[#FAF5F1] shrink-0 shadow-inner">
                  <canvas ref={canvasRef} width={110} height={40} className="block" />
                </div>

                <button
                  type="button"
                  onClick={generateCaptcha}
                  title="تغییر کد کپچا"
                  className="p-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE] rounded-2xl transition-colors active:rotate-180 duration-200 shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  required
                  maxLength={6}
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  placeholder="کد تصویر"
                  className="flex-1 px-3 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-xs font-black text-[#3A241F] text-center uppercase tracking-widest focus:border-[#6E1B1B] focus:ring-2 focus:ring-[#6E1B1B]/15 focus:outline-none placeholder:text-[#B8A39C]"
                />
              </div>
            </div>

            {/* Error message */}
            {authError && (
              <div className="bg-[#D34A32]/10 border border-[#D34A32]/30 text-[#D34A32] text-xs font-bold px-3.5 py-2.5 rounded-2xl text-center flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3.5 bg-[#6E1B1B] hover:bg-[#581717] text-white font-black text-xs rounded-2xl shadow-md shadow-[#6E1B1B]/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>تایید هویت و ورود به پنل مدیریت</span>
            </button>

            {/* Back button */}
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="w-full py-2.5 text-xs font-bold text-[#8C6F66] hover:text-[#3A241F] transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>بازگشت به صفحه اصلی</span>
            </button>

          </form>
        </div>
      </LoginBackdrop>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] p-0 sm:p-1 flex items-stretch justify-center font-sans antialiased text-[#3A241F]" dir="rtl">
      <div className="w-full max-w-none bg-white rounded-none sm:rounded-2xl shadow-2xl overflow-hidden border border-[#6E1B1B]/30 flex flex-col min-h-[calc(100vh-0.5rem)]">

        {/* Top Admin Header: the same look as the application's own panel (light bar, brand name, rounded action buttons), tidy on a phone */}
        <header className="px-4 sm:px-8 py-3.5 sm:py-4 bg-[#FAF5F1] border-b border-[#EBDBCE] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white border border-[#EBDBCE] flex items-center justify-center shadow-md shrink-0 p-1.5">
              <img src="/images/mark.png" alt="" className="brand-logo w-full h-full object-contain" draggable={false} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="leading-none flex items-center gap-2">
                  <img src="/images/brand-name.png" alt="هورمند" className="brand-word h-6 sm:h-8 w-auto" draggable={false} />
                </h1>
                <span className="bg-[#6E1B1B] text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xs shrink-0">کنسول مدیریت</span>
                <VersionBadge withDate className="text-[10px] font-bold text-[#8C6F66]" />
              </div>
              {headerCompany && <div className="mt-1 text-xs sm:text-sm font-black text-[#6E1B1B] truncate" data-company-name>{headerCompany}</div>}
              <p className="text-[10px] sm:text-[11px] text-[#8C6F66] font-medium truncate sm:whitespace-normal">
                پایش نقل و انتقالات، امنیت دسترسی، سهمیه‌ها و پیکربندی سازمان
              </p>
            </div>
          </div>

          {/* The admin who signed in, and logout (no switching to other people) */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:shrink-0">
            <DayNightToggle className="p-2 sm:p-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE] rounded-2xl shadow-2xs" />

            <button
              onClick={() => setShowThemeModal(true)}
              title="تغییر رنگبندی و تم سامانه"
              className="p-2 sm:p-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE] rounded-2xl transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">رنگبندی</span>
            </button>

            <button
              onClick={() => { window.location.href = '/'; }}
              title="برگشت به برنامه"
              className="flex items-center gap-1.5 px-3 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-2xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>برگشت به برنامه</span>
            </button>

            <div className="flex items-center gap-1.5 bg-[#F6D9CD]/40 p-1.5 pr-2.5 sm:pr-3 rounded-2xl border border-[#C98B6A]/30 min-w-0">
              <div className="text-right min-w-0">
                <div className="text-xs font-black text-[#3A241F] truncate max-w-[130px]">{currentUser.fullName}</div>
                <div className="text-[10px] text-[#D34A32] font-bold truncate max-w-[130px]">
                  {currentUser.role === 'SUPER_ADMIN' ? 'مدیر ارشد کل سیستم' : 'مدیر واحد سازمانی'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAdminLogout}
                title="خروج از پنل مدیریت"
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl bg-[#F6D9CD] hover:bg-[#D34A32] text-[#6E1B1B] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Admin Navigation Sub-Tabs */}
        <div className="bg-[#FAF5F1] px-4 sm:px-8 py-2.5 sm:py-3 border-b border-[#EBDBCE] flex items-center justify-between gap-3">
          <nav className="flex items-center gap-2 flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 -mb-1 sm:mb-0 min-w-0 flex-1 [&>*]:shrink-0">
            <IconTab active={activeTab === 'users'} onClick={() => setActiveTab('users')} label="کاربران و سهمیه‌ها" count={badge('users')} alert icon={<Users className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'departments'} onClick={() => setActiveTab('departments')} label="واحدهای سازمانی" count={badge('departments')} alert icon={<Shield className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'transfers'} onClick={() => setActiveTab('transfers')} label="مانیتورینگ انتقالات" count={badge('transfers')} alert icon={<Activity className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} label="گزارشات ممیزی" count={badge('audit')} alert icon={<FileSearch className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} label="گزارشات آماری مدیریتی" icon={<BarChart3 className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} label="آمار و مصرف حافظه" icon={<PieChartIcon className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'support'} onClick={() => setActiveTab('support')} label="تنظیمات پشتیبانی" icon={<Headset className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="تنظیمات سیستم" icon={<Settings className="w-[18px] h-[18px]" />} />
          </nav>

          <div className="hidden md:flex items-center gap-2 text-[11px] font-bold text-[#8C6F66] shrink-0">
            <span className="inline-block w-2 h-2 rounded-full bg-[#D34A32] animate-pulse" />
            <span>سیستم آنلاین و امن</span>
          </div>
        </div>

        {/* Tab Content */}
        <main className="p-3 sm:p-6 lg:p-8 flex-1 bg-white">
          {activeTab === 'users' && (
            <UserManagementView
              users={staffList}
              departments={departments}
              onAddUser={(userData) => {
                handleCreateUser(userData);
              }}
              onUpdateUser={(userId, updates) => {
                handleUpdateUser(userId, updates);
              }}
              onDeleteUser={(userId) => {
                handleDeleteUser(userId);
              }}
            />
          )}

          {activeTab === 'departments' && (
            <DepartmentManagementView
              departments={departments}
              staffList={staffList}
              onCreateDepartment={handleCreateDepartment}
              onUpdateDepartment={handleUpdateDepartment}
              onDeleteDepartment={handleDeleteDepartment}
            />
          )}

          {activeTab === 'transfers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EBDBCE]">
                <div>
                  <h2 className="text-base font-black text-[#3A241F]">مانیتورینگ زنده تبادلات فایل</h2>
                  <p className="text-xs text-[#8C6F66]">مشاهده و رصد تمامی فایل‌های ارسال‌شده در سطح سازمان</p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
                  <input
                    type="text"
                    value={transfersSearch}
                    onChange={(e) => setTransfersSearch(e.target.value)}
                    placeholder="جستجو در نام فایل، فرستنده یا گیرنده..."
                    className="w-full pr-10 pl-4 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                  />
                </div>
              </div>

              <TransfersMonitor
                transfers={filteredTransfers}
                fileSizes={fileSizes}
                onPurge={async (t) => {
                  if (!(await askConfirm(`فایل «${t.fileName}» از سرور حذف شود؟ سابقهٔ ارسال و دانلود می‌ماند و برای کاربران می‌نویسد «توسط مدیر کل سیستم حذف شد».`))) return;
                  try { await api.adminFilePurge(t.id); showToast('فایل از سرور حذف شد؛ سابقه نگه داشته شد.'); await reloadState(); loadFileSizes(); } catch (e) { showToast(e instanceof Error ? e.message : 'حذف نشد.'); }
                }}
                onKeep={async (t) => {
                  try { await api.adminFileKeep(t.id, !t.keepForever); await reloadState(); } catch (e) { showToast(e instanceof Error ? e.message : 'انجام نشد.'); }
                }}
                onDelete={async (t) => {
                  if (await askConfirm(`رکورد «${t.fileName}» (با تاریخچه) برای همیشه پاک شود؟ قابل بازگشت نیست.`, { title: 'پاک‌کردن کامل رکورد؟', confirmText: 'بله، برای همیشه پاک شود' })) handleAdminDeleteTransfer(t.id);
                }}
              />
            </div>
          )}

          {activeTab === 'audit' && (
            <AuditLogsView logs={auditLogs} />
          )}

          {activeTab === 'stats' && <ManagementReports />}
          {activeTab === 'support' && <SupportAdmin toast={showToast} />}

          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <ServerAddressCard />
              <NetWatchCard />
              <AnalyticsView
                users={staffList}
                files={INITIAL_FILES}
                transfers={transfers}
                auditLogs={auditLogs}
                departments={departments}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={(newSettings) => {
                setSettings(newSettings);
                try {
                  localStorage.setItem('app_settings_v5', JSON.stringify(newSettings));
                } catch (e) {
                  console.warn('Error saving settings:', e);
                }
                showToast('تنظیمات، هویت و سربرگ سامانه با موفقیت ذخیره و اعمال شد.');
              }}
            />
          )}
        </main>
      </div>

      {/* Theme Switcher Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-[#EBDBCE] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <h3 className="font-black text-sm text-[#3A241F]">انتخاب تم و رنگبندی سامانه</h3>
              <button
                onClick={() => setShowThemeModal(false)}
                className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1] rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ThemeSelector onPicked={() => setShowThemeModal(false)} />
          </div>
        </div>
      )}

      {/* Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
