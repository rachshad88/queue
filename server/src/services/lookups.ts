import { departments, queue, users } from '../db';
import { manilaDayStart } from '../time';
import { fullName } from '../util';

/** Today's waiting patients per department, the same rule as the console headline. */
export async function waitingCountsByDepartment(): Promise<Record<number, number>> {
  const rows = await queue()
    .aggregate<{ _id: number; waiting: number }>([{ $match: { status: 'waiting', arrival_at: { $gte: manilaDayStart() } } }, { $group: { _id: '$department_id', waiting: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.waiting]));
}

export async function departmentNames(ids: number[]): Promise<Record<number, string>> {
  const wanted = [...new Set(ids.filter((id) => id > 0))];
  if (wanted.length === 0) {
    return {};
  }
  const rows = await departments().find({ _id: { $in: wanted } }, { projection: { name: 1 } }).toArray();
  return Object.fromEntries(rows.map((d) => [d._id, d.name]));
}

/** Display names for staff ids: full name, falling back to the username. */
export async function staffNames(ids: (number | null | undefined)[]): Promise<Record<number, string>> {
  const wanted = [...new Set(ids.filter((id): id is number => typeof id === 'number' && id > 0))];
  if (wanted.length === 0) {
    return {};
  }
  const rows = await users().find({ _id: { $in: wanted } }, { projection: { firstname: 1, lastname: 1, username: 1 } }).toArray();
  return Object.fromEntries(rows.map((u) => [u._id, fullName(u) || u.username]));
}

/** Add `issued_by_name` to each row; a public-kiosk ticket has no issuer and gets ''. */
export async function attachIssuerNames<T extends { created_by: number | null }>(rows: T[]): Promise<(T & { issued_by_name: string })[]> {
  const names = await staffNames(rows.map((r) => r.created_by));
  return rows.map((r) => ({ ...r, issued_by_name: (r.created_by && names[r.created_by]) || '' }));
}
