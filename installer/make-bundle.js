// Packs the program's code (the last commit of the project) into bundle/hoormand-src.tgz.
// The panel uploads this file to a server that cannot reach GitHub. Run:  node make-bundle.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'bundle', 'hoormand-src.tgz');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('git', ['archive', '--format=tar.gz', '-o', out, 'HEAD', '--', '.', ':(exclude)assets', ':(exclude)installer'], { cwd: root, stdio: 'inherit' });
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
fs.writeFileSync(path.join(__dirname, 'bundle', 'VERSION.txt'), head + '\n');
console.log('bundle ready:', out, Math.round(fs.statSync(out).size / 1024) + ' KB', 'commit', head);
