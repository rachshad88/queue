import { expect, test } from '@playwright/test';
import { accounts } from '../lib/accounts';
import { gotoApp, loginAs } from '../lib/app';

// Read-only bug sweep of the auth-gated admin surface using the REAL
// superadmin account. Credentials arrive via env (never committed):
// E2E_ADMIN_USER / E2E_ADMIN_PASSWORD. Skips itself when unset so CI and the
// unauthenticated projects are unaffected. Makes no writes beyond the login
// itself (last_login_at/last_active), and no POSTs at all.
const ADMIN_USER = process.env.E2E_ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

test.skip(!ADMIN_USER || !ADMIN_PASSWORD, 'real superadmin creds not provided');

test('real superadmin sweeps every admin/report page without errors', async ({ page }) => {  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().slice(0, 300));
    }
  });

  await loginAs(page, ADMIN_USER, ADMIN_PASSWORD);
  await expect(page.locator('#serve')).toBeVisible();

  // edit_account.php bounces admins to the controller by design (the sidebar
  // hides its link for admins; self-edit is a staff page) — assert the
  // designed redirect instead of the heading.
  const PAGES: { path: string; marker: string; redirect?: RegExp }[] = [
    { path: 'index.php', marker: '' },
    { path: 'user_management.php', marker: 'USER MANAGEMENT' },
    { path: 'department_management.php', marker: 'DEPARTMENT MANAGEMENT' },
    { path: 'queue_logs.php', marker: 'QUEUE LOGS' },
    { path: 'audit_trail.php', marker: 'Audit Trail - Queue' },
    { path: 'served_queues.php', marker: 'SERVED QUEUES REPORT' },
    { path: 'server_history.php', marker: 'SERVER HISTORY' },
    { path: 'section_control.php', marker: 'SECTION CONTROL' },
    { path: 'edit_account.php', marker: '', redirect: /index\.php/ },
  ];

  for (const { path, marker, redirect } of PAGES) {
    await gotoApp(page, path);
    if (redirect) {
      await expect(page, `${path} redirects by design`).toHaveURL(redirect);
      continue;
    }
    // Still authenticated — never bounced back to the login form.
    await expect(page, `${path} stays logged in`).not.toHaveURL(/login\.php/);
    await expect(page.locator('#loginForm'), `${path} is not the login form`).toHaveCount(0);
    await expect(page.locator('body'), `${path} has no server error`).not.toContainText('Server Error');
    if (marker) {
      await expect(page.locator('body'), `${path} renders its heading`).toContainText(marker);
    }
  }

  // Authenticated plumbing answers too.
  const sidebar = await page.evaluate(async () => {
    const r = await fetch('/queue/app/sidebar.php');
    return { status: r.status, text: await r.text() };
  });
  expect(sidebar.status).toBe(200);
  expect(sidebar.text).toContain(ADMIN_USER);

  expect(pageErrors, `JS page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});

test('non-admin staff renders their own edit-account page', async ({ page }) => {
  await loginAs(page, accounts.clinic.username, accounts.clinic.password);
  await gotoApp(page, 'edit_account.php');
  await expect(page).not.toHaveURL(/login\.php/);
  await expect(page.locator('body')).not.toContainText('Server Error');
  await expect(page.locator('body')).toContainText('EDIT ACCOUNT');
});
