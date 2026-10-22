// Migrate tab against the pretend server (it plays both the source and the target). Start fake-server.js and server.js first.
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1100 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  p.on('dialog', (d) => { console.log('confirm asked:', d.message().split(String.fromCharCode(10))[0].slice(0, 90)); d.accept(); });
  await p.goto('http://127.0.0.1:7077/', { waitUntil: 'load' }); await sleep(800);
  await p.click('#tabMig');
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'pw');
  await type('tHost', '127.0.0.1'); await type('tPort', '2222'); await type('tUser', 'paya'); await type('tPass', 'pw');
  await p.click('#connectBtn');
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await p.$eval('#result', (e) => getComputedStyle(e).display !== 'none')) break; if (await p.$eval('#stopBox', (e) => getComputedStyle(e).display !== 'none')) break; }
  console.log('steps:', await p.$$eval('#steps li', (l) => l.map((x) => x.className + ':' + x.querySelector('.t').textContent + (x.querySelector('.n') ? ' (' + x.querySelector('.n').textContent.slice(0, 60) + ')' : '')).join(' | ')));
  console.log('result:', (await p.$eval('#result', (e) => e.innerText)).split(String.fromCharCode(10)).join(' / ').slice(0, 160));
  console.log('stop box:', (await p.$eval('#stopBox', (e) => e.innerText)).slice(0, 160));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
