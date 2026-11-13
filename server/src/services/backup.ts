import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config';
import { backupJobs, db } from '../db';
import { emitToUser } from '../realtime';

/**
 * MongoDB backups: `mongodump` archives written outside the web root.
 *
 * A "restore test" restores an archive into a scratch database, validates
 * every collection, then drops it. The live database is never a restore
 * target, and there is deliberately no way to restore over it from here.
 */
export type BackupAction = 'backup' | 'verify' | 'prune';

const FILE_PATTERN = /^rhu_queue_\d{8}_\d{6}\.archive\.gz$/;
export const validFileName = (file: string): boolean => FILE_PATTERN.test(file);
export const validJobId = (job: string): boolean => /^[a-f0-9]{16}$/.test(job);
export const backupDirectory = (): string => path.resolve(config.backup.directory);

export interface BackupFile {
  file: string;
  size: number;
  modified: Date;
}

export async function inventory(): Promise<BackupFile[]> {
  const dir = backupDirectory();
  if (!existsSync(dir)) {
    return [];
  }
  const out: BackupFile[] = [];
  for (const file of await readdir(dir)) {
    if (!validFileName(file)) {
      continue;
    }
    const info = await stat(path.join(dir, file));
    out.push({ file, size: info.size, modified: info.mtime });
  }
  return out.sort((a, b) => b.file.localeCompare(a.file));
}

export const toolsInstalled = (): boolean =>
  ['mongodump', 'mongorestore'].every((tool) => spawnSync(tool, ['--version'], { stdio: 'ignore' }).status === 0);

/**
 * Run a MongoDB tool. The connection string goes in a private config file,
 * never on the command line, so credentials do not show up in `ps`.
 */
async function runTool(tool: string, args: string[]): Promise<{ code: number; output: string }> {
  const configFile = path.join(os.tmpdir(), `rhu-backup-${randomBytes(8).toString('hex')}.yaml`);
  await writeFile(configFile, `uri: ${JSON.stringify(config.mongoUrl)}\n`, { mode: 0o600 });
  try {
    return await new Promise((resolve) => {
      const child = spawn(tool, [`--config=${configFile}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      child.on('error', (error) => resolve({ code: 127, output: error.message }));
      child.on('close', (code) => resolve({ code: code ?? 1, output: output.slice(-2000) }));
    });
  } finally {
    await rm(configFile, { force: true });
  }
}

function newFileName(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  return `rhu_queue_${stamp}.archive.gz`;
}

export async function takeBackup(): Promise<{ file: string; message: string }> {
  const dir = backupDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  const file = newFileName();
  const target = path.join(dir, file);
  const result = await runTool('mongodump', [`--archive=${target}`, '--gzip']);
  if (result.code !== 0) {
    await rm(target, { force: true });
    throw new Error(`mongodump failed: ${result.output.trim()}`);
  }
  const info = await stat(target);
  return { file, message: `Backup written: ${file} (${info.size} bytes)` };
}

/** Restore into a scratch database, validate it, and always drop it afterwards. */
export async function verifyBackup(file: string): Promise<string> {
  if (!validFileName(file)) {
    throw new Error('Invalid backup file name.');
  }
  const source = path.join(backupDirectory(), file);
  if (!existsSync(source)) {
    throw new Error('Backup file not found.');
  }
  const liveName = db().databaseName;
  const scratchName = `${liveName}_restore_check`;
  const scratch = db().client.db(scratchName);
  try {
    await scratch.dropDatabase();
    const result = await runTool('mongorestore', [`--archive=${source}`, '--gzip', `--nsFrom=${liveName}.*`, `--nsTo=${scratchName}.*`, '--drop']);
    if (result.code !== 0) {
      throw new Error(`mongorestore failed: ${result.output.trim()}`);
    }
    const collections = await scratch.listCollections().toArray();
    if (collections.length === 0) {
      throw new Error('The archive restored no collections.');
    }
    let documents = 0;
    for (const { name } of collections) {
      const validation = await scratch.command({ validate: name });
      if (!validation.valid) {
        throw new Error(`Collection ${name} failed validation.`);
      }
      documents += await scratch.collection(name).countDocuments();
    }
    return `Restore test passed: ${collections.length} collections, ${documents} documents validated.`;
  } finally {
    await scratch.dropDatabase().catch(() => undefined);
  }
}

/**
 * Copy a verified backup to the second folder (BACKUP_COPY_DIR), then delete
 * older copies there beyond BACKUP_KEEP. The new copy is written under a
 * temporary name first, so a failed copy never replaces a good one.
 */
export async function copyToSecondFolder(file: string): Promise<string> {
  if (!config.backup.copyDirectory) {
    return 'No copy folder set (BACKUP_COPY_DIR).';
  }
  if (!validFileName(file)) {
    throw new Error('Invalid backup file name.');
  }
  const dir = path.resolve(config.backup.copyDirectory);
  mkdirSync(dir, { recursive: true, mode: 0o750 });
  const partial = path.join(dir, `${file}.partial`);
  await copyFile(path.join(backupDirectory(), file), partial);
  await rename(partial, path.join(dir, file));
  const copies = (await readdir(dir)).filter(validFileName).sort().reverse();
  const doomed = copies.slice(Math.max(1, config.backup.keep));
  for (const old of doomed) {
    await rm(path.join(dir, old), { force: true });
  }
  return `Copied to ${dir}: kept ${copies.length - doomed.length}, removed ${doomed.length}.`;
}

/** Keep the newest `keep` backups and delete the rest. */
export async function pruneBackups(keep: number = config.backup.keep): Promise<string> {
  const files = await inventory();
  const doomed = files.slice(Math.max(1, keep));
  for (const f of doomed) {
    await rm(path.join(backupDirectory(), f.file), { force: true });
  }
  return `Retention applied: kept ${files.length - doomed.length}, removed ${doomed.length}.`;
}

export async function runAction(action: BackupAction, file: string | null): Promise<{ file: string | null; message: string }> {
  if (action === 'backup') {
    return takeBackup();
  }
  if (action === 'verify') {
    return { file, message: await verifyBackup(file ?? '') };
  }
  return { file: null, message: await pruneBackups() };
}

/** Tell the screen that started a job how it ended (over its socket). */
function announceJob(userId: number | null, id: string, state: 'done' | 'failed', message: string): void {
  if (userId) {
    emitToUser(userId, 'backup-job', { job: id, state, message });
  }
}

/** Start an action in the background and return its job id; the result is pushed over the socket. */
export async function startJob(action: BackupAction, file: string | null, userId: number | null): Promise<string> {
  const id = randomBytes(8).toString('hex');
  await backupJobs().insertOne({ _id: id, action, file, state: 'running', message: 'Started', user_id: userId, started_at: new Date(), finished_at: null });
  void runAction(action, file)
    .then(async (result) => {
      await backupJobs().updateOne({ _id: id }, { $set: { state: 'done', message: result.message, file: result.file, finished_at: new Date() } });
      announceJob(userId, id, 'done', result.message);
    })
    .catch(async (error: Error) => {
      const message = error.message.slice(0, 500);
      await backupJobs().updateOne({ _id: id }, { $set: { state: 'failed', message, finished_at: new Date() } });
      announceJob(userId, id, 'failed', message);
    })
    .catch((error) => console.error('backup job bookkeeping failed', error));
  return id;
}

export async function health(files?: BackupFile[]) {
  const list = files ?? (await inventory());
  const newest = list[0] ?? null;
  const ageHours = newest ? (Date.now() - newest.modified.getTime()) / 3600000 : null;
  const stats = await db().stats();
  let state: 'ok' | 'warn' | 'critical' = 'ok';
  if (ageHours === null || ageHours > config.backup.warnHours * 2) {
    state = 'critical';
  } else if (ageHours > config.backup.warnHours) {
    state = 'warn';
  }
  return {
    state,
    tools_installed: toolsInstalled(),
    newest_file: newest?.file ?? null,
    newest_at: newest?.modified ?? null,
    newest_age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    backup_count: list.length,
    backup_bytes: list.reduce((sum, f) => sum + f.size, 0),
    database: db().databaseName,
    data_bytes: stats.dataSize ?? 0,
    storage_bytes: stats.storageSize ?? 0,
    collections: stats.collections ?? 0,
    directory: backupDirectory(),
    keep: config.backup.keep,
    schedule: config.backup.schedule,
  };
}
