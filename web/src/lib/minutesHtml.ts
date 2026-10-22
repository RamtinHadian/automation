import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { Minutes, SystemSettings } from '../types';
import { getMinutesConfig, typeOf } from './minutesConfig';
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
const safeColor = (c: string, d: string) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : d);

const STATUS_TEXT: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غایب', EXCUSED: 'غایب موجه' };

/**
 * The printable sheet of a meeting minutes (A4, portrait), in the usual form of Iranian «صورتجلسه». What it looks like (colours, header,
 * logo, tables, signature boxes) comes from the administrator's settings; which parts it has (people present, agenda, decisions, parties,
 * goods table …) and what it says come from the sort of minutes (general meeting, delivery of goods …).
 * `print` adds a toolbar to the window that is opened; `preview` is the same sheet for turning it into a picture.
 */
export function buildMinutesHtml(m: Minutes, settings: SystemSettings, mode: 'print' | 'preview' = 'print'): string {
  const cfg = getMinutesConfig(settings);
  const d = cfg.design;
  const t = typeOf(cfg, m.typeId);
  const S = t.sections;
  const org = settings.companyName || settings.proformaCompanyName || 'نام سازمان';
  const sub = settings.companySubtitle || '';
  const logo = settings.companyLogoUrl || '';
  const primary = safeColor(d.primary, '#111111');
  const accent = safeColor(d.accent, primary);
  const headFill = safeColor(d.headFill, '#e8e8e8');
  const text = safeColor(d.text, '#111111');
  const present = m.attendees.filter((a) => a.status === 'PRESENT');
  const decisionsList = m.decisions.filter((x) => x.text.trim());
  const timeText = [m.startTime ? ` از ساعت ${fa(m.startTime)}` : '', m.endTime ? ` تا ساعت ${fa(m.endTime)}` : ''].join('');
  const dateText = m.date ? formatTaskDate(m.date) : '…';
  const fill = (tpl: string) =>
    tpl
      .replace(/\{\{title\}\}/g, esc(m.title))
      .replace(/\{\{date\}\}/g, dateText)
      .replace(/\{\{time\}\}/g, timeText)
      .replace(/\{\{place\}\}/g, m.place ? ` در محل ${esc(m.place)}` : '')
      .replace(/\{\{count\}\}/g, fa(present.length || m.attendees.length))
      .replace(/\{\{decisions\}\}/g, fa(decisionsList.length))
      .replace(/\{\{copies\}\}/g, fa(Math.max(2, t.signs.length)));
  const when = [m.date ? formatTaskDate(m.date) : '', m.startTime ? `از ساعت ${fa(m.startTime)}` : '', m.endTime ? `تا ساعت ${fa(m.endTime)}` : ''].filter(Boolean).join(' ');
  const SH = d.showStatusColumn;
  const SG = d.showSignColumn;

  const attendeeRows = m.attendees
    .map((a, i) => `<tr><td class="c">${fa(i + 1)}</td><td>${esc(a.name)}</td><td>${esc(a.position || '')}</td>${SH ? `<td class="c">${STATUS_TEXT[a.status] || ''}</td>` : ''}${SG ? '<td class="sig"></td>' : ''}</tr>`)
    .join('');
  const attendeeCols = 3 + (SH ? 1 : 0) + (SG ? 1 : 0);
  const agenda = m.agenda.filter((x) => x.trim()).map((x, i) => `<li><b>${fa(i + 1)}.</b> ${esc(x)}</li>`).join('');
  const decisions = decisionsList
    .map((x, i) => `<tr><td class="c">${fa(i + 1)}</td><td>${nl(x.text)}</td><td>${esc(x.owner || '')}</td><td class="c">${x.due ? formatTaskDate(x.due) : ''}</td></tr>`)
    .join('');
  const goods = (m.goods || []).filter((g) => g.title.trim());
  const gc = t.goodsColumns;
  const goodsRows = goods
    .map((g, i) => `<tr><td class="c">${fa(i + 1)}</td>${gc.code ? `<td class="c">${esc(g.code || '')}</td>` : ''}<td>${esc(g.title)}</td><td class="c">${fa(g.qty)}</td>${gc.unit ? `<td class="c">${esc(g.unit || '')}</td>` : ''}${gc.note ? `<td>${esc(g.note || '')}</td>` : ''}</tr>`)
    .join('');
  const goodsTotal = goods.reduce((s, g) => s + (Number(g.qty) || 0), 0);
  const goodsCols = 3 + (gc.code ? 1 : 0) + (gc.unit ? 1 : 0) + (gc.note ? 1 : 0);
  const fieldsRows = t.fields
    .map((f) => ({ f, v: (m.fields || {})[f.id] || '' }))
    .filter((x) => x.v)
    .map((x) => `<td class="k">${esc(x.f.label)}</td><td>${x.f.kind === 'date' ? formatTaskDate(x.v) : esc(x.v)}</td>`);
  const fieldsHtml = fieldsRows.length
    ? `<table class="meta">${fieldsRows.map((_, i) => (i % 2 === 0 ? `<tr>${fieldsRows[i]}${fieldsRows[i + 1] || '<td class="k"></td><td></td>'}</tr>` : '')).join('')}</table>`
    : '';
  const party = (p: { name: string; position?: string; phone?: string } | undefined, label: string) =>
    `<td class="k">${esc(label)}</td><td>${esc(p?.name || '')}${p?.position ? `<br><small>${esc(p.position)}</small>` : ''}${p?.phone ? `<br><small dir="ltr">${esc(p.phone)}</small>` : ''}</td>`;
  const partiesHtml = S.parties ? `<table class="meta"><tr>${party(m.parties?.first, t.partyLabels[0])}${party(m.parties?.second, t.partyLabels[1])}</tr></table>` : '';
  const next = S.nextMeeting && m.nextDate ? `${formatTaskDate(m.nextDate)}${m.nextTime ? ` ساعت ${fa(m.nextTime)}` : ''}${m.nextPlace ? `، ${esc(m.nextPlace)}` : ''}` : '';
  // the people who sign: the first two boxes carry the names of the persons who are known
  const names: string[] = S.parties ? [m.parties?.first?.name || '', m.parties?.second?.name || ''] : [m.secretary || '', m.chair || ''];
  const attSigns = S.attendees && present.length ? `<h2>امضای حاضرین</h2><div class="attsign">${present.map((a) => `<div class="a"><b>${esc(a.name)}</b>${a.position ? `<small>${esc(a.position)}</small>` : ''}</div>`).join('')}</div>` : '';
  const signs = t.signs.map((s, i) => `<div class="s">${esc(s)}<small>${esc(names[i] || '')}</small></div>`).join('');
  const toolbar = mode === 'print' ? `<div class="toolbar"><button onclick="window.print()">چاپ / ذخیره PDF</button></div>` : '';
  const numBox = d.showNumberBox ? `<div class="nums"><div><span>شمارهٔ صورتجلسه:</span><b>${esc(fa(m.number))}</b></div><div><span>تاریخ:</span><b>${m.date ? formatTaskDate(m.date) : ''}</b></div></div>` : '<div></div>';
  const logoHtml = d.showLogo && logo ? `<img src="${esc(logo)}" alt="" style="max-height:${Math.max(8, Math.min(40, Number(d.logoSize) || 22))}mm" />` : '';
  const orgHtml = d.showOrgName ? `<div class="org"><b>${esc(org)}</b>${d.showSubtitle && sub ? `<span>${esc(sub)}</span>` : ''}</div>` : '<div></div>';
  // logo right = first in the right-to-left row, left = last, centre = above the name
  const headCells =
    d.logoPosition === 'center'
      ? `<div></div><div class="org center"><div class="logo">${logoHtml}</div>${d.showOrgName ? `<b>${esc(org)}</b>${d.showSubtitle && sub ? `<span>${esc(sub)}</span>` : ''}` : ''}</div>${numBox}`
      : d.logoPosition === 'left'
        ? `${numBox}${orgHtml}<div class="logo end">${logoHtml}</div>`
        : `<div class="logo">${logoHtml}</div>${orgHtml}${numBox}`;
  const footTexts = [d.footerText, d.showFooterContact ? [settings.companyAddress, settings.companyPhone, settings.companyWebsite].filter(Boolean).join(' | ') : ''].filter(Boolean);
  const tableLook =
    d.tableStyle === 'bordered'
      ? 'th, td { border: 1px solid var(--line); }'
      : d.tableStyle === 'striped'
        ? 'th, td { border: 1px solid #d9d9d9; } tbody tr:nth-child(even) td { background: #f7f7f7; }'
        : 'th, td { border: 0; border-bottom: 1px solid var(--line); } table { border-top: 1px solid var(--line); }';
  const headStyle =
    d.headerStyle === 'band'
      ? 'background: var(--p); color: #fff; padding: 8px 12px; border-radius: var(--r);'
      : d.headerStyle === 'boxed'
        ? 'border: 1.4px solid var(--p); border-radius: var(--r); padding: 8px 12px; background: var(--head);'
        : d.headerStyle === 'plain'
          ? ''
          : 'border-bottom: 2px solid var(--p);';
  const numLine = d.headerStyle === 'band' ? '#fff' : 'var(--p)';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(t.printTitle)} ${esc(m.number)} - ${esc(m.title)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  :root { --p: ${primary}; --a: ${accent}; --head: ${headFill}; --line: ${d.tableStyle === 'bordered' ? text : '#bbb'}; --r: ${Math.max(0, Math.min(24, Number(d.radius) || 0))}px; }
  html, body { margin: 0; padding: 0; background: ${mode === 'print' ? '#e9e4de' : '#fff'}; }
  body, table, th, td, p, div, span, b, h1, h2, input, button { font-family: 'Vazirmatn', Tahoma, sans-serif; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: ${text}; font-size: ${Math.max(9, Math.min(15, Number(d.fontSize) || 12))}px; line-height: 1.9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 0 14mm; position: relative; ${d.pageBorder ? 'outline: 1.4px solid var(--p); outline-offset: -6mm;' : ''} }
  /* the sheet is a table so that the browser repeats its top margin and the signature boxes on EVERY printed page */
  table.pg { width: 100%; border-collapse: collapse; }
  table.pg > thead { display: table-header-group; } table.pg > tfoot { display: table-footer-group; }
  table.pg > thead > tr > td, table.pg > tbody > tr > td, table.pg > tfoot > tr > td { border: 0 !important; padding: 0 !important; background: none !important; }
  .pg-sp { height: 10mm; } .pg-hd { padding-bottom: 8px !important; } .pg-cell { vertical-align: top; } .pg-foot { vertical-align: bottom; padding-bottom: 10mm !important; padding-top: 6px !important; }
  .pgbody { display: flex; flex-direction: column; gap: 7px; }
  .pgbody table tfoot { display: table-row-group; } /* the total of the goods is printed once, at the end (not on every page) */
  .head { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; gap: 10px; padding-bottom: 8px; ${headStyle} }
  .head .logo { display: flex; align-items: center; gap: 8px; } .head .logo.end { justify-content: flex-end; }
  .head .logo img { max-width: 44mm; object-fit: contain; ${d.headerStyle === 'band' ? 'background: #fff; border-radius: 6px; padding: 3px;' : ''} }
  .head .org { text-align: center; } .head .org.center { grid-column: 2; display: flex; flex-direction: column; align-items: center; }
  .head .org b { font-size: 15px; display: block; }
  .head .org span { font-size: 10.5px; opacity: .75; }
  .head .nums { font-size: 11px; border: 1px solid ${numLine}; border-radius: var(--r); overflow: hidden; }
  .head .nums div { display: flex; justify-content: space-between; gap: 6px; padding: 2px 8px; }
  .head .nums div + div { border-top: 1px solid ${numLine}; }
  h1 { text-align: center; font-size: 21px; margin: 2px 0 0; letter-spacing: 1px; color: var(--p); }
  .sub { text-align: center; font-size: 12.5px; font-weight: 700; margin: -4px 0 2px; }
  .intro { text-align: justify; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 2px 6px; vertical-align: middle; }
  ${tableLook}
  th { background: var(--head); font-size: 11px; font-weight: 800; }
  .c { text-align: center; }
  .meta td { width: 25%; } .meta .k { background: var(--head); font-weight: 800; width: 14%; font-size: 11px; }
  .meta small { color: #555; font-size: 10px; }
  tfoot td { background: var(--head); }
  .sig { width: 30mm; height: 9mm; }
  h2 { font-size: 13px; margin: 4px 0 1px; padding: 1px 8px; background: var(--head); border-inline-start: 4px solid var(--a); border-radius: var(--r); }
  ol { margin: 2px 0; padding: 0; list-style: none; } ol li { padding: 1px 6px; }
  .txt { border: 1px solid var(--line); border-radius: var(--r); padding: 6px 9px; min-height: 16mm; text-align: justify; }
  .signs { display: grid; grid-template-columns: repeat(${Math.max(1, Math.min(4, t.signs.length))}, 1fr); gap: 8px; }
  .signs .s { border: 1px solid var(--line); border-radius: var(--r); height: ${Math.max(15, Math.min(60, Number(d.signHeight) || 30))}mm; padding: 4px 9px; font-weight: 800; font-size: 11.5px; }
  .signs .s small { display: block; font-weight: 800; color: var(--text, #111); font-size: 12px; margin-top: 2px; }
  .attsign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .attsign .a { border: 1px solid var(--line); border-radius: var(--r); min-height: 17mm; padding: 3px 8px; font-size: 11px; break-inside: avoid; }
  .attsign .a b { display: block; font-size: 11.5px; } .attsign .a small { color: #555; font-size: 10px; }
  .foot { text-align: center; font-size: 10.5px; color: #555; }
  .copies { font-size: 11px; }
  .toolbar { position: fixed; top: 10px; left: 10px; } .toolbar button { font-family: inherit; font-weight: 800; border: 0; border-radius: 10px; padding: 9px 16px; cursor: pointer; background: #333; color: #fff; }
  @media print { html, body { background: #fff; } .toolbar { display: none; } .page { margin: 0; } }
</style>
</head>
<body>
${toolbar}
<div class="page">
<table class="pg">
<thead><tr><td class="pg-sp"></td></tr><tr><td class="pg-hd"><div class="head">${headCells}</div></td></tr></thead>
<tbody><tr><td class="pg-cell"><div class="pgbody">
  <h1>${esc(t.printTitle)}</h1>
  <div class="sub">${esc(m.title)}</div>
  <p class="intro">${fill(t.intro)}</p>
  <table class="meta">
    <tr><td class="k">موضوع</td><td colspan="3">${esc(m.title)}</td></tr>
    <tr><td class="k">زمان</td><td>${when}</td><td class="k">محل</td><td>${esc(m.place || '')}</td></tr>
    <tr><td class="k">تهیه‌کننده</td><td>${esc(m.authorName || '')}</td><td class="k">وضعیت</td><td>${m.status === 'FINAL' ? `نهایی و بایگانی‌شده${m.finalizedAt ? ` (${formatTaskDate(m.finalizedAt.slice(0, 10))})` : ''}` : 'پیش‌نویس'}</td></tr>
    ${S.attendees ? `<tr><td class="k">رئیس جلسه</td><td>${esc(m.chair || '')}</td><td class="k">دبیر جلسه</td><td>${esc(m.secretary || '')}</td></tr>` : ''}
  </table>
  ${partiesHtml}
  ${fieldsHtml}
  ${S.attendees ? `<h2>حاضرین در جلسه</h2><table><thead><tr><th style="width:9mm">ردیف</th><th>نام و نام خانوادگی</th><th>سمت</th>${SH ? '<th style="width:22mm">وضعیت</th>' : ''}${SG ? '<th style="width:30mm">امضا</th>' : ''}</tr></thead><tbody>${attendeeRows || `<tr><td class="c" colspan="${attendeeCols}">—</td></tr>`}</tbody></table>` : ''}
  ${
    S.goods
      ? `<h2>مشخصات کالاهای تحویل‌شده</h2><table><thead><tr><th style="width:9mm">ردیف</th>${gc.code ? '<th style="width:24mm">کد کالا</th>' : ''}<th>شرح کالا</th><th style="width:16mm">تعداد</th>${gc.unit ? '<th style="width:18mm">واحد</th>' : ''}${gc.note ? `<th style="width:44mm">${esc(t.goodsNoteLabel)}</th>` : ''}</tr></thead><tbody>${goodsRows || `<tr><td class="c" colspan="${goodsCols}">—</td></tr>`}</tbody>${goods.length ? `<tfoot><tr><td colspan="${2 + (gc.code ? 1 : 0)}" class="c"><b>جمع تعداد</b></td><td class="c"><b>${fa(goodsTotal)}</b></td>${gc.unit ? '<td></td>' : ''}${gc.note ? '<td></td>' : ''}</tr></tfoot>` : ''}</table>${m.conditions && m.conditions.trim() ? `<h2>${esc(t.conditionsLabel)}</h2><div class="txt">${nl(m.conditions.trim())}</div>` : ''}`
      : ''
  }
  ${S.agenda && agenda ? `<h2>دستور جلسه</h2><ol>${agenda}</ol>` : ''}
  ${S.discussion && m.discussion && m.discussion.trim() ? `<h2>${t.id === 'handover' || t.id === 'inspection' ? 'شرح و گزارش' : 'شرح مذاکرات'}</h2><div class="txt">${nl(m.discussion.trim())}</div>` : ''}
  ${S.decisions ? `<h2>${t.id === 'inspection' ? 'نتیجه و اقدامات لازم' : 'مصوبات'}</h2><table><thead><tr><th style="width:9mm">ردیف</th><th>شرح</th><th style="width:38mm">مسئول اجرا</th><th style="width:28mm">مهلت اجرا</th></tr></thead><tbody>${decisions || '<tr><td class="c" colspan="4">—</td></tr>'}</tbody></table>` : ''}
  ${next ? `<p class="intro"><b>جلسهٔ بعد:</b> ${next}</p>` : ''}
  <p class="intro">${fill(t.closing)}</p>
  ${attSigns}
  ${S.copies && m.copies && m.copies.trim() ? `<div class="copies"><b>رونوشت:</b> ${esc(m.copies)}</div>` : ''}
  ${footTexts.length ? `<div class="foot">${footTexts.map(esc).join('<br>')}</div>` : ''}
</div></td></tr></tbody>
<tfoot><tr><td class="pg-foot"><div class="signs">${signs}</div></td></tr></tfoot>
</table>
</div>
${
  mode === 'print'
    ? `<script>
(function () {
  var PAGE = 297 * 96 / 25.4; // one A4 page in pixels
  function fit() {
    var t = document.querySelector('table.pg');
    if (!t) return;
    var pb = t.querySelector('.pgbody');
    pb.style.zoom = 1;
    t.style.height = 'auto';
    var head = t.tHead ? t.tHead.offsetHeight : 0;
    var foot = t.tFoot ? t.tFoot.offsetHeight : 0;
    var room = PAGE - head - foot; // what one printed page holds of the text
    var size = function () { return t.offsetHeight - head - foot; };
    // a sheet that only just overflows is shrunk a little so that it stays on ONE page (no page for a few lines)
    var z = 1;
    while (size() > room - 3 && z > 0.66) { z -= 0.02; pb.style.zoom = z; }
    if (size() > room - 3) pb.style.zoom = 1; // really long: it takes several pages at its normal size
    var body = size();
    var pages = Math.max(1, Math.ceil((body - 3) / room));
    // the top margin and the signature boxes are drawn again on every page, so the table needs that much less than whole pages
    t.style.height = (head + foot + pages * room - 4) + 'px';
  }
  window.addEventListener('load', function () { fit(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); setTimeout(fit, 300); });
  window.addEventListener('beforeprint', fit);
  if (window.matchMedia) { var mq = window.matchMedia('print'); if (mq.addEventListener) mq.addEventListener('change', function (e) { if (e.matches) fit(); }); }
})();
</script>`
    : ''
}
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
