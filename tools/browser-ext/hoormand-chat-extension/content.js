/*
 * Hoormand chat helper.
 * Hoormand opens the web of Rubika / Bale / Eitaa with the job in the address after «#hoormand=» (it never reaches the
 * server of the messenger: an address fragment stays in the browser). This script reads it and does what a person does:
 * finds the customer, opens the chat and writes the message (and presses send only when the job says so).
 * The pages of the messengers are not under our control, so every step looks for things by what they are (a search box,
 * a row with an avatar, a text box at the bottom) and says on the screen what it did or where it stopped.
 */
(() => {
  'use strict';
  const KEY = 'hoormand=';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  // ---------- the job in the address ----------
  const decode = (raw) => {
    const b64 = decodeURIComponent(raw).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  };
  // the job is in the address after #hoormand= (or ?hoormand= where the page already uses the hash)
  const readJob = () => {
    const take = (s) => {
      const i = s.indexOf(KEY);
      if (i < 0) return null;
      try {
        return decode(s.slice(i + KEY.length).split('&')[0]);
      } catch (e) {
        return null;
      }
    };
    return take(location.hash || '') || take((location.search || '').replace(/^\?/, ''));
  };

  // ---------- a small message on the screen ----------
  let banner;
  const say = (text, kind) => {
    if (!banner) {
      banner = document.createElement('div');
      banner.setAttribute('dir', 'rtl');
      banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:92vw;padding:10px 18px;border-radius:14px;font:700 13px/1.8 Tahoma,sans-serif;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.35);background:#6d28d9;direction:rtl;text-align:center';
      document.documentElement.appendChild(banner);
    }
    banner.style.background = kind === 'error' ? '#be123c' : kind === 'ok' ? '#047857' : '#6d28d9';
    let ver = '';
    try { ver = ' ' + chrome.runtime.getManifest().version; } catch (e) { /* the page cannot tell */ }
    banner.textContent = 'هورمند' + ver + ': ' + text;
    banner.style.display = 'block';
    clearTimeout(banner._t);
    if (kind !== 'error') banner._t = setTimeout(() => { banner.style.display = 'none'; }, kind === 'ok' ? 5000 : 30000);
  };

  // ---------- helpers ----------
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const waitFor = async (fn, ms = 8000, step = 250) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  };
  const click = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  };
  const setText = (el, text) => {
    el.focus();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return;
    }
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, text);
  };

  // the search box: a text field that talks about searching
  const findSearch = (root = document) =>
    [...root.querySelectorAll('input, [contenteditable="true"]')].filter(visible).find((el) => {
      const hint = (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.getAttribute('aria-label') || '') + (el.type === 'search' ? ' search' : '');
      return /جست|search/i.test(hint);
    });

  // the column the search box lives in (the list of chats)
  const columnOf = (el) => {
    let p = el;
    while (p.parentElement && p.parentElement !== document.body) {
      p = p.parentElement;
      const r = p.getBoundingClientRect();
      if (r.height > innerHeight * 0.6 && r.width < innerWidth * 0.75) return p;
    }
    return document.body;
  };

  // the first row under the search box: wide, not too tall, with an avatar
  const resultRows = (searchEl) => {
    const sr = searchEl.getBoundingClientRect();
    const col = columnOf(searchEl);
    const cw = col.getBoundingClientRect().width;
    const rows = [...col.querySelectorAll('*')].filter((el) => {
      if (!visible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.top < sr.bottom - 2 || r.height < 44 || r.height > 130 || r.width < cw * 0.7) return false;
      if (!el.querySelector('img, canvas, svg, [class*="avatar" i], [class*="photo" i]')) return false;
      const t = (el.innerText || '').trim();
      return t.length > 0 && !/^(نتایج|چت‌های اخیر|جستجوی اخیر|گفتگوهای|recent|global)/i.test(t);
    });
    // wrappers that hold the row (the whole list, a section) are not the row: keep only the innermost ones
    const inner = rows.filter((el) => !rows.some((o) => o !== el && el.contains(o)));
    inner.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return inner;
  };
  const firstResult = (searchEl) => resultRows(searchEl)[0] || null;

  // every element of the page, also inside open shadow roots
  const deepAll = (root, sel, out = []) => {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out); });
    return out;
  };
  const EDITABLE = '[contenteditable]:not([contenteditable="false"]), textarea, input[type="text"], input:not([type]), [role="textbox"]';
  const isEditable = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.getAttribute('role') === 'textbox');

  // the box the message is written in: at the bottom of the screen
  const findComposer = () => {
    const low = (el) => el.getBoundingClientRect().top > innerHeight * 0.55;
    const c = deepAll(document, EDITABLE).filter(visible).filter(low).filter((el) => !/جست|search/i.test(el.getAttribute('placeholder') || ''));
    if (c.length) return c[c.length - 1];
    // the editable part may be hidden or empty (0 height): find the «Message / پیام بنویسید» hint at the bottom and use what is around it
    const hint = deepAll(document, '*').filter(visible).find((el) => el.children.length === 0 && low(el) && /^(message|پیام( خود را)?( بنویسید)?\.{0,3}|write a message\.{0,3})$/i.test((el.textContent || '').trim()));
    if (hint) {
      let p = hint;
      for (let i = 0; i < 4 && p; i++) {
        const inner = deepAll(p, EDITABLE).find((e) => e !== hint);
        if (inner) return inner;
        p = p.parentElement;
      }
      return hint.parentElement || hint;
    }
    return null;
  };

  // what the page can show about itself when the box is not found (so the person can tell us)
  const diag = () => `editable:${deepAll(document, '[contenteditable]').length} textarea:${deepAll(document, 'textarea').length} input:${deepAll(document, 'input').length} textbox:${deepAll(document, '[role="textbox"]').length}`;

  // some messengers (Bale) show only a magnifier icon at the top: pressing it opens the search box
  const openSearchBox = async () => {
    let box = findSearch();
    if (box) return box;
    const icons = deepAll(document, 'button, [role="button"], a, div').filter(visible).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < 130 && r.width >= 26 && r.width <= 70 && Math.abs(r.width - r.height) < 10 && el.querySelector('svg, img') && (el.textContent || '').trim().length < 3;
    });
    const named = icons.filter((el) => /جست|search/i.test((el.getAttribute('aria-label') || '') + (el.getAttribute('title') || '')));
    const rest = icons.filter((el) => !named.includes(el)).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
    for (const el of [...named, ...rest].slice(0, 4)) {
      click(el);
      box = await waitFor(findSearch, 1500);
      if (box) return box;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
    }
    return null;
  };

  // the same text compared without the differences of writing (digits, ya/kaf, half-spaces, @, case)
  const norm = (s) => String(s || '').toLowerCase().replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s@]+/g, ' ').trim();
  const rowMatches = (row, job) => {
    const t = norm(row.innerText);
    const who = norm(job.who);
    const digits = who.replace(/\D/g, '');
    if (who && who.length >= 3 && t.includes(who)) return true;
    if (digits.length >= 7 && t.replace(/\D/g, '').includes(digits.slice(-9))) return true;
    const name = norm(job.name);
    if (name && t.includes(name)) return true;
    const parts = name.split(' ').filter((x) => x.length > 1);
    return parts.length >= 2 && parts.every((x) => t.includes(x));
  };
  let lastVerified = true;
  let why = '';
  const searchAndOpen = async (job) => {
    const who = job.who;
    const box = await waitFor(() => findSearch(), 3000) || (await openSearchBox());
    if (!box) { why = 'کادر جست‌وجو پیدا نشد'; return false; }
    setText(box, who);
    // wait until the list of results stops changing (it first shows the old list, then the answer)
    let last = '';
    let stable = 0;
    let rows = [];
    for (const end = Date.now() + 9000; Date.now() < end;) {
      await sleep(350);
      rows = resultRows(box);
      const sig = rows.map((r) => (r.innerText || '').trim()).join('|');
      if (rows.length && sig === last) { if (++stable >= 3) break; } else { stable = 0; last = sig; }
    }
    if (!rows.length) { why = 'برای «' + who + '» نتیجه‌ای پیدا نشد (شمارهٔ ثبت‌نشده در مخاطبین پیدا نمی‌شود)'; return false; }
    const hit = rows.filter((r) => rowMatches(r, job))[0];
    if (hit) { lastVerified = true; click(hit); return true; }
    if (rows.length === 1) { lastVerified = false; click(rows[0]); return true; }
    // several rows and none is the customer: opening any of them could be the wrong person
    why = 'نتیجهٔ مطابق «' + who + '» نبود؛ نتیجه‌ها: ' + rows.slice(0, 3).map((r) => (r.innerText || '').trim().split('\n')[0]).join('، ') + ' — برای اینکه پیام به شخص اشتباه نرود، باز نکردم';
    return false;
  };

  // «new message» (the pencil, then «پیام جدید»): its list has a search box of its own
  const viaNewMessage = async (job) => {
    const fab = [...document.querySelectorAll('button, [role="button"], div')].filter(visible).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 40 && r.width <= 80 && Math.abs(r.width - r.height) < 6 && r.bottom > innerHeight - 160 && r.left < innerWidth * 0.7 && el.querySelector('svg, img');
    });
    if (!fab) return false;
    click(fab);
    const item = await waitFor(() => [...document.querySelectorAll('*')].filter(visible).find((el) => el.children.length === 0 && /^پیام جدید$|^New Message$/i.test((el.textContent || '').trim())), 3000);
    if (!item) return false;
    click(item);
    await sleep(1200);
    return searchAndOpen(job);
  };

  // Sending: Enter first. In Eitaa / Telegram the send button IS the microphone button until the page has taken the text in,
  // so a button is only pressed when the text is still there after Enter, and never one that looks like voice recording.
  const attrsOf = (el) => (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('data-icon') || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
  const VOICE = /record|voice|mic|audio|ptt|ویس|میکروفون|صدا/i;
  // a button is a voice button when it says so itself or when its icon inside does (an icon-only button)
  const isVoice = (el) => VOICE.test(attrsOf(el)) || !!el.querySelector('[class*="mic" i], [class*="record" i], [class*="voice" i], [data-icon*="mic" i], [data-icon*="ptt" i]');
  const textOf = (el) => ((el.value !== undefined ? el.value : el.innerText) || '').trim();
  let lastSendDiag = '';
  const sendMessage = async (box) => {
    sendEnter(box);
    await sleep(1200);
    if (!textOf(box)) return true; // the box was emptied: the message went
    const btn = deepAll(document, 'button, [role="button"], [data-icon="send"]').filter(visible).find((el) => {
      const t = attrsOf(el);
      return /(^|\s)(send|ارسال)|btn-send/i.test(t) && !isVoice(el) && el.getBoundingClientRect().top > innerHeight * 0.5;
    });
    if (btn) { click(btn.closest('button, [role="button"]') || btn); await sleep(800); }
    if (textOf(box)) {
      // not sent: tell what the bottom of the page offers, so the next fix can be made from the real page
      lastSendDiag = deepAll(document, 'button, [role="button"]').filter(visible).filter((el) => el.getBoundingClientRect().top > innerHeight * 0.5).slice(0, 5)
        .map((el) => (attrsOf(el).replace(/\s+/g, ' ').trim().slice(0, 40) || el.tagName) + (isVoice(el) ? '[voice]' : '')).join(' | ');
    }
    return !textOf(box);
  };

  const sendEnter = (el) => {
    for (const t of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
  };

  // ---------- the whole job ----------
  const run = async (job) => {
    if (busy) return;
    busy = true;
    try {
      // an address that opens the chat by itself: Rubika #c=code, Eitaa #@user or #numeric-id
      const target = job.guid ? '#c=' + job.guid : job.peer ? '#' + job.peer : '';
      // the job is removed from the address first; the target is then set as a real change so the page moves to it
      const u = new URL(location.href);
      u.searchParams.delete('hoormand');
      history.replaceState(null, '', u.pathname + u.search + (u.hash.includes(KEY) ? '' : u.hash));
      say('در حال آماده کردن گفتگو…');
      // a copy of the text as a safety net; never waited for (the browser may ask for permission and wait)
      if (job.text) { try { navigator.clipboard.writeText(job.text).catch(() => {}); } catch (e) { /* no clipboard */ } }

      // the web of WhatsApp / Telegram was opened with the text already in the message box: wait for it and send
      if (job.prefilled) {
        say('در حال آماده شدن گفتگو…');
        const pbox = await waitFor(findComposer, 40000, 500);
        if (!pbox) { say('کادر نوشتن پیدا نشد؛ ' + diag() + (job.text ? ' — متن پیام کپی شده است.' : ''), 'error'); return; }
        await waitFor(() => ((pbox.value !== undefined ? pbox.value : pbox.innerText) || '').trim(), 8000, 300);
        if (!((pbox.value !== undefined ? pbox.value : pbox.innerText) || '').trim()) setText(pbox, job.text);
        await sleep(600);
        if (job.send) { say((await sendMessage(pbox)) ? 'پیام فرستاده شد.' : 'پیام نوشته شد ولی ارسال تأیید نشد؛ ارسال را خودتان بزنید. (' + lastSendDiag + ')', 'ok'); } else say('پیام نوشته شد؛ ارسال را بزنید.', 'ok');
        return;
      }

      let opened = false;
      if (target) {
        location.hash = target;
        opened = !!(await waitFor(findComposer, 10000));
      } else if (job.who) {
        say('در حال پیدا کردن «' + job.who + '»…');
        opened = (await searchAndOpen(job)) && !!(await waitFor(findComposer, 6000));
        if (!opened) {
          say('راه دوم: پیام جدید…');
          opened = (await viaNewMessage(job)) && !!(await waitFor(findComposer, 6000));
        }
      }
      if (!opened) {
        say((target ? 'گفتگو باز شد ولی کادر نوشتن پیدا نشد (' + diag() + ')' : (why || 'مشتری پیدا نشد یا گفتگو باز نشد')) + (job.text ? '؛ متن پیام کپی شده است، با Ctrl+V بچسبانید' : '') + '.', 'error');
        return;
      }
      if (!job.text) { say('گفتگو باز شد.', 'ok'); return; }
      let box = findComposer();
      if (!isEditable(box)) {
        click(box);
        box.focus && box.focus();
        await sleep(300);
        if (isEditable(document.activeElement)) box = document.activeElement;
      }
      setText(box, job.text);
      await sleep(400);
      const now = (box.value !== undefined ? box.value : box.innerText) || '';
      if (!now.trim()) {
        say('گفتگو باز شد ولی متن نشست؛ با Ctrl+V بچسبانید.', 'error');
        return;
      }
      if (job.send && !lastVerified) {
        say('پیام نوشته شد ولی مطمئن نیستم این گفتگو مشتری است (نامش با «' + (job.name || job.who) + '» نخواند)؛ برای اطمینان ارسال را خودتان بزنید.', 'ok');
      } else if (job.send) {
        say((await sendMessage(box)) ? 'پیام فرستاده شد.' : 'پیام نوشته شد ولی ارسال تأیید نشد؛ ارسال را خودتان بزنید. (' + lastSendDiag + ')', 'ok');
      } else {
        say('پیام نوشته شد؛ ارسال را بزنید.', 'ok');
      }
    } catch (e) {
      say('خطا: ' + (e && e.message ? e.message : e) + (job.text ? ' — متن پیام کپی شده است.' : ''), 'error');
    } finally {
      busy = false;
    }
  };

  const check = () => {
    const job = readJob();
    if (job) run(job);
  };
  check();
  window.addEventListener('hashchange', check);
})();
