import { DemoAdminHint } from '../components/common/DemoBanner';
import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Activity,
  PieChart as PieChartIcon,
  Settings,
  Shield,
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

  const [activeTab, setActiveTab] = useState<'users' | 'departments' | 'letters' | 'transfers' | 'audit' | 'analytics' | 'settings'>('users');
  const [transfersSearch, setTransfersSearch] = useState('');

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

  const adminUsers = staffList.filter(
    (u) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'
  );

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
      <div className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] flex items-center justify-center p-4 font-sans select-none" dir="rtl">
        <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-md w-full border border-[#6E1B1B]/30 shadow-2xl space-y-6">
          
          {/* Header */}
          <div className="text-center space-y-2">
            <img src="/logo-full.png" alt="هورمند - سامانه اتوماسیون اداری" className="w-40 mx-auto" draggable={false} />
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
    <div className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] p-3 sm:p-6 lg:p-8 flex items-center justify-center font-sans antialiased text-[#3A241F]" dir="rtl">
      <div className="w-full max-w-7xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-[#6E1B1B]/30 flex flex-col min-h-[820px]">

        {/* Top Admin Header */}
        <header className="px-6 sm:px-8 py-4 bg-[#3A241F] text-white flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#563D34]">
          <div className="flex items-center gap-3">
<div className="w-7 h-7 rounded-xl bg-white border border-[#EBDBCE] flex items-center justify-center shadow-md shrink-0 p-1">
              <img src="/mark.png" alt="" className="w-full h-full object-contain" draggable={false} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="flex items-center gap-2.5 text-white leading-tight">
                  <span className="bg-white rounded-lg px-2 py-0.5 flex items-center">
                    <img src="/brand-name.png" alt="هورمند" className="h-5 w-auto" draggable={false} />
                  </span>
                  <span className="font-black text-base">کنسول مدیریت</span>
                </h1>
                <span className="bg-[#D34A32]/20 border border-[#D34A32]/50 text-[#F6D9CD] text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  ADMIN CONSOLE
                </span>
              </div>
              <p className="text-[11px] text-[#EBDBCE] font-medium">
                سامانه پایش نقل و انتقالات، امنیت دسترسی، سهمیه‌ها و پیکربندی سازمان
              </p>
            </div>
          </div>

          {/* Admin Profile Selector & Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#2E1A16] px-3 py-1.5 rounded-2xl border border-[#563D34]">
              <div className="text-right">
                <div className="text-xs font-black text-white">{currentUser.fullName}</div>
                <div className="text-[10px] text-[#C98B6A] font-bold">
                  {currentUser.role === 'SUPER_ADMIN' ? 'مدیر ارشد کل سیستم' : 'مدیر واحد سازمانی'}
                </div>
              </div>
              {adminUsers.length > 1 && (
                <select
                  value={currentUser.id}
                  onChange={(e) => {
                    const u = adminUsers.find((user) => user.id === e.target.value);
                    if (u) {
                      setCurrentUser(u);
                      showToast(`حساب مدیر: ${u.fullName}`);
                    }
                  }}
                  className="bg-[#3A241F] text-xs font-bold text-[#F6D9CD] py-1.5 px-2 rounded-xl border border-[#563D34] focus:outline-none cursor-pointer mr-2"
                >
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.role === 'SUPER_ADMIN' ? 'مدیر ارشد' : u.departmentName})
                    </option>
                  ))}
                </select>
              )}
            </div>

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
          <nav className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 flex-wrap">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'users'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <Users className="w-4 h-4" />
              <span>کاربران و سهمیه‌ها ({toPersianDigits(staffList.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('departments')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'departments'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <Shield className="w-4 h-4" />
              <span>واحدهای سازمانی ({toPersianDigits(departments.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('transfers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'transfers'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <Activity className="w-4 h-4" />
              <span>مانیتورینگ انتقالات ({toPersianDigits(transfers.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'audit'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <Shield className="w-4 h-4" />
              <span>گزارشات ممیزی ({toPersianDigits(auditLogs.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'analytics'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <PieChartIcon className="w-4 h-4" />
              <span>آمار و مصرف حافظه</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'settings'
                ? 'bg-[#6E1B1B] text-white shadow-sm'
                : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/30 border border-[#EBDBCE]'
                }`}
            >
              <Settings className="w-4 h-4" />
              <span>تنظیمات سیستم</span>
            </button>
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
                      <th className="py-3 px-4">دانلودها</th>
                      <th className="py-3 px-4">وضعیت</th>
                      <th className="py-3 px-4">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBDBCE]/60 font-medium text-[#3A241F]">
                    {filteredTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-[#8C6F66]">
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
                          <td className="py-3 px-4 font-bold text-[#6E1B1B]">{toPersianDigits(t.downloadsCount)} بار</td>
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
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`«${t.fileName}» برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`)) handleAdminDeleteTransfer(t.id);
                                }}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="حذف این فایل"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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

          {activeTab === 'analytics' && (
            <AnalyticsView
              users={staffList}
              files={INITIAL_FILES}
              transfers={transfers}
              auditLogs={auditLogs}
              departments={departments}
            />
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

            <ThemeSelector />

            <div className="flex justify-end pt-3 border-t border-[#EBDBCE]">
              <button
                onClick={() => setShowThemeModal(false)}
                className="px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-xs transition-all"
              >
                بستن و بازگشت
              </button>
            </div>
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
