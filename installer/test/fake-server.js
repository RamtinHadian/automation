'use strict';
// A pretend Linux server for testing the panel without a real one: it answers the panel's commands with the
// kind of answers the real server gave (Docker missing, Docker Hub blocked until mirrors are set, git branch
// error on the first update, firewall closed). Login: user "paya", password "pw".
const { Server, utils } = require('ssh2');
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } });

const st = { docker: false, mirrors: false, app: false, fixedGit: false, port: false };
const log = [];

function answer(script) {
  log.push(script.slice(0, 90));
  if (process.env.FAKEDEBUG) console.log('CMD', script.slice(0, 110).split('\n').join(' '));
  const out = (stdout = '', code = 0, stderr = '') => ({ stdout, code, stderr });
  if (/^stat -c %s \/tmp\/hoormand-src\.tgz/.test(script)) return out(String(st.uploadedBytes || 0) + '\n');
  // Issabel / phone-system commands
  if (/^ip -4 route get 1\.1\.1\.1/.test(script)) return out('192.168.2.100\n');
  if (/^docker ps --filter label=com\.docker\.compose\.service=app/.test(script)) return out('/opt/automation\n');
  if (/^asterisk -V/.test(script)) return out('Asterisk 16.30.0\nIssabel release 5.0\nroot\n  Enabled:                     Yes\n  Port:                        5038\n');
  if (/manager_custom\.conf/.test(script)) return out('username: hoormand\nsecret: <Set>\npermit: 192.168.2.248/255.255.255.255\n');
  if (/command -v iptables/.test(script)) return out('Chain INPUT (policy ACCEPT)\n');
  if (/iptables -C INPUT/.test(script)) return out('added\ndone\n');
  if (/spool\/asterisk\/monitor/.test(script)) return out('پوشه: /var/spool/asterisk/monitor\nتعداد فایل: 12\nout-0912-501-20261005-103000-1759660000.123.wav\n');
  if (/\[ -f \.env \] && cp -n/.test(script)) return out('env-ok\n');
  if (/dev\/tcp\//.test(script)) return out('reach-ok\n');
  if (/docker compose up -d 2>&1 \| tail/.test(script)) return out(' Container app Started\n');
  // background jobs (the panel starts long commands detached and then reads their log)
  if (/^\[ -f \/tmp\/hoormand-job\.pid \]/.test(script)) return out('', 1);
  const jb = /echo (\S+) \| base64 -d > \/tmp\/hoormand-job\.sh/.exec(script);
  if (jb) {
    const inner = Buffer.from(jb[1], 'base64').toString().replace(/^#!.*\n/, '').replace(/\necho \$\? > .*\n$/, '');
    const r = answer(inner);
    st.job = { data: Buffer.from(r.stdout + r.stderr), code: r.code };
    return out('started\n');
  }
  if (/echo "HJ \$s \$e/.test(script)) {
    if (process.env.JOBDIE) return out('HJ 0 RUN 0\n'); // simulate a background job that dies at once
    const off = Number(/OFF=(\d+)/.exec(script)[1]);
    const j = st.job || { data: Buffer.alloc(0), code: 0 };
    return out(`HJ ${j.data.length} ${j.code}\n` + j.data.slice(off).toString());
  }
  const route = () => (st.staticIp ? 'default via 192.168.1.1 dev ens18 proto static' : 'default via 192.168.1.1 dev ens18 proto dhcp src 192.168.1.80 metric 100');
  if (/api\/license\/status/.test(script)) return out('{"mode":"active","installId":"AAAA-BBBB-CCCC"}');
  if (/ip -4 route show default \| head -1; ip -4 -o addr/.test(script)) return out(route() + '\n192.168.1.80/24\n');
  if (/^ip -4 route show default/.test(script)) return out(route() + '\n');
  if (/ip -4 -o addr show dev ens18/.test(script)) return out('192.168.1.80/24\n');
  if (/resolvectl dns/.test(script)) return out('192.168.1.1\n');
  if (/command -v netplan/.test(script)) return out('/usr/sbin/netplan\n');
  if (/netplan apply/.test(script)) { st.staticIp = true; return out('IP_OK\n'); }
  if (/os-release/.test(script)) return out('سیستم‌عامل: Ubuntu 24.04 LTS\nکاربر: paya\nآدرس: 192.168.1.80 172.17.0.1\nرم: 7800 مگابایت\nفضای آزاد: 80G\n');
  if (script === 'true') return out();
  if (/command -v apt-get/.test(script)) return out('apt\n');
  if (/github\.com/.test(script)) return process.env.NOGITHUB ? out('github: 000\nraw: 000\n', 7, 'curl: (7) Failed to connect to github.com port 443') : out('github: 200\nraw: 200\n');
  if (/^docker --version/.test(script)) return st.docker ? out('Docker version 27.0\nDocker Compose version v2.29\n') : out('', 127, 'docker: command not found');
  if (/get\.docker\.com/.test(script)) { st.docker = true; return out('# Executing docker install script\nDocker installed.\n'); }
  if (/systemctl enable --now docker/.test(script)) return out();
  if (/^docker compose version/.test(script)) return st.docker ? out('Docker Compose version v2.29\n') : out('', 1, 'no docker');
  if (/docker pull -q postgres/.test(script)) return st.mirrors ? out('sha256:abc\n') : out('', 1, 'unknown: failed to copy: httpReadSeeker: failed open: unexpected status from GET request to https://production.cloudfront.docker.com/...: 403 Forbidden\n');
  if (/daemon\.json/.test(script)) { st.mirrors = true; return out(); }
  if (/tar xzf \/tmp\/hoormand-src\.tgz/.test(script)) { if (!st.uploaded) return out('', 2, 'tar: no such file'); st.app = true; return out('==> Building and starting\nDone.\n'); }
  if (/install\.sh/.test(script)) { st.app = true; return out('==> Building and starting\n[+] Running 3/3\n ✔ Container automation-db-1  Healthy\n ✔ Container automation-app-1  Started\nDone.\n'); }
  if (/docker compose ps/.test(script)) return out('app running\ndb running\nbackup running\n');
  if (/git fetch origin frontend/.test(script)) { st.fixedGit = true; return out("Reset branch 'frontend'\n"); }
  if (/auto-update\.sh/.test(script)) return st.fixedGit ? out('update service installed/repaired\n') : out('', 128, 'fatal: Cannot fast-forward to multiple branches.\n');
  if (/systemctl is-active/.test(script)) return out('active\n');
  if (/ufw allow/.test(script)) { st.port = true; return out('Rule added\n'); }
  if (/ufw status/.test(script)) return out('Status: active\n\nTo                         Action      From\n--                         ------      ----\n22/tcp                     ALLOW       Anywhere\n' + (st.port ? '8080/tcp                   ALLOW       Anywhere\n' : ''));
  if (/127\.0\.0\.1:8080/.test(script)) return out('200');
  if (/hostname -I \| awk/.test(script)) return out('192.168.1.80\n');
  if (/ADMIN_PASSWORD/.test(script)) return out('SecretPw123\n');
  if (/ADMIN_EMAIL/.test(script)) return out('admin@company.internal\n');
  return out();
}

new Server({ hostKeys: [privateKey] }, (client) => {
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' && ctx.username === 'paya' && ctx.password === 'pw') return ctx.accept();
    ctx.reject(['password']);
  });
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept();
      session.on('exec', (acceptExec, _rej, info) => {
        const stream = acceptExec();
        let cmd = info.command;
        const done = (r) => {
          if (r.stdout) stream.write(r.stdout);
          if (r.stderr) stream.stderr.write(r.stderr);
          stream.exit(r.code);
          stream.end();
        };
        if (/^cat > \/tmp\/hoormand-src\.tgz/.test(cmd)) {
          let n = 0;
          stream.on('data', (d) => (n += d.length));
          stream.on('end', () => { st.uploaded = n > 1000; st.uploadedBytes = n; console.log('upload bytes', n); stream.exit(0); stream.end(); });
          return;
        }
        const run = () => {
          const m = /^bash -c '([\s\S]*)'$/.exec(cmd);
          const script = m ? m[1].replace(/'\\''/g, "'") : cmd;
          const t = setTimeout(() => done(answer(script)), 120);
          void t;
        };
        if (/^sudo -S/.test(cmd)) {
          stream.once('data', (d) => {
            if (d.toString().trim() !== 'pw') return done({ stdout: '', stderr: 'Sorry, try again.', code: 1 });
            if (process.env.SUDOWARN) stream.stderr.write('sudo: unable to resolve host ava-ubuntu: Name or service not known\n');
            cmd = cmd.replace(/^sudo -S -p '' /, '');
            run();
          });
        } else run();
      });
    });
  });
}).listen(2222, '127.0.0.1', () => console.log('fake server on 2222'));
