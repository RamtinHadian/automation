// Takes the pictures for the introduction brochure from the running demo (http://localhost:8095, demo / demo).
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const fs = require('fs');
const OUT = 'D:/Project/Automation/guide/img/intro';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8095';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const lg = await (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'demo', password: 'demo' }) })).json();
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });

  const open = async (w, h, mobile, path = '/') => {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1.5, isMobile: mobile, hasTouch: mobile });
    await p.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await p.evaluate((t) => { localStorage.setItem('app_token_v6', t); localStorage.setItem('admin_session_auth_v5', '1'); }, lg.token);
    await p.goto(BASE + path, { waitUntil: 'networkidle2' });
    await sleep(3500);
    return p;
  };
  const tidy = (p) => p.evaluate(() => {
    document.querySelectorAll('[role=alert]').forEach((e) => e.remove());
    const kill = (txt) => [...document.querySelectorAll('div')].filter((d) => (d.textContent || '').includes(txt) && getComputedStyle(d).position === 'fixed' && (d.textContent || '').length < 400).forEach((d) => d.remove());
    [...document.querySelectorAll('body *')].filter((d) => getComputedStyle(d).position === 'fixed' && /نسخهٔ نمایشی/.test(d.textContent || '') && (d.textContent || '').length < 220).forEach((d) => d.remove());
    kill('برای فعال شدن اینجا را لمس کنید');
    // the pop-up cards that stack in a corner
    [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).position === 'fixed' && /صدا هنوز فعال نشده/.test(d.textContent || '')).forEach((d) => d.remove());
  });
  const click = async (p, re, nth = 0) => {
    await p.evaluate((src, nth) => { const r = new RegExp(src); const t = [...document.querySelectorAll('button,a')].filter((x) => r.test((x.textContent || '').trim()) && x.offsetParent); const el = nth < 0 ? t[t.length + nth] : t[nth]; el && el.click(); }, re, nth);
    await sleep(1100);
  };
  const shot = async (p, name, clip) => {
    await tidy(p);
    await sleep(300);
    await p.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
    console.log('saved', name);
  };

  // ---------- desktop ----------
  let p = await open(1440, 900, false);
  await click(p, '^مشتریان', 0);
  await sleep(800);
  await shot(p, 'crm-today');
  for (const [tab, name] of [['^فرصت‌های فروش$', 'crm-pipeline'], ['^تیم$', 'crm-team'], ['^باشگاه مشتریان$', 'crm-club'], ['^تقویم$', 'crm-calendar']]) {
    await click(p, tab, -1);
    await sleep(700);
    await shot(p, name);
  }
  await click(p, '^انبار$', 0);
  await sleep(900);
  await shot(p, 'warehouse');
  await click(p, '^نامه', 0);
  await sleep(900);
  await shot(p, 'letters');
  await click(p, '^وظایف', 0);
  await sleep(900);
  await shot(p, 'tasks');
  await click(p, '^گارانتی$', 0);
  await sleep(900);
  await shot(p, 'warranty');
  await click(p, '^پشتیبانی$', 0);
  await sleep(900);
  await shot(p, 'support');
  await click(p, '^گزارشات', 0);
  await sleep(1500);
  await shot(p, 'reports');
  await click(p, '^امور اداری', 0);
  await click(p, '^درخواست مرخصی|مرخصی', 0);
  await shot(p, 'leave');
  await p.close();

  // ---------- the management console ----------
  p = await open(1440, 900, false, '/admin');
  await shot(p, 'admin-home');
  await click(p, 'کاربران', 0);
  await click(p, '^جدول مجوزها$', 0);
  await sleep(900);
  await shot(p, 'admin-permissions');
  await p.close();

  // ---------- phone ----------
  p = await open(390, 844, true);
  await click(p, '^مشتریان', 0);
  await sleep(900);
  const toTabs = () => p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^امروز من$/.test((x.textContent || '').trim())); (b?.parentElement?.parentElement || b)?.scrollIntoView(); window.scrollBy(0, 285); });
  await toTabs();
  await shot(p, 'phone-today');
  await click(p, '^فرصت‌های فروش$', -1);
  await sleep(700);
  await toTabs();
  await shot(p, 'phone-pipeline');
  await click(p, '^باشگاه مشتریان$', -1);
  await sleep(700);
  await toTabs();
  await shot(p, 'phone-club');
  await p.close();
  await b.close();
})();
