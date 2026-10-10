// Self-test: two pretend servers (one speaks like Sepidar as its document describes, one like Hoormand's API) and the whole program run against them.
//   node test-mock.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aesDecrypt, aesEncrypt, md5, guidFrom } from './sepidar-client.mjs';
import { customerBody, quotationBody, stockPayload } from './sepidar-sync.mjs';

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
const sp = { customers: [], quotations: [], registered: false, logins: 0 };
const items = [{ ItemID: 7, Code: '1001', Title: 'کالای یک', Type: 1, UnitRef: 1, IsActive: true, IsSellable: true }, { ItemID: 8, Code: '1002', Title: 'کالای دو', Type: 1, UnitRef: 2, IsActive: true, IsSellable: true }, { ItemID: 9, Code: '2001', Title: 'خدمت نصب', Type: 2, UnitRef: 1, IsActive: true, IsSellable: true }];
const stocks = [{ StockID: 1, Code: 'A1', Title: 'انبار مرکزی', IsActive: true }, { StockID: 2, Code: 'B1', Title: 'انبار فروشگاه', IsActive: true }];
const units = [{ UnitID: 1, Title: 'عدد' }, { UnitID: 2, Title: 'لیتر' }];
const inventories = [{ ItemRef: 7, StockRef: 1, TracingRef: null, Quantity: 5 }, { ItemRef: 7, StockRef: 1, TracingRef: 3, Quantity: 2.5 }, { ItemRef: 8, StockRef: 2, Quantity: 4 }, { ItemRef: 9, StockRef: 1, Quantity: 99 }];

const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => r(b ? JSON.parse(b) : null)); });
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function deviceOk(req, res) {
  const h = req.headers;
  if (h.generationversion !== '101') return send(res, 412, { Message: 'version' }), false;
  if (String(h.integrationid) !== '1001') return send(res, 401, { Message: 'device' }), false;
  if (used.has(h.arbitrarycode)) return send(res, 401, { Message: 'کد تکراری' }), false;
  used.add(h.arbitrarycode);
  let plain = '';
  try {
    plain = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(h.encarbitrarycode, 'base64')).toString('utf8');
  } catch {
    return send(res, 401, { Message: 'عدم تطابق کلید' }), false;
  }
  if (plain !== h.arbitrarycode) return send(res, 401, { Message: 'عدم تطابق کلید' }), false;
  return true;
}

const sepidarServer = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const url = req.url.replace(/\/$/, '');
  if (req.method === 'POST' && url === '/api/Devices/Register') {
    if (aesDecrypt(SERIAL, body.Cypher, body.IV) !== String(body.IntegrationID) || body.IntegrationID !== 1001) return send(res, 400, { Message: 'عدم تطابق دستگاه' });
    sp.registered = true;
    return send(res, 200, { ...aesEncrypt(SERIAL, xml), DeviceTitle: 'دستگاه آزمایشی' });
  }
  if (!deviceOk(req, res)) return;
  if (req.method === 'POST' && url === '/api/users/login') {
    if (body.UserName !== 'admin' || body.PasswordHash !== md5('secret')) return send(res, 401, { Message: 'رمز عبور اشتباه است.' });
    sp.logins++;
    return send(res, 200, { Token: 'tok-' + sp.logins, UserID: 1, Title: 'مدیر', CanRegisterCustomer: true });
  }
  if (!/^Bearer tok-/.test(req.headers.authorization || '')) return send(res, 401, { Message: 'token' });
  if (req.method === 'GET' && url === '/api/Items') return send(res, 200, items);
  if (req.method === 'GET' && url === '/api/Stocks') return send(res, 200, stocks);
  if (req.method === 'GET' && url === '/api/Units') return send(res, 200, units);
  if (req.method === 'GET' && url === '/api/Items/Inventories') return send(res, 200, inventories);
  if (req.method === 'GET' && url === '/api/Customers') return send(res, 200, sp.customers);
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
const hoormandServer = http.createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer hk_testkey') return send(res, 401, { error: 'bad key' });
  if (req.method === 'POST' && req.url === '/api/ext/v1/warehouse/sync') {
    hoormandPosts.push(await readBody(req));
    return send(res, 200, { warehousesNew: 2, productsNew: 2, productsUpdated: 0, docs: 2, changed: 3 });
  }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/ext/v1/ping') return send(res, 200, { ok: true, key: 'آزمایش', actAs: 'همکار', scopes: ['customers.read', 'deals.read'] });
  if (u.pathname === '/api/ext/v1/customers') return send(res, 200, { customers: customers.slice(Number(u.searchParams.get('offset')) || 0) });
  if (u.pathname === '/api/ext/v1/deals') return send(res, 200, { deals: deals.slice(Number(u.searchParams.get('offset')) || 0) });
  return send(res, 404, {});
});

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const [sPort, hPort] = [await listen(sepidarServer), await listen(hoormandServer)];

// pure functions first
const cb = customerBody(customers[0]);
ok(cb.Name === 'علی' && cb.LastName === 'رضایی' && cb.PhoneNumber === '09121234567' && cb.CustomerType === 1 && cb.GUID === guidFrom('customer:c-1'), 'customer body: person, Latin digits, stable GUID');
const cc = customerBody(customers[1]);
ok(cc.CustomerType === 2 && cc.Name === 'شرکت نمونه' && cc.LastName === '' && cc.NationalID === '10100000000' && cc.EconomicCode === '411111111111', 'customer body: company');
const map = new Map(items.map((i) => [i.Code, i]));
const q = quotationBody(deals[0], 500, map, { currencyRef: 1, saleTypeRef: 2, stockRef: null, priceMultiplier: 10, expireDays: 30 });
// rows: 2 x 10000 = 20000 (discount 10% = 2000, tax 10% of 18000 = 1800); 5000 with fixed 500 + 10% of 4500 = 450 -> 950 (tax 10% of 4050 = 405)
ok(q.body.Price === 25000 && q.body.Discount === 2950 && q.body.Tax === 2205 && q.total === 24255, `quotation totals (${q.body.Price}/${q.body.Discount}/${q.body.Tax})`);
ok(q.body.Items.length === 2 && q.body.Items[0].ItemRef === 7 && q.body.Items[1].Discount === 950, 'quotation rows map to Sepidar items');
ok(quotationBody(deals[1], 500, map, { priceMultiplier: 1 }).skip?.includes('9999'), 'unknown item code is skipped with the reason');

// the stock payload: goods only, tracings summed, units by title
const pl = stockPayload(stocks, items, units, inventories);
ok(pl.products.length === 2 && pl.products[1].unit === 'لیتر' && pl.warehouses.length === 2 && pl.complete === true, 'stock payload: goods only (the service is left out), units by title');
ok(pl.stock.length === 2 && pl.stock.find((x) => x.productCode === '1001' && x.warehouseCode === 'A1').qty === 7.5, 'stock payload: the tracings of one product are summed');

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

sepidarServer.close();
hoormandServer.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
