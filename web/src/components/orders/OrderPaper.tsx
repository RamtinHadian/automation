import React from 'react';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';

/** The sheet of an administrative order: company name, number and date, to whom, the subject, the text and the name and title of the one who ordered. Shown on the page and printed from it. */
export const OrderPaper: React.FC<{ number: string; subject: string; body: string; to: string; from: string; fromTitle: string; at: string }> = ({ number, subject, body, to, from, fromTitle, at }) => {
  const { settings } = useAppContext();
  return (
    <div className="bg-white border border-[#EBDBCE] rounded-2xl shadow-sm px-8 py-9 sm:px-12 text-right text-[#1f2937]" dir="rtl" data-order-paper>
      <div className="text-center text-[12px] font-black text-[#8C6F66]">« به نام خدا »</div>
      <div className="mt-2 flex items-start justify-between gap-4 border-b-2 border-[#3A241F] pb-3">
        <div>
          <div className="text-[17px] font-black text-[#3A241F]">{settings.companyName || ''}</div>
          <div className="text-[11px] font-bold text-[#8C6F66]">دستور اداری</div>
        </div>
        <div className="text-[11.5px] font-bold text-[#3A241F] space-y-1 text-left">
          <div>شمارهٔ دستور: {toPersianDigits(number)}</div>
          <div>تاریخ: {formatCurrentJalaliDateTime(new Date(at))}</div>
        </div>
      </div>
      <div className="mt-5 text-[13px] font-black text-[#3A241F]">به: {to || '—'}</div>
      <div className="mt-1.5 text-[13px] font-black text-[#3A241F]">موضوع: {subject || '—'}</div>
      <div className="mt-5 text-[14px] font-bold leading-9 whitespace-pre-line min-h-[160px]">{body}</div>
      <div className="mt-10 text-left">
        <div className="inline-block text-center">
          <div className="text-[14px] font-black text-[#3A241F]">{from}</div>
          <div className="text-[12px] font-bold text-[#8C6F66]">{fromTitle}</div>
        </div>
      </div>
    </div>
  );
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Opens the print window of one order. */
export const printOrder = (o: { number: string; subject: string; body: string; to: string; from: string; fromTitle: string; at: string }, company: string) => {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  const css = '@page{size:A4;margin:18mm} body{font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#1f2937;line-height:2.1} .top{display:flex;justify-content:space-between;border-bottom:2px solid #3A241F;padding-bottom:8px;margin-top:6px} .c{text-align:center;font-weight:800;font-size:12px;color:#6b5048} h1{margin:0;font-size:18px} .m{font-size:12px;font-weight:700;text-align:left} .b{margin-top:20px;font-size:14px;white-space:pre-line;min-height:300px} .s{margin-top:50px;text-align:left}';
  const html = [
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>دستور اداری ' + esc(toPersianDigits(o.number)) + '</title><style>' + css + '</style></head><body>',
    '<div class="c">« به نام خدا »</div><div class="top"><div><h1>' + esc(company) + '</h1><div style="font-size:11px;color:#8C6F66">دستور اداری</div></div>',
    '<div class="m"><div>شمارهٔ دستور: ' + esc(toPersianDigits(o.number)) + '</div><div>تاریخ: ' + esc(formatCurrentJalaliDateTime(new Date(o.at))) + '</div></div></div>',
    '<p><b>به:</b> ' + esc(o.to) + '</p><p><b>موضوع:</b> ' + esc(o.subject) + '</p><div class="b">' + esc(o.body) + '</div>',
    '<div class="s"><b>' + esc(o.from) + '</b><br>' + esc(o.fromTitle) + '</div>',
    '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print()},300)}</scr' + 'ipt></body></html>',
  ].join('');
  w.document.write(html);
  w.document.close();
};
