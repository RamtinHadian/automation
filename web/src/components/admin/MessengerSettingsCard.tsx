import React, { useEffect, useState } from 'react';
import { Save, Send } from 'lucide-react';
import { api, MsgrSettings } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';

const box = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block font-bold text-[#3A241F] mb-1.5';

type Ch = 'telegram' | 'bale';
const NAME: Record<Ch, string> = { telegram: 'تلگرام', bale: 'بله' };

/** Bots of Telegram and Bale: tokens, proxy for Telegram, a connection check and a test message. */
export const MessengerSettingsCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [s, setS] = useState<MsgrSettings | null>(null);
  const [tokens, setTokens] = useState<Record<Ch, string>>({ telegram: '', bale: '' });
  const [proxy, setProxy] = useState('');
  const [enabled, setEnabled] = useState<Record<Ch, boolean>>({ telegram: false, bale: false });
  const [testChat, setTestChat] = useState<Record<Ch, string>>({ telegram: '', bale: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const apply = (r: MsgrSettings) => {
    setS(r);
    setProxy(r.proxy);
    setEnabled({ telegram: r.telegram.enabled, bale: r.bale.enabled });
  };
  useEffect(() => {
    api.msgrSettings().then(apply).catch(() => showToast('خواندن تنظیمات پیام‌رسان‌ها ممکن نشد.'));
  }, [showToast]);

  if (!s) return <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] text-xs text-gray-400 font-bold">در حال بارگذاری...</div>;

  const save = async () => {
    setBusy('save');
    try {
      const r = await api.msgrSave({
        telegram: { enabled: enabled.telegram, token: tokens.telegram },
        bale: { enabled: enabled.bale, token: tokens.bale },
        proxy,
      });
      apply(r);
      setTokens({ telegram: '', bale: '' });
      showToast('تنظیمات ذخیره شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(null);
    }
  };

  const check = async (ch: Ch) => {
    setBusy(ch);
    try {
      const r = await api.msgrCheck(ch, testChat[ch].trim());
      showToast(`اتصال به ${NAME[ch]} برقرار است (ربات: @${r.username})${testChat[ch].trim() ? ' و پیام آزمایشی فرستاده شد.' : '.'}`);
      apply(await api.msgrSettings());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'اتصال برقرار نشد.');
    } finally {
      setBusy(null);
    }
  };

  const bot = (ch: Ch, how: string) => {
    const b = s[ch];
    return (
      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-black text-[#3A241F]">
            ربات {NAME[ch]}
            {b.username && <span className="mr-2 text-[10px] font-mono text-sky-700" dir="ltr">@{b.username}</span>}
          </h4>
          <label className="flex items-center gap-1.5 font-bold text-[#3A241F]">
            <input type="checkbox" checked={enabled[ch]} onChange={(e) => setEnabled((p) => ({ ...p, [ch]: e.target.checked }))} />
            فعال
          </label>
        </div>
        <div>
          <label className={lab}>
            توکن ربات {b.hasToken && <span className="text-emerald-700">(ثبت شده، آخرین چهار نویسه: {b.tokenTail})</span>}
          </label>
          <input className={`${box} font-mono`} dir="ltr" type="password" autoComplete="off" value={tokens[ch]} onChange={(e) => setTokens((p) => ({ ...p, [ch]: e.target.value }))} placeholder={b.hasToken ? 'برای نگه‌داشتن توکن فعلی خالی بگذارید' : 'توکن'} />
          <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">{how}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={`${box} flex-1 min-w-40`} dir="ltr" inputMode="numeric" value={testChat[ch]} onChange={(e) => setTestChat((p) => ({ ...p, [ch]: e.target.value }))} placeholder="شناسهٔ گفتگوی خودتان (اختیاری، برای پیام آزمایشی)" />
          <button type="button" disabled={busy !== null || !b.hasToken} onClick={() => check(ch)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 cursor-pointer">
            <Send className="w-3.5 h-3.5" />
            بررسی اتصال
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-5 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-sm text-[#3A241F]">ارسال پیش‌فاکتور به تلگرام و بله</h3>
          <p className="text-[#8C6F66] mt-1 leading-6">برای هر پیام‌رسان یک ربات بسازید و توکنش را اینجا بگذارید. بعد در پنجرهٔ پیش‌فاکتور دکمهٔ ارسال می‌آید.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] disabled:opacity-50 cursor-pointer">
          <Save className="w-4 h-4" />
          ذخیره
        </button>
      </div>

      {bot('bale', 'در بله به @botfather پیام بدهید، ربات بسازید و توکن را کپی کنید.')}
      {bot('telegram', 'در تلگرام به @BotFather پیام بدهید، با /newbot ربات بسازید و توکن را کپی کنید. تلگرام در ایران فیلتر است؛ سرور بدون پروکسی به آن نمی‌رسد.')}

      <div>
        <label className={lab}>پروکسی سرور برای تلگرام (فقط تلگرام، اختیاری):</label>
        <input className={`${box} font-mono`} dir="ltr" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="socks5://127.0.0.1:1080  یا  http://127.0.0.1:3128" />
        <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">بله نیازی به پروکسی ندارد.</p>
      </div>

      <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3 leading-6 text-sky-900">
        <b>چطور مشتری پیش‌فاکتور را دریافت کند؟</b> ربات فقط به کسی پیام می‌دهد که خودش آن را استارت کرده باشد. در کارت هر مشتری «لینک اتصال» هست؛ آن را برای مشتری بفرستید. وقتی مشتری با آن لینک ربات را باز کند، به همان مشتری وصل می‌شود و دیگر نیازی به شناسه نیست. اگر مشتری فقط ربات را استارت کند، ربات شناسهٔ گفتگویش را برایش می‌نویسد که می‌توانید دستی وارد کنید.
      </div>
    </div>
  );
};
