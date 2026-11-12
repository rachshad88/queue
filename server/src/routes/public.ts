import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { Router, type Request } from 'express';
import { config } from '../config';
import { departments, queue, sections, users, type Category, type DepartmentDoc, type QueueDoc } from '../db';
import { isRevoked, throttle } from '../middleware/auth';
import { queueUpdated } from '../realtime';
import { createTicket } from '../services/numbers';
import { SERVE_ORDER } from '../services/pool';
import { returningIds } from '../services/queueLog';
import { assertSingleLogin } from '../services/singleLogin';
import { scopeDepartments } from '../services/currentPatient';
import { sectionKindForDept, sectionRoster } from '../services/stations';
import { manilaDayStart } from '../time';
import { clientIp, isInactive, num, sortDepartments, str, trimmed } from '../util';

/**
 * Unauthenticated endpoints: ticket kiosks, the printable ticket and the
 * wall displays. Kiosks only enforce single-login when an operator session
 * happens to exist.
 */
export const publicRouter = Router();

const kioskThrottle = throttle('kiosk-issue', config.throttle.kiosk);

async function kioskSessionOk(req: Request): Promise<boolean> {
  const userId = req.session.user_id;
  if (userId && (await isRevoked(req))) {
    return true;
  }
  return !userId || assertSingleLogin(req.session, userId, req.session.usertype, clientIp(req));
}

const findDepartmentByKeyword = async (keyword: string): Promise<DepartmentDoc | null> =>
  departments().findOne({ name: new RegExp(keyword, 'i') }, { sort: { _id: 1 } });

/**
 * The kiosk's category choice. Absent means regular (the one-tap default);
 * anything other than an allowed value is a bad request, never a silent downgrade.
 */
function kioskCategory(value: unknown, allowed: readonly Category[]): Category | null {
  if (value === undefined || value === null || value === '') {
    return 'regular';
  }
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as Category) : null;
}

const ticketPayload = (row: QueueDoc) => ({ success: true, department_id: row.department_id, queue_number: row.queue_number, category: row.category, code: row.return_code });

/**
 * Waiting Area kiosk. Dental tickets queue in the Waiting Area too; only
 * their numbering differs (DR/DP/DE instead of R/P/E).
 */
publicRouter.post('/kiosk/waiting', kioskThrottle, async (req, res) => {
  if (!(await kioskSessionOk(req))) {
    res.status(401).json({ success: false, message: 'Logged in on another device', reason: 'another_device' });
    return;
  }
  // Test numbers are real tickets minted without a patient: superadmins only.
  // The gate is here, not the hidden button, because this endpoint is public.
  const isTest = !!req.body?.generate_test_number;
  if (isTest && !req.session.is_superadmin) {
    console.warn('waiting test number refused: not a superadmin', JSON.stringify({ user_id: req.session.user_id ?? null }));
    res.status(403).json({ success: false, message: 'Test numbers are for superadmins only.' });
    return;
  }

  const category = kioskCategory(req.body?.category, ['regular', 'priority', 'emergency']);
  const groupValue = req.body?.ticket_group ?? 'waiting';
  if (!category || (groupValue !== 'waiting' && groupValue !== 'dental')) {
    res.status(400).json({ success: false, message: 'Pick a ticket type from the kiosk buttons.' });
    return;
  }
  const group: 'waiting' | 'dental' = groupValue;
  const dept = await findDepartmentByKeyword('waiting');
  if (!dept) {
    console.error('waiting ticket issue failed: no waiting department found');
    res.status(500).json({ success: false, message: "Waiting department not found. Please configure a department with 'Waiting' in its name." });
    return;
  }
  if ((dept.status ?? 'active').trim().toLowerCase() !== 'active') {
    res.status(503).json({ success: false, message: 'The Waiting department is currently inactive.' });
    return;
  }

  try {
    const row = await createTicket({
      departmentId: dept._id,
      category,
      prefixKeyword: group === 'dental' ? 'dental' : null,
      // The staff account that took the ticket while logged in; null at a public kiosk.
      createdBy: req.session.user_id ?? null,
    });
    console.info(isTest ? 'waiting TEST number generated' : 'waiting ticket issued', JSON.stringify({ department_id: dept._id, group, queue_number: row.queue_number, category: row.category, user_id: req.session.user_id ?? null }));
    queueUpdated(dept._id);
    res.json(ticketPayload(row));
  } catch (error) {
    console.error('waiting ticket numbering failed', error);
    res.status(500).json({ success: false, message: 'Failed to issue ticket. Please try again.' });
  }
});

/** ABTC kiosk: regular or priority tickets for the department named ABTC. */
publicRouter.post('/kiosk/abtc', kioskThrottle, async (req, res) => {
  if (!(await kioskSessionOk(req))) {
    res.status(401).json({ success: false, message: 'Logged in on another device', reason: 'another_device' });
    return;
  }
  // ABTC issues regular and priority tickets only; there is no emergency lane.
  const category = kioskCategory(req.body?.category, ['regular', 'priority']);
  if (!category) {
    res.status(400).json({ success: false, message: 'Pick a ticket type from the kiosk buttons.' });
    return;
  }
  const dept = await findDepartmentByKeyword('abtc');
  if (!dept) {
    console.error('ABTC ticket issue failed: no ABTC department found');
    res.status(500).json({ success: false, message: "ABTC department not found. Please configure a department with 'ABTC' in its name." });
    return;
  }
  if ((dept.status ?? 'active').trim().toLowerCase() !== 'active') {
    res.status(503).json({ success: false, message: 'The ABTC department is currently inactive.' });
    return;
  }
  try {
    const row = await createTicket({
      departmentId: dept._id,
      category,
      createdBy: req.session.user_id ?? null,
    });
    console.info('ABTC ticket issued', JSON.stringify({ department_id: dept._id, queue_number: row.queue_number, category: row.category }));
    queueUpdated(dept._id);
    res.json(ticketPayload(row));
  } catch (error) {
    console.error('ABTC ticket numbering failed', error);
    res.status(500).json({ success: false, message: 'Failed to issue ticket. Please try again.' });
  }
});

/**
 * Printable ticket: by exact return code, else the newest row with that number.
 * The return code lets staff re-queue a returning patient as priority, so it is
 * only echoed back to a caller who already presented it (the kiosk that just
 * printed the ticket), never to a lookup by number alone.
 */
publicRouter.get('/ticket', async (req, res) => {
  const departmentId = num(req.query.department_id);
  const queueNumber = str(req.query.queue_number);
  const code = trimmed(req.query.code);
  if (!departmentId || queueNumber === '') {
    res.status(400).json({ success: false, message: 'Missing required parameters.' });
    return;
  }
  let row: QueueDoc | null;
  if (code !== '') {
    row = await queue().findOne({ department_id: departmentId, queue_number: queueNumber, return_code: code.toUpperCase() }, { sort: { created_at: -1 } });
  } else {
    const matches = await queue().find({ department_id: departmentId, queue_number: queueNumber }).sort({ created_at: -1 }).limit(20).toArray();
    row = matches.find((m) => m.status !== 'done' && m.status !== 'removed') ?? matches[0] ?? null;
  }
  if (!row) {
    res.status(404).json({ success: false, message: 'Queue record not found.' });
    return;
  }
  const dept = await departments().findOne({ _id: departmentId });
  res.json({
    success: true,
    queue_number: row.queue_number,
    category: row.category,
    department_name: dept?.name?.trim() || `Department ${departmentId}`,
    return_code: code !== '' ? (row.return_code ?? '') : '',
    printed_at: new Date(),
  });
});

const servingToday = (departmentId: number, servedBy?: number) =>
  queue().findOne(
    { department_id: departmentId, status: 'serving', arrival_at: { $gte: manilaDayStart() }, ...(servedBy ? { served_by: servedBy } : {}) },
    { sort: { arrival_at: 1 } },
  );

/**
 * The patient at each window. A window whose staffer signed out mid-serve
 * keeps showing that patient until a colleague takes them over or returns
 * them to the queue, so the wall never shows them as gone while they wait.
 */
async function servingAtWindows(departmentId: number, windows: { section_id: number; occupied_by: number | null }[]): Promise<Map<number, QueueDoc | null>> {
  const lane = await scopeDepartments(departmentId);
  const occupants = windows.map((w) => w.occupied_by).filter((id): id is number => typeof id === 'number');
  const result = new Map<number, QueueDoc | null>();
  for (const w of windows) {
    let row = w.occupied_by ? await servingToday(departmentId, w.occupied_by) : null;
    if (!row) {
      row = await queue().findOne(
        { department_id: { $in: lane }, status: 'serving', section_id: w.section_id, served_by: { $nin: occupants }, arrival_at: { $gte: manilaDayStart() } },
        { sort: { served_at: -1 } },
      );
    }
    result.set(w.section_id, row);
  }
  return result;
}

const waitingToday = (departmentId: number) =>
  queue().find({ department_id: departmentId, status: 'waiting', arrival_at: { $gte: manilaDayStart() } }).sort(SERVE_ORDER).limit(10).toArray();

/** Single-department display board. */
publicRouter.get('/display', async (req, res) => {
  const departmentId = num(req.query.department_id);
  if (departmentId <= 0) {
    res.json({ serving: [], waiting: [], is_admission: false });
    return;
  }
  const dept = await departments().findOne({ _id: departmentId });
  const isAdmission = (dept?.name ?? '').toLowerCase().includes('admission');

  const serving: (Record<string, unknown> & { __id?: number })[] = [];
  if (isAdmission) {
    const windows = await sections().find({ kind: 'admission' }).sort({ section_id: 1 }).toArray();
    const atWindow = await servingAtWindows(departmentId, windows.map((s) => ({ section_id: s.section_id, occupied_by: s.status === 1 ? s.occupied_by : null })));
    for (const s of windows) {
      const q = atWindow.get(s.section_id) ?? null;
      // Open windows, plus a closed one still holding a patient whose staffer signed out.
      if (s.status !== 1 && !q) {
        continue;
      }
      serving.push({ section_id: s.section_id, section_name: s.section_name, queue_number: q?.queue_number ?? '-', served_by: s.status === 1 ? (s.occupied_by ?? 0) : 0, category: q?.category ?? 'regular', __id: q?._id });
    }
  } else {
    const q = await servingToday(departmentId);
    if (q) {
      serving.push({ department_name: dept?.name ?? '', queue_number: q.queue_number, served_by: q.served_by ?? 0, category: q.category ?? 'regular', __id: q._id });
    }
  }
  const waits = await waitingToday(departmentId);
  const returning = await returningIds([...serving.map((s) => s.__id ?? 0), ...waits.map((w) => w._id)].filter((id) => id > 0));

  res.json({
    serving: serving.map(({ __id, ...rest }) => ({ ...rest, is_returning: returning.has(__id ?? 0) })),
    waiting: waits.map((w) => ({ queue_number: w.queue_number, category: w.category ?? 'regular', is_returning: returning.has(w._id) })),
    is_admission: isAdmission,
  });
});

/**
 * Multi-department monitoring wall. Patient-facing, so it shows TODAY's
 * tickets: filtered by issue date, ordered by arrival.
 */
publicRouter.get('/live-serving', async (req, res) => {
  const ids = [...new Set(str(req.query.ids).split(',').map((v) => num(v)).filter((id) => id > 0))].slice(0, 12);
  const dayStart = manilaDayStart();
  const result: Record<string, unknown>[] = [];

  for (const deptId of ids) {
    const dept = await departments().findOne({ _id: deptId });
    if (!dept) {
      continue;
    }
    const kind = sectionKindForDept(dept._id, dept.name);
    const serving: (Record<string, unknown> & { __id?: number })[] = [];
    if (kind) {
      const roster = await sectionRoster(kind);
      const atWindow = await servingAtWindows(deptId, roster.map((s) => ({ section_id: s.id, occupied_by: s.occupied_by })));
      for (const s of roster) {
        const q = atWindow.get(s.id) ?? null;
        serving.push({ section: s.section_name, queue_number: q?.queue_number ?? '-', category: q?.category ?? 'regular', staff: s.staff, __id: q?._id });
      }
    } else {
      const live = await queue().find({ department_id: deptId, status: 'serving', arrival_at: { $gte: dayStart } }).sort({ served_at: -1 }).limit(4).toArray();
      for (const q of live) {
        serving.push({ queue_number: q.queue_number, category: q.category ?? 'regular', __id: q._id });
      }
    }
    const waits = await waitingToday(deptId);
    const returning = await returningIds([...serving.map((s) => s.__id ?? 0), ...waits.map((w) => w._id)].filter((id) => id > 0));

    result.push({
      id: dept._id,
      name: dept.name,
      server: dept.server || null,
      is_admission: dept.name.toLowerCase().includes('admission'),
      is_sectioned: kind !== null,
      serving: serving.map(({ __id, ...rest }) => ({ ...rest, is_returning: returning.has(__id ?? 0) })),
      waiting: waits.map((w) => ({ id: w._id, queue_number: w.queue_number, category: w.category ?? 'regular', is_returning: returning.has(w._id) })),
      waiting_total: await queue().countDocuments({ department_id: deptId, status: 'waiting', arrival_at: { $gte: dayStart } }),
    });
  }

  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  res.json(result);
});

/** What the wall monitor can show: active departments and the window names. */
publicRouter.get('/live-config', async (_req, res) => {
  const depts = sortDepartments((await departments().find().toArray()).filter((d) => !isInactive(d.status)));
  const windows = await sections().find().sort({ section_id: 1 }).toArray();
  res.json({
    departments: depts.map((d) => ({ id: d._id, name: d.name })),
    admission_sections: windows.filter((w) => w.kind === 'admission').map((w) => w.section_name),
    waiting_sections: windows.filter((w) => w.kind === 'waiting').map((w) => w.section_name),
  });
});

export const EXPECTED_VOICE_CLIPS: string[] = [
  'now_serving', 'please_proceed_to', 'queue_number', 'repeating_call', 'sound_test',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `letter_${c}`),
  ...'0123456789'.split('').map((d) => `digit_${d}`),
  ...['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].map((w) => `number_${w}`),
  ...['admission', 'clinic', 'laboratory', 'pharmacy', 'dental', 'nutrition', 'veterinary', 'abtc', 'tb_dots', 'waiting', 'area'].map((w) => `dept_${w}`),
];

/** Offline voice-clip sanity check (signed-in only). */
publicRouter.get('/voice-check', async (req, res) => {
  const userId = req.session.user_id ?? 0;
  if (!userId) {
    res.status(401).json({ ok: false, message: 'Not logged in' });
    return;
  }
  if (!(await assertSingleLogin(req.session, userId, req.session.usertype, clientIp(req)))) {
    res.status(401).json({ ok: false, message: 'Logged in on another device' });
    return;
  }
  const dirs = [path.resolve('client/dist/sound/voice'), path.resolve('client/public/sound/voice')];
  const dir = dirs.find((d) => existsSync(d)) ?? dirs[1];
  const missing = EXPECTED_VOICE_CLIPS.filter((slug) => {
    const file = path.join(dir, `${slug}.mp3`);
    return !existsSync(file) || statSync(file).size <= 500;
  });
  res.json({ ok: missing.length === 0, total: EXPECTED_VOICE_CLIPS.length, present: EXPECTED_VOICE_CLIPS.length - missing.length, missing });
});

/** Dependency-free health probe; a database failure reports 503 without details. */
publicRouter.get('/up', async (_req, res) => {
  try {
    await users().estimatedDocumentCount();
    res.json({ status: 'ok' });
  } catch (error) {
    console.error(error);
    res.status(503).json({ status: 'degraded' });
  }
});
