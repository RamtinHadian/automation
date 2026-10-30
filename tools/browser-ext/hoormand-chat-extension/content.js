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
  const readJob = () => {
    const h = location.hash || '';
    const i = h.indexOf(KEY);
    if (i < 0) return null;
    try {
      return decode(h.slice(i + KEY.length).split('&')[0]);
    } catch (e) {
      return null;
    }
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
    banner.textContent = 'هورمند: ' + text;
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
  const firstResult = (searchEl) => {
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
    return inner[0] || null;
  };

  // the box the message is written in: at the bottom of the screen
  const findComposer = () => {
    const c = [...document.querySelectorAll('[contenteditable="true"], textarea')].filter(visible).filter((el) => el.getBoundingClientRect().top > innerHeight * 0.55);
    return c[c.length - 1] || null;
  };

  const searchAndOpen = async (who) => {
    const box = await waitFor(() => findSearch(), 10000);
    if (!box) return false;
    setText(box, who);
    await sleep(1800);
    const row = await waitFor(() => firstResult(box), 5000);
    if (!row) return false;
    click(row);
    return true;
  };

  // «new message» (the pencil, then «پیام جدید»): its list has a search box of its own
  const viaNewMessage = async (who) => {
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
    return searchAndOpen(who);
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
      history.replaceState(null, '', location.pathname + location.search);
      say('در حال آماده کردن گفتگو…');
      // a copy of the text as a safety net; never waited for (the browser may ask for permission and wait)
      if (job.text) { try { navigator.clipboard.writeText(job.text).catch(() => {}); } catch (e) { /* no clipboard */ } }

      let opened = false;
      if (target) {
        location.hash = target;
        opened = !!(await waitFor(findComposer, 10000));
      } else if (job.who) {
        say('در حال پیدا کردن «' + job.who + '»…');
        opened = (await searchAndOpen(job.who)) && !!(await waitFor(findComposer, 6000));
        if (!opened) {
          say('راه دوم: پیام جدید…');
          opened = (await viaNewMessage(job.who)) && !!(await waitFor(findComposer, 6000));
        }
      }
      if (!opened) {
        say('مشتری پیدا نشد یا گفتگو باز نشد' + (job.text ? '؛ متن پیام کپی شده است، با Ctrl+V بچسبانید' : '') + '.', 'error');
        return;
      }
      if (!job.text) { say('گفتگو باز شد.', 'ok'); return; }
      const box = findComposer();
      setText(box, job.text);
      await sleep(400);
      const now = (box.value !== undefined ? box.value : box.innerText) || '';
      if (!now.trim()) {
        say('گفتگو باز شد ولی متن نشست؛ با Ctrl+V بچسبانید.', 'error');
        return;
      }
      if (job.send) {
        sendEnter(box);
        say('پیام فرستاده شد.', 'ok');
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
