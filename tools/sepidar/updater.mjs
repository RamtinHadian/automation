// Self-update of the program: the files are compared with the copy that Hoormand's server holds (the server is updated from Git like the
// rest of the app) and the ones that differ are replaced. Nothing here needs a package, and only the files named below can ever be written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

/** The only files an update may replace (never config.json, state.json, node.exe or the start scripts). */
export const UPDATABLE = ['sepidar-sync.mjs', 'sepidar-client.mjs', 'console-fa.mjs', 'config-help.mjs', 'ui.mjs', 'updater.mjs', 'Vazirmatn-Regular.woff2', 'Vazirmatn-Bold.woff2'];

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * get(path) -> the manifest {files: [{name, sha256, size}]}; getFile(name) -> a Buffer.
 * Every new file is checked against its hash and (a .mjs file) against Node's syntax check before anything is replaced;
 * the old files are kept in the folder «prev». Returns { updated: [names], version }.
 */
export async function selfUpdate({ dir, get, getFile, log = () => {} }) {
  const manifest = await get('/sepidar/tool');
  const wanted = (manifest.files || []).filter((f) => UPDATABLE.includes(f.name) && /^[0-9a-f]{64}$/.test(f.sha256 || ''));
  const changed = wanted.filter((f) => {
    try {
      return sha(fs.readFileSync(path.join(dir, f.name))) !== f.sha256;
    } catch {
      return true; // a file the program does not have yet
    }
  });
  if (changed.length === 0) return { updated: [], version: manifest.version };

  const staged = [];
  try {
    for (const f of changed) {
      const buf = await getFile(f.name);
      if (buf.length === 0 || buf.length > 5 * 1024 * 1024) throw new Error(`فایل «${f.name}» از هورمند درست نرسید.`);
      if (sha(buf) !== f.sha256) throw new Error(`فایل «${f.name}» از هورمند ناقص رسید (مجموع کنترلی نمی‌خواند).`);
      const tmp = path.join(dir, f.name.replace(/(\.[^.]+)$/, '.new$1'));
      fs.writeFileSync(tmp, buf);
      staged.push({ name: f.name, tmp });
      if (f.name.endsWith('.mjs')) {
        const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', windowsHide: true });
        if (r.status !== 0) throw new Error(`فایل تازهٔ «${f.name}» خطای برنامه‌نویسی دارد و جایگزین نشد: ${(r.stderr || '').split('\n').find((l) => l.trim()) || ''}`);
      }
    }
  } catch (e) {
    for (const s of staged) fs.rmSync(s.tmp, { force: true });
    throw e;
  }

  const prev = path.join(dir, 'prev');
  fs.mkdirSync(prev, { recursive: true });
  for (const s of staged) {
    const target = path.join(dir, s.name);
    if (fs.existsSync(target)) fs.copyFileSync(target, path.join(prev, s.name));
    fs.renameSync(s.tmp, target);
    log(`  بروزرسانی شد: ${s.name}`);
  }
  return { updated: staged.map((s) => s.name), version: manifest.version };
}
