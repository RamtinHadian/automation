import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, MessageSquare, Phone, UserCog } from 'lucide-react';
import { ClaimResolution, ClaimStatus, User, WarrantyClaim } from '../../types';
import { api } from '../../lib/api';
import { formatMoney, fromDisplay, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { CLAIM_STATUS, COVERAGE_TEXT, dayText, NEXT_BUTTON, NEXT_STATUS, RESOLUTION, codeText } from '../../lib/warranty';
import { Modal, field, label } from '../crm/crmUi';
import { PersonPicker, staffItems } from '../common/PersonPicker';

const when = (iso: string) => {
  const d = new Date(iso);
  return toPersianDigits(d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
};

/** One claim: facts, photos, the buttons for the next step, notes and the full history. */
export const ClaimDetail: React.FC<{
  claim: WarrantyClaim;
  isAdmin: boolean;
  staff: User[];
  onClose: () => void;
  onChange: (c: WarrantyClaim) => void;
  onError: (msg: string) => void;
}> = ({ claim, isAdmin, staff, onClose, onChange, onError }) => {
  const [step, setStep] = useState<ClaimStatus | null>(null);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState<ClaimResolution>('REPLACE');
  const [repSerial, setRepSerial] = useState('');
  const [cost, setCost] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  const st = CLAIM_STATUS[claim.status];
  const next = NEXT_STATUS[claim.status].filter((s) => !(claim.status === 'CLOSED' && !isAdmin));
  const run = async (fn: () => Promise<WarrantyClaim>) => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await fn());
      setStep(null);
      setNote('');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const confirmStep = () => {
    if (!step) return;
    if (step === 'REJECTED' && !note.trim()) return onError('دلیل رد درخواست را بنویسید.');
    run(() => api.claimStatus(claim.id, { status: step, note: note.trim(), ...(step === 'RESOLVED' ? { resolution, replacementSerial: repSerial.trim(), cost: fromDisplay(parseInt(cost.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, ''), 10) || 0) } : {}) }));
  };

  return (
    <>
      <Modal
        title={`درخواست گارانتی ${codeText(claim.claimNo)}`}
        onClose={onClose}
        onTop
        wide
        footer={<button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer mr-auto">بستن</button>}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full border text-[11px] font-black ${st.cls}`}>{st.label}</span>
          {claim.coverage !== 'IN' && (
            <span className="px-3 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-black flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{COVERAGE_TEXT[claim.coverage]}</span>
          )}
          {claim.resolution && <span className="px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-black">{RESOLUTION[claim.resolution]}</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {([
            ['مشتری', claim.customerName],
            ['کالا', claim.productName + (claim.productCode ? ` (${toPersianDigits(claim.productCode)})` : '')],
            ['سریال', claim.serial ? toPersianDigits(claim.serial) : '—'],
            ['شمارهٔ گارانتی', codeText(claim.warrantyNo)],
            ['تاریخ گزارش', dayText(claim.reportedAt)],
            ['خودرو', [claim.vehicle?.model, claim.vehicle?.plate ? `پلاک ${toPersianDigits(claim.vehicle.plate)}` : '', claim.vehicle?.km ? `${toPersianDigits(claim.vehicle.km)} کیلومتر` : ''].filter(Boolean).join(' · ') || '—'],
            ['مسئول پیگیری', claim.handlerName || 'تعیین نشده'],
            ['ثبت‌کننده', claim.createdByName],
            ...(claim.replacementSerial ? [['سریال کالای جایگزین', toPersianDigits(claim.replacementSerial)] as [string, string]] : []),
            ...(claim.cost ? [['هزینه', `${formatMoney(claim.cost)} ${unitName()}`] as [string, string]] : []),
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex gap-2"><span className="text-[#8C6F66] shrink-0 w-28">{k}:</span><span className="font-bold text-[#3A241F]">{v}</span></div>
          ))}
          {claim.customerPhone && (
            <a href={`tel:${claim.customerPhone}`} className="flex items-center gap-1.5 text-teal-700 font-black text-[11px] hover:underline sm:col-span-2" dir="ltr"><Phone className="w-3.5 h-3.5" />{toPersianDigits(claim.customerPhone)}</a>
          )}
        </div>

        <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3.5">
          <div className="text-[11px] font-black text-[#8C6F66] mb-1">شرح خرابی</div>
          <p className="text-xs leading-7 text-[#3A241F] whitespace-pre-wrap">{claim.description}</p>
        </div>

        {claim.photos && claim.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {claim.photos.map((p, i) => (
              <button key={i} type="button" onClick={() => setPhoto(p)} className="w-24 h-24 rounded-xl overflow-hidden border border-[#EBDBCE] cursor-pointer"><img src={p} alt="" className="w-full h-full object-cover" /></button>
            ))}
          </div>
        )}

        {next.length > 0 && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-3.5 space-y-3" data-claim-actions>
            <div className="text-[11px] font-black text-teal-900">مرحلهٔ بعد</div>
            <div className="flex flex-wrap gap-2">
              {next.map((s) => (
                <button key={s} type="button" onClick={() => setStep(step === s ? null : s)} className={`px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl border text-xs font-black cursor-pointer ${step === s ? 'bg-teal-600 text-white border-teal-600' : s === 'REJECTED' ? 'bg-white text-rose-700 border-rose-200' : 'bg-white text-teal-800 border-teal-200'}`}>
                  {claim.status === 'CLOSED' ? 'باز کردن دوباره' : s === 'REVIEW' && claim.status === 'REJECTED' ? 'بررسی دوباره' : NEXT_BUTTON[s]}
                </button>
              ))}
            </div>
            {step === 'RESOLVED' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={label}>چه اقدامی شد؟ *</label>
                  <select className={field} value={resolution} onChange={(e) => setResolution(e.target.value as ClaimResolution)}>
                    {(Object.keys(RESOLUTION) as ClaimResolution[]).map((k) => <option key={k} value={k}>{RESOLUTION[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>سریال کالای جایگزین</label>
                  <input className={field} dir="ltr" value={repSerial} onChange={(e) => setRepSerial(e.target.value)} />
                </div>
                <div>
                  <label className={label}>هزینه برای شرکت ({unitName()})</label>
                  <input className={field} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
                </div>
              </div>
            )}
            {step && (
              <>
                <textarea className={`${field} min-h-[56px] leading-6`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={step === 'REJECTED' ? 'دلیل رد درخواست را بنویسید (به مشتری گفته می‌شود) *' : 'توضیح (اختیاری)'} />
                <button type="button" onClick={confirmStep} disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-black cursor-pointer">
                  <CheckCircle2 className="w-4 h-4" />
                  تأیید و ثبت در سابقه
                </button>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>مسئول پیگیری</label>
            <div className="flex gap-2">
              <PersonPicker title="مسئول پیگیری" items={staffItems(staff)} value={claim.handlerId || ''} onChange={(id) => run(() => api.claimAssign(claim.id, id))} emptyLabel="(تعیین نشده)" />
              <span className="self-center text-[#8C6F66]"><UserCog className="w-4 h-4" /></span>
            </div>
          </div>
          <div>
            <label className={label}>یادداشت تازه</label>
            <div className="flex gap-2">
              <input className={field} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && run(async () => { const c = await api.claimNote(claim.id, text.trim()); setText(''); return c; })} placeholder="مثلاً با مشتری تماس گرفته شد" />
              <button type="button" disabled={!text.trim() || busy} onClick={() => run(async () => { const c = await api.claimNote(claim.id, text.trim()); setText(''); return c; })} className="shrink-0 px-3 rounded-xl bg-white border border-[#EBDBCE] text-teal-700 disabled:opacity-50 cursor-pointer" aria-label="ثبت یادداشت"><MessageSquare className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-black text-xs text-[#3A241F] flex items-center gap-1.5"><Clock className="w-4 h-4 text-[#8C6F66]" />تاریخچهٔ کامل</h4>
          <div className="space-y-2">
            {[...(claim.log || [])].reverse().map((e, i) => (
              <div key={i} className="flex gap-2.5 bg-white border border-[#EBDBCE] rounded-xl px-3 py-2.5">
                <span className={`mt-0.5 shrink-0 h-fit text-[10px] font-black px-2 py-0.5 rounded-full border ${e.to ? CLAIM_STATUS[e.to].cls : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {e.kind === 'status' || e.kind === 'create' ? CLAIM_STATUS[e.to as ClaimStatus]?.label : e.kind === 'assign' ? 'مسئول' : 'یادداشت'}
                </span>
                <div className="min-w-0 flex-1">
                  {e.note && <p className="text-xs leading-6 text-[#3A241F] whitespace-pre-wrap">{e.note}</p>}
                  <div className="text-[10px] text-[#8C6F66] font-bold flex flex-wrap gap-x-3">
                    <span>{e.byName}</span>
                    <span>{when(e.at)}</span>
                    {e.resolution && <span>{RESOLUTION[e.resolution]}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      {photo && (
        <div className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center p-3" onClick={() => setPhoto(null)}>
          <img src={photo} alt="" className="max-w-full max-h-full rounded-xl" />
        </div>
      )}
    </>
  );
};
