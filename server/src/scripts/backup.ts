import { connect, disconnect } from '../db';
import { copyToSecondFolder, pruneBackups, runAction, takeBackup, verifyBackup, type BackupAction } from '../services/backup';

/**
 * Scheduled backups: `npm run backup -- --action=nightly` writes a new archive,
 * restore-tests it, and only then removes the older ones (BACKUP_KEEP), so a
 * failed night never leaves the server without a good backup. The verified
 * archive is then copied to BACKUP_COPY_DIR, if set.
 * Single steps: --action=backup, verify (with --file=), prune.
 */
const arg = (name: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const action = (arg('action') || 'backup') as BackupAction | 'nightly';

if (!['nightly', 'backup', 'verify', 'prune'].includes(action)) {
  console.error(`Unknown action "${action}". Use nightly, backup, verify or prune.`);
  process.exit(2);
}

await connect();
try {
  if (action === 'nightly') {
    const written = await takeBackup();
    console.log(written.message);
    console.log(await verifyBackup(written.file));
    console.log(await pruneBackups());
    console.log(await copyToSecondFolder(written.file));
  } else {
    const result = await runAction(action, arg('file') || null);
    console.log(result.message);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await disconnect();
}
