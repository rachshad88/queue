import { expect, test } from '@playwright/test';
import { accounts } from '../lib/accounts';
import { APP, gotoApp, loginAs, logout } from '../lib/app';

test('invalid credentials are rejected inline', async ({ page }) => {
  await loginAs(page, accounts.clinic.username, 'DefinitelyWrong!', {
    expectError: /Invalid username or password/,
  });
});

test('clinic staff logs in, reaches the controller, sidebar sessions, logout', async ({ page }) => {
  await loginAs(page, accounts.clinic.username, accounts.clinic.password);

  // Controller dashboard for a staff operator.
  await expect(page.locator('#serve')).toBeVisible();
  await expect(page.locator('body')).toContainText('CLINIC 1');

  // The sidebar endpoint now answers for the live session.
  const sb = await page.evaluate(async () => {
    const r = await fetch('/queue/app/sidebar.php');
    return { status: r.status, text: await r.text() };
  });
  expect(sb.status).toBe(200);
  expect(sb.text).toContain(accounts.clinic.username);

  // Logout ends the session and re-gates the dashboard.
  await logout(page);
  await gotoApp(page, APP.index);
  await expect(page).toHaveURL(/login\.php/);
});