// Antes de crear el instalador: mete en él tu identificador de Google y tu configuración de
// Firebase (si ya los configuraste), para que quien lo instale pueda iniciar sesión y compartir
// sin configurar nada. Se cogen de junto a la app o de tu app instalada (%LOCALAPPDATA%\Diva Routine,
// o la carpeta de antes, «Jazz Rutinas»).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'config');
const INSTALLED = ['Diva Routine', 'Jazz Rutinas'].map((n) => path.join(process.env.LOCALAPPDATA || '', n));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const name of ['google-client.json', 'firebase-config.json']) {
  const from = [ROOT, ...INSTALLED].map((d) => path.join(d, name)).find((p) => fs.existsSync(p));
  if (from) {
    fs.copyFileSync(from, path.join(OUT, name));
    console.log(`Incluido ${name} (de ${from})`);
  } else {
    console.log(`Sin ${name}: quien instale la app tendrá que configurarlo en Ajustes.`);
  }
}
