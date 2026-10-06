import React from 'react';
import { Cloud, Loader2, Wifi } from 'lucide-react';
import type { BackupSettings, BackupInfo } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

interface Props {
  cfg: BackupSettings;
  set: (p: Partial<BackupSettings>) => void;
  token: string;
  setToken: (v: string) => void;
  testing: boolean;
  saving: boolean;
  onTest: () => void;
  result: BackupInfo['cloud'];
}

/** Copy of every backup to Google Drive or OneDrive. The login comes from «rclone authorize» run on the admin's own computer. */
export const BackupCloudBlock: React.FC<Props> = ({ cfg, set, token, setToken, testing, saving, onTest, result }) => {
  const type = cfg.cloudType === 'onedrive' ? 'onedrive' : 'drive';
  return (
    <div className="space-y-3" data-backup-cloud>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={!!cfg.cloudEnabled} onChange={(e) => set({ cloudEnabled: e.target.checked })} className="w-4 h-4 accent-[#6E1B1B]" />
        <Cloud className="w-4 h-4 text-[#6E1B1B]" />
        <span className="text-xs font-black text-[#3A241F]">هر پشتیبان را در Google Drive یا OneDrive هم بگذار</span>
      </label>

      {cfg.cloudEnabled && (
        <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-black text-[#3A241F]">کدام فضای ابری؟</div>
              <div className="flex gap-2">
                {([['drive', 'Google Drive'], ['onedrive', 'OneDrive']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => set({ cloudType: id })} className={`flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 rounded-xl border text-xs font-black cursor-pointer ${type === id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`} dir="ltr">{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-black text-[#3A241F]">نام پوشه در آن فضا</div>
              <input value={cfg.cloudFolder ?? 'Hoormand-Backups'} onChange={(e) => set({ cloudFolder: e.target.value })} dir="ltr" className="w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/15" />
            </div>
          </div>

          <details className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-black text-[#6E1B1B]">چطور «کد ورود» را بگیرم؟ (یک‌بار، روی کامپیوتر خودتان)</summary>
            <ol className="mt-2 space-y-1.5 text-[11px] leading-6 text-[#503730] list-decimal pr-4">
              <li>برنامهٔ رایگان <span dir="ltr">rclone</span> را از <span dir="ltr">rclone.org/downloads</span> دانلود کنید و از حالت فشرده درآورید.</li>
              <li>داخل پوشهٔ آن، روی جای خالی <b>Shift + کلیک راست</b> بزنید ← «Open PowerShell window here» و این را بنویسید:<br />
                <span className="inline-block bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg px-2 py-1 select-all" dir="ltr">{type === 'drive' ? '.\\rclone authorize "drive"' : '.\\rclone authorize "onedrive"'}</span>
              </li>
              <li>مرورگر باز می‌شود. وارد حساب {type === 'drive' ? 'گوگل' : 'مایکروسافت'} شوید و «Allow / اجازه» را بزنید.</li>
              <li>در آن پنجره متنی چاپ می‌شود که با <span dir="ltr">{'{'}</span> شروع و با <span dir="ltr">{'}'}</span> تمام می‌شود. همان را کپی کنید و در کادر پایین بچسبانید.{type === 'onedrive' && <> <b>کد OneDrive حدود یک ساعت اعتبار دارد؛ همان لحظه «ذخیره و آزمایش» را بزنید.</b></>}</li>
            </ol>
            <p className="mt-2 text-[11px] text-[#8C6F66] leading-6">نکته: این کد به <b>کل</b> فضای آن حساب دسترسی می‌دهد. بهتر است برای پشتیبان‌ها یک حساب جدا (مثل backup@شرکت) بسازید. کد جایی جز همین سرور نمی‌رود و دوباره به مرورگر برنمی‌گردد.</p>
          </details>

          <div className="space-y-1">
            <div className="text-[11px] font-black text-[#3A241F]">
              کد ورود {cfg.hasCloudToken && !token && <span className="text-emerald-700">· ذخیره شده است ✓ (برای عوض‌کردن، کد تازه را بچسبانید)</span>}
            </div>
            <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} dir="ltr" placeholder={'{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}'} className="w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-[11px] font-mono text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/15 resize-y" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={onTest} disabled={testing || saving} className="flex items-center gap-2 px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-white hover:bg-[#EBDBCE] border border-[#EBDBCE] text-[#6E1B1B] text-xs font-black cursor-pointer disabled:opacity-60">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              ذخیره و آزمایش اتصال
            </button>
            {result && !testing && (
              <span className={`text-[11px] font-bold ${result.result === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {result.result === 'ok' ? '✓ ' + (result.text.startsWith('uploaded') ? 'آخرین پشتیبان در فضای ابری قرار گرفت.' : 'اتصال برقرار است و فایل آزمایشی نوشته و پاک شد.') : '✗ ' + toPersianDigits(result.text)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
