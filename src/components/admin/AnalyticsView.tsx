import React from 'react';
import {
  TrendingUp,
  HardDrive,
  Users,
  Send,
  DownloadCloud,
  ShieldCheck,
  Activity,
  ArrowUpRight,
  PieChart as PieChartIcon
} from 'lucide-react';
import { User, FileItem, FileTransfer, AuditLog } from '../../types';

interface AnalyticsViewProps {
  users: User[];
  files: FileItem[];
  transfers: FileTransfer[];
  auditLogs: AuditLog[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  users,
  files,
  transfers,
  auditLogs,
}) => {
  const totalStorageGB = users.reduce((acc, u) => acc + u.storageUsedGB, 0);
  const totalAllocatedGB = users.reduce((acc, u) => acc + u.storageQuotaGB, 0);
  const activeUsersCount = users.filter((u) => u.isActive).length;

  const deptStats = [
    { name: 'طراحی رابط کاربری (UI/UX)', used: 45.2, total: 100, color: 'bg-red-500', percent: 45 },
    { name: 'فنی و مهندسی', used: 52.4, total: 110, color: 'bg-blue-600', percent: 48 },
    { name: 'مارکتینگ و فروش', used: 12.1, total: 40, color: 'bg-amber-500', percent: 30 },
    { name: 'منابع انسانی (HR)', used: 4.8, total: 20, color: 'bg-emerald-500', percent: 24 },
    { name: 'مالی و حقوقی', used: 9.5, total: 30, color: 'bg-purple-600', percent: 32 },
  ];

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-gray-100">
        <h1 className="text-xl font-black text-gray-900 tracking-tight">
          تحلیل و تله‌متری سیستم
        </h1>
        <p className="text-xs text-gray-500">
          پایش زنده پهنای باند انتقالات، میزان مصرف سهمیه واحدها و شاخص‌های زیرساخت
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">پرسنل فعال</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">
            {activeUsersCount} نفر / {users.length}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> ۱۰۰٪ در دسترس و آنلاین
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">کل فضای مصرف شده</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">
            {totalStorageGB.toFixed(1)} گیگابایت
          </div>
          <div className="text-[11px] text-gray-500 font-medium">
            از {(totalAllocatedGB / 1000).toFixed(2)} ترابایت ظرفیت کل استخر
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">انتقالات تحویل داده شده</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{transfers.length} انتقال</div>
          <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> ۰ درصد خطا در ارسال
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">رویدادهای ممیزی ثبت‌شده</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900">{auditLogs.length} رویداد</div>
          <div className="text-[11px] text-purple-600 font-bold">
            سازگار با الزامات امنیتی
          </div>
        </div>
      </div>

      {/* Grid: Storage by Department + Live Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Usage */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-blue-600" />
              توزیع مصرف فضای ذخیره‌سازی واحدها
            </h3>
            <span className="text-[11px] font-bold text-gray-400">سهمیه‌های فعال</span>
          </div>

          <div className="space-y-3.5 pt-2">
            {deptStats.map((dept) => (
              <div key={dept.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800">{dept.name}</span>
                  <span className="text-gray-500 font-medium">
                    <b className="text-gray-900">{dept.used} GB</b> از {dept.total} GB ({dept.percent}%)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${dept.color}`}
                    style={{ width: `${dept.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Audit Feed */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" />
              جریان زنده گزارشات ممیزی
            </h3>
            <span className="text-[11px] font-bold text-blue-600">به‌روزرسانی خودکار</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-64 pl-1 divide-y divide-gray-100">
            {auditLogs.map((log) => (
              <div key={log.id} className="pt-2.5 first:pt-0 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{log.userName}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{log.timestamp}</span>
                </div>
                <p className="text-gray-600 text-[11px] font-medium">{log.details}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="bg-gray-100 text-gray-600 text-[9px] font-mono px-2 py-0.5 rounded">
                    IP: {log.ipAddress}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      log.severity === 'WARNING'
                        ? 'bg-amber-100 text-amber-800'
                        : log.severity === 'CRITICAL'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {log.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
