import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Globe2, KeyRound, LogIn, Network, Search, Settings2, ShieldAlert, Trash2, UserCog, Users, Wifi } from 'lucide-react';
import { AuditLog } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { matchesAll } from '../../lib/searchAll';

// what each kind of entry is called on screen
const ACTION_LABEL: Record<string, string> = {
  LOGIN: 'ورود', LOGIN_FAILED: 'ورود ناموفق', LOGOUT: 'خروج', FILE_UPLOAD: 'بارگذاری فایل', FILE_DOWNLOAD: 'دریافت فایل', FILE_TRANSFER: 'ارسال فایل یا نامه', FILE_DELETE: 'حذف فایل',
  USER_CREATE: 'ساخت کاربر', USER_UPDATE: 'ویرایش کاربر', USER_DELETE: 'حذف کاربر', DEPARTMENT_CHANGE: 'واحد سازمانی', QUOTA_UPDATE: 'سهمیه', QUOTA_CHANGE: 'سهمیه',
  PERMISSION_CHANGE: 'تغییر دسترسی', ADMIN_SETTING_CHANGE: 'امضا و تنظیمات نامه', SETTINGS_UPDATE: 'تنظیمات', SECURITY_EVENT: 'رویداد امنیتی', CEO_CHANGE: 'تغییر مدیرعامل',
  CUSTOMER: 'مشتری', DEAL: 'فرصت فروش', CRM_NOTE: 'سابقه و پیگیری', TASK: 'وظیفه', REPORT: 'گزارش روزانه', CHAT: 'گفتگو', SMS: 'پیامک', LEAVE: 'مرخصی', CALL: 'تماس تلفنی',
  WAREHOUSE: 'انبار', WARRANTY: 'گارانتی', SUPPORT: 'پشتیبانی', SEPIDAR: 'سپیدار', REMINDER: 'یادآور', ANNOUNCEMENT: 'تابلو اعلانات', ACTIVITY: 'سایر تغییرات',
};

type Tone = 'blue' | 'rose' | 'sky' | 'amber' | 'violet' | 'slate' | 'green' | 'purple';
const TONE: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  purple: 'bg-purple-700 text-white border-purple-800',
};
const toneOf = (a: string): [Tone, React.ElementType] => {
  if (a === 'LOGIN') return ['blue', LogIn];
  if (a === 'LOGIN_FAILED') return ['rose', ShieldAlert];
  if (a === 'CEO_CHANGE') return ['purple', UserCog];
  if (a === 'SECURITY_EVENT') return ['rose', KeyRound];
  if (a.startsWith('FILE_DELETE') || a === 'USER_DELETE') return ['rose', Trash2];
  if (a.startsWith('FILE')) return ['sky', FileText];
  if (a.startsWith('USER') || a === 'PERMISSION_CHANGE' || a === 'DEPARTMENT_CHANGE') return ['amber', UserCog];
  if (a.includes('SETTING') || a === 'SETTINGS_UPDATE' || a.startsWith('QUOTA')) return ['amber', Settings2];
  if (['CUSTOMER', 'DEAL', 'CRM_NOTE', 'SMS', 'CALL'].includes(a)) return ['violet', Users];
  if (['WAREHOUSE', 'WARRANTY', 'SUPPORT', 'SEPIDAR'].includes(a)) return ['green', Settings2];
  return ['slate', FileText];
};

/** private = inside the office network (or the router itself); everything else came from the internet */
const isPrivate = (ip: string) => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1|fe80|fc|fd)/i.test(ip || '');

const split = (ts: string) => {
  const m = ts.split(/\s*[,،]\s*|\s+-\s+/);
  return m.length >= 2 ? { day: toPersianDigits(m[0]), time: toPersianDigits(m[1]) } : { day: toPersianDigits(ts), time: '' };
};

interface AuditLogsViewProps {
  logs: AuditLog[];
}

const PAGE = 80;

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [userFilter, setUserFilter] = useState('ALL');
  const [limit, setLimit] = useState(PAGE);

  const users = useMemo(() => [...new Set(logs.map((l) => l.userName).filter(Boolean))].sort(), [logs]);
  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const hit = matchesAll(log, search, ACTION_LABEL[log.action] || '');
      return hit && (severityFilter === 'ALL' || log.severity === severityFilter) && (actionFilter === 'ALL' || log.action === actionFilter) && (userFilter === 'ALL' || log.userName === userFilter);
    });
  }, [logs, search, severityFilter, actionFilter, userFilter]);

  // when almost everything is seen from one inside address, the router in front of the server is rewriting the sender
  const dominant = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (l.ipSeen || l.ipAddress) m.set(l.ipSeen || l.ipAddress, (m.get(l.ipSeen || l.ipAddress) || 0) + 1);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && isPrivate(top[0]) && top[1] / Math.max(1, logs.length) > 0.7 && logs.length >= 5 ? top[0] : '';
  }, [logs]);
  const stats = useMemo(
    () => ({
      failed: logs.filter((l) => l.action === 'LOGIN_FAILED').length,
      critical: logs.filter((l) => l.severity === 'CRITICAL').length,
      outside: new Set(logs.filter((l) => l.ipAddress && !isPrivate(l.ipAddress)).map((l) => l.ipAddress)).size,
    }),
    [logs],
  );

  const exportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `audit_log_export_${Date.now()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const select = 'px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none cursor-pointer';

  return (
    <div className="space-y-5 select-none" data-audit>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-black text-[#3A241F] tracking-tight">گزارشات ممیزی و ردپای کارها</h1>
            <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#C98B6A]/30">ثبت غیرقابل تغییر</span>
          </div>
          <p className="text-xs text-[#8C6F66] mt-1 leading-6">هر ورود، هر تغییر مهم و هر دریافت فایل، با نام کاربر، زمان و آدرس IP او.</p>
        </div>
        <button onClick={exportJson} className="flex items-center gap-2 bg-white hover:bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors">
          <Download className="w-4 h-4 text-[#6E1B1B]" />
          خروجی فایل گزارش
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['کل رویدادها', logs.length, 'text-[#3A241F] bg-white', Network],
          ['ورود ناموفق', stats.failed, stats.failed ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-[#3A241F] bg-white', ShieldAlert],
          ['رویداد بحرانی', stats.critical, stats.critical ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-[#3A241F] bg-white', AlertTriangle],
          ['آدرس‌های بیرون از شبکه', stats.outside, 'text-sky-700 bg-sky-50 border-sky-200', Globe2],
        ] as const).map(([k, v, cls, Ic]) => (
          <div key={k} className={`rounded-2xl border border-[#EBDBCE] px-4 py-3 ${cls}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-80"><Ic className="w-4 h-4" />{k}</div>
            <div className="text-xl font-black mt-0.5">{toPersianDigits(v)}</div>
          </div>
        ))}
      </div>

      {dominant && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-[12px] font-bold text-amber-900 leading-7 flex gap-3 items-start" data-ip-hint>
          <Wifi className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            بیشتر رویدادها از یک آدرس داخلی دیده می‌شوند (<span dir="ltr" className="font-mono">{dominant}</span>)؛ یعنی مودم یا مسیریاب جلوی سرور، آدرس واقعی فرستنده را عوض می‌کند و سرور فقط همان را می‌بیند.
            <div className="font-medium mt-1">برای رویدادهای تازه، هورمند آدرس اینترنتیِ خودِ کاربر را از مرورگرش می‌پرسد و کنار آدرس دیده‌شده ثبت می‌کند. اگر مرورگر آن را نفرستد، همان آدرس داخلی می‌ماند. راه کامل‌تر، تنظیم مسیریاب است تا فرستندهٔ واقعی را عوض نکند.</div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
            placeholder="جستجو: نام کارمند، آدرس IP، نوع عملیات یا توضیحات…"
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
          />
        </div>
        <select value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setLimit(PAGE); }} className={select}>
          <option value="ALL">همهٔ کاربران</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setLimit(PAGE); }} className={select}>
          <option value="ALL">همهٔ نوع عملیات</option>
          {[...new Set(logs.map((l) => l.action))].sort().map((a) => <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setLimit(PAGE); }} className={select}>
          <option value="ALL">همهٔ سطوح</option>
          <option value="INFO">عادی</option>
          <option value="WARNING">هشدار</option>
          <option value="CRITICAL">بحرانی</option>
        </select>
      </div>

      <div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(filtered.length)} رویداد</div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] py-14 text-center text-xs font-bold text-[#8C6F66]">رویدادی با این مشخصات پیدا نشد.</div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, limit).map((log) => {
            const [tone, Icon] = toneOf(log.action);
            const t = split(log.timestamp);
            const ip = log.ipAddress || '';
            const inside = ip && isPrivate(ip);
            const viaBrowser = log.ipVia === 'browser';
            return (
              <div key={log.id} className={`bg-white rounded-2xl border px-4 py-3 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr_3fr_1.5fr] gap-x-4 gap-y-2 items-center hover:shadow-sm transition-shadow ${log.severity === 'CRITICAL' ? 'border-rose-300 bg-rose-50/40' : log.severity === 'WARNING' ? 'border-amber-200' : 'border-[#EBDBCE]'} ${log.action === 'CEO_CHANGE' ? 'border-r-4 border-r-purple-600' : ''}`}>
                <div className="flex lg:block items-baseline gap-2">
                  <div className="text-[12px] font-black text-[#3A241F]">{t.day}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66]">{t.time}</div>
                </div>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="min-w-0">
                    <div className="text-[12px] font-black text-[#3A241F] truncate">{log.userName}</div>
                    <div className="text-[10px] text-[#8C6F66] truncate" dir="ltr" style={{ textAlign: 'right' }}>{log.userEmail}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-black rounded-full border px-2.5 py-0.5 whitespace-nowrap ${TONE[tone]}`}>
                    <Icon className="w-3 h-3" />
                    {ACTION_LABEL[log.action] || log.action}
                  </span>
                  <div className="text-[12px] font-medium text-[#503730] leading-6 min-w-0 break-words">{toPersianDigits(log.details)}</div>
                </div>
                <div className="flex lg:flex-col lg:items-start items-center gap-1.5 flex-wrap">
                  {ip ? (
                    <>
                      <span dir="ltr" className="inline-block font-mono text-[11px] font-bold text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg px-2 py-0.5">{ip}</span>
                      <span className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black rounded-full border px-2 py-0.5 ${inside ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>
                          {inside ? <Network className="w-3 h-3" /> : <Globe2 className="w-3 h-3" />}
                          {inside ? 'داخل شبکه' : 'بیرون از شبکه'}
                        </span>
                        {viaBrowser && log.ipSeen && (
                          <span title={`آدرسی که خود سرور دیده: ${log.ipSeen}`} className="text-[10px] font-bold text-[#8C6F66] cursor-help">گزارش مرورگر</span>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#B8A39C]">—</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} className="w-full py-3 rounded-2xl bg-white border border-[#EBDBCE] text-xs font-black text-[#6E1B1B] hover:bg-[#FAF5F1] cursor-pointer">
              نمایش {toPersianDigits(Math.min(PAGE, filtered.length - limit))} رویداد بعدی
            </button>
          )}
        </div>
      )}
    </div>
  );
};
