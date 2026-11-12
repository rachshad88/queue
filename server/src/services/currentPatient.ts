import { config } from '../config';
import { departments, queue, type DepartmentDoc } from '../db';

/**
 * The operator's "current patient" across a console's merged lane.
 *
 * The waiting-area console also works the dental lane: patients the dental
 * kiosk minted (DR/DP/DE) are callable from there while their row stays in
 * the DENTAL department. The Now Serving tile, the Transfer modal and the
 * transfer refusal all resolve the current patient through here so they agree.
 */
export interface CurrentPatient {
  id: number;
  queue_number: string;
  department_id: number;
  department_name: string | null;
}

/** The active dental department (lowest id), or null when none is configured. */
export async function dentalDepartment(): Promise<DepartmentDoc | null> {
  const rows = await departments().find({ name: /dental/i }).sort({ _id: 1 }).toArray();
  return rows.find((d) => (d.status ?? 'active').toLowerCase() === 'active') ?? null;
}

/** Departments an operator on this console can hold a serving row in. */
export async function scopeDepartments(consoleDeptId: number): Promise<number[]> {
  const scope = [consoleDeptId];
  if (consoleDeptId === config.waitingDeptId) {
    const dental = await dentalDepartment();
    if (dental) {
      scope.push(dental._id);
    }
  }
  return scope;
}

export async function resolveCurrentPatient(consoleDeptId: number, userId: number): Promise<CurrentPatient | null> {
  if (!consoleDeptId || !userId) {
    return null;
  }
  const scope = await scopeDepartments(consoleDeptId);
  const row = await queue().findOne({ department_id: { $in: scope }, served_by: userId, status: 'serving' }, { sort: { created_at: 1 } });
  if (!row) {
    return null;
  }
  const dept = await departments().findOne({ _id: row.department_id }, { projection: { name: 1 } });
  return { id: row._id, queue_number: row.queue_number, department_id: row.department_id, department_name: dept?.name ?? null };
}

export const DENTAL_NUMBER = /^(?:DR|DP|DE)-\d+$/;
/** Numbers the dental lane itself minted, not patients merely transferred into dental. */
export const isDentalIssuedNumber = (queueNumber: string): boolean => DENTAL_NUMBER.test(queueNumber);
/** Plain waiting-area tickets (R/P/E): not dental patients, so DENTAL is not a destination. */
export const isPlainQueueNumber = (queueNumber: string): boolean => /^(?:R|P|E)-\d+$/.test(queueNumber);
