import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, FileDown, Image as ImageIcon, Loader2, Share2, X } from 'lucide-react';
import { FileTransfer } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { LetterPrintOverrides } from '../../lib/pdfLetterGenerator';
import { letterAsJpg, letterAsPdf, saveFile } from '../../lib/letterExport';

const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * «دانلود» of a signed letter: one button (in the row with «مشاهده و بررسی», «ارجاع» and «چاپ»). It asks «PDF یا عکس JPG؟», makes that file on this device (letterhead,
 * signature and stamp included) and saves it. On a computer the browser downloads it at once. A phone only lets a page save or share a file right after a real tap, and the file takes
 * a few seconds to make, so there a «file ready» panel opens with fresh buttons: «ذخیره یا ارسال» (the share sheet: Files, Photos, a messenger) and «دانلود» (a plain link).
 */
export const LetterDownloadMenu: React.FC<{ transfer: FileTransfer; overrides?: () => LetterPrintOverrides | undefined; compact?: boolean; className?: string }> = ({ transfer, overrides, compact, className }) => {
  const { settings, currentUser, showToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'jpg' | null>(null);
  const [ready, setReady] = useState<{ blob: Blob; name: string; url: string; kind: 'pdf' | 'jpg' } | null>(null);
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);
  if (!transfer.isOfficialLetter || transfer.signatureStatus !== 'SIGNED') return null;
  const close = () => { setOpen(false); setReady(null); };
  const run = async (kind: 'pdf' | 'jpg') => {
    setBusy(kind);
    try {
      const f = kind === 'pdf' ? await letterAsPdf(transfer, settings, currentUser, overrides?.()) : await letterAsJpg(transfer, settings, currentUser, overrides?.());
      if (isTouch()) {
        setReady({ blob: f.blob, name: f.name, url: URL.createObjectURL(f.blob), kind });
      } else {
        await saveFile(f.blob, f.name, false);
        showToast(`«${f.name}» دریافت شد.`);
        close();
      }
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
        <span className="block text-[11px] font-bold opacity-75 leading-5">{busy === kind ? 'در حال ساخت فایل… (چند ثانیه)' : hint}</span>
      </span>
    </button>
  );
  const btn = 'w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black cursor-pointer';
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
        <div className="fixed inset-0 z-[2147483200] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4" onMouseDown={() => !busy && close()} data-keep-anim data-letter-download-dialog>
          <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#EBDBCE] p-5 space-y-3 text-right">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm text-[#3A241F]">{ready ? 'فایل آماده است' : 'دانلود نامه با چه قالبی؟'}</h3>
              <button type="button" disabled={!!busy} onClick={close} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
            </div>
            {!ready ? (
              <>
                {choice('pdf', FileDown, 'فایل PDF', 'برای چاپ و ارسال رسمی؛ روی کاغذ همان نامه', 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200')}
                {choice('jpg', ImageIcon, 'عکس JPG', 'برای فرستادن سریع در پیام‌رسان و دیدن در گالری', 'bg-sky-50 hover:bg-sky-100 text-sky-900 border-sky-200')}
              </>
            ) : (
              <div className="space-y-3" data-export-ready>
                <div className="text-[12px] font-bold text-[#3A241F] break-words [overflow-wrap:anywhere]">{ready.name}</div>
                {ready.kind === 'jpg' && <img src={ready.url} alt="نامه" className="max-h-56 mx-auto rounded-xl border border-[#EBDBCE] bg-white" />}
                <button type="button" onClick={async () => { const how = await saveFile(ready.blob, ready.name, true); if (how === 'downloaded') showToast(`«${ready.name}» دریافت شد.`); }} className={`${btn} bg-[#6E1B1B] hover:bg-[#561414] text-white`} data-export-share><Share2 className="w-4 h-4" />ذخیره یا ارسال</button>
                <a href={ready.url} download={ready.name} className={`${btn} bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE]`} data-export-link><Download className="w-4 h-4" />دانلود فایل</a>
                {ready.kind === 'pdf' && <a href={ready.url} target="_blank" rel="noopener" className={`${btn} bg-white text-[#3A241F] border border-[#EBDBCE]`}><ExternalLink className="w-4 h-4" />باز کردن در مرورگر</a>}
                <p className="text-[10.5px] font-bold text-[#8C6F66] leading-5">روی عکس هم می‌توانید انگشت را نگه دارید و «ذخیره» را بزنید.</p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
