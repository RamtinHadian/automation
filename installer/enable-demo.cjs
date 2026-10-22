'use strict';
/**
 * Turns a Hoormand server into the public demo with the IT sample data. Run it ON YOUR OWN COMPUTER (double-click enable-demo.cmd):
 * it asks for the SSH login (the password is typed hidden and kept only in memory), finds the program's folder on the server,
 * writes DEMO=1, DEMO_RESET_HOURS=1 and DEMO_THEME=it into its .env, brings in the newest program, rebuilds it and tries to sign in
 * with demo / demo to prove it works.
 */
const readline = require('readline');
const { Client } = require('ssh2');

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ask(q, def) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q + (def ? ` [${def}] ` : ' '), (a) => { rl.close(); res(a.trim() || def || ''); }));
}
function askHidden(q) {
  return new Promise((res) => {
    process.stdout.write(q + ' ');
    const stdin = process.stdin;
    let buf = '';
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const on = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode && stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', on);
          process.stdout.write('\n');
          return res(buf);
        }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', on);
  });
}

class Server {
  constructor(conn, user, password) { this.conn = conn; this.user = user; this.password = password; }
  run(cmd, { root = false, quiet = false } = {}) {
    return new Promise((resolve) => {
      const needSudo = root && this.user !== 'root';
      const full = needSudo ? `sudo -S -p '' bash -c ${sq(cmd)}` : `bash -c ${sq(cmd)}`;
      if (!quiet) console.log('  $ ' + (needSudo ? 'sudo ' : '') + cmd.split('\n')[0].slice(0, 150));
      this.conn.exec(full, (err, stream) => {
        if (err) return resolve({ code: 255, out: String(err.message) });
        let out = '';
        const take = (d) => {
          const t = d.toString().replace(/^sudo: .*\n?/gm, '');
          out += t;
          if (!quiet) process.stdout.write(t);
        };
        stream.on('data', take);
        stream.stderr.on('data', take);
        stream.on('close', (code) => resolve({ code: code ?? 0, out }));
        if (needSudo) stream.write(this.password + '\n');
      });
    });
  }
}

async function main() {
  console.log('\n=== فعال‌سازی نسخهٔ نمایشی (دمو) با اطلاعات حوزهٔ فناوری اطلاعات ===\n');
  const E = process.env; // the same answers can be given as DEMO_HOST, DEMO_PORT, DEMO_USER, DEMO_PASS, DEMO_THEME_NAME (for tests)
  const host = E.DEMO_HOST || (await ask('آدرس سرور (IP عمومی یا داخلی):', '194.150.71.141'));
  const port = Number(E.DEMO_PORT || (await ask('پورت SSH آن سرور:', '22'))) || 22;
  const user = E.DEMO_USER || (await ask('نام کاربری:', 'hoormand'));
  const password = E.DEMO_PASS || (await askHidden('رمز SSH (دیده نمی‌شود):'));
  const theme = E.DEMO_THEME_NAME !== undefined ? E.DEMO_THEME_NAME : await ask('مجموعهٔ اطلاعات نمونه (it = فناوری اطلاعات، خالی = عمومی):', 'it');

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({ host, port, username: user, password, readyTimeout: 25000, keepaliveInterval: 10000 });
  }).catch((e) => { console.error('\nاتصال نشد: ' + e.message); process.exit(1); });
  const sv = new Server(conn, user, password);
  console.log('\nوصل شدم. نام ماشین: ' + (await sv.run('hostname', { quiet: true })).out.trim());

  // 1. the program's folder
  let dir = (await sv.run(`docker ps -q --filter label=com.docker.compose.service=app | head -1 | xargs -r docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`, { root: true, quiet: true })).out.trim().split('\n').pop().trim();
  if (!dir.startsWith('/')) {
    dir = (await sv.run(`for d in /opt/*/ /home/*/*/ /root/*/; do [ -f "$d/docker-compose.yml" ] && [ -d "$d/server" ] && echo "$d" && break; done`, { root: true, quiet: true })).out.trim().split('\n').pop().replace(/\/$/, '');
  }
  if (!dir.startsWith('/')) { console.error('\nپوشهٔ برنامه روی این سرور پیدا نشد. اول هورمند را با پنل نصب روی آن نصب کنید.'); process.exit(1); }
  console.log('پوشهٔ برنامه: ' + dir);

  // 2. the newest program (the demo data set is in it)
  const git = await sv.run(`cd ${sq(dir)} && [ -d .git ] && git -c safe.directory='*' fetch -q origin frontend && git -c safe.directory='*' reset -q --hard origin/frontend && echo "نسخه: $(cat VERSION | head -1)"`, { root: true });
  if (!/نسخه/.test(git.out)) console.log('\n  هشدار: این نصب Git ندارد یا به GitHub نرسید؛ اگر اطلاعات آی‌تی نیامد، برنامه را با «پنل نصب» به‌روز کنید.\n');

  // 3. .env (a key is changed when present, added when missing)
  const env = { DEMO: '1', DEMO_RESET_HOURS: '1' };
  if (theme) env.DEMO_THEME = theme;
  for (const [k, v] of Object.entries(env)) {
    await sv.run(`cd ${sq(dir)} && { if grep -q '^${k}=' .env; then sed -i 's/^${k}=.*/${k}=${v}/' .env; else echo '${k}=${v}' >> .env; fi; }`, { root: true });
  }
  console.log('\n.env این است (رمزها پنهان):');
  await sv.run(`cd ${sq(dir)} && grep -E '^(DEMO|PORT|BIND_ADDR)' .env`, { root: true });

  // 4. rebuild in the background (a dropped line does not stop it)
  console.log('\nساخت و راه‌اندازی دوبارهٔ برنامه (چند دقیقه طول می‌کشد)...');
  await sv.run(`rm -f /tmp/hoormand-demo.exit /tmp/hoormand-demo.log; cd ${sq(dir)} && setsid nohup bash -c 'docker compose up -d --build; echo $? > /tmp/hoormand-demo.exit' > /tmp/hoormand-demo.log 2>&1 < /dev/null & echo started`, { root: true, quiet: true });
  let shown = 0;
  for (let i = 0; i < 240; i++) {
    await sleep(5000);
    const r = await sv.run(`wc -c < /tmp/hoormand-demo.log; cat /tmp/hoormand-demo.exit 2>/dev/null || echo RUN`, { root: true, quiet: true });
    const [size, state] = r.out.trim().split('\n');
    if (Number(size) > shown) {
      const t = (await sv.run(`tail -c +${shown + 1} /tmp/hoormand-demo.log | tail -n 12`, { root: true, quiet: true })).out;
      process.stdout.write(t.endsWith('\n') ? t : t + '\n');
      shown = Number(size);
    }
    if (state && state.trim() !== 'RUN') {
      if (state.trim() !== '0') { console.error('\nساخت با خطا تمام شد (کد ' + state.trim() + '). متن بالا را برای پشتیبانی بفرستید.'); process.exit(1); }
      break;
    }
  }

  // 5. does demo / demo sign in?
  console.log('\nآزمایش ورود demo / demo ...');
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    await sleep(6000);
    const r = await sv.run(`p=$(grep -E '^PORT=' ${sq(dir)}/.env | cut -d= -f2); curl -s -m 8 -X POST http://127.0.0.1:\${p:-8080}/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"demo","password":"demo"}'`, { root: true, quiet: true });
    ok = /"token"/.test(r.out);
  }
  console.log(ok ? '\n✓ ورود demo / demo کار می‌کند. حالا آدرس سایت را باز کنید و با نام کاربری demo و رمز demo وارد شوید.' : '\n✗ ورود demo / demo هنوز جواب نداد. چند دقیقه صبر کنید و دوباره امتحان کنید؛ اگر نشد، لاگ را ببینید: cd ' + dir + ' && sudo docker compose logs --tail 60 app');
  conn.end();
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error('\nخطا: ' + e.message); process.exit(1); });
