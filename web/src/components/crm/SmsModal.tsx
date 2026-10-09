import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { smsButtons, smsFinalText } from '../../lib/smsLibrary';
import { useCompanyName } from '../../lib/useCompanyName';


/** Send a ready-made SMS to a customer (it is also noted in the customer's history). The texts are templates registered in the Kavenegar panel, so none can be written by hand. */
export const SmsModal: React.FC<{ customerId: string; customerName: string; phones: string[]; onClose: () => void }> = ({ customerId, customerName, phones, onClose }) => {
  const { showToast } = useAppContext();
  const mobiles = phones.filter((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(p.replace(/[\s-]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))));
  const [to, setTo] = useState(mobiles[0] || phones[0] || '');
  const [key, setKey] = useState('');
  const company = useCompanyName();
  const [busy, setBusy] = useState(false);
  const [buttons, setButtons] = useState(() => smsButtons(null, []));
  useEffect(() => {
    api.smsStatus().then((r) => setButtons(smsButtons(r.library, r.custom))).catch(() => {});
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      await api.smsSend({ to, templateKey: key, customerId });
      showToast('پیامک ارسال شد و در سابقهٔ مشتری ثبت شد.');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };

  const preview = key ? toPersianDigits(smsFinalText(key, customerName, company || 'نام شرکت')) : '';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-[#EBDBCE] text-right max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-700" />
            ارسال پیامک به «{customerName}»
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">شمارهٔ موبایل</label>
            {phones.length > 1 ? (
              <select className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold" value={to} onChange={(e) => setTo(e.target.value)}>
                {phones.map((p) => (
                  <option key={p} value={p}>{toPersianDigits(p)}</option>
                ))}
              </select>
            ) : (
              <input className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-left" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
            )}
          </div>
          <div>
            <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">نوع پیامک را انتخاب کنید</label>
            <div className="flex flex-wrap gap-1.5">
              {buttons.map((t) => (
                <button key={t.id} type="button" onClick={() => setKey(t.id)} className={`px-3 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-bold cursor-pointer ${key === t.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {preview ? (
            <div className="rounded-xl border border-dashed border-[#C98B6A] bg-[#FDFAF7] px-3 py-2.5 text-[12px] font-bold text-[#3A241F] leading-7 whitespace-pre-line" data-sms-preview>
              <span className="block text-[10px] text-[#8C6F66] font-medium">متنی که مشتری می‌بیند</span>
              {preview}
            </div>
          ) : (
            <div className="text-[11px] text-[#8C6F66] font-bold leading-6">متن پیامک ثابت است و مدیر آن را تأیید کرده؛ فقط نوع آن را انتخاب کنید.</div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" disabled={busy || !key || !to.trim()} onClick={send} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 cursor-pointer">
            <Send className="w-4 h-4" />
            ارسال
          </button>
        </div>
      </div>
    </div>
  );
};
