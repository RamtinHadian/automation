#!/usr/bin/env node
// هورمند ← سپیدار: مشتری‌های تازه و پیش‌فاکتورهای هورمند را در سپیدار ثبت می‌کند.
//
//   node sepidar-sync.mjs setup           راه‌اندازی خودکار (کد اتصال هورمند، سریال سپیدار، اجرای خودکار)
//   node sepidar-sync.mjs register        یک‌بار: معرفی این برنامه به سپیدار
//   node sepidar-sync.mjs test            آزمایش اتصال به هورمند و سپیدار (چیزی نمی‌نویسد)
//   node sepidar-sync.mjs sync            نشان می‌دهد چه چیزهایی ثبت می‌شود (چیزی نمی‌نویسد)
//   node sepidar-sync.mjs sync --apply    ثبت واقعی در سپیدار
//   node sepidar-sync.mjs watch --apply   هر چند دقیقه همین کار را تکرار می‌کند
//   node sepidar-sync.mjs stock           نشان می‌دهد چه کالا و موجودی‌ای به هورمند می‌رود (چیزی نمی‌نویسد)
//   node sepidar-sync.mjs jobs            درخواست‌های همکاران هورمند (صدور فاکتور، ثبت دریافتی…) را یک‌بار انجام می‌دهد
//   node sepidar-sync.mjs cache           فاکتورها، قیمت‌ها، حساب‌های بانکی و مانده مشتری‌ها را برای هورمند می‌فرستد
//   node sepidar-sync.mjs stock --apply   کالاها و موجودی انبارهای سپیدار را به هورمند می‌فرستد
import './console-fa.mjs'; // Persian text in the Windows console: joined letters, right order
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { Sepidar, guidFrom, netFetch, aesEncrypt, aesDecrypt, publicKeyFromXml, rsaEncrypt, md5 } from './sepidar-client.mjs';
import { selfUpdate } from './updater.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const apply = args.includes('--apply');
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : '';
};
const cfgPath = flag('--config') || path.join(dir, 'config.json');
const statePath = flag('--state') || path.join(dir, 'state.json');

// In the automatic mode the program writes its own report to sepidar-log.txt (opened and closed for every line, so it can be renamed): at 1 MB the file
// becomes sepidar-log-old.txt and a new one starts, so the two together never pass 2 MB. Nothing more goes to the screen / to sepidar.log, which the
// start-up script keeps open and which therefore cannot be shortened from inside (it used to grow by many MB a day).
function startFileLog() {
  const file = path.join(dir, 'sepidar-log.txt');
  const old = path.join(dir, 'sepidar-log-old.txt');
  const toScreen = console.log.bind(console);
  const write = (a) => {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, old);
      const t = new Date();
      const stamp = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
      fs.appendFileSync(file, `${stamp}  ${a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ')}\n`);
    } catch {
      toScreen(...a);
    }
  };
  console.log = (...a) => write(a);
}
const recentLog = [];
const log = (...a) => {
  console.log(...a);
  // the report in Hoormand is for finding what went wrong: the one-line-per-customer notes of the customer synchronisation would fill it, so they are left out
  const line = a.join(' ');
  if (/از قبل هست|مشتری تازه ساخته نشد|ثبت شد:|بروز شد:/.test(line)) return;
  recentLog.push(line);
  if (recentLog.length > 120) recentLog.shift();
};
const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

// Hoormand's requests (and the sign of life the page shows) must not wait for a long synchronisation: while it runs, the loops below call
// pumpJobs() between customers, pushes and quotations. The automatic mode (watch) puts the real function here; everywhere else it does nothing.
let pumpJobs = async () => false;

function loadConfig() {
  if (!fs.existsSync(cfgPath)) {
    console.error(`فایل تنظیمات پیدا نشد: ${cfgPath}\nفایل config.example.json را کپی کنید، اسمش را config.json بگذارید و پر کنید.`);
    process.exit(1);
  }
  const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  for (const [k, v] of [['hoormand.url', c.hoormand?.url], ['hoormand.apiKey', c.hoormand?.apiKey], ['sepidar.url', c.sepidar?.url], ['sepidar.serial', c.sepidar?.serial], ['sepidar.userName', c.sepidar?.userName], ['sepidar.password', c.sepidar?.password]]) {
    if (!v || /^\s*$/.test(v) || /[؀-ۿ]|example\.com|xxxx/i.test(v)) {
      console.error(`در config.json مقدار «${k}» را بنویسید.`);
      process.exit(1);
    }
  }
  return { sync: {}, ...c, sync: { customers: true, quotations: true, stock: true, inventoryPath: '/api/Items/Inventories', currencyRef: 1, saleTypeRef: 1, stockRef: null, priceMultiplier: 1, expireDays: 30, intervalMinutes: 10, ...(c.sync || {}) } };
}

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { customers: {}, quotations: {} };
  }
};
const saveState = (s) => fs.writeFileSync(statePath, JSON.stringify(s, null, 2));

// ---------- Hoormand ----------
const hFetch = (u, o) => netFetch(u, o, 'هورمند');
/** The version of this program as Hoormand shows it (the number of the Hoormand release in which its files were last changed). */
export const TOOL_VERSION = '1.66.3';

async function hoormand(cfg, p) {
  const res = await netFetch(cfg.hoormand.url.replace(/\/+$/, '') + '/api/ext/v1' + p, { headers: { Authorization: 'Bearer ' + cfg.hoormand.apiKey } }, 'هورمند');
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`هورمند (${res.status}): ${j.error || res.statusText}`);
  return j;
}

async function hoormandPost(cfg, p, body) {
  const res = await hFetch(cfg.hoormand.url.replace(/\/+$/, '') + '/api/ext/v1' + p, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.hoormand.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`هورمند (${res.status}): ${res.status === 403 ? 'این کلید دسترسی «همگام‌سازی انبار» ندارد؛ در کنسول هورمند آن را برای کلید تیک بزنید.' : j.error || res.statusText}`);
  return j;
}

async function hoormandAll(cfg, p, key) {
  const out = [];
  for (let offset = 0; ; offset += 200) {
    const j = await hoormand(cfg, `${p}${p.includes('?') ? '&' : '?'}limit=200&offset=${offset}`);
    const rows = j[key] || [];
    out.push(...rows);
    if (rows.length < 200) return out;
  }
}

// ---------- what goes to Sepidar ----------
const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/);
  return parts.length > 1 ? { Name: parts.slice(0, -1).join(' '), LastName: parts[parts.length - 1] } : { Name: parts[0] || '', LastName: '' };
};


// ---------- the address: the same in Hoormand and in Sepidar ----------
// Sepidar keeps an address as {Title, IsMain, CityRef, Address, ZipCode, ...}; CityRef is Sepidar's own number of the city
// (GET /api/AdministrativeDivisions: provinces with no parent, cities under them). The city of the Hoormand customer is looked up there by name.

const faNorm = (s) =>
  toLatin(String(s ?? ''))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\s]+/g, ' ')
    .replace(/^(استان|شهرستان|شهر)\s+/, '')
    .trim();

/** Sepidar's list of provinces and cities (read once and kept for the run); an empty list when this Sepidar does not answer. */
export async function loadDivisions(sp) {
  if (sp._divisions) return sp._divisions;
  let list = [];
  for (const p of ['/api/AdministrativeDivisions', '/api/AdministrativeDivisions/Paginated/?limit=5000&offset=0']) {
    try {
      const r = await sp.get(p);
      const rows = Array.isArray(r) ? r : Array.isArray(r?.Result) ? r.Result : [];
      if (rows.length) {
        list = rows;
        break;
      }
    } catch {
      /* the next address */
    }
  }
  sp._divisions = list;
  return list;
}

/** Sepidar's number of the city: a city of that name under the customer's province (cities, not provinces, are preferred); null when it is not found. */
export function cityRefFor(divs, province, city) {
  const name = faNorm(city);
  if (!name || !Array.isArray(divs) || divs.length === 0) return null;
  const byId = new Map(divs.map((d) => [d.DivisionID, d]));
  const up = (d) => {
    const chain = [];
    for (let x = d, n = 0; x && n < 6; x = byId.get(x.ParentDivisionRef), n++) chain.push(faNorm(x.Title));
    return chain;
  };
  const hits = divs.filter((d) => faNorm(d.Title) === name);
  if (!hits.length) return null;
  const prov = faNorm(province);
  const cities = hits.filter((d) => d.ParentDivisionRef != null);
  const pool = cities.length ? cities : hits;
  const inProvince = prov ? pool.find((d) => up(d).slice(1).includes(prov)) : null;
  return (inProvince || pool[0]).DivisionID;
}

/**
 * The city field of the customer is empty: the city is looked for in the written address (a city of Sepidar's list that stands there as a whole word).
 * Only a clear, single answer is used (two different cities in the text = no guess); returns the title of the city or "".
 */
export function guessCityFromText(divs, text) {
  const t = ' ' + faNorm(text).replace(/[،,.\-–:؛()\/\\]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (!Array.isArray(divs) || divs.length === 0 || t.trim().length < 3) return '';
  const titles = new Set();
  for (const d of divs) {
    if (d.ParentDivisionRef == null) continue; // provinces are not cities
    const name = faNorm(d.Title);
    if (name.length >= 3 && t.includes(' ' + name + ' ')) titles.add(name);
  }
  // a short name inside a longer one that is also there («کاشان» inside «نوش‌آباد کاشان»...) counts once: keep only the names that no other found name contains
  const all = [...titles];
  const own = all.filter((n) => !all.some((m) => m !== n && m.includes(n)));
  return own.length === 1 ? own[0] : '';
}

/** The street part of the address: Sepidar has the province and the city in CityRef, so they are not written again at the start of the text. */
export function addressText(c) {
  const full = String(c.address || '').trim();
  let a = full;
  for (const part of [c.province, c.city]) {
    if (!part) continue;
    const esc = String(part).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    a = a.replace(new RegExp('^\\s*(?:استان\\s+|شهر\\s+)?' + esc + '\\s*[،,\\-–]*\\s*'), '');
  }
  return a.trim() || full;
}

/** The main address for Sepidar, or { note } saying why it cannot be sent. */
/** Sepidar keeps its text with the Arabic letters ي and ك (its own search finds only those): Persian ی and ک are turned into them before anything is sent. */
export const arabicLetters = (t) => String(t ?? '').replace(/ی/g, 'ي').replace(/ک/g, 'ك');

export function addressFor(c, divs) {
  const text = addressText(c);
  const zip = toLatin(c.postalCode || '').replace(/\D/g, '');
  if (!text && !zip) return null;
  let guess = '';
  let cityRef = cityRefFor(divs, c.province, c.city);
  if (cityRef == null && !c.city) {
    guess = guessCityFromText(divs, c.address || '');
    if (guess) cityRef = cityRefFor(divs, c.province, guess);
  }
  if (cityRef == null) {
    const why = !c.city ? 'شهر مشتری در هورمند نوشته نشده و در متن نشانی هم نام یک شهر روشن پیدا نشد؛ شهر را در فرم مشتری بنویسید' : !divs || divs.length === 0 ? 'فهرست شهرهای سپیدار خوانده نشد' : `شهر «${c.city}» در فهرست مناطق سپیدار پیدا نشد`;
    return { note: `نشانی فرستاده نشد (${why}).` };
  }
  return { address: { Title: 'نشانی اصلی', IsMain: true, CityRef: cityRef, Address: arabicLetters(text), ZipCode: zip, Latitude: 0, Longitude: 0, GUID: guidFrom('address:' + c.id) }, guess };
}

export function customerBody(c, divs = []) {
  const company = c.kind === 'COMPANY';
  // a legal customer in Sepidar has no family name: the name of the company's representative is written after the company name, with a dash (the other way, it would not fit anywhere)
  const companyName = String(c.company || c.name || '').trim();
  const rep = String(c.repName || '').trim();
  const person = company ? { Name: rep && !companyName.includes(rep) ? `${companyName} - ${rep}` : companyName, LastName: '' } : c.firstName || c.lastName ? { Name: c.firstName || '', LastName: c.lastName || '' } : splitName(c.name);
  const phone = (c.phones || []).map(toLatin).find((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(p.replace(/[\s-]/g, ''))) || toLatin((c.phones || [])[0] || '');
  const body = {
    GUID: guidFrom('customer:' + c.id),
    PhoneNumber: phone.replace(/[\s-]/g, ''),
    CustomerType: company ? 2 : 1,
    ...person,
    Addresses: [], // the main address (below) when its city is found in Sepidar's own list
  };
  const a = addressFor(c, divs);
  if (a?.address) body.Addresses.push(a.address);
  body.Name = arabicLetters(body.Name);
  body.LastName = arabicLetters(body.LastName);
  const nid = toLatin(company ? c.nationalId : c.nationalCode);
  if (nid) body.NationalID = nid;
  if (company && c.economicCode) body.EconomicCode = toLatin(c.economicCode);
  if (!company && c.birthDate) body.BirthDate = c.birthDate;
  return body;
}

/** Raw bytes of one file Hoormand holds for this program (the update). */
async function hoormandBytes(cfg, p) {
  const res = await netFetch(cfg.hoormand.url.replace(/\/+$/, '') + '/api/ext/v1' + p, { headers: { Authorization: 'Bearer ' + cfg.hoormand.apiKey } }, 'هورمند');
  if (!res.ok) throw new Error(`هورمند (${res.status}): فایل بروزرسانی داده نشد.`);
  return Buffer.from(await res.arrayBuffer());
}

/** Compares this program's files with Hoormand's copy and replaces the ones that differ; returns the names that changed. */
async function runUpdate(cfg) {
  return selfUpdate({ dir, get: (p) => hoormand(cfg, p), getFile: (name) => hoormandBytes(cfg, '/sepidar/tool/' + encodeURIComponent(name)), log });
}

async function cmdUpdate(cfg) {
  const r = await runUpdate(cfg);
  if (r.updated.length === 0) return log('برنامه به‌روز است (همان نسخه‌ای که هورمند دارد).');
  log(`برنامه بروزرسانی شد (${r.updated.length} فایل). اگر برنامهٔ خودکار در حال اجراست، خودش دوباره بالا می‌آید؛ در غیر این‌صورت برنامه را ببندید و دوباره باز کنید.`);
}

/** After an update the running program starts a fresh copy of itself (writing to the same log) and ends. */
function restartSelf() {
  const logFd = fs.openSync(path.join(dir, 'sepidar.log'), 'a');
  spawn(process.execPath, process.argv.slice(1), { cwd: dir, detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true }).unref();
  setTimeout(() => process.exit(0), 300);
}

/**
 * Registers a customer in Sepidar. The sign-in answer's «CanRegisterCustomer» is only a hint (a user who can register customers in the Sepidar
 * program itself may still show «false» there), so the registration is always really tried; when Sepidar refuses it (403) the message says
 * what to change, and carries `status` 403 so the caller stops after the first refusal instead of trying every customer again.
 */
export async function createCustomer(sp, body) {
  if (!body.PhoneNumber) throw new Error('این مشتری شمارهٔ تلفن ندارد؛ سپیدار شمارهٔ تلفن را الزامی می‌داند. در هورمند برایش شماره‌ای بنویسید و دوباره بفرستید.');
  const info = await sp.info();
  try {
    return await sp.post('/api/Customers', body);
  } catch (e) {
    if (!(e && e.status === 403)) throw e;
    const flag = info.CanRegisterCustomer === false ? 'در پاسخ ورود هم نوشته که این کاربر اجازهٔ ثبت مشتری ندارد' : 'در پاسخ ورود چنین چیزی نیامده بود';
    const err = new Error(
      `کاربر «${sp.cfg.userName}» در سپیدار اجازهٔ ثبت مشتری ندارد: سرویس سپیدار ثبت را با ۴۰۳ رد کرد (${flag}). ` +
        'در سپیدار برای همین کاربر دسترسی «ثبت مشتری» (مشتریان ← ایجاد) را فعال کنید، بعد دوباره امتحان کنید. ' +
        'اگر در خود برنامهٔ سپیدار با همین کاربر می‌توانید طرف حساب بسازید، دسترسی او به سرویس‌ها (یکپارچه‌سازی) را هم بررسی کنید؛ ممکن است از دسترسی برنامه جدا باشد. ' +
        'در «تاریخچهٔ فراخوانی سرویس» سپیدار هم می‌شود دید این درخواست چه ثبت شده است.'
    );
    err.status = 403;
    throw err;
  }
}

/**
 * The customer Sepidar already has for this body: the same mobile (last nine digits) or the same national code. takenIds = Sepidar customers already tied to another Hoormand customer.
 * extraPhones = the other numbers of the Hoormand customer (the body carries only one): any of them equal to a number in Sepidar is the same person.
 */
export function matchSepidarCustomer(body, list, takenIds = new Set(), extraPhones = []) {
  const tail = (v) => {
    const d = toLatin(String(v || '')).replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : '';
  };
  const mine = new Set([body.PhoneNumber, ...extraPhones].map(tail).filter(Boolean));
  const nid = toLatin(String(body.NationalID || '')).replace(/\D/g, '');
  for (const c of list) {
    const id = c.CustomerID;
    if (takenIds.has(id)) continue;
    const phones = [c.PhoneNumber, c.MobileNumber, c.Phone].map(tail).filter(Boolean);
    if (phones.some((p) => mine.has(p)) || (nid && toLatin(String(c.NationalID || '')).replace(/\D/g, '') === nid)) return c;
  }
  // no number or code in common (Sepidar's record often has none): the SAME full name, when only one free Sepidar customer carries it, is the same person
  const nm = (v) => String(v || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const mineName = nm(`${body.Name || ''} ${body.LastName || ''}`);
  if (mineName.length >= 6) {
    const same = list.filter((c) => !takenIds.has(c.CustomerID) && (nm(c.Title) === mineName || nm(`${c.Name || ''} ${c.LastName || ''}`) === mineName));
    if (same.length === 1) return same[0];
  }
  return null;
}

/** The customers tied by hand in Hoormand to a customer Sepidar already had (Hoormand customer id -> Sepidar CustomerID). An older Hoormand without this answers nothing. */
/**
 * The Sepidar customers that already belong to a Hoormand customer (other than `exceptRef`). A tie that the program remembers for a Hoormand customer that is
 * not in Hoormand any more (deleted there) does not hold its Sepidar record: that record is free to be updated again. Without an answer from Hoormand the
 * remembered ties all count, as before.
 */
async function takenIds(cfg, state, exceptRef = null) {
  let links = null;
  try {
    const j = await hoormand(cfg, '/sepidar/links');
    links = new Map((j.links || []).map((l) => [l.ref, l.sepidarId]));
  } catch { /* an older Hoormand: the program's own memory is all there is */ }
  const out = new Set();
  for (const [ref, id] of Object.entries(state.customers || {})) if (ref !== exceptRef && (!links || links.has(ref))) out.add(id);
  if (links) for (const [ref, id] of links) if (ref !== exceptRef) out.add(id);
  return out;
}

async function hoormandLinks(cfg) {
  try {
    const j = await hoormand(cfg, '/sepidar/links');
    return new Map((j.links || []).map((l) => [l.ref, l.sepidarId]));
  } catch {
    return new Map();
  }
}

const round = (n) => Math.round(n);
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 86400000).toISOString();

/** Returns { body } for Sepidar, or { skip: reason }. */
export function quotationBody(deal, customerRef, itemsByCode, sync) {
  const mult = Number(sync.priceMultiplier) || 1;
  const rows = [];
  let price = 0;
  let discount = 0;
  let tax = 0;
  const pct = Number(deal.discountPercent) || 0;
  const taxPct = Number(deal.taxPercent) || 0;
  let n = 0;
  for (const it of deal.items) {
    n++;
    const code = toLatin(it.code || '').trim();
    if (!code) return { skip: `ردیف ${n} («${it.title}») کد کالا ندارد` };
    const item = itemsByCode.get(code);
    if (!item) return { skip: `کالایی با کد «${code}» در سپیدار پیدا نشد` };
    const fee = round(Number(it.unitPrice) * mult);
    const qty = Number(it.qty);
    const rowPrice = round(fee * qty);
    const rowDiscount = round((Number(it.discount) || 0) * mult) + round(((rowPrice - round((Number(it.discount) || 0) * mult)) * pct) / 100);
    const rowTax = round(((rowPrice - rowDiscount) * taxPct) / 100);
    price += rowPrice;
    discount += rowDiscount;
    tax += rowTax;
    rows.push({
      RowID: n, ItemRef: item.ItemID, TracingRef: null, StockRef: sync.stockRef ?? null, Quantity: qty, SecondaryQuantity: 0, Fee: fee, Price: rowPrice,
      Description: it.description || it.title || '', PriceInfoPercentDiscount: 0, PriceInfoPriceDiscount: 0, PriceInfoDiscountRate: 0,
      AggregateAmountPercentDiscount: 0, AggregateAmountPriceDiscount: 0, AggregateAmountDiscountRate: 0, CustomerDiscount: 0, CustomerDiscountRate: 0,
      Discount: rowDiscount, DiscountParentRef: null, Tax: rowTax, Duty: 0, Addition: 0,
    });
  }
  const date = deal.proformaAt || deal.updatedAt || deal.createdAt || new Date().toISOString();
  return {
    body: {
      GUID: guidFrom('deal:' + deal.id), CurrencyRef: sync.currencyRef, Rate: 1, Date: date, ExpirationDate: addDays(date, sync.expireDays),
      CustomerRef: customerRef, AddressRef: null, SaleTypeRef: sync.saleTypeRef, DiscountOnCustomer: 0,
      Price: price, Discount: discount, Tax: tax, Duty: 0, Addition: 0, Items: rows,
    },
    total: price - discount + tax,
  };
}

/** Every plain value of a Sepidar record (text, number, yes / no), except what Hoormand already has a field for: kept with the warehouse or the product. */
const scalars = (o, skip) =>
  Object.fromEntries(
    Object.entries(o || {})
      .filter(([k, v]) => !skip.includes(k) && v !== null && v !== '' && typeof v !== 'object' && typeof v !== 'function')
      .slice(0, 40)
      .map(([k, v]) => [k, String(v).slice(0, 200)]),
  );

/** The catalogue and the stock of Sepidar's warehouses in the shape Hoormand's warehouse sync takes. */
export function stockPayload(stocks, items, units, inventories, groupOf = () => '') {
  const unitTitle = new Map(units.map((u) => [u.UnitID, u.Title]));
  const stockCode = new Map(stocks.map((w) => [w.StockID, String(w.Code ?? w.StockID).trim()]));
  // goods and services: a service (Type 2) is sent too (it is sold and priced), marked as such, and has no stock
  const listed = items.filter((i) => String(i.Code ?? i.ItemCode ?? '').trim());
  const goods = listed.filter((i) => i.Type !== 2);
  const codeOf = new Map(goods.map((i) => [i.ItemID, String(i.Code ?? i.ItemCode).trim()]));
  const sums = new Map(); // "product|warehouse" -> quantity (a product with tracings has one row per tracing)
  for (const r of inventories) {
    const pc = codeOf.get(r.ItemRef ?? r.ItemID);
    const wc = stockCode.get(r.StockRef ?? r.StockID ?? r.StockeRef); // (Sepidar's own spelling: «StockeRef»)
    const q = Number(r.Quantity ?? r.Qunatity ?? r.Qty ?? r.Balance ?? r.Remaining ?? r.CurrentQuantity ?? r.StockQuantity ?? r.Count ?? 0); // («Qunatity»: Sepidar's own spelling)
    if (!pc || !wc || !Number.isFinite(q)) continue;
    sums.set(pc + '|' + wc, (sums.get(pc + '|' + wc) || 0) + q);
  }
  return {
    complete: true,
    warehouses: stocks.map((w) => ({ code: String(w.Code ?? w.StockID).trim(), title: w.Title || String(w.Code), active: w.IsActive !== false, location: String(w.Address ?? w.Location ?? '').slice(0, 200), extra: scalars(w, ['StockID', 'Code', 'Title', 'IsActive']) })),
    products: listed.map((i) => ({ kind: i.Type === 2 ? 'service' : 'good', code: String(i.Code ?? i.ItemCode).trim(), title: i.Title || String(i.Code ?? i.ItemCode), unit: unitTitle.get(i.UnitRef) || '', group: groupOf(i) || '', barcode: i.Barcode || '', active: i.IsActive !== false, extra: scalars(i, ['ItemID', 'Code', 'Title', 'Barcode', 'IsActive']) })),
    stock: [...sums].map(([k, qty]) => { const [productCode, warehouseCode] = k.split('|'); return { productCode, warehouseCode, qty: Math.max(0, Math.round(qty * 1000) / 1000) }; }),
  };
}

/** Sepidar's versions differ in where the stock lives: the configured address first, then the usual ones (also asked warehouse by warehouse); the first that answers with rows wins. */
async function readInventories(sp, cfg, stocks = []) {
  const paths = [...new Set([cfg.sync.inventoryPath, '/api/Items/Inventories', '/api/ItemStockSummaries', '/api/ItemStocks', '/api/ItemStockSummary', '/api/Inventories', '/api/Stocks/Inventories', '/api/StockItems', '/api/Items/StockSummaries', '/api/StockSummaries'].filter(Boolean))];
  for (const path of paths) {
    try {
      const rows = await sp.get(path);
      log(`  موجودی از ${path}: ${Array.isArray(rows) ? rows.length : 'پاسخ نامعتبر'} ردیف`);
      if (Array.isArray(rows) && rows.length) return { rows, path };
      if (Array.isArray(rows)) {
        // the address exists but wants the warehouse: ask for every warehouse in turn
        const all = [];
        for (const w of stocks.slice(0, 80)) {
          try {
            const part = await sp.get(`${path}?StockRef=${w.StockID}`);
            if (Array.isArray(part)) for (const r of part) all.push({ StockRef: w.StockID, ...r });
          } catch {
            break;
          }
        }
        log(`  موجودی از ${path} به تفکیک انبار: ${all.length} ردیف`);
        if (all.length) return { rows: all, path };
      }
    } catch (e) {
      log(`  ${path}: ${e.message}`);
    }
  }
  return { rows: [], path: null };
}

/** The groups of the goods: a function that gives the group name (with its parents, «پدر / فرزند») of an item. Nothing is guessed: no answer = no group. */
async function readItemGroups(sp, items) {
  const field = items[0] ? Object.keys(items[0]).find((k) => /(Category|Group|Grouping)(Ref|ID|Id)$/i.test(k) && !/Customer|Supplier|Tax|Price|Sale|Intermediary/i.test(k)) : null;
  if (!field) {
    log('  گروه کالا: فیلد گروه در آیتم‌ها پیدا نشد.');
    return () => '';
  }
  for (const path of ['/api/CodingGroups', '/api/CodingGroupings', '/api/ItemCodingGroups', '/api/Items/CodingGroups', '/api/ItemGroups', '/api/ItemGroupings', '/api/ItemCategories', '/api/ItemCategory', '/api/Categories']) {
    try {
      const rows = await sp.get(path);
      if (!Array.isArray(rows) || !rows.length) continue;
      const idKey = Object.keys(rows[0]).find((k) => /ID$|Id$/.test(k) && !/Parent/i.test(k));
      const parentKey = Object.keys(rows[0]).find((k) => /Parent(Ref|ID|Id)$/i.test(k));
      const byId = new Map(rows.map((g) => [g[idKey], g]));
      const nameOf = (g, depth = 0) => {
        const t = g.Title || g.Name || '';
        const par = parentKey && g[parentKey] != null ? byId.get(g[parentKey]) : null;
        return par && depth < 5 && par !== g ? `${nameOf(par, depth + 1)} / ${t}` : t;
      };
      log(`  گروه کالا: ${rows.length} گروه از ${path} (فیلد کالا: ${field})`);
      return (item) => {
        const g = byId.get(item[field]);
        return g ? nameOf(g) : '';
      };
    } catch (e) {
      /* try the next address */
    }
  }
  log(`  گروه کالا: فهرست نام گروه‌ها پیدا نشد (فیلد کالا: ${field}); کالاها فعلاً با شمارهٔ گروه جدا می‌شوند.`);
  await discoverEndpoints(sp, /coding|group|categor/i);
  // the names are not available: the products are at least kept apart, by the number of their group
  return (item) => (item[field] != null && item[field] !== '' ? `گروه شمارهٔ ${item[field]}` : '');
}

/** When no address gives the stock: ask the service itself which addresses it has (its documentation page / swagger) and list the ones about stock and items in the report. */
async function discoverEndpoints(sp, pattern = /stock|inventor|item|ware|balance/i) {
  const found = new Set();
  for (const doc of ['/swagger/docs/v1', '/swagger/v1/swagger.json', '/swagger/v1/swagger.yaml', '/help', '/api/help', '/api', '/']) {
    try {
      const data = await sp.raw('GET', doc);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const paths = data && typeof data === 'object' && data.paths ? Object.keys(data.paths) : [...text.matchAll(/\/api\/[A-Za-z0-9_\/{}.-]+/g)].map((m) => m[0]);
      paths.filter((x) => pattern.test(x)).forEach((x) => found.add(x));
      if (paths.length) {
        log(`  فهرست آدرس‌های سرویس از ${doc}: ${paths.length} آدرس`);
        break;
      }
    } catch {
      /* the next page */
    }
  }
  log(found.size ? `  آدرس‌های مربوط به کالا و انبار در سرویس: ${[...found].slice(0, 40).join(' | ')}` : '  فهرست آدرس‌های سرویس پیدا نشد (صفحهٔ راهنمای سرویس باز نشد).');
}

async function cmdStock(cfg) {
  const state = loadState();
  const sp = client(cfg, state);
  const [stocks, items, units] = await Promise.all([sp.get('/api/Stocks'), sp.get('/api/Items'), sp.get('/api/Units')]);
  const { rows: inventories } = await readInventories(sp, cfg, stocks);
  if (!inventories.length) await discoverEndpoints(sp);
  const groupOf = await readItemGroups(sp, items);
  const pay = stockPayload(stocks, items, units, inventories, groupOf);
  // no stock rows read (an address that does not exist in this Sepidar, or nothing matched): never tell Hoormand that every product has none
  if (!pay.stock.length) {
    pay.complete = false;
    log('  هشدار: هیچ ردیف موجودی‌ای از سپیدار خوانده نشد؛ موجودی‌های هورمند دست نمی‌خورد. فیلدهای پایین را برای بررسی بفرستید.');
  }
  // what came from Sepidar, so that an empty warehouse page can be explained from the log
  const firstKeys = (a) => (a && a[0] ? Object.keys(a[0]).slice(0, 14).join(',') : '-');
  log(`  سپیدار داد: ${stocks.length} انبار، ${items.length} آیتم، ${inventories.length} ردیف موجودی`);
  log(`  فیلدهای آیتم: ${firstKeys(items)} | فیلدهای موجودی: ${firstKeys(inventories)}`);
  log(`موجودی: ${pay.warehouses.length} انبار، ${pay.products.length} کالا، ${pay.stock.length} ردیف موجودی در سپیدار`);
  if (!apply) {
    log('(فقط نمایش؛ برای فرستادن به هورمند --apply را اضافه کنید)');
    return pay;
  }
  const r = await hoormandPost(cfg, '/warehouse/sync', pay);
  log(`به هورمند فرستاده شد: انبار تازه ${r.warehousesNew}، کالای تازه ${r.productsNew}، سند تعدیل ${r.docs}، ردیف تغییرکرده ${r.changed}`);
  try {
    await hoormandPost(cfg, '/sepidar/push', { cache: 'toolReport', items: [{ at: new Date().toISOString(), lines: recentLog.slice(-80) }] });
  } catch {
    /* an older Hoormand does not know the report */
  }
  return r;
}

// ---------- commands ----------
function client(cfg, state) {
  return new Sepidar(cfg.sepidar, state);
}

async function cmdRegister(cfg) {
  const state = loadState();
  const sp = client(cfg, state);
  const title = await sp.register();
  saveState(state);
  log(`دستگاه در سپیدار ثبت شد: «${title}». حالا «test» را اجرا کنید.`);
}

async function cmdTest(cfg) {
  log('در حال اتصال به هورمند (' + cfg.hoormand.url + ') …');
  const h = await hoormand(cfg, '/ping');
  log(`هورمند: اتصال برقرار است (کلید «${h.key}»، به نام ${h.actAs}، دسترسی‌ها: ${h.scopes.join('، ')})`);
  log('در حال اتصال به سپیدار (' + cfg.sepidar.url + ') …');
  const state = loadState();
  const sp = client(cfg, state);
  const r = await sp.login();
  saveState(state);
  log(`سپیدار: ورود موفق بود (کاربر «${r.Title}»). دسترسی ثبت مشتری: ${r.CanRegisterCustomer ? 'دارد' : 'ندارد'}`);
  log(`شکل ورود که جواب داد: نسخهٔ ${sp.cfg.generationVersion}، ${JSON.stringify(sp.shape || {})}`);
  const items = await sp.get('/api/Items');
  log(`سپیدار: ${items.length} کالا و خدمت دارد.`);
}

/** The same three calls as the Postman file, with the raw answer of Sepidar printed (nothing is changed in Sepidar except the device registration). */
async function cmdDiag(cfg) {
  const base = cfg.sepidar.url.replace(/\/+$/, '');
  const serial = cfg.sepidar.serial;
  const id = Number(String(serial).slice(0, 4));
  const show = async (title, method, p, headers, body) => {
    log(`\n=== ${title}`);
    log(`${method} ${base}${p}`);
    const res = await netFetch(base + p, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }, 'سپیدار');
    const text = await res.text();
    log(`پاسخ: ${res.status} ${res.statusText}`);
    log('هدرهای پاسخ: ' + [...res.headers.entries()].map(([k, v]) => `${k}=${v}`).join(' ; '));
    log('متن پاسخ: ' + (text.length > 600 ? text.slice(0, 600) + ' …' : text || '(خالی)'));
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { res, data, text };
  };
  log(`سریال: ${serial} | شناسهٔ یکپارچه‌سازی: ${id} | کاربر: ${cfg.sepidar.userName}`);
  const g = await show('۰) نسخهٔ API', 'GET', '/api/General/GenerationVersion', {});
  const announced = String((g.res.ok && (typeof g.data === 'object' && g.data ? g.data.GenerationVersion ?? Object.values(g.data)[0] : g.data)) ?? '').replace(/"/g, '').trim();
  const version = announced && !Number.isNaN(Number(announced)) ? announced : String(cfg.sepidar.generationVersion || '112');
  const { Cypher, IV } = aesEncrypt(serial, String(id));
  const r = await show('۱) ثبت دستگاه', 'POST', '/api/Devices/Register', { GenerationVersion: version }, { Cypher, IntegrationID: id, IV });
  if (!r.res.ok || !r.data?.Cypher) return log('\nثبت دستگاه موفق نبود؛ ورود آزمایش نمی‌شود.');
  const xml = aesDecrypt(serial, r.data.Cypher, r.data.IV);
  const pub = publicKeyFromXml(xml);
  log(`کلید باز شد: ${pub.asymmetricKeyDetails?.modulusLength} بیت | DeviceTitle: ${r.data.DeviceTitle ?? '-'}`);
  const code = crypto.randomUUID();
  const enc = rsaEncrypt(pub, code);
  const headers = { GenerationVersion: version, IntegrationID: String(id), ArbitraryCode: code, EncArbitraryCode: enc };
  log(`\nهدرهای ورود: GenerationVersion=${version} ; IntegrationID=${id} ; ArbitraryCode=${code} ; EncArbitraryCode=${enc.slice(0, 16)}… (${enc.length} نویسه)`);
  const l = await show('۲) ورود', 'POST', '/api/users/login', headers, { UserName: cfg.sepidar.userName, PasswordHash: md5(cfg.sepidar.password) });
  log(l.res.ok ? '\nنتیجه: ورود موفق بود.' : '\nنتیجه: ورود رد شد. همین خروجی را (بدون رمز؛ در آن رمزی نیست) برای پشتیبانی یا برای من بفرستید.');
}

async function cmdSync(cfg) {
  const state = loadState();
  state.customers ||= {};
  state.quotations ||= {};
  const sp = client(cfg, state);
  const sync = cfg.sync;
  const report = { customersNew: 0, customersFail: 0, customersNoPhone: 0, quotationsNew: 0, quotationsSkip: 0, quotationsFail: 0 };
  log(apply ? '--- ثبت واقعی در سپیدار ---' : '--- فقط نمایش (چیزی ثبت نمی‌شود؛ برای ثبت --apply را اضافه کنید) ---');

  const hoormandCustomers = await hoormandAll(cfg, '/customers', 'customers');
  const sepidarCustomers = await sp.get('/api/Customers');
  const byGuid = new Map(sepidarCustomers.map((c) => [String(c.GUID || '').toLowerCase(), c.CustomerID]));
  const links = await hoormandLinks(cfg);
  const taken = await takenIds(cfg, state);
  // the live list of Sepidar tells which of the remembered customers still exist (a customer deleted in Sepidar is registered again); an empty list is not trusted
  const alive = new Set(sepidarCustomers.map((c) => c.CustomerID));
  let resetCount = 0;
  const refOf = new Map(); // hoormand customer id -> Sepidar CustomerID

  const divs = await loadDivisions(sp);
  let addrNotes = 0;
  for (const c of hoormandCustomers) {
    if (await pumpJobs()) {
      Object.assign(state, loadState()); // the requests that were just done changed the saved state: take it over
      state.customers ||= {};
      state.quotations ||= {};
    }
    const body = customerBody(c, divs);
    if (addressFor(c, divs)?.note && !state.customers[c.id] && ++addrNotes <= 5) log(`  ${c.name || c.company}: ${addressFor(c, divs).note}`);
    let existing = byGuid.get(body.GUID.toLowerCase()) ?? state.customers[c.id] ?? links.get(c.id);
    if (existing && sepidarCustomers.length > 0 && !alive.has(existing)) {
      resetCount++;
      if (apply) delete state.customers[c.id];
      existing = undefined;
    }
    if (existing) {
      refOf.set(c.id, existing);
      if (!state.customers[c.id] && links.has(c.id)) state.customers[c.id] = existing;
      continue;
    }
    // Sepidar may already know this person (same mobile or national code): the customer stays under that name, no second one is made
    const same = matchSepidarCustomer(body, sepidarCustomers, taken);
    if (same) {
      const title = same.Title || `${same.Name || ''} ${same.LastName || ''}`.trim();
      log(`  در سپیدار از قبل هست: «${body.Name} ${body.LastName}» همان «${title}» است؛ مشتری تازه ساخته نشد`);
      refOf.set(c.id, same.CustomerID);
      taken.add(same.CustomerID);
      if (apply) {
        state.customers[c.id] = same.CustomerID;
        saveState(state);
      }
      continue;
    }
    if (!sync.customers) continue;
    if (!body.Name) {
      log(`  رد شد: مشتری بدون نام (${c.id})`);
      continue;
    }
    if (!body.PhoneNumber) {
      // Sepidar refuses a customer without a phone number (400): one note at the end instead of one error for each of them
      report.customersNoPhone++;
      continue;
    }
    // a customer that Sepidar refused (400) is not sent again every few minutes with the very same data: that was what made every round long
    const failKey = JSON.stringify([body.Name, body.LastName, body.PhoneNumber, body.NationalID, body.EconomicCode]);
    state.failed ||= {};
    const was = state.failed[c.id];
    if (apply && was && was.key === failKey && Date.now() - was.at < 6 * 3600 * 1000) {
      report.customersFail++;
      continue;
    }
    if (!apply) {
      log(`  مشتری تازه: ${body.Name} ${body.LastName} ${body.PhoneNumber}`);
      report.customersNew++;
      refOf.set(c.id, 'NEW'); // only for the preview: the quotations of this customer are shown as if it already existed
      continue;
    }
    try {
      const r = await createCustomer(sp, body);
      state.customers[c.id] = r.CustomerID;
      delete state.failed[c.id];
      refOf.set(c.id, r.CustomerID);
      saveState(state);
      report.customersNew++;
      log(`  مشتری ثبت شد: ${body.Name} ${body.LastName} (شناسه ${r.CustomerID})`);
    } catch (e) {
      report.customersFail++;
      if (e && e.status === 400) {
        state.failed[c.id] = { key: failKey, at: Date.now() };
        saveState(state);
      }
      if (e && e.status === 403) {
        // the Sepidar user may not register customers: one note, and the rest of the list is not tried again and again
        log(`  خطا در ثبت مشتری «${body.Name} ${body.LastName}»: ${e.message}`);
        log('  ثبت مشتری برای بقیه تا دور بعد انجام نمی‌شود (کاربر سپیدار اجازهٔ ثبت مشتری ندارد).');
        break;
      }
      log(`  خطا در ثبت مشتری «${body.Name} ${body.LastName}»: ${e.message}`);
    }
  }

  if (sync.quotations) {
    const items = await sp.get('/api/Items');
    const itemsByCode = new Map(items.filter((i) => i.IsActive !== false && i.IsSellable !== false).map((i) => [String(i.Code).trim(), i]));
    const deals = await hoormandAll(cfg, '/deals', 'deals');
    for (const d of deals) {
      if (await pumpJobs()) {
        Object.assign(state, loadState());
        state.customers ||= {};
        state.quotations ||= {};
      }
      if (!d.proformaNumber || !Array.isArray(d.items) || d.items.length === 0 || d.stage === 'LOST') continue;
      if (state.quotations[d.id]) continue;
      const label = `پیش‌فاکتور ${d.proformaNumber} (${d.customerName || ''})`;
      const customerRef = refOf.get(d.customerId);
      if (!customerRef) {
        report.quotationsSkip++;
        log(`  رد شد: ${label}، مشتری آن هنوز در سپیدار نیست`);
        continue;
      }
      const q = quotationBody(d, customerRef, itemsByCode, sync);
      if (q.skip) {
        report.quotationsSkip++;
        log(`  رد شد: ${label}، ${q.skip}`);
        continue;
      }
      if (!apply) {
        report.quotationsNew++;
        log(`  پیش‌فاکتور تازه: ${label} با ${d.items.length} ردیف، جمع ${q.total.toLocaleString('fa-IR')}`);
        continue;
      }
      try {
        const r = await sp.post('/api/Quotations', q.body);
        state.quotations[d.id] = r.ID;
        saveState(state);
        report.quotationsNew++;
        log(`  پیش‌فاکتور ثبت شد: ${label} (شمارهٔ سپیدار ${r.Number})`);
      } catch (e) {
        report.quotationsFail++;
        log(`  خطا در ثبت ${label}: ${e.message}`);
      }
    }
  }
  if (sync.stock && apply) {
    try {
      await cmdStock(cfg);
    } catch (e) {
      log(`  خطا در فرستادن موجودی انبار: ${e.message}`);
    }
  }
  saveState(state);
  if (resetCount > 0) log(`  ${resetCount} مشتری در سپیدار پاک شده بودند؛ ${apply ? 'دوباره ثبت شدند یا دوباره به مشابهشان وصل شدند' : 'در ثبت واقعی دوباره ثبت می‌شوند'}.`);
  if (report.customersNoPhone > 0) log(`  ${report.customersNoPhone} مشتری شمارهٔ تلفن ندارند و در سپیدار ثبت نشدند (سپیدار شمارهٔ تلفن را الزامی می‌داند؛ در هورمند برایشان شماره بنویسید).`);
  log(`خلاصه: مشتری تازه ${report.customersNew}، پیش‌فاکتور تازه ${report.quotationsNew}، ردشده ${report.quotationsSkip}، خطا ${report.customersFail + report.quotationsFail}`);
  return report;
}

// ---------- requests from Hoormand's people (the «jobs») ----------
async function hoormandGetOne(cfg, p) {
  return hoormand(cfg, p);
}

async function sepidarCustomerRef(cfg, sp, state, c) {
  state.customers ||= {};
  const list = await sp.get('/api/Customers');
  const alive = (id) => list.some((x) => x.CustomerID === id);
  if (state.customers[c.id]) {
    if (alive(state.customers[c.id])) return state.customers[c.id];
    delete state.customers[c.id]; // the customer was deleted in Sepidar since: it is looked for again and, if it is really gone, made again
  }
  const body = customerBody(c, await loadDivisions(sp));
  const found = list.find((x) => String(x.GUID || '').toLowerCase() === body.GUID.toLowerCase());
  if (found) {
    state.customers[c.id] = found.CustomerID;
    return found.CustomerID;
  }
  const tied = (await hoormandLinks(cfg)).get(c.id);
  if (tied && alive(tied)) {
    state.customers[c.id] = tied;
    return tied;
  }
  const taken = await takenIds(cfg, state);
  const same = matchSepidarCustomer(body, list, taken);
  if (same) {
    state.customers[c.id] = same.CustomerID;
    return same.CustomerID;
  }
  if (!body.Name) throw new Error('مشتری نام ندارد.');
  const r = await createCustomer(sp, body);
  state.customers[c.id] = r.CustomerID;
  return r.CustomerID;
}

/** Each handler returns { sepidarId, number, message, data } or throws an Error whose text is shown to the person who asked. */
export const jobHandlers = {
  async 'customer.send'(cfg, sp, state, job) {
    const c = await hoormandGetOne(cfg, '/customers/' + encodeURIComponent(job.data.customerId));
    const divs = await loadDivisions(sp);
    const body = customerBody(c, divs);
    const addr = addressFor(c, divs);
    // Sepidar's customer has ONE phone number (PhoneNumber): the mobile (else the first number) goes there; the others stay in Hoormand, and the result says so
    const sentTail = String(body.PhoneNumber || '').replace(/\D/g, '').slice(-10);
    const leftOut = [...new Set((c.phones || []).map((x) => toLatin(x).replace(/[\s-]/g, '')).filter((x) => x && x.replace(/\D/g, '').slice(-10) !== sentTail))];
    const phoneNote = leftOut.length ? ` فقط یک شمارهٔ تلفن به سپیدار می‌رود (${body.PhoneNumber}؛ موبایل در اولویت است)؛ ${leftOut.join('، ')} در سپیدار جا ندارد و در هورمند می‌ماند.` : '';
    const list = await sp.get('/api/Customers');
    let found = list.find((x) => String(x.GUID || '').toLowerCase() === body.GUID.toLowerCase()) || (state.customers?.[c.id] ? list.find((x) => x.CustomerID === state.customers[c.id]) : null);
    state.customers ||= {};
    // The same person may already be in Sepidar under another record (same mobile or national code, never tied to this Hoormand customer):
    // that record is UPDATED, no second person is made. Sepidar customers already tied to ANOTHER Hoormand customer are left alone.
    let viaMobile = false;
    if (!found) {
      const taken = await takenIds(cfg, state, c.id);
      const same = matchSepidarCustomer(body, list, taken, c.phones || []);
      if (same) {
        found = same;
        viaMobile = true;
      }
    }
    if (!found) {
      if (!body.Name) throw new Error('مشتری نام ندارد.');
      const r = await createCustomer(sp, body);
      state.customers[c.id] = r.CustomerID;
      return { sepidarId: r.CustomerID, message: 'مشتری در سپیدار ثبت شد.' + (addr?.note ? ' ' + addr.note : addr?.address ? ' نشانی هم ثبت شد.' + (addr.guess ? ` (شهر «${addr.guess}» از متن نشانی تشخیص داده شد؛ بهتر است در هورمند هم نوشته شود)` : '') : '') + phoneNote };
    }
    state.customers[c.id] = found.CustomerID;
    const cur = await sp.get('/api/Customers/' + found.CustomerID);
    // what Sepidar's customer record holds (to see whether it has a place for the related persons of «افراد مرتبط»): written to the log once per run
    if (!state.loggedCustomerKeys) { state.loggedCustomerKeys = true; log('  فیلدهای رکورد مشتری در سپیدار:', Object.keys(cur || {}).map((k) => k + (Array.isArray(cur[k]) ? '[]' : '')).join('، ')); }
    // Sepidar's documentation for the edit: PhoneNumber, BirthDate, NationalID, EconomicCode, Version and the list of addresses (an empty list = the addresses stay as they are)
    // Sepidar checks the name on every edit by the kind of the record: a real person needs a family name, a legal customer must have none. So the edit always carries
    // the names (the ones the record has now, unless they are changed below); leaving them out counts as an empty family name and a real person is refused («نام خانوادگی نباید خالی باشد»).
    const legalNow = Number(cur.CustomerType) === 2;
    const upd = { PhoneNumber: body.PhoneNumber || cur.PhoneNumber || '', Version: cur.Version, Addresses: [], Name: cur.Name || '', LastName: legalNow ? '' : cur.LastName || '' };
    if (body.NationalID) upd.NationalID = body.NationalID;
    if (body.EconomicCode) upd.EconomicCode = body.EconomicCode;
    if (body.BirthDate) upd.BirthDate = body.BirthDate;
    // the address: the main one of Sepidar is made the same as Hoormand's (the others stay as they are); without a main one the address is added
    let addrMsg = addr?.note ? ' ' + addr.note : '';
    const haveAddr = !!addr?.address;
    if (haveAddr) {
      const have = Array.isArray(cur.Addresses) ? cur.Addresses : [];
      const clean = (a) => ({ CustomerAddressID: a.CustomerAddressID, Title: a.Title, IsMain: !!a.IsMain, CityRef: a.CityRef, Address: a.Address, ZipCode: a.ZipCode, Latitude: a.Latitude ?? 0, Longitude: a.Longitude ?? 0, GUID: a.GUID });
      const main = have.find((a) => a.IsMain) || null;
      upd.Addresses = main
        ? have.map((a) => (a === main ? { ...clean(a), CityRef: addr.address.CityRef, Address: addr.address.Address, ZipCode: addr.address.ZipCode || a.ZipCode || '' } : clean(a)))
        : [...have.map(clean), addr.address];
    }
    // the edit of Hoormand goes to Sepidar whole: the name (it is in Sepidar's example of the edit) and the address are tried first; if Sepidar refuses one of them
    // the rest is still sent and the message says which one was not taken
    const path = '/api/Customers/' + found.CustomerID;
    const tries = [];
    // the name of Hoormand can be put in the record only in a form its kind accepts: a legal record takes the whole name in «Name»; a real person needs a family name
    const renameName = legalNow ? `${body.Name || ''} ${body.LastName || ''}`.trim() : body.LastName ? body.Name : '';
    const renameLast = legalNow ? '' : body.LastName || '';
    for (const names of renameName ? [true, false] : [false]) for (const adr of haveAddr ? [true, false] : [false]) tries.push({ names, adr });
    let firstErr = null;
    for (const t of tries) {
      const u = { ...upd, Addresses: t.adr ? upd.Addresses : [] };
      if (t.names) {
        u.Name = renameName;
        u.LastName = renameLast;
      }
      try {
        // Sepidar's customer may be of the LEGAL kind while Hoormand wrote the same one as a person (first + last name): a legal customer has no family name,
        // so the whole name goes into «Name» and «LastName» stays empty
        const asLegal = (x) => ({ ...x, Name: `${x.Name || ''} ${x.LastName || ''}`.trim(), LastName: '' });
        const isLegalError = (e) => !!e && e.status === 400 && /نوع حقوقی|نام خانوادگی/.test(String(e.message || ''));
        try {
          try {
            await sp.call('PUT', path, u);
          } catch (e0) {
            if (!(t.names && isLegalError(e0))) throw e0;
            try {
              await sp.call('PUT', path, asLegal(u));
            } catch (e1) {
              if (!isLegalError(e1)) throw e1;
              // some Sepidar versions refuse even an empty family name for a legal customer: the field is left out altogether
              const { LastName: _drop, ...noLast } = asLegal(u);
              await sp.call('PUT', path, noLast);
            }
          }
        } catch (e) {
          // «این رکورد توسط کاربر دیگری یا از طریق یک فرم دیگر تغییر یافته است» (400): someone (or another job) changed the customer after its Version was read.
          // The newest Version is read and the same edit is sent once more.
          if (e && e.status === 400 && /تغییر یافته|changed|modified/i.test(String(e.message || ''))) {
            const fresh = await sp.get(path);
            await sp.call('PUT', path, { ...u, Version: fresh.Version });
          } else throw e;
        }
        const notes = [];
        if (body.Name && !t.names) notes.push('نام در سپیدار بروز نشد (سپیدار ویرایش نام را نپذیرفت)');
        if (body.Name && !renameName) notes.push('نام در سپیدار عوض نشد: مشتری در سپیدار «حقیقی» است و نام خانوادگی لازم دارد، ولی در هورمند نام خانوادگی جدا نوشته نشده');
        // Sepidar may accept the edit and still leave the name as it was: the record is read again and the name compared
        if (body.Name && t.names && renameName) {
          try {
            const after = await sp.get(path);
            // the same name in the two systems is written with different ye / kaf, half spaces, dashes and blanks: those are not a difference
            const flat = (v) => String(v || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, ' ').replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().toLowerCase();
            const same = (x, y) => flat(x) === flat(y);
            // Sepidar's service changes the «Name» of a customer but leaves its «Title» (the «عنوان تفصیلی» shown in the lists) as it was made; the person is told once, when the name changes
            const nameChanged = !same(cur.Name, renameName);
            if (after.Title !== undefined && !same(after.Title, renameName) && nameChanged) {
              notes.push(`نام عوض شد ولی «عنوان تفصیلی» (که در فهرست سپیدار دیده می‌شود) هنوز «${after.Title || ''}» است؛ سپیدار آن را از طریق سرویس عوض نمی‌کند، اگر لازم است در خود سپیدار (فرم طرف حساب) عوض کنید`);
              log('  عنوان مشتری در سپیدار عوض نشد:', JSON.stringify({ title: after.Title, name: after.Name, wanted: renameName }));
            }
            if (!same(after.Name, u.Name)) {
              notes.push(`سپیدار درخواست را پذیرفت ولی نام را عوض نکرد (در سپیدار هنوز «${after.Name || ''}» است؛ می‌خواستیم «${renameName}» باشد). نام را در خود سپیدار عوض کنید`);
              log('  نام مشتری در سپیدار عوض نشد:', JSON.stringify({ before: cur.Name, sent: u.Name, after: after.Name }));
            }
          } catch { /* the check is only a help */ }
        }
        if (haveAddr && !t.adr) notes.push(`نشانی در سپیدار بروز نشد: ${firstErr?.message || ''}`);
        return { sepidarId: found.CustomerID, message: (viaMobile ? 'این شخص با همین شمارهٔ موبایل، کد ملی یا نام کامل از قبل در سپیدار بود؛ مشتری تازه‌ای ساخته نشد و همان بروزرسانی شد. ' : '') + 'اطلاعات' + (haveAddr && t.adr ? ' و نشانی' : '') + ' مشتری در سپیدار بروزرسانی شد.' + (notes.length ? ' ' + notes.join('؛ ') + '.' : '') + (addr?.note ? ' ' + addr.note : '') + (haveAddr && addr.guess ? ` (شهر «${addr.guess}» از متن نشانی تشخیص داده شد؛ بهتر است در هورمند هم نوشته شود)` : '') + phoneNote };
      } catch (e) {
        if (e && (e.status === 403 || e.status === 401)) throw e; // no right: nothing else would work either
        firstErr ||= e;
      }
    }
    throw firstErr || new Error('سپیدار بروزرسانی را نپذیرفت.');
  },

  async 'quotation.send'(cfg, sp, state, job) {
    const deal = await hoormandGetOne(cfg, '/deals/' + encodeURIComponent(job.data.dealId));
    const c = await hoormandGetOne(cfg, '/customers/' + encodeURIComponent(deal.customerId));
    let customerRef;
    try {
      customerRef = await sepidarCustomerRef(cfg, sp, state, c);
    } catch (e) {
      // a quotation needs its customer in Sepidar: say that first, then why the customer could not be put there
      throw new Error(`پیش‌فاکتور فرستاده نشد، چون مشتری «${c.name || c.company || ''}» هنوز در سپیدار نیست و ثبت او هم نشد: ${e.message}`);
    }
    const items = await sp.get('/api/Items');
    const itemsByCode = new Map(items.filter((i) => i.IsActive !== false && i.IsSellable !== false).map((i) => [String(i.Code).trim(), i]));
    const q = quotationBody(deal, customerRef, itemsByCode, cfg.sync);
    if (q.skip) throw new Error(q.skip);
    const r = await sp.post('/api/Quotations', q.body);
    state.quotations ||= {};
    state.quotations[deal.id] = r.ID;
    return { sepidarId: r.ID, number: r.Number, message: `پیش‌فاکتور با شمارهٔ ${r.Number} در سپیدار ثبت شد.` };
  },

  async 'quotation.close'(cfg, sp, state, job) {
    await sp.post(`/api/Quotations/${job.data.sepidarId}/Close/`);
    return { sepidarId: job.data.sepidarId, message: 'پیش‌فاکتور در سپیدار بسته شد.' };
  },

  async 'quotation.unclose'(cfg, sp, state, job) {
    await sp.post(`/api/Quotations/${job.data.sepidarId}/UnClose/`);
    return { sepidarId: job.data.sepidarId, message: 'پیش‌فاکتور در سپیدار باز شد.' };
  },

  async 'quotation.delete'(cfg, sp, state, job) {
    await sp.call('DELETE', `/api/Quotations/${job.data.sepidarId}`);
    if (state.quotations) delete state.quotations[job.data.dealId];
    return { sepidarId: job.data.sepidarId, message: 'پیش‌فاکتور از سپیدار حذف شد.' };
  },

  async 'invoice.fromProforma'(cfg, sp, state, job) {
    const r = await sp.post('/api/Invoices/BasedOnQuotation/', Number(job.data.sepidarId));
    return { sepidarId: r.InvoiceID, number: r.Number, message: `فاکتور فروش با شمارهٔ ${r.Number} صادر شد.` };
  },

  async 'receipt.add'(cfg, sp, state, job) {
    const mult = Number(cfg.sync.priceMultiplier) || 1;
    const d = job.data;
    const date = new Date(`${d.date}T08:00:00.000Z`).toISOString();
    const r = await sp.post('/api/Receipts/BasedOnInvoice/', {
      Guid: guidFrom('receipt:' + job.id), Date: date, Description: d.description || '', Discount: 0, InvoiceID: Number(d.sepidarId),
      Drafts: [{ Date: date, Description: d.description || '', Number: job.id.slice(-8), BankAccountID: Number(d.bankAccountId), Amount: Math.round(Number(d.amount) * mult) }],
    });
    return { sepidarId: r.ReceiptID ?? r.ID ?? 0, message: 'دریافتی در سپیدار ثبت شد.' };
  },

  async refresh(cfg, sp, state) {
    await pushCaches(cfg, sp, state);
    return { sepidarId: 0, message: 'اطلاعات سپیدار بروز شد.' };
  },
};

/** Takes the waiting requests from Hoormand, does them in Sepidar and reports each result. */
export async function cmdJobs(cfg) {
  const { jobs } = await hoormand(cfg, '/sepidar/jobs?v=' + encodeURIComponent(TOOL_VERSION));
  if (!jobs.length) return 0;
  const state = loadState();
  const sp = client(cfg, state);
  for (const job of jobs) {
    const handler = jobHandlers[job.kind];
    let result;
    try {
      if (!handler) throw new Error('این نوع درخواست را برنامه نمی‌شناسد؛ برنامهٔ واسط را بروز کنید.');
      const out = await handler(cfg, sp, state, job);
      result = { ok: true, ...out };
      log(`  انجام شد: ${job.kind} ${job.data.dealId || job.data.customerId || ''} ← ${out.message}`);
    } catch (e) {
      result = { ok: false, message: String(e.message || e).slice(0, 380) };
      log(`  انجام نشد: ${job.kind}: ${result.message}`);
    }
    saveState(state);
    try {
      await hoormandPost(cfg, `/sepidar/jobs/${encodeURIComponent(job.id)}/result`, result);
    } catch (e) {
      log(`  خطا در گزارش نتیجه به هورمند: ${e.message}`);
    }
  }
  return jobs.length;
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** Sends copies of what Sepidar knows (invoices, banks, price lists, balances…) and the links between Hoormand's records and Sepidar's. */
export async function pushCaches(cfg, sp, state) {
  const push = (cache, items) => hoormandPost(cfg, '/sepidar/push', { cache, items });
  const tryPush = async (cache, path, map) => {
    if (await pumpJobs()) Object.assign(state, loadState());
    try {
      const list = await sp.get(path);
      log(`  ${cache}: ${Array.isArray(list) ? list.length : 0} ردیف از ${path}${list && list[0] ? ' | فیلدها: ' + Object.keys(list[0]).slice(0, 12).join(',') : ''}`);
      await push(cache, (Array.isArray(list) ? list : []).map(map));
    } catch (e) {
      log(`  ${cache}: خوانده نشد (${e.message})`);
    }
  };
  // an invoice is sent with the customer's name, its description and the names of its goods, so that all of them can be searched in Hoormand
  const nameOfCustomer = new Map();
  const titleOfItem = new Map();
  try {
    for (const c of await sp.get('/api/Customers')) nameOfCustomer.set(c.CustomerID, c.Title || `${c.Name || ''} ${c.LastName || ''}`.trim());
    for (const i of await sp.get('/api/Items')) titleOfItem.set(i.ItemID, i.Title || '');
  } catch (e) {
    log(`  نام مشتری و کالا برای فاکتورها خوانده نشد (${e.message})`);
  }
  await tryPush('invoices', '/api/Invoices', (x) => ({
    ...pick(x, ['InvoiceID', 'ID', 'Number', 'Date', 'CustomerRef', 'QuotationRef', 'Price', 'Discount', 'Tax', 'NetPrice']),
    CustomerName: nameOfCustomer.get(x.CustomerRef) || x.CustomerTitle || x.CustomerName || '',
    Description: [x.Description, x.Title, x.Comment, x.Memo].filter(Boolean).join(' · ').slice(0, 400),
    Goods: (Array.isArray(x.Items) ? x.Items : []).map((it) => titleOfItem.get(it.ItemRef) || it.Title || it.Description || '').filter(Boolean).slice(0, 30).join('، ').slice(0, 600),
  }));
  // The goods leave the warehouse with the sales invoices: the lines of the newest invoices are sent too («saleDocs»), so that Hoormand
  // can show them as outgoing documents. The list of invoices has no lines; each invoice is opened once and remembered in state.json.
  try {
    const codeOfItem = new Map();
    for (const i of await sp.get('/api/Items')) codeOfItem.set(i.ItemID, { code: String(i.Code ?? ''), title: i.Title || '' });
    const list = await sp.get('/api/Invoices');
    const known = (state.saleDocs = state.saleDocs || {});
    const day = (x) => String(x.Date || '').slice(0, 10);
    const fresh = (Array.isArray(list) ? list : []).filter((x) => !known[String(x.InvoiceID ?? x.ID)]).sort((a, b) => day(b).localeCompare(day(a))).slice(0, 25);
    for (const x of fresh) {
      const id = x.InvoiceID ?? x.ID;
      try {
        const full = await sp.get('/api/Invoices/' + id);
        const lines = (Array.isArray(full.InvoiceItems) ? full.InvoiceItems : []).map((it) => ({ code: codeOfItem.get(it.ItemRef)?.code || '', title: codeOfItem.get(it.ItemRef)?.title || '', qty: Number(it.Quantity) || 0 })).filter((l) => l.qty);
        known[String(id)] = { id: String(id), number: full.Number ?? x.Number, date: day(full) || day(x), customerName: nameOfCustomer.get(full.CustomerRef ?? x.CustomerRef) || '', lines };
      } catch (e) {
        log(`  اقلام فاکتور ${id} خوانده نشد (${String(e.message).slice(0, 80)})`);
      }
    }
    const docs = Object.values(known).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 400);
    for (const k of Object.keys(known)) if (!docs.includes(known[k])) delete known[k];
    log(`  saleDocs: ${docs.length} فاکتور با اقلام (${fresh.length} تازه)`);
    await push('saleDocs', docs);
    saveState(state);
  } catch (e) {
    log(`  saleDocs: خوانده نشد (${e.message})`);
  }
  await tryPush('quotations', '/api/Quotations', (x) => ({
    ...pick(x, ['ID', 'Number', 'Date', 'CustomerRef', 'Price', 'NetPrice']),
    CustomerName: nameOfCustomer.get(x.CustomerRef) || x.CustomerTitle || x.CustomerName || '',
    Description: [x.Description, x.Title, x.Comment, x.Memo].filter(Boolean).join(' · ').slice(0, 400),
    Goods: (Array.isArray(x.Items) ? x.Items : []).map((it) => titleOfItem.get(it.ItemRef) || it.Title || it.Description || '').filter(Boolean).slice(0, 30).join('، ').slice(0, 600),
  }));
  await tryPush('banks', '/api/banks', (x) => pick(x, ['BankID', 'Title']));
  await tryPush('bankAccounts', '/api/BankAccounts', (x) => pick(x, ['BankAccountID', 'DlCode', 'DlTitle', 'CurrencyRef']));
  await tryPush('saleTypes', '/api/SaleTypes', (x) => pick(x, ['SaleTypeID', 'Title']));
  await tryPush('currencies', '/api/Currencies', (x) => pick(x, ['CurrencyID', 'Title', 'IsMain']));
  await tryPush('customerGroups', '/api/CustomerGroupings', (x) => pick(x, ['CustomerGroupingID', 'Title']));
  await tryPush('sepidarCustomers', '/api/Customers', (x) => ({ id: x.CustomerID, code: x.Code ?? x.CustomerCode ?? '', name: x.Title || `${x.Name || ''} ${x.LastName || ''}`.trim(), phones: [x.PhoneNumber, x.MobileNumber, x.Phone].filter(Boolean), nationalId: x.NationalID || '' }));
  await tryPush('balances', '/api/Customers', (x) => ({ ...pick(x, ['CustomerID', 'Title', 'CreditRemainder', 'QuantityCreditRemainder', 'RemainderWithoutCheque']), Remainder: x.Remainder ?? x.AccountingRemainder ?? 0 }));
  try {
    const [notes, items] = await Promise.all([sp.get('/api/PriceNoteItems'), sp.get('/api/Items')]);
    const byId = new Map(items.map((i) => [i.ItemID, i]));
    // only SELLING prices go to Hoormand: a price note without a sale type, or one marked as a purchase price, is left out
    const isSelling = (n) => n.SaleTypeRef != null && !/buy|purchase|supply/i.test(String(n.Type ?? n.PriceNoteType ?? n.Kind ?? ''));
    await push('priceNotes', notes.filter(isSelling).map((n) => ({ saleTypeRef: n.SaleTypeRef, itemRef: n.ItemRef, code: byId.get(n.ItemRef)?.Code, title: byId.get(n.ItemRef)?.Title, fee: n.Fee, groupingRef: n.CustomerGroupingRef })));
  } catch (e) {
    log(`  priceNotes: خوانده نشد (${e.message})`);
  }
  const links = [];
  for (const [ref, id] of Object.entries(state.customers || {})) links.push({ kind: 'customer', ref, sepidarId: id });
  for (const [ref, id] of Object.entries(state.quotations || {})) links.push({ kind: 'quotation', ref, sepidarId: id });
  if (links.length) await hoormandPost(cfg, '/sepidar/push', { links });
  // what the program saw in Sepidar, for the manager's «گزارش ابزار» panel (it shows why a list is empty)
  try {
    await push('toolReport', [{ at: new Date().toISOString(), lines: recentLog.slice(-80) }]);
  } catch {
    /* an older Hoormand does not know the report */
  }
}

/**
 * Windows only. A scheduled task every 5 minutes starts the program again when it is not running (it was closed, it crashed, or the computer
 * started and nobody has signed in yet), so «سپیدار جواب نمی‌دهد» in Hoormand mends itself. Made once, from the folder the program runs in.
 */
function ensureWatchdog() {
  if (process.platform !== 'win32') return;
  try {
    let taskThere = false;
    try {
      execFileSync('schtasks', ['/Query', '/TN', 'HoormandSepidarWatch'], { stdio: 'pipe' });
      taskThere = true;
    } catch {
      /* not there yet */
    }
    const q = (x) => '""' + x + '""';
    const vbs = path.join(dir, 'نگهبان.vbs');
    const start = `cmd /c cd /d ${q(dir)} && ${q(process.execPath)} ${q(path.join(dir, 'sepidar-sync.mjs'))} watch --apply >> ${q(path.join(dir, 'sepidar.log'))} 2>&1`;
    const content = [
        'Set svc = GetObject("winmgmts:' + '\\\\.' + '\\root\\cimv2")',
        `Set procs = svc.ExecQuery("Select CommandLine From Win32_Process Where Name = 'node.exe'")`,
        'running = False',
        'For Each p In procs',
        '  If Not IsNull(p.CommandLine) Then',
        '    If InStr(p.CommandLine, "sepidar-sync.mjs") > 0 And InStr(p.CommandLine, "watch") > 0 Then running = True',
        '  End If',
        'Next',
        `If Not running Then CreateObject("Wscript.Shell").Run "${start}", 0, False`,
      ].join(String.fromCharCode(13, 10)) + String.fromCharCode(13, 10);
    // the task of an earlier installation may still be there while its file is gone (or points to another folder): the file and the task are made again
    let same = false;
    try {
      same = fs.readFileSync(vbs, 'utf8') === content;
    } catch {
      /* the file is not there */
    }
    if (taskThere && same) return;
    fs.writeFileSync(vbs, content);
    execFileSync('schtasks', ['/Create', '/TN', 'HoormandSepidarWatch', '/SC', 'MINUTE', '/MO', '5', '/RL', 'LIMITED', '/F', '/TR', `wscript.exe "${vbs}"`], { stdio: 'pipe' });
    log('نگهبان ساخته شد: هر ۵ دقیقه بررسی می‌شود برنامه روشن باشد و اگر خاموش بود خودش دوباره روشن می‌شود.');
  } catch (e) {
    log(`  نگهبان ساخته نشد (${String(e.message).slice(0, 100)}); برای ساخت آن یک‌بار برنامه را با «Run as administrator» اجرا کنید.`);
  }
}

async function cmdCache(cfg) {
  const state = loadState();
  const sp = client(cfg, state);
  await pushCaches(cfg, sp, state);
  saveState(state);
  log('اطلاعات سپیدار برای هورمند فرستاده شد.');
}

// ---------- one-time automatic setup ----------
import readline from 'node:readline';
import { withHelp } from './config-help.mjs';
import { execFileSync, spawn } from 'node:child_process';

function makePrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let muted = false;
  const orig = rl._writeToOutput;
  rl._writeToOutput = function (s) {
    if (muted && s !== '\r\n' && s !== '\n') return; // the password is not shown while it is typed
    orig.call(rl, s);
  };
  return {
    ask: (q, def = '', secret = false) =>
      new Promise((resolve) => {
        const hint = def && !secret ? ` [${def}]` : secret && def ? ' [همان قبلی: Enter]' : '';
        rl.question(`${q}${hint}: `, (a) => {
          muted = false;
          if (secret) process.stdout.write('\n');
          resolve(a.trim() || def);
        });
        muted = secret;
      }),
    close: () => rl.close(),
  };
}

async function hoormandPing(url, key) {
  const res = await hFetch(url.replace(/\/+$/, '') + '/api/ext/v1/ping', { headers: { Authorization: 'Bearer ' + key } });
  return res.ok ? res.json() : null;
}

async function cmdSetup() {
  const cur = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
  const pr = makePrompter();
  const val = async (flagName, q, def, secret) => (flag(flagName) !== '' && flag(flagName) !== undefined ? flag(flagName) : args.includes('--yes') && def ? def : pr.ask(q, def, secret));
  try {
    log('راه‌اندازی خودکار اتصال هورمند و سپیدار\n');
    const hUrl = (await val('--hoormand', 'نشانی هورمند', cur.hoormand?.url || '')).replace(/\/+$/, '');
    if (!hUrl) throw new Error('نشانی هورمند لازم است.');
    let key = cur.hoormand?.apiKey || '';
    const code = flag('--code');
    if (code || !key || !(await hoormandPing(hUrl, key).catch(() => null))) {
      const c = code || (await pr.ask('کد اتصال (در هورمند: منوی «سپیدار» ← «ساخت کد اتصال»)'));
      const res = await hFetch(hUrl + '/api/ext/v1/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `هورمند جواب نداد (${res.status})`);
      key = j.key;
      log('  کلید اتصال از هورمند گرفته شد.');
    } else {
      log('  کلید هورمند از قبل کار می‌کند.');
    }
    log('\nحالا اطلاعات سپیدار (فقط روی همین کامپیوتر ذخیره می‌شود):');
    const sUrl = await val('--sepidar', 'نشانی سرویس سپیدار', cur.sepidar?.url || 'http://localhost:7373');
    const serial = await val('--serial', 'سریال دستگاه (کد هشت‌حرفی که سپیدار داده)', cur.sepidar?.serial || '');
    const user = await val('--user', 'نام کاربری سپیدار', cur.sepidar?.userName || '');
    const pass = flag('--password') || (await pr.ask('رمز سپیدار', cur.sepidar?.password || '', true));
    if (!serial || !user || !pass) throw new Error('سریال، نام کاربری و رمز سپیدار لازم است.');
    const cfg = { hoormand: { url: hUrl, apiKey: key }, sepidar: { url: sUrl, serial, userName: user, password: pass }, sync: { ...(cur.sync || {}) } };
    const state = loadState();
    const probe = { ...cfg, sync: { customers: true, quotations: true, stock: true, inventoryPath: '/api/Items/Inventories', ...cfg.sync } };
    const sp = client(probe, state);
    if (!state.publicKeyXml) {
      log('\nمعرفی این برنامه به سپیدار…');
      try {
        await sp.register();
        saveState(state);
      } catch (e) {
        throw new Error(`ثبت دستگاه در سپیدار نشد (${e.message}). در سپیدار «دستگاه جدید» تعریف کنید، سریال را از آن بردارید و دوباره اجرا کنید؛ و مطمئن شوید دکمهٔ سبز «شروع» سرویس سپیدار روشن است.`);
      }
    }
    const r = await sp.login();
    saveState(state);
    log(`  ورود به سپیدار موفق بود (کاربر «${r.Title}»).`);
    // what can be found by itself is not asked
    try {
      const cur2 = await sp.get('/api/Currencies');
      const main = cur2.find((x) => x.IsMain) || cur2[0];
      if (main && cfg.sync.currencyRef === undefined) cfg.sync.currencyRef = main.CurrencyID;
    } catch {
      /* the default stays */
    }
    try {
      const types = await sp.get('/api/SaleTypes');
      if (types.length && cfg.sync.saleTypeRef === undefined) {
        let pick = types[0];
        if (types.length > 1 && !args.includes('--yes')) {
          log('\nنوع‌های فروش در سپیدار:');
          types.forEach((t, i) => log(`  ${i + 1}) ${t.Title}`));
          const n = Number(await pr.ask('پیش‌فاکتورها با کدام نوع فروش ثبت شود؟ (شماره)', '1'));
          pick = types[(Number.isInteger(n) && n >= 1 && n <= types.length ? n : 1) - 1];
        }
        cfg.sync.saleTypeRef = pick.SaleTypeID;
        log(`  نوع فروش: «${pick.Title}»`);
      }
    } catch {
      /* the default stays */
    }
    if (cfg.sync.priceMultiplier === undefined) {
      const m = flag('--multiplier');
      if (m) cfg.sync.priceMultiplier = Number(m) || 1;
      else {
        const a = args.includes('--yes') ? 'بله' : await pr.ask('قیمت‌ها در هورمند «تومان» است و در سپیدار «ریال»؟ (بله/خیر)', 'بله');
        cfg.sync.priceMultiplier = /^(بله|y|yes|آره)/i.test(a) ? 10 : 1;
      }
    }
    fs.writeFileSync(cfgPath, JSON.stringify(withHelp(cfg), null, 2));
    log('\nتنظیمات روی این کامپیوتر ذخیره شد.');
    const full = loadConfig();
    const h = await hoormand(full, '/ping');
    log(`هورمند: اتصال برقرار است (دسترسی‌ها: ${h.scopes.join('، ')})`);
    if (!h.scopes.includes('sepidar.connect')) log('  هشدار: این کلید دسترسی «اتصال برنامهٔ سپیدار» ندارد؛ با کد اتصال تازه دوباره راه‌اندازی کنید.');
    await pushCaches(full, sp, state);
    saveState(state);
    log('اطلاعات سپیدار (فاکتورها، قیمت‌ها، حساب‌های بانکی…) برای هورمند فرستاده شد.');

    if (!args.includes('--no-autostart') && process.platform === 'win32') {
      const yes = args.includes('--yes') ? true : /^(بله|y|yes|آره)/i.test(await pr.ask('\nبرنامه هر بار که کامپیوتر روشن شد خودکار اجرا شود؟ (بله/خیر)', 'بله'));
      if (yes) {
        const vbs = path.join(dir, 'اجرای-پنهان.vbs');
        const q = (s) => '""' + s + '""';
        fs.writeFileSync(vbs, `CreateObject("Wscript.Shell").Run "cmd /c cd /d ${q(dir)} && ${q(process.execPath)} ${q(path.join(dir, 'sepidar-sync.mjs'))} watch --apply >> ${q(path.join(dir, 'sepidar.log'))} 2>&1", 0, False\r\n`);
        try {
          execFileSync('schtasks', ['/Create', '/TN', 'HoormandSepidar', '/SC', 'ONLOGON', '/RL', 'LIMITED', '/F', '/TR', `wscript.exe "${vbs}"`], { stdio: 'pipe' });
          spawn('wscript.exe', [vbs], { detached: true, stdio: 'ignore' }).unref();
          log('اجرای خودکار فعال شد و همین الان هم شروع به کار کرد (بی‌صدا، در پس‌زمینه). گزارش کارها در فایل sepidar-log.txt است (حجمش خودکار کم می‌ماند).');
        } catch (e) {
          log(`ساخت اجرای خودکار نشد (${String(e.message).slice(0, 120)}). فایل «۵-اجرای-خودکار» را باز بگذارید.`);
        }
      }
    }
    log('\nتمام شد. از حالا فقط کافی است سپیدار روشن باشد (و دکمهٔ سبز «شروع» سرویسش).');
  } finally {
    pr.close();
  }
}

async function main() {
  if (cmd === 'help' || cmd === '--help') {
    log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  if (cmd === 'ui') {
    const { startUi } = await import('./ui.mjs');
    return startUi({ dir, cfgPath, script: fileURLToPath(import.meta.url) });
  }
  if (cmd === 'setup') return cmdSetup();
  if (cmd === 'diag') {
    let c = {};
    try {
      c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch {
      /* the values come from the flags */
    }
    const ok = (v) => typeof v === 'string' && v.trim() !== '' && !/[؀-ۿ]|example\.com|xxxx/i.test(v);
    const pick = (f, v) => flag(f) || (ok(v) ? v : '');
    const s = { url: pick('--sepidar', c.sepidar?.url) || 'http://localhost:7373', serial: pick('--serial', c.sepidar?.serial), userName: pick('--user', c.sepidar?.userName), password: pick('--password', c.sepidar?.password), generationVersion: c.sepidar?.generationVersion };
    if (!s.serial || !s.userName || !s.password) {
      console.error('برای تشخیص: --serial و --user و --password را بدهید (یا در config.json بنویسید).');
      process.exit(1);
    }
    return cmdDiag({ sepidar: s });
  }
  if (cmd === 'update') return cmdUpdate(loadConfig());
  const cfg = loadConfig();
  if (cmd === 'register') return cmdRegister(cfg);
  if (cmd === 'test') return cmdTest(cfg);
  if (cmd === 'diag') return cmdDiag(cfg);
  if (cmd === 'sync') return cmdSync(cfg);
  if (cmd === 'stock') return cmdStock(cfg);
  if (cmd === 'jobs') return log(`${await cmdJobs(cfg)} درخواست انجام شد.`);
  if (cmd === 'cache') return cmdCache(cfg);
  if (cmd === 'watch') {
    // requests from Hoormand's people are looked at every few seconds; the full synchronisation runs every intervalMinutes
    startFileLog();
    let nextFull = 0;
    let nextUpdate = 0;
    let lastJobs = 0;
    let inPump = false;
    pumpJobs = async () => {
      if (inPump || Date.now() - lastJobs < (cfg.sync.jobSeconds || 15) * 1000) return false;
      inPump = true;
      try {
        return (await cmdJobs(cfg)) > 0;
      } catch (e) {
        log('خطا:', e.message);
        return false;
      } finally {
        inPump = false;
        lastJobs = Date.now();
      }
    };
    ensureWatchdog();
    for (;;) {
      try {
        if (cfg.autoUpdate !== false && Date.now() >= nextUpdate) {
          nextUpdate = Date.now() + 60 * 60000; // looks for a new version of the program every hour (and at start)
          try {
            const r = await runUpdate(cfg);
            if (r.updated.length) {
              log(`برنامه از هورمند بروزرسانی شد (${r.updated.join('، ')}). در حال راه‌اندازی دوبارهٔ خودکار…`);
              return restartSelf();
            }
          } catch (e) {
            log('  بروزرسانی انجام نشد:', e.message);
          }
        }
        if (Date.now() >= nextFull) {
          // the next full round is fixed first: when this one fails (Sepidar refuses, is switched off...) it waits the same time instead of
          // trying again every 15 seconds, and - most important - a failed round never stops the program from taking Hoormand's requests below
          nextFull = Date.now() + Math.max(5, Number(cfg.sync.intervalMinutes) || 10) * 60000;
          try {
            await cmdSync(cfg);
            await cmdCache(cfg);
          } catch (e) {
            log('همگام‌سازی کامل انجام نشد:', e.message);
            if (/دستگاه غیر فعال|دستگاه نامعتبر|کد دستگاه/.test(String(e.message))) {
              log('  راه‌حل: در سپیدار (برنامه در حالت سرویس‌دهنده روشن باشد) از «سفارش‌گیری و پخش» ← «دستگاه‌ها» ببینید دستگاه هورمند فعال است و کاربر دارد.');
              log('  اگر دستگاه حذف شده بود، دستگاه تازه بسازید، سریال تازه را در config.json بنویسید و ثبت دستگاه را دوباره اجرا کنید.');
            }
          }
        }
        await cmdJobs(cfg);
      } catch (e) {
        log('خطا:', e.message);
      }
      await new Promise((r) => setTimeout(r, (cfg.sync.jobSeconds || 15) * 1000));
    }
  }
  console.error('دستور نامعتبر. help را اجرا کنید.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error('خطا:', e.message);
    // not process.exit(): on Windows it can crash with a libuv assertion while a network connection is still closing
    process.exitCode = 1;
  });
}
