// Called by the pre-commit hook: gives the new version to every changelog entry that was written without one.
// When nothing was prepared, a short generic entry is added so every version has a line in «تازه‌های سامانه».
const fs = require('fs');
const [file, version, date] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
let n = 0;
for (const e of list) if (!e.version) { e.version = version; e.date = date; n++; }
if (!n) {
  list.unshift({ version, date, items: ['بهبود پایداری و اصلاحات جزئی.'] });
  console.log(`changelog: no prepared entry, added a generic one for ${version}`);
} else {
  console.log(`changelog: ${n} entr${n > 1 ? 'ies' : 'y'} stamped ${version}`);
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
