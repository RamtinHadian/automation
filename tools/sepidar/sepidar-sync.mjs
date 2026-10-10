#!/usr/bin/env node
// هورمند ← سپیدار: مشتری‌های تازه و پیش‌فاکتورهای هورمند را در سپیدار ثبت می‌کند.
//
//   node sepidar-sync.mjs register        یک‌بار: معرفی این برنامه به سپیدار
//   node sepidar-sync.mjs test            آزمایش اتصال به هورمند و سپیدار (چیزی نمی‌نویسد)
//   node sepidar-sync.mjs sync            نشان می‌دهد چه چیزهایی ثبت می‌شود (چیزی نمی‌نویسد)
//   node sepidar-sync.mjs sync --apply    ثبت واقعی در سپیدار
//   node sepidar-sync.mjs watch --apply   هر چند دقیقه همین کار را تکرار می‌کند
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sepidar, guidFrom } from './sepidar-client.mjs';

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

const log = (...a) => console.log(...a);
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
  return { sync: {}, ...c, sync: { customers: true, quotations: true, currencyRef: 1, saleTypeRef: 1, stockRef: null, priceMultiplier: 1, expireDays: 30, intervalMinutes: 10, ...(c.sync || {}) } };
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
async function hoormand(cfg, p) {
  const res = await fetch(cfg.hoormand.url.replace(/\/+$/, '') + '/api/ext/v1' + p, { headers: { Authorization: 'Bearer ' + cfg.hoormand.apiKey } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`هورمند (${res.status}): ${j.error || res.statusText}`);
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
  const h = await hoormand(cfg, '/ping');
  log(`هورمند: اتصال برقرار است (کلید «${h.key}»، به نام ${h.actAs}، دسترسی‌ها: ${h.scopes.join('، ')})`);
  const state = loadState();
  const sp = client(cfg, state);
  const r = await sp.login();
  saveState(state);
  log(`سپیدار: ورود موفق بود (کاربر «${r.Title}»). دسترسی ثبت مشتری: ${r.CanRegisterCustomer ? 'دارد' : 'ندارد'}`);
  const items = await sp.get('/api/Items');
  log(`سپیدار: ${items.length} کالا و خدمت دارد.`);
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
  const refOf = new Map(); // hoormand customer id -> Sepidar CustomerID

  for (const c of hoormandCustomers) {
    const body = customerBody(c);
    const existing = byGuid.get(body.GUID.toLowerCase()) ?? state.customers[c.id];
    if (existing) {
      refOf.set(c.id, existing);
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
      const r = await sp.post('/api/Customers', body);
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
  saveState(state);
  log(`خلاصه: مشتری تازه ${report.customersNew}، پیش‌فاکتور تازه ${report.quotationsNew}، ردشده ${report.quotationsSkip}، خطا ${report.customersFail + report.quotationsFail}`);
  return report;
}

async function main() {
  if (cmd === 'help' || cmd === '--help') {
    log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return;
  }
  const cfg = loadConfig();
  if (cmd === 'register') return cmdRegister(cfg);
  if (cmd === 'test') return cmdTest(cfg);
  if (cmd === 'sync') return cmdSync(cfg);
  if (cmd === 'watch') {
    for (;;) {
      try {
        await cmdSync(cfg);
      } catch (e) {
        log('خطا:', e.message);
      }
      await new Promise((r) => setTimeout(r, cfg.sync.intervalMinutes * 60000));
    }
  }
  console.error('دستور نامعتبر. help را اجرا کنید.');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error('خطا:', e.message);
    process.exit(1);
  });
}
