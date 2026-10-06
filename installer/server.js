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
    this.log('نصب «' + name + '» در ' + this.dir + ' روی پورت ' + port + (this.domain ? ' با دامنهٔ ' + this.domain : ''), 'gray');
    this.steps = [
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
    const user = String(o.amiUser || 'hoormand').replace(/[^A-Za-z0-9_-]/g, '') || 'hoormand';
    const secret = String(o.amiSecret || '').replace(/[^A-Za-z0-9]/g, '') || require('crypto').randomBytes(12).toString('hex');
    let pbxHost = this.host; // replaced by the phone system's own LAN address when we reached it through the public IP
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
        const lan = (await this.run(LAN_CMD, { quiet: true })).out.trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lan) && lan !== pbxHost) {
          this.log('آدرس داخلی ایزابل ' + lan + ' است؛ برنامه با همین آدرس به ایزابل وصل می‌شود (نه با ' + pbxHost + ' که فقط برای SSH از بیرون است).', 'gray');
          pbxHost = lan;
        }
        if (/Manager \(AMI\):\s*No/i.test(r.out)) this.log('هشدار: AMI در manager.conf خاموش است (enabled = yes لازم است).', 'yellow');
        return { ok: true, note: 'Asterisk پیدا شد.' };
      },
      ami: async () => {
        if (!ip4.test(appHost)) return { ok: false, note: 'آدرس سرور برنامه (که اجازهٔ اتصال می‌گیرد) درست نیست؛ مثلاً 192.168.2.248.' };
        const block = '[' + user + ']\nsecret = ' + secret + '\ndeny = 0.0.0.0/0.0.0.0\npermit = ' + appHost + '/255.255.255.255\nread = system,call,cdr,agent,user\nwrite = originate,call,command\n';
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
        return { ok: /exists|added/.test(r.out), note: /exists/.test(r.out) ? 'قاعده از قبل بود.' : 'پورت ۵۰۳۸ فقط برای ' + appHost + ' باز شد.' };
      },
      rec: async () => {
        const r = await this.run('d=/var/spool/asterisk/monitor; [ -d $d ] && { echo "پوشه: $d"; echo "تعداد فایل: $(find $d -type f 2>/dev/null | wc -l)"; find $d -type f -printf "%f\\n" 2>/dev/null | head -2; } || echo "پوشهٔ ضبط پیدا نشد"', { root: true });
        const n = Number((/تعداد فایل: (\d+)/.exec(r.out) || [])[1] || 0);
        if (!n) this.log('هنوز مکالمه‌ای ضبط نشده؛ در Issabel ضبط تماس‌ها را روشن کنید (PBX ← Extensions ← Recording، یا Call Recording).', 'yellow');
        return { ok: true, note: n ? 'پوشهٔ ضبط پیدا شد (' + n + ' فایل).' : 'ضبط هنوز روشن نیست (دستی در ایزابل).' };
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
        const lines = { AMI_HOST: pbxHost, AMI_PORT: '5038', AMI_USER: user, AMI_SECRET: secret };
        const upd = Object.entries(lines).map(([k, v]) => 'grep -q "^' + k + '=" .env && sed -i "s|^' + k + '=.*|' + k + '=' + v + '|" .env || echo "' + k + '=' + v + '" >> .env').join('; ');
        const r = await this.run('cd ' + dir + ' && [ -f .env ] && cp -n .env .env.bak-hoormand && ' + upd + ' && echo env-ok', { root: true, quiet: true });
        if (!/env-ok/.test(r.out)) return { ok: false, note: 'فایل .env در ' + dir + ' پیدا یا نوشته نشد.' };
        this.log('خطوط AMI در .env نوشته شد (رمز در گزارش پایین هست).', 'gray');
        const up = await this.runJob('cd ' + dir + ' && docker compose up -d 2>&1 | tail -5', { label: 'راه‌اندازی دوبارهٔ برنامه' });
        const t = await this.run('timeout 6 bash -c "echo > /dev/tcp/' + pbxHost + '/5038" && echo reach-ok || echo reach-fail', { quiet: true });
        if (/reach-fail/.test(t.out)) return { ok: false, note: 'سرور برنامه به ' + pbxHost + ' پورت ۵۰۳۸ نمی‌رسد (فایروال یا مسیر شبکه).' };
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
    this.send({ type: 'voip-done', host: pbxHost, port: '5038', user, secret, appHost, wroteEnv: !!app });
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
    } else if (m.type === 'start') {
      s.install({ appPort: m.appPort, name: m.name, domain: m.domain });
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
