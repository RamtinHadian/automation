import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileDown, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { FileTransfer } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { LetterPrintOverrides } from '../../lib/pdfLetterGenerator';
import { letterAsJpg, letterAsPdf, saveFile } from '../../lib/letterExport';

/**
 * «دانلود» of a signed letter: one button (in the row with «مشاهده و بررسی», «ارجاع» and «چاپ»). It asks «PDF یا عکس JPG؟» and then makes that file on this device
 * (letterhead, signature and stamp included) and saves it: on a phone through the share sheet (Files / Photos / a messenger), elsewhere as a normal download.
 */
export const LetterDownloadMenu: React.FC<{ transfer: FileTransfer; overrides?: () => LetterPrintOverrides | undefined; compact?: boolean; className?: string }> = ({ transfer, overrides, compact, className }) => {
  const { settings, currentUser, showToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'jpg' | null>(null);
  if (!transfer.isOfficialLetter || transfer.signatureStatus !== 'SIGNED') return null;
  const run = async (kind: 'pdf' | 'jpg') => {
    setBusy(kind);
    try {
      const f = kind === 'pdf' ? await letterAsPdf(transfer, settings, currentUser, overrides?.()) : await letterAsJpg(transfer, settings, currentUser, overrides?.());
      const how = await saveFile(f.blob, f.name);
      showToast(how === 'shared' ? 'فایل آمادهٔ ذخیره یا ارسال است.' : `«${f.name}» دریافت شد.`);
      setOpen(false);
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : 'ساخت فایل انجام نشد.');
    } finally {
      setBusy(null);
    }
  };
  const choice = (kind: 'pdf' | 'jpg', Icon: React.ElementType, title: string, hint: string, tone: string) => (
    <button type="button" disabled={!!busy} onClick={() => run(kind)} className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-right cursor-pointer transition-all disabled:opacity-60 disabled:cursor-wait ${tone}`} data-export-choice={kind}>
      <span className="w-11 h-11 rounded-xl bg-white/80 flex items-center justify-center shrink-0">{busy === kind ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}</span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{title}</span>
        <span className="block text-[11px] font-bold opacity-75 leading-5">{busy === kind ? 'در حال ساخت فایل…' : hint}</span>
      </span>
    </button>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-center gap-1.5 ${compact ? 'px-2.5 py-1.5 sm:px-3 sm:py-2' : 'px-3 py-1.5 sm:px-3.5 sm:py-2'} font-bold text-[11px] sm:text-xs rounded-xl border bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border-[#EBDBCE] transition-all cursor-pointer ${className || ''}`}
        title="دانلود نامه به‌صورت PDF یا عکس JPG"
        data-letter-download
      >
        <Download className="w-3.5 h-3.5" />
        <span>دانلود</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[2147483200] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4" onMouseDown={() => !busy && setOpen(false)} data-keep-anim data-letter-download-dialog>
          <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#EBDBCE] p-5 space-y-3 text-right">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-[#3A241F]">دانلود نامه با چه قالبی؟</h3>
              <button type="button" disabled={!!busy} onClick={() => setOpen(false)} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
            </div>
            {choice('pdf', FileDown, 'فایل PDF', 'برای چاپ و ارسال رسمی؛ روی کاغذ همان نامه', 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200')}
            {choice('jpg', ImageIcon, 'عکس JPG', 'برای فرستادن سریع در پیام‌رسان و دیدن در گالری', 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200')}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
