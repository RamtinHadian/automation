// The Nginx tab must ask before installing Nginx on a machine that has none (start fake-server.js and server.js first).
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1100 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  let asked = '';
  p.on('dialog', async (d) => { asked = d.message(); await d.dismiss(); });
  await p.goto('http://127.0.0.1:7077/', { waitUntil: 'load' }); await sleep(800);
  await p.click('#tabNginx');
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'pw');
  await p.click('#connectBtn'); await sleep(3500);
  console.log('info:', (await p.$eval('#ngInfo', (e) => e.innerText)).split(String.fromCharCode(10))[0]);
  await p.type('#ngDomain', 'crm.example.com'); await p.type('#ngTarget', '192.168.88.11'); await p.click('#ngAdd');
  await p.click('#startBtn'); await sleep(1500);
  console.log('asked:', asked.split(String.fromCharCode(10))[0]);
  console.log('steps after cancel:', await p.$$eval('#steps li', (l) => l.length));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
