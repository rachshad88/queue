import { expect, test } from '@playwright/test';
import { accounts } from '../lib/accounts';
import { loginAs } from '../lib/app';

test('superadmin sees section control tables rendered by Livewire', async ({ page }) => {
  await loginAs(page, accounts.superadmin.username, accounts.superadmin.password);

  await page.goto('/queue/app/section_control.php');
  await expect(page.locator('body')).toContainText('SECTION CONTROL');
  await expect(page.locator('body')).toContainText('Admission Windows');
  await expect(page.locator('body')).toContainText('Waiting Area Windows');

  const component = page.locator('[wire\\:id]').first();
  await expect(component).toBeVisible();
  await expect(component).toContainText('Window / Section');
});