import { expect, test } from '@playwright/test';
import { APP, gotoApp, issueTicket } from '../lib/app';

test('waiting area kiosk issues an R ticket', async ({ page }) => {
  const { number, code } = await issueTicket(page, APP.waitingKiosk, 'Regular');
  expect(number).toMatch(/^R-\d{3}$/);
  expect(code).toMatch(/^[A-Z0-9]{4}$/);
});

test('abtc kiosk issues an AR ticket', async ({ page }) => {
  const { number, code } = await issueTicket(page, APP.abtcKiosk, 'Regular');
  expect(number).toMatch(/^AR-\d{3}$/);
  expect(code).toMatch(/^[A-Z0-9]{4}$/);
});

test('waiting kiosk shows the from-admission notice', async ({ page }) => {
  await gotoApp(page, `${APP.waitingKiosk}?from=admission`);
  await expect(page.locator('body')).toContainText('Admission ticketing has moved here');
});