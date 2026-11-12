import { departments } from './db';

/** Field limits, shared with the client forms through the /users and /department-management payloads. */
export const LIMITS = {
  username: 50,
  personName: 60,
  position: 60,
  departmentName: 60,
  departmentPrefix: 6,
  serverName: 100,
  passwordMin: 5,
  /** bcrypt only reads the first 72 bytes; anything longer would silently match a shorter password. */
  passwordMaxBytes: 72,
} as const;

/** Letters (any script), digits, and . _ @ - ; no spaces, quotes or markup. */
const USERNAME_PATTERN = /^[\p{L}\p{N}._@-]+$/u;

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Trimmed text field: absent means '', a non-string (object, array, number) is rejected. */
export function textField(value: unknown, label: string, max: number, required = false): Result<string> {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return fail(`${label} must be text.`);
  }
  const text = (value ?? '').trim();
  if (required && text === '') {
    return fail(`${label} is required.`);
  }
  if (text.length > max) {
    return fail(`${label} must be ${max} characters or fewer.`);
  }
  return { ok: true, value: text };
}

export function usernameField(value: unknown): Result<string> {
  const result = textField(value, 'Username', LIMITS.username, true);
  if (result.ok && !USERNAME_PATTERN.test(result.value)) {
    return fail('Username may only use letters, numbers and . _ @ - (no spaces).');
  }
  return result;
}

/** Null when the password is acceptable, else the reason. Passwords are never trimmed. */
export function passwordProblem(password: string): string | null {
  if (password.length < LIMITS.passwordMin) {
    return `Password must be at least ${LIMITS.passwordMin} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > LIMITS.passwordMaxBytes) {
    return `Password must be at most ${LIMITS.passwordMaxBytes} bytes (about ${LIMITS.passwordMaxBytes} plain characters).`;
  }
  return null;
}

export interface ProfileInput {
  username: string;
  firstname: string;
  middlename: string;
  lastname: string;
  position: string;
}

/** The name/username/position fields shared by the user form and the Account page. */
export function profileInput(body: Record<string, unknown> | undefined): Result<ProfileInput> {
  const fields = {
    username: usernameField(body?.username),
    firstname: textField(body?.firstname, 'First name', LIMITS.personName, true),
    middlename: textField(body?.middlename, 'Middle name', LIMITS.personName),
    lastname: textField(body?.lastname, 'Last name', LIMITS.personName, true),
    position: textField(body?.position, 'Position', LIMITS.position),
  };
  const value: Partial<ProfileInput> = {};
  for (const [key, result] of Object.entries(fields)) {
    if (!result.ok) {
      return result;
    }
    value[key as keyof ProfileInput] = result.value;
  }
  return { ok: true, value: value as ProfileInput };
}

/** Empty means "no department"; anything else must be the id of an existing department. */
export async function departmentField(value: unknown): Promise<Result<number | null>> {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
    return { ok: true, value: null };
  }
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id < 1 || (await departments().countDocuments({ _id: id }, { limit: 1 })) === 0) {
    return fail('Pick a department from the list.');
  }
  return { ok: true, value: id };
}
