import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Link2, Loader2, Send, Share2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { renderProformaPdf } from '../../lib/proformaFile';
import { msgFileUrl, uploadProformaFile } from '../../lib/serverFiles';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { Customer, Deal, SystemSettings } from '../../types';
import { Modal, field, label } from './crmUi';
import { NETWORKS, SocialLogo, countInteraction, entryOf, openChat } from './SocialNetworks';

const newFileId = () => 'prof_' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * After a proforma is approved: send it to the customer on every network he is registered on.
 * The PDF is put on the server and the message carries its download link (a messenger cannot be given a file from outside);
 * where the company bot already knows the customer (Telegram / Bale) the PDF itself is sent by the bot.
 */
export const ProformaShareDialog: React.FC<{ deal: Deal; customer: Customer; settings: SystemSettings; issuerName: string; onClose: () => void }> = ({ deal, customer, settings, issuerName, onClose }) => {
  const { showToast } = useAppContext();
  const [state, setState] = useState<'preparing' | 'ready' | 'error'>('preparing');
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [msgr, setMsgr] = useState<{ telegram: boolean; bale: boolean } | null>(null);
  const [botBusy, setBotBusy] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const fileName = `${deal.proformaNumber || 'proforma'}.pdf`;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const blob = await renderProformaPdf({ deal, customer, settings, issuerName });
        blobRef.current = blob;
        const id = newFileId();
        await uploadProformaFile(id, blob);
        if (!alive) return;
        const url = msgFileUrl(id, fileName);
        setLink(url);
        const head = toPersianDigits(`${customer.name} گرامی،\nپیش‌فاکتور شمارهٔ ${deal.proformaNumber || ''} به مبلغ ${formatMoney(deal.amount)} ${unitName()} صادر شد.${deal.validUntil ? `\nاعتبار تا: ${formatTaskDate(deal.validUntil)}` : ''}`);
        setText(`${head}\nدانلود پیش‌فاکتور: ${url}`);
        setState('ready');
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'ساخت یا بارگذاری پیش‌فاکتور انجام نشد.');
        setState('error');
      }
    })();
    api.msgrStatus().then((s) => alive && setMsgr(s)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(
    () => NETWORKS.filter((n) => !n.web).flatMap((n) => entryOf(customer, n.id).accounts.map((a) => ({ key: n.id + '|' + a, id: n.id, name: n.name, account: a }))),
    [customer],
  );
  const bots = (['telegram', 'bale'] as const).filter((ch) => msgr?.[ch] && (ch === 'telegram' ? customer.telegramChatId : customer.baleChatId));

  const sendRow = (r: { key: string; id: string; name: string; account: string }) => {
    setNote(openChat(r.id, r.name, r.account, text, customer.name));
    countInteraction(customer.id, r.id);
    setDone((d) => (d.includes(r.key) ? d : [...d, r.key]));
  };
  // one after the other, with a pause (every network opens its own app or tab; the person presses «send» in each)
  const sendAll = async () => {
    setRunning(true);
    for (const r of rows) {
      sendRow(r);
      await sleep(3200);
    }
    setRunning(false);
  };
  const sendByBot = async (ch: 'telegram' | 'bale') => {
    if (!blobRef.current) return;
    setBotBusy(ch);
    try {
      const chatId = ch === 'telegram' ? customer.telegramChatId! : customer.baleChatId!;
      await api.msgrSendFile({ channel: ch, chatId, customerId: customer.id, caption: text.split('\n').filter((l) => !l.includes(link)).join('\n'), file: blobRef.current, filename: fileName });
      setDone((d) => [...d, 'bot|' + ch]);
      countInteraction(customer.id, ch);
      showToast(`پیش‌فاکتور با ربات در ${ch === 'bale' ? 'بله' : 'تلگرام'} ارسال شد.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال با ربات نشد.');
    } finally {
      setBotBusy(null);
    }
  };

  return (
    <Modal
      wide
      onTop="max"
      title={`ارسال پیش‌فاکتور برای ${customer.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="text-[11px] font-bold text-[#8C6F66]">{done.length > 0 ? `${toPersianDigits(done.length)} شبکه باز یا ارسال شد` : 'هر شبکه را جدا باز می‌کند؛ ارسال نهایی با شماست'}</span>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer" data-share-close>بستن</button>
        </>
      }
    >
      <div className="space-y-4" data-proforma-share>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-black text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4" />
          پیش‌فاکتور تایید شد و آمادهٔ ارسال است.
        </div>
        {state === 'preparing' && <div className="flex items-center gap-2 text-xs font-bold text-[#8C6F66] py-4"><Loader2 className="w-4 h-4 animate-spin" />در حال ساخت PDF و آماده کردن لینک دانلود…</div>}
        {state === 'error' && <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs font-black text-rose-800 leading-6" data-share-error>{err}</div>}
        {state === 'ready' && (
          <>
            <div>
              <label className={label}>متن پیام (لینک دانلود پیش‌فاکتور در آن است؛ می‌توانید تغییرش دهید)</label>
              <textarea className={`${field} min-h-[130px] leading-7`} value={text} onChange={(e) => setText(e.target.value)} data-share-text />
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-[#8C6F66]" dir="ltr"><Link2 className="w-3 h-3" />{link}</div>
            </div>

            {bots.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-black text-[#3A241F]">ارسال خودکار فایل با ربات شرکت</div>
                {bots.map((ch) => (
                  <button key={ch} type="button" disabled={botBusy !== null} onClick={() => void sendByBot(ch)} className="w-full flex items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 px-3.5 py-2.5 cursor-pointer disabled:opacity-50 text-right" data-share-bot={ch}>
                    <SocialLogo id={ch} size={22} />
                    <span className="flex-1 text-xs font-black text-sky-900">{ch === 'bale' ? 'بله' : 'تلگرام'}: خود فایل PDF را ربات می‌فرستد</span>
                    {done.includes('bot|' + ch) ? <Check className="w-4 h-4 text-emerald-600" /> : botBusy === ch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-sky-700" />}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-black text-[#3A241F]">شبکه‌هایی که مشتری در آن‌هاست</div>
                {rows.length > 1 && (
                  <button type="button" disabled={running} onClick={() => void sendAll()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer" data-share-all>
                    {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                    ارسال در همهٔ شبکه‌ها به ترتیب
                  </button>
                )}
              </div>
              {rows.length === 0 ? (
                <div className="text-[11px] font-bold text-[#8C6F66] leading-6">برای این مشتری شبکه‌ای ثبت نشده است؛ از «تعاملات مجازی» کارت مشتری شماره یا نام کاربری او را ثبت کنید.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map((r) => (
                    <button key={r.key} type="button" onClick={() => sendRow(r)} className="w-full flex items-center gap-2.5 rounded-xl border border-[#EBDBCE] bg-white hover:bg-violet-50 px-3.5 py-2.5 cursor-pointer text-right" data-share-send={r.id}>
                      <SocialLogo id={r.id} size={22} />
                      <span className="text-xs font-black text-[#3A241F]">{r.name}</span>
                      <span className="flex-1 text-left text-[12px] font-black text-[#503730] tracking-wide" dir="ltr">{/^[0-9۰-۹+]+$/.test(r.account) ? toPersianDigits(r.account) : '@' + r.account}</span>
                      {done.includes(r.key) ? <Check className="w-4 h-4 text-emerald-600" /> : <Send className="w-3.5 h-3.5 text-violet-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { try { void navigator.clipboard?.writeText(text); showToast('متن پیام کپی شد.'); } catch { /* no clipboard */ } }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-[#503730] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
                <Copy className="w-4 h-4" />
                فقط کپی متن
              </button>
            </div>
            {note && <div className="text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-6" data-share-note>{note}</div>}
            <p className="text-[10px] font-bold text-[#8C6F66] leading-5">فایل پیش‌فاکتور روی سرور هورمند می‌ماند و مشتری با لینک بدون ورود به سامانه آن را می‌گیرد؛ هر کس لینک را داشته باشد می‌تواند ببیندش. واتس‌اپ و تلگرام پیام را آماده در کادر می‌گذارند (با افزونه می‌توانند خودکار بفرستند)، بقیه متن را کپی می‌کنند.</p>
          </>
        )}
      </div>
    </Modal>
  );
};
