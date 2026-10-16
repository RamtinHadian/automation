import React, { useState } from 'react';
import { Shield, Search, Download, Filter, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { AuditLog } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

// what each kind of entry is called on screen
const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'ورود', LOGIN_FAILED: 'ورود ناموفق', LOGOUT: 'خروج', FILE_UPLOAD: 'بارگذاری فایل', FILE_DOWNLOAD: 'دریافت فایل', FILE_TRANSFER: 'ارسال فایل یا نامه', FILE_DELETE: 'حذف فایل',
  USER_CREATE: 'ساخت کاربر', USER_UPDATE: 'ویرایش کاربر', USER_DELETE: 'حذف کاربر', DEPARTMENT_CHANGE: 'واحد سازمانی', QUOTA_UPDATE: 'سهمیه', QUOTA_CHANGE: 'سهمیه',
  PERMISSION_CHANGE: 'تغییر دسترسی', ADMIN_SETTING_CHANGE: 'تنظیمات مدیریت', SETTINGS_UPDATE: 'تنظیمات', SECURITY_EVENT: 'رویداد امنیتی', CEO_CHANGE: 'تغییر مدیرعامل',
  CUSTOMER: 'مشتری', DEAL: 'فرصت فروش', CRM_NOTE: 'سابقه و پیگیری', TASK: 'وظیفه', REPORT: 'گزارش روزانه', CHAT: 'گفتگو', SMS: 'پیامک', LEAVE: 'مرخصی', CALL: 'تماس تلفنی',
  WAREHOUSE: 'انبار', WARRANTY: 'گارانتی', SUPPORT: 'پشتیبانی', SEPIDAR: 'سپیدار', REMINDER: 'یادآور', ANNOUNCEMENT: 'تابلو اعلانات', ACTIVITY: 'سایر تغییرات',
};

interface AuditLogsViewProps {
  logs: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const filtered = logs.filter((log) => {
    const matchesSearch =
      log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      (ACTION_LABEL[log.action] || '').includes(search) ||
      (log.ipAddress || '').includes(search);
    const matchesSeverity = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesSeverity && matchesAction;
  });

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
              گزارشات و ردپای ممیزی سازمانی (Audit Logs)
            </h1>
            <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#C98B6A]/30 uppercase">
              ثبت غیرقابل تغییر
            </span>
          </div>
          <p className="text-xs text-[#8C6F66]">
            لاگ‌های دارای برچسب زمانی و امضای دیجیتال برای کلیه رویدادهای انتقال فایل، ورودها و تغییرات سطح دسترسی
          </p>
        </div>

        <button
          onClick={() => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `audit_log_export_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
          }}
          className="flex items-center gap-2 bg-white hover:bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all"
        >
          <Download className="w-4 h-4 text-[#6E1B1B]" />
          <span>خروجی گرفتن فایل گزارش (CSV / JSON)</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام کارمند، آدرس IP، نوع عملیات یا توضیحات..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none cursor-pointer"
        >
          <option value="ALL">همهٔ نوع عملیات</option>
          {[...new Set(logs.map((l) => l.action))].sort().map((a) => (
            <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none cursor-pointer"
        >
          <option value="ALL">همه سطوح حساسیت</option>
          <option value="INFO">اطلاعات عادی (Info)</option>
          <option value="WARNING">هشدار (Warning)</option>
          <option value="CRITICAL">بحرانی و امنیتی (Critical)</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-[#EBDBCE] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAF5F1] text-[11px] font-bold text-[#8C6F66] uppercase tracking-wider border-b border-[#EBDBCE]">
                <th className="py-3 px-4">زمان رویداد</th>
                <th className="py-3 px-4">کاربر مجری</th>
                <th className="py-3 px-4">نوع عملیات</th>
                <th className="py-3 px-4">سطح حساسیت</th>
                <th className="py-3 px-4">آدرس IP</th>
                <th className="py-3 px-4">شرح رویداد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBDBCE]/60 font-medium text-[#3A241F]">
              {filtered.map((log) => (
                <tr key={log.id} className={log.action === 'CEO_CHANGE' ? 'bg-purple-50 hover:bg-purple-100/70 transition-colors border-r-4 border-purple-600' : 'hover:bg-[#FAF5F1] transition-colors'}>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-[#8C6F66] whitespace-nowrap">
                    {toPersianDigits(log.timestamp)}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-[#3A241F]">{log.userName}</div>
                    <div className="text-[10px] text-[#8C6F66] font-mono">{log.userEmail}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={log.action === 'CEO_CHANGE' ? 'bg-purple-700 text-white border border-purple-800 text-[10px] px-2 py-0.5 rounded font-black whitespace-nowrap' : 'bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] font-mono text-[10px] px-2 py-0.5 rounded font-bold'}>
                      {ACTION_LABEL[log.action] || log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {log.severity === 'CRITICAL' ? (
                      <span className="inline-flex items-center gap-1 text-[#6E1B1B] font-bold text-[10px] uppercase">
                        <AlertTriangle className="w-3 h-3" /> بحرانی
                      </span>
                    ) : log.severity === 'WARNING' ? (
                      <span className="inline-flex items-center gap-1 text-[#D34A32] font-bold text-[10px] uppercase">
                        <Info className="w-3 h-3" /> هشدار
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#6E1B1B] font-bold text-[10px] uppercase">
                        <CheckCircle2 className="w-3 h-3" /> عادی
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {log.ipAddress ? <span dir="ltr" className="inline-block font-mono text-[11px] font-bold text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg px-2 py-0.5">{log.ipAddress}</span> : <span className="text-[#B8A39C]">—</span>}
                  </td>
                  <td className="py-3.5 px-4 text-[#503730] text-xs font-medium">
                    {toPersianDigits(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
