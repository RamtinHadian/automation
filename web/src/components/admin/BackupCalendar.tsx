import React from 'react';
import { CalendarClock, Clock, Repeat } from 'lucide-react';
import { BackupSettings } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { isoToJalaliParts, JALALI_MONTHS } from '../../lib/taskDates';
import { isoDay } from '../../lib/adminStats';

// stored like JS getDay(): 0 = Sunday ... 6 = Saturday; shown starting from Saturday
const DAYS: { n: number; label: string; short: string }[] = [
  { n: 6, label: 'شنبه', short: 'ش' },
  { n: 0, label: 'یکشنبه', short: 'ی' },
  { n: 1, label: 'دوشنبه', short: 'د' },
  { n: 2, label: 'سه‌شنبه', short: 'س' },
  { n: 3, label: 'چهارشنبه', short: 'چ' },
  { n: 4, label: 'پنجشنبه', short: 'پ' },
  { n: 5, label: 'جمعه', short: 'ج' },
];
const WEEKDAY = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const EVERY = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720];
const select = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

const toMin = (t: string) => {
  const [h, m] = t.split(':');
  return (parseInt(h) || 0) * 60 + (parseInt(m) || 0);
};
const fmt = (min: number) => toPersianDigits(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
const everyLabel = (m: number) => (m < 60 ? `هر ${toPersianDigits(m)} دقیقه` : m % 60 === 0 ? `هر ${toPersianDigits(m / 60)} ساعت` : `هر ${toPersianDigits(m / 60)} ساعت`.replace('.', '٫'));

/** What the schedule means as plain numbers (the saved modes «daily» / «interval» are shown as the same calendar). */
export function scheduleView(cfg: BackupSettings) {
  const days = cfg.scheduleDays?.length ? cfg.scheduleDays : [0, 1, 2, 3, 4, 5, 6];
  if (cfg.scheduleMode === 'window') {
    const from = toMin(cfg.scheduleFrom || '08:00');
    const to = Math.max(from, toMin(cfg.scheduleTo || '18:00'));
    return { kind: 'window' as const, days, from, to, every: cfg.scheduleEveryMinutes || 60 };
  }
  if (cfg.scheduleMode === 'interval') {
    return { kind: 'window' as const, days, from: 0, to: 23 * 60 + 55, every: (cfg.scheduleEveryHours || 6) * 60 };
  }
  return { kind: 'daily' as const, days, from: toMin(cfg.scheduleTime || '02:00'), to: toMin(cfg.scheduleTime || '02:00'), every: 0 };
}

const runsOfDay = (v: ReturnType<typeof scheduleView>): number[] => {
  if (v.kind === 'daily') return [v.from];
  const out: number[] = [];
  for (let m = v.from; m <= v.to; m += v.every) out.push(m);
  return out;
};

const HourSelect: React.FC<{ value: number; onChange: (min: number) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="flex items-center gap-1.5" dir="ltr">
    <select value={Math.floor(value / 60)} onChange={(e) => onChange(parseInt(e.target.value) * 60 + (value % 60))} className={select} aria-label={`${label} (ساعت)`}>
      {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{toPersianDigits(String(h).padStart(2, '0'))}</option>)}
    </select>
    <span className="font-black text-[#3A241F]">:</span>
    <select value={value % 60} onChange={(e) => onChange(Math.floor(value / 60) * 60 + parseInt(e.target.value))} className={select} aria-label={`${label} (دقیقه)`}>
      {Array.from({ length: 12 }, (_, m) => m * 5).map((m) => <option key={m} value={m}>{toPersianDigits(String(m).padStart(2, '0'))}</option>)}
    </select>
  </div>
);

const cellColor = (n: number) => (n === 0 ? '' : n === 1 ? '#BFE8D3' : n === 2 ? '#7FD1A8' : n <= 4 ? '#34B37B' : '#0E8F5B');

/** A weekly calendar for automatic backups: pick the days, a time window and how often; the grid and the list of next runs show what will happen. */
export const BackupCalendar: React.FC<{ cfg: BackupSettings; set: (p: Partial<BackupSettings>) => void; lastSize?: number }> = ({ cfg, set, lastSize }) => {
  const v = scheduleView(cfg);
  const runs = runsOfDay(v);
  const today = new Date().getDay();
  const full = (p: Partial<BackupSettings>) =>
    set({
      scheduleMode: v.kind === 'daily' ? 'daily' : 'window',
      scheduleTime: cfg.scheduleTime || '02:00',
      scheduleFrom: `${String(Math.floor(v.from / 60)).padStart(2, '0')}:${String(v.from % 60).padStart(2, '0')}`,
      scheduleTo: `${String(Math.floor(v.to / 60)).padStart(2, '0')}:${String(v.to % 60).padStart(2, '0')}`,
      scheduleEveryMinutes: v.every || 60,
      ...p,
    });
  const toggleDay = (n: number) => full({ scheduleDays: v.days.includes(n) ? v.days.filter((x) => x !== n) : [...v.days, n] });
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // how many runs fall into each hour of a day
  const perHour = Array.from({ length: 24 }, () => 0);
  runs.forEach((m) => { perHour[Math.min(23, Math.floor(m / 60))]++; });

  // next runs
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next: { when: string }[] = [];
  for (let d = 0; d < 14 && next.length < 6; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    if (!v.days.includes(day.getDay())) continue;
    for (const m of runs) {
      if (d === 0 && m <= nowMin) continue;
      const p = isoToJalaliParts(isoDay(day));
      next.push({ when: `${WEEKDAY[day.getDay()]} ${p ? `${toPersianDigits(p[2])} ${JALALI_MONTHS[p[1] - 1]}` : ''} — ساعت ${fmt(m)}` });
      if (next.length >= 6) break;
    }
  }

  const activeDays = DAYS.filter((d) => v.days.includes(d.n));
  const perDay = runs.length;
  const copies30 = Math.round((30 * v.days.length) / 7) * perDay;
  const sizeText = lastSize ? (() => { const b = copies30 * lastSize; return b >= 1073741824 ? `حدود ${toPersianDigits((b / 1073741824).toFixed(1))} گیگابایت` : `حدود ${toPersianDigits(Math.max(1, Math.round(b / 1048576)))} مگابایت`; })() : '';
  const summary =
    v.days.length === 0
      ? 'هیچ روزی انتخاب نشده است.'
      : `${v.days.length === 7 ? 'هر روز' : activeDays.map((d) => d.label).join('، ')}، ${v.kind === 'daily' ? `ساعت ${fmt(v.from)} یک نسخه` : `از ساعت ${fmt(v.from)} تا ${fmt(v.to)}، ${everyLabel(v.every)} یک نسخه (${toPersianDigits(perDay)} نسخه در روز)`}.`;

  return (
    <div className="space-y-4">
      {/* mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {([['daily', 'یک بار در روز', 'در ساعت مشخص، مثلاً هر شب ۲:۰۰', Clock], ['window', 'چند بار در روز', 'از ساعت فلان تا ساعت فلان، هر چند وقت یک‌بار', Repeat]] as const).map(([m, t, hint, Icon]) => {
          const on = v.kind === m;
          return (
            <button key={m} type="button" onClick={() => (m === 'window' && v.kind === 'daily' ? full({ scheduleMode: 'window', scheduleFrom: '08:00', scheduleTo: '18:00', scheduleEveryMinutes: 60 }) : full({ scheduleMode: m }))} className={`flex items-center gap-3 p-3 rounded-2xl border text-right cursor-pointer transition-colors ${on ? 'bg-[#FBEFEA] border-[#D34A32]' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${on ? 'bg-[#6E1B1B]' : 'bg-[#B9A9A2]'}`}><Icon className="w-[18px] h-[18px]" /></span>
              <span>
                <span className="block font-black text-[12px] text-[#3A241F]">{t}</span>
                <span className="block text-[10px] text-[#8C6F66] leading-4">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* time controls */}
      {v.kind === 'daily' ? (
        <div className="max-w-xs">
          <label className={lab}>ساعت پشتیبان‌گیری</label>
          <HourSelect label="ساعت" value={v.from} onChange={(m) => full({ scheduleTime: hhmm(m) })} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={lab}>از ساعت</label>
            <HourSelect label="از" value={v.from} onChange={(m) => full({ scheduleFrom: hhmm(m), scheduleTo: hhmm(Math.max(m, v.to)) })} />
          </div>
          <div>
            <label className={lab}>تا ساعت</label>
            <HourSelect label="تا" value={v.to} onChange={(m) => full({ scheduleTo: hhmm(Math.max(m, v.from)) })} />
          </div>
          <div>
            <label className={lab}>هر چند وقت یک‌بار</label>
            <select value={EVERY.includes(v.every) ? v.every : 60} onChange={(e) => full({ scheduleEveryMinutes: parseInt(e.target.value) })} className={select} aria-label="فاصله">
              {EVERY.map((m) => <option key={m} value={m}>{everyLabel(m)}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* weekly calendar */}
      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF8] p-3 overflow-x-auto">
        <div className="min-w-[300px]">
          <div className="flex items-end gap-1.5 mb-1.5" dir="rtl">
            <div className="w-[60px] shrink-0" />
            <div className="flex-1 flex" dir="rtl">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] font-bold text-[#8C6F66] leading-3">{h % 3 === 0 ? toPersianDigits(h) : ''}</div>
              ))}
            </div>
          </div>
          {DAYS.map((d) => {
            const on = v.days.includes(d.n);
            const isToday = d.n === today;
            return (
              <div key={d.n} className="flex items-center gap-1.5 mb-1" dir="rtl">
                <button type="button" onClick={() => toggleDay(d.n)} title={on ? 'کلیک برای حذف این روز' : 'کلیک برای افزودن این روز'} className={`w-[60px] shrink-0 flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-black cursor-pointer border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                  <span>{d.label}</span>
                  {isToday && <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-white' : 'bg-[#D34A32]'}`} title="امروز" />}
                </button>
                <div className="flex-1 flex gap-[2px]" dir="rtl">
                  {perHour.map((n, h) => {
                    const c = on ? cellColor(n) : '';
                    return (
                      <div
                        key={h}
                        title={on ? (n ? `${d.label}، ساعت ${toPersianDigits(h)}: ${toPersianDigits(n)} نسخه` : `${d.label}، ساعت ${toPersianDigits(h)}: بدون پشتیبان‌گیری`) : `${d.label}: خاموش`}
                        className="flex-1 h-7 rounded-[5px] border"
                        style={{ background: c || (on ? '#F3EAE3' : '#F8F4F1'), borderColor: c ? 'transparent' : '#EBDBCE', outline: isToday && h === now.getHours() ? '2px solid #D34A32' : undefined, outlineOffset: -1 }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-end gap-2 mt-2 text-[10px] font-bold text-[#8C6F66]" dir="rtl">
            <span>تعداد نسخه در هر ساعت:</span>
            {[1, 2, 3, 5].map((n) => (
              <span key={n} className="flex items-center gap-1"><span className="w-3 h-3 rounded-[4px]" style={{ background: cellColor(n) }} />{toPersianDigits(n === 5 ? '۵+' : n)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* summary */}
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-[12px] leading-7 text-emerald-900 font-bold flex items-start gap-2">
        <CalendarClock className="w-4 h-4 mt-1.5 shrink-0" />
        <div>
          {summary}
          {sizeText && v.days.length > 0 && <div className={`text-[11px] ${copies30 > 300 ? 'text-amber-800' : 'text-emerald-800'} font-semibold`}>در ۳۰ روز حدود {toPersianDigits(copies30)} نسخه روی سرور می‌ماند ({sizeText}، با حجم آخرین نسخه حساب شده).</div>}
        </div>
      </div>

      {next.length > 0 && (
        <div>
          <div className="text-[11px] font-black text-[#3A241F] mb-1.5">اجراهای بعدی</div>
          <div className="flex flex-wrap gap-1.5">
            {next.map((n, i) => (
              <span key={i} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${i === 0 ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{n.when}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
