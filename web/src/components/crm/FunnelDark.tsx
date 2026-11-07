import React from 'react';
import { toPersianDigits as fa } from '../../lib/jalali';
export interface FunnelRow { id: string; label: string; count: number; amount: string; reached: number; share: number; color: string }

/**
 * The «dark poster» funnel: a black page with a title and a red label, a funnel of five tiers (three reds, two greys) with numbered circles,
 * a column «what happens here» beside it (a rounded headline, a line of explanation, the goal in red), dotted round icons, a panel with the
 * goals of the funnel and a closing strip. All the words are Persian; the numbers come from the opportunities.
 */
const BG = '#ffffff', RED = '#e11d2a';
const HEAD: Record<string, { head: string; desc: string; goal: string }> = {
  NEW: { head: 'مشتری‌ها برای اولین بار شما را می‌شناسند.', desc: 'از راه تبلیغ، شبکه‌های اجتماعی، سایت، محتوا و معرفی دوستان.', goal: 'دیده شدن' },
  CONTACTED: { head: 'مشتری‌ها علاقه نشان می‌دهند و بیشتر یاد می‌گیرند.', desc: 'با شما تماس می‌گیرند، محتوا را می‌بینند و سایت را باز می‌کنند.', goal: 'ساختن اعتماد' },
  PROPOSAL: { head: 'مشتری‌ها راه‌حل شما را بررسی می‌کنند.', desc: 'قیمت‌ها را مقایسه می‌کنند، سؤال می‌پرسند و نظرها را می‌خوانند.', goal: 'انتخاب اول بودن' },
  NEGOTIATION: { head: 'مشتری‌ها اقدام می‌کنند و خریدار می‌شوند.', desc: 'خرید می‌کنند، ثبت‌نام می‌کنند یا قدم بعدی را برمی‌دارند.', goal: 'بستن فروش' },
  WON: { head: 'مشتری‌های راضی، طرفدار وفادار می‌شوند.', desc: 'می‌مانند، دوباره می‌خرند، شما را معرفی می‌کنند و مدافع‌تان می‌شوند.', goal: 'رابطهٔ بلندمدت' },
};
const SUB = ['جذب', 'تعامل', 'پرورش', 'تبدیل', 'وفاداری'];
const P = (d: React.ReactNode) => d;
const TIER_ICON: React.ReactNode[] = [
  P(<><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M6.5 19c.5-3.6 2.6-5.2 5.5-5.2s5 1.6 5.5 5.2zM1.5 18.5c.3-2.4 1.6-3.7 3.6-3.9M22.5 18.5c-.3-2.4-1.6-3.7-3.6-3.9" /></>),
  P(<><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>),
  P(<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.6-7 10-7 10z" fill="#fff" />),
  P(<><path d="M3 4h2.2l2 11h10l2-8H7" /><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>),
  P(<><path d="M20 12a8 8 0 01-14 5.3M4 12a8 8 0 0114-5.3" /><path d="M18 3v4h-4M6 21v-4h4" /></>),
];
const SIDE_ICON: React.ReactNode[] = [
  P(<><path d="M3 10v4h3l7 4V6L6 10z" fill={RED} /><path d="M16 9.5a3.5 3.5 0 010 5M18.5 7a7 7 0 010 10" /></>),
  P(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3.2" fill={RED} /></>),
  P(<><path d="M12 4v16M6 20h12M4 8h16" /><path d="M4 8l-2.5 6a3 3 0 005 0zM20 8l-2.5 6a3 3 0 005 0z" /></>),
  P(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.2" /><circle cx="12" cy="12" r="1.8" fill={RED} /><path d="M12 12l7-7" /></>),
  P(<><path d="M12 3.5c1 0 1.8.8 1.8 1.8" /><path d="M12 9l-1 1c-1.4-1.3-3 0-1.7 1.6L12 14l2.7-2.4c1.3-1.6-.3-2.9-1.7-1.6z" fill={RED} /><circle cx="6" cy="17" r="1.8" /><circle cx="12" cy="17" r="1.8" /><circle cx="18" cy="17" r="1.8" /><path d="M3 22c0-2 1.3-3 3-3s3 1 3 3M9 22c0-2 1.3-3 3-3s3 1 3 3M15 22c0-2 1.3-3 3-3s3 1 3 3" /></>),
];
const ROW = 150, FW = 390;

export const FunnelDark: React.FC<{ rows: FunnelRow[]; unit: string }> = ({ rows, unit }) => {
  const n = rows.length;
  const ACCENT = rows.map((r) => r.color); // each step keeps the colour it has in the bars of the same window
  // one smooth cone: every tier starts exactly as wide as the one above it ends (the sizes of the numbers are in the text beside it)
  const widthOf = (i: number) => (FW - 30) * Math.max(0.55, 1 - i * (0.4 / Math.max(1, rows.length)));
  const cx = FW / 2 + 6;
  return (
    <div dir="ltr" className="w-full max-w-[1030px] mx-auto rounded-3xl px-6 py-6 text-[#111827] border border-[#ece8e4]" style={{ background: BG }} data-dark-funnel>
      <div className="grid" style={{ columnGap: 30, gridTemplateColumns: `${FW}px 1fr 70px`, gridTemplateRows: `repeat(${n}, ${ROW}px)` }}>
        <svg viewBox={`0 0 ${FW} ${n * ROW}`} style={{ gridColumn: 1, gridRow: `1 / span ${n}` }} className="w-full h-full" role="img" aria-label="قیف تیره">
          <defs>
            {rows.map((r, i) => (
              <linearGradient key={r.id} id={`dk-${r.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={ACCENT[i]} /><stop offset="1" stopColor={ACCENT[i]} /></linearGradient>
            ))}
          </defs>
          {rows.map((r, i) => {
            const wt = widthOf(i), wb = widthOf(i + 1);
            const y0 = i * ROW + 2, y1 = y0 + ROW - 8;
            const midY = y0 + (ROW - 8) / 2;
            return (
              <g key={r.id}>
                <path d={`M ${cx - wt / 2} ${y0} L ${cx + wt / 2} ${y0} L ${cx + wb / 2} ${y1} L ${cx - wb / 2} ${y1} Z`} fill={`url(#dk-${r.id})`} />
                <line x1={cx + (wt + wb) / 4 + 6} x2={FW} y1={midY} y2={midY} stroke={ACCENT[i]} strokeOpacity="0.8" />
                <circle cx={FW - 1} cy={midY} r="3.5" fill={ACCENT[i]} />
                <circle cx={Math.max(20, cx - wt / 2 + 4)} cy={y0 + 26} r="19" fill="#fff" stroke="#111827" strokeWidth="2.2" />
                <text x={Math.max(20, cx - wt / 2 + 4)} y={y0 + 34} textAnchor="middle" fontSize="22" fontWeight="800" fill="#111827">{fa(i + 1)}</text>
                <g transform={`translate(${cx - 13} ${y0 + 6}) scale(1.1)`} fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{TIER_ICON[i]}</g>
                <text x={cx} y={y0 + 56} textAnchor="middle" fontSize="23" fontWeight="800" fill="#fff">{r.label}</text>
                <text x={cx} y={y0 + 124} textAnchor="middle" fontWeight="800" fill="#fff"><tspan fontSize="64">{fa(r.count)}</tspan><tspan fontSize="18" dx="6">فرصت</tspan></text>
              </g>
            );
          })}
        </svg>
        {rows.map((r, i) => {
          const t = HEAD[r.id];
          const hb = { background: ACCENT[i] };
          return (
            <div key={r.id} dir="rtl" style={{ gridColumn: 2, gridRow: i + 1 }} className="flex flex-col justify-center min-w-0">
              <div className="inline-block self-start max-w-full rounded-xl px-4 py-1.5 font-black text-[16px] text-white" style={hb}>{t?.head}</div>
              <div className="mt-1 text-[14px] font-bold text-[#374151] leading-6">{t?.desc}</div>
              <div className="mt-0.5 text-[15px] font-black"><span style={{ color: ACCENT[i] }}>هدف:</span> <span className="text-[#111827]">{t?.goal}</span></div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-0 text-[#111827]">
                <span><b className="text-[34px] leading-none font-black">{fa(r.count)}</b> <span className="text-[14px] font-bold text-[#4b5563]">فرصت</span></span>
                <span><b className="text-[34px] leading-none font-black">{r.amount}</b> <span className="text-[14px] font-bold text-[#4b5563]">{unit}</span></span>
                <span><b className="text-[34px] leading-none font-black" style={{ color: ACCENT[i] }}>{fa(r.share)}٪</b></span>
              </div>
            </div>
          );
        })}
        {rows.map((r, i) => (
          <div key={r.id + 'ic'} style={{ gridColumn: 3, gridRow: i + 1 }} className="flex items-center justify-center">
            <span className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ border: '1.5px dashed #9ca3af' }}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{SIDE_ICON[i]}</svg>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
