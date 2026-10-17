// A window in the browser instead of the black command window: the person fills a form in Persian and presses buttons.
// The page is served only to this computer (127.0.0.1) and every request carries a secret that is part of the address, so nobody else can use it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const fontCss = (dir) => {
  const f = (file, w) => {
    try {
      return `@font-face{font-family:'HmVazir';font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}) format('woff2')}`;
    } catch {
      return '';
    }
  };
  return f('Vazirmatn-Regular.woff2', 400) + f('Vazirmatn-Bold.woff2', 700);
};

const PAGE = (css) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتصال هورمند به سپیدار</title>
<style>
${css}
*{box-sizing:border-box}body{margin:0;background:#faf5f1;color:#3a241f;font-family:HmVazir,Vazirmatn,Tahoma,Segoe UI,sans-serif;line-height:1.8}
.wrap{max-width:860px;margin:0 auto;padding:20px 16px 60px}h1{font-size:22px;margin:8px 0 2px}p.sub{margin:0 0 18px;color:#8c6f66;font-size:13px}
.card{background:#fff;border:1px solid #ebdbce;border-radius:20px;padding:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(58,36,31,.05)}
.card h2{margin:0 0 4px;font-size:15px}.card .hint{color:#8c6f66;font-size:12px;margin:0 0 12px}
label{display:block;font-weight:700;font-size:13px;margin:12px 0 2px}.help{font-size:12px;color:#8c6f66;margin:0 0 4px}
input,select{width:100%;padding:10px 12px;border:1px solid #ebdbce;border-radius:12px;font:inherit;background:#faf5f1}input:focus{outline:2px solid #6e1b1b33;border-color:#6e1b1b}
input.ltr{direction:ltr;text-align:left}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}button{border:0;border-radius:12px;padding:10px 16px;font:inherit;font-weight:800;cursor:pointer;background:#6e1b1b;color:#fff}
button.alt{background:#fff;color:#6e1b1b;border:1px solid #6e1b1b}button:disabled{opacity:.5;cursor:wait}
.step{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#6e1b1b;color:#fff;align-items:center;justify-content:center;font-size:12px;margin-left:6px}
pre{background:#1c1210;color:#f3e9e2;border-radius:14px;padding:14px;min-height:140px;max-height:380px;overflow:auto;white-space:pre-wrap;font:13px/1.9 HmVazir,Vazirmatn,Tahoma,sans-serif;margin:10px 0 0}
.ok{color:#2f855a}.bad{color:#c53030}.note{background:#fff8e6;border:1px solid #f0d78c;border-radius:12px;padding:10px 12px;font-size:12.5px;margin-top:10px}
</style></head><body><div class="wrap">
<h1>اتصال هورمند به سپیدار</h1><p class="sub">همهٔ کارها از همین صفحه انجام می‌شود؛ نیازی به پنجرهٔ سیاه نیست. این صفحه فقط روی همین کامپیوتر باز می‌شود.</p>

<div class="card"><h2><span class="step">۱</span>اطلاعات اتصال</h2><p class="hint">یک‌بار پر کنید و «ذخیره و راه‌اندازی» را بزنید.</p>
<label>نشانی هورمند</label><p class="help">همان نشانی که در مرورگر برای ورود به هورمند می‌زنید، مثلاً https://crm.ramtinai.com (بدون اسلش آخر).</p><input id="hoormand" class="ltr" placeholder="https://crm.example.com">
<label>کد اتصال هورمند</label><p class="help">در هورمند: منوی «سپیدار» ← «ساخت کد اتصال». کد ۱۵ دقیقه اعتبار دارد و یک‌بار مصرف است. اگر قبلاً راه‌اندازی شده، خالی بگذارید.</p><input id="code" class="ltr" autocomplete="off" placeholder="مثلاً: AB7K-9PQ2">
<label>نشانی سرویس سپیدار</label><p class="help">اگر سپیدار روی همین کامپیوتر است همین مقدار درست است. ۷۳۷۳ پورت سرویس سپیدار است؛ اگر پورت یا کامپیوتر دیگری است، همین‌جا عوض کنید.</p><input id="sepidar" class="ltr" value="http://localhost:7373">
<label>سریال دستگاه سپیدار</label><p class="help">کد هشت‌حرفی که سپیدار بعد از ساختن «دستگاه جدید» (سفارش‌گیری و پخش) نشان می‌دهد.</p><input id="serial" class="ltr" maxlength="8" autocomplete="off" placeholder="AB12CD34">
<label>نام کاربری سپیدار</label><p class="help">کاربری که به دستگاه وصل کرده‌اید.</p><input id="user" class="ltr" autocomplete="off">
<label>رمز سپیدار</label><p class="help" id="passhelp">رمز همان کاربر. فقط روی همین کامپیوتر ذخیره می‌شود.</p><input id="password" type="password" class="ltr" autocomplete="new-password">
<label>قیمت‌ها</label><p class="help">هورمند به تومان کار می‌کند. اگر سپیدار شما به ریال است «ریال» را انتخاب کنید تا قیمت‌ها ۱۰ برابر شوند.</p>
<select id="multiplier"><option value="10">سپیدار ریال است (×۱۰)</option><option value="1">سپیدار هم تومان است (×۱)</option></select>
<div class="btns"><button id="b-setup" onclick="run('setup')">ذخیره و راه‌اندازی</button></div>
<div class="note">برنامه اول کد اتصال را با هورمند عوض می‌کند، تنظیمات را ذخیره می‌کند و دستگاه را در سپیدار ثبت می‌کند. نتیجه در کادر پایین صفحه نوشته می‌شود.</div></div>

<div class="card"><h2><span class="step">۲</span>آزمایش</h2><p class="hint">قبل از ثبت واقعی این دو را بزنید. هیچ‌کدام چیزی در سپیدار ثبت نمی‌کنند.</p>
<div class="btns"><button class="alt" onclick="run('test')">آزمایش اتصال</button><button class="alt" onclick="run('preview')">پیش‌نمایش (چه چیزهایی ثبت می‌شود)</button></div></div>

<div class="card"><h2><span class="step">۳</span>ثبت در سپیدار</h2><p class="hint">مشتری‌ها و پیش‌فاکتورهای هورمند را در سپیدار ثبت می‌کند. هر مورد فقط یک‌بار ثبت می‌شود.</p>
<div class="btns"><button onclick="run('apply')">ثبت واقعی الان</button><button class="alt" onclick="run('auto')">روشن کردن اجرای خودکار (پس‌زمینه)</button></div></div>

<div class="card"><h2><span class="step">۴</span>پایان کار: پاک کردن از این کامپیوتر</h2><p class="hint">اگر این برنامه را روی سرور مشتری فقط برای یک‌بار اجرا کردید، بعد از اتمام کار پاکش کنید تا هیچ رمز یا فایلی از ما جا نماند.</p>
<label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="rmfolder" style="width:auto" checked>پوشهٔ برنامه هم کاملاً پاک شود</label>
<div class="btns"><button class="alt" style="color:#c53030;border-color:#c53030" onclick="if(confirm('اجرای خودکار متوقف و تنظیمات و رمز ذخیره‌شده پاک می‌شود. ادامه می‌دهید؟'))run('cleanup')">پاک‌سازی کامل این کامپیوتر</button></div>
<div class="note">این کار اجرای خودکار را خاموش می‌کند و فایل‌های تنظیمات و رمز و گزارش را پاک می‌کند. کلید هورمند و دستگاه سپیدار را باید خودتان حذف کنید (مرحلهٔ‌ها در راهنمای PDF آمده).</div></div>

<div class="card"><h2>گزارش کار</h2><pre id="log">منتظر دستور شما…</pre></div>
</div>
<script>
const T=location.pathname.split('/')[1];const $=id=>document.getElementById(id);
const api=(p,b)=>fetch('/'+T+'/'+p,b?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}:{}).then(r=>r.json());
let seen=0,timer=null;
function paint(lines){const el=$('log');el.textContent=lines.join('\\n')||'…';el.scrollTop=el.scrollHeight}
async function poll(){const r=await api('log?from=0');paint(r.lines);document.querySelectorAll('button').forEach(b=>b.disabled=r.running);if(!r.running){clearInterval(timer);timer=null}}
async function run(action){const body={action,hoormand:$('hoormand').value.trim(),code:$('code').value.trim(),sepidar:$('sepidar').value.trim(),serial:$('serial').value.trim(),user:$('user').value.trim(),password:$('password').value,multiplier:$('multiplier').value,rmfolder:$('rmfolder').checked};
const r=await api('run',body);if(r.error){$('log').textContent=r.error;return}
if(!timer)timer=setInterval(poll,700);poll()}
(async()=>{const s=await api('state');for(const k of ['hoormand','sepidar','serial','user'])if(s[k])$(k).value=s[k];if(s.hasPassword)$('passhelp').textContent='رمز قبلاً ذخیره شده؛ اگر عوض نشده خالی بگذارید.';if(s.multiplier)$('multiplier').value=String(s.multiplier);})();
</script></body></html>`;

export function startUi({ dir, cfgPath, script }) {
  const token = crypto.randomBytes(9).toString('hex');
  const job = { running: false, lines: [] };
  const readCfg = () => {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch {
      return {};
    }
  };
  const addLines = (chunk) => {
    for (const l of String(chunk).split(/\r?\n/)) if (l.trim()) job.lines.push(l);
    if (job.lines.length > 400) job.lines.splice(0, job.lines.length - 400);
  };
  const runNode = (argv, detached = false) => {
    const child = spawn(process.execPath, [script, ...argv], { cwd: dir, windowsHide: true, detached, stdio: detached ? 'ignore' : ['ignore', 'pipe', 'pipe'], env: { ...process.env, HM_NOFA: '1' } });
    if (detached) {
      child.unref();
      return child;
    }
    job.running = true;
    child.stdout.on('data', addLines);
    child.stderr.on('data', addLines);
    child.on('close', (code) => {
      job.lines.push(code === 0 ? '— تمام شد —' : `— با خطا تمام شد (کد ${code}) —`);
      job.running = false;
    });
    return child;
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] !== token) {
      res.writeHead(404).end('not found');
      return;
    }
    const json = (o, code = 200) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(o));
    const sub = parts[1];
    if (!sub) return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(PAGE(fontCss(dir)));
    if (sub === 'state') {
      const c = readCfg();
      return json({ hoormand: c.hoormand?.url || '', sepidar: c.sepidar?.url || '', serial: c.sepidar?.serial || '', user: c.sepidar?.userName || '', hasPassword: !!c.sepidar?.password, multiplier: c.sync?.priceMultiplier || 10 });
    }
    if (sub === 'log') return json({ running: job.running, lines: job.lines });
    if (sub === 'run' && req.method === 'POST') {
      let raw = '';
      for await (const ch of req) raw += ch;
      let b = {};
      try {
        b = JSON.parse(raw);
      } catch {
        return json({ error: 'درخواست نامعتبر بود.' }, 400);
      }
      if (job.running) return json({ error: 'کار قبلی هنوز تمام نشده است؛ چند لحظه صبر کنید.' }, 409);
      job.lines = [];
      const c = readCfg();
      const a = b.action;
      if (a === 'setup') {
        const hUrl = b.hoormand || c.hoormand?.url;
        const serial = b.serial || c.sepidar?.serial;
        const user = b.user || c.sepidar?.userName;
        const pass = b.password || c.sepidar?.password;
        if (!hUrl || !serial || !user || !pass) return json({ error: 'نشانی هورمند، سریال، نام کاربری و رمز سپیدار را بنویسید.' }, 400);
        const argv = ['setup', '--yes', '--no-autostart', '--hoormand', hUrl, '--sepidar', b.sepidar || c.sepidar?.url || 'http://localhost:7373', '--serial', serial, '--user', user, '--password', pass, '--multiplier', String(b.multiplier || 10)];
        if (b.code) argv.push('--code', b.code);
        job.lines.push('در حال راه‌اندازی…');
        runNode(argv);
      } else if (a === 'test') runNode(['test']);
      else if (a === 'preview') runNode(['sync']);
      else if (a === 'apply') runNode(['sync', '--apply']);
      else if (a === 'auto') {
        runNode(['watch', '--apply'], true);
        job.lines.push('اجرای خودکار در پس‌زمینه شروع شد؛ هر چند دقیقه مشتری‌ها و پیش‌فاکتورها را همگام می‌کند.');
        job.lines.push('این فقط تا زمانی که کامپیوتر روشن است کار می‌کند. برای اینکه بعد از هر روشن‌شدن کامپیوتر هم خودکار شروع شود، «ذخیره و راه‌اندازی» را در پنجرهٔ قدیمی (۰-راه‌اندازی-خودکار) بزنید.');
      } else if (a === 'cleanup') {
        cleanup(dir, !!b.rmfolder, job);
      } else return json({ error: 'دستور ناشناخته.' }, 400);
      return json({ ok: true });
    }
    res.writeHead(404).end('not found');
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/${token}/`;
    console.log('صفحهٔ اتصال: ' + url);
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
  });
  // the window closes the program itself after two hours without use
  setTimeout(() => process.exit(0), 2 * 3600 * 1000).unref();
}

/** Switches the automatic run off, deletes what this program saved (settings with the password, state, log) and, if asked, the whole folder. */
function cleanup(dir, removeFolder, job) {
  const say = (t) => job.lines.push(t);
  job.running = true;
  setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        try {
          execFileSync('schtasks', ['/Delete', '/TN', 'HoormandSepidar', '/F'], { stdio: 'pipe' });
          say('اجرای خودکار با روشن‌شدن کامپیوتر برداشته شد.');
        } catch {
          say('اجرای خودکار (زمان‌بندی ویندوز) از قبل وجود نداشت.');
        }
        try {
          // the background run (watch) of this folder
          const me = process.pid;
          execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*sepidar-sync.mjs*watch*' -and $_.ProcessId -ne ${me} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: 'pipe' });
          say('برنامهٔ پس‌زمینه (اگر در حال اجرا بود) متوقف شد.');
        } catch {
          say('بستن برنامهٔ پس‌زمینه ممکن نشد؛ اگر پنجره‌ای از «۵-اجرای-خودکار» باز است خودتان ببندید.');
        }
      }
      for (const f of ['config.json', 'state.json', 'sepidar.log', 'اجرای-پنهان.vbs']) {
        try {
          fs.rmSync(path.join(dir, f), { force: true });
          say('پاک شد: ' + f);
        } catch (e) {
          say('پاک نشد: ' + f + ' (' + e.message + ')');
        }
      }
      say('کلید هورمند و رمز سپیدار از این کامپیوتر برداشته شد.');
      say('یادآوری: در هورمند کلید «سپیدار» را از «کنسول مدیریت ← تنظیمات سیستم ← اتصال برنامه‌ها (API)» حذف کنید و اگر خواستید در سپیدار «دستگاه» را از «سفارش‌گیری و پخش ← دستگاه» پاک کنید.');
      if (removeFolder && process.platform === 'win32') {
        say('پوشهٔ برنامه چند ثانیهٔ دیگر کاملاً پاک می‌شود و این صفحه بسته می‌شود.');
        spawn('cmd.exe', ['/d', '/s', '/c', `"ping 127.0.0.1 -n 5 >nul & rmdir /s /q "${dir}""`], { cwd: os.tmpdir(), windowsHide: true, detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
        process.chdir(os.tmpdir());
        setTimeout(() => process.exit(0), 800);
      }
      say('— تمام شد —');
    } finally {
      job.running = false;
    }
  }, 50);
}
