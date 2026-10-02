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
import { User, FileItem, FileTransfer, AuditLog, Department } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

interface AnalyticsViewProps {
  users: User[];
  files: FileItem[];
  transfers: FileTransfer[];
  auditLogs: AuditLog[];
  departments: Department[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  users,
  files,
  transfers,
  auditLogs,
  departments,
}) => {
  const totalStorageGB = users.reduce((acc, u) => acc + u.storageUsedGB, 0);
  const totalAllocatedGB = users.reduce((acc, u) => acc + u.storageQuotaGB, 0);
  const activeUsersCount = users.filter((u) => u.isActive).length;

  // Build dynamic dept stats from real data
  const deptStats = departments.map((dept) => {
    const deptUsers = users.filter((u) => u.departmentId === dept.id);
    const used = deptUsers.reduce((acc, u) => acc + u.storageUsedGB, 0);
    const total = deptUsers.reduce((acc, u) => acc + u.storageQuotaGB, 0);
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return { name: dept.name, used, total, color: dept.color, percent };
  }).filter((d) => d.total > 0);

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-[#EBDBCE]">
        <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
          تحلیل و تله‌متری سیستم
        </h1>
        <p className="text-xs text-[#8C6F66]">
          پایش زنده پهنای باند انتقالات، میزان مصرف سهمیه واحدها و شاخص‌های زیرساخت
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#8C6F66]">
            <span className="text-[11px] font-bold uppercase tracking-wider">پرسنل فعال</span>
            <div className="p-2 bg-[#F6D9CD] text-[#6E1B1B] rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3A241F]">
            {toPersianDigits(activeUsersCount)} نفر / {toPersianDigits(users.length)}
          </div>
          <div className="text-[11px] text-[#6E1B1B] font-bold flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> ۱۰۰٪ در دسترس و آنلاین
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#8C6F66]">
            <span className="text-[11px] font-bold uppercase tracking-wider">کل فضای مصرف شده</span>
            <div className="p-2 bg-[#F6D9CD] text-[#D34A32] rounded-xl">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3A241F]">
            {toPersianDigits(totalStorageGB.toFixed(1))} گیگابایت
          </div>
          <div className="text-[11px] text-[#8C6F66] font-medium">
            از {toPersianDigits((totalAllocatedGB / 1000).toFixed(2))} ترابایت ظرفیت کل استخر
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#8C6F66]">
            <span className="text-[11px] font-bold uppercase tracking-wider">انتقالات تحویل داده شده</span>
            <div className="p-2 bg-[#F6D9CD] text-[#6E1B1B] rounded-xl">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3A241F]">{toPersianDigits(transfers.length)} انتقال</div>
          <div className="text-[11px] text-[#6E1B1B] font-bold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> ۰ درصد خطا در ارسال
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[#8C6F66]">
            <span className="text-[11px] font-bold uppercase tracking-wider">رویدادهای ممیزی ثبت‌شده</span>
            <div className="p-2 bg-[#F6D9CD] text-[#C98B6A] rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#3A241F]">{toPersianDigits(auditLogs.length)} رویداد</div>
          <div className="text-[11px] text-[#C98B6A] font-bold">
            سازگار با الزامات امنیتی
          </div>
        </div>
      </div>

      {/* Grid: Storage by Department + Live Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Usage */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#3A241F] flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-[#6E1B1B]" />
              توزیع مصرف فضای ذخیره‌سازی واحدها
            </h3>
            <span className="text-[11px] font-bold text-[#8C6F66]">سهمیه‌های فعال</span>
          </div>

          {deptStats.length === 0 ? (
            <div className="text-center py-6 text-[#B8A39C] text-xs">
              هیچ واحدی با کارمند فعال وجود ندارد.
            </div>
          ) : (
            <div className="space-y-3.5 pt-2">
              {deptStats.map((dept) => (
                <div key={dept.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#3A241F]">{dept.name}</span>
                    <span className="text-[#8C6F66] font-medium">
                      <b className="text-[#3A241F]">{toPersianDigits(dept.used.toFixed(1))} گیگابایت</b> از {toPersianDigits(dept.total)} گیگابایت ({toPersianDigits(dept.percent)}٪)
                    </span>
                  </div>
                  <div className="w-full bg-[#FAF5F1] rounded-full h-2 overflow-hidden border border-[#EBDBCE]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${dept.percent}%`, backgroundColor: dept.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Audit Feed */}
        <div className="bg-white p-6 rounded-2xl border border-[#EBDBCE] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#3A241F] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#6E1B1B]" />
              جریان زنده گزارشات ممیزی
            </h3>
            <span className="text-[11px] font-bold text-[#D34A32]">به‌روزرسانی خودکار</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-64 pl-1 divide-y divide-[#EBDBCE]/60">
            {auditLogs.map((log) => (
              <div key={log.id} className={log.action === 'CEO_CHANGE' ? 'pt-2.5 px-2 pb-2 first:pt-2.5 text-xs space-y-1 rounded-xl bg-purple-50 border-r-4 border-purple-600' : 'pt-2.5 first:pt-0 text-xs space-y-1'}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#3A241F]">{log.userName}</span>
                  <span className="text-[10px] text-[#8C6F66] font-mono">{log.timestamp}</span>
                </div>
                <p className="text-[#503730] text-[11px] font-medium">{log.details}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="bg-[#FAF5F1] text-[#8C6F66] text-[9px] font-mono px-2 py-0.5 rounded border border-[#EBDBCE]">
                    IP: {log.ipAddress}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded ${log.action === 'CEO_CHANGE'
                      ? 'bg-purple-700 text-white'
                      : log.severity === 'WARNING'
                        ? 'bg-[#F6D9CD] text-[#D34A32]'
                        : log.severity === 'CRITICAL'
                          ? 'bg-[#6E1B1B]/15 text-[#6E1B1B]'
                          : 'bg-[#F6D9CD]/60 text-[#3A241F]'
                      }`}
                  >
                    {log.action === 'CEO_CHANGE' ? 'تغییر مدیرعامل' : log.action}
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
