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
  const out = (stdout = '', code = 0, stderr = '') => ({ stdout, code, stderr });
  // background jobs (the panel starts long commands detached and then reads their log)
  if (/pgrep -f 'bash \/tmp\/hoormand-job\.sh'/.test(script)) return out('', 1);
  const jb = /echo (\S+) \| base64 -d > \/tmp\/hoormand-job\.sh/.exec(script);
  if (jb) {
    const inner = Buffer.from(jb[1], 'base64').toString().replace(/^#!.*\n/, '').replace(/\necho \$\? > .*\n$/, '');
    const r = answer(inner);
    st.job = { data: Buffer.from(r.stdout + r.stderr), code: r.code };
    return out('started\n');
  }
  if (/echo "HJ \$s \$e"/.test(script)) {
    const off = Number(/OFF=(\d+)/.exec(script)[1]);
    const j = st.job || { data: Buffer.alloc(0), code: 0 };
    return out(`HJ ${j.data.length} ${j.code}\n` + j.data.slice(off).toString());
  }
  if (/os-release/.test(script)) return out('سیستم‌عامل: Ubuntu 24.04 LTS\nکاربر: paya\nآدرس: 192.168.1.80 172.17.0.1\nرم: 7800 مگابایت\nفضای آزاد: 80G\n');
  if (script === 'true') return out();
  if (/command -v apt-get/.test(script)) return out('apt\n');
  if (/github\.com/.test(script)) return out('github: 200\nraw: 200\n');
  if (/^docker --version/.test(script)) return st.docker ? out('Docker version 27.0\nDocker Compose version v2.29\n') : out('', 127, 'docker: command not found');
  if (/get\.docker\.com/.test(script)) { st.docker = true; return out('# Executing docker install script\nDocker installed.\n'); }
  if (/systemctl enable --now docker/.test(script)) return out();
  if (/^docker compose version/.test(script)) return st.docker ? out('Docker Compose version v2.29\n') : out('', 1, 'no docker');
  if (/docker pull -q postgres/.test(script)) return st.mirrors ? out('sha256:abc\n') : out('', 1, 'unknown: failed to copy: httpReadSeeker: failed open: unexpected status from GET request to https://production.cloudfront.docker.com/...: 403 Forbidden\n');
  if (/daemon\.json/.test(script)) { st.mirrors = true; return out(); }
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
        const run = () => {
          const m = /^bash -c '([\s\S]*)'$/.exec(cmd);
          const script = m ? m[1].replace(/'\\''/g, "'") : cmd;
          const t = setTimeout(() => done(answer(script)), 120);
          void t;
        };
        if (/^sudo -S/.test(cmd)) {
          stream.once('data', (d) => {
            if (d.toString().trim() !== 'pw') return done({ stdout: '', stderr: 'Sorry, try again.', code: 1 });
            cmd = cmd.replace(/^sudo -S -p '' /, '');
            run();
          });
        } else run();
      });
    });
  });
}).listen(2222, '127.0.0.1', () => console.log('fake server on 2222'));
