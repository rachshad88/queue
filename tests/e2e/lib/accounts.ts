export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'E2Epass!2026';

// Fixed accounts upserted by `php artisan e2e:ensure-users` (the Global Setup
// runs it when E2E_ALLOW_LIVE=1). They exist in the live database.
export const accounts = {
  superadmin: { username: 'e2e_superadmin', password: E2E_PASSWORD, type: 'superadmin', dept: null },
  admin: { username: 'e2e_admin', password: E2E_PASSWORD, type: 'admin', dept: 3 },
  clinic: { username: 'e2e_clinic', password: E2E_PASSWORD, type: 'staff', dept: 1 },
  admission: { username: 'e2e_admission', password: E2E_PASSWORD, type: 'staff', dept: 3 },
  waiting: { username: 'e2e_waiting', password: E2E_PASSWORD, type: 'staff', dept: 15 },
  abtc: { username: 'e2e_abtc', password: E2E_PASSWORD, type: 'staff', dept: 8 },
} as const;

export type AccountName = keyof typeof accounts;