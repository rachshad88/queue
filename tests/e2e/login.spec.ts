import { expect, test } from '@playwright/test';
import { pace } from './lib/pacing';

test('login page wires the Alpine password toggle', async ({ page }) => {
  await pace('/queue/app/login.php');
  await page.goto('/queue/app/login.php');

  const pw = page.locator('#password');
  const toggle = page.locator('.pw-toggle');
  const icon = page.locator('.pw-toggle i');

  await expect(page.locator('script[src*="rhu-alpine"]')).toBeAttached();

  await expect(pw).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-label', 'Show password');
  await expect(icon).toHaveClass(/fa-eye/);
  await expect(icon).not.toHaveClass(/fa-eye-slash/);

  await toggle.click();
  await expect(pw).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-label', 'Hide password');
  await expect(icon).toHaveClass(/fa-eye-slash/);

  await toggle.click();
  await expect(pw).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-label', 'Show password');
  await expect(icon).not.toHaveClass(/fa-eye-slash/);
});