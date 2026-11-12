import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import type { Filter } from 'mongodb';
import { config } from '../config';
import { departments, isDuplicateKey, queue, queueLog, users, type DepartmentDoc, type QueueDoc } from '../db';
import { emit, queueUpdated, serveUpdate } from '../realtime';
import { dentalDepartment, DENTAL_NUMBER, isDentalIssuedNumber, isPlainQueueNumber, resolveCurrentPatient, scopeDepartments } from '../services/currentPatient';
import { operatorServeLock } from '../services/locks';
import { attachIssuerNames, departmentNames, waitingCountsByDepartment } from '../services/lookups';
import { claimAndServe, isPooledDept, pooledWaitingRows, SERVE_ORDER, todaysQueue } from '../services/pool';
import { logQueueAction, returningIds } from '../services/queueLog';
import { stampActivity } from '../services/singleLogin';
import { isSectionedDept, markSectionActivity, markSectionOccupied, operatorSection, sectionKindForDept, sectionRoster } from '../services/stations';
import { finishFirst, finishFirstMessage, isUnattended, unattendedServing } from '../services/unattended';
import { manilaDayStart } from '../time';
import { clientIp, isInactive, num, sortDepartments, str, trimmed } from '../util';

export const queueRouter = Router();

const departmentName = async (id: number): Promise<string> => (await departments().findOne({ _id: id }, { projection: { name: 1 } }))?.name ?? '';

async function activeDepartments(): Promise<DepartmentDoc[]> {
  return sortDepartments((await departments().find().toArray()).filter((d) => !isInactive(d.status)));
}

function initialsOf(username: string): string {
  const parts = username.split(' ');
  return username === '' ? '' : ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Destination tiles holding the shortest queue. Only available targets count;
 * tagged only when something sits above the minimum and at most two share it.
 */
function shortestTransferIds(targets: { id: number; disabled: boolean }[], counts: Record<number, number>): number[] {
  const waiting = targets.filter((t) => !t.disabled).map((t) => ({ id: t.id, n: counts[t.id] ?? 0 }));
  if (waiting.length < 2) {
    return [];
  }
  const min = Math.min(...waiting.map((w) => w.n));
  if (Math.max(...waiting.map((w) => w.n)) === min) {
    return [];
  }
  const shortest = waiting.filter((w) => w.n === min).map((w) => w.id);
  return shortest.length <= 2 ? shortest : [];
}

/** Console page data: department, window, takeover picker and the transfer modal's fallback list. */
queueRouter.get('/console', async (req, res) => {
  const s = req.session;
  const deptId = s.department_id ?? 0;
  const userId = s.user_id ?? 0;
  const isSuperadmin = !!s.is_superadmin;

  const dept = deptId > 0 ? await departments().findOne({ _id: deptId }) : null;
  const deptName = dept?.name ?? '';

  // Heartbeat: keep this staffer's window from being reaped while they work.
  await markSectionActivity(userId);

  const kind = sectionKindForDept(deptId, deptName);
  const window = kind ? await operatorSection(s, userId, deptId) : null;
  const all = await activeDepartments();

  const current = await resolveCurrentPatient(deptId, userId);
  const dental = await dentalDepartment();
  const dentalBlocked = current !== null && dental !== null && isPlainQueueNumber(current.queue_number);
  const counts = await waitingCountsByDepartment();
  const transferTargets = all
    .filter((d) => current === null || d._id !== current.department_id)
    .map((d) => ({ id: d._id, name: d.name, server: d.server, waiting: counts[d._id] ?? 0, disabled: dentalBlocked && d._id === dental!._id }));

  // Change-password prompt: shown once per login.
  let showChangePw = false;
  if (s.default_pw === true && !s.default_pw_shown) {
    s.default_pw_shown = true;
    showChangePw = true;
  }

  res.json({
    user_id: userId,
    department_id: deptId,
    department_name: deptName,
    department_server: dept?.server ?? '',
    username: s.username ?? '',
    usertype: s.usertype ?? '',
    initials: initialsOf(s.username ?? ''),
    is_superadmin: isSuperadmin,
    sectioned: kind !== null,
    section_kind: kind,
    active_window: window?.section_name ?? null,
    takeover_section_id: s.takeover_section_id ?? null,
    takeover_sections: kind && isSuperadmin ? await sectionRoster(kind) : [],
    // Takeover dropdown: superadmins may pick any department, staff see the others.
    departments: all.filter((d) => isSuperadmin || d._id !== deptId).map((d) => ({ id: d._id, name: d.name, server: d.server })),
    transfer_departments: transferTargets,
    transfer_shortest_ids: shortestTransferIds(transferTargets, counts),
    transfer_subject: current ? `Moving ${current.queue_number} from ${current.department_name || 'their department'}` : 'No patient is currently being served.',
    dental_department_id: dental?._id ?? null,
    in_pool_clinic: isPooledDept(deptId),
    is_laboratory: /laborat/i.test(deptName),
    show_change_pw: showChangePw,
  });
});

interface QueueRow {
  id: number;
  queue_number: string;
  status: string;
  served_by: number | null;
  category: string;
  department_name: string;
  created_by: number | null;
  created_at: Date;
  transferred_at: Date | null;
}

const toRow = (q: QueueDoc, deptName: string, servedBy: number | null = q.served_by): QueueRow => ({
  id: q._id,
  queue_number: q.queue_number,
  status: q.status,
  served_by: servedBy,
  category: q.category ?? 'regular',
  department_name: deptName,
  created_by: q.created_by,
  created_at: q.created_at,
  transferred_at: q.transferred_at,
});

/**
 * Where a transferred-in row came FROM and, for a ticket that left this
 * console and came back, where it went TO. The most recent trip wins.
 */
async function transferProvenance(queueIds: number[], departmentId: number): Promise<{ from: Record<number, string>; to: Record<number, string> }> {
  if (queueIds.length === 0) {
    return { from: {}, to: {} };
  }
  const logs = await queueLog()
    .find({ department_id: departmentId, queue_id: { $in: queueIds }, action: { $in: ['transferred_in', 'transferred_out'] } })
    .sort({ created_at: 1, _id: 1 })
    .toArray();
  const fromIds: Record<number, number> = {};
  const toIds: Record<number, number> = {};
  for (const log of logs) {
    (log.action === 'transferred_in' ? fromIds : toIds)[log.queue_id] = log.old_department_id ?? 0;
  }
  const names = await departmentNames([...Object.values(fromIds), ...Object.values(toIds)]);
  const named = (ids: Record<number, number>) => Object.fromEntries(Object.entries(ids).filter(([, d]) => names[d]).map(([q, d]) => [q, names[d]]));
  return { from: named(fromIds), to: named(toIds) };
}

/**
 * Who Serve Next would hand this console right now, read-only. Mirrors the
 * claim's stages and scope: own department, the dental fallback for the
 * waiting area, then the mutual-help pool.
 */
async function resolveNextUp(departmentId: number) {
  const payload = async (row: QueueDoc, source: string) => ({
    id: row._id,
    queue_number: row.queue_number,
    category: row.category ?? 'regular',
    source,
    department_id: row.department_id,
    department_name: await departmentName(row.department_id),
  });

  const own = await queue().findOne({ department_id: departmentId, status: 'waiting', ...todaysQueue() }, { sort: SERVE_ORDER });
  if (own) {
    return payload(own, 'own');
  }
  if (departmentId === config.waitingDeptId) {
    const dental = await dentalDepartment();
    const row = dental
      ? await queue().findOne({ department_id: dental._id, status: 'waiting', queue_number: DENTAL_NUMBER, ...todaysQueue() }, { sort: SERVE_ORDER })
      : null;
    if (row) {
      return payload(row, 'dental');
    }
  }
  if (isPooledDept(departmentId)) {
    const [first] = await pooledWaitingRows(departmentId);
    if (first) {
      return payload(first, 'pool');
    }
  }
  return null;
}

/** Polling endpoint: the live queue for one department plus the day's figures. */
queueRouter.get('/queue', async (req, res) => {
  const s = req.session;
  const sessionUserId = s.user_id ?? 0;
  const departmentId = num(req.query.department_id);
  const userId = num(req.query.user_id);
  const isSuperadmin = !!s.is_superadmin;

  // Unless superadmin, users may only query their own queue and department.
  if (!isSuperadmin && userId && userId !== sessionUserId) {
    res.json({ success: false, message: 'Access denied' });
    return;
  }
  if (!departmentId) {
    res.json({ success: false, message: 'Department ID is required.' });
    return;
  }
  if (!isSuperadmin && departmentId !== (s.department_id ?? 0)) {
    res.json({ success: false, message: 'Access denied' });
    return;
  }

  const deptName = await departmentName(departmentId);
  const today = todaysQueue();
  const operatorId = userId || sessionUserId;

  // The table is TODAY's live queue only: waiting, serving and on hold.
  // Tickets left from an earlier day are not shown. A patient still being
  // served stays reachable through the Now Serving tile, and patients whose
  // staffer signed out mid-serve are always listed, since both need someone
  // here to finish them.
  const unattended = await unattendedServing(await scopeDepartments(departmentId));
  const unattendedNames = new Map(unattended.map((u) => [u._id, u.served_by_name]));

  let rows: QueueRow[];
  if (isSectionedDept(departmentId)) {
    const serving = await queue().find({ department_id: departmentId, served_by: operatorId, status: 'serving', ...today }).toArray();
    const waiting = await queue().find({ department_id: departmentId, status: { $in: ['waiting', 'hold'] }, ...today }).sort(SERVE_ORDER).toArray();
    rows = [...serving.map((q) => toRow(q, deptName, operatorId)), ...waiting.map((q) => toRow(q, deptName, null))];
  } else {
    const live = await queue().find({ department_id: departmentId, status: { $in: ['waiting', 'serving', 'hold'] }, ...today }).toArray();
    const servingRows = live.filter((q) => q.status === 'serving').sort((a, b) => b.arrival_at.getTime() - a.arrival_at.getTime());
    const rest = live
      .filter((q) => q.status !== 'serving')
      .sort((a, b) => a.category_rank - b.category_rank || a.arrival_at.getTime() - b.arrival_at.getTime() || a._id - b._id);
    rows = [...servingRows, ...rest].map((q) => toRow(q, deptName));
  }
  const listed = new Set(rows.map((r) => r.id));
  const extraNames = await departmentNames(unattended.map((u) => u.department_id));
  rows = [...unattended.filter((u) => !listed.has(u._id)).map((u) => toRow(u, extraNames[u.department_id] ?? deptName)), ...rows];

  const ids = rows.map((r) => r.id);
  const [withIssuers, returning, provenance] = await Promise.all([attachIssuerNames(rows), returningIds(ids), transferProvenance(ids, departmentId)]);
  const queues = withIssuers.map((r) => ({
    ...r,
    is_returning: returning.has(r.id),
    transferred_from_name: provenance.from[r.id] ?? null,
    transferred_to_name: provenance.to[r.id] ?? null,
    unattended: unattendedNames.has(r.id),
    unattended_by_name: unattendedNames.get(r.id) ?? null,
  }));

  const dayStart = manilaDayStart();
  const [waitingTotal, finishedToday, loggedHereToday, arrivedHereToday] = await Promise.all([
    queue().countDocuments({ department_id: departmentId, status: 'waiting', ...today }),
    queue().countDocuments({ department_id: departmentId, status: 'done', created_at: { $gte: dayStart } }),
    queueLog().distinct('queue_id', { department_id: departmentId, created_at: { $gte: dayStart } }),
    queue().distinct('_id', { department_id: departmentId, $or: [{ created_at: { $gte: dayStart } }, { transferred_at: { $gte: dayStart } }] }),
  ]);
  // Every ticket that passed through this queue today: issued or transferred
  // here, or acted on here before moving on. Transfers out do not lower it.
  const patientsToday = new Set([...loggedHereToday, ...arrivedHereToday]).size;

  const current = await resolveCurrentPatient(departmentId, operatorId);
  const dental = await dentalDepartment();
  const window = sectionKindForDept(departmentId, deptName) ? await operatorSection(s, sessionUserId, departmentId) : null;

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    department_name: deptName,
    queues,
    waiting_total: waitingTotal,
    patients_today: patientsToday,
    finished_today: finishedToday,
    serving_queue_number: current?.queue_number ?? null,
    serving_row_id: current?.id ?? null,
    serving_department_id: current?.department_id ?? null,
    serving_department_name: current?.department_name || null,
    dental_department_id: dental?._id ?? null,
    next_up: await resolveNextUp(departmentId),
    active_window: window?.section_name ?? null,
  });
});

/** Claim the next waiting patient of one department, urgency first then arrival; `sectionId` is the window they are called to. */
async function claimNext(filter: Filter<QueueDoc>, userId: number, sectionId: number | null = null): Promise<QueueDoc | null> {
  try {
    return await queue().findOneAndUpdate(
      { ...filter, status: 'waiting' },
      { $set: { status: 'serving', served_by: userId, served_at: new Date(), section_id: sectionId } },
      { sort: SERVE_ORDER, returnDocument: 'after' },
    );
  } catch (error) {
    // The unique serving index refused it: this operator already holds a row.
    if (isDuplicateKey(error)) {
      return null;
    }
    throw error;
  }
}

/** Retire the operator's serving rows; returns the rows actually closed. */
async function finishServingRows(filter: Filter<QueueDoc>): Promise<QueueDoc[]> {
  const finished: QueueDoc[] = [];
  for (const row of await queue().find({ ...filter, status: 'serving' }).toArray()) {
    const result = await queue().updateOne({ _id: row._id, status: 'serving' }, { $set: { status: 'done' } });
    if (result.modifiedCount === 1) {
      finished.push(row);
    }
  }
  return finished;
}

queueRouter.post('/serve-next', async (req, res) => {
  const s = req.session;
  const servedBy = s.user_id ?? 0;
  const departmentId = num(req.body?.department_id);
  const isSuperadmin = !!s.is_superadmin;
  const ip = clientIp(req);

  if (servedBy > 0) {
    await stampActivity(servedBy, ip);
  }
  if (!servedBy || !departmentId) {
    res.json({ success: false, message: 'Invalid department or user.' });
    return;
  }
  if (!isSuperadmin && (s.department_id ?? 0) !== departmentId) {
    res.json({ success: false, message: 'Access denied for this department.' });
    return;
  }

  const result = await operatorServeLock(servedBy, async () => {
    const today = todaysQueue();
    const emptyMessage = 'No patients waiting today.';

    if (isSectionedDept(departmentId)) {
      const isWaiting = departmentId === config.waitingDeptId;
      const kind = isWaiting ? 'waiting' : 'admission';
      const label = isWaiting ? 'waiting section' : 'admission section';
      const section = await operatorSection(s, servedBy, departmentId);
      if (!section) {
        return { success: false, message: isSuperadmin ? `Select a ${label} window first.` : `Not assigned to ${label}.` };
      }

      const current = await resolveCurrentPatient(departmentId, servedBy);
      if (current) {
        // Re-stamp the window: it may have been released while this row is still being served.
        await markSectionOccupied(section.section_id, servedBy, kind, ip);
        await queue().updateOne({ _id: current.id, status: 'serving', served_by: servedBy }, { $set: { section_id: section.section_id } });
        return { success: false, queue_number: current.queue_number, message: finishFirst(current.queue_number) };
      }
      const elsewhere = await finishFirstMessage(servedBy, departmentId);
      if (elsewhere) {
        return { success: false, message: elsewhere };
      }

      // Every window serves every category, urgency first, FIFO within tier.
      let row = await claimNext({ department_id: departmentId, ...today }, servedBy, section.section_id);
      // Waiting-area fallback: the oldest dental-issued patient. The row stays
      // in the dental department; the operator's window is still recorded.
      if (!row && isWaiting) {
        const dental = await dentalDepartment();
        row = dental ? await claimNext({ department_id: dental._id, queue_number: DENTAL_NUMBER, ...today }, servedBy, section.section_id) : null;
      }
      if (!row) {
        return { success: false, message: emptyMessage };
      }
      await markSectionOccupied(section.section_id, servedBy, kind, ip);
      await logQueueAction(ip, row._id, row.queue_number, row.department_id, servedBy, 'serving', null, 'waiting', 'serving');
      serveUpdate(departmentId, servedBy, section.section_id, row.queue_number, section.section_name);
      return { success: true, queue_number: row.queue_number, ...(row.department_id !== departmentId ? { department_id: row.department_id } : {}) };
    }

    // One patient at a time: the current one must be finished or transferred first.
    const blocked = await finishFirstMessage(servedBy, departmentId);
    if (blocked) {
      return { success: false, message: blocked };
    }
    const deptName = await departmentName(departmentId);
    const row = await claimNext({ department_id: departmentId, ...today }, servedBy);
    if (row) {
      await logQueueAction(ip, row._id, row.queue_number, departmentId, servedBy, 'serving', null, 'waiting', 'serving');
      serveUpdate(departmentId, servedBy, null, row.queue_number, deptName);
      return { success: true, queue_number: row.queue_number };
    }

    // Cross-clinic mutual help: nobody of our own waiting today, so take the
    // most urgent, longest-waiting patient across the other pooled clinics.
    for (const pick of isPooledDept(departmentId) ? await pooledWaitingRows(departmentId) : []) {
      const claimed = await claimAndServe(departmentId, pick.department_id, pick._id, servedBy, deptName, ip);
      if (claimed) {
        const renumbered = claimed.queue_number !== claimed.original_number;
        return {
          success: true,
          queue_number: claimed.queue_number,
          pool: true,
          ...(renumbered
            ? { message: `Now serving ${claimed.original_number} (from another clinic) as ${claimed.queue_number}, because ${claimed.original_number} was already taken here. Tell the patient their new number.` }
            : {}),
        };
      }
    }
    return { success: false, message: emptyMessage };
  });

  res.json(result);
});

queueRouter.post('/finish', async (req, res) => {
  const s = req.session;
  const departmentId = num(req.body?.department_id);
  const servedBy = s.user_id ?? 0;
  const ip = clientIp(req);

  if (!servedBy) {
    res.json({ success: false, message: 'Not logged in' });
    return;
  }
  if (!departmentId) {
    res.json({ success: false, message: 'Invalid department' });
    return;
  }
  if (!s.is_superadmin && (s.department_id ?? 0) !== departmentId) {
    res.json({ success: false, message: 'Access denied for this department' });
    return;
  }

  // Resolved across the console's merged lane, so a dental patient called
  // from the waiting console can be finished from it.
  const scope = await scopeDepartments(departmentId);
  const finished = await finishServingRows({ department_id: { $in: scope }, served_by: servedBy });
  if (finished.length === 0) {
    res.json({ success: false, message: 'Nothing is currently being served.' });
    return;
  }
  for (const row of finished) {
    await logQueueAction(ip, row._id, row.queue_number, row.department_id, servedBy, 'finished', null, 'serving', 'done');
  }
  for (const dept of new Set([departmentId, ...finished.map((r) => r.department_id)])) {
    queueUpdated(dept);
  }
  res.json({ success: true, message: 'Queue marked as done.' });
});

/**
 * Approval gate for the row-level "Serve" action: the submitted password must
 * match an active physician (CLINIC 1-4) or an admin account.
 */
async function verifyServeApproval(password: string): Promise<{ ok: boolean; error?: string }> {
  if (password === '') {
    return { ok: false, error: 'Physician/Admin approval required' };
  }
  const allDepts = await departments().find().toArray();
  const physicianDepts = allDepts.filter((d) => /^CLINIC [1-4]$/.test(d.name.trim().toUpperCase())).map((d) => d._id);
  if (physicianDepts.length === 0) {
    return { ok: false, error: 'No physician departments configured' };
  }
  const inactiveDepts = new Set(allDepts.filter((d) => isInactive(d.status)).map((d) => d._id));
  const approvers = (await users().find({ status: 'active' }, { projection: { password: 1, department_id: 1, usertype: 1 } }).toArray()).filter(
    (u) =>
      !(u.department_id != null && inactiveDepts.has(u.department_id)) &&
      ((u.department_id != null && physicianDepts.includes(u.department_id)) || ['admin', 'superadmin'].includes(u.usertype.toLowerCase())),
  );
  if (approvers.length === 0) {
    return { ok: false, error: 'Approval check failed' };
  }
  for (const approver of approvers) {
    if (approver.password && (await bcrypt.compare(password, approver.password))) {
      return { ok: true };
    }
  }
  return { ok: false, error: 'Invalid credentials' };
}

/**
 * A colleague's decision on a patient whose staffer signed out mid-serve:
 * continue serving them here, or put them back in the queue in their original place.
 */
async function resolveUnattended(req: Request, row: QueueDoc, action: 'takeover' | 'return'): Promise<Record<string, unknown>> {
  const s = req.session;
  const departmentId = s.department_id ?? 0;
  const userId = s.user_id ?? 0;
  const ip = clientIp(req);
  const stale = { success: false, message: `${row.queue_number} is no longer unattended. Their staffer may be back; refresh the queue.` };
  if (!(await isUnattended(row))) {
    return stale;
  }

  if (action === 'return') {
    // arrival_at is untouched, so the patient keeps their place in line.
    const updated = await queue().updateOne({ _id: row._id, status: 'serving', served_by: row.served_by }, { $set: { status: 'waiting', served_by: null, section_id: null } });
    if (updated.modifiedCount !== 1) {
      return stale;
    }
    await logQueueAction(ip, row._id, row.queue_number, row.department_id, userId, 'returned_to_queue', null, 'serving', 'waiting');
    for (const dept of new Set([departmentId, row.department_id])) {
      queueUpdated(dept);
    }
    return { success: true, queue_number: row.queue_number, action, message: `${row.queue_number} is back in the queue in their original place.` };
  }

  const kind = sectionKindForDept(departmentId);
  const window = kind ? await operatorSection(s, userId, departmentId) : null;
  if (kind && !window) {
    return { success: false, message: 'Choose your window before taking over a patient.' };
  }
  const blocked = await finishFirstMessage(userId, departmentId);
  if (blocked) {
    return { success: false, message: blocked };
  }
  const busyMessage = 'Finish or transfer your current patient before taking over another.';
  const outcome = await operatorServeLock(userId, async () => {
    if ((await queue().countDocuments({ served_by: userId, status: 'serving' }, { limit: 1 })) > 0) {
      return busyMessage;
    }
    try {
      const updated = await queue().updateOne({ _id: row._id, status: 'serving', served_by: row.served_by }, { $set: { served_by: userId, section_id: window?.section_id ?? null } });
      return updated.modifiedCount === 1 ? null : stale.message;
    } catch (error) {
      if (isDuplicateKey(error)) {
        return busyMessage;
      }
      throw error;
    }
  });
  if (outcome !== null) {
    return { success: false, message: outcome };
  }
  await logQueueAction(ip, row._id, row.queue_number, row.department_id, userId, 'taken_over', null, 'serving', 'serving');
  if (kind && window) {
    // The patient has to walk to this window, so the wall announces it.
    await markSectionOccupied(window.section_id, userId, kind, ip);
    serveUpdate(departmentId, userId, window.section_id, row.queue_number, window.section_name);
  } else {
    // Same room, same number: refresh the walls without calling the patient again.
    queueUpdated(departmentId);
  }
  if (row.department_id !== departmentId) {
    queueUpdated(row.department_id);
  }
  return { success: true, queue_number: row.queue_number, action, message: `You are now serving ${row.queue_number}.` };
}

/** Row actions: serve (approved) / hold / unhold / remove, and takeover / return for unattended patients. */
queueRouter.post('/queue-action', async (req, res) => {
  const s = req.session;
  const departmentId = s.department_id ?? 0;
  const userId = s.user_id ?? 0;
  const isSuperadmin = !!s.is_superadmin;
  const action = trimmed(req.body?.action).toLowerCase();
  const queueId = num(req.body?.queue_id);
  const ip = clientIp(req);

  if (!['serve', 'hold', 'unhold', 'remove', 'takeover', 'return'].includes(action)) {
    res.json({ success: false, message: 'Invalid action' });
    return;
  }
  if (!queueId) {
    res.json({ success: false, message: 'Queue ID is required' });
    return;
  }

  // The waiting-area console merges the dental lane, so a row may live in
  // either department there. A cross-department row is only actionable when
  // it carries a dental-issued number.
  const scope = await scopeDepartments(departmentId);
  const row = await queue().findOne({ _id: queueId, department_id: { $in: scope } });
  if (!row || (row.department_id !== departmentId && !isDentalIssuedNumber(row.queue_number))) {
    res.json({ success: false, message: 'Queue not found in this department' });
    return;
  }

  const current = row.status;
  const sectioned = isSectionedDept(departmentId);
  const done = (payload: Record<string, unknown>) => res.json(payload);

  if (action === 'takeover' || action === 'return') {
    return done(await resolveUnattended(req, row, action));
  }

  if (action === 'serve') {
    if (current !== 'waiting') {
      return done({ success: false, message: 'Only waiting queues can be served' });
    }
    const servingWindow = sectioned ? await operatorSection(s, userId, departmentId) : null;
    if (sectioned && !servingWindow) {
      return done({ success: false, message: 'Not assigned to a section.' });
    }
    if (!row.arrival_at || row.arrival_at < manilaDayStart()) {
      return done({ success: false, message: 'This ticket is from an earlier day and can no longer be served.' });
    }
    const blocked = await finishFirstMessage(userId, departmentId);
    if (blocked) {
      return done({ success: false, message: blocked });
    }
    const approval = await verifyServeApproval(str(req.body?.approver_password));
    if (!approval.ok) {
      return done({ success: false, message: approval.error });
    }

    const outcome = await operatorServeLock(userId, async () => {
      const busy = await queue().findOne({ served_by: userId, status: 'serving' }, { projection: { queue_number: 1 } });
      if (busy) {
        return finishFirst(busy.queue_number);
      }
      try {
        const claimed = await queue().findOneAndUpdate(
          { _id: queueId, status: 'waiting' },
          { $set: { status: 'serving', served_by: userId, served_at: new Date(), section_id: servingWindow?.section_id ?? null } },
          { returnDocument: 'after' },
        );
        return claimed ? null : 'This patient was already taken.';
      } catch (error) {
        if (isDuplicateKey(error)) {
          return 'Finish or transfer your current patient before serving another.';
        }
        throw error;
      }
    });
    if (outcome !== null) {
      return done({ success: false, message: outcome });
    }
    await logQueueAction(ip, row._id, row.queue_number, row.department_id, userId, 'serve', null, current, 'serving');

    // Carry the number (and window label) so walls announce the serve immediately.
    const payload: Record<string, unknown> = { dept: departmentId, queue_number: row.queue_number };
    const kind = sectionKindForDept(departmentId);
    if (kind) {
      const window = await operatorSection(s, userId, departmentId);
      if (window) {
        await markSectionOccupied(window.section_id, userId, kind, ip);
        payload.section = window.section_name;
      }
    }
    emit('queue-updated', payload);
    return done({ success: true, queue_number: row.queue_number, action, message: 'Queue serve successful' });
  }

  let newStatus: 'hold' | 'waiting' | 'removed';
  if (action === 'hold') {
    // Holding another operator's live row would kick their patient off the window.
    if (current === 'serving' && !isSuperadmin && (row.served_by ?? 0) !== userId) {
      return done({ success: false, message: 'Only the serving operator can hold this queue' });
    }
    if (current !== 'waiting' && current !== 'serving') {
      return done({ success: false, message: 'Only waiting or serving queues can be held' });
    }
    newStatus = 'hold';
  } else if (action === 'unhold') {
    if (current !== 'hold') {
      return done({ success: false, message: 'Only held queues can be unheld' });
    }
    newStatus = 'waiting';
  } else {
    if (current !== 'waiting' && current !== 'hold') {
      return done({ success: false, message: 'Only waiting or held queues can be removed' });
    }
    newStatus = 'removed';
  }

  // Guarded on the status read above so a concurrent transition is not overwritten.
  const updated = await queue().updateOne({ _id: queueId, status: current }, { $set: { status: newStatus, served_by: null, section_id: null } });
  if (updated.modifiedCount !== 1) {
    return done({ success: false, message: 'This queue was just changed by someone else. Refresh and try again.' });
  }
  await logQueueAction(ip, row._id, row.queue_number, row.department_id, userId, action, null, current, newStatus);
  emit('queue-updated', { dept: departmentId });
  if (row.department_id !== departmentId) {
    queueUpdated(row.department_id);
  }
  const outcomeMessage = { hold: `${row.queue_number} is on hold.`, unhold: `${row.queue_number} is back in the queue.`, remove: `${row.queue_number} was removed from the queue.` }[action];
  return done({ success: true, queue_number: row.queue_number, action, message: outcomeMessage });
});

/** Re-broadcast the current number. Only the operator serving it may repeat it. */
queueRouter.post('/repeat-call', async (req, res) => {
  const s = req.session;
  const servedBy = s.user_id ?? 0;
  const departmentId = num(req.body?.department_id);
  const queueNumber = trimmed(req.body?.queue_number);

  if (!servedBy) {
    res.json({ success: false, message: 'Not logged in' });
    return;
  }
  if (!departmentId || queueNumber === '') {
    res.json({ success: false, message: 'department_id and queue_number are required' });
    return;
  }
  if (!s.is_superadmin) {
    if ((s.department_id ?? 0) !== departmentId) {
      res.json({ success: false, message: 'Access denied for this department.' });
      return;
    }
    const scope = await scopeDepartments(departmentId);
    const serving = await queue().countDocuments({ department_id: { $in: scope }, served_by: servedBy, queue_number: queueNumber, status: 'serving' }, { limit: 1 });
    if (serving === 0) {
      res.json({ success: false, message: 'Only the serving operator can repeat this call.' });
      return;
    }
  }

  emit('repeat-call', {
    dept: departmentId,
    department_id: departmentId,
    department_name: trimmed(req.body?.department_name),
    queue_number: queueNumber,
    user_id: servedBy,
  });
  res.json({ success: true });
});
