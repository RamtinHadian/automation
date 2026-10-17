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
import { Sepidar, guidFrom, netFetch } from './sepidar-client.mjs';

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

/** The catalogue and the stock of Sepidar's warehouses in the shape Hoormand's warehouse sync takes. */
export function stockPayload(stocks, items, units, inventories) {
  const unitTitle = new Map(units.map((u) => [u.UnitID, u.Title]));
  const stockCode = new Map(stocks.map((w) => [w.StockID, String(w.Code ?? w.StockID).trim()]));
  const goods = items.filter((i) => (i.Type === undefined || i.Type === 1) && String(i.Code ?? '').trim());
  const codeOf = new Map(goods.map((i) => [i.ItemID, String(i.Code).trim()]));
  const sums = new Map(); // "product|warehouse" -> quantity (a product with tracings has one row per tracing)
  for (const r of inventories) {
    const pc = codeOf.get(r.ItemRef ?? r.ItemID);
    const wc = stockCode.get(r.StockRef ?? r.StockID);
    const q = Number(r.Quantity ?? r.Qty ?? 0);
    if (!pc || !wc || !Number.isFinite(q)) continue;
    sums.set(pc + '|' + wc, (sums.get(pc + '|' + wc) || 0) + q);
  }
  return {
    complete: true,
    warehouses: stocks.map((w) => ({ code: String(w.Code ?? w.StockID).trim(), title: w.Title || String(w.Code), active: w.IsActive !== false })),
    products: goods.map((i) => ({ code: String(i.Code).trim(), title: i.Title || String(i.Code), unit: unitTitle.get(i.UnitRef) || '', barcode: i.Barcode || '', active: i.IsActive !== false })),
    stock: [...sums].map(([k, qty]) => { const [productCode, warehouseCode] = k.split('|'); return { productCode, warehouseCode, qty: Math.max(0, Math.round(qty * 1000) / 1000) }; }),
  };
}

async function cmdStock(cfg) {
  const state = loadState();
  const sp = client(cfg, state);
  const [stocks, items, units, inventories] = await Promise.all([sp.get('/api/Stocks'), sp.get('/api/Items'), sp.get('/api/Units'), sp.get(cfg.sync.inventoryPath)]);
  const pay = stockPayload(stocks, items, units, inventories);
  log(`موجودی: ${pay.warehouses.length} انبار، ${pay.products.length} کالا، ${pay.stock.length} ردیف موجودی در سپیدار`);
  if (!apply) {
    log('(فقط نمایش؛ برای فرستادن به هورمند --apply را اضافه کنید)');
    return pay;
  }
  const r = await hoormandPost(cfg, '/warehouse/sync', pay);
  log(`به هورمند فرستاده شد: انبار تازه ${r.warehousesNew}، کالای تازه ${r.productsNew}، سند تعدیل ${r.docs}، ردیف تغییرکرده ${r.changed}`);
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
  if (!body.Name) throw new Error('مشتری نام ندارد.');
  const r = await sp.post('/api/Customers', body);
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
      const r = await sp.post('/api/Customers', body);
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
      await push(cache, (Array.isArray(list) ? list : []).map(map));
    } catch (e) {
      log(`  ${cache}: خوانده نشد (${e.message})`);
    }
  };
  await tryPush('invoices', '/api/Invoices', (x) => pick(x, ['InvoiceID', 'ID', 'Number', 'Date', 'CustomerRef', 'QuotationRef', 'Price', 'Discount', 'Tax', 'NetPrice']));
  await tryPush('quotations', '/api/Quotations', (x) => pick(x, ['ID', 'Number', 'Date', 'CustomerRef', 'Price', 'NetPrice']));
  await tryPush('banks', '/api/banks', (x) => pick(x, ['BankID', 'Title']));
  await tryPush('bankAccounts', '/api/BankAccounts', (x) => pick(x, ['BankAccountID', 'DlCode', 'DlTitle', 'CurrencyRef']));
  await tryPush('saleTypes', '/api/SaleTypes', (x) => pick(x, ['SaleTypeID', 'Title']));
  await tryPush('currencies', '/api/Currencies', (x) => pick(x, ['CurrencyID', 'Title', 'IsMain']));
  await tryPush('customerGroups', '/api/CustomerGroupings', (x) => pick(x, ['CustomerGroupingID', 'Title']));
  await tryPush('balances', '/api/Customers', (x) => pick(x, ['CustomerID', 'Title', 'Remainder', 'CreditRemainder']));
  try {
    const [notes, items] = await Promise.all([sp.get('/api/PriceNoteItems'), sp.get('/api/Items')]);
    const byId = new Map(items.map((i) => [i.ItemID, i]));
    await push('priceNotes', notes.map((n) => ({ saleTypeRef: n.SaleTypeRef, itemRef: n.ItemRef, code: byId.get(n.ItemRef)?.Code, title: byId.get(n.ItemRef)?.Title, fee: n.Fee, groupingRef: n.CustomerGroupingRef })));
  } catch (e) {
    log(`  priceNotes: خوانده نشد (${e.message})`);
  }
  const links = [];
  for (const [ref, id] of Object.entries(state.customers || {})) links.push({ kind: 'customer', ref, sepidarId: id });
  for (const [ref, id] of Object.entries(state.quotations || {})) links.push({ kind: 'quotation', ref, sepidarId: id });
  if (links.length) await hoormandPost(cfg, '/sepidar/push', { links });
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
  const cfg = loadConfig();
  if (cmd === 'register') return cmdRegister(cfg);
  if (cmd === 'test') return cmdTest(cfg);
  if (cmd === 'sync') return cmdSync(cfg);
  if (cmd === 'stock') return cmdStock(cfg);
  if (cmd === 'jobs') return log(`${await cmdJobs(cfg)} درخواست انجام شد.`);
  if (cmd === 'cache') return cmdCache(cfg);
  if (cmd === 'watch') {
    // requests from Hoormand's people are looked at every few seconds; the full synchronisation runs every intervalMinutes
    let nextFull = 0;
    for (;;) {
      try {
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
