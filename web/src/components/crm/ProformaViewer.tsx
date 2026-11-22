import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Pencil, Printer } from 'lucide-react';
import { Customer, Deal, SystemSettings } from '../../types';
import { buildProformaHtml, openProformaPdf } from '../../lib/proformaPdf';
import { toPersianDigits } from '../../lib/jalali';

const A4_PORTRAIT = 794; // A4 at 96 dpi
const A4_LANDSCAPE = 1123; // the official tax invoice form is A4 landscape

/**
 * An issued proforma shown as the invoice itself (the same sheet that is printed and sent), not as the editing form. The editing form opens only when
 * the person presses «ویرایش».
 */
export const ProformaViewer: React.FC<{
  deal: Deal;
  customer?: Customer;
  settings: SystemSettings;
  issuerName: string;
  onEdit: () => void;
  onClose: () => void;
}> = ({ deal, customer, settings, issuerName, onEdit, onClose }) => {
  const html = useMemo(() => buildProformaHtml({ deal, customer, settings, issuerName }, 'preview'), [deal, customer, settings, issuerName]);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pageW, setPageW] = useState(() => (html.includes('data-official-form') ? A4_LANDSCAPE : A4_PORTRAIT));
  const [frameH, setFrameH] = useState(1123);

  useEffect(() => {
    const fit = () => {
      const w = box.current?.clientWidth || pageW;
      setScale(Math.min(1, (w - 8) / pageW));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [pageW]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-[#EFEAE4] overflow-y-auto" dir="rtl" data-proforma-viewer onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 sm:px-5 py-2.5 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت</button>
        <div className="min-w-0 flex-1 text-[12px] font-black text-[#3A241F] truncate">
          پیش‌فاکتور {deal.proformaNumber ? toPersianDigits(deal.proformaNumber) : ''}
          <span className="font-bold text-[#8C6F66]"> · {customer?.name || deal.customerName}</span>
        </div>
        <button type="button" onClick={() => openProformaPdf(deal, customer, settings, issuerName)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] bg-white text-[#3A241F] hover:border-[#C98B6A] cursor-pointer" data-proforma-print><Printer className="w-4 h-4" />چاپ / PDF</button>
        <button type="button" onClick={onEdit} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-[#6E1B1B] hover:bg-[#561414] text-white cursor-pointer" data-proforma-edit><Pencil className="w-4 h-4" />ویرایش</button>
      </div>
      <div ref={box} className={`${pageW > 900 ? 'max-w-[1240px]' : 'max-w-[900px]'} mx-auto p-3 sm:p-5`}>
        <div style={{ height: frameH * scale }} className="overflow-hidden rounded-xl shadow-md bg-white">
          <iframe
            title="پیش‌فاکتور"
            srcDoc={html}
            className="block border-0 bg-white"
            style={{ width: pageW, height: frameH, transform: `scale(${scale})`, transformOrigin: 'top right' }}
            onLoad={(e) => {
              try {
                const d = e.currentTarget.contentDocument;
                const page = d?.querySelector('.page') as HTMLElement | null;
                if (page && page.offsetWidth > 300) setPageW(Math.ceil(page.offsetWidth + 2 * (page.offsetLeft || 0)));
                if (d) setFrameH(Math.max(900, Math.ceil((page?.scrollHeight || d.documentElement.scrollHeight) + 24)));
              } catch {
                /* the sheet keeps its default height */
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
