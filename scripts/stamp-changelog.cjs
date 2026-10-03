// Called by the pre-commit hook: gives the new version number to every changelog entry that was written without one.
const fs = require('fs');
const [file, version, date] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
let n = 0;
for (const e of list) if (!e.version) { e.version = version; e.date = date; n++; }
if (n) fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
console.log(n ? `changelog: ${n} entr${n > 1 ? 'ies' : 'y'} stamped ${version}` : 'changelog: nothing to stamp');
