import { execSync } from 'node:child_process';
import { FullConfig } from '@playwright/test';

// Fullscan (GET-only) needs no live-DB writes. The regression project
// exercises real ticket issuance/serving, so it bootstraps the fixed E2E
// accounts into the app's configured database first — only when the operator
// opted in via E2E_ALLOW_LIVE=1.
export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.E2E_ALLOW_LIVE !== '1') {
    console.log('[global-setup] fullscan mode: no live database writes.');
    return;
  }

  const password = process.env.E2E_PASSWORD || 'E2Epass!2026';
  console.log(
    `[global-setup] E2E_ALLOW_LIVE=1: upserting E2E accounts (password ${process.env.E2E_PASSWORD ? 'from env' : 'default'}).`,
  );
  const out = execSync('php artisan e2e:ensure-users', {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, E2E_PASSWORD: password },
  });
  console.log(out.trim());
}