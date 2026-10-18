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

const recentLog = [];
const log = (...a) => {
  console.log(...a);
  recentLog.push(a.join(' '));
  if (recentLog.length > 120) recentLog.shift();
};
const toLatin = (s) => String(s ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

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

export function customerBody(c) {
  const company = c.kind === 'COMPANY';
  const person = company ? { Name: c.company || c.name, LastName: '' } : c.firstName || c.lastName ? { Name: c.firstName || '', LastName: c.lastName || '' } : splitName(c.name);
  const phone = (c.phones || []).map(toLatin).find((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(p.replace(/[\s-]/g, ''))) || toLatin((c.phones || [])[0] || '');
  const body = {
    GUID: guidFrom('customer:' + c.id),
    PhoneNumber: phone.replace(/[\s-]/g, ''),
    CustomerType: company ? 2 : 1,
    ...person,
    Addresses: [], // an address needs Sepidar's own city numbers; the customer is registered without one
  };
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

/** Registers a customer in Sepidar; when the Sepidar user has no right to do that, says exactly what to change instead of a bare 403. */
export async function createCustomer(sp, body) {
  const info = await sp.info();
  if (info.CanRegisterCustomer === false) {
    throw new Error(`کاربر «${sp.cfg.userName}» در سپیدار اجازهٔ ثبت مشتری ندارد. در سپیدار برای همین کاربر دسترسی «ثبت مشتری» (مشتریان ← ایجاد) را فعال کنید، بعد دوباره امتحان کنید.`);
  }
  return sp.post('/api/Customers', body);
}

/** The customer Sepidar already has for this body: the same mobile (last nine digits) or the same national code. takenIds = Sepidar customers already tied to another Hoormand customer. */
export function matchSepidarCustomer(body, list, takenIds = new Set()) {
  const tail = (v) => {
    const d = toLatin(String(v || '')).replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : '';
  };
  const phone = tail(body.PhoneNumber);
  const nid = toLatin(String(body.NationalID || '')).replace(/\D/g, '');
  for (const c of list) {
    const id = c.CustomerID;
    if (takenIds.has(id)) continue;
    const phones = [c.PhoneNumber, c.MobileNumber, c.Phone].map(tail).filter(Boolean);
    if ((phone && phones.includes(phone)) || (nid && toLatin(String(c.NationalID || '')).replace(/\D/g, '') === nid)) return c;
  }
  return null;
}

/** The customers tied by hand in Hoormand to a customer Sepidar already had (Hoormand customer id -> Sepidar CustomerID). An older Hoormand without this answers nothing. */
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
  const goods = items.filter((i) => i.Type !== 2 && String(i.Code ?? i.ItemCode ?? '').trim());
  const codeOf = new Map(goods.map((i) => [i.ItemID, String(i.Code ?? i.ItemCode).trim()]));
  const sums = new Map(); // "product|warehouse" -> quantity (a product with tracings has one row per tracing)
  for (const r of inventories) {
    const pc = codeOf.get(r.ItemRef ?? r.ItemID);
    const wc = stockCode.get(r.StockRef ?? r.StockID);
    const q = Number(r.Quantity ?? r.Qty ?? r.Balance ?? r.Remaining ?? r.CurrentQuantity ?? r.StockQuantity ?? r.Count ?? 0);
    if (!pc || !wc || !Number.isFinite(q)) continue;
    sums.set(pc + '|' + wc, (sums.get(pc + '|' + wc) || 0) + q);
  }
  return {
    complete: true,
    warehouses: stocks.map((w) => ({ code: String(w.Code ?? w.StockID).trim(), title: w.Title || String(w.Code), active: w.IsActive !== false, location: String(w.Address ?? w.Location ?? '').slice(0, 200), extra: scalars(w, ['StockID', 'Code', 'Title', 'IsActive']) })),
    products: goods.map((i) => ({ code: String(i.Code ?? i.ItemCode).trim(), title: i.Title || String(i.Code ?? i.ItemCode), unit: unitTitle.get(i.UnitRef) || '', group: groupOf(i) || '', barcode: i.Barcode || '', active: i.IsActive !== false, extra: scalars(i, ['ItemID', 'Code', 'Title', 'Barcode', 'IsActive']) })),
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
  for (const path of ['/api/ItemCategories', '/api/ItemGroups', '/api/ItemGroupings', '/api/ItemCategory', '/api/Categories']) {
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
  log(`  گروه کالا: فهرست گروه‌ها پیدا نشد (فیلد کالا: ${field})`);
  return () => '';
}

/** When no address gives the stock: ask the service itself which addresses it has (its documentation page / swagger) and list the ones about stock and items in the report. */
async function discoverEndpoints(sp) {
  const found = new Set();
  for (const doc of ['/swagger/docs/v1', '/swagger/v1/swagger.json', '/swagger/v1/swagger.yaml', '/help', '/api/help', '/api', '/']) {
    try {
      const data = await sp.raw('GET', doc);
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      const paths = data && typeof data === 'object' && data.paths ? Object.keys(data.paths) : [...text.matchAll(/\/api\/[A-Za-z0-9_\/{}.-]+/g)].map((m) => m[0]);
      paths.filter((x) => /stock|inventor|item|ware|balance/i.test(x)).forEach((x) => found.add(x));
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
  const report = { customersNew: 0, customersFail: 0, quotationsNew: 0, quotationsSkip: 0, quotationsFail: 0 };
  log(apply ? '--- ثبت واقعی در سپیدار ---' : '--- فقط نمایش (چیزی ثبت نمی‌شود؛ برای ثبت --apply را اضافه کنید) ---');

  const hoormandCustomers = await hoormandAll(cfg, '/customers', 'customers');
  const sepidarCustomers = await sp.get('/api/Customers');
  const byGuid = new Map(sepidarCustomers.map((c) => [String(c.GUID || '').toLowerCase(), c.CustomerID]));
  const links = await hoormandLinks(cfg);
  const taken = new Set([...Object.values(state.customers), ...links.values()]);
  const refOf = new Map(); // hoormand customer id -> Sepidar CustomerID

  for (const c of hoormandCustomers) {
    const body = customerBody(c);
    const existing = byGuid.get(body.GUID.toLowerCase()) ?? state.customers[c.id] ?? links.get(c.id);
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
    if (!apply) {
      log(`  مشتری تازه: ${body.Name} ${body.LastName} ${body.PhoneNumber}`);
      report.customersNew++;
      refOf.set(c.id, 'NEW'); // only for the preview: the quotations of this customer are shown as if it already existed
      continue;
    }
    try {
      const r = await createCustomer(sp, body);
      state.customers[c.id] = r.CustomerID;
      refOf.set(c.id, r.CustomerID);
      saveState(state);
      report.customersNew++;
      log(`  مشتری ثبت شد: ${body.Name} ${body.LastName} (شناسه ${r.CustomerID})`);
    } catch (e) {
      report.customersFail++;
      log(`  خطا در ثبت مشتری «${body.Name} ${body.LastName}»: ${e.message}`);
    }
  }

  if (sync.quotations) {
    const items = await sp.get('/api/Items');
    const itemsByCode = new Map(items.filter((i) => i.IsActive !== false && i.IsSellable !== false).map((i) => [String(i.Code).trim(), i]));
    const deals = await hoormandAll(cfg, '/deals', 'deals');
    for (const d of deals) {
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
  log(`خلاصه: مشتری تازه ${report.customersNew}، پیش‌فاکتور تازه ${report.quotationsNew}، ردشده ${report.quotationsSkip}، خطا ${report.customersFail + report.quotationsFail}`);
  return report;
}

// ---------- requests from Hoormand's people (the «jobs») ----------
async function hoormandGetOne(cfg, p) {
  return hoormand(cfg, p);
}

async function sepidarCustomerRef(cfg, sp, state, c) {
  state.customers ||= {};
  if (state.customers[c.id]) return state.customers[c.id];
  const body = customerBody(c);
  const list = await sp.get('/api/Customers');
  const found = list.find((x) => String(x.GUID || '').toLowerCase() === body.GUID.toLowerCase());
  if (found) {
    state.customers[c.id] = found.CustomerID;
    return found.CustomerID;
  }
  const tied = (await hoormandLinks(cfg)).get(c.id);
  if (tied) {
    state.customers[c.id] = tied;
    return tied;
  }
  const taken = new Set([...Object.values(state.customers), ...(await hoormandLinks(cfg)).values()]);
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
    const body = customerBody(c);
    const list = await sp.get('/api/Customers');
    const found = list.find((x) => String(x.GUID || '').toLowerCase() === body.GUID.toLowerCase()) || (state.customers?.[c.id] ? list.find((x) => x.CustomerID === state.customers[c.id]) : null);
    state.customers ||= {};
    if (!found) {
      if (!body.Name) throw new Error('مشتری نام ندارد.');
      const r = await createCustomer(sp, body);
      state.customers[c.id] = r.CustomerID;
      return { sepidarId: r.CustomerID, message: 'مشتری در سپیدار ثبت شد.' };
    }
    state.customers[c.id] = found.CustomerID;
    const cur = await sp.get('/api/Customers/' + found.CustomerID);
    const upd = { PhoneNumber: body.PhoneNumber, Version: cur.Version };
    if (body.NationalID) upd.NationalID = body.NationalID;
    if (body.EconomicCode) upd.EconomicCode = body.EconomicCode;
    if (body.BirthDate) upd.BirthDate = body.BirthDate;
    await sp.call('PUT', '/api/Customers/' + found.CustomerID, upd);
    return { sepidarId: found.CustomerID, message: 'اطلاعات مشتری در سپیدار بروزرسانی شد.' };
  },

  async 'quotation.send'(cfg, sp, state, job) {
    const deal = await hoormandGetOne(cfg, '/deals/' + encodeURIComponent(job.data.dealId));
    const c = await hoormandGetOne(cfg, '/customers/' + encodeURIComponent(deal.customerId));
    const customerRef = await sepidarCustomerRef(cfg, sp, state, c);
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
  const { jobs } = await hoormand(cfg, '/sepidar/jobs');
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
  await tryPush('balances', '/api/Customers', (x) => pick(x, ['CustomerID', 'Title', 'Remainder', 'CreditRemainder']));
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
          log('اجرای خودکار فعال شد و همین الان هم شروع به کار کرد (بی‌صدا، در پس‌زمینه). گزارش کارها در فایل sepidar.log است.');
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
    let nextFull = 0;
    let nextUpdate = 0;
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
          await cmdSync(cfg);
          await cmdCache(cfg);
          nextFull = Date.now() + cfg.sync.intervalMinutes * 60000;
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
