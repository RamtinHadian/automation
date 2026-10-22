// Drives the Nginx tab against the pretend server (start fake-server.js and server.js first).
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1100 });
  p.on('dialog', (d) => d.accept());
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:7077/', { waitUntil: 'load' }); await sleep(800);
  await p.click('#tabNginx');
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'pw');
  await p.click('#connectBtn'); await sleep(3500);
  console.log('info:', (await p.$eval('#ngInfo', (e) => e.innerText)).replace(/\n+/g, ' / '));
  await p.type('#ngDomain', 'crm.example.com'); await p.type('#ngTarget', '192.168.88.11'); await p.click('#ngAdd'); await p.type('#ngDomain', 'demo.example.com'); await p.type('#ngTarget', '192.168.88.12:8081'); await p.click('#ngAdd'); console.log('list:', (await p.$eval('#ngSites', (e) => e.value)).split(String.fromCharCode(10)).join(' | '));
  await p.click('#startBtn');
  for (let i = 0; i < 40; i++) { await sleep(1000); if (await p.$eval('#result', (e) => getComputedStyle(e).display !== 'none')) break; }
  console.log('steps:', await p.$$eval('#steps li', (l) => l.map((x) => x.className + ':' + x.querySelector('.t').textContent).join(' | ')));
  console.log('result:', (await p.$eval('#result', (e) => e.innerText)).replace(/\n+/g, ' / ').slice(0, 300));
  await p.screenshot({ path: 'panel-nginx.png' });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
