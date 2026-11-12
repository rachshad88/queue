import { randomInt } from 'node:crypto';
import { dailyCounters, departments, isDuplicateKey, nextId, queue, type Category, type QueueDoc } from '../db';
import { manilaDayStart, manilaDayString } from '../time';

export const ACTIVE_STATUSES = ['waiting', 'hold', 'serving'] as const;
export const categoryRank = (category: string): number => (category === 'emergency' ? 0 : category === 'priority' ? 1 : 2);
const format = (prefix: string, seq: number): string => `${prefix}-${String(seq).padStart(3, '0')}`;

/** ABTC departments use AR/AP/AE, Dental DR/DP/DE, all others R/P/E. */
export function prefixesForName(name: string): [string, string, string] {
  const lower = name.toLowerCase();
  if (lower.includes('abtc')) {
    return ['AR', 'AP', 'AE'];
  }
  if (lower.includes('dental')) {
    return ['DR', 'DP', 'DE'];
  }
  return ['R', 'P', 'E'];
}

export async function queuePrefixes(departmentId: number): Promise<[string, string, string]> {
  const dept = await departments().findOne({ _id: departmentId }, { projection: { name: 1 } });
  return prefixesForName(dept?.name ?? '');
}

/** Is this number still in the hands of a patient ticketed today? */
export async function heldByActiveRow(departmentId: number, queueNumber: string): Promise<boolean> {
  return (
    (await queue().countDocuments(
      { department_id: departmentId, queue_number: queueNumber, status: { $in: [...ACTIVE_STATUSES] }, created_at: { $gte: manilaDayStart() } },
      { limit: 1 },
    )) > 0
  );
}

/** Has this department already printed this number today? */
export async function issuedToday(departmentId: number, queueNumber: string): Promise<boolean> {
  return (
    (await queue().countDocuments(
      { department_id: departmentId, queue_number: queueNumber, created_at: { $gte: manilaDayStart() } },
      { limit: 1 },
    )) > 0
  );
}

/**
 * Atomically take the next sequence value for a department's Manila day and
 * prefix, so numbering restarts at 001 each morning. `$inc` makes concurrent
 * takes unique; a number another patient still holds is stepped over.
 */
export async function nextDailySequence(departmentId: number, prefix = 'R'): Promise<number> {
  const day = manilaDayString();
  const id = `${departmentId}:${day}:${prefix}`;

  for (let attempt = 0; attempt < 9999; attempt++) {
    let seq: number;
    try {
      const doc = await dailyCounters().findOneAndUpdate(
        { _id: id },
        { $inc: { last_number: 1 }, $setOnInsert: { department_id: departmentId, day, prefix } },
        { upsert: true, returnDocument: 'after' },
      );
      seq = doc!.last_number;
    } catch (error) {
      // Two first-of-the-day takes can race the upsert; the loser retries.
      if (isDuplicateKey(error)) {
        continue;
      }
      throw error;
    }
    if (seq >= 9999 || !(await heldByActiveRow(departmentId, format(prefix, seq)))) {
      return seq;
    }
  }
  throw new Error('No ticket numbers available.');
}

/** Unique 4-character return code printed on the ticket for return visits. */
export async function generateReturnCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[randomInt(chars.length)];
    }
    if ((await queue().countDocuments({ return_code: code }, { limit: 1 })) === 0) {
      return code;
    }
  }
  throw new Error('Could not generate unique return code.');
}

/**
 * Random PREFIX-### for laboratory returnees: never one issued today or one a
 * patient is still holding. Falls back to a sequential scan, then fails loudly.
 */
export async function randomTicketNumber(departmentId: number, prefix: string): Promise<string> {
  const isFree = async (candidate: string): Promise<boolean> =>
    !(await issuedToday(departmentId, candidate)) && !(await heldByActiveRow(departmentId, candidate));

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = format(prefix, randomInt(1, 1000));
    if (await isFree(candidate)) {
      return candidate;
    }
  }
  for (let seq = 1; seq <= 999; seq++) {
    const candidate = format(prefix, seq);
    if (await isFree(candidate)) {
      return candidate;
    }
  }
  throw new Error('No ticket numbers available.');
}

/**
 * The number a patient carries into a department. Kept as printed unless
 * another live patient there already holds it (a ticket carried over from an
 * earlier day), in which case a fresh number with the same prefix is drawn so
 * one announcement never calls two people.
 */
export async function numberForArrival(departmentId: number, queueNumber: string, queueId: number): Promise<string> {
  const heldThere = async (candidate: string): Promise<boolean> =>
    (await queue().countDocuments({ department_id: departmentId, queue_number: candidate, status: { $in: [...ACTIVE_STATUSES] }, _id: { $ne: queueId } }, { limit: 1 })) > 0;
  if (!(await heldThere(queueNumber))) {
    return queueNumber;
  }
  const prefix = /^([A-Z]+)-\d+$/.exec(queueNumber)?.[1] ?? 'R';
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = await randomTicketNumber(departmentId, prefix);
    if (!(await heldThere(candidate))) {
      return candidate;
    }
  }
  throw new Error('No ticket numbers available.');
}

/**
 * Next visible ticket number + return code. `prefixKeyword` picks the number
 * family when it differs from the filing department's name (dental tickets
 * filed in the Waiting Area pass 'dental').
 */
export async function issueTicketNumbers(departmentId: number, category: Category, prefixKeyword: string | null = null): Promise<[string, string]> {
  const [regular, priority, emergency] = prefixKeyword !== null ? prefixesForName(prefixKeyword) : await queuePrefixes(departmentId);
  const prefix = category === 'priority' ? priority : category === 'emergency' ? emergency : regular;
  const seq = await nextDailySequence(departmentId, prefix);
  return [format(prefix, seq), await generateReturnCode()];
}

/** Ticket tier from the prefix's last letter: 'e', 'p' or 'r'. */
export function tierForNumber(queueNumber: string): 'e' | 'p' | 'r' {
  const match = /^([A-Z]+)-\d+$/.exec(queueNumber);
  const letter = match ? match[1].slice(-1).toLowerCase() : 'r';
  return letter === 'e' || letter === 'p' ? letter : 'r';
}

/** Mint a waiting ticket: the one place a queue row is created. */
export async function createTicket(input: {
  departmentId: number;
  category: Category;
  prefixKeyword?: string | null;
  createdBy?: number | null;
}): Promise<QueueDoc> {
  const [number, code] = await issueTicketNumbers(input.departmentId, input.category, input.prefixKeyword ?? null);
  const createdAt = new Date();
  const doc: QueueDoc = {
    _id: await nextId('queue'),
    department_id: input.departmentId,
    queue_number: number,
    status: 'waiting',
    category: input.category,
    category_rank: categoryRank(input.category),
    created_at: createdAt,
    arrival_at: createdAt,
    transferred_at: null,
    created_by: input.createdBy ?? null,
    served_by: null,
    served_at: null,
    return_code: code,
  };
  await queue().insertOne(doc);
  return doc;
}
