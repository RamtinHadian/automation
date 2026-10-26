import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { jalaliizeText } from '../../lib/taskDates';
import { Modal, field, label } from '../crm/crmUi';

const TONES = ['رسمی و محترمانه', 'کوتاه و مختصر', 'قاطع و پیگیرانه', 'تشکر و قدردانی', 'درخواست مؤدبانه'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The letter as HTML paragraphs: the first one (the addressee) in bold, as the ready-made letters have it. */
export const letterHtml = (paragraphs: string[]) =>
  paragraphs
    .map((p) => jalaliizeText(p.trim()))
    .filter(Boolean)
    .map((p, i) => (i === 0 ? `<p><b>${esc(p)}</b></p>` : `<p>${esc(p).replace(/\n/g, '<br>')}</p>`))
    .join('');

/** «با هوش مصنوعی»: a short request (and the text already in the letter) becomes the body of the letter. */
export const LetterAiDialog: React.FC<{
  currentText: string;
  subject: string;
  recipient: string;
  sender: string;
  onApply: (r: { subject?: string; paragraphs: string[] }) => void;
  onClose: () => void;
}> = ({ currentText, subject, recipient, sender, onApply, onClose }) => {
  const hasText = currentText.trim().length >= 20;
  const [instruction, setInstruction] = useState('');
  const [useCurrent, setUseCurrent] = useState(hasText);
  const [tone, setTone] = useState(TONES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.letterAi({ subject, instruction, currentText: useCurrent ? currentText : '', recipient, sender, tone });
      onApply(r.draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'نوشتن انجام نشد.');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="نوشتن نامه با هوش مصنوعی"
      onClose={busy ? () => undefined : onClose}
      onTop="max"
      footer={
        <>
          <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#8C6F66] cursor-pointer">انصراف</button>
          <button type="button" disabled={busy || (instruction.trim().length < 5 && !(useCurrent && hasText))} onClick={run} data-letter-ai-run className="px-6 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {busy ? 'در حال نوشتن… (تا دو دقیقه)' : useCurrent && hasText ? 'نامه را کامل کن' : 'نامه را بنویس'}
          </button>
        </>
      }
    >
      <p className="text-[11px] font-bold text-[#8C6F66] leading-6">
        خواستهٔ نامه را کوتاه بنویسید (مثلاً «درخواست تمدید قرارداد پشتیبانی تا پایان سال، با ذکر رضایت از خدمات»). هوش مصنوعی خطاب، متن و پایان نامه را می‌نویسد و در ویرایشگر می‌گذارد. بعد می‌توانید هر جایش را ویرایش کنید؛ با «برگرداندن» (Ctrl+Z) هم می‌شود به متن قبلی برگشت. هر جا اطلاعاتی نداده باشید، جای خالی [..........] می‌گذارد و چیزی از خودش نمی‌سازد.
      </p>
      <div>
        <span className={label}>خواستهٔ نامه (چه چیزی باید در نامه بیاید؟)</span>
        <textarea className={`${field} min-h-[110px] leading-7`} value={instruction} onChange={(e) => setInstruction(e.target.value)} data-letter-ai-text autoFocus />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={label}>لحن نامه</span>
          <select className={field} value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <label className={`flex items-center gap-2 text-xs font-black cursor-pointer pt-5 ${hasText ? '' : 'opacity-40 cursor-not-allowed'}`}>
          <input type="checkbox" disabled={!hasText} checked={useCurrent && hasText} onChange={(e) => setUseCurrent(e.target.checked)} />
          متن فعلی نامه را کامل کن
        </label>
      </div>
      <p className="text-[10px] font-bold text-[#8C6F66]">گیرنده و امضاکننده: {recipient || '—'} · {sender || '—'}. متن شما برای نوشتن به سرویس هوش مصنوعی فرستاده می‌شود؛ اطلاعات محرمانه را ننویسید.</p>
      {err && <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
    </Modal>
  );
};
