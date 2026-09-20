import { expect, test } from '@playwright/test';
import { accounts } from '../lib/accounts';
import { loginAs, logout, gotoApp } from '../lib/app';

test('superadmin reads management pages', async ({ page }) => {
  await loginAs(page, accounts.superadmin.username, accounts.superadmin.password);
  await expect(page.locator('#serve')).toBeVisible();

  await gotoApp(page, 'department_management.php');
  await expect(page.locator('body')).toContainText('CLINIC 1');

  await gotoApp(page, 'audit_trail.php');
  await expect(page.locator('body')).not.toContainText('Server Error');

  await gotoApp(page, 'server_history.php');
  await expect(page.locator('body')).not.toContainText('Server Error');

  await gotoApp(page, 'queue_logs.php');
  await expect(page.locator('body')).not.toContainText('Server Error');
});

test('account lifecycle: add user, default password, forced change, re-login', async ({ page }) => {
  const username = `e2e_usr_${Date.now().toString(36)}`;
  const newPassword = `E2Enew${Date.now().toString(36)}!`;

  // 1) Superadmin creates a regular operator (default password 12345).
  await loginAs(page, accounts.superadmin.username, accounts.superadmin.password);
  await gotoApp(page, 'user_management.php');
  await page.locator('button', { hasText: 'Add User' }).first().click();
  const addModal = page.locator('#addUserModal');
  await expect(addModal).toBeVisible();
  await page.fill('#add-firstname', 'E2E');
  await page.fill('#add-lastname', 'User');
  await page.fill('#add-position', 'E2E Regression');
  await page.selectOption('#add-department', { label: 'CLINIC 1' });
  await page.fill('#add-username', username);
  await page.selectOption('#add-usertype', 'regular');
  await Promise.all([
    page.waitForURL(/user_management\.php\?success=1/),
    addModal.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator(`button.editBtn[data-username="${username}"]`)).toBeVisible();

  // 2) New operator signs in with the default password; the app forces a change.
  await logout(page);
  await loginAs(page, username, '12345');
  const changeModal = page.locator('#changePwModal');
  await expect(changeModal).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept(newPassword));
  await page.locator('#changeNowBtn').click();
  await expect(changeModal).toBeHidden();

  // 3) The new password is live.
  await logout(page);
  await loginAs(page, username, newPassword);
  await expect(page.locator('#serve')).toBeVisible();
});