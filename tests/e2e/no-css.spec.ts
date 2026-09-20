import { expect, test } from '@playwright/test';
import { pace } from './lib/pacing';

// Regression guard for the "CSS inlined, nothing stylesheet-y on the wire"
// contract. Pages must render (right status + title), carry zero <link rel=
// stylesheet> tags, zero external css host refs, and ship their CSS inside an
// inline <style> block instead.
const PAGES = [
  { path: '/queue/app/login.php', title: 'RHU Queue System - Login' },
  { path: '/queue/app/live.php', title: 'Live Queue Monitor' },
  { path: '/queue/app/waiting_queue.php', title: 'Queueing Ticket' },
  { path: '/queue/app/abtc_queue.php', title: 'ABTC Queue' },
];

test('public pages load no css over the network; css is inlined', async ({ request }) => {
  for (const page of PAGES) {
    await pace(page.path);

    const res = await request.get(page.path, { maxRedirects: 0 });
    expect(res.status(), `${page.path} status`).toBe(200);

    const html = await res.text();
    expect(html, `${page.path} rendered the real page`).toContain(page.title);
    expect(
      html.match(/rel\s*=\s*["']stylesheet/i),
      `${page.path} has no <link rel="stylesheet">`,
    ).toBeNull();
    expect(html, `${page.path} carries inline <style>`).toContain('<style>');
    expect(html, `${page.path} has no external css hosts`).not.toMatch(/cdnjs|fonts\.googleapis/i);
  }
});