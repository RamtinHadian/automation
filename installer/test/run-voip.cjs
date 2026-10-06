const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1000 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:' + (process.env.PANEL_PORT || 7077) + '/', { waitUntil: 'load' }); await sleep(800);
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  await p.click('#tabVoip'); await sleep(300);
  console.log('voip fields visible:', await p.$eval('#voipFields', (e) => getComputedStyle(e).display !== 'none'), '| install fields hidden:', await p.$eval('#installFields', (e) => getComputedStyle(e).display === 'none'));
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'pw');
  await type('aHost', '127.0.0.1'); await type('aPort', '2222'); await type('aUser', 'paya'); await type('aPass', 'pw');
  await p.click('#connectBtn');
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await p.$eval('#result', (e) => getComputedStyle(e).display !== 'none')) break; }
  console.log('steps:', await p.$$eval('#steps li', (l) => l.map((x) => x.className + ':' + x.querySelector('.t').textContent).join(' | ')));
  console.log('log:', (await p.$eval('#term', (e) => e.innerText)).split('\n').slice(-8).join(' | ')); console.log('result:', (await p.$eval('#result', (e) => e.innerText)).replace(/\n+/g, ' / ').slice(0, 330));
  await p.screenshot({ path: 'voip-test.png' });
  await b.close();
})();
