import { expect, Page } from '@playwright/test';
import { pace } from './pacing';

export const APP = {
  login: '/queue/app/login.php',
  index: '/queue/app/index.php',
  waitingKiosk: '/queue/app/waiting_queue.php',
  abtcKiosk: '/queue/app/abtc_queue.php',
  ticket: '/queue/app/ticket_others.php',
};

const LOGIN_DST = /\/queue\/app\/(index\.php|choose_section\.php|choose_waiting_section\.php)/;

export async function gotoApp(page: Page, path: string): Promise<void> {
  const target = path.startsWith('/') ? path : `/queue/app/${path}`;
  await pace(path);
  await page.goto(target);
}

// Logs in through the real form. Login GET and POST share the `tickets` rate
// bucket, so both legs are paced.
export async function loginAs(
  page: Page,
  username: string,
  password: string,
  opts: { expectError?: RegExp } = {},
): Promise<void> {
  await gotoApp(page, APP.login);
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.fill('#username', username);
  await page.fill('#password', password);
  await pace(APP.login);

  if (opts.expectError) {
    await page.click('button.signin-btn');
    await expect(page.locator('.alert-error')).toBeVisible();
    await expect(page.locator('.alert-error')).toContainText(opts.expectError);
    return;
  }

  await Promise.all([
    page.waitForURL(LOGIN_DST),
    page.click('button.signin-btn'),
  ]);
}

export async function logout(page: Page): Promise<void> {
  await page.goto('/queue/app/logout.php');
  await page.waitForURL(/login\.php/);
}

// Authenticated JSON calls from inside the page (uses the page's own CSRF
// meta token, exactly like index.js does). Call only on pages that render the
// csrf-token meta tag (index.php, user_management.php, ...).
export async function appFetch(
  page: Page,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, string | number> } = {},
  waitUntil = 'response',
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ path, init, waitUntil }) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const response = await fetch(path, {
        method: init.method || 'GET',
        headers: {
          'X-CSRF-TOKEN': csrf,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: init.body
          ? new URLSearchParams(Object.entries(init.body).map(([k, v]) => [k, String(v)]))
          : undefined,
      });
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // keep raw text
      }
      return { status: response.status, body };
    },
    { path, init, waitUntil },
  );
}

const TICKET_NUMBER_RE = /^[A-Z]+-\d{3}$/;

// Issues a ticket at a public kiosk. The POST redirects to ticket_others.php
// carrying queue_number & code, which the kiosk beacon captures deterministi-
// cally (the ticket page returns to the kiosk after the print dialog closes,
// or via its fallback timer).
export async function issueTicket(
  page: Page,
  kioskPath: string,
  categoryLabel: 'Regular' | 'Priority' | 'Emergency',
): Promise<{ number: string; code: string }> {
  await gotoApp(page, kioskPath);
  await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  const beacon = page.waitForResponse(
    (r) => r.url().includes('ticket_others.php') && r.request().method() === 'GET',
  );
  await pace(kioskPath); // the POST itself is rate-limited
  await page.locator('button[type="submit"]', { hasText: categoryLabel }).click();

  const url = new URL((await beacon).url());
  const number = url.searchParams.get('queue_number') || '';
  const code = url.searchParams.get('code') || '';
  expect(number).toMatch(TICKET_NUMBER_RE);
  expect(code.length).toBeGreaterThan(0);

  return { number, code };
}