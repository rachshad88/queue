import { connect, disconnect } from '../db';
import { runAction, type BackupAction } from '../services/backup';

/**
 * Scheduled backups: `npm run backup -- --action=backup` (also verify, prune).
 * `--file=` names the archive for verify.
 */
const arg = (name: string): string => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const action = (arg('action') || 'backup') as BackupAction;

if (!['backup', 'verify', 'prune'].includes(action)) {
  console.error(`Unknown action "${action}". Use backup, verify or prune.`);
  process.exit(2);
}

await connect();
try {
  const result = await runAction(action, arg('file') || null);
  console.log(result.message);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await disconnect();
}
