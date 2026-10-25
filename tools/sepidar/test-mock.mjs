// Self-test: two pretend servers (one speaks like Sepidar as its document describes, one like Hoormand's API) and the whole program run against them.
//   node test-mock.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aesDecrypt, aesEncrypt, md5, guidFrom, Sepidar } from './sepidar-client.mjs';
import { customerBody, quotationBody, stockPayload, matchSepidarCustomer, createCustomer } from './sepidar-sync.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (cond, what) => {
  console.log((cond ? 'OK   ' : 'FAIL ') + what);
  if (!cond) failed++;
};

// ---------- pretend Sepidar ----------
const SERIAL = '10017abc';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const jwk = publicKey.export({ format: 'jwk' });
const std = (u) => Buffer.from(u, 'base64url').toString('base64');
const xml = `<RSAKeyValue><Modulus>${std(jwk.n)}</Modulus><Exponent>${std(jwk.e)}</Exponent></RSAKeyValue>`;
const used = new Set();
let strictRawLe = false;
let canRegister = true; // what the pretend Sepidar says about the user's right to register customers
let customers403 = false; // the pretend Sepidar refuses the registration itself
let toolMode = 'normal'; // 'broken' = the served console-fa.mjs has a syntax error (with a matching hash), 'damaged' = its bytes do not match the hash
const servedTool = (n) => (n === 'console-fa.mjs' && toolMode === 'broken' ? Buffer.from('export const = ;' + String.fromCharCode(10)) : n === 'console-fa.mjs' && toolMode === 'damaged' ? Buffer.from('damaged bytes') : fs.readFileSync(path.join(dir, n)));
const sp = { customers: [], quotations: [], registered: false, logins: 0 };
const items = [{ ItemID: 7, Code: '1001', Title: 'کالای یک', Type: 1, UnitRef: 1, IsActive: true, IsSellable: true }, { ItemID: 8, Code: '1002', Title: 'کالای دو', Type: 1, UnitRef: 2, IsActive: true, IsSellable: true }, { ItemID: 9, Code: '2001', Title: 'خدمت نصب', Type: 2, UnitRef: 1, IsActive: true, IsSellable: true }];
const stocks = [{ StockID: 1, Code: 'A1', Title: 'انبار مرکزی', IsActive: true }, { StockID: 2, Code: 'B1', Title: 'انبار فروشگاه', IsActive: true }];
const units = [{ UnitID: 1, Title: 'عدد' }, { UnitID: 2, Title: 'لیتر' }];
const inventories = [{ ItemRef: 7, StockRef: 1, TracingRef: null, Quantity: 5 }, { ItemRef: 7, StockRef: 1, TracingRef: 3, Quantity: 2.5 }, { ItemRef: 8, StockRef: 2, Quantity: 4 }, { ItemRef: 9, StockRef: 1, Quantity: 99 }];

const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => r(b ? JSON.parse(b) : null)); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function deviceOk(req, res) {
  const h = req.headers;
  if (h.generationversion !== '112') return send(res, 412, { Message: 'version' }), false;
  if (String(h.integrationid) !== '1001') return send(res, 401, { Message: 'device' }), false;
  if (used.has(h.arbitrarycode)) return send(res, 401, { Message: 'کد تکراری' }), false;
  used.add(h.arbitrarycode);
  let plain = '';
  let rawPlain = null;
  try {
    rawPlain = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(h.encarbitrarycode, 'base64'));
    plain = rawPlain.toString('utf8');
  } catch {
    return send(res, 401, { Message: 'عدم تطابق کلید' }), false;
  }
  if (strictRawLe) {
    // a Sepidar that wants the 16 bytes of the GUID in the order of .NET's Guid.ToByteArray()
    const b = Buffer.from(String(h.arbitrarycode).replace(/-/g, ''), 'hex');
    const le = Buffer.concat([Buffer.from(b.subarray(0, 4)).reverse(), Buffer.from(b.subarray(4, 6)).reverse(), Buffer.from(b.subarray(6, 8)).reverse(), b.subarray(8)]);
    if (!rawPlain.equals(le)) return send(res, 401, { Message: 'عدم تطابق کلید API' }), false;
    return true;
  }
  if (plain !== h.arbitrarycode) return send(res, 401, { Message: 'عدم تطابق کلید' }), false;
  return true;
}

const sepidarServer = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const url = req.url.replace(/\/$/, '');
  if (req.method === 'POST' && url === '/api/Devices/Register') {
    let same = false;
    try {
      same = aesDecrypt(SERIAL, body.Cypher, body.IV) === String(body.IntegrationID);
    } catch {
      /* a wrong serial cannot decrypt: Sepidar says the device code is wrong */
    }
    if (!same) return send(res, 401, { Message: 'کد دستگاه به درستی وارد نشده است.' });
    if (body.IntegrationID !== 1001) return send(res, 400, { Message: 'عدم تطابق دستگاه' });
    sp.registered = true;
    return send(res, 200, { ...aesEncrypt(SERIAL, xml), DeviceTitle: 'دستگاه آزمایشی' });
  }
  if (!deviceOk(req, res)) return;
  if (req.method === 'POST' && url === '/api/users/login') {
    if (body.UserName !== 'admin' || body.PasswordHash !== md5('secret')) return send(res, 401, { Message: 'رمز عبور اشتباه است.' });
    sp.logins++;
    return send(res, 200, { Token: 'tok-' + sp.logins, UserID: 1, Title: 'مدیر', CanRegisterCustomer: canRegister });
  }
  if (!/^Bearer tok-/.test(req.headers.authorization || '')) return send(res, 401, { Message: 'token' });
  if (req.method === 'GET' && url === '/api/Items') return send(res, 200, items);
  sp.calls ||= [];
  if (req.method === 'POST' && (url.startsWith('/api/Quotations/') && (url.endsWith('/Close') || url.endsWith('/UnClose')))) { sp.calls.push(url); return send(res, 200, {}); }
  if (req.method === 'DELETE' && (url.startsWith('/api/Quotations/') && !url.slice(15).includes('/') && url.length > 15)) { sp.calls.push('DELETE ' + url); return send(res, 200, {}); }
  if (req.method === 'POST' && url === '/api/Invoices/BasedOnQuotation') { sp.calls.push('invoice from ' + JSON.stringify(body)); return send(res, 200, { InvoiceID: 700, Number: 31 }); }
  if (req.method === 'POST' && url === '/api/Receipts/BasedOnInvoice') { sp.receipt = body; return send(res, 200, { ReceiptID: 55 }); }
  if (req.method === 'GET' && url.startsWith('/api/Customers/') && url.length > 15) return send(res, 200, { ...(sp.customers.find((c) => '/api/Customers/' + c.CustomerID === url) || {}), Version: 'v1' });
  if (req.method === 'PUT' && url.startsWith('/api/Customers/')) { sp.put = body; return send(res, 200, {}); }
  if (req.method === 'GET' && url === '/api/Invoices/700') return send(res, 200, { InvoiceID: 700, Number: 31, Date: '2026-10-15T00:00:00', CustomerRef: 500, InvoiceItems: [{ ItemRef: 7, Quantity: 3 }, { ItemRef: 8, Quantity: 2 }] });
  if (req.method === 'GET' && url === '/api/Invoices') return send(res, 200, [{ InvoiceID: 700, Number: 31, CustomerRef: 500, NetPrice: 1000 }]);
  if (req.method === 'GET' && url === '/api/banks') return send(res, 200, [{ BankID: 1, Title: 'ملت' }]);
  if (req.method === 'GET' && url === '/api/BankAccounts') return send(res, 200, [{ BankAccountID: 9, DlCode: '1', DlTitle: 'حساب ملت', CurrencyRef: 1 }]);
  if (req.method === 'GET' && url === '/api/Customers') return send(res, 200, sp.customers.map((c) => ({ ...c, Remainder: 1234, Title: c.Name })));
  if (req.method === 'GET' && url === '/api/PriceNoteItems') return send(res, 200, [{ SaleTypeRef: 1, ItemRef: 7, Fee: 500 }]);
  if (req.method === 'GET' && url === '/api/Currencies') return send(res, 200, [{ CurrencyID: 2, Title: 'دلار', IsMain: false }, { CurrencyID: 1, Title: 'ریال', IsMain: true }]);
  if (req.method === 'GET' && url === '/api/SaleTypes') return send(res, 200, [{ SaleTypeID: 4, Title: 'فروش نقدی' }]);
  if (req.method === 'GET' && url === '/api/Stocks') return send(res, 200, stocks);
  if (req.method === 'GET' && url === '/api/Units') return send(res, 200, units);
  if (req.method === 'GET' && url === '/api/Items/Inventories') return send(res, 200, inventories);
  if (req.method === 'POST' && url === '/api/Customers' && customers403) return send(res, 403, { Message: 'کاربر به منبع درخواست شده دسترسی ندارد.' });
  if (req.method === 'POST' && url === '/api/Customers') {
    if (sp.customers.some((c) => c.GUID === body.GUID)) return send(res, 400, { Message: 'duplicate' });
    const c = { ...body, CustomerID: 500 + sp.customers.length };
    sp.customers.push(c);
    return send(res, 201, c);
  }
  if (req.method === 'POST' && url === '/api/Quotations') {
    if (sp.quotations.some((q) => q.GUID === body.GUID)) return send(res, 400, { Message: 'duplicate' });
    const q = { ...body, ID: 900 + sp.quotations.length, Number: 1 + sp.quotations.length };
    sp.quotations.push(q);
    return send(res, 201, q);
  }
  return send(res, 404, { Message: 'not found' });
});

// ---------- pretend Hoormand ----------
const customers = [
  { id: 'c-1', name: 'علی رضایی', firstName: 'علی', lastName: 'رضایی', phones: ['۰۹۱۲۱۲۳۴۵۶۷'], nationalCode: '0012345678', status: 'ACTIVE' },
  { id: 'c-2', name: 'شرکت نمونه', kind: 'COMPANY', company: 'شرکت نمونه', phones: ['03133920000'], nationalId: '10100000000', economicCode: '411111111111' },
];
const deals = [
  { id: 'd-1', customerId: 'c-1', customerName: 'علی رضایی', stage: 'PROPOSAL', proformaNumber: 'P-1405-1', proformaAt: '2026-10-01T08:00:00.000Z', discountPercent: 10, taxPercent: 10,
    items: [{ title: 'کالای یک', code: '1001', qty: 2, unitPrice: 1000 }, { title: 'کالای دو', code: '1002', qty: 1, unitPrice: 500, discount: 50 }] },
  { id: 'd-2', customerId: 'c-2', customerName: 'شرکت نمونه', stage: 'WON', proformaNumber: 'P-1405-2', items: [{ title: 'ناشناخته', code: '9999', qty: 1, unitPrice: 10 }] },
  { id: 'd-3', customerId: 'c-1', customerName: 'علی رضایی', stage: 'NEW', items: [] },
];
const hoormandPosts = [];
const hoormandJobs = [];
const hoormandResults = {};
const hoormandCaches = {};
const hoormandLinks = [];
const hoormandServer = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ext/v1/pair') { const b = await readBody(req); return b.code === 'ABCD-2345' ? send(res, 200, { key: 'hk_testkey' }) : send(res, 403, { error: 'کد اتصال درست نیست' }); }
  if (req.headers.authorization !== 'Bearer hk_testkey') return send(res, 401, { error: 'bad key' });
  const u0 = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u0.pathname === '/api/ext/v1/sepidar/jobs') { const jobs = hoormandJobs.splice(0); return send(res, 200, { jobs }); }
  if (req.method === 'POST' && u0.pathname.startsWith('/api/ext/v1/sepidar/jobs/')) { hoormandResults[u0.pathname.split('/')[6]] = await readBody(req); return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && u0.pathname === '/api/ext/v1/sepidar/push') { const b = await readBody(req); if (b.cache) hoormandCaches[b.cache] = b.items; if (b.links) hoormandLinks.push(...b.links); return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && req.url === '/api/ext/v1/warehouse/sync') {
    hoormandPosts.push(await readBody(req));
    return send(res, 200, { warehousesNew: 2, productsNew: 2, productsUpdated: 0, docs: 2, changed: 3 });
  }
  const u = new URL(req.url, 'http://x');
  // the copy of the program that Hoormand's server holds (here: this very folder); toolMode makes it serve a broken or a damaged file
  if (u.pathname === '/api/ext/v1/sepidar/tool') {
    const names = ['sepidar-sync.mjs', 'sepidar-client.mjs', 'console-fa.mjs', 'config-help.mjs', 'ui.mjs', 'updater.mjs', 'Vazirmatn-Regular.woff2', 'Vazirmatn-Bold.woff2'];
    const files = names.map((n) => { const b = servedTool(n); return { name: n, sha256: crypto.createHash('sha256').update(toolMode === 'damaged' && n === 'console-fa.mjs' ? fs.readFileSync(path.join(dir, n)) : b).digest('hex'), size: b.length }; });
    return send(res, 200, { version: 'test', files });
  }
  if (u.pathname.startsWith('/api/ext/v1/sepidar/tool/')) { res.writeHead(200); return res.end(servedTool(decodeURIComponent(u.pathname.split('/').pop()))); }
  if (u.pathname === '/api/ext/v1/ping') return send(res, 200, { ok: true, key: 'آزمایش', actAs: 'همکار', scopes: ['customers.read', 'deals.read', 'warehouse.write', 'sepidar.connect'] });
  if ((u.pathname.startsWith('/api/ext/v1/customers/') && u.pathname.length > 22)) return send(res, 200, customers.find((c) => u.pathname.endsWith('/' + c.id)) || {});
  if ((u.pathname.startsWith('/api/ext/v1/deals/') && u.pathname.length > 18)) return send(res, 200, deals.find((d) => u.pathname.endsWith('/' + d.id)) || {});
  if (u.pathname === '/api/ext/v1/customers') return send(res, 200, { customers: customers.slice(Number(u.searchParams.get('offset')) || 0) });
  if (u.pathname === '/api/ext/v1/deals') return send(res, 200, { deals: deals.slice(Number(u.searchParams.get('offset')) || 0) });
  return send(res, 404, {});
});

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const [sPort, hPort] = [await listen(sepidarServer), await listen(hoormandServer)];

// pure functions first
const cb = customerBody(customers[0]);
ok(cb.Name === 'علی' && cb.LastName === 'رضایی' && cb.PhoneNumber === '09121234567' && cb.CustomerType === 1 && cb.GUID === guidFrom('customer:c-1'), 'customer body: person, Latin digits, stable GUID (amount times the unit multiplier)');
const cc = customerBody(customers[1]);
ok(cc.CustomerType === 2 && cc.Name === 'شرکت نمونه' && cc.LastName === '' && cc.NationalID === '10100000000' && cc.EconomicCode === '411111111111', 'customer body: company');
const map = new Map(items.map((i) => [i.Code, i]));
const q = quotationBody(deals[0], 500, map, { currencyRef: 1, saleTypeRef: 2, stockRef: null, priceMultiplier: 10, expireDays: 30 });
// rows: 2 x 10000 = 20000 (discount 10% = 2000, tax 10% of 18000 = 1800); 5000 with fixed 500 + 10% of 4500 = 450 -> 950 (tax 10% of 4050 = 405)
ok(q.body.Price === 25000 && q.body.Discount === 2950 && q.body.Tax === 2205 && q.total === 24255, `quotation totals (${q.body.Price}/${q.body.Discount}/${q.body.Tax})`);
ok(q.body.Items.length === 2 && q.body.Items[0].ItemRef === 7 && q.body.Items[1].Discount === 950, 'quotation rows map to Sepidar items');
ok(quotationBody(deals[1], 500, map, { priceMultiplier: 1 }).skip?.includes('9999'), 'unknown item code is skipped with the reason');

// a customer Sepidar already has (same mobile or same national code) is found instead of making a second one
{
  const have = [
    { CustomerID: 51, Title: 'علی رضایی', PhoneNumber: '09121234567', NationalID: '' },
    { CustomerID: 52, Title: 'شرکت الف', PhoneNumber: '02188776655', NationalID: '10100000001' },
    { CustomerID: 53, Title: 'نفر سوم', PhoneNumber: '09351112233', NationalID: '' },
  ];
  ok(matchSepidarCustomer({ PhoneNumber: '+989121234567' }, have)?.CustomerID === 51, 'existing Sepidar customer found by the same mobile (+98 or 0 in front does not matter)');
  ok(matchSepidarCustomer({ PhoneNumber: '۰۹۱۲۱۲۳۴۵۶۷' }, have)?.CustomerID === 51, 'existing Sepidar customer found by a mobile written in Persian digits');
  ok(matchSepidarCustomer({ PhoneNumber: '09000000000', NationalID: '10100000001' }, have)?.CustomerID === 52, 'existing Sepidar customer found by the national code');
  ok(matchSepidarCustomer({ PhoneNumber: '09121234567' }, have, new Set([51])) === null, 'a Sepidar customer already tied to another Hoormand customer is not taken twice');
  ok(matchSepidarCustomer({ PhoneNumber: '09999999999', NationalID: '' }, have) === null, 'nothing is found for a number Sepidar does not have');
}

// the stock payload: goods only, tracings summed, units by title
const pl = stockPayload(stocks, items, units, inventories);
ok(pl.products.length === 3 && pl.products.filter((x) => x.kind === 'service').length === 1 && pl.products.find((x) => x.unit === 'لیتر') && pl.warehouses.length === 2 && pl.complete === true, 'stock payload: goods and the service (marked as a service, no stock), units by title');
ok(pl.stock.length === 2 && pl.stock.find((x) => x.productCode === '1001' && x.warehouseCode === 'A1').qty === 7.5, 'stock payload: the tracings of one product are summed');

// Sepidar's real inventory spells two fields wrongly (StockeRef, Qunatity): they are read as they come
const real = stockPayload(stocks, items, units, [{ ItemRef: items[0].ItemID, TracingRef: null, StockeRef: stocks[0].StockID, UnitRef: 1, Qunatity: 12 }]);
ok(real.stock.length === 1 && real.stock[0].qty === 12, "stock payload: Sepidar's own spelling of the inventory fields (StockeRef, Qunatity) is read");

// the whole program
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sepidar-test-'));
const cfg = path.join(tmp, 'config.json');
const state = path.join(tmp, 'state.json');
fs.writeFileSync(cfg, JSON.stringify({ hoormand: { url: `http://127.0.0.1:${hPort}`, apiKey: 'hk_testkey' }, sepidar: { url: `http://127.0.0.1:${sPort}`, serial: SERIAL, userName: 'admin', password: 'secret' }, sync: { saleTypeRef: 2, priceMultiplier: 10 } }));
// the program runs in a child process (this one hosts the pretend servers)
import { spawn } from 'node:child_process';
const runAsync = (...a) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(dir, 'sepidar-sync.mjs'), ...a, '--config', cfg, '--state', state]);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});

let r = await runAsync('test');
ok(r.code !== 0 && /register/.test(r.out), 'test before register explains what to do first');
r = await runAsync('register');
ok(r.code === 0 && sp.registered && /ثبت شد/.test(r.out), 'register: AES cypher accepted, public key received');
r = await runAsync('test');
ok(r.code === 0 && /ورود موفق/.test(r.out) && /3 کالا|۳ کالا/.test(r.out), 'test: encrypted headers + login accepted by the pretend Sepidar\n' + r.out.split('\n').map((l) => '      ' + l).join('\n'));
r = await runAsync('diag');
ok(r.code === 0 && /۰\) نسخهٔ API/.test(r.out) && /۱\) ثبت دستگاه/.test(r.out) && /کلید باز شد: \d+ بیت/.test(r.out) && /۲\) ورود/.test(r.out) && /ورود موفق بود/.test(r.out) && !/secret/.test(r.out), 'diag: prints the raw answers of version, register and login, never the password\n' + r.out.split('\n').map((l) => '      ' + l).join('\n'));
// the diagnosis needs only what is typed in the form: no config.json, no Hoormand key
r = await new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(dir, 'sepidar-sync.mjs'), 'diag', '--sepidar', `http://127.0.0.1:${sPort}`, '--serial', SERIAL, '--user', 'admin', '--password', 'secret', '--config', path.join(tmp, 'none.json'), '--state', path.join(tmp, 'none-state.json')]);
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => resolve({ code, out }));
});
ok(r.code === 0 && /ورود موفق بود/.test(r.out), 'diag works from the typed values alone (no config.json, no Hoormand key)\n' + r.out.split('\n').slice(-6).map((l) => '      ' + l).join('\n'));
// the program updates itself from the copy Hoormand's server holds
{
  const NL = String.fromCharCode(10);
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const names = ['sepidar-sync.mjs', 'sepidar-client.mjs', 'console-fa.mjs', 'config-help.mjs', 'ui.mjs', 'updater.mjs', 'Vazirmatn-Regular.woff2', 'Vazirmatn-Bold.woff2'];
  const mk = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sepidar-upd-'));
    for (const n of names) fs.copyFileSync(path.join(dir, n), path.join(d, n));
    fs.appendFileSync(path.join(d, 'console-fa.mjs'), String.fromCharCode(10) + '// an old copy' + String.fromCharCode(10));
    fs.appendFileSync(path.join(d, 'config-help.mjs'), String.fromCharCode(10) + '// old too' + String.fromCharCode(10));
    fs.rmSync(path.join(d, 'Vazirmatn-Bold.woff2')); // a file the program does not have yet
    fs.writeFileSync(path.join(d, 'config.json'), fs.readFileSync(cfg));
    fs.writeFileSync(path.join(d, 'state.json'), '{"keep":"me"}');
    return d;
  };
  const upd = (d) => new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(d, 'sepidar-sync.mjs'), 'update'], { cwd: d });
    let out = '';
    p.stdout.on('data', (x) => (out += x));
    p.stderr.on('data', (x) => (out += x));
    p.on('close', (code) => resolve({ code, out }));
  });
  const d1 = mk();
  const old = fs.readFileSync(path.join(d1, 'console-fa.mjs'), 'utf8');
  let u = await upd(d1);
  ok(u.code === 0 && names.every((n) => sha(path.join(d1, n)) === sha(path.join(dir, n))), 'update: changed and missing files are replaced by the server copy' + NL + u.out.split(NL).map((l) => '      ' + l).join(NL));
  ok(fs.readFileSync(path.join(d1, 'prev', 'console-fa.mjs'), 'utf8') === old, 'update: the old file is kept in prev');
  ok(fs.readFileSync(path.join(d1, 'state.json'), 'utf8') === '{"keep":"me"}' && fs.existsSync(path.join(d1, 'config.json')), 'update: config.json and state.json are never touched');
  u = await upd(d1);
  ok(u.code === 0 && /به‌روز است/.test(u.out), 'update: a second run finds nothing to do');
  const d2 = mk();
  toolMode = 'broken';
  u = await upd(d2);
  ok(u.code !== 0 && /خطای برنامه‌نویسی/.test(u.out) && /an old copy/.test(fs.readFileSync(path.join(d2, 'console-fa.mjs'), 'utf8')) && !fs.existsSync(path.join(d2, 'console-fa.new.mjs')), 'update: a served file with a syntax error is refused, the old one stays' + NL + u.out.split(NL).slice(0, 3).map((l) => '      ' + l).join(NL));
  toolMode = 'damaged';
  u = await upd(d2);
  ok(u.code !== 0 && /ناقص رسید/.test(u.out) && /an old copy/.test(fs.readFileSync(path.join(d2, 'console-fa.mjs'), 'utf8')), 'update: a file whose hash does not match is refused');
  toolMode = 'normal';
}

// the sign-in answer says «no right» but Sepidar itself accepts the registration (a user who can register in the program): the customer is made
{
  const mk = () => new Sepidar({ url: `http://127.0.0.1:${sPort}`, serial: SERIAL, userName: 'admin', password: 'secret' }, { publicKeyXml: xml });
  const before = sp.customers.length;
  canRegister = false;
  let made = null;
  try {
    made = await createCustomer(mk(), { GUID: guidFrom('x'), Name: 'آزمایش', LastName: '', CustomerType: 1 });
  } catch (e) {
    made = { error: e.message };
  }
  ok(made && !made.error && sp.customers.length === before + 1, 'the hint «no right» in the sign-in answer does not stop a registration Sepidar accepts');
  sp.customers.length = before; // the pretend Sepidar goes back to what it had, for the tests that follow
  // Sepidar really refuses (403): one clear message that says which user needs which right, with status 403 so the loop stops
  customers403 = true;
  let err = null;
  try {
    await createCustomer(mk(), { GUID: guidFrom('y'), Name: 'آزمایش', LastName: '', CustomerType: 1 });
  } catch (e) {
    err = e;
  }
  ok(err && err.status === 403 && /اجازهٔ ثبت مشتری ندارد/.test(err.message) && /«admin»/.test(err.message) && /ورود هم نوشته/.test(err.message), 'a 403 from Sepidar: a clear message with status 403 (the loop stops after the first)' + String.fromCharCode(10) + (err && err.message));
  canRegister = true;
  customers403 = false;
}

// a serial typed with another case, Persian digits or spaces still registers the device (the serial is cleaned and the other case is tried)
{
  for (const typed of ['10017ABC', ' ۱۰۰۱۷abc ', '1001 7-ABC']) {
    const c = new Sepidar({ url: `http://127.0.0.1:${sPort}`, serial: typed, userName: 'admin', password: 'secret' }, {});
    let title = '';
    try {
      title = await c.register();
    } catch (e) {
      title = 'ERR ' + e.message;
    }
    ok(title === 'دستگاه آزمایشی' && c.cfg.serial === SERIAL, `serial typed as «${typed}» still registers the device` + String.fromCharCode(10) + title);
  }
  const bad = new Sepidar({ url: `http://127.0.0.1:${sPort}`, serial: '10017xyz', userName: 'admin', password: 'secret' }, {});
  let msg = '';
  try {
    await bad.register();
  } catch (e) {
    msg = e.message;
  }
  ok(/سریالی که ابزار خوانده: «10017xyz»/.test(msg) && /کپی کنید/.test(msg), 'a really wrong serial: the message shows the serial that was read and what to check' + String.fromCharCode(10) + msg);
}

// a Sepidar that accepts only another shape of the encrypted code: the client tries the shapes and finds it
strictRawLe = true;
{
  const c2 = new Sepidar({ url: `http://127.0.0.1:${sPort}`, serial: SERIAL, userName: 'admin', password: 'secret' }, { publicKeyXml: xml });
  let res2 = null;
  try {
    res2 = await c2.login();
  } catch (e) {
    res2 = { error: e.message };
  }
  ok(res2 && !res2.error && c2.shape?.raw === 'le', 'login finds the raw-bytes shape when the usual one is refused: ' + (res2?.error || JSON.stringify(c2.shape)));
}
strictRawLe = false;
r = await runAsync('stock');
ok(r.code === 0 && hoormandPosts.length === 0 && /فقط نمایش/.test(r.out), 'stock without --apply sends nothing');
r = await runAsync('stock', '--apply');
ok(r.code === 0 && hoormandPosts.length === 1 && hoormandPosts[0].stock.length === 2 && /به هورمند فرستاده شد/.test(r.out), 'stock --apply sends the catalogue and the stock to Hoormand\n' + r.out.split('\n').map((l) => '      ' + l).join('\n'));
r = await runAsync('sync');
ok(r.code === 0 && sp.customers.length === 0 && sp.quotations.length === 0 && /فقط نمایش/.test(r.out) && /پیش‌فاکتور تازه: .*P-1405-1/.test(r.out), 'sync without --apply writes nothing\n' + r.out.split('\n').map((l) => '      ' + l).join('\n'));
r = await runAsync('sync', '--apply');
ok(r.code === 0 && sp.customers.length === 2 && sp.quotations.length === 1, `sync --apply: ${sp.customers.length} customers, ${sp.quotations.length} quotation (the one with an unknown item is skipped)\n` + r.out.split('\n').map((l) => '      ' + l).join('\n'));
r = await runAsync('sync', '--apply');
ok(r.code === 0 && sp.customers.length === 2 && sp.quotations.length === 1, 'a second run registers nothing twice');
ok(new Set(sp.quotations.map((x) => x.GUID)).size === sp.quotations.length && sp.quotations[0].CustomerRef === 500, 'quotation belongs to the customer that was just registered');
const st = JSON.parse(fs.readFileSync(state, 'utf8'));
ok(st.customers['c-1'] === 500 && st.quotations['d-1'] === 900 && !JSON.stringify(st).includes('secret'), 'state file keeps the mapping and no password');

// requests from people (jobs): the program does them in Sepidar and reports
hoormandJobs.push({ id: 'sj-1', kind: 'quotation.send', data: { dealId: 'd-1' } }, { id: 'sj-2', kind: 'quotation.send', data: { dealId: 'd-2' } });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(r.code === 0 && hoormandResults['sj-2']?.ok === false && /9999/.test(hoormandResults['sj-2'].message), 'a job that cannot be done reports the reason to the person (unknown item code)');
sp.quotations.length = 0; // pretend nothing was sent by the automatic run, so this job registers the quotation itself
const st2 = JSON.parse(fs.readFileSync(state, 'utf8')); delete st2.quotations['d-1']; fs.writeFileSync(state, JSON.stringify(st2));
hoormandJobs.push({ id: 'sj-3', kind: 'quotation.send', data: { dealId: 'd-1' } });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(hoormandResults['sj-3']?.ok === true && hoormandResults['sj-3'].sepidarId === 900 && sp.quotations.length === 1, 'job quotation.send registers the quotation and reports its id and number');
hoormandJobs.push({ id: 'sj-4', kind: 'quotation.close', data: { dealId: 'd-1', sepidarId: 900 } }, { id: 'sj-5', kind: 'invoice.fromProforma', data: { dealId: 'd-1', sepidarId: 900 } });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(sp.calls.includes('/api/Quotations/900/Close') && sp.calls.includes('invoice from 900') && hoormandResults['sj-5'].number === 31 && hoormandResults['sj-5'].sepidarId === 700, 'close and invoice-from-quotation (the body is the plain quotation number)');
hoormandJobs.push({ id: 'sj-6', kind: 'receipt.add', data: { dealId: 'd-1', sepidarId: 700, bankAccountId: '9', amount: 250, date: '2026-10-10', description: 'بیعانه' } });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(hoormandResults['sj-6']?.ok === true && sp.receipt.InvoiceID === 700 && sp.receipt.Drafts[0].BankAccountID === 9 && sp.receipt.Drafts[0].Amount === 2500 && sp.receipt.Guid === guidFrom('receipt:sj-6'), 'receipt.add posts the draft against the invoice with a stable GUID (amount times the unit multiplier)');
hoormandJobs.push({ id: 'sj-7', kind: 'customer.send', data: { customerId: 'c-1' } });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(hoormandResults['sj-7']?.ok === true && sp.put?.Version === 'v1' && sp.put.NationalID === '0012345678', 'customer.send updates a customer that is already in Sepidar (with its Version)');
hoormandJobs.push({ id: 'sj-8', kind: 'refresh', data: {} });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(hoormandResults['sj-8']?.ok === true && hoormandCaches.invoices?.length === 1 && hoormandCaches.bankAccounts?.[0].BankAccountID === 9 && hoormandCaches.balances?.[0].Remainder === 1234 && hoormandCaches.priceNotes?.[0].code === '1001' && hoormandLinks.some((l) => l.kind === 'customer'), 'refresh sends invoices, bank accounts, balances, price lists and the links');
ok(hoormandCaches.saleDocs?.length === 1 && hoormandCaches.saleDocs[0].number === 31 && hoormandCaches.saleDocs[0].date === '2026-10-15' && hoormandCaches.saleDocs[0].lines.length === 2 && hoormandCaches.saleDocs[0].lines[0].code === '1001' && hoormandCaches.saleDocs[0].lines[0].qty === 3, 'the lines of the sales invoices are sent as saleDocs (goods that left the warehouse)');
hoormandJobs.push({ id: 'sj-9', kind: 'nonsense', data: {} });
r = await runAsync('jobs'); if (process.env.DBG) console.log(r.out);
ok(hoormandResults['sj-9']?.ok === false, 'an unknown job kind is reported, not ignored');

// the automatic setup: a pairing code instead of a key, everything it can find out is not asked
const cfg2 = path.join(tmp, 'auto-config.json');
const state2 = path.join(tmp, 'auto-state.json');
const runSetup = (...a) => new Promise((resolve) => {
  const pp = spawn(process.execPath, [path.join(dir, 'sepidar-sync.mjs'), 'setup', '--config', cfg2, '--state', state2, '--yes', '--no-autostart', ...a]);
  let out = '';
  pp.stdout.on('data', (d) => (out += d));
  pp.stderr.on('data', (d) => (out += d));
  pp.on('close', (code) => resolve({ code, out }));
});
const setupArgs = ['--hoormand', `http://127.0.0.1:${hPort}`, '--sepidar', `http://127.0.0.1:${sPort}`, '--serial', SERIAL, '--user', 'admin', '--password', 'secret'];
r = await runSetup(...setupArgs, '--code', 'WRONG-CODE');
ok(r.code !== 0 && /کد اتصال/.test(r.out) && !fs.existsSync(cfg2), 'setup with a wrong pairing code stops and writes nothing');
sp.registered = false;
r = await runSetup(...setupArgs, '--code', 'ABCD-2345');
const c2 = fs.existsSync(cfg2) ? JSON.parse(fs.readFileSync(cfg2, 'utf8')) : {};
ok(r.code === 0 && c2.hoormand?.apiKey === 'hk_testkey' && c2.sepidar?.serial === SERIAL && sp.registered, 'setup trades the code for the key, registers the device and logs in');
ok(c2.sync?.currencyRef === 1 && c2.sync?.saleTypeRef === 4 && c2.sync?.priceMultiplier === 10, 'setup finds the main currency and the sale type by itself, and asks the price unit (default: toman to rial)');
ok(hoormandCaches.invoices?.length === 1, 'setup sends the first copy of Sepidar data to Hoormand');
r = await runSetup(...setupArgs);
ok(r.code === 0 && /از قبل کار می‌کند/.test(r.out), 'running setup again keeps the key that still works (no new code needed)');

sepidarServer.close();
hoormandServer.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
