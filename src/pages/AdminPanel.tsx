import React, { useState } from 'react';
import {
  Users,
  Activity,
  PieChart as PieChartIcon,
  Settings,
  Shield,
  ShieldCheck,
  FileText,
  Lock,
  HardDrive,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { UserManagementView } from '../components/admin/UserManagementView';
import { AnalyticsView } from '../components/admin/AnalyticsView';
import { AuditLogsView } from '../components/admin/AuditLogsView';
import { SettingsView } from '../components/admin/SettingsView';
import { toPersianDigits } from '../lib/jalali';
import { INITIAL_FILES } from '../lib/mock-data';

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
    handleCreateUser,
    handleUpdateUser,
    handleDeleteUser,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<'users' | 'transfers' | 'audit' | 'analytics' | 'settings'>('users');
  const [transfersSearch, setTransfersSearch] = useState('');

  // Access check
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  const isDeptAdmin = currentUser.role === 'DEPT_ADMIN';
  const hasAccess = isSuperAdmin || isDeptAdmin;

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

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">ورود به کنسول مدیریت</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              این بخش صرفاً ویژه مدیران سیستم است. لطفاً حساب مدیریتی مجاز را جهت ورود انتخاب کنید:
            </p>
          </div>

          <div className="space-y-2 text-right">
            <label className="text-[11px] font-bold text-slate-300">انتخاب حساب کاربری مدیر:</label>
            <div className="space-y-2">
              {adminUsers.map((admin) => (
                <button
                  key={admin.id}
                  onClick={() => {
                    setCurrentUser(admin);
                    showToast(`ورود موفقیت‌آمیز به عنوان ${admin.fullName}`);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-right group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {admin.avatarInitials}
                    </div>
                    <div>
                      <div className="text-xs font-black text-white group-hover:text-blue-400 transition-colors">
                        {admin.fullName}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {admin.role === 'SUPER_ADMIN' ? 'مدیر ارشد کل' : admin.departmentName}
                      </div>
                    </div>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-3 sm:p-6 lg:p-8 flex items-center justify-center font-sans antialiased text-gray-900" dir="rtl">
      <div className="w-full max-w-7xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-700 flex flex-col min-h-[820px]">

        {/* Top Admin Header */}
        <header className="px-6 sm:px-8 py-4 bg-slate-950 text-white flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-lg text-white leading-tight">
                  کنسول مدیریت و ممیزی سیستم
                </h1>
                <span className="bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                  ADMIN CONSOLE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                سامانه پایش نقل و انتقالات، امنیت دسترسی، سهمیه‌ها و پیکربندی سازمان
              </p>
            </div>
          </div>

          {/* Admin Profile Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-2xl border border-slate-800">
              <div className="text-right">
                <div className="text-xs font-black text-white">{currentUser.fullName}</div>
                <div className="text-[10px] text-blue-400 font-bold">
                  {currentUser.role === 'SUPER_ADMIN' ? 'مدیر ارشد کل سیستم' : 'مدیر واحد سازمانی'}
                </div>
              </div>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const u = adminUsers.find((user) => user.id === e.target.value);
                  if (u) {
                    setCurrentUser(u);
                    showToast(`حساب مدیر: ${u.fullName}`);
                  }
                }}
                className="bg-slate-800 text-xs font-bold text-slate-200 py-1.5 px-2 rounded-xl border border-slate-700 focus:outline-none cursor-pointer"
              >
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role === 'SUPER_ADMIN' ? 'مدیر ارشد' : u.departmentName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Admin Navigation Sub-Tabs */}
        <div className="bg-slate-100/90 px-6 sm:px-8 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'users'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              <Users className="w-4 h-4" />
              <span>کاربران و سهمیه‌ها ({toPersianDigits(staffList.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('transfers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'transfers'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              <Activity className="w-4 h-4" />
              <span>مانیتورینگ انتقالات ({toPersianDigits(transfers.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'audit'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              <Shield className="w-4 h-4" />
              <span>گزارشات ممیزی ({toPersianDigits(auditLogs.length)})</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'analytics'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              <PieChartIcon className="w-4 h-4" />
              <span>آمار و مصرف حافظه</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              <Settings className="w-4 h-4" />
              <span>تنظیمات امنیتی</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>سیستم آنلاین و امن</span>
          </div>
        </div>

        {/* Tab Content Area */}
        <main className="flex-1 p-6 sm:p-8 bg-gray-50/50 overflow-y-auto">
          {activeTab === 'users' && (
            <UserManagementView
              users={staffList}
              onAddUser={(userData) => {
                handleCreateUser({
                  fullName: userData.fullName || '',
                  email: userData.email || '',
                  role: userData.role || 'STAFF',
                  departmentId: userData.departmentId || 'dept-1',
                  quotaGB: userData.storageQuotaGB || 50,
                });
              }}
              onUpdateUser={(userId, updates) => {
                handleUpdateUser(userId, updates);
              }}
              onDeleteUser={(userId) => {
                handleDeleteUser(userId);
              }}
            />
          )}

          {activeTab === 'transfers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
                <div>
                  <h2 className="text-base font-black text-gray-900">مانیتورینگ زنده تبادلات فایل</h2>
                  <p className="text-xs text-gray-500">مشاهده و رصد تمامی فایل‌های ارسال‌شده در سطح سازمان</p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
                  <input
                    type="text"
                    value={transfersSearch}
                    onChange={(e) => setTransfersSearch(e.target.value)}
                    placeholder="جستجو در نام فایل، فرستنده یا گیرنده..."
                    className="w-full pr-10 pl-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200">
                      <th className="py-3 px-4">شناسه و سند</th>
                      <th className="py-3 px-4">فرستنده</th>
                      <th className="py-3 px-4">گیرنده</th>
                      <th className="py-3 px-4">حجم</th>
                      <th className="py-3 px-4">تاریخ ارسال</th>
                      <th className="py-3 px-4">دانلودها</th>
                      <th className="py-3 px-4">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {filteredTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          هیچ انتقالی یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      filteredTransfers.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-blue-500" />
                              <span>{t.fileName}</span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-400">{t.id}</span>
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            <div className="font-bold">{t.sender.fullName}</div>
                            <div className="text-[10px] text-gray-400">{t.sender.departmentName}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-700">
                            {t.recipients.map((r) => (
                              <div key={r.id}>
                                <span className="font-bold">{r.fullName}</span>
                                <span className="text-[10px] text-gray-400 mr-1">({r.departmentName})</span>
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 font-black text-gray-800">{t.fileSize}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-gray-500">{t.sentAt}</td>
                          <td className="py-3 px-4 font-bold text-blue-700">{toPersianDigits(t.downloadsCount)} بار</td>
                          <td className="py-3 px-4">
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-black">
                              تحویل داده شده
                            </span>
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
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onSaveSettings={(newSettings) => {
                setSettings(newSettings);
                showToast('تنظیمات امنیتی سامانه با موفقیت ذخیره شد.');
              }}
            />
          )}
        </main>
      </div>

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