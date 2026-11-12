import { config } from '../config';
import { departments, isDuplicateKey, queue, type QueueDoc } from '../db';
import { queueUpdated, serveUpdate } from '../realtime';
import { manilaDayStart } from '../time';
import { numberForArrival } from './numbers';
import { logQueueAction } from './queueLog';

/**
 * Cross-clinic mutual help: a pooled clinic with an empty waiting list may
 * serve the oldest waiting patient of the other pooled clinics (emergency
 * first, priority second, then first-in-first-out by arrival).
 */
export const SERVE_ORDER = { category_rank: 1, arrival_at: 1, _id: 1 } as const;

export const isPooledDept = (deptId: number): boolean => config.poolClinicIds.includes(deptId);
export const visiblePoolDeptIds = (myDept: number): number[] => config.poolClinicIds.filter((id) => id !== myDept);

export async function poolDepartmentNames(myDept: number): Promise<Map<number, string>> {
  const rows = await departments().find({ _id: { $in: visiblePoolDeptIds(myDept) } }).toArray();
  return new Map(rows.map((d) => [d._id, d.name]));
}

/**
 * Today's queue: tickets that arrived in their current department today
 * (issued, transferred or re-queued). Tickets left from an earlier day are
 * never shown, counted or served.
 */
export const todaysQueue = (): { arrival_at: { $gte: Date } } => ({ arrival_at: { $gte: manilaDayStart() } });

/** Today's waiting rows across the pool, in serve order. */
export async function pooledWaitingRows(myDept: number): Promise<QueueDoc[]> {
  const ids = visiblePoolDeptIds(myDept);
  if (ids.length === 0) {
    return [];
  }
  return queue()
    .find({ department_id: { $in: ids }, status: 'waiting', ...todaysQueue() })
    .sort(SERVE_ORDER)
    .toArray();
}

export const ownWaitingCount = (myDept: number): Promise<number> => queue().countDocuments({ department_id: myDept, status: 'waiting', ...todaysQueue() });

/**
 * Atomically move a waiting ticket from another pooled clinic into ours and
 * mark it serving. The conditional update makes double-claims impossible, and
 * the unique serving index refuses it if this operator is already serving.
 */
export async function claimAndServe(
  myDept: number,
  otherDept: number,
  queueId: number,
  userId: number,
  label: string | null,
  ip: string,
): Promise<{ queue_number: string; original_number: string; department_id: number } | null> {
  if (!isPooledDept(myDept) || !isPooledDept(otherDept) || otherDept === myDept) {
    return null;
  }
  const picked = await queue().findOne({ _id: queueId, department_id: otherDept, status: 'waiting', ...todaysQueue() }, { projection: { queue_number: 1 } });
  if (!picked) {
    return null;
  }
  const arrivalNumber = await numberForArrival(myDept, picked.queue_number, queueId);
  const at = new Date();
  let row: QueueDoc | null;
  try {
    row = await queue().findOneAndUpdate(
      { _id: queueId, department_id: otherDept, status: 'waiting', queue_number: picked.queue_number },
      { $set: { department_id: myDept, queue_number: arrivalNumber, status: 'serving', served_by: userId, served_at: at, section_id: null, transferred_at: at, arrival_at: at } },
      { returnDocument: 'after' },
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      return null;
    }
    throw error;
  }
  if (!row) {
    return null;
  }

  await logQueueAction(ip, row._id, picked.queue_number, otherDept, userId, 'pool_taken', myDept, 'waiting', 'waiting');
  await logQueueAction(ip, row._id, row.queue_number, myDept, userId, 'serving', otherDept, 'waiting', 'serving');
  queueUpdated(otherDept);
  serveUpdate(myDept, userId, null, row.queue_number, label);

  return { queue_number: row.queue_number, original_number: picked.queue_number, department_id: myDept };
}
