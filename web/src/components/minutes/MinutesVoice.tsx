import React, { useEffect, useRef, useState } from 'react';
import { FileAudio, Loader2, Mic, Square } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { AudioPiece, PcmRecorder, fileToPieces } from '../../lib/audioChunks';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/** One piece of sound → its text (the server converts it in the background; this asks until it is ready). */
async function transcribePiece(p: AudioPiece, alive: () => boolean): Promise<string> {
  const { id } = await api.minutesTranscribeStart(p.blob, p.ext);
  for (let i = 0; i < 160 && alive(); i++) {
    await sleep(2500);
    const r = await api.minutesTranscribeGet(id);
    if (r.status === 'done') return r.text.replace(/^گفتاری شنیده نشد\.?$/m, '').trim();
    if (r.status === 'error') throw new Error(r.error || 'تبدیل به متن انجام نشد.');
  }
  throw new Error('تبدیل صدا بیش از حد طول کشید؛ دوباره امتحان کنید.');
}

/**
 * Voice for the minutes: record the meeting (or pick a recording), it is turned into text piece by piece (the first pieces while the
 * meeting still goes on) and the whole text is handed to onText, which writes the minutes from it.
 */
export const MinutesVoice: React.FC<{ disabled?: boolean; onText: (text: string) => void }> = ({ disabled, onText }) => {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'working'>('idle');
  const [secs, setSecs] = useState(0);
  const [sent, setSent] = useState(0);
  const [done, setDone] = useState(0);
  const [err, setErr] = useState('');
  const rec = useRef<PcmRecorder | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const texts = useRef<string[]>([]);
  const failed = useRef('');
  const live = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { live.current = false; rec.current?.stop(); }, []);

  const reset = () => { texts.current = []; failed.current = ''; chain.current = Promise.resolve(); setSent(0); setDone(0); setErr(''); };
  const enqueue = (p: AudioPiece) => {
    const idx = texts.current.length;
    texts.current.push('');
    setSent((n) => n + 1);
    chain.current = chain.current.then(async () => {
      if (failed.current || !live.current) return;
      try {
        texts.current[idx] = await transcribePiece(p, () => live.current);
        setDone((n) => n + 1);
      } catch (e) {
        failed.current = e instanceof Error ? e.message : 'تبدیل به متن انجام نشد.';
      }
    });
  };
  const finish = async () => {
    setPhase('working');
    await chain.current;
    if (!live.current) return;
    setPhase('idle');
    if (failed.current) { setErr(failed.current); return; }
    const text = texts.current.filter(Boolean).join('\n').trim();
    if (text.length < 30) { setErr('از این صدا متن کافی شنیده نشد (گفتاری شناخته نشد یا خیلی کوتاه بود).'); return; }
    onText(text);
  };

  const start = async () => {
    reset();
    try {
      const r = new PcmRecorder((wav) => enqueue({ blob: wav, ext: 'wav' }));
      await r.start();
      rec.current = r;
      setPhase('recording');
      setSecs(0);
      const t = setInterval(() => {
        if (!rec.current || !live.current) { clearInterval(t); return; }
        setSecs(rec.current.seconds);
      }, 500);
    } catch {
      setErr('به میکروفون دسترسی داده نشد. اجازهٔ میکروفون را در مرورگر بدهید، یا یک فایل صوتی انتخاب کنید.');
    }
  };
  const stop = () => {
    rec.current?.stop();
    rec.current = null;
    finish();
  };
  const pick = async (f?: File | null) => {
    if (!f) return;
    reset();
    setPhase('working');
    try {
      const pieces = await fileToPieces(f);
      pieces.forEach(enqueue);
      await finish();
    } catch (e) {
      setPhase('idle');
      setErr(e instanceof Error ? e.message : 'فایل خوانده نشد.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-white/70 p-3 space-y-2" data-minutes-voice>
      <div className="text-[11px] font-black text-violet-900">یا صدای جلسه را بدهید</div>
      <p className="text-[11px] font-bold text-violet-900/80 leading-6">جلسه را ضبط کنید یا فایل صوتی آن را بدهید. صدا (تکه‌تکه، حدود پنج دقیقه) برای تبدیل به متن به سرویس هوش مصنوعی فرستاده می‌شود و روی سرور ذخیره نمی‌ماند؛ بعد صورتجلسه از روی حرف‌های گفته‌شده نوشته می‌شود. متن پیاده‌شده را می‌توانید در کادر بالا هم ببینید و ویرایش کنید.</p>
      <div className="flex flex-wrap items-center gap-2">
        {phase !== 'recording' ? (
          <button type="button" disabled={disabled || phase === 'working'} onClick={start} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer flex items-center gap-1.5 disabled:opacity-50" data-minutes-voice-record>
            <Mic className="w-4 h-4" />ضبط صدای جلسه
          </button>
        ) : (
          <button type="button" onClick={stop} className="px-4 py-2 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer flex items-center gap-1.5" data-minutes-voice-stop>
            <Square className="w-4 h-4 fill-current" />پایان ضبط و نوشتن صورتجلسه
          </button>
        )}
        <button type="button" disabled={disabled || phase !== 'idle'} onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-xl border border-violet-300 bg-violet-50 text-violet-800 text-xs font-black cursor-pointer flex items-center gap-1.5 disabled:opacity-50" data-minutes-voice-file>
          <FileAudio className="w-4 h-4" />انتخاب فایل صوتی
        </button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-minutes-voice-input />
        {phase === 'recording' && <span className="flex items-center gap-1.5 text-xs font-black text-rose-700"><span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />{toPersianDigits(clock(secs))}{sent > 0 ? ` · ${toPersianDigits(done)} از ${toPersianDigits(sent)} تکه تبدیل شد` : ''}</span>}
        {phase === 'working' && <span className="flex items-center gap-1.5 text-xs font-black text-violet-800"><Loader2 className="w-4 h-4 animate-spin" />{sent > 0 ? `در حال تبدیل صدا به متن… ${toPersianDigits(done)} از ${toPersianDigits(sent)} تکه` : 'در حال آماده‌کردن صدا…'}</span>}
      </div>
      {err && <div className="text-[11px] font-bold text-rose-700 leading-6" data-minutes-voice-error>{err}</div>}
    </div>
  );
};
