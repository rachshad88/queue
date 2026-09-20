import { expect, test } from '@playwright/test';
import { accounts } from '../lib/accounts';
import { APP, appFetch, gotoApp, issueTicket, loginAs } from '../lib/app';

type QueueRow = { id: number; queue_number: string; status: string };

// Full closed loop over the ABTC department: a public kiosk issues a real
// ticket, the ABTC operator claims exactly that row (approved serve), and
// finishes it. The very queue id issued is resolved from get_queue and used
// for every mutation, so a real patient's row can never be served even if a
// leftover test ticket from an earlier Manila day shares the same number
// (the daily counter resets at midnight).
test('ABTC ticket: kiosk issue -> approved serve -> finish', async ({ page }) => {
  // 1) Public kiosk issues the row we will serve.
  const { number } = await issueTicket(page, APP.abtcKiosk, 'Regular');

  // 2) ABTC staff log in to the controller.
  await loginAs(page, accounts.abtc.username, accounts.abtc.password);
  await expect(page.locator('#serve')).toBeVisible();

  // 3) Resolve the exact queue id of the freshly issued row (newest matching
  //    number in the department pool). Plain bounded loop: no assertion
  //    wrapper so extraction failures surface the real payload.
  const resolve = async (): Promise<QueueRow | undefined> => {
    const res = await appFetch(page, `/queue/app/get_queue.php?department_id=${accounts.abtc.dept}`, {});
    const body = res.body as { queues?: QueueRow[] };
    const matches = (body.queues ?? []).filter((q) => q.queue_number === number);
    return matches.sort((a, b) => b.id - a.id)[0];
  };
  let row: QueueRow | undefined;
  let lastSample = '';
  for (let attempt = 0; attempt < 40 && !row; attempt++) {
    row = await resolve();
    if (!row) {
      lastSample = JSON.stringify(await resolve()).slice(0, 400);
      await page.waitForTimeout(500);
    }
  }
  expect(row, `fresh ticket ${number} not returned by get_queue; sample ${lastSample}`).toBeDefined();
  const queueId = row!.id;
  expect(queueId).toBeGreaterThan(0);

  // 4) Serve via the approval modal (real UI path): admins may approve a serve.
  //    NOTE: filter({ has }) resolves its inner locator against each row's
  //    subtree, so the inner locator must NOT require the #queue-body ancestor.
  const rowLoc = page.locator('#queue-body tr', {
    has: page.locator(`button[data-action="serve"][data-id="${queueId}"]`),
  });
  await rowLoc.locator('.row-actions-toggle').click();
  await rowLoc.locator(`button[data-action="serve"][data-id="${queueId}"]`).click();
  const modal = page.locator('#approvalModal');
  await expect(modal).toBeVisible();
  await page.fill('#approverPassword', accounts.admin.password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('queue_action.php') && r.request().method() === 'POST'),
    page.locator('button', { hasText: 'APPROVE & SERVE' }).click(),
  ]);

  // 5) The row is now serving under this operator.
  await expect
    .poll(async () => (await resolve())?.status ?? null)
    .toBe('serving');

  // 6) Finish it (same endpoint the app's SERVE NEXT uses; retires only rows
  //    owned by this operator).
  const fin = await appFetch(page, '/queue/app/finish.php', {
    method: 'POST',
    body: { department_id: String(accounts.abtc.dept) },
  });
  expect((fin.body as { success?: boolean }).success).toBe(true);

  // 7) The finished row leaves the active queue.
  await expect
    .poll(async () => {
      const res = await appFetch(page, `/queue/app/get_queue.php?department_id=${accounts.abtc.dept}`, {});
      const body = res.body as { queues?: QueueRow[] };
      return (body.queues ?? []).some((q) => q.id === queueId);
    })
    .toBe(false);

  // 8) The served-queues report (period totals of status='done') renders.
  await gotoApp(page, 'served_queues.php');
  await expect(page.locator('h1', { hasText: 'SERVED QUEUES REPORT' })).toBeVisible();
});