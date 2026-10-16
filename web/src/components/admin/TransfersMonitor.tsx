import React from 'react';
import { CheckCircle2, Clock, Download, FileText, HardDrive, Mail, Pin, PinOff, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { FileTransfer } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

const initials = (name: string) => (name || '؟').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
const HUES = ['#6E1B1B', '#2563eb', '#0e9f82', '#7c3aed', '#c2410c', '#0891b2', '#be185d'];
const hue = (name: string) => HUES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length];

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => (
  <span className="shrink-0 rounded-full text-white font-black flex items-center justify-center" style={{ width: size, height: size, background: hue(name), fontSize: size * 0.38 }}>
    {initials(name)}
  </span>
);

const Pill: React.FC<{ tone: 'green' | 'amber' | 'rose' | 'slate' | 'brand' | 'violet'; icon?: React.ReactNode; children: React.ReactNode; title?: string }> = ({ tone, icon, children, title }) => {
  const cls = {
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
    brand: 'bg-[#FAF5F1] text-[#6E1B1B] border-[#EBDBCE]',
    violet: 'bg-violet-50 text-violet-800 border-violet-200',
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1 text-[10px] font-black leading-5 rounded-full border px-2.5 py-0.5 max-w-full ${cls}`}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
};

const when = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { day: toPersianDigits(iso), time: '' };
  return { day: formatTaskDate(d.toLocaleDateString('en-CA')), time: toPersianDigits(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) };
};

/** The live monitoring of everything sent: one tidy card per file or letter (who sent it to whom, when, whether it was received, what the server holds). */
export const TransfersMonitor: React.FC<{
  transfers: FileTransfer[];
  fileSizes: Record<string, number> | null;
  onPurge: (t: FileTransfer) => void;
  onKeep: (t: FileTransfer) => void;
  onDelete: (t: FileTransfer) => void;
}> = ({ transfers, fileSizes, onPurge, onKeep, onDelete }) => {
  if (transfers.length === 0) return <div className="bg-white rounded-2xl border border-[#EBDBCE] py-14 text-center text-xs font-bold text-[#8C6F66]">هیچ رکوردی برای تبادل فایل یافت نشد.</div>;

  return (
    <div className="space-y-2.5" data-transfers>
      <div className="hidden lg:grid grid-cols-[2.1fr_2.3fr_1fr_1.9fr_auto] gap-4 px-5 text-[10px] font-black text-[#8C6F66]">
        <span>فایل یا نامه</span>
        <span>فرستنده ← گیرندگان</span>
        <span>ارسال</span>
        <span>وضعیت</span>
        <span className="w-24 text-center">مدیریت</span>
      </div>
      {transfers.map((t) => {
        const w = when(t.sentAt);
        const onServer = fileSizes && fileSizes[t.id] != null;
        const letter = !!t.isOfficialLetter;
        const protectedLetter = letter && t.signatureStatus === 'SIGNED';
        const people = t.recipients.filter((r) => r.fullName);
        const shown = people.slice(0, 3);
        const more = people.length - shown.length;
        return (
          <div key={t.id} className="bg-white rounded-2xl border border-[#EBDBCE] hover:border-[#C98B6A]/70 hover:shadow-sm transition-all px-4 sm:px-5 py-3.5 grid grid-cols-1 lg:grid-cols-[2.1fr_2.3fr_1fr_1.9fr_auto] gap-x-4 gap-y-3 items-center">
            {/* what */}
            <div className="flex items-center gap-3 min-w-0">
              <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${letter ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-[#FAF5F1] border-[#EBDBCE] text-[#6E1B1B]'}`}>
                {letter ? <Mail className="w-[18px] h-[18px]" /> : <FileText className="w-[18px] h-[18px]" />}
              </span>
              <div className="min-w-0">
                <div className="font-black text-[13px] text-[#3A241F] leading-6 break-words" dir="auto">{t.fileName}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {letter && <Pill tone="amber">نامه رسمی</Pill>}
                  <span className="text-[10px] text-[#B8A39C] font-mono" dir="ltr">{t.id}</span>
                </div>
              </div>
            </div>

            {/* who to whom */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0 shrink-0 max-w-[45%]">
                <Avatar name={t.sender.fullName} size={30} />
                <div className="min-w-0">
                  <div className="text-[12px] font-black text-[#3A241F] truncate">{t.sender.fullName}</div>
                  <div className="text-[10px] text-[#8C6F66] truncate">{t.sender.departmentName}</div>
                </div>
              </div>
              <span className="text-[#C98B6A] font-black shrink-0">←</span>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {shown.map((r) => (
                  <span key={r.id} title={r.departmentName ? `${r.fullName} (${r.departmentName})` : r.fullName} className="inline-flex items-center gap-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-full pr-1 pl-2.5 py-0.5 max-w-[150px]">
                    <Avatar name={r.fullName} size={20} />
                    <span className="text-[11px] font-bold text-[#3A241F] truncate">{r.fullName}</span>
                  </span>
                ))}
                {more > 0 && (
                  <span title={people.slice(3).map((r) => r.fullName).join('، ')} className="inline-flex items-center bg-[#F6D9CD]/60 text-[#6E1B1B] rounded-full px-2.5 py-0.5 text-[11px] font-black">
                    +{toPersianDigits(more)} نفر
                  </span>
                )}
              </div>
            </div>

            {/* size and time */}
            <div className="flex lg:block items-center gap-3">
              <div className="text-[12px] font-black text-[#3A241F]">{letter ? '—' : t.fileSize}</div>
              <div className="text-[11px] font-bold text-[#5A4640] leading-5">{w.day}</div>
              <div className="text-[10px] text-[#8C6F66]">{w.time}</div>
            </div>

            {/* state */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {letter ? (
                t.signatureStatus === 'SIGNED' ? (
                  <Pill tone="green" icon={<ShieldCheck className="w-3 h-3 shrink-0" />} title={`امضا شده توسط ${t.signedBy || ''}`}>امضا شد{t.signedBy ? ` · ${t.signedBy}` : ''}</Pill>
                ) : t.signatureStatus === 'REJECTED' ? (
                  <Pill tone="rose" icon={<XCircle className="w-3 h-3 shrink-0" />}>رد شد</Pill>
                ) : (
                  <Pill tone="amber" icon={<Clock className="w-3 h-3 shrink-0" />}>در انتظار امضا</Pill>
                )
              ) : t.fileDeletedAt ? (
                <Pill tone="rose" icon={<Trash2 className="w-3 h-3 shrink-0" />} title={t.fileDeletedByName ? `حذف‌شده توسط ${t.fileDeletedByName}` : 'حذف طبق سیاست نگهداری'}>از سرور حذف شد</Pill>
              ) : (
                <Pill tone="brand" icon={<CheckCircle2 className="w-3 h-3 shrink-0" />}>تحویل داده شد</Pill>
              )}
              {t.downloadsCount > 0 ? (
                <Pill tone={letter ? 'brand' : 'green'} icon={<Download className="w-3 h-3 shrink-0" />}>{letter ? 'مشاهده' : 'دریافت'} {toPersianDigits(t.downloadsCount)} بار</Pill>
              ) : (
                !letter && !t.fileDeletedAt && <Pill tone="amber">هنوز دانلود نشده</Pill>
              )}
              {!letter && !t.fileDeletedAt && (
                onServer ? (
                  <Pill tone="slate" icon={<HardDrive className="w-3 h-3 shrink-0" />}>روی سرور · {toPersianDigits(Math.max(1, Math.round(fileSizes![t.id] / 1024)))} کیلوبایت{t.keepForever ? ' · همیشه' : ''}</Pill>
                ) : (
                  <Pill tone="slate">فقط نزد فرستنده</Pill>
                )
              )}
            </div>

            {/* actions */}
            <div className="flex lg:w-24 lg:justify-center items-center gap-1.5">
              {protectedLetter ? (
                <span className="text-[10px] font-black text-[#8C6F66] inline-flex items-center gap-1" title="نامهٔ امضاشده قابل حذف نیست"><ShieldCheck className="w-3.5 h-3.5" />محافظت‌شده</span>
              ) : (
                <>
                  {!letter && !t.fileDeletedAt && (
                    <>
                      <button type="button" onClick={() => onKeep(t)} title={t.keepForever ? 'برداشتن «همیشه بماند»' : 'این فایل همیشه روی سرور بماند'} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${t.keepForever ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-[#5A4640] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                        {t.keepForever ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => onPurge(t)} title="حذف فایل از سرور (سابقه می‌ماند)" className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 flex items-center justify-center cursor-pointer">
                        <HardDrive className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => onDelete(t)} title="پاک کردن کامل رکورد و تاریخچه" className="w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
