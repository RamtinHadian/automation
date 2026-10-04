'use strict';
/**
 * Hoormand installer panel.
 * A small web page that runs ON YOUR OWN COMPUTER (http://127.0.0.1:7077). You type the server address, the SSH user
 * and the password yourself; the panel logs in over SSH and installs the system step by step. It reads what the
 * server answers (the "screen") and picks the next command from that: no AI and no cloud, only fixed rules written
 * from the problems seen on real servers (Docker Hub blocked, firewall closed, git branch errors ...).
 * The password stays in memory of this process only: it is never written to a file or to the log.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const { WebSocketServer } = require('ws');

process.on('uncaughtException', (e) => console.error('خطای پیش‌بینی‌نشده (پنل ادامه می‌دهد):', e && e.message));
process.on('unhandledRejection', (e) => console.error('خطای پیش‌بینی‌نشده (پنل ادامه می‌دهد):', e && e.message));

const PORT = Number(process.env.PANEL_PORT || 7077);
const HOST = '127.0.0.1';
const ROOT = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
  '/vendor/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
  '/vendor/addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
  '/vendor/html2canvas.js': 'node_modules/html2canvas/dist/html2canvas.min.js',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  let file = VENDOR[url] ? path.join(__dirname, VENDOR[url]) : path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(__dirname)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => !origin || origin === `http://127.0.0.1:${PORT}` || origin === `http://localhost:${PORT}`,
});

// ---------------------------------------------------------------- helpers
const MIRRORS = ['https://docker.arvancloud.ir', 'https://registry.docker.ir', 'https://mirror.gcr.io'];
const REPO_RAW = 'https://raw.githubusercontent.com/RamtinHadian/automation/frontend/install.sh';
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(ws) {
    this.ws = ws;
    this.conn = null;
    this.user = '';
    this.password = '';
    this.running = false;
    this.cancelled = false;
    this.steps = [];
    this.adminPassword = '';
  }
  send(o) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }
  log(text, color) {
    const c = { cyan: '36', green: '32', red: '31', yellow: '33', gray: '90' }[color];
    this.send({ type: 'log', data: (c ? `\x1b[${c}m` : '') + text.replace(/\r?\n/g, '\r\n') + (c ? '\x1b[0m\r\n' : '') });
  }
  setStep(id, status, note) {
    const s = this.steps.find((x) => x.id === id);
    if (s) {
      s.status = status;
      if (note !== undefined) s.note = note;
    }
    this.send({ type: 'steps', steps: this.steps });
  }

  connect({ host, port, username, password }) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let finished = false;
      conn
        .on('ready', () => {
          finished = true;
          this.conn = conn;
          this.user = username;
          this.password = password;
          resolve();
        })
        .on('error', (e) => {
          if (!finished) {
            finished = true;
            reject(e);
          } else this.log(`\nارتباط SSH قطع شد: ${e.message}`, 'red');
        })
        .on('close', () => {
          this.conn = null;
        })
        .connect({
          host,
          port: Number(port) || 22,
          username,
          password,
          readyTimeout: 20000,
          keepaliveInterval: 10000,
          keepaliveCountMax: 30,
          hostVerifier: (key) => {
            const fp = require('crypto').createHash('sha256').update(key).digest('base64');
            this.log(`اثر انگشت سرور (SHA256): ${fp}`, 'gray');
            return true;
          },
        });
    });
  }

  /**
   * Runs one command on the server and returns {code, out}. With {root:true} it runs through sudo (the password is
   * given to sudo on its standard input and is never printed). {quiet:true} keeps the output off the screen.
   */
  run(cmd, { root = false, quiet = false, label, timeout = 0 } = {}) {
    return new Promise((resolve) => {
      if (!this.conn) return resolve({ code: 255, out: 'no connection' });
      const needSudo = root && this.user !== 'root';
      const full = needSudo ? `sudo -S -p '' bash -c ${sq(cmd)}` : `bash -c ${sq(cmd)}`;
      if (!quiet) this.log(`$ ${label || (needSudo ? 'sudo ' : '') + cmd}`, 'cyan');
      let out = '';
      let timer;
      this.conn.exec(full, { pty: false }, (err, stream) => {
        if (err) return resolve({ code: 255, out: String(err.message) });
        const take = (d) => {
          const t = d.toString();
          out += t;
          if (!quiet) this.log(t);
        };
        stream.on('error', () => {});
        stream.stderr.on('error', () => {});
        stream.on('data', take);
        stream.stderr.on('data', take);
        stream.on('close', (code) => {
          clearTimeout(timer);
          if (!quiet && out && !out.endsWith('\n')) this.send({ type: 'log', data: '\r\n' });
          resolve({ code: code ?? 0, out });
        });
        if (needSudo) stream.write(this.password + '\n');
        if (timeout) timer = setTimeout(() => stream.close(), timeout);
      });
    });
  }


  /**
   * Runs a long command (building the app takes minutes) in the background ON THE SERVER and shows its output
   * as it grows. If the SSH line drops, the job keeps running on the server and can be picked up again.
   */
  async runJob(script, { root = true, label } = {}) {
    const LOG = '/tmp/hoormand-job.log';
    const EXIT = '/tmp/hoormand-job.exit';
    const running = await this.run(`pgrep -f 'bash /tmp/hoormand-job.sh' >/dev/null && echo yes`, { quiet: true });
    if (/yes/.test(running.out)) {
      this.log('یک نصب نیمه‌کاره روی سرور در حال اجراست؛ به آن وصل می‌شوم.', 'yellow');
    } else {
      const b64 = Buffer.from('#!/bin/bash\n' + script + '\necho $? > ' + EXIT + '\n').toString('base64');
      const start = `rm -f ${EXIT} ${LOG}; echo ${b64} | base64 -d > /tmp/hoormand-job.sh; setsid nohup bash /tmp/hoormand-job.sh > ${LOG} 2>&1 < /dev/null & echo started`;
      this.log(`$ ${label || script}`, 'cyan');
      const st = await this.run(start, { root, quiet: true });
      if (!/started/.test(st.out)) return { code: 255, out: st.out };
    }
    let offset = 0;
    let all = '';
    let lost = 0;
    for (;;) {
      if (this.cancelled) return { code: 255, out: all };
      const r = await this.run(`s=$(wc -c < ${LOG} 2>/dev/null || echo 0); e=$(cat ${EXIT} 2>/dev/null || echo RUN); echo "HJ $s $e"; OFF=${offset}; tail -c +$((OFF+1)) ${LOG} 2>/dev/null | head -c $((s-OFF))`, { root, quiet: true });
      const m = /^HJ (\d+) (\S+)\n?/.exec(r.out);
      if (!m) {
        if (++lost > 20) return { code: 255, out: all + '\nارتباط با سرور قطع شد.' };
        await sleep(3000);
        continue;
      }
      lost = 0;
      const chunk = r.out.slice(m[0].length);
      if (chunk) {
        this.log(chunk.endsWith('\n') ? chunk : chunk + '\n');
        all += chunk;
      }
      offset = Number(m[1]);
      if (m[2] !== 'RUN') return { code: Number(m[2]) || 0, out: all };
      await sleep(2500);
    }
  }

  // ---------------------------------------------------------------- the installation, one step after the other
  async install(opts) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    const port = String(opts.appPort || 8080).replace(/\D/g, '') || '8080';
    this.steps = [
      { id: 'system', title: 'بررسی سرور', status: 'wait' },
      { id: 'network', title: 'بررسی اینترنت و GitHub', status: 'wait' },
      { id: 'docker', title: 'نصب Docker', status: 'wait' },
      { id: 'hub', title: 'بررسی دانلود از Docker Hub', status: 'wait' },
      { id: 'app', title: 'دانلود و ساخت برنامه', status: 'wait' },
      { id: 'update', title: 'روشن کردن به‌روزرسانی خودکار', status: 'wait' },
      { id: 'firewall', title: 'فایروال', status: 'wait' },
      { id: 'verify', title: 'آزمایش نهایی', status: 'wait' },
    ];
    this.send({ type: 'steps', steps: this.steps });
    const steps = {
      system: () => this.stepSystem(),
      network: () => this.stepNetwork(),
      docker: () => this.stepDocker(),
      hub: () => this.stepHub(),
      app: () => this.stepApp(port),
      update: () => this.stepUpdate(),
      firewall: () => this.stepFirewall(port),
      verify: () => this.stepVerify(port),
    };
    for (const s of this.steps) {
      if (this.cancelled || !this.conn) break;
      this.setStep(s.id, 'run');
      this.log(`\n━━━ ${s.title} ━━━`, 'yellow');
      let r;
      try {
        r = await steps[s.id]();
      } catch (e) {
        r = { ok: false, note: `خطای غیرمنتظره: ${e.message}` };
      }
      this.setStep(s.id, r.ok ? 'ok' : 'fail', r.note);
      this.send({ type: 'shot', id: s.id, title: s.title, ok: r.ok });
      if (!r.ok) {
        this.log(`\n✗ ${r.note || 'این مرحله انجام نشد.'}`, 'red');
        this.send({ type: 'stopped', step: s.id, note: r.note || '' });
        this.running = false;
        return;
      }
      this.log(`✓ ${r.note || 'انجام شد'}`, 'green');
    }
    this.running = false;
  }

  async stepSystem() {
    const r = await this.run(`. /etc/os-release 2>/dev/null; echo "سیستم‌عامل: $PRETTY_NAME"; echo "کاربر: $(whoami)"; echo "آدرس: $(hostname -I)"; free -m | awk 'NR==2{print "رم: "$2" مگابایت"}'; df -h / | awk 'NR==2{print "فضای آزاد: "$4}'`);
    if (r.code !== 0) return { ok: false, note: 'نتوانستم اطلاعات سرور را بخوانم.' };
    if (this.user !== 'root') {
      const s = await this.run('true', { root: true, quiet: true });
      if (s.code !== 0) return { ok: false, note: 'این کاربر دسترسی sudo ندارد یا رمز به sudo داده نشد. با کاربری وارد شوید که sudo دارد (یا root).' };
      this.log('دسترسی sudo تایید شد.', 'gray');
    }
    const m = /رم: (\d+)/.exec(r.out);
    if (m && Number(m[1]) < 1500) return { ok: false, note: `رم سرور (${m[1]} مگابایت) برای ساخت برنامه کم است؛ دست‌کم ۲ گیگابایت لازم است.` };
    const apt = await this.run('command -v apt-get >/dev/null && echo apt', { quiet: true });
    if (!/apt/.test(apt.out)) this.log('این سرور اوبونتو/دبیان نیست؛ نصب Docker ممکن است دستی لازم شود.', 'yellow');
    return { ok: true, note: 'سرور آماده است.' };
  }

  async stepNetwork() {
    const g = await this.run(`curl -sS -m 20 -o /dev/null -w "github: %{http_code}\\n" https://github.com; curl -sS -m 20 -o /dev/null -w "raw: %{http_code}\\n" ${REPO_RAW}`);
    if (!/github: 200/.test(g.out) || !/raw: 200/.test(g.out)) {
      return { ok: false, note: 'سرور به GitHub دسترسی ندارد؛ کد برنامه از آن‌جا دانلود می‌شود. اینترنت، DNS یا فیلترینگ سرور را بررسی کنید.' };
    }
    return { ok: true, note: 'GitHub در دسترس است.' };
  }

  async stepDocker() {
    const have = await this.run('docker --version && docker compose version', { quiet: true });
    if (have.code === 0) {
      this.log(have.out.trim(), 'gray');
      return { ok: true, note: 'Docker از قبل نصب است.' };
    }
    this.log('Docker نصب نیست؛ نصب می‌شود (چند دقیقه).', 'gray');
    let r = await this.run('curl -fsSL -m 120 https://get.docker.com | sh', { root: true, label: 'sudo (نصب Docker از get.docker.com)' });
    if (r.code !== 0) {
      this.log('get.docker.com جواب نداد؛ از مخزن خود اوبونتو نصب می‌کنم.', 'yellow');
      r = await this.run('apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2', { root: true });
    }
    await this.run('systemctl enable --now docker', { root: true, quiet: true });
    const check = await this.run('docker compose version', { root: true, quiet: true });
    if (check.code !== 0) return { ok: false, note: 'Docker نصب نشد. آخرین خطوط صفحه را برای پشتیبانی بفرستید.' };
    return { ok: true, note: 'Docker نصب شد.' };
  }

  async stepHub() {
    const pull = () => this.run('docker pull -q postgres:16-alpine', { root: true });
    let r = await pull();
    if (r.code === 0) return { ok: true, note: 'دانلود از Docker Hub مشکلی ندارد.' };
    this.log('دانلود از Docker Hub شکست خورد (معمولاً فیلتر یا ۴۰۳). آینه‌های Docker را تنظیم می‌کنم.', 'yellow');
    const json = JSON.stringify({ 'registry-mirrors': MIRRORS });
    await this.run(`mkdir -p /etc/docker && [ -f /etc/docker/daemon.json ] && cp /etc/docker/daemon.json /etc/docker/daemon.json.bak-hoormand; printf '%s' ${sq(json)} > /etc/docker/daemon.json && systemctl restart docker`, { root: true, label: 'sudo (نوشتن آینه‌ها در /etc/docker/daemon.json و راه‌اندازی دوبارهٔ Docker)' });
    await sleep(4000);
    r = await pull();
    if (r.code === 0) return { ok: true, note: 'با آینهٔ Docker دانلود جواب داد.' };
    return {
      ok: false,
      note: 'هیچ‌کدام از آینه‌ها هم جواب ندادند. راه‌حل: ایمیج‌ها را از کامپیوتری که Docker Hub دارد با «docker save» بسازید و روی سرور «docker load» کنید؛ یا از پشتیبان بخواهید برایتان آماده کند.',
    };
  }

  async stepApp(port) {
    const exists = await this.run('[ -f /opt/automation/docker-compose.yml ] && echo yes', { quiet: true });
    const env = /yes/.test(exists.out) ? 'PORT=' + port : 'PORT=' + port;
    this.log('نصب برنامه ۵ تا ۱۰ دقیقه طول می‌کشد؛ لطفاً صبر کنید.', 'gray');
    const r = await this.runJob(`export ${env} AUTO_UPDATE=0; curl -fsSL -m 60 ${REPO_RAW} | bash`, { label: 'نصب‌کنندهٔ برنامه از GitHub (روی خود سرور اجرا می‌شود)' });
    if (r.code !== 0) {
      if (/403|Forbidden|toomanyrequests|failed to resolve|failed to copy/i.test(r.out)) return { ok: false, note: 'ساخت برنامه به دانلود از Docker Hub برخورد کرد. دوباره «شروع نصب» را بزنید یا آینه‌ها را بررسی کنید.' };
      return { ok: false, note: 'نصب برنامه با خطا تمام شد. آخرین خطوط صفحه را برای پشتیبانی بفرستید.' };
    }
    const up = await this.run('cd /opt/automation && docker compose ps --format "{{.Service}} {{.State}}"', { root: true, quiet: true });
    this.log(up.out.trim(), 'gray');
    if (!/app running/.test(up.out) || !/db running/.test(up.out)) return { ok: false, note: 'برنامه ساخته شد ولی اجرا نشد. با «sudo docker compose logs app» در /opt/automation علت را ببینید.' };
    return { ok: true, note: 'برنامه ساخته و اجرا شد.' };
  }

  async stepUpdate() {
    let r = await this.runJob('cd /opt/automation && ./auto-update.sh', { label: 'cd /opt/automation && ./auto-update.sh' });
    if (/Cannot fast-forward|multiple branches/i.test(r.out)) {
      this.log('خطای شاخه‌های git؛ اصلاح می‌کنم.', 'yellow');
      await this.run('cd /opt/automation && git fetch origin frontend && git checkout -B frontend origin/frontend', { root: true });
      r = await this.runJob('cd /opt/automation && ./auto-update.sh', { label: 'cd /opt/automation && ./auto-update.sh' });
    }
    const active = await this.run('systemctl is-active automation-update', { root: true, quiet: true });
    if (!/^active/.test(active.out.trim())) return { ok: false, note: 'سرویس به‌روزرسانی خودکار روشن نشد؛ برنامه کار می‌کند ولی آپدیت دستی است.' };
    return { ok: true, note: 'به‌روزرسانی خودکار روشن است.' };
  }

  async stepFirewall(port) {
    const s = await this.run('command -v ufw >/dev/null && ufw status || echo "ufw-not-installed"', { root: true });
    if (/not-installed|inactive/i.test(s.out) && !/Status: active/i.test(s.out)) return { ok: true, note: 'فایروال روشن نیست؛ چیزی لازم نیست.' };
    if (new RegExp(`\\b${port}/tcp\\b[^\\n]*ALLOW`, 'i').test(s.out)) return { ok: true, note: `پورت ${port} از قبل باز است.` };
    const r = await this.run(`ufw allow ${port}/tcp`, { root: true });
    return r.code === 0 ? { ok: true, note: `پورت ${port} در فایروال باز شد.` } : { ok: false, note: 'باز کردن پورت در فایروال نشد.' };
  }

  async stepVerify(port) {
    let code = '';
    for (let i = 0; i < 20; i++) {
      const r = await this.run(`curl -s -o /dev/null -m 5 -w "%{http_code}" http://127.0.0.1:${port}/`, { quiet: true });
      code = r.out.trim();
      if (code === '200') break;
      await sleep(3000);
    }
    this.log(`پاسخ برنامه روی خود سرور: ${code || 'بدون پاسخ'}`, 'gray');
    if (code !== '200') return { ok: false, note: 'برنامه روی سرور جواب نمی‌دهد. «sudo docker compose logs app» را در /opt/automation ببینید.' };
    const ip = (await this.run("hostname -I | awk '{print $1}'", { quiet: true })).out.trim();
    const pw = (await this.run("grep '^ADMIN_PASSWORD=' /opt/automation/.env | cut -d= -f2", { root: true, quiet: true })).out.trim();
    const mail = (await this.run("grep '^ADMIN_EMAIL=' /opt/automation/.env | cut -d= -f2", { root: true, quiet: true })).out.trim();
    this.send({ type: 'done', url: `http://${ip}:${port}`, admin: `http://${ip}:${port}/admin`, email: mail, password: pw });
    return { ok: true, note: 'نصب کامل شد.' };
  }

  close() {
    this.cancelled = true;
    try {
      this.conn && this.conn.end();
    } catch {}
    this.password = '';
  }
}

wss.on('connection', (ws) => {
  const s = new Session(ws);
  ws.on('message', async (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.type === 'connect') {
      s.log(`در حال اتصال به ${m.username}@${m.host}:${m.port || 22} ...`, 'gray');
      try {
        await s.connect(m);
        s.log('اتصال برقرار شد.', 'green');
        s.send({ type: 'connected' });
      } catch (e) {
        const text = /authentication/i.test(e.message) ? 'نام کاربری یا رمز اشتباه است.' : /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/.test(e.message + (e.code || '')) ? 'به سرور نرسیدم؛ آدرس، پورت SSH و اینکه سرور روشن و در دسترس است را بررسی کنید.' : e.message;
        s.log(text, 'red');
        s.send({ type: 'connect-failed', note: text });
      }
    } else if (m.type === 'start') {
      s.install({ appPort: m.appPort });
    } else if (m.type === 'disconnect') {
      s.close();
    }
  });
  ws.on('close', () => s.close());
});

server.listen(PORT, HOST, () => console.log(`پنل نصب هورمند: http://${HOST}:${PORT}`));
