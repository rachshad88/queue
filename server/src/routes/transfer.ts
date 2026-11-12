import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { departments, queue, users } from '../db';
import { queueUpdated } from '../realtime';
import { resolveCurrentPatient } from '../services/currentPatient';
import { operatorServeLock } from '../services/locks';
import { attachIssuerNames } from '../services/lookups';
import { ACTIVE_STATUSES, categoryRank, numberForArrival, queuePrefixes, randomTicketNumber, tierForNumber } from '../services/numbers';
import { claimAndServe, isPooledDept, ownWaitingCount, poolDepartmentNames, pooledWaitingRows } from '../services/pool';
import { logQueueAction } from '../services/queueLog';
import { operatorSection } from '../services/stations';
import { finishFirst, finishFirstMessage } from '../services/unattended';
import { clientIp, isInactive, num, str, trimmed } from '../util';
import type { Category } from '../db';

export const transferRouter = Router();

/** Move the operator's current serving patient to another department. */
transferRouter.post('/transfer', async (req, res) => {
  const s = req.session;
  const userId = s.user_id ?? 0;
  const sourceDept = s.department_id ?? 0;
  const targetDept = num(req.body?.department_id);
  const ip = clientIp(req);

  if (!sourceDept || !targetDept) {
    res.json({ success: false, message: 'Invalid department' });
    return;
  }
  if (sourceDept === targetDept) {
    res.json({ success: false, message: 'Cannot transfer to the same department' });
    return;
  }
  const target = await departments().findOne({ _id: targetDept });
  if (!target) {
    res.json({ success: false, message: 'That department does not exist.' });
    return;
  }
  if (isInactive(target.status)) {
    res.json({ success: false, message: 'Target department is inactive' });
    return;
  }

  // Resolved through the same service as the Now Serving tile and the
  // Transfer modal, so the target list and this refusal cannot disagree.
  const row = await resolveCurrentPatient(sourceDept, userId);
  if (!row) {
    res.json({ success: false, message: 'No patient currently being served' });
    return;
  }
  // A dental number called from the waiting console stays in dental, so the
  // patient's real department can already be the target.
  if (row.department_id === targetDept) {
    res.json({ success: false, message: `This patient is already in ${target.name || 'that department'}. Pick another department.` });
    return;
  }

  // Category: E- stays emergency, P- stays priority. A regular ticket is
  // promoted to priority only when the LABORATORY sends it to CLINIC 1/2/3
  // or ADMISSION.
  const allDepts = await departments().find().toArray();
  const keepIds = allDepts.filter((d) => ['CLINIC 1', 'CLINIC 2', 'CLINIC 3', 'ADMISSION'].includes(d.name.trim().toUpperCase())).map((d) => d._id);
  const labId = allDepts.find((d) => d.name.trim().toUpperCase() === 'LABORATORY' && !isInactive(d.status))?._id ?? 0;
  const tier = tierForNumber(row.queue_number);
  let category: Category = 'regular';
  if (tier === 'e') {
    category = 'emergency';
  } else if (tier === 'p' || (sourceDept === labId && keepIds.includes(targetDept))) {
    category = 'priority';
  }

  let arrivalNumber: string;
  try {
    arrivalNumber = await numberForArrival(targetDept, row.queue_number, row.id);
  } catch {
    res.json({ success: false, message: `${target.name} has no free ticket numbers left.` });
    return;
  }

  const at = new Date();
  const moved = await queue().updateOne(
    { _id: row.id, status: 'serving', served_by: userId },
    {
      $set: {
        department_id: targetDept,
        queue_number: arrivalNumber,
        status: 'waiting',
        served_by: null,
        section_id: null,
        category,
        category_rank: categoryRank(category),
        transferred_at: at,
        arrival_at: at,
      },
    },
  );
  if (moved.modifiedCount !== 1) {
    res.json({ success: false, message: 'No patient currently being served' });
    return;
  }

  const actualSource = row.department_id;
  await logQueueAction(ip, row.id, row.queue_number, actualSource, userId, 'transferred_out', targetDept, 'serving', 'waiting');
  await logQueueAction(ip, row.id, arrivalNumber, targetDept, userId, 'transferred_in', actualSource, 'waiting', 'waiting');
  for (const dept of new Set([actualSource, targetDept, sourceDept])) {
    queueUpdated(dept);
  }

  const renumbered = arrivalNumber !== row.queue_number;
  res.json({
    success: true,
    queue_code: row.queue_number,
    renumbered_to: renumbered ? arrivalNumber : null,
    message: renumbered
      ? `${row.queue_number} transferred to ${target.name} as ${arrivalNumber}, because ${row.queue_number} was already taken there. Tell the patient their new number.`
      : 'Patient transferred successfully',
  });
});

/** LABORATORY only: re-queue a returning patient by the return code on their ticket. */
transferRouter.post('/prioritize', async (req, res) => {
  const s = req.session;
  const userId = s.user_id ?? 0;
  const currentDept = s.department_id ?? 0;
  const returnCode = (trimmed(req.body?.code) || trimmed(req.body?.queue_number)).toUpperCase();
  const ip = clientIp(req);

  if (!currentDept) {
    res.json({ success: false, message: 'No department assigned' });
    return;
  }
  const dept = await departments().findOne({ _id: currentDept });
  if (!dept || !/laborat/i.test(dept.name)) {
    res.json({ success: false, message: 'Only the LABORATORY department can prioritize queues' });
    return;
  }
  if (returnCode === '') {
    res.json({ success: false, message: 'Return code is required' });
    return;
  }

  const row = await queue().findOne({ return_code: returnCode }, { sort: { created_at: -1 } });
  if (!row) {
    res.json({ success: false, message: 'Return code not found. Check the code printed on the ticket.' });
    return;
  }
  const oldDept = row.department_id;
  const oldStatus = row.status;
  if (oldStatus === 'serving') {
    res.json({ success: false, message: 'That ticket is currently being served and cannot be moved' });
    return;
  }
  if ((oldStatus === 'waiting' || oldStatus === 'hold') && oldDept === currentDept) {
    res.json({ success: false, message: 'That ticket is already waiting in this department' });
    return;
  }

  const [regular, priority, emergency] = await queuePrefixes(currentDept);
  const tier = tierForNumber(row.queue_number);
  const category: Category = tier === 'e' ? 'emergency' : 'priority';
  const prefix = tier === 'e' ? emergency : tier === 'p' ? priority : regular;

  // Keep the printed number when it is free here; otherwise draw a random one.
  let newNumber: string | null = null;
  const match = /^([A-Z]+)-(\d+)$/.exec(row.queue_number);
  if (match) {
    const candidate = match[1].toUpperCase() === prefix ? row.queue_number : `${prefix}-${match[2]}`;
    const taken = await queue().countDocuments({ department_id: currentDept, queue_number: candidate, status: { $in: [...ACTIVE_STATUSES] }, _id: { $ne: row._id } }, { limit: 1 });
    if (taken === 0) {
      newNumber = candidate;
    }
  }
  if (newNumber === null) {
    try {
      newNumber = await randomTicketNumber(currentDept, prefix);
    } catch {
      res.json({ success: false, message: 'Failed to prioritize queue' });
      return;
    }
  }

  const at = new Date();
  const moved = await queue().updateOne(
    { _id: row._id, status: oldStatus },
    { $set: { department_id: currentDept, queue_number: newNumber, status: 'waiting', served_by: null, section_id: null, category, category_rank: categoryRank(category), transferred_at: at, arrival_at: at } },
  );
  if (moved.modifiedCount !== 1) {
    res.json({ success: false, message: 'That ticket was just changed by someone else. Try again.' });
    return;
  }

  await logQueueAction(ip, row._id, newNumber, oldDept, userId, 'prioritized_out', currentDept, oldStatus, 'waiting');
  await logQueueAction(ip, row._id, newNumber, currentDept, userId, 'prioritized_in', oldDept, 'waiting', 'waiting');
  queueUpdated(oldDept);
  queueUpdated(currentDept);

  res.json({ success: true, queue_number: newNumber, message: `Returnee re-queued as ${newNumber} (${category})` });
});

/** The Mutual Help panel: waiting patients of the other pooled clinics. */
transferRouter.get('/pool-waiting', async (req, res) => {
  const myDept = req.session.department_id ?? 0;
  if (!isPooledDept(myDept)) {
    res.json({ success: false, message: 'Not a pooled clinic department.', pool: [] });
    return;
  }
  const byDept = new Map<number, { id: number; name: string; rows: Record<string, unknown>[] }>();
  for (const [id, name] of await poolDepartmentNames(myDept)) {
    byDept.set(id, { id, name, rows: [] });
  }
  const rows = await attachIssuerNames(await pooledWaitingRows(myDept));
  for (const r of rows) {
    byDept.get(r.department_id)?.rows.push({
      id: r._id,
      queue_number: r.queue_number,
      category: r.category ?? 'regular',
      status: r.status,
      created_at: r.created_at,
      transferred_at: r.transferred_at,
      created_by: r.created_by,
      issued_by_name: r.issued_by_name,
    });
  }
  const pool = [...byDept.values()].filter((d) => d.rows.length > 0);
  const myWaiting = await ownWaitingCount(myDept);

  res.json({
    success: true,
    mine_free: myWaiting === 0,
    mine_waiting: myWaiting,
    pool,
  });
});

/** Pull one patient from another pooled clinic (password-confirmed). */
transferRouter.post('/serve-pool', async (req, res) => {
  const s = req.session;
  const userId = s.user_id ?? 0;
  const myDept = s.department_id ?? 0;
  const otherDept = num(req.body?.department_id);
  const queueId = num(req.body?.queue_id);
  const password = str(req.body?.password);

  if (!isPooledDept(myDept)) {
    res.json({ success: false, message: 'Access denied for this department' });
    return;
  }
  if (!otherDept || !queueId) {
    res.json({ success: false, message: 'Invalid request' });
    return;
  }
  if (otherDept === myDept) {
    res.json({ success: false, message: 'Cannot pull from your own department' });
    return;
  }
  if (!isPooledDept(otherDept)) {
    res.json({ success: false, message: 'That department is not part of the clinic pool' });
    return;
  }
  const other = await departments().findOne({ _id: otherDept });
  if (!other || isInactive(other.status)) {
    res.json({ success: false, message: 'Source clinic is inactive' });
    return;
  }
  if (password === '') {
    res.json({ success: false, message: 'Password required to pull a patient.' });
    return;
  }
  const me = await users().findOne({ _id: userId }, { projection: { password: 1 } });
  if (!me || !(await bcrypt.compare(password, me.password))) {
    res.json({ success: false, message: 'Invalid password.' });
    return;
  }

  const blocked = await finishFirstMessage(userId, myDept);
  if (blocked) {
    res.json({ success: false, message: blocked });
    return;
  }

  const result = await operatorServeLock(userId, async () => {
    const busy = await queue().findOne({ served_by: userId, status: 'serving' }, { projection: { queue_number: 1 } });
    if (busy) {
      return { success: false, message: finishFirst(busy.queue_number) };
    }
    // "Serve your own queue first", enforced server-side inside the lock.
    const ownWaiting = await ownWaitingCount(myDept);
    if (ownWaiting > 0) {
      return { success: false, message: `Your clinic still has ${ownWaiting} waiting. Serve them first.` };
    }
    const section = await operatorSection(s, userId, myDept);
    const claimed = await claimAndServe(myDept, otherDept, queueId, userId, section?.section_name ?? null, clientIp(req));
    if (!claimed) {
      return { success: false, message: 'Someone already took this patient, or it is no longer waiting.' };
    }
    const renumbered = claimed.queue_number !== claimed.original_number;
    return {
      success: true,
      queue_number: claimed.queue_number,
      message: renumbered
        ? `Now serving ${claimed.original_number} (pulled from another clinic) as ${claimed.queue_number}, because ${claimed.original_number} was already taken here. Tell the patient their new number.`
        : `Now serving ${claimed.queue_number} (pulled from another clinic)`,
    };
  });
  res.json(result);
});
