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
const BUNDLE = path.join(__dirname, 'bundle', 'hoormand-src.tgz');
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
    this.dir = '/opt/automation';
    this.name = 'automation';
    this.domain = '';
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
          this.host = host;
          this.sshPort = Number(port) || 22;
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
      cmd = cmd.split('/opt/automation').join(this.dir);
      const needSudo = root && this.user !== 'root';
      const full = needSudo ? `sudo -S -p '' bash -c ${sq(cmd)}` : `bash -c ${sq(cmd)}`;
      if (!quiet) this.log(`$ ${label || (needSudo ? 'sudo ' : '') + cmd}`, 'cyan');
      let out = '';
      let timer;
      this.conn.exec(full, { pty: false }, (err, stream) => {
        if (err) return resolve({ code: 255, out: String(err.message) });
        const take = (d) => {
          const t = d.toString().replace(/^sudo: .*\n?/gm, '');
          if (!t) return;
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
    script = script.split('/opt/automation').join(this.dir);
    const LOG = '/tmp/hoormand-job.log';
    const EXIT = '/tmp/hoormand-job.exit';
    const PID = '/tmp/hoormand-job.pid';
    const running = await this.run(`[ -f ${PID} ] && [ ! -f ${EXIT} ] && kill -0 $(cat ${PID}) 2>/dev/null && echo yes`, { quiet: true });
    if (/yes/.test(running.out)) {
      this.log('یک نصب نیمه‌کاره روی سرور در حال اجراست؛ به آن وصل می‌شوم.', 'yellow');
    } else {
      const b64 = Buffer.from('#!/bin/bash\necho $$ > ' + PID + '\n' + script + '\necho $? > ' + EXIT + '\n').toString('base64');
      const start = `rm -f ${EXIT} ${LOG} ${PID}; echo ${b64} | base64 -d > /tmp/hoormand-job.sh; setsid nohup bash /tmp/hoormand-job.sh > ${LOG} 2>&1 < /dev/null & echo started`;
      this.log(`$ ${label || script}`, 'cyan');
      const st = await this.run(start, { root, quiet: true });
      if (!/started/.test(st.out)) {
        // detaching did not work on this server: run the same script directly (live, but a dropped line would stop it)
        this.log(`اجرای پس‌زمینه شروع نشد (کد ${st.code}${st.out.trim() ? ': ' + st.out.trim().slice(0, 300) : ''}). مستقیم اجرا می‌کنم.`, 'yellow');
        return this.run(script, { root, label: label || script });
      }
    }
    let offset = 0;
    let all = '';
    let lost = 0;
    let dead = 0;
    for (;;) {
      if (this.cancelled) return { code: 255, out: all };
      const r = await this.run(`s=$(wc -c < ${LOG} 2>/dev/null || echo 0); e=$(cat ${EXIT} 2>/dev/null || echo RUN); a=$(kill -0 $(cat ${PID} 2>/dev/null) 2>/dev/null && echo 1 || echo 0); echo "HJ $s $e $a"; OFF=${offset}; tail -c +$((OFF+1)) ${LOG} 2>/dev/null | head -c $((s-OFF))`, { root, quiet: true });
      const m = /HJ (\d+) (\S+)(?: (\d))?\n?/.exec(r.out);
      if (!m) {
        if (++lost > 5) {
          this.log('جواب خواندن وضعیت نصب نامفهوم بود: ' + JSON.stringify(r.out.slice(0, 200)) + ' (کد ' + r.code + '). همان کار را مستقیم اجرا می‌کنم.', 'yellow');
          return this.run(script, { root, label: label || script });
        }
        await sleep(3000);
        continue;
      }
      lost = 0;
      const chunk = r.out.slice(m.index + m[0].length);
      if (chunk) {
        this.log(chunk.endsWith('\n') ? chunk : chunk + '\n');
        all += chunk;
      }
      offset = Number(m[1]);
      if (m[2] !== 'RUN') return { code: Number(m[2]) || 0, out: all };
      // the job vanished without writing an exit code (killed, server restarted): do not wait for ever
      if (m[3] === '0') {
        if (++dead >= 3) {
          // the background job died at once (this server does not keep it alive): run the script directly instead
          this.log('کار پس‌زمینه روی این سرور بلافاصله متوقف شد' + (all.trim() ? '' : ' و خروجی نداشت') + '؛ همان کار را مستقیم و زنده اجرا می‌کنم.', 'yellow');
          return this.run(script, { root, label: label || script });
        }
      } else dead = 0;
      await sleep(2500);
    }
  }

  // ---------------------------------------------------------------- the installation, one step after the other
  async install(opts) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    const port = String(opts.appPort || 8080).replace(/\D/g, '') || '8080';
    // a second CRM beside the first: its own folder, Docker project, database, port, update service and (optionally) domain
    const name = String(opts.name || 'automation').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'automation';
    this.name = name;
    this.dir = name === 'automation' ? '/opt/automation' : '/opt/' + name;
    this.domain = String(opts.domain || '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    // the machine's own name (optional): set first, before anything is installed
    const hostName = String(opts.hostname || '').trim().toLowerCase();
    if (hostName && !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(hostName)) {
      this.send({ type: 'stopped', step: 'hostname', note: 'نام سرور فقط حرف انگلیسی کوچک، عدد و خط تیره باشد (و با خط تیره شروع یا تمام نشود).' });
      this.running = false;
      return;
    }
    this.hostName = hostName;
    this.log('نصب «' + name + '» در ' + this.dir + ' روی پورت ' + port + (this.domain ? ' با دامنهٔ ' + this.domain : ''), 'gray');
    this.steps = [
      ...(hostName ? [{ id: 'hostname', title: 'نام سرور (hostname)', status: 'wait' }] : []),
      { id: 'system', title: 'بررسی سرور', status: 'wait' },
      { id: 'network', title: 'بررسی اینترنت و GitHub', status: 'wait' },
      { id: 'docker', title: 'نصب Docker', status: 'wait' },
      { id: 'hub', title: 'بررسی دانلود از Docker Hub', status: 'wait' },
      { id: 'app', title: 'دانلود و ساخت برنامه', status: 'wait' },
      { id: 'update', title: 'روشن کردن به‌روزرسانی خودکار', status: 'wait' },
      { id: 'domain', title: 'دامنه (Caddy)', status: 'wait' },
      { id: 'firewall', title: 'فایروال', status: 'wait' },
      { id: 'ip', title: 'ثابت کردن آدرس IP', status: 'wait' },
      { id: 'verify', title: 'آزمایش نهایی', status: 'wait' },
    ];
    this.send({ type: 'steps', steps: this.steps });
    const steps = {
      hostname: () => this.stepHostname(),
      system: () => this.stepSystem(),
      network: () => this.stepNetwork(),
      docker: () => this.stepDocker(),
      hub: () => this.stepHub(),
      app: () => this.stepApp(port),
      update: () => this.stepUpdate(),
      domain: () => this.stepDomain(port),
      firewall: () => this.stepFirewall(port),
      ip: () => this.stepIp(),
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

  /** Gives the machine the name typed in the form (and keeps /etc/hosts in step, so that sudo does not complain). */
  async stepHostname() {
    const name = this.hostName;
    const cur = (await this.run('hostname', { quiet: true })).out.trim();
    if (cur === name) return { ok: true, note: 'نام سرور از قبل «' + name + '» است.' };
    const r = await this.run(
      'hostnamectl set-hostname ' + name + ' && { if grep -q "^127.0.1.1" /etc/hosts; then sed -i "s/^127.0.1.1.*/127.0.1.1 ' + name + '/" /etc/hosts; else echo "127.0.1.1 ' + name + '" >> /etc/hosts; fi; } && hostname',
      { root: true });
    const now = (await this.run('hostname', { quiet: true })).out.trim();
    if (r.code !== 0 || now !== name) return { ok: false, note: 'نام سرور عوض نشد.' };
    return { ok: true, note: 'نام سرور از «' + cur + '» به «' + name + '» عوض شد.' };
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

  uploadFile(local, remote) {
    return new Promise((resolve) => {
      if (!this.conn) return resolve(false);
      this.conn.exec('cat > ' + remote, (err, stream) => {
        if (err) return resolve(false);
        const total = fs.statSync(local).size;
        let sent = 0;
        let last = 0;
        stream.on('error', () => resolve(false));
        stream.resume(); // the server's (empty) answer must be read, or the channel never closes
        stream.stderr.resume();
        stream.on('close', () => resolve(true));
        const rs = fs.createReadStream(local);
        rs.on('data', (c) => {
          sent += c.length;
          if (sent - last > 1024 * 1024) {
            last = sent;
            this.log('ارسال کد: ' + Math.round((sent / total) * 100) + '٪', 'gray');
          }
        });
        rs.on('error', () => resolve(false));
        rs.pipe(stream);
      });
    });
  }

  async stepNetwork() {
    const g = await this.run(`curl -sS -m 20 -o /dev/null -w "github: %{http_code}\\n" https://github.com; curl -sS -m 20 -o /dev/null -w "raw: %{http_code}\\n" ${REPO_RAW}`);
    if (!/github: 200/.test(g.out) || !/raw: 200/.test(g.out)) {
      if (fs.existsSync(BUNDLE)) {
        this.offline = true;
        this.log('GitHub از این سرور باز نمی‌شود؛ کد برنامه را از همین کامپیوتر (فایل ' + path.basename(BUNDLE) + ') روی سرور می‌فرستم. به‌روزرسانی خودکار از GitHub در این حالت کار نمی‌کند.', 'yellow');
        return { ok: true, note: 'GitHub بسته است؛ نصب با ارسال کد از این کامپیوتر انجام می‌شود.' };
      }
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
    let r = await this.run('curl -fsS -m 25 -o /tmp/get-docker.sh https://get.docker.com && sh /tmp/get-docker.sh', { root: true, label: 'sudo (نصب Docker از get.docker.com)' });
    let apt = null;
    if (r.code !== 0) {
      this.log('get.docker.com جواب نداد؛ از مخزن خود اوبونتو نصب می‌کنم (apt).', 'yellow');
      // archive.ubuntu.com is often unreachable from Iran: when it is, point apt at the Iranian mirror (backup kept)
      const reach = await this.run('curl -4 -sI -m 8 http://archive.ubuntu.com/ubuntu/ >/dev/null 2>&1 && echo ok || echo no', { quiet: true });
      if (!/ok/.test(reach.out)) {
        this.log('archive.ubuntu.com از این سرور باز نمی‌شود؛ مخزن apt را روی آینهٔ ایرانی (mirror.arvancloud.ir) می‌گذارم. نسخهٔ قبلی در /etc/apt با پسوند .bak-hoormand ذخیره می‌شود.', 'yellow');
        await this.run(`for f in /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources; do [ -f "$f" ] && { b=/etc/apt/$(basename "$f").bak-hoormand; [ -f "$b" ] || cp "$f" "$b"; sed -i -E 's#https?://([a-z]{2}\\.)?(archive|security)\\.ubuntu\\.com/ubuntu/?#https://mirror.arvancloud.ir/ubuntu#g' "$f"; }; done; echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99hoormand-ipv4; true`, { root: true, label: 'sudo (تغییر مخزن apt به آینهٔ ایرانی)' });
      }
      const upd = await this.run('apt-get update 2>&1 | tail -4', { root: true, label: 'sudo apt-get update' });
      // the Compose plugin has a different name on different releases: try them one after the other
      for (const pkgs of ['docker.io docker-compose-v2', 'docker.io docker-compose-plugin', 'docker.io docker-compose']) {
        apt = await this.run('DEBIAN_FRONTEND=noninteractive apt-get install -y ' + pkgs + ' 2>&1 | tail -6', { root: true, label: 'sudo apt-get install ' + pkgs });
        const ok = await this.run('docker --version', { root: true, quiet: true });
        if (ok.code === 0) break;
      }
      if (/Temporary failure resolving|Could not resolve|Unable to locate|Failed to fetch|Connection failed|Err:/i.test((upd.out || '') + (apt ? apt.out : ''))) {
        this.log('apt هم به مخزن بسته نمی‌رسد: اینترنت این سرور برای نصب Docker کافی نیست.', 'red');
      }
    }
    await this.run('systemctl enable --now docker', { root: true, quiet: true });
    const check = await this.run('docker compose version', { root: true, quiet: true });
    if (check.code !== 0) {
      const dv = await this.run('docker --version', { root: true, quiet: true });
      return { ok: false, note: dv.code === 0 ? 'Docker نصب شد ولی «docker compose» ندارد (بستهٔ compose در مخزن نبود).' : 'Docker نصب نشد؛ سرور نه به get.docker.com می‌رسد و نه مخزن apt را دارد. اینترنت (HTTPS و apt) سرور را باید درست کرد؛ خطوط قرمز/زرد صفحه را بفرستید.' };
    }
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
    if (!/yes/.test(exists.out)) {
      const busy = await this.run('ss -ltn "( sport = :' + port + ' )" | grep -q LISTEN && echo busy', { root: true, quiet: true });
      if (/busy/.test(busy.out)) return { ok: false, note: 'پورت ' + port + ' روی این سرور از قبل استفاده می‌شود (احتمالاً CRM دیگری). پورت دیگری بدهید، مثلاً ' + (Number(port) + 1) + '.' };
    }
    const env = 'PORT=' + port + ' INSTALL_DIR=' + this.dir;
    this.log('نصب برنامه ۵ تا ۱۰ دقیقه طول می‌کشد؛ لطفاً صبر کنید.', 'gray');
    let r;
    if (this.offline) {
      this.log('ارسال کد برنامه به سرور (' + Math.round(fs.statSync(BUNDLE).size / 1024) + ' کیلوبایت)...', 'cyan');
      const sent = await this.uploadFile(BUNDLE, '/tmp/hoormand-src.tgz');
      const got = Number((await this.run('stat -c %s /tmp/hoormand-src.tgz 2>/dev/null || echo 0', { quiet: true })).out.trim());
      if (!sent || got !== fs.statSync(BUNDLE).size) return { ok: false, note: 'ارسال کد به سرور کامل نشد (' + got + ' از ' + fs.statSync(BUNDLE).size + ' بایت رسید؛ ارتباط SSH یا فضای /tmp).' };
      r = await this.runJob(
        'mkdir -p /opt/automation && tar xzf /tmp/hoormand-src.tgz -C /opt/automation && cd /opt/automation && export ' + env + ' AUTO_UPDATE=0 && bash ./install.sh',
        { label: 'باز کردن کد و ساخت برنامه روی خود سرور' }
      );
    } else r = await this.runJob(`export ${env} AUTO_UPDATE=0; curl -fsSL -m 60 ${REPO_RAW} | bash`, { label: 'نصب‌کنندهٔ برنامه از GitHub (روی خود سرور اجرا می‌شود)' });
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
    if (this.offline) return { ok: true, note: 'GitHub در دسترس نیست؛ به‌روزرسانی خودکار روشن نشد. برای آپدیت، پنل نصب را دوباره با کد تازه اجرا کنید.' };
    let r = await this.runJob('cd /opt/automation && ./auto-update.sh', { label: 'cd /opt/automation && ./auto-update.sh' });
    if (/Cannot fast-forward|multiple branches/i.test(r.out)) {
      this.log('خطای شاخه‌های git؛ اصلاح می‌کنم.', 'yellow');
      await this.run('cd /opt/automation && git fetch origin frontend && git checkout -B frontend origin/frontend', { root: true });
      r = await this.runJob('cd /opt/automation && ./auto-update.sh', { label: 'cd /opt/automation && ./auto-update.sh' });
    }
    const svc = this.name === 'automation' ? 'automation-update' : 'automation-update-' + this.name;
    const active = await this.run('systemctl is-active ' + svc, { root: true, quiet: true });
    if (!/^active/.test(active.out.trim())) return { ok: false, note: 'سرویس به‌روزرسانی خودکار روشن نشد؛ برنامه کار می‌کند ولی آپدیت دستی است.' };
    return { ok: true, note: 'به‌روزرسانی خودکار روشن است.' };
  }

  /** Optional: one more site block in the shared Caddy, so several CRMs can share ports 80 and 443 by domain name. */
  async stepDomain(port) {
    if (!this.domain) return { ok: true, note: 'دامنه‌ای داده نشد؛ رد شد (با آدرس و پورت باز می‌شود).' };
    const has = await this.run('command -v caddy >/dev/null && [ -f /etc/caddy/Caddyfile ] && echo yes', { quiet: true });
    if (!/yes/.test(has.out)) {
      this.log('Caddy روی این سرور نیست؛ برای HTTPS باید جداگانه نصب شود (مرحلهٔ ssl).', 'yellow');
      return { ok: true, note: 'Caddy نصب نیست؛ تنظیم دامنه رد شد.' };
    }
    const d = this.domain;
    const block = d + ' {\n\tencode gzip\n\treverse_proxy localhost:' + port + ' {\n\t\tflush_interval -1\n\t}\n}\n';
    const b64 = Buffer.from(block).toString('base64');
    const r = await this.run('grep -q "^' + d + ' " /etc/caddy/Caddyfile && echo exists || { cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-hoormand; echo ' + b64 + ' | base64 -d >> /etc/caddy/Caddyfile; caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy && echo added || { cp /etc/caddy/Caddyfile.bak-hoormand /etc/caddy/Caddyfile; echo failed; }; }', { root: true });
    if (/failed/.test(r.out)) return { ok: false, note: 'تنظیم Caddy معتبر نبود و به حالت قبل برگشت.' };
    return { ok: true, note: /exists/.test(r.out) ? 'دامنه از قبل در Caddy بود.' : 'دامنهٔ ' + d + ' به Caddy اضافه شد (گواهی خودکار گرفته می‌شود؛ DNS و پورت‌های ۸۰ و ۴۴۳ باید درست باشد).' };
  }

  async stepFirewall(port) {
    const s = await this.run('command -v ufw >/dev/null && ufw status || echo "ufw-not-installed"', { root: true });
    if (/not-installed|inactive/i.test(s.out) && !/Status: active/i.test(s.out)) return { ok: true, note: 'فایروال روشن نیست؛ چیزی لازم نیست.' };
    if (new RegExp(`\\b${port}/tcp\\b[^\\n]*ALLOW`, 'i').test(s.out)) return { ok: true, note: `پورت ${port} از قبل باز است.` };
    const r = await this.run(`ufw allow ${port}/tcp`, { root: true });
    return r.code === 0 ? { ok: true, note: `پورت ${port} در فایروال باز شد.` } : { ok: false, note: 'باز کردن پورت در فایروال نشد.' };
  }


  // ---------------------------------------------------------------- full copy of a Hoormand server onto another one
  /**
   * Takes the whole of this server's Hoormand (database copy, the files folder, optionally the call recordings), carries it
   * through this panel to the target server (a Hoormand that is already installed there) and restores it there.
   * The target's own data is replaced; a safety copy of it is kept in its backups folder first.
   */
  async migrate(o) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    const T = o.target || {};
    if (!T.host || !T.user || !T.password) {
      this.send({ type: 'stopped', step: 'target', note: 'مشخصات SSH سرور مقصد (آدرس، نام کاربری، رمز) را بنویسید.' });
      this.running = false;
      return;
    }
    const withRec = !!o.recordings;
    const WORK = '/tmp/hoormand-migrate';
    this.steps = [
      { id: 'src', title: 'شناسایی هورمند روی سرور مبدأ', status: 'wait' },
      { id: 'pack', title: 'گرفتن نسخهٔ کامل (دیتابیس و فایل‌ها)', status: 'wait' },
      { id: 'dst', title: 'اتصال به سرور مقصد', status: 'wait' },
      { id: 'send', title: 'انتقال به سرور مقصد', status: 'wait' },
      { id: 'restore', title: 'بازیابی روی سرور مقصد', status: 'wait' },
      { id: 'check', title: 'آزمایش نهایی', status: 'wait' },
    ];
    this.send({ type: 'steps', steps: this.steps });
    const dst = new Session(this.ws);
    const src = this;
    let srcInfo = null;
    let dstInfo = null;
    const finish = () => {
      try { dst.conn && dst.conn.end(); } catch {}
      this.running = false;
    };
    // where the program lives on a server and where its data folders are (read from the program's own .env)
    const locate = async (sv, hint) => {
      let dir = (await sv.run(`docker ps -q --filter label=com.docker.compose.service=app | head -1 | xargs -r docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`, { root: true, quiet: true })).out.trim().split('\n').pop().trim();
      if (!dir.startsWith('/')) dir = (await sv.run(`for d in /opt/*/ /home/*/*/ /root/*/; do [ -f "$d/docker-compose.yml" ] && [ -d "$d/server" ] && echo "$d" && break; done`, { root: true, quiet: true })).out.trim().split('\n').pop().replace(/\/$/, '');
      if (hint) dir = hint;
      if (!dir.startsWith('/')) return null;
      const r = await sv.run(
        `cd ${sq(dir)} && [ -f .env ] && { set -a; . ./.env; set +a; echo "DBU=\${DB_USER:-automation}"; echo "DBN=\${DB_NAME:-automation}"; echo "PORT=\${PORT:-8080}"; echo "FILES=\${FILES_DIR:-./files}"; echo "REC=\${VOIP_RECORDINGS_DIR:-./recordings}"; echo "VER=$(cat VERSION 2>/dev/null | head -1)"; }`,
        { root: true, quiet: true });
      const g = (k) => (new RegExp('^' + k + '=(.*)$', 'm').exec(r.out) || [])[1] || '';
      if (!g('DBU')) return null;
      const abs = (v) => (v.startsWith('/') ? v : dir + '/' + v.replace(/^\.\//, ''));
      return { dir, dbu: g('DBU'), dbn: g('DBN'), port: g('PORT') || '8080', files: abs(g('FILES') || './files'), rec: abs(g('REC') || './recordings'), ver: g('VER') };
    };
    // one file from a server to the other, through this panel, with progress and a check of the result
    const carry = (name) =>
      new Promise((resolve) => {
        const srcPath = WORK + '/' + name;
        src.conn.exec('cat ' + srcPath, (e1, s1) => {
          if (e1) return resolve({ ok: false, note: e1.message });
          dst.conn.exec('cat > ' + srcPath, (e2, s2) => {
            if (e2) return resolve({ ok: false, note: e2.message });
            let n = 0;
            let lastShown = 0;
            const t0 = Date.now();
            const tick = setInterval(() => {
              if (n !== lastShown) {
                lastShown = n;
                this.log('  ' + name + ': ' + (n / 1048576).toFixed(1) + ' مگابایت منتقل شد', 'gray');
              }
            }, 4000);
            s1.on('data', (d) => (n += d.length));
            s1.stderr.on('data', () => {});
            s2.stderr.on('data', () => {});
            s2.resume(); // the far side's end-of-file is only seen when the stream is being read
            s1.pipe(s2);
            s2.on('close', () => {
              clearInterval(tick);
              resolve({ ok: true, bytes: n, secs: Math.max(1, Math.round((Date.now() - t0) / 1000)) });
            });
            s1.on('error', () => resolve({ ok: false, note: 'ارتباط با سرور مبدأ قطع شد.' }));
            s2.on('error', () => resolve({ ok: false, note: 'ارتباط با سرور مقصد قطع شد.' }));
          });
        });
      });
    const sum = async (sv, name) => ((await sv.run('sha256sum ' + WORK + '/' + name + " | awk '{print $1}'", { quiet: true })).out.trim().split('\n').pop().trim());
    const steps = {
      src: async () => {
        srcInfo = await locate(src, '');
        if (!srcInfo) return { ok: false, note: 'هورمند روی سرور مبدأ پیدا نشد (Docker یا پوشهٔ برنامه).' };
        const up = await src.run(`cd ${sq(srcInfo.dir)} && docker compose ps --status running --services 2>/dev/null | tr '\\n' ' '`, { root: true, quiet: true });
        if (!/\bdb\b/.test(up.out)) return { ok: false, note: 'دیتابیس هورمند روی سرور مبدأ بالا نیست؛ اول آن را روشن کنید (docker compose up -d).' };
        return { ok: true, note: 'پوشهٔ برنامه ' + srcInfo.dir + (srcInfo.ver ? '، نسخه ' + srcInfo.ver : '') + '.' };
      },
      pack: async () => {
        const me = src.user;
        let sh = 'set -e\nrm -rf ' + WORK + '; mkdir -p ' + WORK + '\ncd ' + sq(srcInfo.dir) + '\n';
        sh += 'docker compose exec -T db pg_dump -U ' + sq(srcInfo.dbu) + ' -d ' + sq(srcInfo.dbn) + ' -Fc > ' + WORK + '/db.dump\n';
        sh += 'docker compose exec -T db pg_restore --list < ' + WORK + '/db.dump > /dev/null\n';
        sh += '[ -d ' + sq(srcInfo.files) + ' ] && tar czf ' + WORK + '/files.tgz -C ' + sq(srcInfo.files) + ' . || tar czf ' + WORK + '/files.tgz --files-from /dev/null\n';
        if (withRec) sh += '[ -d ' + sq(srcInfo.rec) + ' ] && tar czf ' + WORK + '/rec.tgz -C ' + sq(srcInfo.rec) + ' . || true\n';
        sh += 'chown -R ' + sq(me) + ' ' + WORK + '; chmod 700 ' + WORK + '; chmod 600 ' + WORK + '/*\n';
        sh += 'ls -l ' + WORK + " | awk 'NR>1 {print $5, $9}'\necho PACKED\n";
        const r = await src.run(sh, { root: true });
        if (!/PACKED/.test(r.out)) return { ok: false, note: 'گرفتن نسخه انجام نشد. خطای بالا را ببینید.' };
        const names = ['db.dump', 'files.tgz'].concat(withRec && /rec\.tgz/.test(r.out) ? ['rec.tgz'] : []);
        this.migNames = names;
        return { ok: true, note: 'نسخهٔ دیتابیس و فایل‌ها آماده شد (و خوانده و آزمایش شد).' };
      },
      dst: async () => {
        try {
          await dst.connect({ host: T.host, port: T.port || 22, username: T.user, password: T.password });
        } catch (e) {
          return { ok: false, note: 'به سرور مقصد وصل نشدم: ' + e.message + ' (آدرس، پورت، نام کاربری و رمز را بررسی کنید.)' };
        }
        if (dst.user !== 'root') {
          const t = await dst.run('true', { root: true, quiet: true });
          if (t.code !== 0) return { ok: false, note: 'کاربر سرور مقصد دسترسی sudo ندارد.' };
        }
        dstInfo = await locate(dst, T.dir || '');
        if (!dstInfo) return { ok: false, note: 'هورمند روی سرور مقصد نصب نیست. اول با «نصب برنامه روی سرور» آن را نصب کنید، بعد این کار را بزنید.' };
        const same = (await src.run('cat /etc/machine-id 2>/dev/null', { quiet: true })).out.trim();
        const same2 = (await dst.run('cat /etc/machine-id 2>/dev/null', { quiet: true })).out.trim();
        if (same && same === same2 && srcInfo.dir === dstInfo.dir) return { ok: false, note: 'سرور مبدأ و مقصد یکی هستند.' };
        const free = (await dst.run("df -Pk /tmp | awk 'NR==2 {print $4}'", { quiet: true })).out.trim();
        this.log('فضای آزاد سرور مقصد: ' + (Number(free) / 1048576).toFixed(1) + ' گیگابایت', 'gray');
        return { ok: true, note: 'مقصد: هورمند در ' + dstInfo.dir + (dstInfo.ver ? '، نسخه ' + dstInfo.ver : '') + '.' };
      },
      send: async () => {
        await dst.run('rm -rf ' + WORK + '; mkdir -p ' + WORK + '; chmod 700 ' + WORK, { quiet: true });
        for (const name of this.migNames) {
          const r = await carry(name);
          if (!r.ok) return { ok: false, note: 'انتقال ' + name + ' نشد: ' + (r.note || '') };
          const a = await sum(src, name);
          const b = await sum(dst, name);
          if (!a || a !== b) return { ok: false, note: 'فایل ' + name + ' سالم به مقصد نرسید (جمع‌کنترل یکی نیست). دوباره امتحان کنید.' };
          this.log('✓ ' + name + ' ' + (r.bytes / 1048576).toFixed(1) + ' مگابایت در ' + r.secs + ' ثانیه، سالم رسید.', 'green');
        }
        return { ok: true, note: 'همهٔ فایل‌ها سالم به مقصد رسید.' };
      },
      restore: async () => {
        let sh = 'set -e\ncd ' + sq(dstInfo.dir) + '\nmkdir -p backups\nSAFE=backups/migrate-before-$(date +%Y%m%d-%H%M%S).dump.safety\n';
        sh += 'docker compose exec -T db pg_dump -U ' + sq(dstInfo.dbu) + ' -d ' + sq(dstInfo.dbn) + ' -Fc > "$SAFE"\necho "نسخهٔ ایمنی داده‌های فعلی مقصد: $SAFE"\n';
        sh += 'docker compose stop app\n';
        sh += 'docker compose exec -T db sh -c "{ echo \'DROP SCHEMA public CASCADE; CREATE SCHEMA public;\'; pg_restore --no-owner -f - ; } | psql -U ' + dstInfo.dbu + ' -d ' + dstInfo.dbn + ' -q -1 -v ON_ERROR_STOP=1" < ' + WORK + '/db.dump\n';
        sh += 'mkdir -p ' + sq(dstInfo.files) + '; tar xzf ' + WORK + '/files.tgz -C ' + sq(dstInfo.files) + '\n';
        if (this.migNames.includes('rec.tgz')) sh += 'mkdir -p ' + sq(dstInfo.rec) + '; tar xzf ' + WORK + '/rec.tgz -C ' + sq(dstInfo.rec) + '\n';
        sh += 'docker compose start app\necho RESTORED\n';
        const r = await dst.run(sh, { root: true });
        if (!/RESTORED/.test(r.out)) {
          await dst.run('cd ' + sq(dstInfo.dir) + ' && docker compose start app', { root: true, quiet: true });
          return { ok: false, note: 'بازیابی روی مقصد کامل نشد؛ برنامهٔ مقصد دوباره روشن شد و داده‌های قبلی‌اش دست‌نخورده است (بازیابی در یک تراکنش بود). خطای بالا را بفرستید.' };
        }
        return { ok: true, note: 'دیتابیس و فایل‌ها روی مقصد بازیابی شد.' };
      },
      check: async () => {
        let code = '';
        for (let i = 0; i < 20; i++) {
          await sleep(3000);
          const r = await dst.run('curl -s -o /dev/null -m 6 -w "%{http_code}" http://127.0.0.1:' + dstInfo.port + '/', { quiet: true });
          code = r.out.trim().slice(-3);
          if (code === '200') break;
        }
        // the temporary copies (they hold all the data) are removed from both servers
        await src.run('rm -rf ' + WORK, { quiet: true });
        await dst.run('rm -rf ' + WORK, { quiet: true });
        if (code !== '200') return { ok: false, note: 'برنامهٔ مقصد هنوز جواب نمی‌دهد (کد ' + (code || '—') + '). چند دقیقه صبر کنید؛ اگر نشد: docker compose logs --tail 60 app' };
        return { ok: true, note: 'برنامهٔ مقصد بالا است و جواب می‌دهد.' };
      },
    };
    for (const st of this.steps) {
      if (this.cancelled || !this.conn) break;
      this.setStep(st.id, 'run');
      this.log('\n━━━ ' + st.title + ' ━━━', 'yellow');
      let r;
      try { r = await steps[st.id](); } catch (e) { r = { ok: false, note: 'خطای غیرمنتظره: ' + e.message }; }
      this.setStep(st.id, r.ok ? 'ok' : 'fail', r.note);
      this.send({ type: 'shot', id: st.id, title: st.title, ok: r.ok });
      if (!r.ok) {
        this.log('\n✗ ' + (r.note || 'این مرحله انجام نشد.'), 'red');
        this.send({ type: 'stopped', step: st.id, note: r.note || '' });
        finish();
        return;
      }
      this.log('✓ ' + (r.note || 'انجام شد'), 'green');
    }
    this.send({ type: 'migrate-done', from: srcInfo && srcInfo.dir, to: T.host, port: dstInfo && dstInfo.port });
    finish();
  }

  // ---------------------------------------------------------------- Nginx: one front door for several Hoormand servers
  /** Reads this machine's LAN addresses and the sites Nginx already forwards (domain -> inside address), and sends them to the page. */
  async nginxScan() {
    const ip4 = /^\d{1,3}(\.\d{1,3}){3}$/;
    const lan = (await this.run("(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"src\") print $(i+1)}'; hostname -I 2>/dev/null | tr ' ' '\\n') | grep -E '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)' | awk '!s[$0]++'", { quiet: true })).out.split(/\s+/).filter((x) => ip4.test(x));
    const ver = (await this.run('nginx -v 2>&1 | head -1', { quiet: true })).out.trim();
    const installed = /nginx\/\d/.test(ver);
    // every server block: its names and where it forwards to (a simple reader: enough for what this panel writes and for ordinary files)
    const raw = installed ? (await this.run("for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do [ -f \"$f\" ] && { echo \"##FILE $f\"; cat \"$f\"; }; done 2>/dev/null", { root: true, quiet: true })).out : '';
    const sites = [];
    for (const chunk of raw.split(/^##FILE /m).slice(1)) {
      const nl = chunk.indexOf('\n');
      const file = chunk.slice(0, nl).trim();
      const body = chunk.slice(nl + 1);
      for (const blk of body.split(/\bserver\s*\{/).slice(1)) {
        const names = /server_name\s+([^;]+);/.exec(blk);
        const pass = /proxy_pass\s+https?:\/\/([^\s;\/]+)/.exec(blk);
        if (!names || !pass) continue;
        const https = /listen\s+[^;]*443/.test(blk);
        for (const d of names[1].trim().split(/\s+/)) if (d && d !== '_' && !sites.some((y) => y.domain === d && y.target === pass[1])) sites.push({ domain: d, target: pass[1], https, file });
      }
    }
    // neighbours seen on the LAN: handy as suggestions for the inside address of each Hoormand server
    const neigh = (await this.run("ip -4 neigh 2>/dev/null | awk '$1 ~ /^(10\\.|192\\.168\\.|172\\.)/ && $NF != \"FAILED\" {print $1}' | sort -u | head -40", { quiet: true })).out.split(/\s+/).filter((x) => ip4.test(x));
    const hostname = (await this.run('hostname', { quiet: true })).out.trim();
    this.send({ type: 'nginx-info', lan, installed, version: ver, sites, neighbours: neigh, hostname });
    this.log(installed ? 'Nginx روی این سرور هست (' + ver + '). ' + sites.length + ' سایت از قبل تنظیم شده.' : 'Nginx هنوز روی این سرور نصب نیست؛ با «اعمال» نصب می‌شود.', 'gray');
  }

  /** Installs Nginx (when missing) and adds one site block per domain; each block forwards to the inside address of one Hoormand server. */
  async nginxApply(o) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    const domRe = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
    const tgtRe = /^(\d{1,3}\.){3}\d{1,3}:\d{2,5}$/;
    const sites = [];
    for (const x of Array.isArray(o.sites) ? o.sites : []) {
      const domain = String(x.domain || '').trim().toLowerCase();
      let target = String(x.target || '').trim();
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(target)) target += ':8080';
      if (!domRe.test(domain) || !tgtRe.test(target)) {
        this.send({ type: 'stopped', step: 'sites', note: 'دامنه یا آدرس داخلی یکی از ردیف‌ها درست نیست: ' + domain + ' ' + target + ' (دامنه مثل crm.example.com و مقصد مثل 192.168.88.11:8080)' });
        this.running = false;
        return;
      }
      if (!sites.some((y) => y.domain === domain)) sites.push({ domain, target });
    }
    if (!sites.length) {
      this.send({ type: 'stopped', step: 'sites', note: 'دست‌کم یک دامنه و آدرس داخلی وارد کنید.' });
      this.running = false;
      return;
    }
    const https = !!o.https;
    const email = String(o.email || '').trim();
    if (https && !/^[^\s@;'"\\]+@[^\s@;'"\\]+\.[a-z]{2,}$/i.test(email)) {
      this.send({ type: 'stopped', step: 'sites', note: 'برای گواهی HTTPS یک ایمیل درست بنویسید.' });
      this.running = false;
      return;
    }
    this.steps = [
      { id: 'sys', title: 'بررسی سرور', status: 'wait' },
      { id: 'inst', title: 'نصب Nginx' + (https ? ' و Certbot' : ''), status: 'wait' },
      { id: 'back', title: 'دسترسی به سرورهای هورمند', status: 'wait' },
      { id: 'conf', title: 'نوشتن تنظیم دامنه‌ها', status: 'wait' },
      { id: 'fw', title: 'فایروال (پورت ۸۰ و ۴۴۳)', status: 'wait' },
      ...(https ? [{ id: 'ssl', title: 'گواهی HTTPS (Let\'s Encrypt)', status: 'wait' }] : []),
    ];
    this.send({ type: 'steps', steps: this.steps });
    const steps = {
      sys: async () => {
        const r = await this.run('. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME"; command -v apt-get >/dev/null && echo apt', { quiet: true });
        if (this.user !== 'root') {
          const t = await this.run('true', { root: true, quiet: true });
          if (t.code !== 0) return { ok: false, note: 'این کاربر دسترسی sudo ندارد؛ با کاربری وارد شوید که sudo دارد (یا root).' };
        }
        if (!/apt/.test(r.out)) return { ok: false, note: 'این سرور اوبونتو/دبیان نیست؛ Nginx را دستی نصب کنید و دوباره امتحان کنید.' };
        return { ok: true, note: r.out.split('\n')[0] };
      },
      inst: async () => {
        const has = await this.run('command -v nginx >/dev/null && echo yes', { quiet: true });
        const hasCb = await this.run('command -v certbot >/dev/null && echo yes', { quiet: true });
        if (/yes/.test(has.out) && (!https || /yes/.test(hasCb.out))) return { ok: true, note: 'از قبل نصب است.' };
        const pk = 'nginx' + (https ? ' certbot python3-certbot-nginx' : '');
        const r = await this.runJob('export DEBIAN_FRONTEND=noninteractive; apt-get update -y && apt-get install -y ' + pk + ' && systemctl enable --now nginx', { label: 'apt-get install ' + pk });
        if (r.code !== 0) return { ok: false, note: 'نصب Nginx انجام نشد (اینترنت یا مخزن‌های apt سرور را بررسی کنید).' };
        return { ok: true, note: 'نصب شد.' };
      },
      back: async () => {
        const bad = [];
        for (const x of sites) {
          const r = await this.run('curl -s -o /dev/null -m 6 -w "%{http_code}" http://' + x.target + '/ || true', { quiet: true });
          const code = r.out.trim().slice(-3);
          if (/^[1-5]\d\d$/.test(code)) this.log(x.target + ' جواب داد (' + code + ').', 'gray');
          else { this.log(x.target + ' جواب نداد.', 'yellow'); bad.push(x.target); }
        }
        return { ok: true, note: bad.length ? 'این آدرس‌ها هنوز جواب نمی‌دهند: ' + bad.join('، ') + ' (تنظیم نوشته می‌شود؛ هورمند آن سرور و فایروالش را بررسی کنید.)' : 'همهٔ سرورهای هورمند جواب دادند.' };
      },
      conf: async () => {
        const proxy = ['proxy_http_version 1.1;', 'proxy_set_header Host $host;', 'proxy_set_header X-Real-IP $remote_addr;', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-Proto $scheme;', 'proxy_set_header Upgrade $http_upgrade;', 'proxy_set_header Connection $connection_upgrade;', 'proxy_read_timeout 3600s;', 'proxy_buffering off;', 'client_max_body_size 500m;', ''].join('\n');
        const b64 = (t) => Buffer.from(t).toString('base64');
        let sh = 'set -e\nmkdir -p /etc/nginx/hoormand-backup && cp -a /etc/nginx/sites-available /etc/nginx/hoormand-backup/ 2>/dev/null || true\n';
        sh += 'echo ' + b64("map $http_upgrade $connection_upgrade { default upgrade; '' close; }\n") + ' | base64 -d > /etc/nginx/conf.d/hoormand-upgrade.conf\n';
        sh += 'echo ' + b64(proxy) + ' | base64 -d > /etc/nginx/hoormand-proxy.conf\n';
        const written = [];
        for (const x of sites) {
          const f = '/etc/nginx/sites-available/hoormand-' + x.domain + '.conf';
          // the same domain in a file of someone else is left alone (two blocks for one name would fight)
          sh += 'if grep -lqs "server_name[^;]*[[:space:]]' + x.domain.replace(/\./g, '\\.') + '[[:space:];]" /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null && [ ! -f ' + f + ' ]; then echo "EXISTS ' + x.domain + '"; else\n';
          const blk = 'server {\n\tlisten 80;\n\tlisten [::]:80;\n\tserver_name ' + x.domain + ';\n\tlocation / {\n\t\tproxy_pass http://' + x.target + ';\n\t\tinclude /etc/nginx/hoormand-proxy.conf;\n\t}\n}\n';
          sh += ' echo ' + b64(blk) + ' | base64 -d > ' + f + '; ln -sf ' + f + ' /etc/nginx/sites-enabled/hoormand-' + x.domain + '.conf; echo "WROTE ' + x.domain + '"\nfi\n';
          written.push(x.domain);
        }
        // someone who types the bare IP must not land on one of the sites: a catch-all closes the connection (only when no default server exists yet)
        sh += 'rm -f /etc/nginx/conf.d/hoormand-default.conf; if ! grep -qsE "listen[^;]*default_server" /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null; then printf "server {\n\tlisten 80 default_server;\n\tlisten [::]:80 default_server;\n\tserver_name _;\n\treturn 444;\n}\n" > /etc/nginx/conf.d/hoormand-default.conf; fi\n';
        sh += 'if nginx -t 2>&1; then systemctl reload nginx && echo RELOADED; else echo BADCONF; fi\n';
        const r = await this.run(sh, { root: true });
        if (/BADCONF/.test(r.out) || !/RELOADED/.test(r.out)) {
          // go back to the way it was: drop what this run wrote
          await this.run(written.map((d) => 'rm -f /etc/nginx/sites-enabled/hoormand-' + d + '.conf').join('; ') + '; rm -f /etc/nginx/conf.d/hoormand-default.conf; nginx -t >/dev/null 2>&1 && systemctl reload nginx', { root: true, quiet: true });
          return { ok: false, note: 'تنظیم Nginx معتبر نبود و برگردانده شد. متن خطا را در صفحهٔ سرور ببینید.' };
        }
        const skipped = (r.out.match(/EXISTS \S+/g) || []).map((x) => x.slice(7));
        this.nginxDomains = sites.filter((x) => !skipped.includes(x.domain)).map((x) => x.domain);
        return { ok: true, note: (this.nginxDomains.length ? this.nginxDomains.length + ' دامنه اضافه یا به‌روز شد' : 'دامنه‌ای اضافه نشد') + (skipped.length ? '؛ این‌ها از قبل در فایل دیگری بودند و دست نخوردند: ' + skipped.join('، ') : '') + '.' };
      },
      fw: async () => {
        const s = await this.run('command -v ufw >/dev/null && ufw status || echo "ufw-not-installed"', { root: true, quiet: true });
        if (/not-installed|inactive/i.test(s.out) && !/Status: active/i.test(s.out)) return { ok: true, note: 'فایروال روشن نیست؛ چیزی لازم نیست.' };
        const r = await this.run('ufw allow 80/tcp && ufw allow 443/tcp', { root: true });
        return r.code === 0 ? { ok: true, note: 'پورت‌های ۸۰ و ۴۴۳ باز شد.' } : { ok: false, note: 'باز کردن پورت در فایروال نشد.' };
      },
      ssl: async () => {
        const ds = this.nginxDomains && this.nginxDomains.length ? this.nginxDomains : sites.map((x) => x.domain);
        // one certificate per domain: a domain that is not ready yet (its A-record still points elsewhere) must not stop the others
        const good = [];
        const bad = [];
        for (const d of ds) {
          const r = await this.runJob('certbot --nginx --non-interactive --agree-tos --redirect -m ' + sq(email) + ' -d ' + d, { label: 'certbot --nginx -d ' + d });
          (r.code === 0 ? good : bad).push(d);
        }
        if (bad.length) return { ok: false, note: (good.length ? 'گواهی گرفته شد برای: ' + good.join('، ') + '. ' : '') + 'گواهی نگرفت برای: ' + bad.join('، ') + ' (A-Record آن باید به IP عمومی شما اشاره کند و پورت ۸۰ و ۴۴۳ در روتر به همین سرور برسد؛ یا آن دامنه را از فهرست بردارید.)' };
        return { ok: true, note: 'گواهی گرفته شد و تمدید خودکار فعال است: ' + good.join('، ') + '.' };
      },
    };
    for (const st of this.steps) {
      if (this.cancelled || !this.conn) break;
      this.setStep(st.id, 'run');
      this.log('\n━━━ ' + st.title + ' ━━━', 'yellow');
      let r;
      try { r = await steps[st.id](); } catch (e) { r = { ok: false, note: 'خطای غیرمنتظره: ' + e.message }; }
      this.setStep(st.id, r.ok ? 'ok' : 'fail', r.note);
      this.send({ type: 'shot', id: st.id, title: st.title, ok: r.ok });
      if (!r.ok) {
        this.log('\n✗ ' + (r.note || 'این مرحله انجام نشد.'), 'red');
        this.send({ type: 'stopped', step: st.id, note: r.note || '' });
        this.running = false;
        return;
      }
      this.log('✓ ' + (r.note || 'انجام شد'), 'green');
    }
    this.running = false;
    this.send({ type: 'nginx-done', sites, https });
    await this.nginxScan();
  }

  /**
   * Connects the program to the Issabel / Asterisk phone system: makes the AMI user, lets this program's server in, and
   * (when its SSH login is given) writes the AMI lines into that server's .env and restarts the program there.
   */
  async voipSetup(o) {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    let appHost = String(o.appHost || '').trim();
    // the address this machine uses to reach the LAN/internet: the source address of the route to a public address
    const LAN_CMD = `ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1`;
    const pbxLogin = { host: this.host, port: this.sshPort, username: this.user, password: this.password };
    let appPort = '8080'; // the port the program listens on (read from its container below)
    const recKey = require('crypto').randomBytes(24).toString('hex'); // lets the phone system hand recordings over to the program
    const user = String(o.amiUser || 'hoormand').replace(/[^A-Za-z0-9_-]/g, '') || 'hoormand';
    const secret = String(o.amiSecret || '').replace(/[^A-Za-z0-9]/g, '') || require('crypto').randomBytes(12).toString('hex');
    let pbxHost = this.host; // replaced by the phone system's own LAN address when we reached it through the public IP
    let pbxCands = []; // all private addresses of the phone system (found in the first step)
    let amiPort = '5038'; // becomes the local end of the SSH tunnel when the two networks cannot reach each other
    const app = o.appSsh && o.appSsh.host && o.appSsh.user && o.appSsh.password ? o.appSsh : null;
    this.steps = [
      ...(app ? [{ id: 'srv', title: 'شناسایی سرور برنامه', status: 'wait' }] : []),
      { id: 'pbx', title: 'بررسی ایزابل', status: 'wait' },
      { id: 'ami', title: 'ساخت کاربر AMI', status: 'wait' },
      { id: 'fw', title: 'فایروال ایزابل (پورت ۵۰۳۸)', status: 'wait' },
      { id: 'rec', title: 'بررسی پوشهٔ ضبط مکالمات', status: 'wait' },
      { id: 'app', title: 'اتصال سرور برنامه', status: 'wait' },
    ];
    this.send({ type: 'steps', steps: this.steps });
    const ip4 = /^\d{1,3}(\.\d{1,3}){3}$/;
    const steps = {
      // look at the program's server first (its LAN address and folder), then go back to the phone system
      srv: async () => {
        try { this.conn && this.conn.end(); } catch {}
        this.conn = null;
        try {
          await this.connect({ host: app.host, port: app.port || 22, username: app.user, password: app.password });
        } catch (e) {
          return { ok: false, note: 'به سرور برنامه وصل نشدم: ' + e.message + ' (آدرس، پورت، نام کاربری و رمز SSH سرور برنامه را بررسی کنید.)' };
        }
        const lan = (await this.run(LAN_CMD, { quiet: true })).out.trim();
        const dirs = (await this.run(`docker ps --filter label=com.docker.compose.service=app -q | xargs -r docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`, { root: true, quiet: true })).out
          .split(/\r?\n/).map((x) => x.trim()).filter((x) => x.startsWith('/'));
        const portOut = (await this.run(`docker ps --filter label=com.docker.compose.service=app --format '{{.Ports}}' | head -1`, { root: true, quiet: true })).out;
        const pm = /:(\d{2,5})->/.exec(portOut);
        if (pm) appPort = pm[1];
        let dir = String(app.dir || '').trim() || dirs[0] || '';
        if (!dir) dir = /yes/.test((await this.run('[ -f /opt/automation/.env ] && echo yes', { quiet: true })).out) ? '/opt/automation' : '';
        if (dirs.length > 1 && !app.dir) this.log('چند برنامه روی این سرور هست (' + dirs.join('، ') + ')؛ اولی را انتخاب کردم. اگر برنامهٔ دیگری مدنظر است، «پوشهٔ برنامه» را در بخش پیشرفته بنویسید.', 'yellow');
        try { this.conn && this.conn.end(); } catch {}
        this.conn = null;
        try { await this.connect(pbxLogin); } catch (e) { return { ok: false, note: 'برگشتن به ایزابل نشد: ' + e.message }; }
        if (!dir) return { ok: false, note: 'برنامهٔ هورمند روی سرور برنامه پیدا نشد (Docker یا پوشهٔ /opt/automation). اول نصب برنامه را کامل کنید.' };
        if (!appHost) {
          if (!ip4.test(lan)) return { ok: false, note: 'آدرس داخلی سرور برنامه را نخواندم؛ آن را در بخش پیشرفته بنویسید.' };
          appHost = lan;
        }
        app.dir = dir;
        return { ok: true, note: 'سرور برنامه ' + appHost + '، پوشهٔ ' + dir + '.' };
      },
      pbx: async () => {
        const r = await this.run('asterisk -V 2>&1 | head -1; cat /etc/issabel-release /etc/redhat-release 2>/dev/null | head -2; whoami; asterisk -rx "manager show settings" 2>&1 | grep -iE "enabled|port|bind" | head -5', { root: true });
        if (!/Asterisk\s+\d/i.test(r.out) || /command not found/i.test(r.out)) return { ok: false, note: 'Asterisk روی این سرور پیدا نشد. با آدرس خود ایزابل وصل شده‌اید؟ (کاربر root لازم است.)' };
        // the app server lives inside the LAN: it must reach the phone system by its LAN address, not by the public IP we SSH into
        // every private address of this machine, the one used to reach the internet first
        const found = (await this.run("(" + LAN_CMD + "; hostname -I 2>/dev/null | tr ' ' '\\n'; ip -4 -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1) | grep -E '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)' | awk '!s[$0]++'", { quiet: true })).out.split(/\s+/).filter((x) => ip4.test(x));
        pbxCands = found;
        if (found.length) {
          this.log('آدرس‌های داخلی ایزابل: ' + found.join('، ') + (found[0] !== pbxHost ? '؛ برنامه با ' + found[0] + ' به ایزابل وصل می‌شود (نه با ' + pbxHost + ' که فقط برای SSH از بیرون است).' : ''), 'gray');
          if (found[0] !== pbxHost) pbxHost = found[0];
        } else if (!/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(pbxHost)) {
          this.log('هشدار: آدرس داخلی ایزابل را پیدا نکردم و آدرسی که با آن SSH زدید (' + pbxHost + ') بیرونی است؛ اتصال برنامه به ایزابل با آن کار نمی‌کند.', 'yellow');
        }
        const listen = (await this.run("ss -ltn 2>/dev/null | grep -E ':5038\\b' || netstat -ltn 2>/dev/null | grep -E ':5038\\b'", { quiet: true })).out.trim();
        this.log('پورت ۵۰۳۸ (AMI) روی ایزابل: ' + (listen ? listen.replace(/\s+/g, ' ') : 'کسی گوش نمی‌دهد؛ AMI در manager.conf خاموش است'), listen ? 'gray' : 'yellow');
        if (listen && /127\.0\.0\.1:5038/.test(listen) && !/(0\.0\.0\.0|\*|\[::\]):5038/.test(listen)) this.log('AMI فقط روی خود ایزابل (127.0.0.1) گوش می‌دهد؛ در /etc/asterisk/manager.conf مقدار bindaddr باید 0.0.0.0 باشد تا سرور برنامه وصل شود.', 'yellow');
        if (/Manager \(AMI\):\s*No/i.test(r.out)) this.log('هشدار: AMI در manager.conf خاموش است (enabled = yes لازم است).', 'yellow');
        return { ok: true, note: 'Asterisk پیدا شد.' };
      },
      ami: async () => {
        if (!ip4.test(appHost)) return { ok: false, note: 'آدرس سرور برنامه (که اجازهٔ اتصال می‌گیرد) درست نیست؛ مثلاً 192.168.2.248.' };
        const block = '[' + user + ']\nsecret = ' + secret + '\ndeny = 0.0.0.0/0.0.0.0\npermit = ' + appHost + '/255.255.255.255\nread = system,call,cdr,dialplan,agent,user\nwrite = originate,call,command\n';
        const b64 = Buffer.from(block).toString('base64');
        const f = '/etc/asterisk/manager_custom.conf';
        const script = [
          'touch ' + f,
          'cp -n ' + f + ' ' + f + '.bak-hoormand',
          // remove an older block with the same name, then add the new one
          "awk -v n='[" + user + "]' 'BEGIN{skip=0} /^\\[/{skip=($0==n)} !skip{print}' " + f + ' > ' + f + '.tmp && mv ' + f + '.tmp ' + f,
          'echo ' + b64 + ' | base64 -d >> ' + f,
          'asterisk -rx "manager reload" >/dev/null',
          'asterisk -rx "manager show user ' + user + '" 2>&1 | head -12',
        ].join('; ');
        const r = await this.run(script, { root: true, label: 'sudo (نوشتن کاربر AMI در manager_custom.conf و manager reload)' });
        if (!new RegExp('username:\\s*' + user, 'i').test(r.out)) return { ok: false, note: 'کاربر AMI ساخته یا خوانده نشد. خروجی بالا را بفرستید.' };
        this.ami = { user, secret };
        return { ok: true, note: 'کاربر «' + user + '» ساخته شد و فقط ' + appHost + ' اجازهٔ اتصال دارد.' };
      },
      fw: async () => {
        const has = await this.run('command -v iptables >/dev/null && iptables -L INPUT -n 2>/dev/null | head -3', { root: true, quiet: true });
        if (!has.out.trim()) return { ok: true, note: 'iptables پیدا نشد؛ فایروال لازم نیست یا جداگانه مدیریت می‌شود.' };
        const rule = '-p tcp -s ' + appHost + ' --dport 5038 -j ACCEPT';
        const r = await this.run('iptables -C INPUT ' + rule + ' 2>/dev/null && echo exists || (iptables -I INPUT 1 ' + rule + ' && echo added); (service iptables save 2>/dev/null || iptables-save > /etc/sysconfig/iptables 2>/dev/null) >/dev/null; echo done', { root: true });
        this.log('اگر در بخش Firewall ایزابل قواعد را دستی می‌چینید، همین قاعده را آنجا هم اضافه کنید: TCP پورت 5038 از ' + appHost + '.', 'gray');
        // listen for three minutes for the address that really reaches port 5038 (a router between two networks may change it): used if the program cannot connect
        await this.run("command -v tcpdump >/dev/null && (nohup timeout 180 tcpdump -nn -l -i any 'tcp dst port 5038 and tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0' -c 8 > /tmp/hoormand-seen.txt 2>&1 &) ; echo listening", { root: true, quiet: true });
        return { ok: /exists|added/.test(r.out), note: /exists/.test(r.out) ? 'قاعده از قبل بود.' : 'پورت ۵۰۳۸ فقط برای ' + appHost + ' باز شد.' };
      },
      rec: async () => {
        const r = await this.run('d=/var/spool/asterisk/monitor; [ -d $d ] && { echo "پوشه: $d"; echo "تعداد فایل: $(find $d -type f 2>/dev/null | wc -l)"; find $d -type f -printf "%f\\n" 2>/dev/null | head -2; } || echo "پوشهٔ ضبط پیدا نشد"', { root: true });
        const n = Number((/تعداد فایل: (\d+)/.exec(r.out) || [])[1] || 0);
        if (!n) this.log('هنوز مکالمه‌ای ضبط نشده؛ در Issabel ضبط تماس‌ها را روشن کنید (PBX ← Extensions ← Recording، یا Call Recording).', 'yellow');
        // The program only plays what reaches it. With the user's explicit approval (2026-10-07) this installs a small
        // sender on the phone system: every minute it uploads each new recording (the call id is in the file name) to the
        // program, authorised by a key that is also written to the program's .env (VOIP_RECORDING_KEY).
        if (ip4.test(appHost)) {
          const sender = [
            '#!/bin/bash',
            '# Sends new call recordings to the Hoormand server (installed by the Hoormand installer panel)',
            'DIR=/var/spool/asterisk/monitor',
            'URL=http://' + appHost + ':' + appPort + '/api/voip/recordings',
            'KEY=' + recKey,
            'DONE=/var/lib/hoormand-rec',
            'mkdir -p "$DONE"',
            'exec 9>/var/lock/hoormand-rec.lock; flock -n 9 || exit 0',
            `find "$DIR" -type f \\( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.gsm' -o -iname '*.ogg' \\) -mmin +1 -mtime -7 | while read -r f; do`,
            `  id=$(basename "$f" | grep -oE '[0-9]{9,11}\\.[0-9]+' | head -1)`,
            '  [ -n "$id" ] || continue',
            '  [ -e "$DONE/$id" ] && continue',
            `  ext=$(echo "\${f##*.}" | tr 'A-Z' 'a-z')`,
            '  if curl -sf -m 300 -X PUT -H "X-Recording-Key: $KEY" --data-binary @"$f" "$URL/$id?ext=$ext" >/dev/null; then touch "$DONE/$id"; fi',
            'done',
            '',
          ].join('\n');
          const b64 = Buffer.from(sender).toString('base64');
          const inst = await this.run('echo ' + b64 + ' | base64 -d > /usr/local/bin/hoormand-push-recordings.sh && chmod 700 /usr/local/bin/hoormand-push-recordings.sh && echo "* * * * * root /usr/local/bin/hoormand-push-recordings.sh >/dev/null 2>&1" > /etc/cron.d/hoormand-recordings && chmod 644 /etc/cron.d/hoormand-recordings && (service crond reload 2>/dev/null || systemctl reload crond 2>/dev/null || true) && (nohup /usr/local/bin/hoormand-push-recordings.sh >/dev/null 2>&1 &) ; echo sender-ok', { root: true, label: 'sudo (نصب فرستندهٔ خودکار ضبط‌ها به سرور برنامه، هر یک دقیقه)' });
          if (!/sender-ok/.test(inst.out)) return { ok: false, note: 'فرستندهٔ ضبط‌ها روی ایزابل نصب نشد. خروجی بالا را بفرستید.' };
          this.log('هر دقیقه ضبط‌های تازه از ایزابل به سرور برنامه (' + appHost + ':' + appPort + ') فرستاده می‌شود؛ ضبط‌های هفتهٔ اخیر هم همین حالا شروع به رفتن می‌کنند.', 'gray');
        }
        return { ok: true, note: (n ? 'پوشهٔ ضبط پیدا شد (' + n + ' فایل)' : 'ضبط هنوز روشن نیست (دستی در ایزابل)') + '؛ ارسال خودکار به سرور برنامه نصب شد.' };
      },
      app: async () => {
        if (!app) return { ok: true, note: 'مشخصات SSH سرور برنامه داده نشد؛ مقدارها را پایین ببینید و خودتان در .env بگذارید.' };
        try { this.conn && this.conn.end(); } catch {}
        this.conn = null;
        try {
          await this.connect({ host: app.host, port: app.port || 22, username: app.user, password: app.password });
        } catch (e) {
          return { ok: false, note: 'به سرور برنامه وصل نشدم: ' + e.message };
        }
        const dir = String(app.dir || '/opt/automation').replace(/[^A-Za-z0-9/_.-]/g, '');
        this.dir = dir;
        // find the address of the phone system that THIS server can really reach, before anything is written into .env
        const tryHosts = [...new Set([pbxHost, ...pbxCands])];
        const testHosts = async () => {
          for (const h of tryHosts) {
            const t = await this.run('timeout 6 bash -c "echo > /dev/tcp/' + h + '/5038" && echo reach-ok || echo reach-fail', { quiet: true });
            this.log('آزمایش اتصال سرور برنامه به ' + h + ':5038 ← ' + (/reach-ok/.test(t.out) ? 'می‌رسد' : 'نمی‌رسد'), /reach-ok/.test(t.out) ? 'gray' : 'yellow');
            if (/reach-ok/.test(t.out)) return h;
          }
          return '';
        };
        // The two machines are in different places/networks: the program's server opens an SSH tunnel to the phone system (the SSH door we already use is open),
        // carrying the AMI port to it and the recordings back. Nothing new is opened on the internet.
        const tunnelFallback = async () => {
          const pubHost = pbxLogin.host, pubPort = pbxLogin.port || 22;
          this.log('\n— دو سرور در دو شبکه‌اند و به هم راه ندارند؛ اتصال امن با تونل SSH ساخته می‌شود (بدون نیاز به تغییر روتر) —', 'yellow');
          try { this.conn && this.conn.end(); } catch {}
          this.conn = null;
          try { await this.connect({ host: app.host, port: app.port || 22, username: app.user, password: app.password }); } catch (e) { return { ok: false, note: 'به سرور برنامه وصل نشدم: ' + e.message }; }
          const k = await this.run('command -v ssh >/dev/null || (apt-get install -y -qq openssh-client >/dev/null 2>&1); timeout 8 bash -c "echo > /dev/tcp/' + pubHost + '/' + pubPort + '" && echo ssh-reach-ok || echo ssh-reach-fail; [ -f /root/.ssh/hoormand_tun ] || (mkdir -p /root/.ssh && chmod 700 /root/.ssh && ssh-keygen -q -t ed25519 -N "" -f /root/.ssh/hoormand_tun -C hoormand-tunnel); cat /root/.ssh/hoormand_tun.pub', { root: true, quiet: true });
          if (!/ssh-reach-ok/.test(k.out)) return { ok: false, note: 'سرور برنامه به درگاه SSH ایزابل (' + pubHost + ':' + pubPort + ') هم نمی‌رسد؛ احتمالاً فایروال ایزابل یا روتر آن فقط آدرس‌های مشخصی را برای SSH قبول می‌کند. آدرس بیرونی سرور برنامه را برای SSH مجاز کنید و دوباره اجرا کنید.' };
          const pub = (/(ssh-ed25519 \S+)/.exec(k.out) || [])[1];
          if (!pub) return { ok: false, note: 'کلید تونل روی سرور برنامه ساخته یا خوانده نشد.' };
          this.log('سرور برنامه به درگاه SSH ایزابل می‌رسد؛ کلید تونل آماده است.', 'gray');
          // phone system: a user that can do nothing but carry the AMI port; the AMI user accepts the local end; recordings go through the tunnel too
          try { this.conn && this.conn.end(); } catch {}
          this.conn = null;
          try { await this.connect(pbxLogin); } catch (e) { return { ok: false, note: 'برگشتن به ایزابل نشد: ' + e.message }; }
          const auth = 'no-pty,no-agent-forwarding,no-X11-forwarding,permitopen="127.0.0.1:5038" ' + pub;
          const pscript = [
            'id hoormand-tun >/dev/null 2>&1 || useradd -m -s /sbin/nologin hoormand-tun',
            'mkdir -p /home/hoormand-tun/.ssh',
            "echo '" + auth + "' > /home/hoormand-tun/.ssh/authorized_keys",
            'chown -R hoormand-tun:hoormand-tun /home/hoormand-tun/.ssh; chmod 700 /home/hoormand-tun/.ssh; chmod 600 /home/hoormand-tun/.ssh/authorized_keys; restorecon -R /home/hoormand-tun/.ssh 2>/dev/null',
            "f=/etc/asterisk/manager_custom.conf; grep -q 'permit = 127.0.0.1/' $f || sed -i '/^\\[" + user + "\\]/,/^\\[/ s|^permit = .*|&\\npermit = 127.0.0.1/255.255.255.255|' $f",
            'asterisk -rx "manager reload" >/dev/null',
            "[ -f /usr/local/bin/hoormand-push-recordings.sh ] && sed -i 's|^URL=.*|URL=http://127.0.0.1:18080/api/voip/recordings|' /usr/local/bin/hoormand-push-recordings.sh",
            'echo tun-user-ok',
          ].join('; ');
          const pr = await this.run(pscript, { root: true, quiet: true });
          if (!/tun-user-ok/.test(pr.out)) return { ok: false, note: 'کاربر تونل روی ایزابل ساخته نشد. خروجی بالا را بفرستید.' };
          try { this.conn && this.conn.end(); } catch {}
          this.conn = null;
          try { await this.connect({ host: app.host, port: app.port || 22, username: app.user, password: app.password }); } catch (e) { return { ok: false, note: 'دوباره به سرور برنامه وصل نشدم: ' + e.message }; }
          const gw = (await this.run("docker inspect $(docker ps --filter label=com.docker.compose.service=app -q | head -1) -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' 2>/dev/null", { root: true, quiet: true })).out.trim();
          if (!ip4.test(gw)) return { ok: false, note: 'آدرس شبکهٔ داخلی Docker را از کانتینر برنامه نخواندم (برنامه روشن است؟).' };
          const unit = [
            '[Unit]',
            'Description=Hoormand SSH tunnel to the phone system (AMI and recordings)',
            'After=network-online.target docker.service',
            'Wants=network-online.target',
            '[Service]',
            'ExecStart=/usr/bin/ssh -N -i /root/.ssh/hoormand_tun -p ' + pubPort + ' -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -L ' + gw + ':15038:127.0.0.1:5038 -R 127.0.0.1:18080:127.0.0.1:' + appPort + ' hoormand-tun@' + pubHost,
            'Restart=always',
            'RestartSec=5',
            '[Install]',
            'WantedBy=multi-user.target',
            '',
          ].join('\n');
          const ub = Buffer.from(unit).toString('base64');
          const ur = await this.run('echo ' + ub + ' | base64 -d > /etc/systemd/system/hoormand-ami-tunnel.service && systemctl daemon-reload && systemctl enable --now hoormand-ami-tunnel >/dev/null 2>&1; (command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active" && ufw allow from ' + gw + '/16 to any port 15038 proto tcp >/dev/null 2>&1); sleep 5; timeout 6 bash -c "echo > /dev/tcp/' + gw + '/15038" && echo tun-ok || (echo tun-fail; systemctl status hoormand-ami-tunnel --no-pager 2>&1 | tail -6)', { root: true });
          if (!/tun-ok/.test(ur.out)) return { ok: false, note: 'تونل ساخته شد ولی پورت محلی ' + gw + ':15038 جواب نمی‌دهد. خروجی بالا (وضعیت سرویس) را بفرستید.' };
          this.log('تونل SSH برقرار است: برنامه از طریق ' + gw + ':15038 به ایزابل می‌رسد و ضبط‌ها از همان تونل برمی‌گردند (سرویس hoormand-ami-tunnel، همیشه روشن).', 'green');
          return { ok: true, host: gw, port: '15038' };
        };
        let okHost = await testHosts();
        if (!okHost) {
          // what does the network between the two machines do? (route, ping, the first hops)
          const H = tryHosts[0];
          this.log('\n— بررسی مسیر شبکه از سرور برنامه تا ایزابل —', 'yellow');
          await this.run('echo "[مسیر]"; ip route get ' + H + ' 2>&1 | head -2; echo "[پینگ]"; ping -c2 -W2 ' + H + ' 2>&1 | tail -3; echo "[گام‌به‌گام]"; (command -v traceroute >/dev/null && traceroute -n -m 5 -w 1 ' + H + ' 2>&1 | head -7) || (command -v tracepath >/dev/null && tracepath -n -m 5 ' + H + ' 2>&1 | head -7) || echo "traceroute نصب نیست"; echo "[تلاش مستقیم به پورت]"; timeout 5 bash -c "echo > /dev/tcp/' + H + '/5038" 2>&1 | head -2', { quiet: false });
          // back to the phone system: which address knocked on port 5038?
          try { this.conn && this.conn.end(); } catch {}
          this.conn = null;
          try { await this.connect(pbxLogin); } catch (e) { return { ok: false, note: 'برگشتن به ایزابل برای بررسی نشد: ' + e.message }; }
          const seen = (await this.run('cat /tmp/hoormand-seen.txt 2>/dev/null | head -8', { quiet: true })).out;
          const seenIps = [...new Set([...seen.matchAll(/IP (\d+\.\d+\.\d+\.\d+)\.\d+ > /g)].map((m) => m[1]))];
          this.log('بسته‌هایی که به پورت ۵۰۳۸ ایزابل رسید، از: ' + (seenIps.length ? seenIps.join('، ') : 'هیچ آدرسی (چیزی نرسید)'), seenIps.length ? 'gray' : 'yellow');
          const extra = seenIps.filter((x) => x !== appHost);
          if (extra.length) {
            // the program arrives under another address (the router changes it): allow that address too
            this.log('سرور برنامه با آدرس ' + extra.join('، ') + ' به ایزابل می‌رسد (نه ' + appHost + ')؛ همین آدرس هم اجازه داده می‌شود.', 'yellow');
            for (const ip of extra) {
              await this.run("f=/etc/asterisk/manager_custom.conf; grep -q 'permit = " + ip + "/' $f || sed -i '/^\\[" + user + "\\]/,/^\\[/ s|^permit = .*|&\\npermit = " + ip + "/255.255.255.255|' $f; asterisk -rx 'manager reload' >/dev/null; iptables -C INPUT -p tcp -s " + ip + " --dport 5038 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp -s " + ip + " --dport 5038 -j ACCEPT; (service iptables save 2>/dev/null || iptables-save > /etc/sysconfig/iptables 2>/dev/null) >/dev/null; echo ok", { root: true, quiet: true });
            }
            try { this.conn && this.conn.end(); } catch {}
            this.conn = null;
            try { await this.connect({ host: app.host, port: app.port || 22, username: app.user, password: app.password }); } catch (e) { return { ok: false, note: 'دوباره به سرور برنامه وصل نشدم: ' + e.message }; }
            okHost = await testHosts();
          } else if (!seenIps.length) {
            const fwl = (await this.run('iptables -L INPUT -n --line-numbers 2>/dev/null | head -12', { root: true, quiet: true })).out;
            if (fwl.trim()) this.log('قواعد فایروال ایزابل:\n' + fwl, 'gray');
            const t = await tunnelFallback();
            if (!t.ok) return t;
            okHost = t.host;
            amiPort = t.port;
          } else {
            try { this.conn && this.conn.end(); } catch {}
            this.conn = null;
            return { ok: false, note: 'بسته‌ها از ' + appHost + ' به ایزابل می‌رسد ولی اتصال برقرار نمی‌شود؛ احتمالاً AMI روی ایزابل فقط روی 127.0.0.1 گوش می‌دهد (در manager.conf مقدار bindaddr باید 0.0.0.0 باشد) یا دسترسی کاربر AMI رد می‌شود. خطوط بالا را بفرستید.' };
          }
        }
        if (!okHost) return { ok: false, note: 'سرور برنامه به ایزابل (' + tryHosts.join('، ') + ') پورت ۵۰۳۸ نمی‌رسد؛ چیزی در .env نوشته نشد. خطوط زرد بالا را بفرستید.' };
        pbxHost = okHost;
        const lines = { AMI_HOST: pbxHost, AMI_PORT: amiPort, AMI_USER: user, AMI_SECRET: secret, VOIP_RECORDING_KEY: recKey };
        const upd = Object.entries(lines).map(([k, v]) => 'grep -q "^' + k + '=" .env && sed -i "s|^' + k + '=.*|' + k + '=' + v + '|" .env || echo "' + k + '=' + v + '" >> .env').join('; ');
        const r = await this.run('cd ' + dir + ' && [ -f .env ] && cp -n .env .env.bak-hoormand && ' + upd + ' && echo env-ok', { root: true, quiet: true });
        if (!/env-ok/.test(r.out)) return { ok: false, note: 'فایل .env در ' + dir + ' پیدا یا نوشته نشد.' };
        this.log('خطوط AMI در .env نوشته شد (رمز در گزارش پایین هست).', 'gray');
        const up = await this.runJob('cd ' + dir + ' && docker compose up -d 2>&1 | tail -5', { label: 'راه‌اندازی دوبارهٔ برنامه' });
        return { ok: up.code === 0, note: up.code === 0 ? 'برنامه دوباره راه افتاد و به ایزابل می‌رسد؛ در کنسول مدیریت ← تنظیمات ← تلفن، وضعیت «متصل» را ببینید.' : 'برنامه راه‌اندازی نشد.' };
      },
    };
    for (const s of this.steps) {
      if (this.cancelled || (!this.conn && s.id !== 'app')) break;
      this.setStep(s.id, 'run');
      this.log('\n━━━ ' + s.title + ' ━━━', 'yellow');
      let r;
      try {
        r = await steps[s.id]();
      } catch (e) {
        r = { ok: false, note: 'خطای غیرمنتظره: ' + e.message };
      }
      this.setStep(s.id, r.ok ? 'ok' : 'fail', r.note);
      this.send({ type: 'shot', id: s.id, title: s.title, ok: r.ok });
      if (!r.ok) {
        this.log('\n✗ ' + r.note, 'red');
        this.send({ type: 'stopped', step: s.id, note: r.note || '' });
        this.running = false;
        return;
      }
      this.log('✓ ' + r.note, 'green');
    }
    this.send({ type: 'voip-done', host: pbxHost, port: amiPort, user, secret, appHost, wroteEnv: !!app });
    this.running = false;
  }

  /** Waits until the person answers the question shown in the panel (fixed IP or not). */
  ask(payload) {
    return new Promise((resolve) => {
      this.pending = resolve;
      this.send(payload);
    });
  }

  async stepIp() {
    const route = (await this.run("ip -4 route show default | head -1", { quiet: true })).out.trim();
    const m = /via (\S+) dev (\S+)/.exec(route);
    if (!m) return { ok: true, note: 'مسیر شبکه را نشناختم؛ این مرحله رد شد (IP را دستی ثابت کنید).' };
    const [, gateway, iface] = m;
    const dhcp = /proto dhcp/.test(route);
    const addr = (await this.run("ip -4 -o addr show dev " + iface + " scope global | awk '{print $4}' | head -1", { quiet: true })).out.trim();
    const am = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(addr);
    if (!am) return { ok: true, note: 'آدرس IP کارت شبکه را نخواندم؛ این مرحله رد شد.' };
    let dns = (await this.run("(resolvectl dns " + iface + " 2>/dev/null; grep -h '^nameserver' /etc/resolv.conf 2>/dev/null) | grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+' | grep -v '^127\\.' | awk '!s[$0]++' | head -2", { quiet: true })).out.trim().split(/\s+/).filter(Boolean);
    if (!dns.length) dns = [gateway];
    const hasNetplan = /netplan/.test((await this.run('command -v netplan', { quiet: true })).out);
    this.log('کارت شبکه: ' + iface + ' | IP فعلی: ' + am[1] + '/' + am[2] + ' | گیت‌وی: ' + gateway + ' | DNS: ' + dns.join(', ') + ' | روش: ' + (dhcp ? 'DHCP (خودکار؛ ممکن است عوض شود)' : 'ثابت'), 'gray');
    if (!dhcp) return { ok: true, note: 'IP از قبل ثابت است: ' + am[1], ip: am[1] };
    if (!hasNetplan) return { ok: true, note: 'این سرور netplan ندارد؛ IP را دستی ثابت کنید. IP فعلی: ' + am[1] };

    const a = await this.ask({ type: 'ask-ip', iface, ip: am[1], prefix: am[2], gateway, dns: dns.join(', ') });
    if (!a || !a.apply) return { ok: true, note: 'IP ثابت نشد (انتخاب شما). IP فعلی: ' + am[1] + ' (با DHCP ممکن است عوض شود).' };
    const ok4 = (v) => /^\d+\.\d+\.\d+\.\d+$/.test(v) && v.split('.').every((n) => Number(n) <= 255);
    const prefix = String(a.prefix || '').replace(/\D/g, '');
    const dnsList = String(a.dns || '').split(/[\s,،]+/).filter(Boolean);
    if (!ok4(a.ip) || !ok4(a.gateway) || !(Number(prefix) >= 8 && Number(prefix) <= 30) || !dnsList.length || !dnsList.every(ok4)) {
      return { ok: false, note: 'مقدارهای IP، گیت‌وی، پیشوند یا DNS درست نیست. دوباره «تلاش دوباره» را بزنید.' };
    }
    const yaml = [
      'network:', '  version: 2', '  ethernets:', '    ' + iface + ':', '      dhcp4: false',
      '      addresses: [' + a.ip + '/' + prefix + ']', '      routes:', '        - to: default', '          via: ' + a.gateway,
      '      nameservers:', '        addresses: [' + dnsList.join(', ') + ']', '',
    ].join('\n');
    const b64 = Buffer.from(yaml).toString('base64');
    this.log('IP ثابت می‌شود (از فایل‌های قبلی شبکه پشتیبان گرفته می‌شود و اگر ارتباط قطع شود خودکار برمی‌گردد).', 'yellow');
    const script = [
      'mkdir -p /etc/netplan/hoormand-backup',
      'for f in /etc/netplan/*.yaml; do [ -e "$f" ] && mv "$f" /etc/netplan/hoormand-backup/; done',
      'echo ' + b64 + ' | base64 -d > /etc/netplan/01-hoormand-static.yaml',
      'chmod 600 /etc/netplan/01-hoormand-static.yaml',
      '[ -d /etc/cloud/cloud.cfg.d ] && echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg',
      'netplan generate && netplan apply',
      'sleep 6',
      'if ping -c 2 -W 2 ' + a.gateway + ' >/dev/null 2>&1; then echo "IP_OK"; else echo "IP_FAILED: برمی‌گردانم"; rm -f /etc/netplan/01-hoormand-static.yaml; mv /etc/netplan/hoormand-backup/*.yaml /etc/netplan/; netplan apply; exit 1; fi',
    ].join('\n');
    const r = await this.runJob(script, { label: 'تنظیم IP ثابت با netplan' });
    if (r.code !== 0 || !/IP_OK/.test(r.out)) return { ok: false, note: 'تنظیم IP ثابت نشد و به حالت قبل برگشت. IP فعلی همان است.' };
    const chk = (await this.run("ip -4 route show default | head -1; ip -4 -o addr show dev " + iface + " scope global | awk '{print $4}'", { quiet: true })).out;
    if (/proto dhcp/.test(chk)) return { ok: false, note: 'IP ثابت اعمال نشد (هنوز DHCP است).' };
    return { ok: true, note: 'IP ثابت شد: ' + a.ip + '/' + prefix + ' (دیگر با DHCP عوض نمی‌شود). روی روتر هم این IP را از محدودهٔ DHCP خارج یا رزرو کنید.', ip: a.ip };
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
    const lic = (await this.run("curl -s -m 5 http://127.0.0.1:" + port + "/api/license/status", { quiet: true })).out;
    const installId = (/"installId":"([^"]+)"/.exec(lic) || [])[1] || '';
    const route = (await this.run("ip -4 route show default | head -1", { quiet: true })).out;
    this.send({
      type: 'done', url: `http://${ip}:${port}`, admin: `http://${ip}:${port}/admin`, email: mail, password: pw,
      ip, port, installId, fixedIp: !/proto dhcp/.test(route), gateway: (/via (\S+)/.exec(route) || [])[1] || '',
      host: this.host, sshPort: this.sshPort, sshUser: this.user,
    });
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
        s.send({ type: 'connected', mode: m.mode || 'install' });
      } catch (e) {
        const text = /authentication/i.test(e.message) ? 'نام کاربری یا رمز اشتباه است.' : /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/.test(e.message + (e.code || '')) ? 'به سرور نرسیدم؛ آدرس، پورت SSH و اینکه سرور روشن و در دسترس است را بررسی کنید.' : e.message;
        s.log(text, 'red');
        s.send({ type: 'connect-failed', note: text });
      }
    } else if (m.type === 'voip-start') {
      s.voipSetup({ appHost: m.appHost, amiUser: m.amiUser, amiSecret: m.amiSecret, appSsh: m.appSsh });
    } else if (m.type === 'migrate-start') {
      s.migrate({ target: m.target, recordings: m.recordings });
    } else if (m.type === 'nginx-scan') {
      s.nginxScan();
    } else if (m.type === 'nginx-apply') {
      s.nginxApply({ sites: m.sites, https: m.https, email: m.email });
    } else if (m.type === 'start') {
      s.install({ appPort: m.appPort, name: m.name, domain: m.domain, hostname: m.hostname });
    } else if (m.type === 'ip-answer') {
      if (s.pending) {
        const f = s.pending;
        s.pending = null;
        f(m);
      }
    } else if (m.type === 'disconnect') {
      s.close();
    }
  });
  ws.on('close', () => s.close());
});

// When the page is closed the panel stops by itself, and so does the black command window that started it.
let quitTimer = null;
const quitSoon = (ms) => {
  clearTimeout(quitTimer);
  quitTimer = setTimeout(() => {
    if (wss.clients.size === 0) {
      console.log('صفحه بسته شد؛ پنل خاموش می‌شود.');
      process.exit(0);
    }
  }, ms);
};
wss.on('connection', (ws) => {
  clearTimeout(quitTimer);
  ws.on('close', () => quitSoon(6000)); // a few seconds of grace so a page reload does not stop it
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log('پنل از قبل باز است؛ صفحهٔ آن را در مرورگر ببینید (http://' + HOST + ':' + PORT + ').');
  else console.log('پنل شروع نشد:', e.message);
  process.exit(0);
});
server.listen(PORT, HOST, () => {
  console.log(`پنل نصب هورمند: http://${HOST}:${PORT}`);
  quitSoon(90000); // nobody ever opened the page
});
