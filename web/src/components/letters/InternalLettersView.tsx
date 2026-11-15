import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, FileDown, Printer, ArrowRight, CheckCircle2, Share2, UserCheck, CornerUpLeft, Eye, FilePlus2, History, Inbox, Network, Reply, Send, Undo2, X } from 'lucide-react';
import { api, ChainPerson, InternalLetter, InternalLetterEvent } from '../../lib/api';
import { PersonPickerMulti, staffItems } from '../common/PersonPicker';
import { SignaturePadDialog } from '../common/SignaturePad';
import { askConfirm } from '../../lib/confirmDialog';
import { DEFAULT_PARAPH_TEMPLATES } from '../../lib/paraph';
import { canSub } from '../../lib/permissions';
import { Sparkles } from 'lucide-react';
import { defaultInternalNumbering, nextFreeLetter } from '../../lib/letterNumbering';
import { generateOfficialLetterHtml, openAndDownloadPdfLetter } from '../../lib/pdfLetterGenerator';
import { letterAsPdf, saveFile } from '../../lib/letterExport';
import { internalAsTransfer } from '../../lib/internalLetterExport';
import { InternalHistoryTree } from './InternalHistoryTree';
import { LetterEditorModal } from './LetterEditorModal';
import { useAppContext } from '../../context/AppContext';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { PersonPicker } from '../common/PersonPicker';

const field = 'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-semibold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none';

const STATUS: Record<InternalLetter['status'], { t: string; c: string }> = {
  IN_CHAIN: { t: 'در مسیر', c: 'bg-amber-50 text-amber-800 border-amber-200' },
  DELIVERED: { t: 'به مقصد رسید', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  RETURNED: { t: 'برگشت خورده', c: 'bg-rose-50 text-rose-800 border-rose-200' },
};

const ACTION: Record<InternalLetterEvent['action'], { t: string; c: string }> = {
  CREATED: { t: 'نامه را نوشت', c: '#6E1B1B' },
  SENT: { t: 'ارسال کرد به', c: '#B45309' },
  FORWARDED: { t: 'به بالا فرستاد، برای', c: '#B45309' },
  DELIVERED: { t: 'به مقصد رساند، به', c: '#059669' },
  RETURNED: { t: 'برگرداند به', c: '#E11D48' },
  EDITED: { t: 'اصلاح کرد', c: '#7C3AED' },
  NOTE: { t: 'یادداشت گذاشت', c: '#0284C7' },
  REPLY: { t: 'پاسخ داد', c: '#059669' },
  READ: { t: 'خواند', c: '#8C6F66' },
  REFERRED: { t: 'ارجاع داد به', c: '#7C3AED' },
  ARCHIVED: { t: 'بایگانی کرد', c: '#8C6F66' },
  UNARCHIVED: { t: 'از بایگانی درآورد', c: '#8C6F66' },
  ACTED: { t: 'اقدام را انجام‌شده اعلام کرد', c: '#059669' },
};

const when = (iso: string) => formatCurrentJalaliDateTime(new Date(iso));

/** «مکاتبات داخلی»: letters between the people of the company that climb the organisation chart (employee → unit manager → peer manager / managing director), each with its full history. */
export const InternalLettersView: React.FC<{ onUnread?: (n: number) => void }> = ({ onUnread }) => {
  const { currentUser } = useAppContext();
  const auditor = !!currentUser.canSignOfficialLetters || currentUser.role === 'SUPER_ADMIN'; // only the top administrator and the managing director see every letter
  const [box, setBox] = useState<'inbox' | 'sent' | 'referred' | 'archive' | 'involved' | 'all'>('inbox');
  const [referredCount, setReferredCount] = useState(0);
  const [list, setList] = useState<InternalLetter[]>([]);
  const [open, setOpen] = useState<InternalLetter | null>(null);
  const [compose, setCompose] = useState<InternalLetter | 'new' | null>(null);
  const [route, setRoute] = useState<string[]>([]);

  const load = useCallback(() => {
    api.icList(box).then((r) => {
      setList(r.letters);
      if (box === 'inbox') onUnread?.(r.letters.filter((l) => !l.read).length);
      if (box === 'referred') setReferredCount(r.letters.length);
      setOpen((cur) => (cur ? r.letters.find((l) => l.id === cur.id) || cur : cur));
    }).catch(() => setList([]));
  }, [box, onUnread]);
  useEffect(() => { load(); }, [load]);
  // letters move while somebody else works on them
  useEffect(() => {
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    api.icOptions().then((r) => setRoute(r.firstHop || [])).catch(() => setRoute([]));
    api.icList('referred').then((r) => setReferredCount(r.letters.length)).catch(() => {});
  }, []);

  const show = (l: InternalLetter) => {
    setOpen(l);
    if (!l.read && l.people.includes(currentUser.id)) api.icRead(l.id).then(load).catch(() => {});
  };

  const boxes: [typeof box, string][] = [['inbox', 'دریافتی (نزد من)'], ['referred', referredCount > 0 ? `ارجاع‌شده به من (${toPersianDigits(referredCount)})` : 'ارجاع‌شده به من'], ['sent', 'نوشته‌های من'], ['archive', 'بایگانی'], ['involved', 'از دست من گذشته'], ...(auditor ? ([['all', 'همهٔ مکاتبات']] as [typeof box, string][]) : [])];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4" dir="rtl" data-internal-letters>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {boxes.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setBox(k)} className={`px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${box === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{t}</button>
          ))}
        </div>
        <button type="button" onClick={() => setCompose('new')} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer" data-ic-new>
          <FilePlus2 className="w-4 h-4" />
          نامهٔ داخلی جدید
        </button>
      </div>

      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 text-[11px] leading-6 font-bold text-[#6B4F47] flex items-start gap-2" data-ic-chain>
        <Network className="w-4 h-4 text-[#6E1B1B] shrink-0 mt-1" />
        <div>
          {currentUser.canSignOfficialLetters
            ? 'شما مدیرعامل هستید؛ می‌توانید به همهٔ همکاران نامهٔ داخلی بنویسید و نامه‌هایی که به شما می‌رسد در «دریافتی» است.'
            : route.length > 0
              ? <>نامهٔ شما اول نزد «<b>{route[0]}</b>» (مدیر واحدتان) می‌رود. او آن را به مدیر هم‌رده، مدیر بالاتر یا مدیرعامل می‌فرستد یا با دلیل برمی‌گرداند. هر مرحله در تاریخچهٔ نامه ثبت می‌شود.</>
              : 'واحد شما مدیر ندارد؛ نامه‌هایتان را مستقیم به مدیران بالاتر یا مدیرعامل می‌نویسید. هر مرحله در تاریخچهٔ نامه ثبت می‌شود.'}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-ic-empty>
          <Inbox className="w-8 h-8 mx-auto mb-2 text-[#C9B8AE]" />
          {box === 'inbox' ? 'نامهٔ داخلی‌ای نزد شما نیست.' : box === 'referred' ? 'ارجاع بازی برای شما نیست.' : box === 'archive' ? 'بایگانی شما خالی است.' : box === 'sent' ? 'هنوز نامهٔ داخلی ننوشته‌اید.' : 'موردی نیست.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {list.map((l) => (
            <button key={l.id} type="button" onClick={() => show(l)} className={`text-right rounded-2xl border p-4 bg-white hover:shadow-md hover:border-[#C98B6A] transition-all cursor-pointer ${!l.read && l.people.includes(currentUser.id) ? 'border-amber-300 bg-amber-50/40' : 'border-[#EBDBCE]'}`} data-ic-card>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-black text-[#3A241F] truncate">{l.subject}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] mt-0.5">از {l.senderName}{l.senderDept ? ` (${l.senderDept})` : ''} ← به {l.toName}</div>
                  <div className="text-[10.5px] font-bold text-[#A8928B] mt-0.5">شمارهٔ {toPersianDigits(l.number)} · {when(l.createdAt)}</div>
                  {(l.referrals || []).some((x) => x.toId === currentUser.id && x.status === 'PENDING') && <div className="text-[10.5px] font-black text-violet-700 mt-1">به شما ارجاع شده، منتظر اقدام</div>}
                  {l.status !== 'DELIVERED' && <div className="text-[10.5px] font-black text-[#6E1B1B] mt-1">الان نزد: {l.holderName}</div>}
                </div>
                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border shrink-0 ${STATUS[l.status].c}`}>{STATUS[l.status].t}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <Detail letter={open} onClose={() => setOpen(null)} onChanged={load} onEdit={() => { setCompose(open); }} onArchived={(to) => { setOpen(null); setBox(to ? 'archive' : 'inbox'); if (box === (to ? 'archive' : 'inbox')) load(); }} />}
      {compose && <RichCompose resend={compose === 'new' ? undefined : compose} onClose={() => setCompose(null)} onDone={() => { setCompose(null); setOpen(null); setBox(compose === 'new' ? 'sent' : box); load(); }} />}
    </div>
  );
};

const Detail: React.FC<{ letter: InternalLetter; onClose: () => void; onChanged: () => void; onEdit: () => void; onArchived: (nowArchived: boolean) => void }> = ({ letter, onClose, onChanged, onEdit, onArchived }) => {
  const { currentUser, settings } = useAppContext();
  const holder = letter.holderId === currentUser.id;
  const [fwd, setFwd] = useState<ChainPerson[]>([]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'forward' | 'return' | 'note' | 'refer' | 'acted' | null>(null);
  const [referTo, setReferTo] = useState<string[]>([]);
  const [paraph, setParaph] = useState('');
  const [paraphOpen, setParaphOpen] = useState(false);
  const [aiList, setAiList] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const templates = (settings.paraphTemplates && settings.paraphTemplates.length ? settings.paraphTemplates : DEFAULT_PARAPH_TEMPLATES).filter(Boolean);
  const askAi = async () => {
    setAiBusy(true);
    setErr('');
    try {
      setAiList((await api.icAiParaph(letter.id)).paraphs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'پیشنهاد هوشمند انجام نشد.');
    } finally {
      setAiBusy(false);
    }
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canAct = holder && letter.status === 'IN_CHAIN';
  const canReturn = holder && letter.senderId !== currentUser.id && letter.status !== 'RETURNED';
  const involved = letter.people.includes(currentUser.id);
  const myPending = (letter.referrals || []).some((x) => x.toId === currentUser.id && x.status === 'PENDING');
  const canRefer = (holder && letter.status === 'DELIVERED') || (letter.referrals || []).some((x) => x.toId === currentUser.id);
  const [referList, setReferList] = useState<ChainPerson[]>([]);
  const [withHead, setWithHead] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [frameH, setFrameH] = useState(1100);
  const head = settings.internalLetterhead || null;
  const transfer = useMemo(() => internalAsTransfer(letter, settings, withHead ? head || undefined : null), [letter, settings, withHead, head]);
  const sheet = useMemo(() => generateOfficialLetterHtml(transfer, settings), [transfer, settings]);
  // archiving asks first, then the letter leaves the lists at once and the person lands in the archive tab (only for this person)
  const toggleArchive = async () => {
    const to = !letter.archived;
    const ok = await askConfirm(to ? 'این نامه به بایگانی شخصی شما برود؟ برای فرستنده و بقیه چیزی تغییر نمی‌کند و هر وقت خواستید از بایگانی درمی‌آید.' : 'نامه از بایگانی بیرون بیاید؟', { confirmText: to ? 'بله، بایگانی شود' : 'بله، بیرون بیاید' });
    if (!ok) return;
    setBusy(true);
    setErr('');
    try {
      await api.icArchive(letter.id, to);
      onArchived(to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'بایگانی انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const f = await letterAsPdf(transfer, settings);
      await saveFile(f.blob, f.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ساخت PDF انجام نشد؛ از «چاپ» و ذخیره به‌صورت PDF استفاده کنید.');
    } finally {
      setPdfBusy(false);
    }
  };
  useEffect(() => {
    if (canAct || canRefer) api.icOptions(letter.id).then((r) => { setFwd(r.forward || []); setReferList(r.refer || []); }).catch(() => { setFwd([]); setReferList([]); });
  }, [letter.id, canAct, canRefer, letter.referrals?.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const history = letter.history || [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      setMode(null);
      setNote('');
      setTo('');
      setReferTo([]);
      setParaph('');
      setAiList([]);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#FAF5F1] overflow-y-auto" dir="rtl" data-ic-detail onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت</button>
        <span className={`text-[11px] font-black rounded-full px-3 py-1 border ${STATUS[letter.status].c}`}>{STATUS[letter.status].t}{letter.status !== 'DELIVERED' ? ` · نزد ${letter.holderName}` : ''}</span>
      </div>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2" data-ic-toolbar>
            <button type="button" onClick={() => openAndDownloadPdfLetter(transfer, settings)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white border border-[#EBDBCE] text-[#3A241F] hover:border-[#C98B6A] cursor-pointer" data-ic-print><Printer className="w-3.5 h-3.5" />چاپ نامه</button>
            <button type="button" disabled={pdfBusy} onClick={exportPdf} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white border border-[#EBDBCE] text-[#3A241F] hover:border-[#C98B6A] disabled:opacity-60 cursor-pointer" data-ic-pdf><FileDown className="w-3.5 h-3.5" />{pdfBusy ? 'در حال ساخت…' : 'خروجی PDF'}</button>
            {head && (
              <label className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] cursor-pointer mr-auto">
                <input type="checkbox" className="w-4 h-4 accent-[#6E1B1B] cursor-pointer" checked={withHead} onChange={(e) => setWithHead(e.target.checked)} />
                با سربرگ
              </label>
            )}
            {involved && (
              <button type="button" disabled={busy} onClick={toggleArchive} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${head ? '' : 'mr-auto'} ${letter.archived ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300'}`} data-ic-archive>
                {letter.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {letter.archived ? 'خروج از بایگانی' : 'بایگانی'}
              </button>
            )}
          </div>
          <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden" data-ic-sheet>
            <iframe
              title={`نامه ${letter.number}`}
              srcDoc={sheet}
              className="w-full block border-0"
              style={{ height: frameH }}
              onLoad={(e) => {
                try {
                  const d = e.currentTarget.contentDocument;
                  if (d) setFrameH(Math.max(700, Math.min(6000, d.documentElement.scrollHeight + 8)));
                } catch {
                  /* the sheet keeps its default height */
                }
              }}
            />
          </div>

          {letter.status === 'RETURNED' && letter.senderId === currentUser.id && (
            <button type="button" onClick={onEdit} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#6E1B1B] hover:bg-[#561414] text-white text-sm font-black cursor-pointer" data-ic-resend><Undo2 className="w-4 h-4" />اصلاح و ارسال دوباره</button>
          )}

          {(letter.referrals || []).length > 0 && (
            <div className="bg-white rounded-3xl border border-violet-200 p-4 space-y-2" data-ic-referrals>
              <h3 className="flex items-center gap-1.5 text-[12px] font-black text-violet-800"><Share2 className="w-4 h-4" />ارجاع‌ها</h3>
              {(letter.referrals || []).map((x) => (
                <div key={x.id} className="rounded-xl border border-[#EBDBCE] bg-[#FDFAF7] p-2.5 text-[11.5px] leading-6">
                  <div className="font-black text-[#3A241F]">{x.byName} ← {x.toName} <span className={`mr-1 text-[10px] rounded-full px-2 py-0.5 border ${x.status === 'DONE' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{x.status === 'DONE' ? 'اقدام شد' : 'منتظر اقدام'}</span></div>
                  {x.note && <div className="text-[#6B4F47] whitespace-pre-wrap">دستور: {x.note}</div>}
                  {x.paraph && <img src={x.paraph} alt="پاراف" className="mt-1 max-h-16 max-w-full object-contain mix-blend-multiply" />}
                  {x.doneNote && <div className="text-emerald-800 whitespace-pre-wrap">نتیجه: {x.doneNote}</div>}
                  <div className="text-[10px] font-bold text-[#A8928B]">{when(x.at)}{x.doneAt ? ` · انجام: ${when(x.doneAt)}` : ''}</div>
                </div>
              ))}
            </div>
          )}

          {(canAct || canReturn || involved) && (
            <div className="bg-white rounded-3xl border border-[#EBDBCE] p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {canAct && <button type="button" onClick={() => setMode('forward')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'forward' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-800 border-amber-300'}`} data-ic-forward><CornerUpLeft className="w-3.5 h-3.5" />ارسال به بالا</button>}
                {canReturn && <button type="button" onClick={() => setMode('return')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'return' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-300'}`}><Undo2 className="w-3.5 h-3.5" />برگرداندن با دلیل</button>}
                {canRefer && <button type="button" onClick={() => { setMode('refer'); setParaphOpen(true); }} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'refer' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-800 border-violet-300'}`} data-ic-refer><Share2 className="w-3.5 h-3.5" />ارجاع</button>}
                {myPending && <button type="button" onClick={() => setMode('acted')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'acted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-800 border-emerald-300'}`}><UserCheck className="w-3.5 h-3.5" />اقدام شد</button>}
                {involved && <button type="button" onClick={() => setMode('note')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'note' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-800 border-sky-300'}`}><Reply className="w-3.5 h-3.5" />{letter.toId === currentUser.id ? 'پاسخ' : 'یادداشت'}</button>}
              </div>
              {mode === 'forward' && (
                <div className="space-y-2">
                  <PersonPicker title="ارسال برای…" items={fwd.map((p) => ({ id: p.id, name: p.name, sub: p.sub }))} value={to} onChange={setTo} placeholder={fwd.length ? 'مقصد بعدی را انتخاب کنید…' : 'مقصدی در دسترس نیست'} />
                  <textarea className={`${field} min-h-[70px]`} placeholder="توضیح شما برای مقصد بعدی (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !to} onClick={() => run(() => api.icForward(letter.id, { toId: to, note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Send className="w-4 h-4" />ارسال</button>
                </div>
              )}
              {mode === 'refer' && (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-2.5 space-y-2" data-ic-paraph>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-violet-900">پاراف <b className="text-rose-600">(واجب)</b> — دست‌نوشته یا متن</span>
                      <button type="button" onClick={() => setParaphOpen(true)} className="text-[11px] font-black text-violet-700 hover:underline cursor-pointer">{paraph ? 'نوشتن دوباره' : 'پاراف با قلم'}</button>
                    </div>
                    {paraph ? (
                      <div className="flex items-center gap-2">
                        <img src={paraph} alt="پاراف" className="max-h-20 max-w-[70%] object-contain bg-white rounded-xl border border-[#EBDBCE] p-1" />
                        <button type="button" onClick={() => setParaph('')} className="text-[11px] font-black text-rose-600 cursor-pointer">حذف پاراف</button>
                      </div>
                    ) : (
                      <div className="text-[10.5px] font-medium text-[#8C6F66]">با قلم، انگشت یا ماوس دستور یا حرف اول نامتان را بنویسید تا همراه ارجاع برای گیرنده برود.</div>
                    )}
                  </div>
                  <PersonPickerMulti title="ارجاع به…" items={referList.map((p) => ({ id: p.id, name: p.name, sub: p.sub }))} values={referTo} onChange={setReferTo} placeholder={referList.length ? 'یک یا چند نفر را طبق چارت سازمانی انتخاب کنید…' : 'کسی برای ارجاع در دسترس نیست'} />
                  <div className="flex flex-wrap gap-1.5" data-ic-paraph-templates>
                    {templates.map((t) => (
                      <button key={t} type="button" onClick={() => setNote(t)} className={`px-2.5 py-1 rounded-full border text-[10.5px] font-black cursor-pointer ${note === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-800 border-violet-200 hover:bg-violet-50'}`}>{t}</button>
                    ))}
                  </div>
                  {canSub(currentUser, 'ai.paraph') && (
                    <div className="space-y-1.5">
                      <button type="button" disabled={aiBusy} onClick={askAi} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-300 bg-violet-50 text-violet-800 text-[11px] font-black disabled:opacity-60 cursor-pointer" data-ic-ai-paraph><Sparkles className="w-3.5 h-3.5" />{aiBusy ? 'در حال نوشتن…' : 'پیشنهاد هوشمند پاراف'}</button>
                      {aiList.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {aiList.map((t) => (
                            <button key={t} type="button" onClick={() => setNote(t)} className={`px-2.5 py-1 rounded-xl border text-[10.5px] font-bold text-right cursor-pointer ${note === t ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'bg-white text-fuchsia-900 border-fuchsia-200 hover:bg-fuchsia-50'}`}>{t}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <textarea className={`${field} min-h-[70px]`} placeholder="متن پاراف (از قالب‌ها یا پیشنهاد هوشمند انتخاب کنید یا خودتان بنویسید)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || referTo.length === 0 || (!paraph && !note.trim())} onClick={() => run(() => api.icRefer(letter.id, { toIds: referTo, note, ...(paraph ? { paraph } : {}) }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Share2 className="w-4 h-4" />ارجاع به {toPersianDigits(referTo.length)} نفر</button>
                </div>
              )}
              {paraphOpen && <SignaturePadDialog title="پاراف ارجاع" onClose={() => setParaphOpen(false)} onSave={(u) => { setParaph(u); setParaphOpen(false); }} />}
              {mode === 'acted' && (
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[70px]`} placeholder="نتیجهٔ اقدام (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy} onClick={() => run(() => api.icActed(letter.id, { note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><UserCheck className="w-4 h-4" />اقدام انجام شد</button>
                </div>
              )}
              {mode === 'return' && (
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[80px]`} placeholder="دلیل برگرداندن (لازم است)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => api.icReturn(letter.id, { note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Undo2 className="w-4 h-4" />برگرداندن به {letter.senderName}</button>
                </div>
              )}
              {mode === 'note' && (
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[80px]`} placeholder={letter.toId === currentUser.id ? 'پاسخ شما به نامه' : 'یادداشت شما (همهٔ افراد این نامه می‌بینند)'} value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => api.icNote(letter.id, { note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Send className="w-4 h-4" />ثبت</button>
                </div>
              )}
              {err && <div className="text-[11px] font-bold text-rose-600">{err}</div>}
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-[#EBDBCE] p-4 sm:p-5" data-ic-history>
            <h3 className="flex items-center gap-1.5 text-[12px] font-black text-[#6E1B1B] mb-3"><History className="w-4 h-4" />تاریخچهٔ نامه (درختواره)</h3>
            <InternalHistoryTree history={history} />
          </div>
        </aside>
      </div>
    </div>
  );
};

/** Writing (or correcting and resending) an internal letter in the same Word-like editor as the official letters: fonts, sizes, tables, ready-made texts, paper size, letterhead. */
const RichCompose: React.FC<{ resend?: InternalLetter; onClose: () => void; onDone: () => void }> = ({ resend, onClose, onDone }) => {
  const { settings, currentUser, staffList, showToast } = useAppContext();
  const [opt, setOpt] = useState<{ targets: ChainPerson[]; first: string[]; numbers: string[] } | null>(null);
  useEffect(() => {
    api.icOptions().then((r) => setOpt({ targets: r.targets || [], first: r.firstHop || [], numbers: r.numbers || [] })).catch(() => onClose());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const num = useMemo(() => (opt && !resend ? nextFreeLetter({ ...defaultInternalNumbering(), ...(settings.internalNumbering || {}) }, opt.numbers) : null), [opt, resend, settings.internalNumbering]);
  if (!opt) return <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center text-white text-sm font-black" dir="rtl">در حال آماده‌سازی ویرایشگر…</div>;
  const send = async (d: Record<string, unknown>) => {
    const { title, contentHtml, recipientId, note: _note, letterNumber: _ln, attachmentFileName: _a, attachmentFileSize: _b, attachmentFileDataUrl: _c, customFooterNote: _d, ...layout } = d as Record<string, any>;
    // an own uploaded letterhead picture is too big to travel with every letter; the ready-made designs are only a number
    const lh = layout.letterhead as { id?: number; image?: string } | undefined;
    if (lh && (lh.image || !lh.id)) delete layout.letterhead;
    try {
      if (resend) await api.icResend(resend.id, { subject: String(title), html: String(contentHtml), layout, toId: String(recipientId) });
      else await api.icCreate({ subject: String(title), html: String(contentHtml), layout, toId: String(recipientId), ...(num ? { number: num.number, counter: num.n } : {}) });
      showToast(resend ? 'نامه دوباره فرستاده شد.' : 'نامهٔ داخلی فرستاده شد.');
      onDone();
    } catch (e) {
      showToast('ارسال نشد: ' + (e instanceof Error ? e.message : 'خطا'));
    }
  };
  return (
    <LetterEditorModal
      isOpen
      internal={{ targets: opt.targets, number: resend ? resend.number : num?.number || '', toId: resend?.toId, signerName: currentUser.fullName, signerTitle: currentUser.departmentName || 'کارمند', firstHop: opt.first[0], onSend: send }}
      editTransfer={resend ? internalAsTransfer(resend, settings, null) : undefined}
      onClose={onClose}
      staffList={staffList}
      currentUser={currentUser}
      letterNumbering={settings.letterNumbering}
      onSendLetter={() => undefined}
    />
  );
};
