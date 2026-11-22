import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Filter, ListChecks, Search, Users, X } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';

export interface DetailRecord {
  id: string;
  title: string;
  sub?: string;
  /** the employee it belongs to (the filter of the employee tab matches this name) */
  person?: string;
  date?: string;
  tag?: string;
  tone?: 'good' | 'bad' | 'info' | 'warn';
  value?: string;
}
export interface DetailPerson {
  name: string;
  count: number;
  /** a second number (a sum of money, hours…) shown beside the count */
  valueText?: string;
}
export interface DetailSpec {
  title: string;
  subtitle?: string;
  accent: string;
  icon: React.ReactNode;
  big: string;
  bigLabel: string;
  chips?: { label: string; value: string }[];
  chart?: React.ReactNode;
  chartTitle?: string;
  chartSub?: string;
  people?: DetailPerson[];
  peopleTitle?: string;
  countLabel?: string;
  valueLabel?: string;
  records?: DetailRecord[];
  recordsTitle?: string;
}

const TONE: Record<NonNullable<DetailRecord['tone']>, string> = {
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  bad: 'bg-rose-50 text-rose-800 border-rose-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
};

const darker = (hex: string) => `color-mix(in srgb, ${hex} 72%, #0b1020)`;

/**
 * The detail page of a number or a chart of the management reports: a page over everything, with the figure large on a coloured head, the chart in
 * full size, the same numbers per employee (who did how much; pressing a person shows his own items) and the list of the items behind the number.
 */
export const ReportDetail: React.FC<{
  spec: DetailSpec;
  ranges?: { days: number; label: string }[];
  range?: number;
  onRange?: (d: number) => void;
  onClose: () => void;
}> = ({ spec, ranges, range, onRange, onClose }) => {
  const hasPeople = !!spec.people && spec.people.length > 0;
  const hasRecords = !!spec.records;
  const [tab, setTab] = useState<'overview' | 'people' | 'records'>('overview');
  const [person, setPerson] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const maxCount = Math.max(1, ...(spec.people || []).map((p) => p.count));
  const totalCount = (spec.people || []).reduce((s, p) => s + p.count, 0);
  const records = useMemo(() => {
    const needle = q.trim();
    return (spec.records || []).filter((r) => (!person || r.person === person) && (!needle || `${r.title} ${r.sub || ''} ${r.person || ''}`.includes(needle)));
  }, [spec.records, person, q]);

  const tabs: [typeof tab, string, React.ReactNode, boolean][] = [
    ['overview', 'نمای کلی', <BarChart3 key="a" className="w-4 h-4" />, true],
    ['people', 'به تفکیک کارمند', <Users key="b" className="w-4 h-4" />, hasPeople],
    ['records', 'فهرست موردها', <ListChecks key="c" className="w-4 h-4" />, hasRecords],
  ];

  return (
    <div className="fixed inset-0 z-[85] bg-[#F4F1EC] overflow-y-auto report-detail-in" dir="rtl" data-report-detail onClick={(e) => e.stopPropagation()}>
      <div className="relative text-white" style={{ background: `linear-gradient(135deg, ${spec.accent} 0%, ${darker(spec.accent)} 100%)` }}>
        <div className="absolute inset-0 opacity-[0.12] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 12% 20%, #fff 0, transparent 38%), radial-gradient(circle at 88% 80%, #fff 0, transparent 34%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-6 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white/15 hover:bg-white/25 backdrop-blur cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت به گزارشات</button>
            <span className="flex-1" />
            {ranges && onRange && (
              <div className="flex items-center gap-1 bg-white/15 backdrop-blur rounded-xl p-1">
                {ranges.map((r) => (
                  <button key={r.days} type="button" onClick={() => onRange(r.days)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer ${range === r.days ? 'bg-white text-[#3A241F] shadow' : 'text-white/90 hover:bg-white/15'}`}>{r.label}</button>
                ))}
              </div>
            )}
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <span className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 [&>svg]:w-7 [&>svg]:h-7">{spec.icon}</span>
            <div className="min-w-0 flex-1">
              <h2 className="font-black text-xl sm:text-2xl leading-tight">{spec.title}</h2>
              {spec.subtitle && <p className="text-[12px] text-white/80 mt-1">{spec.subtitle}</p>}
            </div>
            <div className="text-left">
              <div className="text-[11px] font-bold text-white/80">{spec.bigLabel}</div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight">{spec.big}</div>
            </div>
          </div>
          {spec.chips && spec.chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {spec.chips.map((c) => (
                <span key={c.label} className="px-3.5 py-2 rounded-2xl bg-white/15 backdrop-blur border border-white/20 text-[11.5px] font-bold">
                  <span className="text-white/75">{c.label}: </span>
                  <span className="font-black">{c.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-5 pb-10 space-y-4">
        <div className="flex items-center gap-1.5 bg-white rounded-2xl border border-[#EBDBCE] shadow-sm p-1.5 w-fit max-w-full overflow-x-auto">
          {tabs.filter((t) => t[3]).map(([id, label, icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-black whitespace-nowrap cursor-pointer transition-colors ${tab === id ? 'text-white shadow' : 'text-[#6B4F47] hover:bg-[#FAF5F1]'}`} style={tab === id ? { background: spec.accent } : undefined}>
              {icon}
              {label}
            </button>
          ))}
        </div>

        {person && (
          <div className="flex items-center gap-2 text-[11.5px] font-black text-[#3A241F]">
            <Filter className="w-3.5 h-3.5" />
            فقط «{person}»
            <button type="button" onClick={() => setPerson('')} className="px-2.5 py-1 rounded-full bg-white border border-[#EBDBCE] text-[#8C6F66] hover:text-rose-600 cursor-pointer">برداشتن فیلتر</button>
          </div>
        )}

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {spec.chart && (
              <section className={`bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-3 ${hasPeople ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
                {spec.chartTitle && (
                  <div>
                    <h3 className="font-black text-[13px] text-[#3A241F]">{spec.chartTitle}</h3>
                    {spec.chartSub && <p className="text-[11px] text-[#8C6F66] mt-0.5">{spec.chartSub}</p>}
                  </div>
                )}
                {spec.chart}
              </section>
            )}
            {hasPeople && (
              <section className={`bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-3 ${spec.chart ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
                <h3 className="font-black text-[13px] text-[#3A241F]">{spec.peopleTitle || 'کارمندان'}</h3>
                <PeopleBars people={(spec.people || []).slice(0, 8)} max={maxCount} total={totalCount} accent={spec.accent} onPick={(n) => { setPerson(n); if (hasRecords) setTab('records'); else setTab('people'); }} />
                {(spec.people || []).length > 8 && <button type="button" onClick={() => setTab('people')} className="text-[11px] font-black text-[#6E1B1B] hover:underline cursor-pointer">دیدن همهٔ {toPersianDigits((spec.people || []).length)} نفر ←</button>}
              </section>
            )}
            {!spec.chart && !hasPeople && <div className="lg:col-span-5 bg-white rounded-3xl border border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]">برای نمایش در این بخش داده‌ای نیست.</div>}
          </div>
        )}

        {tab === 'people' && hasPeople && (
          <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden" data-detail-people>
            <div className="grid grid-cols-[2rem_1fr_6rem_7rem_9rem] gap-2 px-4 py-2.5 bg-[#FAF5F1] text-[10.5px] font-black text-[#8C6F66]">
              <span>#</span><span>کارمند</span><span className="text-center">{spec.countLabel || 'تعداد'}</span><span className="text-center">{spec.valueLabel || ''}</span><span>سهم</span>
            </div>
            {(spec.people || []).map((p, i) => {
              const share = totalCount ? Math.round((p.count / totalCount) * 1000) / 10 : 0;
              return (
                <button key={p.name} type="button" onClick={() => { setPerson(p.name); if (hasRecords) setTab('records'); }} className="w-full grid grid-cols-[2rem_1fr_6rem_7rem_9rem] gap-2 px-4 py-3 items-center text-right border-t border-[#F0E6DC] hover:bg-[#FDFAF7] cursor-pointer">
                  <span className="text-[11px] font-black text-[#8C6F66]">{toPersianDigits(i + 1)}</span>
                  <span className="text-[12.5px] font-black text-[#3A241F] truncate">{p.name}</span>
                  <span className="text-center text-[12.5px] font-black" style={{ color: spec.accent }}>{toPersianDigits(p.count)}</span>
                  <span className="text-center text-[11.5px] font-bold text-[#52514e]">{p.valueText || '—'}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 h-2 rounded-full bg-[#F1EAE3] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(3, (p.count / maxCount) * 100)}%`, background: spec.accent }} /></span>
                    <span className="text-[10.5px] font-bold text-[#8C6F66] w-10 text-left">{toPersianDigits(share)}٪</span>
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {tab === 'records' && hasRecords && (
          <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-4 sm:p-5 space-y-3" data-detail-records>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="font-black text-[13px] text-[#3A241F] flex-1">{spec.recordsTitle || 'فهرست'} <span className="text-[#8C6F66] font-bold">({toPersianDigits(records.length)})</span></h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو…" className="pr-8 pl-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] w-48 focus:outline-none focus:border-[#C98B6A]" />
              </div>
            </div>
            {records.length === 0 && <div className="py-10 text-center text-xs font-bold text-[#8C6F66]">موردی پیدا نشد.</div>}
            <div className="divide-y divide-[#F0E6DC]">
              {records.slice(0, 300).map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: spec.accent, opacity: 0.55 }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-black text-[#3A241F] truncate">{r.title}</div>
                    {(r.sub || r.person) && <div className="text-[11px] font-bold text-[#8C6F66] truncate">{[r.person, r.sub].filter(Boolean).join(' · ')}</div>}
                  </div>
                  {r.tag && <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border shrink-0 ${TONE[r.tone || 'info']}`}>{r.tag}</span>}
                  {r.value && <span className="text-[12px] font-black text-[#3A241F] shrink-0">{r.value}</span>}
                  {r.date && <span className="text-[11px] font-bold text-[#A8928B] shrink-0 w-24 text-left">{r.date}</span>}
                </div>
              ))}
            </div>
            {records.length > 300 && <div className="text-center text-[11px] font-bold text-[#8C6F66]">۳۰۰ مورد اول نشان داده شد؛ برای دیدن بقیه جستجو یا فیلتر کنید.</div>}
          </section>
        )}
      </div>
    </div>
  );
};

const PeopleBars: React.FC<{ people: DetailPerson[]; max: number; total: number; accent: string; onPick: (n: string) => void }> = ({ people, max, total, accent, onPick }) => (
  <div className="space-y-2.5">
    {people.map((p) => (
      <button key={p.name} type="button" onClick={() => onPick(p.name)} className="w-full text-right group cursor-pointer">
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="font-black text-[#3A241F] truncate group-hover:underline">{p.name}</span>
          <span className="font-black shrink-0" style={{ color: accent }}>{toPersianDigits(p.count)}{p.valueText ? <span className="text-[#8C6F66] font-bold"> · {p.valueText}</span> : ''}</span>
        </div>
        <div className="h-2.5 rounded-full bg-[#F1EAE3] overflow-hidden mt-1">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, (p.count / max) * 100)}%`, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 70%, #fff))` }} />
        </div>
        <div className="text-[10px] font-bold text-[#A8928B] mt-0.5">{toPersianDigits(total ? Math.round((p.count / total) * 100) : 0)}٪ از کل</div>
      </button>
    ))}
  </div>
);
