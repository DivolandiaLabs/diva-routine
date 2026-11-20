// Publica el instalador en GitHub (npm run publicar) sin dejar publicaciones duplicadas.
//
// electron-builder sube cada archivo por su cuenta y, si la publicación aún no existe, a veces
// cada subida crea la suya: salían dos publicaciones con la misma etiqueta y el enlace de
// actualización podía romperse. Aquí se crea antes una publicación en borrador (todas las subidas
// la encuentran y van a ella), se comprueba que tiene los tres archivos correctos y solo entonces
// se publica. Necesita GH_TOKEN, igual que electron-builder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { owner, repo } = pkg.build.publish.find((p) => p.provider === 'github');
const version = pkg.version;
const tag = `v${version}`;
const exe = `Diva-Routine-Setup-${version}.exe`;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) fail('Falta GH_TOKEN (por ejemplo: GH_TOKEN=$(gh auth token) npm run publicar).');

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function gh(url, opts = {}) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/repos/${owner}/${repo}${url}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.headers || {}) },
  });
  if (!res.ok) fail(`GitHub respondió ${res.status} a ${opts.method || 'GET'} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

const releasesFor = async () => (await gh('/releases?per_page=100')).filter((r) => r.tag_name === tag || r.tag_name === version);

// 1) La publicación, en borrador, antes de subir nada.
let found = await releasesFor();
if (found.length > 1) fail(`Ya hay ${found.length} publicaciones con la etiqueta ${tag}: deja solo una y vuelve a intentarlo.`);
let release = found[0];
if (release && !release.draft) fail(`La publicación ${tag} ya está publicada: sube la versión antes de publicar otra vez.`);
if (!release) {
  release = await gh('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: version, draft: true }) });
  console.log(`Borrador de la publicación ${tag} creado.`);
}

// 2) El instalador, subido por electron-builder a ese borrador.
const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const run = spawnSync(bin, ['--win', '--publish', 'always'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
if (run.status !== 0) fail('electron-builder falló: el borrador queda sin publicar (vuelve a ejecutar npm run publicar).');

// 3) Comprobar: una sola publicación, con los tres archivos, y latest.yml apuntando a este instalador.
found = await releasesFor();
if (found.length !== 1) fail(`Han quedado ${found.length} publicaciones con la etiqueta ${tag}: revísalas antes de publicar.`);
release = found[0];
const assets = await gh(`/releases/${release.id}/assets?per_page=100`);
const local = (name) => fs.readFileSync(path.join(ROOT, 'dist', name));
const sha512 = crypto.createHash('sha512').update(local(exe)).digest('base64');
const latestYml = path.join(ROOT, 'dist', 'latest.yml');
const yml = fs.readFileSync(latestYml, 'utf8');
if (!yml.includes(`version: ${version}`) || !yml.includes(sha512)) fail('dist/latest.yml no corresponde a este instalador.');

async function ensure(name, file) {
  const size = fs.statSync(file).size;
  const have = assets.find((a) => a.name === name);
  if (have && have.size === size && have.state === 'uploaded') return;
  if (have) await gh(`/releases/assets/${have.id}`, { method: 'DELETE' });
  console.log(`Subiendo ${name}…`);
  await gh(`https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
    body: fs.readFileSync(file),
  });
}
await ensure(exe, path.join(ROOT, 'dist', exe));
await ensure(`${exe}.blockmap`, path.join(ROOT, 'dist', `${exe}.blockmap`));
await ensure('latest.yml', latestYml);

// El latest.yml subido tiene que ser este (antes a veces quedaba uno viejo).
const remoteYml = (await gh(`/releases/${release.id}/assets?per_page=100`)).find((a) => a.name === 'latest.yml');
const yres = await fetch(remoteYml.url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' } });
if (!yres.ok || (await yres.text()).trim() !== yml.trim()) fail('El latest.yml de GitHub no coincide con dist/latest.yml.');

// 4) Publicar.
await gh(`/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify({ draft: false, make_latest: 'true' }) });
console.log(`\n✔ Publicada ${tag}: ${exe}, su blockmap y latest.yml.`);
