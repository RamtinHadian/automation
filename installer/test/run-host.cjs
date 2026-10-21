// Install mode with a machine name: the first step must set it (start fake-server.js and server.js first).
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1000 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:7077/', { waitUntil: 'load' }); await sleep(800);
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'pw'); await type('instHost', 'hoormand-newco');
  await p.click('#connectBtn');
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (await p.$eval('#askIp', (e) => getComputedStyle(e).display !== 'none')) { await p.click('#ipNo'); }
    if (await p.$eval('#result', (e) => getComputedStyle(e).display !== 'none')) break;
    if (await p.$eval('#stopBox', (e) => getComputedStyle(e).display !== 'none')) break;
  }
  console.log('steps:', await p.$$eval('#steps li', (l) => l.map((x) => x.className + ':' + x.querySelector('.t').textContent + (x.querySelector('.n') ? ' (' + x.querySelector('.n').textContent + ')' : '')).slice(0, 3).join(' | ')));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
