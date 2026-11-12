import { createReadStream, existsSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { config } from '../config';
import { backupJobs, users } from '../db';
import { requireSuperadmin, throttle } from '../middleware/auth';
import { backupDirectory, health, inventory, startJob, validFileName, validJobId, type BackupAction } from '../services/backup';
import { clientIp, str } from '../util';

/** Database backup console (superadmin only). */
export const backupRouter = Router();
backupRouter.use(requireSuperadmin);

const ACTIONS: BackupAction[] = ['backup', 'verify', 'prune'];

const audit = (req: Request, event: string, context: Record<string, unknown>): void =>
  console.info(event, JSON.stringify({ user_id: req.session.user_id ?? null, ip: clientIp(req), ...context }));

/** Destructive actions require the operator to retype their password. */
async function reauthenticated(req: Request): Promise<boolean> {
  const password = str(req.body?.password);
  const user = await users().findOne({ _id: req.session.user_id ?? 0 }, { projection: { password: 1 } });
  return password !== '' && !!user && (await bcrypt.compare(password, user.password));
}

backupRouter.get('/backup', async (_req, res) => {
  const files = await inventory();
  const jobs = await backupJobs().find().sort({ started_at: -1 }).limit(10).toArray();
  res.json({
    success: true,
    health: await health(files),
    backups: files,
    jobs: jobs.map((j) => ({ id: j._id, action: j.action, file: j.file, state: j.state, message: j.message, started_at: j.started_at, finished_at: j.finished_at })),
  });
});

backupRouter.post('/backup', throttle('backup', config.throttle.backup, (req) => `user:${req.session.user_id ?? 0}`), async (req, res) => {
  const action = str(req.body?.action);
  const file = str(req.body?.file);

  if (action === 'delete') {
    if (!(await reauthenticated(req))) {
      audit(req, 'backup.confirm_denied', { action });
      res.json({ success: false, message: 'Password confirmation required.' });
      return;
    }
    const files = await inventory();
    if (!validFileName(file) || !files.some((f) => f.file === file)) {
      res.json({ success: false, message: 'Backup file not found.' });
      return;
    }
    if (files.length === 1) {
      res.json({ success: false, message: 'The last remaining backup cannot be deleted.' });
      return;
    }
    await rm(path.join(backupDirectory(), file), { force: true });
    audit(req, 'backup.delete', { file });
    res.json({ success: true, message: `${file} deleted.` });
    return;
  }

  if (!ACTIONS.includes(action as BackupAction)) {
    res.json({ success: false, message: 'Unknown action.' });
    return;
  }
  if (action === 'verify' && !validFileName(file)) {
    res.json({ success: false, message: 'Pick a backup to test.' });
    return;
  }
  if (await backupJobs().findOne({ state: 'running', started_at: { $gt: new Date(Date.now() - 30 * 60000) } })) {
    res.json({ success: false, message: 'Another backup job is still running.' });
    return;
  }
  const job = await startJob(action as BackupAction, action === 'verify' ? file : null, req.session.user_id ?? null);
  audit(req, `backup.${action}`, { job, file: file || null });
  res.json({ success: true, job, message: 'Job started.' });
});

backupRouter.get('/backup/status', async (req, res) => {
  const id = str(req.query.job);
  const job = validJobId(id) ? await backupJobs().findOne({ _id: id }) : null;
  if (!job) {
    res.status(404).json({ success: false, message: 'Job not found.' });
    return;
  }
  res.json({ success: true, state: job.state, message: job.message, file: job.file, finished_at: job.finished_at });
});

backupRouter.get('/backup/download', async (req, res) => {
  const file = str(req.query.file);
  const target = path.join(backupDirectory(), file);
  if (!validFileName(file) || !existsSync(target)) {
    res.status(404).json({ success: false, message: 'Backup file not found.' });
    return;
  }
  audit(req, 'backup.download', { file });
  res.set({
    'Content-Type': 'application/gzip',
    'Content-Length': String((await stat(target)).size),
    'Content-Disposition': `attachment; filename="${file}"`,
    'Cache-Control': 'no-store',
  });
  createReadStream(target).pipe(res);
});
