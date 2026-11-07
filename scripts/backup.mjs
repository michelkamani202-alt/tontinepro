import { DatabaseSync, backup } from 'node:sqlite';
import { chmod, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function backupDatabase(sourcePath = process.env.TONTINE_DB_PATH || join(ROOT, 'data', 'tontinepro.sqlite'), outputDirectory = join(dirname(sourcePath), 'backups'), now = new Date()) {
  const source = resolve(sourcePath);
  const destinationDirectory = resolve(outputDirectory);
  const sourceInfo = await stat(source).catch(() => null);
  if (!sourceInfo?.isFile()) throw new Error(`Base SQLite introuvable : ${source}`);
  await mkdir(destinationDirectory, { recursive: true });

  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const destination = join(destinationDirectory, `tontinepro-${timestamp}.sqlite`);
  const database = new DatabaseSync(source);
  try {
    await backup(database, destination);
  } finally {
    database.close();
  }
  if (process.platform !== 'win32') await chmod(destination, 0o600);
  const retentionDays = Number(process.env.TONTINE_BACKUP_RETENTION_DAYS) || 30;
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of await readdir(destinationDirectory)) {
    if (!/^tontinepro-\d{4}-\d{2}-\d{2}T.*\.sqlite$/.test(name)) continue;
    const path = join(destinationDirectory, name);
    const info = await stat(path);
    if (info.isFile() && info.mtimeMs < cutoff) await unlink(path);
  }
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const destination = await backupDatabase(undefined, process.argv[2]);
    console.log(`Sauvegarde créée : ${destination}`);
  } catch (error) {
    console.error(error.message || 'Échec de la sauvegarde SQLite.');
    process.exitCode = 1;
  }
}
