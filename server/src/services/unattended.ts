import { config } from '../config';
import { departments, queue, users, type QueueDoc, type UserDoc } from '../db';
import { minutesAgo } from '../time';
import { fullName } from '../util';
import { resolveCurrentPatient, scopeDepartments } from './currentPatient';
import { isExempt } from './singleLogin';

/**
 * A serving patient is UNATTENDED when the staffer serving them is no longer
 * at a console that can reach them: signed out, idle past the idle window,
 * deactivated or deleted, or moved to another department.
 *
 * Nothing happens to an unattended patient automatically: the staffer gets
 * them back by signing in again, or a colleague decides, by taking them over
 * or returning them to the queue in their original place.
 */
export type UnattendedRow = QueueDoc & { served_by_name: string };

type Operator = Pick<UserDoc, '_id' | 'usertype' | 'status' | 'login_token' | 'last_active' | 'department_id' | 'firstname' | 'lastname' | 'username'>;

async function operatorAway(row: QueueDoc, operator: Operator | undefined, idleCutoff: number): Promise<boolean> {
  if (!operator || operator.status !== 'active') {
    return true;
  }
  if (!operator.last_active || operator.last_active.getTime() < idleCutoff) {
    return true;
  }
  // Admins work across departments on several devices; their presence is the heartbeat alone.
  if (isExempt(operator.usertype)) {
    return false;
  }
  if (!operator.login_token) {
    return true;
  }
  return !(await scopeDepartments(operator.department_id ?? 0)).includes(row.department_id);
}

async function keepUnattended(rows: QueueDoc[]): Promise<UnattendedRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = [...new Set(rows.map((r) => r.served_by).filter((id): id is number => typeof id === 'number'))];
  const operators = ids.length
    ? await users()
        .find({ _id: { $in: ids } }, { projection: { usertype: 1, status: 1, login_token: 1, last_active: 1, department_id: 1, firstname: 1, lastname: 1, username: 1 } })
        .toArray()
    : [];
  const byId = new Map(operators.map((u) => [u._id, u as Operator]));
  const idleCutoff = minutesAgo(config.idleExpiryMin).getTime();

  const result: UnattendedRow[] = [];
  for (const row of rows) {
    const operator = row.served_by ? byId.get(row.served_by) : undefined;
    if (await operatorAway(row, operator, idleCutoff)) {
      result.push({ ...row, served_by_name: operator ? fullName(operator) || operator.username : '' });
    }
  }
  return result;
}

/** Unattended patients in these departments, longest-waiting first. */
export async function unattendedServing(departmentIds: number[]): Promise<UnattendedRow[]> {
  const rows = await queue()
    .find({ department_id: { $in: departmentIds }, status: 'serving' })
    .sort({ served_at: 1, _id: 1 })
    .toArray();
  return keepUnattended(rows);
}

/**
 * A staffer moved to another department (or a superadmin who switched) can
 * still be recorded as serving a patient their console cannot reach. They
 * cannot serve anyone else until a colleague there resolves that patient.
 */
export async function servingElsewhereMessage(userId: number, consoleDeptId: number): Promise<string | null> {
  const row = await queue().findOne({ served_by: userId, status: 'serving', department_id: { $nin: await scopeDepartments(consoleDeptId) } });
  if (!row) {
    return null;
  }
  const dept = await departments().findOne({ _id: row.department_id }, { projection: { name: 1 } });
  return `You are still recorded as serving ${row.queue_number} in ${dept?.name ?? 'another department'}. Ask someone there to take them over or return them to the queue.`;
}

export const finishFirst = (queueNumber: string): string => `Finish or transfer ${queueNumber} before serving another patient.`;

/**
 * One patient at a time: null when this staffer may call someone new, else
 * why not (a patient still being served here, or one left in another department).
 */
export async function finishFirstMessage(userId: number, consoleDeptId: number): Promise<string | null> {
  const current = await resolveCurrentPatient(consoleDeptId, userId);
  return current ? finishFirst(current.queue_number) : servingElsewhereMessage(userId, consoleDeptId);
}

export async function isUnattended(row: QueueDoc): Promise<boolean> {
  return row.status === 'serving' && (await keepUnattended([row])).length === 1;
}
