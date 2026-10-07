import { DemoAdminHint, useDemoInfo } from '../components/common/DemoBanner';
import { DayNightToggle } from '../components/common/DayNightToggle';
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
import { AuditLogsView } from '../components/admin/AuditLogsView';
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

  const [activeTab, setActiveTab] = useState<'users' | 'departments' | 'letters' | 'transfers' | 'audit' | 'analytics' | 'stats' | 'settings'>('users');
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
      <div className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] flex items-center justify-center p-4 font-sans select-none relative" dir="rtl">
        <DayNightToggle className="absolute top-4 left-4 p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20" />
        <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-md w-full border border-[#6E1B1B]/30 shadow-2xl space-y-6">
          
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] p-0 sm:p-1 flex items-stretch justify-center font-sans antialiased text-[#3A241F]" dir="rtl">
      <div className="w-full max-w-none bg-white rounded-none sm:rounded-2xl shadow-2xl overflow-hidden border border-[#6E1B1B]/30 flex flex-col min-h-[calc(100vh-0.5rem)]">

        {/* Top Admin Header */}
        <header className="px-6 sm:px-8 py-4 bg-[#3A241F] text-white flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#563D34]">
          <div className="flex items-center gap-3">
<div className="w-7 h-7 rounded-xl bg-white border border-[#EBDBCE] flex items-center justify-center shadow-md shrink-0 p-1">
              <img src="/images/mark.png" alt="" className="brand-logo w-full h-full object-contain" draggable={false} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="flex items-center gap-2.5 text-white leading-tight">
                  <span className="bg-white rounded-lg px-2 py-0.5 flex items-center">
                    <img src="/images/brand-name.png" alt="هورمند" className="brand-word h-5 w-auto" draggable={false} />
                  </span>
                  <span className="font-black text-base">کنسول مدیریت</span>
                </h1>
                <span className="bg-[#D34A32]/20 border border-[#D34A32]/50 text-[#F6D9CD] text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  ADMIN CONSOLE
                </span>
                <VersionBadge withDate className="text-[10px] font-bold text-[#EBDBCE]" />
              </div>
              <p className="text-[11px] text-[#EBDBCE] font-medium">
                سامانه پایش نقل و انتقالات، امنیت دسترسی، سهمیه‌ها و پیکربندی سازمان
              </p>
            </div>
          </div>

          {/* The admin who signed in, and logout (no switching to other people) */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#2E1A16] px-3 py-1.5 rounded-2xl border border-[#563D34]">
              <div className="text-right">
                <div className="text-xs font-black text-white">{currentUser.fullName}</div>
                <div className="text-[10px] text-[#C98B6A] font-bold">
                  {currentUser.role === 'SUPER_ADMIN' ? 'مدیر ارشد کل سیستم' : 'مدیر واحد سازمانی'}
                </div>
              </div>
            </div>

            <DayNightToggle className="p-2 rounded-2xl bg-[#2E1A16] hover:bg-[#6E1B1B] text-[#F6D9CD] border border-[#563D34]" />

            <button
              onClick={() => setShowThemeModal(true)}
              title="تغییر تم رنگی سامانه"
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#2E1A16] hover:bg-[#6E1B1B] text-[#F6D9CD] border border-[#563D34] text-xs font-bold transition-all cursor-pointer"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">تم رنگی</span>
            </button>

            <button
              onClick={handleAdminLogout}
              title="خروج از پنل مدیریت"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#D34A32]/20 hover:bg-[#D34A32] text-[#F6D9CD] hover:text-white border border-[#D34A32]/40 text-xs font-bold transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        {/* Admin Navigation Sub-Tabs */}
        <div className="bg-[#FAF5F1] px-6 sm:px-8 py-3 border-b border-[#EBDBCE] flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-2 flex-wrap">
            <IconTab active={activeTab === 'users'} onClick={() => setActiveTab('users')} label="کاربران و سهمیه‌ها" count={badge('users')} alert icon={<Users className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'departments'} onClick={() => setActiveTab('departments')} label="واحدهای سازمانی" count={badge('departments')} alert icon={<Shield className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'transfers'} onClick={() => setActiveTab('transfers')} label="مانیتورینگ انتقالات" count={badge('transfers')} alert icon={<Activity className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} label="گزارشات ممیزی" count={badge('audit')} alert icon={<FileSearch className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} label="گزارشات آماری مدیریتی" icon={<BarChart3 className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} label="آمار و مصرف حافظه" icon={<PieChartIcon className="w-[18px] h-[18px]" />} />
            <IconTab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="تنظیمات سیستم" icon={<Settings className="w-[18px] h-[18px]" />} />
          </nav>

          <div className="flex items-center gap-2 text-[11px] font-bold text-[#8C6F66]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#D34A32] animate-pulse" />
            <span>سیستم آنلاین و امن</span>
          </div>
        </div>

        {/* Tab Content */}
        <main className="p-6 sm:p-8 flex-1 bg-white">
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

              <div className="bg-white rounded-2xl border border-[#EBDBCE] overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF5F1] text-[11px] font-bold text-[#8C6F66] uppercase border-b border-[#EBDBCE]">
                      <th className="py-3 px-4">شناسه و سند</th>
                      <th className="py-3 px-4">فرستنده</th>
                      <th className="py-3 px-4">گیرنده</th>
                      <th className="py-3 px-4">حجم</th>
                      <th className="py-3 px-4">تاریخ ارسال</th>
                      <th className="py-3 px-4">دریافت / دانلود</th>
                      <th className="py-3 px-4">روی سرور</th>
                      <th className="py-3 px-4">وضعیت</th>
                      <th className="py-3 px-4">مدیریت فایل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBDBCE]/60 font-medium text-[#3A241F]">
                    {filteredTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-[#8C6F66]">
                          هیچ رکوردی برای تبادل فایل یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredTransfers.map((t) => (
                        <tr key={t.id} className="hover:bg-[#FAF5F1] transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#3A241F] flex items-center gap-1.5 flex-wrap">
                              <span>{t.fileName}</span>
                              {t.isOfficialLetter && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.2 rounded-md border border-amber-300">
                                  نامه رسمی
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#8C6F66] font-mono">{t.id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#3A241F]">{t.sender.fullName}</div>
                            <div className="text-[10px] text-[#8C6F66]">{t.sender.departmentName}</div>
                          </td>
                          <td className="py-3 px-4">
                            {t.recipients.map((r) => (
                              <div key={r.id} className="text-xs">
                                <span className="font-bold">{r.fullName}</span>
                                <span className="text-[10px] text-[#8C6F66] mr-1">({r.departmentName})</span>
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 font-black text-[#3A241F]">{t.fileSize}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#8C6F66]">{toPersianDigits(t.sentAt)}</td>
                          <td className="py-3 px-4 font-bold">
                            {t.isOfficialLetter ? (
                              <span className="text-[#6E1B1B]">{toPersianDigits(t.downloadsCount)} بار</span>
                            ) : t.downloadsCount > 0 ? (
                              <span className="text-emerald-700">دریافت شد · {toPersianDigits(t.downloadsCount)} بار دانلود</span>
                            ) : (
                              <span className="text-amber-700">هنوز دانلود نشده</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] font-bold">
                            {t.isOfficialLetter ? (
                              <span className="text-[#8C6F66]">—</span>
                            ) : t.fileDeletedAt ? (
                              <span className="text-rose-700">حذف شد</span>
                            ) : fileSizes && fileSizes[t.id] != null ? (
                              <span className="text-emerald-700">ذخیره است · {toPersianDigits(Math.max(1, Math.round(fileSizes[t.id] / 1024)))} KB{t.keepForever ? ' · نگه‌دار' : ''}</span>
                            ) : (
                              <span className="text-[#8C6F66]">فقط نزد فرستنده</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {t.isOfficialLetter ? (
                              t.signatureStatus === 'SIGNED' ? (
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                  امضا شده توسط {t.signedBy}
                                </span>
                              ) : t.signatureStatus === 'REJECTED' ? (
                                <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                  رد شده توسط مدیر
                                </span>
                              ) : (
                                <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                  در انتظار امضا
                                </span>
                              )
                            ) : t.fileDeletedAt ? (
                              <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full text-[10px] font-black leading-5 inline-block">
                                این فایل توسط مدیر کل سیستم حذف شد
                                {t.fileDeletedByName ? ` (${t.fileDeletedByName})` : ' (سیاست نگهداری)'}
                              </span>
                            ) : (
                              <span className="bg-[#F6D9CD] text-[#6E1B1B] border border-[#C98B6A]/30 px-2.5 py-0.5 rounded-full text-[10px] font-black">
                                تحویل داده شده
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {t.isOfficialLetter && t.signatureStatus === 'SIGNED' ? (
                              <span className="text-[10px] font-bold text-[#8C6F66]" title="نامهٔ امضاشده قابل حذف نیست">محافظت‌شده</span>
                            ) : (
                              <div className="flex flex-col gap-1.5 items-start">
                                {!t.isOfficialLetter && !t.fileDeletedAt && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!window.confirm(`فایل «${t.fileName}» از سرور حذف شود؟ سابقهٔ ارسال و دانلود می‌ماند و برای کاربران می‌نویسد «توسط مدیر کل سیستم حذف شد».`)) return;
                                        try { await api.adminFilePurge(t.id); showToast('فایل از سرور حذف شد؛ سابقه نگه داشته شد.'); await reloadState(); loadFileSizes(); } catch (e) { showToast(e instanceof Error ? e.message : 'حذف نشد.'); }
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black cursor-pointer"
                                    >
                                      حذف فایل از سرور
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => { try { await api.adminFileKeep(t.id, !t.keepForever); await reloadState(); } catch (e) { showToast(e instanceof Error ? e.message : 'انجام نشد.'); } }}
                                      className={`px-2.5 py-1 rounded-lg border text-[10px] font-black cursor-pointer ${t.keepForever ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}
                                    >
                                      {t.keepForever ? '✓ همیشه بماند' : 'همیشه بماند'}
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`رکورد «${t.fileName}» (با تاریخچه) برای همیشه پاک شود؟ قابل بازگشت نیست.`)) handleAdminDeleteTransfer(t.id);
                                  }}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="پاک کردن کامل رکورد و تاریخچه"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <AuditLogsView logs={auditLogs} />
          )}

          {activeTab === 'stats' && <ManagementReports />}

          {activeTab === 'analytics' && (
            <div className="space-y-4">
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
