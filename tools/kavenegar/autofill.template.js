// ==UserScript==
// @name         هورمند - ساخت خودکار الگوهای کاوه‌نگار
// @namespace    hoormand
// @version      1.0
// @description  فرم «ایجاد الگوی جدید» کاوه‌نگار را برای هر الگو پر می‌کند و ثبت می‌کند.
// @match        *://*.kavenegar.com/*
// @match        http://localhost:9801/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  const T = /*DATA*/[];
  const K = 'hmKvgState';
  const load = () => { try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { return {}; } };
  const save = (s) => localStorage.setItem(K, JSON.stringify(s));
  let S = Object.assign({ i: 0, running: false, auto: true, company: '', product: 'هورمند', link: '', desc: '', url: '', paused: '' }, load());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const q = (sel, root) => (root || document).querySelector(sel);
  const all = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const setVal = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const findName = () => q('input[name=name]') || all('input[type=text],input:not([type])').find((e) => /template/i.test(e.placeholder || ''));
  const findText = () => all('textarea').find((e) => /تایپ کنید/.test(e.placeholder || '')) || all('textarea')[0];
  const findBtn = (re) => all('button').find((b) => re.test(b.textContent || ''));

  // ---------- panel ----------
  const box = document.createElement('div');
  box.dir = 'rtl';
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;width:300px;background:#fff;color:#222;border:2px solid #6E1B1B;border-radius:14px;font:13px/1.7 Tahoma,sans-serif;padding:12px;box-shadow:0 8px 30px rgba(0,0,0,.3)';
  document.body.appendChild(box);
  const btn = 'padding:6px 10px;margin:2px;border:0;border-radius:8px;background:#6E1B1B;color:#fff;cursor:pointer;font:inherit';
  const formPresent = () => !!findName() && !!findText();
  const render = (msg) => {
    const cur = T[S.i];
    box.innerHTML =
      '<b>ساخت خودکار الگوهای کاوه‌نگار</b><br>' +
      '<div id="hmst">' + (msg || S.paused || (S.running ? 'در حال کار...' : 'آماده')) + '</div>' +
      '<div>پیشرفت: ' + fa(Math.min(S.i, T.length)) + ' از ' + fa(T.length) + (cur ? '<br><small>' + cur.title + '</small>' : '<br>همهٔ الگوها انجام شد.') + '</div>' +
      '<div>نام سامانه: <input id="hmpr" style="width:150px" value="' + (S.product || '') + '"></div>' +
      '<div>لینک سامانه: <input id="hmlk" dir="ltr" style="width:150px" value="' + (S.link || '') + '"></div>' +
      '<div>توضیحات (اختیاری): <input id="hmds" style="width:150px" value="' + (S.desc || '').replace(/"/g, '&quot;') + '"></div>' +
      '<label><input type="checkbox" id="hmau" ' + (S.auto ? 'checked' : '') + '> خودش دکمهٔ ساخت را بزند</label><br>' +
      '<button id="hmgo" style="' + btn + '">' + (S.running ? 'ادامه' : 'شروع') + '</button>' +
      '<button id="hmst2" style="' + btn + ';background:#666">توقف</button>' +
      '<button id="hmsk" style="' + btn + ';background:#666">رد کردن این یکی</button>' +
      '<button id="hmrs" style="' + btn + ';background:#999">از اول</button>' +
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd"><b>پاک‌سازی (در صفحهٔ فهرست الگوها)</b><br>' +
      '<button id="hmdl" style="' + btn + ';background:#c0392b">حذف الگوهای «در حال بررسی»</button>' +
      '<button id="hmdx" style="' + btn + ';background:#666">توقف حذف</button></div>';
    q('#hmgo', box).onclick = () => { readFields(); S.running = true; S.paused = ''; if (formPresent() || !S.url) S.url = location.href; save(S); run(); };
    q('#hmst2', box).onclick = () => { S.running = false; save(S); render('متوقف شد.'); };
    q('#hmsk', box).onclick = () => { S.i++; S.paused = ''; save(S); go(); };
    q('#hmdl', box).onclick = () => purgePending();
    q('#hmdx', box).onclick = () => { stopPurge = true; };
    q('#hmrs', box).onclick = () => { S.i = 0; S.running = false; S.paused = ''; save(S); render(); };
  };
  const readFields = () => { S.product = q('#hmpr', box).value.trim(); S.link = q('#hmlk', box).value.trim(); S.desc = q('#hmds', box).value.trim(); S.auto = q('#hmau', box).checked; save(S); };
  const go = () => { if (S.url && location.href !== S.url) location.href = S.url; else location.reload(); };
  const status = (m) => { const e = q('#hmst', box); if (e) e.textContent = m; };
  const pause = (why) => { S.running = false; S.paused = why; save(S); render(why); };

  async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(250); } return null; }

  // Real mouse click: the host browser (when it offers hmRealClick) clicks at the element; otherwise a plain click.
  async function realClick(el) {
    el.scrollIntoView({ block: 'center' });
    await sleep(200);
    const r = el.getBoundingClientRect();
    if (typeof window.hmRealClick === 'function') await window.hmRealClick(r.x + r.width / 2, r.y + r.height / 2);
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(500);
  }
  const productEl = () => q('input[name=productName]');
  // «نوع استفاده» = سایر; that opens the fields «نام سامانه»، «لینک سامانه» و «توضیحات».
  async function chooseType() {
    if (productEl()) return true;
    const trigger = all('button').find((e) => /نوع استفاده خود را/.test(e.textContent || ''));
    if (!trigger) return true; // this form has no such field
    await realClick(trigger);
    const opt = await waitFor(() => all('span,[role=option]').find((e) => e.children.length === 0 && (e.textContent || '').trim() === 'سایر'), 3000);
    if (!opt) return false;
    await realClick(opt);
    return !!(await waitFor(productEl, 3000));
  }

  async function run() {
    if (!S.running) return;
    const cur = T[S.i];
    if (!cur) { S.running = false; save(S); return render('همهٔ الگوها ثبت شد.'); }
    render('الگوی ' + fa(cur.n) + ' در حال پر شدن...');
    const nameEl = await waitFor(findName, S.url && location.href !== S.url ? 2500 : 15000);
    const textEl = findText();
    if (!nameEl || !textEl) {
      if (S.url && location.href !== S.url) { go(); return; }
      return pause('فرم ایجاد الگو پیدا نشد. به صفحهٔ «ایجاد الگوی جدید» بروید و «ادامه» را بزنید.');
    }
    if (!S.link) return pause('اول لینک سامانه را بنویسید و دوباره «ادامه» را بزنید.');
    const ok = await chooseType();
    if (!ok) return pause('نوع استفاده را خودتان روی «سایر» بگذارید و «ادامه» را بزنید.');
    if (productEl()) { setVal(productEl(), S.product || 'هورمند'); const lk = q('input[name=platformLink]'); if (lk) setVal(lk, S.link); const ds = q('textarea[name=description]'); if (ds && S.desc) setVal(ds, S.desc); }
    setVal(findName(), cur.name);
    setVal(findText(), cur.text);
    if (!S.auto) return pause('الگو پر شد. خودتان «ساخت الگو» را بزنید، بعد در صفحهٔ بعد «ادامه» را بزنید.');
    const submit = findBtn(/ساخت الگو/);
    if (!submit) return pause('دکمهٔ «ساخت الگو» پیدا نشد.');
    const before = location.href;
    S.i++; save(S); // counted before the click: the page may reload at once
    submit.click();
    const done = await waitFor(() => location.href !== before || !formPresent(), 10000);
    if (done) { await sleep(1200); go(); return; }
    S.i--; save(S);
    pause('بعد از زدن «ساخت الگو» صفحه تغییر نکرد؛ احتمالاً خطایی روی فرم هست. آن را درست کنید و «ادامه» بزنید، یا «رد کردن این یکی».');
  }

  // ---------- delete the templates that are still «در حال بررسی» (only the ones this tool made: names starting with hm) ----------
  let stopPurge = false;
  const pendingRows = () => all('tbody tr').filter((r) => /در حال بررسی/.test(r.innerText || '') && /\bhm[a-z0-9]+\b/.test(r.innerText || ''));
  const rowName = (r) => ((r.innerText || '').match(/\bhm[a-z0-9]+\b/) || [''])[0];
  const dlgBtn = (sel, label) => all(sel + ' button').find((b) => (b.textContent || '').trim() === label);
  async function purgePending() {
    const n = pendingRows().length;
    if (!n) { status('در این صفحه الگوی «در حال بررسی» که نامش با hm شروع شود پیدا نشد (فهرست الگوها را باز کنید).'); return; }
    if (!confirm(n + ' الگوی «در حال بررسی» (فقط با نام hm...) یکی‌یکی حذف می‌شود و قابل بازیابی نیست. ادامه می‌دهید؟')) return;
    stopPurge = false;
    let done = 0;
    for (;;) {
      if (stopPurge) { status('حذف متوقف شد. ' + fa(done) + ' الگو حذف شد.'); return; }
      const row = pendingRows()[0];
      if (!row) break;
      const name = rowName(row);
      status('در حال حذف ' + name + ' ... (' + fa(done) + ' تا اینجا)');
      const eye = q('svg[data-icon=eye]', row);
      if (!eye) { status('دکمهٔ چشم برای ' + name + ' پیدا نشد؛ متوقف شد.'); return; }
      await realClick(eye);
      const dlg = await waitFor(() => q('[role=dialog]'), 4000);
      if (!dlg || !(dlg.innerText || '').includes(name) || !/در حال بررسی/.test(dlg.innerText || '')) { status('پنجرهٔ ' + name + ' درست باز نشد؛ متوقف شد.'); return; }
      const del = await waitFor(() => dlgBtn('[role=dialog]', 'حذف الگو'), 3000);
      if (!del) { status('دکمهٔ «حذف الگو» پیدا نشد؛ متوقف شد.'); return; }
      await realClick(del);
      const ok = await waitFor(() => dlgBtn('[role=alertdialog]', 'حذف'), 3000);
      if (!ok) { status('پنجرهٔ تأیید حذف باز نشد؛ متوقف شد.'); return; }
      await realClick(ok);
      const gone = await waitFor(() => !all('tbody tr').some((r) => rowName(r) === name), 10000);
      if (!gone) { status(name + ' حذف نشد؛ متوقف شد.'); return; }
      done++;
      await sleep(600);
      const close = await waitFor(() => dlgBtn('[role=dialog]', 'Close'), 600);
      if (close) await realClick(close);
    }
    status('تمام شد. ' + fa(done) + ' الگوی «در حال بررسی» حذف شد.');
  }

  render();
  if (S.running) setTimeout(run, 1200);
})();
