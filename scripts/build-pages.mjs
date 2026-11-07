import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const apiBaseUrl = String(process.env.TONTINE_API_BASE_URL || '').trim().replace(/\/+$/, '');

if (!apiBaseUrl) throw new Error('Définissez la variable TONTINE_API_BASE_URL avec l’URL HTTPS de votre API.');
let apiUrl;
try {
  apiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('TONTINE_API_BASE_URL doit être une URL HTTPS valide.');
}
if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
  throw new Error('TONTINE_API_BASE_URL doit être HTTPS et ne contenir ni identifiants, ni paramètres, ni fragment.');
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const name of ['index.html', 'manifest.webmanifest', 'sw.js']) {
  await cp(join(ROOT, name), join(DIST, name));
}
for (const directory of ['css', 'js', 'icons']) {
  await cp(join(ROOT, directory), join(DIST, directory), { recursive: true });
}
await writeFile(join(DIST, 'config.js'), `window.TONTINE_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`);
await writeFile(join(DIST, '.nojekyll'), '');
console.log(`Site GitHub Pages prêt dans dist/ avec API ${apiUrl.origin}`);
