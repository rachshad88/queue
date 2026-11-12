import { queueLog } from '../db';

/** Append one row to the queue audit trail. Fail-open: audit must never block patient flow. */
export async function logQueueAction(
  ip: string,
  queueId: number,
  queueNumber: string,
  departmentId: number,
  userId: number,
  action: string,
  oldDepartmentId: number | null,
  oldStatus: string | null,
  newStatus: string | null,
  approvedBy: number | null = null,
): Promise<boolean> {
  try {
    await queueLog().insertOne({
      queue_id: queueId,
      queue_number: queueNumber,
      department_id: departmentId,
      user_id: userId || null,
      action,
      old_department_id: oldDepartmentId,
      old_status: oldStatus,
      new_status: newStatus,
      client_ip: ip || null,
      created_at: new Date(),
      ...(approvedBy ? { approved_by: approvedBy } : {}),
    });
    return true;
  } catch (error) {
    console.error('queue_log insert failed', error);
    return false;
  }
}

/** Queue ids re-queued through the LABORATORY Returning Patient button. */
export async function returningIds(queueIds: number[]): Promise<Set<number>> {
  if (queueIds.length === 0) {
    return new Set();
  }
  const ids = await queueLog().distinct('queue_id', { action: 'prioritized_in', queue_id: { $in: queueIds } });
  return new Set(ids);
}
