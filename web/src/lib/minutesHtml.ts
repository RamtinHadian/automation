import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { Minutes, SystemSettings } from '../types';
import { toPersianDigits } from './jalali';
import { formatTaskDate } from './taskDates';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fa = (s: unknown) => toPersianDigits(String(s ?? ''));
const nl = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

const STATUS_TEXT: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غایب', EXCUSED: 'غایب موجه' };

/**
 * The printable sheet of a meeting minutes (A4, portrait), in the usual form of Iranian «صورتجلسه»: the logo and the name of the organisation
 * on top, the title with the number and date, the particulars of the meeting, the people present (with a column for their signature), the agenda,
 * what was discussed, the decisions (who carries each out and by when), the next meeting and the signatures of the chair and the secretary.
 * `print` adds a toolbar to the window that is opened; `preview` is the same sheet for turning it into a picture.
 */
export function buildMinutesHtml(m: Minutes, settings: SystemSettings, mode: 'print' | 'preview' = 'print'): string {
  const org = settings.companyName || settings.proformaCompanyName || 'نام سازمان';
  const sub = settings.companySubtitle || '';
  const logo = settings.companyLogoUrl || '';
  const present = m.attendees.filter((a) => a.status === 'PRESENT');
  const when = [m.date ? formatTaskDate(m.date) : '', m.startTime ? `از ساعت ${fa(m.startTime)}` : '', m.endTime ? `تا ساعت ${fa(m.endTime)}` : ''].filter(Boolean).join(' ');
  const rows = m.attendees
    .map(
      (a, i) =>
        `<tr><td class="c">${fa(i + 1)}</td><td>${esc(a.name)}</td><td>${esc(a.position || '')}</td><td class="c">${STATUS_TEXT[a.status] || ''}</td><td class="sig"></td></tr>`
    )
    .join('');
  const agenda = m.agenda.filter((x) => x.trim()).map((x, i) => `<li><b>${fa(i + 1)}.</b> ${esc(x)}</li>`).join('');
  const decisions = m.decisions
    .filter((d) => d.text.trim())
    .map((d, i) => `<tr><td class="c">${fa(i + 1)}</td><td>${nl(d.text)}</td><td>${esc(d.owner || '')}</td><td class="c">${d.due ? formatTaskDate(d.due) : ''}</td></tr>`)
    .join('');
  const next = m.nextDate ? `${formatTaskDate(m.nextDate)}${m.nextTime ? ` ساعت ${fa(m.nextTime)}` : ''}${m.nextPlace ? `، ${esc(m.nextPlace)}` : ''}` : '';
  const toolbar =
    mode === 'print'
      ? `<div class="toolbar"><button onclick="window.print()">چاپ / ذخیره PDF</button></div>`
      : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>صورتجلسه ${esc(m.number)} - ${esc(m.title)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${mode === 'print' ? '#e9e4de' : '#fff'}; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #111; font-size: 12px; line-height: 1.9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm 14mm 12mm; position: relative; display: flex; flex-direction: column; gap: 10px; }
  .head { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; gap: 10px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .head .logo { display: flex; align-items: center; gap: 8px; }
  .head .logo img { max-height: 22mm; max-width: 38mm; object-fit: contain; }
  .head .org { text-align: center; }
  .head .org b { font-size: 15px; display: block; }
  .head .org span { font-size: 10.5px; color: #444; }
  .head .nums { font-size: 11px; border: 1px solid #111; }
  .head .nums div { display: flex; justify-content: space-between; gap: 6px; padding: 2px 8px; }
  .head .nums div + div { border-top: 1px solid #111; }
  h1 { text-align: center; font-size: 21px; margin: 2px 0 0; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 12.5px; font-weight: 700; margin: -4px 0 2px; }
  .intro { text-align: justify; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #111; padding: 3px 7px; vertical-align: middle; }
  th { background: #e8e8e8; font-size: 11px; font-weight: 800; }
  .c { text-align: center; }
  .meta td { border: 1px solid #111; width: 25%; }
  .meta .k { background: #f1f1f1; font-weight: 800; width: 14%; font-size: 11px; }
  .sig { width: 30mm; height: 9mm; }
  h2 { font-size: 13px; margin: 6px 0 2px; padding: 1px 8px; background: #e8e8e8; border: 1px solid #111; }
  ol { margin: 2px 0; padding: 0; list-style: none; } ol li { padding: 1px 6px; }
  .txt { border: 1px solid #111; padding: 6px 9px; min-height: 16mm; text-align: justify; }
  .signs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: auto; }
  .signs .s { border: 1px solid #111; height: 30mm; padding: 4px 9px; font-weight: 800; font-size: 11.5px; }
  .signs .s small { display: block; font-weight: 500; color: #555; font-size: 10.5px; }
  .foot { text-align: center; font-size: 10.5px; color: #444; }
  .copies { font-size: 11px; }
  .toolbar { position: fixed; top: 10px; left: 10px; } .toolbar button { font-family: inherit; font-weight: 800; border: 0; border-radius: 10px; padding: 9px 16px; cursor: pointer; background: #333; color: #fff; }
  @media print { html, body { background: #fff; } .toolbar { display: none; } .page { margin: 0; } }
</style>
</head>
<body>
${toolbar}
<div class="page">
  <div class="head">
    <div class="logo">${logo ? `<img src="${esc(logo)}" alt="" />` : ''}</div>
    <div class="org"><b>${esc(org)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
    <div class="nums"><div><span>شمارهٔ صورتجلسه:</span><b>${esc(fa(m.number))}</b></div><div><span>تاریخ:</span><b>${m.date ? formatTaskDate(m.date) : ''}</b></div></div>
  </div>
  <h1>صورتجلسه</h1>
  <div class="sub">${esc(m.title)}</div>
  <p class="intro">
    ${m.kind ? (/^جلسه/.test(m.kind) ? esc(m.kind) : `جلسه ${esc(m.kind)}`) : 'جلسه'} با موضوع «${esc(m.title)}» در تاریخ ${m.date ? formatTaskDate(m.date) : '…'}${m.startTime ? ` از ساعت ${fa(m.startTime)}` : ''}${m.endTime ? ` تا ساعت ${fa(m.endTime)}` : ''}${m.place ? ` در محل ${esc(m.place)}` : ''}
    با حضور ${fa(present.length)} نفر از اعضا و دعوت‌شدگان تشکیل شد و مطالب زیر مورد بحث و تصمیم قرار گرفت.
  </p>
  <table class="meta">
    <tr><td class="k">موضوع جلسه</td><td colspan="3">${esc(m.title)}</td></tr>
    <tr><td class="k">زمان</td><td>${when}</td><td class="k">محل</td><td>${esc(m.place || '')}</td></tr>
    <tr><td class="k">رئیس جلسه</td><td>${esc(m.chair || '')}</td><td class="k">دبیر جلسه</td><td>${esc(m.secretary || '')}</td></tr>
  </table>
  <h2>حاضرین در جلسه</h2>
  <table>
    <thead><tr><th style="width:9mm">ردیف</th><th>نام و نام خانوادگی</th><th>سمت</th><th style="width:22mm">وضعیت</th><th style="width:30mm">امضا</th></tr></thead>
    <tbody>${rows || '<tr><td class="c" colspan="5">—</td></tr>'}</tbody>
  </table>
  ${agenda ? `<h2>دستور جلسه</h2><ol>${agenda}</ol>` : ''}
  ${m.discussion && m.discussion.trim() ? `<h2>شرح مذاکرات</h2><div class="txt">${nl(m.discussion.trim())}</div>` : ''}
  <h2>مصوبات جلسه</h2>
  <table>
    <thead><tr><th style="width:9mm">ردیف</th><th>شرح مصوبه</th><th style="width:38mm">مسئول اجرا</th><th style="width:28mm">مهلت اجرا</th></tr></thead>
    <tbody>${decisions || '<tr><td class="c" colspan="4">—</td></tr>'}</tbody>
  </table>
  ${next ? `<p class="intro"><b>جلسهٔ بعد:</b> ${next}</p>` : ''}
  <p class="intro">این صورتجلسه در ${fa(m.decisions.filter((d) => d.text.trim()).length)} بند مصوبه تنظیم شد و به امضای رئیس و دبیر جلسه و حاضرین رسید.</p>
  <div class="signs">
    <div class="s">دبیر جلسه<small>${esc(m.secretary || '')}</small></div>
    <div class="s">رئیس جلسه<small>${esc(m.chair || '')}</small></div>
  </div>
  ${m.copies && m.copies.trim() ? `<div class="copies"><b>رونوشت:</b> ${esc(m.copies)}</div>` : ''}
  <div class="foot">این صورتجلسه پس از امضای حاضرین معتبر است.</div>
</div>
</body></html>`;
}

/** Opens the minutes in a new window, ready to print or to save as PDF. */
export function openMinutesPrint(m: Minutes, settings: SystemSettings) {
  const w = window.open('', '_blank');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ صورتجلسه را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(buildMinutesHtml(m, settings, 'print'));
  w.document.close();
}
