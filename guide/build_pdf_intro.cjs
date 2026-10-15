const puppeteer = require('C:/Users/Ramtin/AppData/Local/Temp/p2ptest/node_modules/puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.goto('file:///D:/Project/Automation/guide/intro.html', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1500));
  await p.pdf({ path: 'D:/Project/Automation/guide/hoormand-intro.pdf', preferCSSPageSize: true, printBackground: true });
  await b.close();
  console.log('pdf done');
})();
