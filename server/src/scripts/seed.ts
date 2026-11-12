import { config } from '../config';
import { connect, disconnect, users } from '../db';
import { seedBaseline } from '../seedData';

const password = process.env.SEED_ADMIN_PASSWORD ?? config.defaultPassword;
await connect();
const hadAdmin = (await users().countDocuments({ usertype: 'superadmin' }, { limit: 1 })) > 0;
await seedBaseline(password);
console.log('Departments and windows are in place.');
console.log(
  hadAdmin
    ? 'A superadmin account already exists; it was left unchanged.'
    : `Created superadmin account "superadmin"${process.env.SEED_ADMIN_PASSWORD ? '' : ` with the default password "${password}". Change it after signing in`}.`,
);
await disconnect();
