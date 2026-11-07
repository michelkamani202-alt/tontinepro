// Vérifie chaque fichier du projet : syntaxe JS, JSON valide, références du HTML et du service worker.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error('  ✗', msg);
};
const ok = (msg) => console.log('  ✓', msg);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n.startsWith('.')) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(root);
const rel = (f) => f.slice(root.length + 1);

console.log('Syntaxe JavaScript');
for (const f of files.filter((f) => /\.(js|mjs)$/.test(f))) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(rel(f));
  } catch (e) {
    fail(`${rel(f)} : ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')}`);
  }
}

console.log('JSON');
for (const f of files.filter((f) => /\.(json|webmanifest)$/.test(f))) {
  try {
    JSON.parse(readFileSync(f, 'utf8'));
    ok(rel(f));
  } catch (e) {
    fail(`${rel(f)} : ${e.message}`);
  }
}

console.log('Imports relatifs');
for (const f of files.filter((f) => /^js[\\/].*\.js$/.test(rel(f)))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = resolve(dirname(f), m[1]);
    if (!existsSync(target)) fail(`${rel(f)} importe ${m[1]} (introuvable)`);
  }
  ok(rel(f));
}

console.log('Références de index.html, manifest et sw.js');
const refs = [];
const index = readFileSync(join(root, 'index.html'), 'utf8');
for (const m of index.matchAll(/(?:href|src)="([^"#:]+)"/g)) refs.push(m[1]);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
manifest.icons.forEach((i) => refs.push(i.src));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
for (const m of sw.matchAll(/'\.\/([^']*)'/g)) refs.push(m[1] || 'index.html');
for (const r of new Set(refs)) {
  if (r.startsWith('http')) continue;
  existsSync(join(root, r)) ? ok(r) : fail(`fichier référencé introuvable : ${r}`);
}

console.log(failures ? `\n${failures} problème(s)` : '\nTout est valide.');
process.exit(failures ? 1 : 0);
