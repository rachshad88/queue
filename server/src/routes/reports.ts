import { Router } from 'express';
import type { Document, Filter } from 'mongodb';
import { departments, queue, queueLog, type QueueDoc, type QueueLogDoc } from '../db';
import { requireSuperadmin } from '../middleware/auth';
import { staffNames } from '../services/lookups';
import { addDays, manilaDateStart, manilaDayString } from '../time';
import { contains, num, paginate, sortDepartments, str, trimmed } from '../util';

export const reportsRouter = Router();

const departmentOptions = async () => sortDepartments(await departments().find().toArray()).map((d) => ({ id: d._id, name: d.name }));

/** Inclusive Manila-date range as a created_at filter. Defaults to today when neither bound is given. */
function dateRange(fromParam: string, toParam: string): { from: string; to: string; filter: Document } {
  const today = manilaDayString();
  const hasRange = fromParam !== '' || toParam !== '';
  const from = hasRange ? fromParam : today;
  const to = hasRange ? toParam : today;
  const filter: Document = {};
  const start = manilaDateStart(from);
  const end = manilaDateStart(to);
  if (start) {
    filter.$gte = start;
  }
  if (end) {
    filter.$lt = new Date(end.getTime() + 86400000);
  }
  return { from, to, filter };
}

function datePreset(from: string, to: string): 'today' | 'week' | 'month' | null {
  const today = manilaDayString();
  if (from === '' || to !== today) {
    return null;
  }
  if (from === today) {
    return 'today';
  }
  if (from === addDays(today, -6)) {
    return 'week';
  }
  return from === addDays(today, -29) ? 'month' : null;
}

/** Audit trail lookup. Deliberately returns nothing until a filter is chosen. */
reportsRouter.get('/audit-trail', async (req, res) => {
  const selectedDept = str(req.query.department);
  const search = trimmed(req.query.search);
  const hasFilter = selectedDept !== '' || search !== '';
  const rows: Record<string, unknown>[] = [];

  if (hasFilter) {
    const filter: Filter<QueueLogDoc> = {};
    if (selectedDept !== '' && selectedDept !== 'all') {
      filter.department_id = num(selectedDept);
    }
    if (search !== '') {
      filter.queue_number = contains(search);
    }
    const logs = await queueLog().find(filter).sort({ created_at: -1, _id: -1 }).limit(2000).toArray();
    const names = await staffNames([...logs.map((l) => l.user_id), ...logs.map((l) => l.approved_by ?? null)]);
    const deptNames = new Map((await departments().find().toArray()).map((d) => [d._id, d.name]));
    for (const log of logs) {
      rows.push({
        id: String(log._id),
        queue_number: log.queue_number,
        action: log.action,
        created_at: log.created_at,
        department: deptNames.get(log.department_id) ?? '',
        operator: log.user_id ? (names[log.user_id] ?? '') : '',
        approved_by: log.approved_by ? (names[log.approved_by] ?? 'Deleted user') : null,
      });
    }
  }
  res.json({ success: true, departments: await departmentOptions(), has_filter: hasFilter, rows });
});

/** Full queue audit log with filters (superadmin). */
reportsRouter.get('/queue-logs', requireSuperadmin, async (req, res) => {
  const PAGE_SIZE = 25;
  const selectedDept = trimmed(req.query.department);
  const selectedAction = trimmed(req.query.action);
  const selectedUid = trimmed(req.query.uid);
  const search = trimmed(req.query.q);
  const range = dateRange(trimmed(req.query.from), trimmed(req.query.to));

  const filter: Filter<QueueLogDoc> = {};
  if (selectedDept !== '' && selectedDept !== 'all') {
    filter.department_id = num(selectedDept);
  }
  if (selectedAction !== '') {
    filter.action = selectedAction;
  }
  if (selectedUid !== '') {
    filter.user_id = num(selectedUid);
  }
  if (Object.keys(range.filter).length) {
    filter.created_at = range.filter;
  }
  if (search !== '') {
    filter.queue_number = contains(search);
  }

  const paging = paginate(await queueLog().countDocuments(filter), num(req.query.page) || 1, PAGE_SIZE);
  const logs = await queueLog().find(filter).sort({ created_at: -1, _id: -1 }).skip(paging.offset).limit(PAGE_SIZE).toArray();
  const operatorIds = (await queueLog().distinct('user_id')).filter((id): id is number => typeof id === 'number');
  const names = await staffNames([...operatorIds, ...logs.map((l) => l.user_id), ...logs.map((l) => l.approved_by ?? null)]);
  const deptNames = new Map((await departments().find().toArray()).map((d) => [d._id, d.name]));

  res.json({
    success: true,
    departments: await departmentOptions(),
    actions: (await queueLog().distinct('action')).sort(),
    operators: operatorIds.filter((id) => names[id]).map((id) => ({ uid: id, name: names[id] })).sort((a, b) => a.name.localeCompare(b.name)),
    from: range.from,
    to: range.to,
    today: manilaDayString(),
    date_preset: datePreset(range.from, range.to),
    records: logs.map((l) => ({
      id: String(l._id),
      queue_number: l.queue_number,
      action: l.action,
      old_status: l.old_status,
      new_status: l.new_status,
      client_ip: l.client_ip,
      created_at: l.created_at,
      department: deptNames.get(l.department_id) ?? '',
      operator_name: l.user_id ? (names[l.user_id] ?? '') : '',
      approved_by: l.approved_by ? (names[l.approved_by] ?? 'Deleted user') : null,
    })),
    paging,
  });
});

const HISTORY_SORT: Record<string, string> = {
  num: 'queue_number',
  server: 'server_name',
  staff: 'server_name',
  department: 'department',
  category: 'category',
  status: 'status',
  datetime: 'created_at',
  id: '_id',
};

const csvCell = (value: unknown): string => {
  let text = value == null ? '' : String(value);
  // Neutralise spreadsheet formulas in exported cells.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Every ticket that was served, with who served it. Supports sorting, paging and CSV export. */
reportsRouter.get('/server-history', async (req, res) => {
  const PAGE_SIZE = 20;
  const selectedDept = trimmed(req.query.department);
  const selectedSid = trimmed(req.query.sid);
  const search = trimmed(req.query.q);
  const range = dateRange(trimmed(req.query.from), trimmed(req.query.to));
  const sortKey = HISTORY_SORT[trimmed(req.query.sort)] ? trimmed(req.query.sort) : '';
  const sortDir = trimmed(req.query.dir).toLowerCase() === 'desc' ? -1 : 1;

  const match: Filter<QueueDoc> = { served_by: { $ne: null } };
  if (selectedDept !== '' && selectedDept !== 'all') {
    match.department_id = num(selectedDept);
  }
  if (selectedSid !== '') {
    match.served_by = num(selectedSid);
  }
  if (search !== '') {
    match.queue_number = contains(search);
  }
  if (Object.keys(range.filter).length) {
    match.created_at = range.filter;
  }

  const exporting = req.query.export === 'csv';
  const exportScope = str(req.query.scope);
  if (exporting && exportScope === 'selected') {
    const ids = [...new Set(str(req.query.ids).split(',').map((v) => num(v.trim())).filter((v) => v > 0))].slice(0, 200);
    for (const key of Object.keys(match)) {
      delete (match as Document)[key];
    }
    Object.assign(match, { served_by: { $ne: null }, _id: { $in: ids } });
  }

  const total = await queue().countDocuments(match);
  const paging = paginate(total, num(req.query.page) || 1, PAGE_SIZE);
  const sort: Document = sortKey === '' ? { created_at: -1 } : { [HISTORY_SORT[sortKey]]: sortDir, _id: -1 };

  const pipeline: Document[] = [
    { $match: match },
    { $lookup: { from: 'departments', localField: 'department_id', foreignField: '_id', as: 'dept' } },
    { $lookup: { from: 'users', localField: 'served_by', foreignField: '_id', as: 'srv' } },
    {
      $addFields: {
        department: { $ifNull: [{ $first: '$dept.name' }, ''] },
        server_name: { $trim: { input: { $concat: [{ $ifNull: [{ $first: '$srv.firstname' }, ''] }, ' ', { $ifNull: [{ $first: '$srv.lastname' }, ''] }] } } },
      },
    },
    { $sort: sort },
  ];
  if (!exporting || exportScope === 'page') {
    pipeline.push({ $skip: paging.offset }, { $limit: PAGE_SIZE });
  }
  pipeline.push({ $project: { queue_number: 1, status: 1, category: 1, created_at: 1, served_at: 1, department: 1, server_name: 1 } });
  const rows = await queue().aggregate(pipeline).toArray();

  if (exporting) {
    const lines = [['#', 'Queue #', 'Server', 'Department', 'Category', 'Status', 'Date/Time'].join(',')];
    rows.forEach((r, i) => {
      lines.push([i + 1, r.queue_number, r.server_name, r.department, r.category, r.status, (r.created_at as Date).toISOString()].map(csvCell).join(','));
    });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="server_history_${stamp}.csv"` });
    res.send(lines.join('\r\n') + '\r\n');
    return;
  }

  // Servers who appear in the history, narrowed by the department filter only.
  const serverFilter: Filter<QueueDoc> = { served_by: { $ne: null } };
  if (selectedDept !== '' && selectedDept !== 'all') {
    serverFilter.department_id = num(selectedDept);
  }
  const serverIds = (await queue().distinct('served_by', serverFilter)).filter((id): id is number => typeof id === 'number');
  const names = await staffNames(serverIds);
  const latest = await queue().findOne({ served_by: { $ne: null } }, { sort: { created_at: -1 }, projection: { created_at: 1 } });

  res.json({
    success: true,
    departments: await departmentOptions(),
    servers: serverIds.filter((id) => names[id]).map((id) => ({ id, name: names[id] })).sort((a, b) => a.name.localeCompare(b.name)),
    from: range.from,
    to: range.to,
    today: manilaDayString(),
    date_preset: datePreset(range.from, range.to),
    sort: sortKey,
    dir: sortDir === -1 ? 'desc' : 'asc',
    last_updated_at: latest?.created_at ?? null,
    records: rows.map((r) => ({ id: r._id, queue_number: r.queue_number, status: r.status, category: r.category, created_at: r.created_at, department: r.department, server_name: r.server_name })),
    paging,
  });
});
