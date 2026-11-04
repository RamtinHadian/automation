import React, { useEffect, useState } from 'react';
import { gregorianToJalali, toPersianDigits } from '../../lib/jalali';

/**
 * An analog clock with 100 designs: 10 colour schemes x 10 shapes (design = shape * 10 + scheme). It shows the time of the computer it runs on and, under it, the weekday and the
 * Persian (Jalali) date. The clock is drawn as one small SVG; nothing is loaded from outside.
 */
export const CLOCK_COUNT = 100;

const SCHEMES: { name: string; face: string; ring: string; tick: string; hour: string; minute: string; second: string; text: string }[] = [
  { name: 'عاج', face: '#FFFBF5', ring: '#6E1B1B', tick: '#3A241F', hour: '#3A241F', minute: '#3A241F', second: '#D34A32', text: '#3A241F' },
  { name: 'شب', face: '#1B2433', ring: '#C9A24B', tick: '#E8D9A8', hour: '#F5EBCB', minute: '#F5EBCB', second: '#E0573B', text: '#F5EBCB' },
  { name: 'اقیانوس', face: '#EAF6FB', ring: '#0B5C86', tick: '#0B5C86', hour: '#083D59', minute: '#083D59', second: '#E8793B', text: '#083D59' },
  { name: 'جنگل', face: '#F0F7EC', ring: '#2E6B3A', tick: '#2E6B3A', hour: '#1D4527', minute: '#1D4527', second: '#C9442B', text: '#1D4527' },
  { name: 'ارغوانی', face: '#F7F0FB', ring: '#6B33A3', tick: '#6B33A3', hour: '#43206B', minute: '#43206B', second: '#E2527B', text: '#43206B' },
  { name: 'مسی', face: '#FBEFE6', ring: '#B8602E', tick: '#8A4520', hour: '#5E2F12', minute: '#5E2F12', second: '#1F6F8B', text: '#5E2F12' },
  { name: 'گرافیت', face: '#F3F4F6', ring: '#374151', tick: '#374151', hour: '#111827', minute: '#111827', second: '#DC2626', text: '#111827' },
  { name: 'گل‌رز', face: '#FFF1F4', ring: '#C2395B', tick: '#C2395B', hour: '#7A1F36', minute: '#7A1F36', second: '#2F6FB5', text: '#7A1F36' },
  { name: 'فیروزه', face: '#E8FAF7', ring: '#0E8F82', tick: '#0E8F82', hour: '#085F56', minute: '#085F56', second: '#E0813B', text: '#085F56' },
  { name: 'طلایی', face: '#FFF8E1', ring: '#B8860B', tick: '#8A6508', hour: '#5C4305', minute: '#5C4305', second: '#B3261E', text: '#5C4305' },
];

const SHAPES = ['میله‌ای', 'نقطه‌ای', 'ساده', 'حلقهٔ دوتایی', 'عدد کامل', 'چهار عدد', 'الماسی', 'ظریف', 'قطاع‌دار', 'پررنگ'];

const FA = '۰۱۲۳۴۵۶۷۸۹';
const WEEK = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** the Persian date of a day: «شنبه ۱۴ آبان ۱۴۰۵» */
export const jalaliDateLine = (d: Date) => {
  const [y, m, day] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${WEEK[d.getDay()]} ${toPersianDigits(day)} ${MONTHS[m - 1]} ${toPersianDigits(y)}`;
};

export const designName = (i: number) => `${SHAPES[Math.floor(i / 10) % 10]} · ${SCHEMES[i % 10].name}`;

const P = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)] as const;

export const ClockFace: React.FC<{ design: number; time: Date; size?: number }> = ({ design, time, size = 88 }) => {
  const d = ((design % CLOCK_COUNT) + CLOCK_COUNT) % CLOCK_COUNT;
  const c = SCHEMES[d % 10];
  const shape = Math.floor(d / 10);
  const s = time.getSeconds() + time.getMilliseconds() / 1000;
  const m = time.getMinutes() + s / 60;
  const h = (time.getHours() % 12) + m / 60;
  const aS = s * 6, aM = m * 6, aH = h * 30;
  const C = 50;
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const a = i * 6;
    if (shape === 2 && !big) continue; // minimal: only the twelve
    if (shape === 1) { // dots
      const [x, y] = P(C, C, 42, a);
      ticks.push(<circle key={i} cx={x} cy={y} r={big ? 2.2 : 0.8} fill={c.tick} />);
      continue;
    }
    if (shape === 4 || shape === 5) { if (!big) { const [x, y] = P(C, C, 44, a); ticks.push(<circle key={i} cx={x} cy={y} r={0.6} fill={c.tick} />); } continue; }
    const [x1, y1] = P(C, C, big ? 36 : 40, a);
    const [x2, y2] = P(C, C, 45, a);
    ticks.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.tick} strokeWidth={big ? (shape === 9 ? 3 : 1.8) : 0.6} strokeLinecap="round" />);
  }
  const numerals: React.ReactNode[] = [];
  if (shape === 4 || shape === 5) {
    for (let n = 1; n <= 12; n++) {
      if (shape === 5 && n % 3 !== 0) continue;
      const [x, y] = P(C, C, 35, n * 30);
      numerals.push(<text key={n} x={x} y={y + 3.2} textAnchor="middle" fontSize={shape === 5 ? 11 : 8.5} fontWeight={800} fill={c.text} fontFamily="inherit">{String(n).split('').map((ch) => FA[+ch]).join('')}</text>);
    }
  }
  const sectors: React.ReactNode[] = [];
  if (shape === 8) {
    for (let i = 0; i < 12; i += 2) {
      const [x1, y1] = P(C, C, 46, i * 30), [x2, y2] = P(C, C, 46, (i + 1) * 30);
      sectors.push(<path key={i} d={`M${C},${C} L${x1},${y1} A46,46 0 0 1 ${x2},${y2} Z`} fill={c.ring} opacity={0.08} />);
    }
  }
  const handH = shape === 6 ? `M${C},${C - 24} L${C + 3.2},${C - 8} L${C},${C + 4} L${C - 3.2},${C - 8} Z` : null;
  const handM = shape === 6 ? `M${C},${C - 36} L${C + 2.6},${C - 10} L${C},${C + 4} L${C - 2.6},${C - 10} Z` : null;
  const wH = shape === 9 ? 4.2 : shape === 7 ? 1.6 : 2.8;
  const wM = shape === 9 ? 3.2 : shape === 7 ? 1.1 : 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx={C} cy={C} r={48} fill={c.face} stroke={c.ring} strokeWidth={shape === 9 ? 4.5 : 2.4} />
      {shape === 3 && <circle cx={C} cy={C} r={43.5} fill="none" stroke={c.ring} strokeWidth={0.8} />}
      {sectors}
      {ticks}
      {numerals}
      {handH ? <path d={handH} fill={c.hour} transform={`rotate(${aH} ${C} ${C})`} /> : <line x1={C} y1={C + 5} x2={C} y2={C - 24} stroke={c.hour} strokeWidth={wH} strokeLinecap="round" transform={`rotate(${aH} ${C} ${C})`} />}
      {handM ? <path d={handM} fill={c.minute} transform={`rotate(${aM} ${C} ${C})`} /> : <line x1={C} y1={C + 6} x2={C} y2={C - 35} stroke={c.minute} strokeWidth={wM} strokeLinecap="round" transform={`rotate(${aM} ${C} ${C})`} />}
      <line x1={C} y1={C + (shape === 9 ? 14 : 10)} x2={C} y2={C - 38} stroke={c.second} strokeWidth={0.9} strokeLinecap="round" transform={`rotate(${aS} ${C} ${C})`} />
      <circle cx={C} cy={C} r={shape === 9 ? 3.6 : 2.6} fill={c.second} />
      <circle cx={C} cy={C} r={1} fill={c.face} />
    </svg>
  );
};

/** The clock for the top of the page: the face and the Persian date. */
export const AnalogClock: React.FC<{ design: number; size?: number; withDate?: boolean }> = ({ design, size = 64, withDate = true }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const colour = SCHEMES[((design % CLOCK_COUNT) + CLOCK_COUNT) % CLOCK_COUNT % 10].text;
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0 select-none" data-analog-clock title={`${jalaliDateLine(now)} · ${toPersianDigits(now.toLocaleTimeString('en-GB'))}`}>
      <ClockFace design={design} time={now} size={size} />
      {withDate && <span className="text-[9.5px] font-black leading-3 text-center whitespace-nowrap" style={{ color: colour === '#F5EBCB' ? undefined : colour }}>{jalaliDateLine(now)}</span>}
    </div>
  );
};
