import bcrypt from 'bcryptjs';
import { config } from './config';
import { departments, raiseIdFloor, sections, users, type SectionKind } from './db';
import { sectionKey } from './services/stations';

const DEPARTMENTS: [number, string, string][] = [
  [1, 'CLINIC 1', 'C1'],
  [2, 'CLINIC 2', 'C2'],
  [3, 'ADMISSION', 'ADM'],
  [4, 'CLINIC 3', 'C3'],
  [5, 'LABORATORY', 'LAB'],
  [6, 'PHARMACY', 'PHA'],
  [7, 'DENTAL', 'DEN'],
  [8, 'ABTC', 'ABTC'],
  [9, 'NUTRITION', 'NUT'],
  [12, 'CLINIC 4', 'C4'],
  [13, 'TB-DOTS', 'TB'],
  [14, 'VETERINARY', 'VET'],
  [15, 'WAITING AREA', 'WA'],
];

const WINDOWS: [SectionKind, string][] = [
  ['admission', 'Admission'],
  ['waiting', 'Waiting Area'],
];

/**
 * Baseline data the queue rules depend on: the departments (with the ids the
 * rules key on), four windows per sectioned department, and one superadmin.
 * Idempotent: existing documents are left as they are.
 */
export async function seedBaseline(adminPassword: string = config.defaultPassword): Promise<void> {
  for (const [id, name, prefix] of DEPARTMENTS) {
    await departments().updateOne({ _id: id }, { $setOnInsert: { name, prefix, server: null, status: 'active' } }, { upsert: true });
  }
  await raiseIdFloor('departments', Math.max(...DEPARTMENTS.map(([id]) => id)));

  for (const [kind, label] of WINDOWS) {
    for (let n = 1; n <= 4; n++) {
      await sections().updateOne(
        { _id: sectionKey(kind, n) },
        { $setOnInsert: { kind, section_id: n, section_name: `${label} ${n}`, occupied_by: null, status: 0, updated_at: null } },
        { upsert: true },
      );
    }
  }

  if ((await users().countDocuments({ usertype: 'superadmin' }, { limit: 1 })) === 0) {
    await users().updateOne(
      { _id: 1 },
      {
        $setOnInsert: {
          username: 'superadmin',
          username_lower: 'superadmin',
          password: await bcrypt.hash(adminPassword, 12),
          usertype: 'superadmin',
          firstname: 'System',
          lastname: 'Administrator',
          middlename: '',
          position: 'Superadmin',
          department_id: config.admissionDeptId,
          status: 'active',
          login_token: null,
          last_active: null,
          last_login_at: null,
          last_ip: null,
        },
      },
      { upsert: true },
    );
  }
  await raiseIdFloor('users', 1);
}
