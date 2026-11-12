import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import { config } from './config';

/** 'done' is a finished consultation; 'removed' is a ticket taken off the queue without being seen. */
export type QueueStatus = 'waiting' | 'serving' | 'hold' | 'done' | 'removed';
export type Category = 'regular' | 'priority' | 'emergency';
export type SectionKind = 'admission' | 'waiting';

export interface DepartmentDoc {
  _id: number;
  name: string;
  server: string | null;
  status: string | null;
  prefix: string;
}

export interface UserDoc {
  _id: number;
  username: string;
  /** Lower-cased copy backing the case-insensitive unique index. */
  username_lower: string;
  password: string;
  usertype: string;
  firstname: string;
  lastname: string;
  middlename: string | null;
  position: string | null;
  department_id: number | null;
  status: string;
  login_token: string | null;
  /** Sessions that signed in before this moment are no longer honoured (force-logout, deactivate, role change). */
  sessions_revoked_at?: Date | null;
  last_active: Date | null;
  last_login_at: Date | null;
  last_ip: string | null;
}

/** A physical window. `_id` is `${kind}:${section_id}` because both kinds number from 1. */
export interface SectionDoc {
  _id: string;
  kind: SectionKind;
  section_id: number;
  section_name: string;
  occupied_by: number | null;
  status: 0 | 1;
  updated_at: Date | null;
}

export interface QueueDoc {
  _id: number;
  department_id: number;
  queue_number: string;
  status: QueueStatus;
  category: Category;
  /** 0 emergency, 1 priority, 2 regular: the serve order's first key. */
  category_rank: number;
  created_at: Date;
  /** Arrival at the CURRENT department: transferred_at when moved, else created_at. */
  arrival_at: Date;
  transferred_at: Date | null;
  created_by: number | null;
  served_by: number | null;
  served_at: Date | null;
  /** The window (admission/waiting) the patient was called to, so the wall keeps showing them there if that staffer signs out. */
  section_id?: number | null;
  return_code: string | null;
}

export interface QueueLogDoc {
  _id?: ObjectId;
  queue_id: number;
  queue_number: string;
  department_id: number;
  user_id: number | null;
  action: string;
  old_department_id: number | null;
  old_status: string | null;
  new_status: string | null;
  created_at: Date;
  client_ip: string | null;
  /** Physician or admin whose password approved a bypass serve (row Serve). */
  approved_by?: number | null;
}

export interface SectionLogDoc {
  _id?: ObjectId;
  kind: SectionKind;
  section_id: number;
  section_name: string;
  action: string;
  user_id: number | null;
  operator_id: number | null;
  old_status: number | null;
  new_status: number | null;
  reason: string | null;
  created_at: Date;
  client_ip: string | null;
}

export interface DailyCounterDoc {
  _id: string;
  department_id: number;
  day: string;
  prefix: string;
  last_number: number;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

export interface SecurityEventDoc {
  _id?: ObjectId;
  ip_hash: string;
  event_type: string;
  risk_score: number;
  path: string;
  method: string;
  user_agent_hash: string | null;
  reason: string | null;
  status_code: number | null;
  created_at: Date;
}

export interface BackupJobDoc {
  _id: string;
  action: string;
  file: string | null;
  state: 'running' | 'done' | 'failed';
  message: string;
  user_id: number | null;
  started_at: Date;
  finished_at: Date | null;
}

export interface SessionDoc {
  _id: string;
  data: string;
  expires: Date;
}

let client: MongoClient | null = null;
let database: Db | null = null;

export async function connect(url: string = config.mongoUrl): Promise<Db> {
  if (database) {
    return database;
  }
  client = new MongoClient(url);
  await client.connect();
  database = client.db();
  await ensureIndexes();
  return database;
}

export async function disconnect(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
}

export function db(): Db {
  if (!database) {
    throw new Error('Database is not connected.');
  }
  return database;
}

const col = <T extends { _id?: unknown }>(name: string) => (): Collection<T> => db().collection<T>(name);

export const departments = col<DepartmentDoc>('departments');
export const users = col<UserDoc>('users');
export const sections = col<SectionDoc>('sections');
export const queue = col<QueueDoc>('queue');
export const queueLog = col<QueueLogDoc>('queue_log');
export const sectionLog = col<SectionLogDoc>('section_log');
export const dailyCounters = col<DailyCounterDoc>('daily_counters');
export const counters = col<CounterDoc>('counters');
export const securityEvents = col<SecurityEventDoc>('security_events');
export const backupJobs = col<BackupJobDoc>('backup_jobs');
export const sessions = col<SessionDoc>('sessions');

/** Next integer id for a collection (departments, users, queue keep numeric ids). */
export async function nextId(name: string): Promise<number> {
  const doc = await counters().findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return doc!.seq;
}

/** Raise an id sequence so it never hands out an id that already exists. */
export async function raiseIdFloor(name: string, floor: number): Promise<void> {
  await counters().updateOne({ _id: name }, { $max: { seq: floor } }, { upsert: true });
}

export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

async function ensureIndexes(): Promise<void> {
  await users().createIndex({ username_lower: 1 }, { unique: true });
  await users().createIndex({ department_id: 1 });

  await queue().createIndex({ department_id: 1, status: 1, category_rank: 1, arrival_at: 1 });
  await queue().createIndex({ department_id: 1, created_at: 1 });
  await queue().createIndex({ served_by: 1, status: 1 });
  await queue().createIndex({ return_code: 1 });
  // One operator holds at most one serving row per department. This is the
  // hard guarantee behind every claim; the per-operator lock only keeps the
  // error path rare.
  await queue().createIndex(
    { department_id: 1, served_by: 1 },
    { unique: true, name: 'one_serving_row_per_operator', partialFilterExpression: { status: 'serving', served_by: { $type: 'number' } } },
  );

  await queueLog().createIndex({ queue_id: 1, action: 1 });
  await queueLog().createIndex({ created_at: -1 });
  await queueLog().createIndex({ user_id: 1, created_at: -1 });
  await queueLog().createIndex({ department_id: 1, created_at: -1 });

  await sectionLog().createIndex({ kind: 1, section_id: 1, created_at: -1 });
  await sections().createIndex({ kind: 1, section_id: 1 }, { unique: true });
  await sections().createIndex({ occupied_by: 1 });

  await securityEvents().createIndex({ event_type: 1, created_at: -1 });
  await sessions().createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
}
