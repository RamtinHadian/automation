import React, { useEffect, useRef, useState } from 'react';
import { toPersianDigits } from '../../lib/jalali';

// Colours: the validated categorical order (blue, orange, aqua, yellow, magenta, green, violet, red) and one blue ramp for ordered stages.
export const C = {
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  magenta: '#e87ba4',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948',
};
export const SERIES = [C.blue, C.orange, C.aqua, C.yellow, C.magenta, C.green, C.violet, C.red];
export const RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const INK = '#3A241F';
const MUTED = '#8C6F66';
const GRID = '#EBDBCE';
const SURFACE = '#ffffff';

export const fa = (n: number) => toPersianDigits(new Intl.NumberFormat('en-US').format(Math.round(n)));

/** 12 500 000 → «۱۲٫۵ میلیون» */
export function compact(n: number): string {
  const a = Math.abs(n);
  const f = (x: number) => toPersianDigits((Math.round(x * 10) / 10).toString().replace('.', '٫'));
  if (a >= 1e9) return `${f(n / 1e9)} میلیارد`;
  if (a >= 1e6) return `${f(n / 1e6)} میلیون`;
  if (a >= 1e3) return `${f(n / 1e3)} هزار`;
  return fa(n);
}

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(220, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export const ChartCard: React.FC<{ title: string; subtitle?: string; legend?: { label: string; color: string }[]; children: React.ReactNode; className?: string }> = ({ title, subtitle, legend, children, className = '' }) => (
  <section className={`bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 flex flex-col gap-3 ${className}`}>
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h4 className="font-black text-[13px] text-[#3A241F]">{title}</h4>
        {subtitle && <p className="text-[11px] text-[#8C6F66] mt-0.5">{subtitle}</p>}
      </div>
      {legend && legend.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[#52514e]">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
    {children}
  </section>
);

export const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'plain'; accent: string }> = ({ icon, label, value, sub, tone = 'plain', accent }) => (
  <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-4 flex items-start gap-3">
    <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ background: accent }}>
      {icon}
    </span>
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-[#8C6F66]">{label}</div>
      <div className="text-xl font-black text-[#3A241F] leading-tight">{value}</div>
      {sub && <div className={`text-[10px] font-bold mt-0.5 ${tone === 'good' ? 'text-[#006300]' : tone === 'bad' ? 'text-[#d03b3b]' : 'text-[#8C6F66]'}`}>{sub}</div>}
    </div>
  </div>
);

// ---------------- line / area chart over time (newest on the left, like the Persian reading direction) ----------------

export interface Line {
  name: string;
  color: string;
  values: number[];
}

export const TrendChart: React.FC<{ labels: string[]; series: Line[]; height?: number; unit?: string }> = ({ labels, series, height = 220, unit = '' }) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const max = niceMax(Math.max(4, ...series.flatMap((s) => s.values)));
  // index 0 (the oldest day) sits on the right
  const x = (i: number) => padL + plotW * (n <= 1 ? 0.5 : 1 - i / (n - 1));
  const y = (v: number) => padT + plotH * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 62))));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round((1 - px) * (n - 1)))));
  };
  return (
    <div ref={ref} className="relative" dir="ltr">
      <svg width={w} height={height} role="img" aria-label="نمودار روند">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={MUTED}>{toPersianDigits(Math.round(t * 10) / 10)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % labelEvery === 0 || i === n - 1 ? <text key={i} x={x(i)} y={height - 7} textAnchor="middle" fontSize={10} fill={MUTED}>{l}</text> : null))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
          const area = `M ${x(0)},${y(0)} L ${pts.join(' L ')} L ${x(n - 1)},${y(0)} Z`;
          return (
            <g key={s.name}>
              {si === 0 && <path d={area} fill={s.color} opacity={0.1} />}
              <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
            ))}
          </g>
        )}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div
          dir="rtl"
          className="pointer-events-none absolute z-10 rounded-xl bg-[#3A241F] text-white text-[11px] px-3 py-2 shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 60, 0), w - 140), top: 0 }}
        >
          <div className="font-black mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              {s.name}: <b>{toPersianDigits(s.values[hover])}</b>
              {unit}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------- columns (optionally stacked) ----------------

export const Columns: React.FC<{ labels: string[]; series: Line[]; stacked?: boolean; height?: number; format?: (n: number) => string }> = ({ labels, series, stacked, height = 220, format = (v) => toPersianDigits(v) }) => {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const padL = 40;
  const padR = 8;
  const padT = 12;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map((x) => x.values[i]))));
  const max = niceMax(Math.max(4, ...totals));
  const band = plotW / Math.max(1, n);
  const bw = Math.min(30, band * (stacked ? 0.55 : 0.7 / Math.max(1, series.length)) * (stacked ? 1 : series.length));
  const per = stacked ? bw : bw / series.length;
  const y = (v: number) => padT + plotH * (1 - v / max);
  const bx = (i: number) => padL + plotW - band * (i + 0.5); // oldest on the right
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 56))));
  return (
    <div ref={ref} className="relative" dir="ltr">
      <svg width={w} height={height} role="img" aria-label="نمودار ستونی">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={MUTED}>{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % labelEvery === 0 ? <text key={i} x={bx(i)} y={height - 7} textAnchor="middle" fontSize={10} fill={MUTED}>{l}</text> : null))}
        {labels.map((_, i) => {
          let acc = 0;
          return (
            <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
              {series.map((s, si) => {
                const v = s.values[i];
                if (v <= 0) return null;
                const h = Math.max(2, plotH * (v / max));
                const top = stacked ? y(acc + v) : y(v);
                const left = stacked ? bx(i) - bw / 2 : bx(i) - bw / 2 + si * per;
                acc += v;
                const isTop = !stacked || si === series.length - 1 || series.slice(si + 1).every((q) => q.values[i] <= 0);
                const r = Math.min(4, per / 2);
                return <path key={s.name} d={`M ${left},${top + h} L ${left},${top + (isTop ? r : 0)} ${isTop ? `Q ${left},${top} ${left + r},${top} L ${left + per - r},${top} Q ${left + per},${top} ${left + per},${top + r}` : `L ${left + per},${top}`} L ${left + per},${top + h} Z`} fill={s.color} stroke={SURFACE} strokeWidth={stacked ? 2 : 0} />;
              })}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={bx(i) - band / 2} y={padT} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && (
        <div dir="rtl" className="pointer-events-none absolute z-10 rounded-xl bg-[#3A241F] text-white text-[11px] px-3 py-2 shadow-lg" style={{ left: Math.min(Math.max(bx(hover) - 60, 0), w - 150), top: 0 }}>
          <div className="font-black mb-1">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              {s.name}: <b>{format(s.values[hover])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------- horizontal bars (rankings, funnel, load per person) ----------------

export interface HRow {
  label: string;
  segments: { value: number; color: string; name?: string }[];
  note?: string;
}

export const HBars: React.FC<{ rows: HRow[]; format?: (n: number) => string; empty?: string }> = ({ rows, format = (v) => toPersianDigits(v), empty = 'داده‌ای برای نمایش نیست.' }) => {
  if (rows.length === 0 || rows.every((r) => r.segments.every((s) => s.value === 0))) return <div className="py-10 text-center text-xs font-bold text-gray-400">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const total = r.segments.reduce((s, x) => s + x.value, 0);
        return (
          <div key={r.label} className="flex items-center gap-3 text-[11px]">
            <div className="w-28 shrink-0 font-bold text-[#3A241F] truncate" title={r.label}>{r.label}</div>
            <div className="flex-1 h-5 flex items-center" dir="rtl">
              <div className="flex gap-[2px] h-full items-stretch" style={{ width: `${Math.max(2, (total / max) * 100)}%` }}>
                {r.segments.filter((s) => s.value > 0).map((s, i, a) => (
                  <div key={i} title={`${s.name || r.label}: ${format(s.value)}`} className="h-full" style={{ flex: s.value, background: s.color, borderRadius: i === a.length - 1 ? '2px 6px 6px 2px' : '2px', minWidth: 3 }} />
                ))}
              </div>
            </div>
            <div className="w-24 shrink-0 text-left font-black text-[#3A241F]" dir="rtl">
              {format(total)}
              {r.note && <span className="block text-[10px] font-bold text-[#8C6F66]">{r.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------- donut ----------------

export const Donut: React.FC<{ data: { label: string; value: number; color: string }[]; centerLabel?: string; size?: number }> = ({ data, centerLabel = 'کل', size = 150 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  if (total === 0) return <div className="py-10 text-center text-xs font-bold text-gray-400">داده‌ای برای نمایش نیست.</div>;
  return (
    <div className="flex items-center gap-5 flex-wrap justify-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="نمودار دایره‌ای">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {data.map((d, i) => {
              const len = (d.value / total) * circ;
              const seg = (
                <circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={hover === i ? 24 : 20}
                  strokeDasharray={`${Math.max(0, len - 2)} ${circ}`}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  style={{ transition: 'stroke-width .12s' }}
                />
              );
              offset += len;
              return d.value > 0 ? seg : null;
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xl font-black text-[#3A241F]">{toPersianDigits(hover !== null ? data[hover].value : total)}</div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{hover !== null ? data[hover].label : centerLabel}</div>
        </div>
      </div>
      <div className="space-y-1.5 text-[11px] min-w-36">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: d.color }} />
            <span className="font-bold text-[#3A241F] flex-1">{d.label}</span>
            <span className="font-black text-[#3A241F]">{toPersianDigits(d.value)}</span>
            <span className="text-[#8C6F66] w-9 text-left">{toPersianDigits(Math.round((d.value / total) * 100))}٪</span>
          </div>
        ))}
      </div>
    </div>
  );
};
