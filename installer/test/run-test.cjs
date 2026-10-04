// Drives the panel in a real browser against the pretend server (start fake-server.js and server.js first).
const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 1300, height: 1000 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:7077/', { waitUntil: 'load' }); await sleep(800);
  const type = async (id, v) => { await p.$eval('#' + id, (e) => { e.value = ''; }); await p.type('#' + id, v); };
  // wrong password first
  await type('host', '127.0.0.1'); await type('port', '2222'); await type('user', 'paya'); await type('pass', 'wrong');
  await p.click('#connectBtn'); await sleep(2500);
  console.log('wrong password ->', await p.$eval('#connErr', (e) => e.textContent));
  await type('pass', 'pw'); await p.click('#connectBtn'); await sleep(2500);
  console.log('start button visible:', await p.$eval('#startBtn', (e) => getComputedStyle(e).display !== 'none'));
  await p.click('#startBtn');
  for (let i = 0; i < 60; i++) { await sleep(1000); if (await p.$eval('#result', (e) => getComputedStyle(e).display !== 'none')) break; }
  console.log('steps:', await p.$$eval('#steps li', (l) => l.map((x) => x.className + ':' + x.querySelector('.t').textContent).join(' | ')));
  console.log('result:', (await p.$eval('#result', (e) => e.innerText)).replace(/\n+/g, ' / ').slice(0, 300));
  await sleep(1500);
  console.log('screenshots taken:', await p.$$eval('#gallery a', (a) => a.length));
  const text = await p.evaluate(() => document.body.innerText);
  console.log('password "pw" in the page text:', /\bpw\b/.test(text), '| admin password only in result card:', (text.match(/SecretPw123/g) || []).length);
  console.log('page height:', await p.evaluate(() => document.documentElement.scrollHeight)); await p.screenshot({ path: 'panel-test.png' });
  console.log('--- adaptations seen on screen ---\n' + (await p.evaluate(() => document.querySelector('.xterm-rows').innerText)).split('\n').filter((l) => /403|آینه|Cannot fast|git|ufw allow|Rule added|Mirrors|mirror/i.test(l)).join('\n'));
  await b.close();
})();
