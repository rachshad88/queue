import { Router } from 'express';
import { config } from '../config';
import { departments, queue, sectionLog, sections, type SectionKind } from '../db';
import { requireSuperadmin } from '../middleware/auth';
import { queueUpdated } from '../realtime';
import { scopeDepartments } from '../services/currentPatient';
import { staffNames, waitingCountsByDepartment } from '../services/lookups';
import { recordSectionEvent } from '../services/sectionLog';
import { deptForKind, isSectionKind, operatorSection, sectionKey, sectionKindForDept, sectionRoster } from '../services/stations';
import { clientIp, isInactive, num, sortDepartments } from '../util';

export const sectionsRouter = Router();

/** Window chooser roster. Exposes staff names, so only that department's staff (or a superadmin) may view it. */
sectionsRouter.get('/sections/:kind', async (req, res) => {
  const kind = req.params.kind;
  if (!isSectionKind(kind)) {
    res.status(404).json({ success: false, message: 'Unknown section type' });
    return;
  }
  if (!req.session.is_superadmin && (req.session.department_id ?? 0) !== deptForKind(kind)) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  res.json({ success: true, kind, user_id: req.session.user_id, sections: await sectionRoster(kind) });
});

/** Claim a window. `override` force-claims an occupied one (own department's staff only). */
sectionsRouter.post('/sections/:kind/assign', async (req, res) => {
  const kind = req.params.kind;
  const userId = req.session.user_id ?? 0;
  const sectionId = num(req.body?.section_id);
  if (!isSectionKind(kind) || userId < 1 || sectionId < 1) {
    res.status(400).json({ success: false, message: 'Invalid request' });
    return;
  }
  const dept = deptForKind(kind);
  const override = !!req.body?.override;
  const ownDepartment = (req.session.department_id ?? 0) === dept;
  // Only that department's staff work its windows (a superadmin may claim one; overriding stays department-only).
  if (!ownDepartment && (override || !req.session.is_superadmin)) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  const ip = clientIp(req);
  const at = new Date();

  // Always clear any window this user already holds.
  for (const row of await sections().find({ kind, occupied_by: userId }).toArray()) {
    await sections().updateOne({ _id: row._id, occupied_by: userId }, { $set: { occupied_by: null, status: 0, updated_at: at } });
    if (row.status === 1) {
      await recordSectionEvent({ kind, sectionId: row.section_id, sectionName: row.section_name, action: 'released', userId, operatorId: userId, oldStatus: 1, newStatus: 0, reason: 'self_move', ip });
    }
  }

  const id = sectionKey(kind, sectionId);
  let claimed = false;
  if (override) {
    // Read the holder first: the trail has to name who was displaced.
    const before = await sections().findOneAndUpdate({ _id: id }, { $set: { occupied_by: userId, status: 1, updated_at: at } }, { returnDocument: 'before' });
    claimed = before !== null;
    if (before?.occupied_by && before.status === 1 && before.occupied_by !== userId) {
      await recordSectionEvent({ kind, sectionId, sectionName: before.section_name, action: 'released', userId: before.occupied_by, operatorId: userId, oldStatus: 1, newStatus: 0, reason: 'overridden', ip });
    }
  } else {
    // Atomic claim: only succeeds while the window is still free.
    const result = await sections().updateOne({ _id: id, occupied_by: null }, { $set: { occupied_by: userId, status: 1, updated_at: at } });
    claimed = result.modifiedCount === 1;
  }

  queueUpdated(dept);
  if (!claimed) {
    res.json({ success: false, message: 'That section was already taken!' });
    return;
  }
  const name = (await sections().findOne({ _id: id }))?.section_name ?? '';
  req.session.served_by = name;
  // A patient already being served follows the staffer to the new window on the wall.
  await queue().updateMany({ served_by: userId, status: 'serving', department_id: { $in: await scopeDepartments(dept) } }, { $set: { section_id: sectionId } });
  await recordSectionEvent({ kind, sectionId, sectionName: name, action: override ? 'override' : 'claimed', userId, operatorId: userId, oldStatus: 0, newStatus: 1, ip });
  res.json({ success: true, section_name: name });
});

/** Kiosk mode: this login only hands out tickets. */
sectionsRouter.post('/for-customer', (req, res) => {
  req.session.view_mode = 'for_customer';
  req.session.for_customer_section = num(req.body?.section_id);
  res.json({ success: true });
});

async function forceRelease(kind: SectionKind, sectionId: number, operatorId: number, ip: string): Promise<{ success: boolean; message: string; section?: string }> {
  const row = await sections().findOne({ _id: sectionKey(kind, sectionId) });
  if (!row) {
    return { success: false, message: 'Section not found' };
  }
  if (!row.occupied_by || row.status !== 1) {
    return { success: false, message: 'Section is already free' };
  }
  const result = await sections().updateOne({ _id: row._id, occupied_by: row.occupied_by }, { $set: { occupied_by: null, status: 0, updated_at: new Date() } });
  if (result.modifiedCount !== 1) {
    return { success: false, message: 'Failed to release section' };
  }
  await recordSectionEvent({ kind, sectionId, sectionName: row.section_name, action: 'force_released', userId: row.occupied_by, operatorId: operatorId || null, oldStatus: 1, newStatus: 0, ip });
  queueUpdated(deptForKind(kind));
  return { success: true, message: `${row.section_name} released`, section: row.section_name };
}

/** Superadmin: free a window someone is holding. */
sectionsRouter.post('/sections-release', requireSuperadmin, async (req, res) => {
  const kind = String(req.body?.type ?? '').trim().toLowerCase();
  const sectionId = num(req.body?.section_id);
  if (!isSectionKind(kind)) {
    res.json({ success: false, message: 'Invalid section type' });
    return;
  }
  if (sectionId < 1) {
    res.json({ success: false, message: 'Section ID is required' });
    return;
  }
  res.json(await forceRelease(kind, sectionId, req.session.user_id ?? 0, clientIp(req)));
});

/** Superadmin: both sets of windows with their occupants. */
sectionsRouter.get('/sections-control', requireSuperadmin, async (_req, res) => {
  res.json({ success: true, admission: await sectionRoster('admission'), waiting: await sectionRoster('waiting') });
});

/** Superadmin: the last 25 events for one window. */
sectionsRouter.get('/sections/:kind/:id/history', requireSuperadmin, async (req, res) => {
  const kind = req.params.kind;
  if (!isSectionKind(kind)) {
    res.status(404).json({ success: false, message: 'Unknown section type' });
    return;
  }
  const rows = await sectionLog().find({ kind, section_id: num(req.params.id) }).sort({ created_at: -1, _id: -1 }).limit(25).toArray();
  const names = await staffNames([...rows.map((r) => r.operator_id), ...rows.map((r) => r.user_id)]);
  res.json({
    success: true,
    history: rows.map((r) => ({
      action: r.action,
      reason: r.reason,
      created_at: r.created_at,
      client_ip: r.client_ip,
      holder_name: r.user_id ? (names[r.user_id] ?? 'Deleted user') : null,
      operator_name: r.operator_id ? (names[r.operator_id] ?? 'Deleted user') : 'System',
    })),
  });
});

/** Superadmin takeover: work another department (and window) from this session. */
sectionsRouter.post('/switch-department', async (req, res) => {
  const s = req.session;
  if (!s.is_superadmin) {
    res.json({ success: false, message: 'Access denied' });
    return;
  }
  const departmentId = num(req.body?.department_id);
  const sectionId = num(req.body?.section_id);
  if (!departmentId) {
    res.json({ success: false, message: 'Department ID is required' });
    return;
  }
  const dept = await departments().findOne({ _id: departmentId });
  if (!dept) {
    res.json({ success: false, message: 'Department not found' });
    return;
  }
  if (isInactive(dept.status)) {
    res.json({ success: false, message: 'Department is inactive' });
    return;
  }

  // The chosen window is session-scoped: the superadmin impersonates the
  // station WITHOUT touching its occupied_by.
  const kind = sectionKindForDept(dept._id, dept.name);
  const section = kind && sectionId ? await sections().findOne({ _id: sectionKey(kind, sectionId) }) : null;
  if (kind && sectionId && !section) {
    res.json({ success: false, message: 'Section not found for this department' });
    return;
  }

  s.department_id = dept._id;
  s.department = dept.name;
  delete s.view_mode;
  if (section && kind) {
    s.takeover_section_id = section.section_id;
    s.takeover_section_name = section.section_name;
    s.takeover_section_kind = kind;
  } else {
    delete s.takeover_section_id;
    delete s.takeover_section_name;
    delete s.takeover_section_kind;
  }

  const window = await operatorSection(s, s.user_id ?? 0, dept._id);
  res.json({
    success: true,
    department_id: dept._id,
    department_name: dept.name,
    server: dept.server ?? '',
    sectioned: kind !== null,
    section_id: section?.section_id ?? null,
    section_name: section?.section_name ?? null,
    sections: kind ? await sectionRoster(kind) : [],
    takeover_section_id: s.takeover_section_id ?? null,
    active_window: window?.section_name ?? null,
  });
});

/** Active departments with waiting counts, for the transfer modal. Exposes staff names, so signed-in only. */
sectionsRouter.get('/departments', async (_req, res) => {
  const rows = sortDepartments((await departments().find().toArray()).filter((d) => !isInactive(d.status)));
  const waiting = await waitingCountsByDepartment();
  res.json(rows.map((d) => ({ id: d._id, name: d.name, server: d.server || null, waiting: waiting[d._id] ?? 0 })));
});

export const sectionDeptIds = (): number[] => [config.admissionDeptId, config.waitingDeptId];
